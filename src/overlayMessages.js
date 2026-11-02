const { routeLabel } = require('./overlayInventoryRoute');
// Owner-provided names and conservative descriptions of already captured items.
const ITEM_NAMES = Object.freeze({
  crlf_consumable_healing_01: Object.freeze({ singular: 'MedPen', plural: 'MedPens' }),
  Drink_bottle_cruz_01_lux_a: Object.freeze({ singular: 'Cruz bottle', plural: 'Cruz bottles' }),
  klwe_lmg_energy_01_mag: Object.freeze({ singular: 'energy LMG magazine', plural: 'energy LMG magazines' }),
  behr_lmg_ballistic_01_mag: Object.freeze({ singular: 'ballistic LMG magazine', plural: 'ballistic LMG magazines' }),
  klwe_pistol_energy_01_mag: Object.freeze({ singular: 'energy pistol magazine', plural: 'energy pistol magazines' }),
  klwe_pistol_energy_01: Object.freeze({ singular: 'energy pistol', plural: 'energy pistols' }),
  rsi_odyssey_undersuit_helmet_01_01_01: Object.freeze({ singular: 'Odyssey helmet', plural: 'Odyssey helmets' }),
  rsi_odyssey_undersuit_01_01_01: Object.freeze({ singular: 'Odyssey undersuit', plural: 'Odyssey undersuits' }),
  rsi_explorer_undersuit_01_01_concierge: Object.freeze({ singular: 'Explorer undersuit', plural: 'Explorer undersuits' }),
  qrt_specialist_medium_core_01_01_04: Object.freeze({ singular: 'Specialist medium chest armor', plural: 'Specialist medium chest armor pieces' }),
  qrt_specialist_medium_arms_01_01_04: Object.freeze({ singular: 'Specialist medium arm armor', plural: 'Specialist medium arm armor pieces' }),
  qrt_specialist_medium_legs_01_01_04: Object.freeze({ singular: 'Specialist medium leg armor', plural: 'Specialist medium leg armor pieces' }),
  qrt_specialist_medium_helmet_01_01_04: Object.freeze({ singular: 'Specialist medium helmet', plural: 'Specialist medium helmets' }),
  rrs_combat_light_backpack_02_02_01: Object.freeze({ singular: 'light combat backpack', plural: 'light combat backpacks' }),
  fio_glasses_01_01_01: Object.freeze({ singular: 'glasses', plural: 'pairs of glasses' }),
  crlf_medgun_01_msn_rwd02: Object.freeze({ singular: 'medical gun', plural: 'medical guns' }),
  gmni_sniper_ballistic_01_arctic01: Object.freeze({ singular: 'ballistic sniper rifle', plural: 'ballistic sniper rifles' }),
  klwe_ubarrel_lasr_s1: Object.freeze({ singular: 'size 1 underbarrel laser attachment', plural: 'size 1 underbarrel laser attachments' }),
  klwe_ubarrel_lasr_s1_02: Object.freeze({ singular: 'size 1 underbarrel laser attachment (variant 02)', plural: 'size 1 underbarrel laser attachments (variant 02)' }),
  outlaw_legacy_armor_medium_helmet_01_01_01: Object.freeze({ singular: 'helmet', plural: 'helmets' })
});

const MESSAGE_TEMPLATES = Object.freeze({
  purchaseRequested: '{count}\u00d7 {item} purchase requested',
  purchaseSucceeded: '{count}\u00d7 {item} purchased',
  purchaseFailed: '{count}\u00d7 {item} purchase failed',
  purchaseResponse: 'Shop response received',
  inventorySucceeded: 'Inventory action completed (item unknown)',
  inventoryFailed: 'Inventory action failed (item unknown)',
  inventoryResponse: 'Inventory response received (item unknown)',
  inventoryItemSucceeded: 'Inventory update completed: {item}',
  inventoryItemFailed: 'Inventory update failed: {item}',
  inventoryItemResponse: 'Inventory response received: {item}',
  inventoryTransferSucceeded: 'Transfer reported: {item}',
  inventoryTransferFailed: 'Transfer failed: {item}',
  inventoryTransferResponse: 'Transfer response received: {item}',
  inventoryStoreSucceeded: 'Store reported: {item}',
  inventoryStoreFailed: 'Store failed: {item}',
  inventoryStoreResponse: 'Store response received: {item}',
  inventoryDropSucceeded: 'Ground drop reported: {item}',
  inventoryDropFailed: 'Ground drop failed: {item}',
  inventoryDropResponse: 'Ground drop response received: {item}',
  dropRequested: 'Item drop requested',
  moveRequested: '{item} move requested',
  carryRequested: 'Item carry requested',
  inventoryClosing: 'Closing inventory',
  leftHand: 'Holding {item} in left hand',
  helmetHook: '{item} attached to helmet hook',
  rightHand: 'Holding {item} in right hand'
});

function formatOverlayMessage(template, values = {}) {
  if (!Object.hasOwn(MESSAGE_TEMPLATES, template)) throw new TypeError('Unknown overlay message template.');
  const text = MESSAGE_TEMPLATES[template];
  if (!text) throw new TypeError('Unknown overlay message template.');
  return text.replace(/\{([a-z]+)\}/g, (_slot, name) => {
    if (!Object.hasOwn(values, name)) throw new TypeError(`Missing overlay template value: ${name}`);
    return String(values[name]);
  });
}

function itemName(itemClass, quantity = 1) {
  const known = Object.hasOwn(ITEM_NAMES, itemClass) ? ITEM_NAMES[itemClass] : null;
  return known ? quantity === 1 ? known.singular : known.plural : itemClass || 'item';
}

function resultKind(result) {
  if (/^(success|succeed)$/i.test(result || '')) return 'success';
  if (/^(failed|fail|failure|error)$/i.test(result || '')) return 'failure';
  return 'unknown';
}

function friendlyInventoryMessage(payload, context = payload) {
  const outcome = resultKind(payload.result);
  if (!context.itemClass) return formatOverlayMessage(outcome === 'success' ? 'inventorySucceeded'
    : outcome === 'failure' ? 'inventoryFailed' : 'inventoryResponse');
  const quantity = Number.isSafeInteger(context.quantity) && context.quantity > 0 ? context.quantity : null;
  const item = quantity === null ? itemName(context.itemClass) : `${quantity}\u00d7 ${itemName(context.itemClass, quantity)}`;
  const movement = context.movement;
  const prefix = ({ transfer: 'inventoryTransfer', store: 'inventoryStore', ground_drop: 'inventoryDrop' })[movement?.kind] || 'inventoryItem';
  const message = formatOverlayMessage(prefix + (outcome === 'success' ? 'Succeeded' : outcome === 'failure' ? 'Failed' : 'Response'), { item });
  if (!movement) return message;
  const effect = movement.kind === 'ground_drop' && outcome === 'success' ? 'outgoing item reported' : 'ownership unverified';
  return `${message} \u00b7 ${routeLabel(movement.from, 'source')} \u2192 ${routeLabel(movement.to, 'destination')} \u00b7 ${effect}`;
}

function friendlySignalMessage(payload) {
  const item = itemName(payload.itemClass);
  switch (payload.signalId) {
    case 'SHP-01': return formatOverlayMessage('purchaseRequested', {
      count: payload.quantity, item: itemName(payload.itemClass, payload.quantity)
    });
    case 'SHP-02': return resultKind(payload.result) === 'success' ? 'Shop reported purchase success'
      : resultKind(payload.result) === 'failure' ? 'Shop reported purchase failure' : formatOverlayMessage('purchaseResponse');
    case 'INV-04': return friendlyInventoryMessage(payload);
    case 'INV-05': return formatOverlayMessage('dropRequested');
    case 'INV-06': return formatOverlayMessage('moveRequested', { item });
    case 'INV-07': return formatOverlayMessage('carryRequested');
    case 'INV-09': return formatOverlayMessage('inventoryClosing');
    case 'INV-13': return formatOverlayMessage('leftHand', { item });
    case 'INV-14': return formatOverlayMessage('helmetHook', { item });
    case 'INV-15': return formatOverlayMessage('rightHand', { item });
    default: return payload.label;
  }
}

module.exports = { ITEM_NAMES, MESSAGE_TEMPLATES, formatOverlayMessage, friendlySignalMessage, friendlyInventoryMessage, itemName, resultKind };
