// Closed vocabulary from CAP-2026-10-29-01/02. These are log observations,
// not reconstructed gameplay outcomes or arbitrary raw-message passthrough.
const SIGNALS = Object.freeze([
  ['INV-01', 'Add Inventory Management Move', 'Inventory operation requested'],
  ['INV-02', 'Inventory Mgmt Request Handle', 'Inventory request handling'],
  ['INV-02', 'Inventory Mgmt Request Queued', 'Inventory request queued'],
  ['INV-03', 'Inventory Mgmt Request Process', 'Inventory request processing'],
  ['INV-04', 'Player Inventory Request Complete', 'Player inventory request result'],
  ['INV-04', 'Inventory Request Completed', 'Inventory request completed'],
  ['INV-05', 'Inventory Drop From Container', 'Drop to ground requested'],
  ['INV-08', 'UnstowPendingEntities', 'Entity unstow finalized'],
  ['INV-09', 'Close Inventory Grid', 'Inventory grid closing'],
  ['INV-09', 'Remove Inventory Container UI', 'Inventory container removed from UI'],
  ['INV-11', 'Query Inventory', 'Inventory query activity'],
  ['INV-11', 'Request Personal Inventory Data', 'Personal inventory data activity'],
  ['INV-12', 'Inventory Token Flow', 'Inventory access-token activity'],
  ['INV-12', 'Request Terminate Access To Inventory', 'Inventory access termination'],
  ['INV-16', 'AttachmentReceived', 'Item attachment observed'],
  ['INV-17', 'OnDragInventoryItemModifyTarget', 'Inventory drag preview'],
  ['INV-18', 'Update Container Items Add New Item', 'Container UI item update'],
  ['INV-19', 'Inventory Terminate Location Container', 'Location inventory cache invalidated'],
  ['SHP-01', 'CEntityComponentShopUIProvider::SendShopBuyRequest', 'Shop purchase requested'],
  ['SHP-02', 'CEntityComponentShopUIProvider::RmShopFlowResponse', 'Shop buying response'],
  ['VEH-01', 'OnRequestFetchVehicles', 'Vehicle-list query activity'],
  ['VEH-02', "`anonymous-namespace'::BuildInventoryStowedAggregateRoots", 'Vehicle inventory aggregate observed'],
  ['VEH-03', 'VehicleListQuery', 'Vehicle-list query completed'],
  ['LOAD-01', 'UI - LoadoutEditor', 'Loadout data activity'],
  ['SYS-01', 'ReuseChannel', 'Service channel reused'],
  ['ENV-01', 'CSCLoadingPlatformManager::OnLoadingPlatformStateChanged', 'Loading-platform state observed'],
  ['ENV-02', 'CSCLoadingPlatformManager::LoadEntitiesReference', 'Platform references loading'],
  ['ENV-02', 'CSCLoadingPlatformManager::LoadEntitiesReference::<lambda_1>::operator ()', 'Platform reference resolved'],
  ['ENV-03', 'CSCLoadingPlatformManager::StopEffectForAllTags', 'Platform effects stopping'],
  ['ENV-04', 'CSCLoadingPlatformManager::TransitionLightGroupState', 'Platform light-state activity'],
  ['DIA-01', 'AggregateBindParentOutOfSync', 'Attachment-parent desynchronization'],
  ['DIA-02', '[BuildingBlocks] Invalid Url', 'UI category variable unavailable'],
  ['DIA-04', 'LoadingPlatformUtilities::LoadFromXmlNode', 'Platform XML child missing'],
  ['DIA-04', 'CSCLoadingPlatformManager::loadEntityFromXML::<lambda_1>::operator ()', 'Platform XML entity missing'],
  ['DIA-05', 'DuplicatedItemPorts', 'Duplicate attachment-port diagnostic'],
  ['DIA-06', 'CreationRefusedEntity', 'Entity creation refused'],
  ['DIA-07', 'Failed attachment', 'Attachment parent or port missing'],
  ['DIA-08', 'Failed to attach to itemport, destroying entity', 'Spawned-entity attachment cleanup'],
  ['NAV-01', 'Local Route Guard - Server Rerouted', 'Unattributed route-guard diagnostic'],
  ['ATC-01', 'ATC_Reset_VehiclesBeingStoredCleared', 'ATC storage-tracking reset']
].map(([id, marker, label]) => Object.freeze({ id, marker, label })));

const SIGNAL_IDS = Object.freeze([...new Set([...SIGNALS.map((signal) => signal.id),
  'INV-06', 'INV-07', 'INV-10', 'INV-13', 'INV-14', 'INV-15', 'DIA-03'])]);
const BY_MARKER = new Map(SIGNALS.map((signal) => [signal.marker, signal]));

function bracket(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.match(new RegExp(`\\b${escaped}\\[([^\\]]*)\\]`, 'i'))?.[1] || null;
}

function safeName(value) {
  // Class/shop vocabulary only; never pass paths, endpoints, account IDs or raw text.
  return value && /^[A-Za-z][A-Za-z0-9_ -]{0,127}$/.test(value) && !/\d{8,}/.test(value) ? value : null;
}

function numberValue(value) {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) && number <= Number.MAX_SAFE_INTEGER ? number : null;
}

function parseCapturedRuntimeSignal(text) {
  const match = text.match(/^<[^>]+>\s+\[(Notice|Warning|Error)\]\s+<(.*?)>\s+([^\r\n]*)$/);
  if (!match) return null;
  const [, severity, marker, message] = match;
  const definition = BY_MARKER.get(marker);
  if (!definition) return null;
  let { id: signalId, label } = definition;
  const operation = safeName(bracket(message, 'Type'));
  const action = safeName(bracket(message, 'action'));
  let category = signalId.startsWith('INV-') || signalId.startsWith('SHP-') ? 'action'
    : signalId.startsWith('VEH-') ? 'vehicle' : 'runtime';
  if (severity === 'Error' || signalId.startsWith('DIA-') || signalId === 'NAV-01') category = 'diagnostic';
  if (signalId === 'ENV-04' && severity === 'Error') signalId = 'DIA-03';
  if (marker === 'Add Inventory Management Move' && operation === 'Move') {
    signalId = 'INV-06'; label = 'Inventory move requested';
  }
  if (marker === 'Inventory Mgmt Request Queued' && action === 'Carry') {
    signalId = 'INV-07'; label = 'Item carry requested';
  }
  if (marker === 'Close Inventory Grid' && /closing inventory with \d+ pending moves/.test(message)) {
    signalId = 'INV-10'; label = 'Inventory closing with pending operations';
  }
  const attachmentPort = safeName(bracket(message, 'Port'));
  if (marker === 'AttachmentReceived') {
    const ports = { weapon_attach_hand_left: ['INV-13', 'Item attached to left hand'],
      helmethook_attach: ['INV-14', 'Item attached to helmet hook'],
      weapon_attach_hand_right: ['INV-15', 'Item attached to right hand'],
      inventory_pocket: ['INV-16', 'Pocket attachment observed'],
      inventory_pocket_2: ['INV-16', 'Local pocket attachment observed'] };
    if (!ports[attachmentPort]) return null;
    [signalId, label] = ports[attachmentPort];
  }
  let itemClass = safeName(bracket(message, 'ItemClass') || bracket(message, 'itemName'));
  if (marker === 'AttachmentReceived') itemClass = safeName(bracket(message, 'Attachment')?.split(',')[1]?.trim());
  const quantity = numberValue(bracket(message, 'quantity') || bracket(message, 'amount'));
  const clientPrice = numberValue(bracket(message, 'client_price'));
  const result = safeName(bracket(message, 'Result'));
  const elapsedSeconds = numberValue(bracket(message, 'Elapsed') || message.match(/took (\d+(?:\.\d+)?) seconds/)?.[1]);
  const requestId = message.match(/\bRequest\[(\d+)\]/i)?.[1] || null;
  if (requestId && requestId.length > 24) return null;
  const shopName = safeName(bracket(message, 'shopName'));
  const kioskState = safeName(bracket(message, 'kioskState'));
  const operations = new Set(['Drop', 'Move', 'Interaction', 'QueryInventory']);
  if (['INV-01', 'INV-02', 'INV-03', 'INV-06', 'INV-07'].includes(signalId) && (!requestId || !operations.has(operation))) return null;
  if (signalId === 'INV-05' && !message.includes('attempt drag and drop to ground item')) return null;
  if (signalId === 'INV-08' && !message.includes('finalized spawn')) return null;
  if (signalId === 'SYS-01' && !message.startsWith("Reusing channel for 'sc.external.services.")) return null;
  if (signalId === 'SHP-01' && (!itemClass || !Number.isSafeInteger(quantity) || quantity < 1 || clientPrice === null || !shopName)) return null;
  if (signalId === 'SHP-02' && (!result || !shopName || bracket(message, 'type') !== 'Buying' || !kioskState)) return null;
  if (signalId === 'INV-04' && (!requestId || !result)) return null;

  const details = [];
  if (requestId) details.push(`request ${requestId}`);
  if (operation) details.push(`operation ${operation}`);
  if (itemClass && itemClass !== 'Default') details.push(itemClass);
  if (quantity !== null) details.push(`requested/source quantity ${quantity}`);
  if (clientPrice !== null) details.push(`client price ${clientPrice} (basis/currency unverified)`);
  if (shopName) details.push(`shop ${shopName}`);
  if (result) details.push(`reported result ${result}`);
  if (elapsedSeconds !== null) details.push(`${elapsedSeconds} s`);
  if (attachmentPort) details.push(`port ${attachmentPort}`);
  if (signalId === 'SHP-02') details.push(`buying flow ${kioskState}; payment/delivery unverified`);
  if (marker === 'AttachmentReceived') details.push(`attachment ${safeName(bracket(message, 'Status')) || 'unknown'}`);
  if (signalId === 'VEH-02') {
    const location = message.match(/^Found \[(\d+)\] vehicle\(s\) at location/);
    const hangar = message.match(/CollectStowedVehicles found \[(\d+)\] vehicle\(s\) across \[(\d+)\] hangar\(s\)/);
    if (location) details.push(`${location[1]} vehicle records at location`);
    if (hangar) details.push(`${hangar[1]} stowed records across ${hangar[2]} hangars`);
  }
  if (signalId === 'VEH-03') {
    const counts = message.match(/Retrieved (\d+) entitlements out of (\d+) vehicules/);
    if (counts) details.push(`${counts[1]} entitlement records / ${counts[2]} vehicle records; ownership unverified`);
  }
  if (signalId === 'ENV-01') details.push(`state ${safeName(message.match(/state changed to (\w+)/)?.[1]) || 'unknown'}`);
  if (signalId === 'SYS-01') {
    const service = message.match(/'sc\.external\.services\.([a-z_]+)\./)?.[1];
    if (service) details.push(`service ${service}`);
  }
  if (signalId === 'ATC-01') {
    const count = message.match(/clearing (\d+) entries/);
    if (count) details.push(`${count[1]} tracking entries cleared; no storage outcome implied`);
  }
  return { signalId, category, label, summary: `${label}${details.length ? `: ${details.join('; ')}` : ''}`,
    requestId, operation, itemClass, quantity, clientPrice, shopName, kioskState, result, elapsedSeconds, attachmentPort };
}

module.exports = { SIGNALS, SIGNAL_IDS, parseCapturedRuntimeSignal };
