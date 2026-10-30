const { compareRuntimeEventOrder } = require('./contracts/runtimeEvents');
const { presentOverlayEvents } = require('./overlayPurchasePresentation');
const { normalizeOverlayFilters, classifyOverlayRow, matchesOverlayFilters } = require('./overlayFilters');

// Deliberately curated gameplay stages. Parser diagnostics remain available in
// the main monitor, but cannot enter the overlay through a broad Kind filter.
const GAMEPLAY_SIGNALS = new Set(['INV-04', 'INV-05', 'INV-06', 'INV-07', 'INV-09',
  'INV-13', 'INV-14', 'INV-15', 'SHP-01', 'SHP-02']);
const GAMEPLAY_EVENTS = new Set(['ShopPurchaseRequested', 'PartyCreated', 'PartyLaunchInitiated',
  'PartyMemberConnected', 'PartyMemberJoined', 'PartyLeft', 'MissionAccepted',
  'VehicleRetrieved', 'VehicleControlAcquired', 'VehicleControlReleased', 'VehicleStored',
  'QuantumTargetSelected', 'QuantumTargetChanged', 'QuantumTravelArrived',
  'JurisdictionEntered', 'MonitoredSpaceEntered', 'MonitoredSpaceExited', 'ArmisticeStateChanged']);

function isGameplayEvent(event) {
  if (event.eventType !== 'RuntimeLogSignalObserved') return GAMEPLAY_EVENTS.has(event.eventType);
  const { signalId } = event.payload;
  if (!GAMEPLAY_SIGNALS.has(signalId)) return false;
  const markers = event.evidenceReference?.evidenceMarkers || [];
  if (signalId === 'INV-04') return markers.includes('Player Inventory Request Complete')
    && event.payload.operation !== 'QueryInventory';
  if (signalId === 'INV-09') return markers.includes('Close Inventory Grid');
  return true;
}

function createOverlayEventFeed({ events = [], since, environmentKey, environment = 'Unknown environment', monitoring = false,
  displayMode = 'friendly', evidence = new Map(), filters: requestedFilters }) {
  const boundary = Date.parse(since);
  if (!Number.isFinite(boundary)) throw new TypeError('Overlay capture boundary must be an absolute timestamp.');
  const eligible = events.filter(event => event.environmentKey === environmentKey
    && Number.isFinite(Date.parse(event.sourceTimestamp)) && Date.parse(event.sourceTimestamp) >= boundary
    && isGameplayEvent(event)).sort(compareRuntimeEventOrder);
  const seen = new Set();
  const unique = eligible.filter(event => {
    if (seen.has(event.eventId)) return false;
    seen.add(event.eventId);
    return true;
  });
  const filters = normalizeOverlayFilters(requestedFilters);
  const candidates = presentOverlayEvents(unique.slice(-160)).map(row => ({ ...row, classification: classifyOverlayRow(row) }))
    .sort((left, right) => compareRuntimeEventOrder(right.event, left.event));
  const matching = candidates.filter(row => matchesOverlayFilters(row.classification, filters));
  const rows = matching.slice(0, 80);
  let rawBytes = 0;
  return {
    state: monitoring ? 'monitoring' : 'waiting', environment, displayMode, filters,
    availableCount: candidates.length, matchingCount: matching.length,
    events: rows.map(row => {
      const event = row.event;
      const captured = event.eventType === 'RuntimeLogSignalObserved';
      let rawEvidence;
      if (displayMode === 'raw') {
        const messages = [];
        for (const source of row.sourceEvents) {
          const message = evidence.get(source.eventId);
          const size = typeof message === 'string' ? Buffer.byteLength(message, 'utf8') : 0;
          if (!size || size > 64 * 1024 || rawBytes + size > 256 * 1024) continue;
          messages.push(message);
          rawBytes += size;
        }
        rawEvidence = { status: messages.length === row.sourceEvents.length ? 'available' : messages.length ? 'partial' : 'unavailable', messages };
      }
      return { id: row.id, kind: captured ? 'action' : 'runtime', summary: row.summary.slice(0, 500), classification: row.classification,
        timestamp: event.sourceTimestamp, confidence: event.confidence, provenance: row.provenance,
        evidenceEventIds: row.sourceEvents.map(source => source.eventId),
        ...(row.evidenceNote ? { evidenceNote: row.evidenceNote } : {}),
        ...(rawEvidence ? { rawEvidence } : {}) };
    })
  };
}

module.exports = { createOverlayEventFeed, isGameplayEvent };
