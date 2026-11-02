const { formatOverlayMessage, friendlySignalMessage, itemName, resultKind } = require('./overlayMessages');

const PURCHASE_RESPONSE_WINDOW_MS = 10_000;

function contextKey(event) {
  const context = event.correlationIds?.shopContextId;
  return context ? `${event.environmentKey}:${event.evidenceReference?.sourceId}:${event.ordering?.sourceGeneration ?? 0}:${context}` : null;
}

/** Presentation-only association; never invent a canonical payment/delivery event. */
function presentOverlayEvents(chronologicalEvents) {
  const pending = new Map();
  const rows = [];
  for (const event of chronologicalEvents) {
    const captured = event.eventType === 'RuntimeLogSignalObserved';
    const payload = event.payload;
    const row = { id: event.eventId, event, sourceEvents: [event], provenance: event.provenance,
      summary: captured ? friendlySignalMessage(payload) : event.eventType === 'ShopPurchaseRequested'
        ? formatOverlayMessage('purchaseRequested', { count: payload.quantity, item: itemName(payload.itemName, payload.quantity) })
        : event.eventType.replace(/([a-z])([A-Z])/g, '$1 $2'), evidenceNote: null };
    const key = contextKey(event);
    if (!captured || !key || !['SHP-01', 'SHP-02'].includes(payload.signalId)) { rows.push(row); continue; }
    const now = Date.parse(event.sourceTimestamp);
    let state = pending.get(key) || { requests: [], ambiguous: false };
    state.requests = state.requests.filter(request => now - Date.parse(request.event.sourceTimestamp) <= PURCHASE_RESPONSE_WINDOW_MS);
    if (!state.requests.length) state.ambiguous = false;
    if (payload.signalId === 'SHP-01') {
      if (state.requests.length) state.ambiguous = true;
      state.requests.push(row);
      pending.set(key, state);
      rows.push(row);
      continue;
    }
    const requestId = event.correlationIds?.shopRequestId;
    const candidates = requestId ? state.requests.filter(request => request.event.correlationIds?.shopRequestId === requestId)
      : !state.ambiguous && state.requests.length === 1 ? state.requests : [];
    const outcome = resultKind(payload.result);
    if (candidates.length !== 1 || outcome === 'unknown') { rows.push(row); continue; }
    const request = candidates[0];
    const requested = request.event.payload;
    request.sourceEvents.push(event);
    request.event = event;
    request.provenance = 'inferred';
    request.summary = formatOverlayMessage(outcome === 'success' ? 'purchaseSucceeded' : 'purchaseFailed', {
      count: requested.quantity, item: itemName(requested.itemClass, requested.quantity)
    });
    request.evidenceNote = outcome === 'success'
      ? 'Shop-reported success. Request/response association is inferred from matching context and ordering; payment, delivery, and price basis are unverified.'
      : 'Shop-reported failure. The request and response were associated by matching context and ordering; no successful purchase is asserted.';
    state.requests = state.requests.filter(candidate => candidate !== request);
    if (state.requests.length) pending.set(key, state); else pending.delete(key);
  }
  return rows;
}

module.exports = { presentOverlayEvents, PURCHASE_RESPONSE_WINDOW_MS };
