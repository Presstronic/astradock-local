const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRuntimeLogText } = require('../src/runtimeLogParserEngine');
const { createOverlayEventFeed } = require('../src/overlayEventFeed');
const { collectRuntimeEvidence, MAX_CACHE_BYTES, MAX_RECORD_BYTES } = require('../src/runtimeEvidenceCache');
const { formatOverlayMessage, itemName } = require('../src/overlayMessages');

const options = { sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log', gameBuild: '4.10.197.2878', releaseChannel: 'LIVE' };
function buy(second = 1, quantity = 5, item = 'crlf_consumable_healing_01', player = 'SYNTH_PLAYER', kiosk = 'SYNTH_KIOSK') {
  return `<2026-10-29T17:02:${String(second).padStart(2, '0')}.000Z> [Notice] <CEntityComponentShopUIProvider::SendShopBuyRequest> Sending SShopBuyRequest - playerId[${player}] shopId[SYNTH_SHOP_ID] shopName[SYNTH_SHOP] kioskId[${kiosk}] itemName[${item}] quantity[${quantity}] client_price[1195.000000]  [Shops]\r\n`;
}
function response(second = 2, result = 'Success', player = 'SYNTH_PLAYER', kiosk = 'SYNTH_KIOSK') {
  return `<2026-10-29T17:02:${String(second).padStart(2, '0')}.000Z> [Notice] <CEntityComponentShopUIProvider::RmShopFlowResponse> Received ShopFlowResponse - playerId[${player}] shopId[SYNTH_SHOP_ID] shopName[SYNTH_SHOP] kioskId[${kiosk}] result[${result}] type[Buying] kioskState[BuyRequestProcessing] [Shops]\r\n`;
}
function feed(text, extra = {}) {
  const parsed = parseRuntimeLogText(text, options);
  return createOverlayEventFeed({ events: parsed.events, environmentKey: parsed.environment.environmentKey,
    since: '2026-10-29T17:02:00Z', monitoring: true, evidence: collectRuntimeEvidence(text, parsed.events), ...extra });
}

test('one purchase template substitutes count/name with singular, plural and unknown-name fallback', () => {
  assert.equal(formatOverlayMessage('purchaseSucceeded', { count: 5, item: itemName('crlf_consumable_healing_01', 5) }), '5\u00d7 MedPens purchased');
  assert.equal(itemName('crlf_consumable_healing_01', 1), 'MedPen');
  assert.equal(itemName('SYNTH_UNKNOWN_ITEM', 5), 'SYNTH_UNKNOWN_ITEM');
  assert.equal(itemName('constructor'), 'constructor');
  assert.throws(() => formatOverlayMessage('constructor'), TypeError);
  assert.throws(() => formatOverlayMessage('purchaseSucceeded', { count: 5 }), TypeError);
});

test('a request plus a matching success becomes one friendly row with both evidence IDs', () => {
  const result = feed(buy() + response());
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].summary, '5\u00d7 MedPens purchased');
  assert.equal(result.events[0].provenance, 'inferred');
  assert.equal(result.events[0].evidenceEventIds.length, 2);
  assert.match(result.events[0].evidenceNote, /payment, delivery, and price basis are unverified/);
  assert.equal(result.events[0].rawEvidence, undefined);
  assert.equal(JSON.stringify(result).includes('playerId['), false);
});

test('raw mode returns the untouched request and response, including spacing and CRLF', () => {
  const request = buy();
  const reply = response();
  const raw = feed(request + reply, { displayMode: 'raw' });
  assert.equal(raw.displayMode, 'raw');
  assert.equal(raw.events[0].rawEvidence.status, 'available');
  assert.deepEqual(raw.events[0].rawEvidence.messages, [request, reply]);
  assert.equal(raw.events[0].id, feed(request + reply).events[0].id);
});

test('pending, failed, late, foreign-player and foreign-kiosk cases do not invent a successful purchase', () => {
  assert.equal(feed(buy()).events[0].summary, '5\u00d7 MedPens purchase requested');
  assert.equal(feed(buy() + response(2, 'Failed')).events[0].summary, '5\u00d7 MedPens purchase failed');
  for (const input of [buy() + response(20), buy() + response(2, 'Success', 'SYNTH_OTHER_PLAYER'),
    buy() + response(2, 'Success', 'SYNTH_PLAYER', 'SYNTH_OTHER_KIOSK'), buy() + response(2, 'Pending')]) {
    const result = feed(input);
    assert.equal(result.events.length, 2);
    assert.ok(result.events.every(event => !event.summary.endsWith(' purchased')));
  }
});

test('overlapping requests remain unpaired; an explicit shared request ID can resolve overlap', () => {
  const first = buy(1);
  const second = buy(2, 2, 'SYNTH_OTHER_ITEM');
  const reply = response(3);
  assert.equal(feed(first + second + reply).events.length, 3);
  const exact = feed(first.replace('Sending SShopBuyRequest', 'requestId[SYNTH_REQ_1] Sending SShopBuyRequest')
    + second.replace('Sending SShopBuyRequest', 'requestId[SYNTH_REQ_2] Sending SShopBuyRequest')
    + reply.replace('Received ShopFlowResponse', 'requestId[SYNTH_REQ_1] Received ShopFlowResponse'));
  assert.equal(exact.events.length, 2);
  assert.ok(exact.events.some(event => event.summary === '5\u00d7 MedPens purchased'));
});

test('duplicate canonical delivery does not duplicate a friendly purchase', () => {
  const parsed = parseRuntimeLogText(buy() + response(), options);
  const result = createOverlayEventFeed({ events: [...parsed.events, ...parsed.events], environmentKey: parsed.environment.environmentKey,
    since: '2026-10-29T17:02:00Z' });
  assert.equal(result.events.length, 1);
});

test('missing or oversized raw evidence is explicit and is never reconstructed from summaries', () => {
  const parsed = parseRuntimeLogText(buy() + response(), options);
  const common = { events: parsed.events, environmentKey: parsed.environment.environmentKey, since: '2026-10-29T17:02:00Z', displayMode: 'raw' };
  const missing = createOverlayEventFeed(common).events[0].rawEvidence;
  assert.equal(missing.status, 'unavailable');
  assert.deepEqual(missing.messages, []);
  const evidence = new Map([[parsed.events[0].eventId, buy()], [parsed.events[1].eventId, 'X'.repeat(MAX_RECORD_BYTES + 1)]]);
  const partial = createOverlayEventFeed({ ...common, evidence }).events[0].rawEvidence;
  assert.equal(partial.status, 'partial');
  assert.deepEqual(partial.messages, [buy()]);
});

test('the memory cache honors byte coordinates, continuation text, byte budget and decoding limits', () => {
  const record = buy() + '\tunchanged continuation  <tag>\r\n';
  const text = record + response();
  const parsed = parseRuntimeLogText(text, options);
  const evidence = collectRuntimeEvidence(text, parsed.events);
  assert.equal(evidence.get(parsed.events[0].eventId), record);
  assert.ok([...evidence.values()].reduce((sum, value) => sum + Buffer.byteLength(value), 0) <= MAX_CACHE_BYTES);
  const decoded = buy().replace('Sending', 'Sending\ufffd');
  assert.equal(collectRuntimeEvidence(decoded, parseRuntimeLogText(decoded, options).events).size, 0);
  const offset = Buffer.byteLength(buy());
  const moved = parseRuntimeLogText(response(), { ...options, evidenceCoordinates: 'byte', framer: { sourceByteOffset: offset } });
  assert.equal(collectRuntimeEvidence(response(), moved.events, offset).get(moved.events[0].eventId), response());
});
