const { isIP } = require('node:net');

const CAPABILITIES = Object.freeze(['catalogRead', 'inventoryRead', 'inventoryWrite']);
class StationError extends Error {
  constructor(code, message) { super(message); this.name = 'StationError'; this.code = code; }
}
function invalid(message = 'Station returned an invalid or unsupported response.') { throw new StationError('station_contract_invalid', message); }
function text(value, max = 192) { if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) invalid(); return value; }
function instant(value) { if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) invalid(); return value; }
function object(value, keys) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) invalid('Unsupported Station request fields.'); }
function profile(value) {
  object(value, ['label', 'apiBaseUrl', 'clientId']);
  let url;
  try { url = new URL(value.apiBaseUrl); } catch { invalid('Enter a valid HTTPS Station service address.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port && url.port !== '443'
    || isIP(url.hostname.replace(/^\[|\]$/g, '')) || !url.hostname.includes('.') || /(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)) invalid('Station requires a public HTTPS service address without credentials, query or fragment.');
  return { label: text(value.label, 80), apiBaseUrl: url.href.replace(/\/$/, ''), clientId: value.clientId === '' ? '' : text(value.clientId, 192) };
}
function session(value) {
  object(value, ['subject', 'displayName', 'roles', 'permissions', 'capabilities', 'expiresAt', 'authorizationRevision', 'gameBinding']);
  const capabilities = {};
  object(value.capabilities, CAPABILITIES);
  for (const key of CAPABILITIES) { if (typeof value.capabilities[key] !== 'boolean') invalid(); capabilities[key] = value.capabilities[key]; }
  const strings = values => { if (!Array.isArray(values) || values.length > 128) invalid(); return [...new Set(values.map(value => text(value, 128)))]; };
  return { subject: text(value.subject), displayName: text(value.displayName, 80), roles: strings(value.roles), permissions: strings(value.permissions), capabilities,
    expiresAt: instant(value.expiresAt), authorizationRevision: text(value.authorizationRevision), gameBinding: text(value.gameBinding) };
}
function inventoryPage(value) {
  object(value, ['revision', 'environmentKey', 'epoch', 'items', 'nextCursor', 'complete']);
  if (!Array.isArray(value.items) || value.items.length > 500 || typeof value.complete !== 'boolean') invalid();
  return { revision: text(value.revision), environmentKey: text(value.environmentKey, 64), epoch: text(value.epoch),
    nextCursor: value.nextCursor === null ? null : text(value.nextCursor, 1024), complete: value.complete,
    items: value.items.map(item => {
      object(item, ['id', 'itemId', 'name', 'quantity', 'unit', 'location']);
      if (!Number.isSafeInteger(item.quantity) || item.quantity < 0) invalid();
      return { id: text(item.id), itemId: text(item.itemId), name: item.name === null ? null : text(item.name, 160), quantity: item.quantity,
        unit: text(item.unit, 24), location: item.location === null ? null : text(item.location, 160) };
    }) };
}
function consent(value) { object(value, [...CAPABILITIES, 'paused']); for (const key of Object.keys(value)) if (typeof value[key] !== 'boolean') invalid(); return { ...value }; }
function validateCommand(command, payload) {
  const noData = ['snapshot', 'signIn', 'cancelSignIn', 'signOut', 'refreshAccess', 'refreshInventory', 'retry', 'reset'];
  if (noData.includes(command)) { if (payload !== undefined && payload !== null) invalid(); return undefined; }
  if (command === 'configure') return profile(payload);
  if (command === 'consent') return consent(payload);
  if (['review', 'confirm', 'cancel', 'reject'].includes(command)) {
    object(payload, command === 'confirm' ? ['proposalId', 'challenge'] : ['proposalId']);
    return { proposalId: text(payload.proposalId), ...(command === 'confirm' ? { challenge: text(payload.challenge) } : {}) };
  }
  if (command === 'resolveItems') { object(payload, ['ids']); if (!Array.isArray(payload.ids) || payload.ids.length < 1 || payload.ids.length > 100) invalid(); return { ids: [...new Set(payload.ids.map(id => text(id)))] }; }
  invalid('Unknown Station capability.');
}
module.exports = { CAPABILITIES, StationError, invalid, text, instant, object, profile, session, inventoryPage, consent, validateCommand };
