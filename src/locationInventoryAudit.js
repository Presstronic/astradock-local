const { parseRuntimeLogText } = require('./runtimeLogParserEngine');
const { collectOverlayInventoryContext, MAX_CONTEXTS } = require('./overlayInventoryContext');
const { parseAbsoluteInstant, parseGameLogTimestamp } = require('./time');
const { resultKind } = require('./overlayMessages');
const { MAX_RECORD_BYTES } = require('./runtimeEvidenceCache');
const { observedReleaseChannels } = require('./gameEnvironments');

const MAX_AUDIT_BYTES = 8 * 1024 * 1024;
const OPERATIONS = new Set(['QueryInventory', 'Move', 'Drop', 'Interaction', 'Store', 'Split', 'StackAll']);
const MARKERS = new Set(['Add Inventory Management Move', 'Inventory Mgmt Request Handle', 'Inventory Mgmt Request Queued',
  'Inventory Mgmt Request Process', 'Player Inventory Request Complete', 'Inventory Request Completed',
  'Inventory Drop From Container', 'UnstowPendingEntities', 'Inventory Token Flow', 'Query Inventory',
  'Request Personal Inventory Data', 'Inventory Terminate Location Container', 'Update Container Items Add New Item',
  'OnDragInventoryItemModifyTarget', 'AttachmentReceived', 'Update Inventory Location', 'RequestLocationInventory',
  'Inventory Quick Equip Request', 'EquipItem', 'Update Inventory', 'OnInventoryStoreItem', 'StoreItem', 'InventoryManagement',
  'Show Location Inventory', 'Update Inventory Sections', 'Revert Moves', 'Expire Local Attachment',
  'Evaluate Inventory State On Failed Move', 'Close Inventory Grid', 'Remove Inventory Container UI', 'Request Terminate Access To Inventory']);

function field(line, name) { return line.match(new RegExp(`\\b${name}\\[([^\\]]*)\\]`))?.[1] || null; }
function increment(counts, key) { counts[key] = (counts[key] || 0) + 1; }
function hasLocationArgument(line) {
  return [...line.matchAll(/\b(?:SourceInventory|TargetInventory)\[([^\]]*)\]/g)]
    .some(match => /^[A-Za-z0-9_-]{1,128}:Location:[A-Za-z0-9_-]{1,128}$/.test(match[1]));
}

function inspectResult(event, context) {
  const outcome = resultKind(event.payload.result);
  const movement = context?.movement || null;
  const quantity = context?.quantity ?? null;
  let status = outcome === 'failure' ? 'reported_failure' : outcome !== 'success' ? 'outcome_unknown'
    : !context ? 'item_or_request_context_unresolved' : !movement ? 'route_unresolved'
      : quantity === null ? 'quantity_unknown' : 'no_location_change_identified';
  const effects = [];
  // Only fully resolved reviewed routes can describe a location-side effect. These
  // are diagnostic candidates, never applied balances, proof of ownership or named places.
  if (outcome === 'success' && movement && quantity !== null && movement.from !== 'unknown' && movement.to !== 'unknown') {
    if (movement.from === 'location_inventory') effects.push({ endpoint: 'source', quantityDelta: -quantity });
    if (movement.to === 'location_inventory') effects.push({ endpoint: 'destination', quantityDelta: quantity });
    if (effects.length) status = 'location_change_reported';
  } else if (status === 'no_location_change_identified') status = 'route_unresolved';
  return { timestamp: event.sourceTimestamp, sourceByteOffset: event.evidenceReference?.sourceByteOffset ?? null,
    operation: context?.operation || (OPERATIONS.has(event.payload.operation) ? event.payload.operation : 'other'),
    outcome, itemClass: context?.itemClass || null, requestedSourceQuantity: quantity,
    route: movement, status, candidateLocationEffects: effects, namedLocation: null };
}

/** Local diagnostic report only: no raw lines, identities, source paths, balances or network work. */
function auditLocationInventoryCapture({ text, releaseChannel, gameBuild, branch, since, sourceByteOffset = 0, truncated = false }) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_AUDIT_BYTES) throw new RangeError('Inventory audit exceeds its bounded capture window.');
  const cutoff = parseAbsoluteInstant(since);
  if (!cutoff.ok) throw new TypeError('Inventory audit requires an absolute capture start time.');
  if (observedReleaseChannels(text).some(channel => channel !== releaseChannel)) throw new Error('Inventory audit environment evidence conflicts.');
  const trailingPartialRecord = text.length > 0 && !text.endsWith('\n');
  const completeText = trailingPartialRecord ? text.slice(0, text.lastIndexOf('\n') + 1) : text;
  const markers = Object.create(null), requestsByOperation = Object.create(null), locationRequestsByOperation = Object.create(null);
  let bulkItemRequests = 0, unknownInventoryMarkers = 0, invalidInventoryRecords = 0, oversizedRecords = 0;
  let primaryResultRecords = 0, secondaryResultRecords = 0, zeroSourceQueueQuantities = 0, firstTimestamp = null, lastTimestamp = null;
  for (const line of completeText.split('\n')) {
    if (Buffer.byteLength(line, 'utf8') > MAX_RECORD_BYTES) { oversizedRecords++; continue; }
    const match = line.match(/^<[^>]+>\s+\[(?:Notice|Warning|Error)\]\s+<([^>]+)>/);
    if (!match) continue;
    const known = MARKERS.has(match[1]);
    if (!known && !/\[Team_CoreGameplayFeatures\]\[Inventory\]\s*$/.test(line)) continue;
    const timestamp = parseGameLogTimestamp(line);
    if (!timestamp.ok || line.includes('\ufffd')) { invalidInventoryRecords++; continue; }
    if (timestamp.epochMs < cutoff.epochMs) continue;
    if (firstTimestamp === null) firstTimestamp = timestamp.instant;
    lastTimestamp = timestamp.instant;
    if (!known) { unknownInventoryMarkers++; continue; }
    increment(markers, match[1]);
    if (match[1] === 'Add Inventory Management Move') {
      const value = field(line, 'Type');
      const operation = OPERATIONS.has(value) ? value : 'other';
      increment(requestsByOperation, operation);
      if (hasLocationArgument(line)) increment(locationRequestsByOperation, operation);
      if (line.includes('ItemClass[[')) bulkItemRequests++;
    }
    if (match[1] === 'Inventory Mgmt Request Queued' && field(line, 'Type') !== 'QueryInventory' && field(line, 'amount') === '0') zeroSourceQueueQuantities++;
    if (match[1] === 'Player Inventory Request Complete' && field(line, 'Type') !== 'QueryInventory') primaryResultRecords++;
    if (match[1] === 'Inventory Request Completed') secondaryResultRecords++;
  }
  const parsed = parseRuntimeLogText(completeText, { releaseChannel, gameBuild, branch,
    sourceLocation: 'local-inventory-audit', evidenceCoordinates: 'byte', framer: { sourceByteOffset } });
  const completions = parsed.events.filter(event => event.eventType === 'RuntimeLogSignalObserved'
    && event.payload.signalId === 'INV-04' && event.payload.operation !== 'QueryInventory'
    && event.evidenceReference?.evidenceMarkers?.includes('Player Inventory Request Complete')
    && Date.parse(event.sourceTimestamp) >= cutoff.epochMs);
  const { contexts, evidenceEvents } = collectOverlayInventoryContext(completeText, parsed.events, sourceByteOffset);
  const contextTimes = new Map(evidenceEvents.map(event => [event.eventId, Date.parse(event.sourceTimestamp)]));
  const results = completions.slice(-MAX_CONTEXTS).map(event => {
    const context = contexts.get(event.eventId);
    return inspectResult(event, context?.evidenceKeys.every(key => contextTimes.get(key) >= cutoff.epochMs) ? context : null);
  });
  const resultsByStatus = Object.create(null);
  for (const result of results) increment(resultsByStatus, result.status);
  return { reportVersion: 'location-inventory-audit/v1',
    scope: { channel: ['LIVE', 'PTU', 'EPTU', 'HOTFIX', 'TECH-PREVIEW'].includes(releaseChannel) ? releaseChannel : 'unknown',
      build: /^[0-9A-Za-z_.-]{1,64}$/.test(gameBuild || '') ? gameBuild : 'unknown', parserStatus: parsed.parserHealth.status },
    capture: { since: cutoff.instant, firstTimestamp, lastTimestamp, truncated: Boolean(truncated), trailingPartialRecord,
      oversizedRecords, invalidInventoryRecords, omittedParsedResults: Math.max(0, completions.length - MAX_CONTEXTS) },
    observations: { markers, requestsByOperation, locationRequestsByOperation, bulkItemRequests, zeroSourceQueueQuantities,
      unknownInventoryMarkers, primaryResultRecords, secondaryResultRecords,
      parsedPrimaryResults: completions.length, unparsedPrimaryResultRecords: Math.max(0, primaryResultRecords - completions.length), resultsByStatus },
    results,
    limitations: ['Diagnostic candidates only; no inventory balance is created or changed.',
      'Counts describe log records, not unique physical actions or capture recall.',
      'Locations are container kinds, not identified stations. Private identities and raw text are omitted.',
      'Unsupported operations/builds, partial capture and missing context remain unresolved.',
      'No Station API, proposal, synchronization or ownership inference is enabled.'] };
}

module.exports = { auditLocationInventoryCapture, MAX_AUDIT_BYTES };
