// Owner-provided names and conservative descriptions of already captured items.
const ITEM_NAMES = Object.freeze({
  crlf_consumable_healing_01: Object.freeze({ singular: 'MedPen', plural: 'MedPens' }),
  Drink_bottle_cruz_01_lux_a: Object.freeze({ singular: 'Cruz bottle', plural: 'Cruz bottles' }),
  klwe_lmg_energy_01_mag: Object.freeze({ singular: 'energy LMG magazine', plural: 'energy LMG magazines' }),
  behr_lmg_ballistic_01_mag: Object.freeze({ singular: 'ballistic LMG magazine', plural: 'ballistic LMG magazines' }),
  outlaw_legacy_armor_medium_helmet_01_01_01: Object.freeze({ singular: 'helmet', plural: 'helmets' })
});

const MESSAGE_TEMPLATES = Object.freeze({
  purchaseRequested: '{count}\u00d7 {item} purchase requested',
  purchaseSucceeded: '{count}\u00d7 {item} purchased',
  purchaseFailed: '{count}\u00d7 {item} purchase failed',
  purchaseResponse: 'Shop response received',
  inventorySucceeded: 'Inventory action completed',
  inventoryFailed: 'Inventory action failed',
  inventoryResponse: 'Inventory response received',
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

function friendlySignalMessage(payload) {
  const item = itemName(payload.itemClass);
  switch (payload.signalId) {
    case 'SHP-01': return formatOverlayMessage('purchaseRequested', {
      count: payload.quantity, item: itemName(payload.itemClass, payload.quantity)
    });
    case 'SHP-02': return resultKind(payload.result) === 'success' ? 'Shop reported purchase success'
      : resultKind(payload.result) === 'failure' ? 'Shop reported purchase failure' : formatOverlayMessage('purchaseResponse');
    case 'INV-04': return formatOverlayMessage(resultKind(payload.result) === 'success' ? 'inventorySucceeded'
      : resultKind(payload.result) === 'failure' ? 'inventoryFailed' : 'inventoryResponse');
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

module.exports = { ITEM_NAMES, MESSAGE_TEMPLATES, formatOverlayMessage, friendlySignalMessage, itemName, resultKind };
