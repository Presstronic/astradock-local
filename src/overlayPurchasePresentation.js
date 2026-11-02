const { formatOverlayMessage, friendlySignalMessage, friendlyInventoryMessage, itemName, resultKind } = require('./overlayMessages');

const PURCHASE_RESPONSE_WINDOW_MS = 10_000;

function contextKey(event) {
  const context = event.correlationIds?.shopContextId;
  return context ? `${event.environmentKey}:${event.evidenceReference?.sourceId}:${event.ordering?.sourceGeneration ?? 0}:${context}` : null;
}

/** Presentation-only association; never invent a canonical payment/delivery event. */
function presentOverlayEvents(chronologicalEvents, inventoryContexts = new Map()) {
  const pending = new Map();
  const rows = [];
  for (const event of chronologicalEvents) {
    const captured = event.eventType === 'RuntimeLogSignalObserved';
    const payload = event.payload;
    const row = { id: event.eventId, event, sourceEvents: [event], provenance: event.provenance,
      summary: captured ? friendlySignalMessage(payload) : event.eventType === 'ShopPurchaseRequested'
        ? formatOverlayMessage('purchaseRequested', { count: payload.quantity, item: itemName(payload.itemName, payload.quantity) })
        : event.eventType.replace(/([a-z])([A-Z])/g, '$1 $2'), evidenceNote: null };
    if (captured && payload.signalId === 'INV-04') {
      const context = inventoryContexts.get(event.eventId);
      if (context) {
        row.inventoryContext = context;
        row.summary = friendlyInventoryMessage(payload, context);
        row.provenance = 'inferred';
        row.confidence = 'medium';
        row.rawEvidenceKeys = [...context.evidenceKeys, event.eventId];
        row.evidenceNote = 'Item association is inferred from the same player and request ID within a bounded source/session window. The result is client-reported; ownership and delivery are not independently verified.'
          + ` Item class: ${context.itemClass}.`
          + (context.quantity === null ? ' Quantity is not identified.' : ' Quantity comes from the matching request, not an independent delivered-count measurement.')
          + (context.movement ? ' Route comes from matching request/queue records. Location inventory is not a named station; container is not an identified backpack or proof of personal ownership.'
            + (context.movement.kind === 'ground_drop' ? ' Ground destination requires the explicit DropItemFromContainerImpl request, agreeing queue and client result; INVALID alone never means ground. A failed or unknown result establishes no removal.' : '')
            : ' Route is unknown: matching, unambiguous container context is unavailable.')
          + ' No local or Station inventory balance is changed by this presentation.';
      } else if (!payload.itemClass) {
        row.evidenceNote = 'Item details unavailable: no unambiguous matching item request in the current capture.';
      }
    }
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
