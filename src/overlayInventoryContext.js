const crypto = require('node:crypto');
const { parseGameLogTimestamp } = require('./time');
const { MAX_RECORD_BYTES } = require('./runtimeEvidenceCache');
const { inventoryRoute } = require('./overlayInventoryRoute');

const INVENTORY_CONTEXT_WINDOW_MS = 10_000;
const MAX_PENDING_REQUESTS = 160;
const MAX_CONTEXTS = 160;
const REVIEWED_BUILDS = new Map([
  ['LIVE', { build: '4.10.197.2878', profile: 'sc-4.10-live', operations: ['Move', 'Drop', 'Interaction'] }],
  ['PTU', { build: '4.10.199.13454', profile: 'sc-4.10-ptu', operations: ['Store', 'Interaction'] }]
]);

function field(line, name) {
  return line.match(new RegExp(`\\b${name}\\[([^\\]]*)\\]`))?.[1] || null;
}

function actor(line) {
  return field(line, 'Player') || line.match(/\bfor '([^']+)'\s*\[/)?.[1] || null;
}

function itemClass(value) {
  return value && !['NULL', 'NONE', 'Default', 'INVALID'].includes(value)
    && /^[A-Za-z][A-Za-z0-9_ -]{0,127}$/.test(value) && !/\d{8,}/.test(value) ? value : null;
}

function primaryCompletion(event) {
  const policy = REVIEWED_BUILDS.get(event.gameChannel);
  return policy && event.gameBuild === policy.build && event.sourceProfileId === policy.profile
    && event.eventType === 'RuntimeLogSignalObserved' && event.payload.signalId === 'INV-04'
    && event.payload.operation !== 'QueryInventory'
    && event.evidenceReference?.evidenceMarkers?.includes('Player Inventory Request Complete');
}

function scopeKey(event) {
  return `${event.environmentKey}:${event.sourceLocation}:${event.ordering?.sourceGeneration ?? 0}`;
}

function boundary(line) {
  return /<Init>|<Join PU>|<SystemQuit>|<Channel Disconnected>|RequestFrontEndReason|<Channel Created>.*\bfrontend\b|<Game Version>|\bFileVersion:/.test(line);
}

function equivalentOperation(requested, reported, channel = null) {
  return requested === reported || ((channel === null || channel === 'LIVE')
    && ['Move', 'Drop'].includes(requested) && reported === 'Interaction');
}

/** Bounded presentation context only. No raw log text or player IDs leave this function. */
function collectOverlayInventoryContext(text, events, sourceByteOffset = 0) {
  const targets = events.filter(primaryCompletion).slice(-MAX_CONTEXTS);
  if (!targets.length) return { contexts: new Map(), evidenceEvents: [] };
  const byOffset = new Map();
  const byLine = new Map();
  for (const event of targets) {
    const offset = event.evidenceReference?.sourceByteOffset ?? event.ordering?.sourceByteOffset;
    if (Number.isSafeInteger(offset)) byOffset.set(offset, event);
    else if (event.evidenceReference?.lineRange) byLine.set(event.evidenceReference.lineRange.start, event);
  }
  const pending = new Map();
  const contexts = new Map();
  const evidenceEvents = [];
  const bytes = Buffer.from(text, 'utf8');
  let position = 0;
  let lineNumber = 0;
  let previousTime = null;
  let previousScope = null;
  const descriptor = (record, event) => ({
    eventId: `inventory_context_${crypto.createHash('sha256').update(`${scopeKey(event)}:${record.offset}`).digest('hex').slice(0, 24)}`,
    sourceTimestamp: record.timestamp,
    evidenceReference: { sourceByteOffset: record.offset }
  });
  while (position < bytes.length) {
    const start = position;
    const newline = bytes.indexOf(10, start);
    position = newline < 0 ? bytes.length : newline + 1;
    lineNumber += 1;
    if (position - start > MAX_RECORD_BYTES) { pending.clear(); continue; }
    const line = bytes.subarray(start, position).toString('utf8').replace(/\r?\n$/, '');
    if (boundary(line)) pending.clear();
    const time = parseGameLogTimestamp(line);
    if (!time.ok || line.includes('\ufffd')) {
      if (line.trim()) pending.clear(); // Unknown or partial records cannot bridge request identity safely.
      continue;
    }
    const now = Date.parse(time.instant);
    if (previousTime !== null && now < previousTime) pending.clear();
    previousTime = now;
    for (const [key, request] of pending) {
      if (now - request.time > INVENTORY_CONTEXT_WINDOW_MS) pending.delete(key);
      else break;
    }
    const match = line.match(/^<[^>]+>\s+\[Notice\]\s+<(Add Inventory Management Move|Inventory Mgmt Request Queued|Player Inventory Request Complete)>\s+/);
    if (!match) continue;
    const requestId = field(line, 'Request');
    const player = actor(line);
    if (!requestId || !/^\d{1,24}$/.test(requestId)) continue;
    if (!player || player.length > 128) {
      for (const request of pending.values()) if (request.requestId === requestId) request.ambiguous = true;
      continue;
    }
    const key = `${player}:${requestId}`;
    const record = { offset: sourceByteOffset + start, timestamp: time.instant };
    const operation = field(line, 'Type');
    if (match[1] === 'Add Inventory Management Move') {
      const existing = pending.get(key);
      if (existing) existing.ambiguous = true;
      else pending.set(key, { requestId, time: now, operation, itemClass: itemClass(field(line, 'ItemClass')),
        sourceInventory: field(line, 'SourceInventory'), targetInventory: field(line, 'TargetInventory'), caller: field(line, 'Caller'),
        quantity: null, record, queue: null, quantityRecord: null, ambiguous: false, routeAmbiguous: false });
      if (pending.size > MAX_PENDING_REQUESTS) pending.delete(pending.keys().next().value);
      continue;
    }
    const request = pending.get(key);
    if (match[1] === 'Inventory Mgmt Request Queued') {
      if (!request) continue;
      if (!equivalentOperation(request.operation, operation)) request.ambiguous = true;
      const queue = { sourceInventory: field(line, 'Source Inventory'), targetInventory: field(line, 'Target Inventory'),
        action: field(line, 'action'), itemClass: itemClass(field(line, 'Source')), amount: field(line, 'amount') };
      if (request.queue && JSON.stringify(request.queue) !== JSON.stringify(queue)) request.routeAmbiguous = true;
      request.queue = queue;
      request.queueRecord = record;
      const queuedClass = itemClass(field(line, 'Source'));
      if (queuedClass && queuedClass !== request.itemClass) request.ambiguous = true;
      const amount = field(line, 'amount');
      const quantity = amount && /^\d+$/.test(amount) ? Number(amount) : null;
      if (queuedClass === request.itemClass && quantity > 0 && Number.isSafeInteger(quantity)) {
        if (request.quantity !== null && request.quantity !== quantity) request.ambiguous = true;
        request.quantity = quantity;
        request.quantityRecord = record;
      }
      continue;
    }
    const event = byOffset.get(record.offset) || byLine.get(lineNumber);
    pending.delete(key);
    if (!event) continue;
    const scope = scopeKey(event);
    if (previousScope !== null && scope !== previousScope) { pending.clear(); previousScope = scope; continue; }
    previousScope = scope;
    const policy = REVIEWED_BUILDS.get(event.gameChannel);
    if (!request || request.ambiguous || !request.itemClass || !policy.operations.includes(request.operation)
      || !equivalentOperation(request.operation, operation, event.gameChannel) || event.payload.requestId !== requestId || event.payload.operation !== operation
      || event.sourceTimestamp !== time.instant || request.record.offset >= record.offset
      || now - request.time < 0 || now - request.time > INVENTORY_CONTEXT_WINDOW_MS) continue;
    const movement = inventoryRoute(request);
    const queueRecord = movement ? request.queueRecord : request.quantityRecord;
    const evidence = [descriptor(request.record, event), ...(queueRecord ? [descriptor(queueRecord, event)] : [])];
    contexts.set(event.eventId, { itemClass: request.itemClass, quantity: request.quantity, operation: request.operation,
      movement, evidenceKeys: evidence.map(record => record.eventId), ruleVersion: 'inventory-presentation/v2' });
    evidenceEvents.push(...evidence);
  }
  return { contexts, evidenceEvents };
}

module.exports = { collectOverlayInventoryContext, INVENTORY_CONTEXT_WINDOW_MS, MAX_CONTEXTS, MAX_PENDING_REQUESTS };
