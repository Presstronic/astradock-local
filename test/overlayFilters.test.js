const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeOverlayFilters, classifyOverlayRow, matchesOverlayFilters } = require('../src/overlayFilters');
const { createOverlayEventFeed } = require('../src/overlayEventFeed');
const { parseRuntimeLogText } = require('../src/runtimeLogParserEngine');
const { collectRuntimeEvidence } = require('../src/runtimeEvidenceCache');

test('cumulative overlay predicates preserve unknown/no-item separation and never use display-name guessing', () => {
  const row = (eventType, payload) => { const event = { eventType, payload }; return { event, sourceEvents: [event] }; };
  const ammo = classifyOverlayRow(row('ShopPurchaseRequested', { itemName: 'klwe_lmg_energy_01_mag' }));
  const filters = normalizeOverlayFilters({ actions: ['purchase'], itemTypes: ['ammunition'] }, { strict: true });
  assert.equal(matchesOverlayFilters(ammo, filters), true);
  assert.equal(matchesOverlayFilters(classifyOverlayRow(row('PartyCreated', {})), filters), false);
  const unknown = classifyOverlayRow(row('ShopPurchaseRequested', { itemName: 'unreviewed_ammo_mag_prefix' }));
  for (const itemName of ['constructor', 'toString', '__proto__']) assert.equal(classifyOverlayRow(row('ShopPurchaseRequested', { itemName })).itemType, 'unclassified');
  assert.equal(unknown.itemType, 'unclassified'); assert.equal(matchesOverlayFilters(unknown, filters), false);
  assert.equal(matchesOverlayFilters(unknown, normalizeOverlayFilters({ itemTypes: ['unclassified'] })), true);
  assert.throws(() => normalizeOverlayFilters({ itemTypes: ['invented'] }, { strict: true }));
  assert.throws(() => normalizeOverlayFilters({ rawQuery: 'secret' }, { strict: true }));
  assert.deepEqual(normalizeOverlayFilters({ itemTypes: ['future'] }).itemTypes, []);
});

test('filtering precedes the visible cap and Friendly/Raw select identical grouped purchase evidence', () => {
  const timestamp = second => new Date(Date.parse('2026-10-29T17:02:00.000Z') + second * 1000).toISOString();
  const buy = (second, item) => `<${timestamp(second)}> [Notice] <CEntityComponentShopUIProvider::SendShopBuyRequest> Sending SShopBuyRequest - playerId[SYNTH_PLAYER] shopId[SYNTH_SHOP] shopName[SYNTH_SHOP] kioskId[SYNTH_KIOSK] itemName[${item}] quantity[1] client_price[100.000000] [Shops]\r\n`;
  const response = `<${timestamp(1)}> [Notice] <CEntityComponentShopUIProvider::RmShopFlowResponse> Received ShopFlowResponse - playerId[SYNTH_PLAYER] shopId[SYNTH_SHOP] shopName[SYNTH_SHOP] kioskId[SYNTH_KIOSK] result[Success] type[Buying] kioskState[BuyRequestProcessing] [Shops]\r\n`;
  const request = buy(0, 'klwe_lmg_energy_01_mag');
  const text = request + response + Array.from({ length: 100 }, (_, index) => buy(index + 2, 'crlf_consumable_healing_01')).join('');
  const parsed = parseRuntimeLogText(text, { sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log', gameBuild: '4.10.197.2878', releaseChannel: 'LIVE' });
  const options = { events: parsed.events, environmentKey: parsed.environment.environmentKey, since: timestamp(0), monitoring: true, evidence: collectRuntimeEvidence(text, parsed.events) };
  assert.equal(createOverlayEventFeed(options).events.length, 80);
  const filters = { actions: ['purchase'], itemTypes: ['ammunition'] };
  const friendly = createOverlayEventFeed({ ...options, filters });
  const raw = createOverlayEventFeed({ ...options, filters, displayMode: 'raw' });
  assert.equal(friendly.events.length, 1);
  assert.equal(friendly.events[0].classification.itemType, 'ammunition');
  assert.equal(friendly.events[0].evidenceEventIds.length, 2);
  assert.equal(raw.events[0].id, friendly.events[0].id);
  assert.deepEqual(raw.events[0].rawEvidence.messages, [request, response]);
  assert.equal(createOverlayEventFeed({ ...options, filters: { categories: ['party'], itemTypes: ['ammunition'] } }).matchingCount, 0);
});
