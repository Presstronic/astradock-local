// Presentation semantics for reviewed request/queue vocabulary. Container IDs stay local.
function containerKind(value) {
  const match = value?.match(/^[A-Za-z0-9_-]{1,128}:(Location|Container):[A-Za-z0-9_-]{1,128}$/);
  return match?.[1] === 'Location' ? 'location_inventory' : match ? 'container' : 'unknown';
}

function inventoryRoute(request) {
  const queue = request.queue;
  if (!queue || request.routeAmbiguous) return null;
  const from = containerKind(queue.sourceInventory);
  const to = containerKind(queue.targetInventory);
  if (from === 'unknown' && to === 'unknown') return null;
  if (request.operation === 'Store') {
    // StoreItem reverses the Add record's inventory argument when it enters the queue.
    if (request.caller !== 'CSCLocalPlayerPersonalThoughtComponent::StoreItem'
      || request.targetInventory !== 'INVALID' || queue.sourceInventory !== 'INVALID'
      || request.sourceInventory !== queue.targetInventory) return null;
    return { kind: 'store', from, to };
  }
  if (request.sourceInventory !== queue.sourceInventory || request.targetInventory !== queue.targetInventory
    || queue.sourceInventory === queue.targetInventory) return null;
  if (request.operation === 'Drop' && request.caller === 'CSCLocalPlayerPersonalThoughtComponent::DropItemFromContainerImpl'
    && queue.targetInventory === 'INVALID' && from !== 'unknown' && queue.action === 'None'
    && queue.itemClass === request.itemClass && request.quantity !== null
    && Number(queue.amount) === request.quantity) return { kind: 'ground_drop', from, to: 'ground' };
  if (request.operation === 'Move' && from !== 'unknown' && to !== 'unknown') return { kind: 'transfer', from, to };
  // INVALID on an Interaction is also used for attaching/carrying. Never call it ground.
  return { kind: 'interaction', from, to };
}

function routeLabel(kind, endpoint) {
  return ({ location_inventory: 'location inventory', container: 'container', ground: 'ground' })[kind]
    || `unknown ${endpoint}`;
}

module.exports = { inventoryRoute, routeLabel };
