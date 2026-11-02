const options = require('./contracts/overlayFilterOptions.json');
const CATEGORIES = Object.freeze(options.categories);
const ACTIONS = Object.freeze(options.actions);
const ITEM_TYPES = Object.freeze(options.itemTypes);
const ITEM_CLASSES = Object.freeze({
  crlf_consumable_healing_01: 'medical', Drink_bottle_cruz_01_lux_a: 'drink',
  klwe_lmg_energy_01_mag: 'ammunition', behr_lmg_ballistic_01_mag: 'ammunition', klwe_pistol_energy_01_mag: 'ammunition',
  outlaw_legacy_armor_medium_helmet_01_01_01: 'equipment',
  rsi_odyssey_undersuit_helmet_01_01_01: 'equipment', rsi_odyssey_undersuit_01_01_01: 'equipment',
  rsi_explorer_undersuit_01_01_concierge: 'equipment', qrt_specialist_medium_core_01_01_04: 'equipment',
  qrt_specialist_medium_arms_01_01_04: 'equipment', qrt_specialist_medium_legs_01_01_04: 'equipment',
  qrt_specialist_medium_helmet_01_01_04: 'equipment', rrs_combat_light_backpack_02_02_01: 'equipment',
  fio_glasses_01_01_01: 'equipment', klwe_ubarrel_lasr_s1: 'equipment', klwe_ubarrel_lasr_s1_02: 'equipment'
});
const DIMENSIONS = Object.freeze({ categories: CATEGORIES, actions: ACTIONS, itemTypes: ITEM_TYPES });

function normalizeOverlayFilters(value, { strict = false } = {}) {
  if (strict && (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(DIMENSIONS, key)))) throw new TypeError('Invalid overlay filter fields.');
  return Object.fromEntries(Object.entries(DIMENSIONS).map(([key, options]) => {
    const values = value?.[key];
    if (strict && values !== undefined && (!Array.isArray(values) || values.length > Object.keys(options).length || values.some(id => typeof id !== 'string' || !Object.hasOwn(options, id)))) throw new TypeError('Invalid overlay filter selection.');
    return [key, Array.isArray(values) ? [...new Set(values.filter(id => typeof id === 'string' && Object.hasOwn(options, id)))] : []];
  }));
}

function classifyOverlayRow(row) {
  const events = row.sourceEvents;
  const event = events.find(item => item.eventType === 'ShopPurchaseRequested' || item.payload?.signalId === 'SHP-01') || row.event;
  const payload = event.payload || {};
  const itemClass = row.inventoryContext?.itemClass || payload.itemClass || (event.eventType === 'ShopPurchaseRequested' ? payload.itemName : null);
  const itemType = itemClass ? Object.hasOwn(ITEM_CLASSES, itemClass) ? ITEM_CLASSES[itemClass] : 'unclassified' : 'no_item';
  let category = 'inventory';
  let action = 'inventory_result';
  const id = payload.signalId;
  const type = event.eventType;
  if (type === 'ShopPurchaseRequested' || id === 'SHP-01' || id === 'SHP-02') { category = 'shop'; action = 'purchase'; }
  else if (['INV-13', 'INV-14', 'INV-15'].includes(id)) { category = 'equipment'; action = 'attachment'; }
  else if (id === 'INV-05') action = 'drop';
  else if (id === 'INV-06') action = 'move';
  else if (id === 'INV-07') action = 'carry';
  else if (id === 'INV-09') action = 'close';
  else if (type.startsWith('Vehicle')) { category = 'vehicle'; action = type === 'VehicleRetrieved' ? 'retrieve' : type === 'VehicleStored' ? 'store' : 'control'; }
  else if (type.startsWith('Quantum')) { category = 'travel'; action = type === 'QuantumTravelArrived' ? 'arrival' : 'destination'; }
  else if (type.startsWith('Party')) { category = 'party'; action = type === 'PartyLaunchInitiated' ? 'launch' : 'membership'; }
  else if (type === 'MissionAccepted') { category = 'mission'; action = 'accept'; }
  else if (['JurisdictionEntered', 'MonitoredSpaceEntered', 'MonitoredSpaceExited', 'ArmisticeStateChanged'].includes(type)) { category = 'area'; action = 'area_change'; }
  return { category, action, itemType, classificationSource: itemClass && Object.hasOwn(ITEM_CLASSES, itemClass) ? 'local_exact_mapping' : 'observation', classificationVersion: 1 };
}

function matchesOverlayFilters(classification, filters) {
  return (!filters.categories.length || filters.categories.includes(classification.category))
    && (!filters.actions.length || filters.actions.includes(classification.action))
    && (!filters.itemTypes.length || filters.itemTypes.includes(classification.itemType));
}

module.exports = { CATEGORIES, ACTIONS, ITEM_TYPES, normalizeOverlayFilters, classifyOverlayRow, matchesOverlayFilters };
