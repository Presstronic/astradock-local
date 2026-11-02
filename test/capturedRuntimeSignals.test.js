const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseCapturedRuntimeSignal, SIGNAL_IDS } = require('../src/capturedRuntimeSignals');
const { RuntimeLogParserEngine, parseRuntimeLogText } = require('../src/runtimeLogParserEngine');
const { parseLogFile } = require('../src/logParser');
const { createRuntimeEvent, RUNTIME_EVENT_EXAMPLES, validateRuntimeEvent } = require('../src/contracts/runtimeEvents');

const fixture = path.join(__dirname, 'fixtures/runtime-log/live/4.10-pub/sc-4.10-live/captured/signals.observed');
const text = fs.readFileSync(`${fixture}.log`, 'utf8');
const manifest = JSON.parse(fs.readFileSync(`${fixture}.manifest.json`, 'utf8'));
const options = { sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log', gameBuild: '4.10.197.2878', releaseChannel: 'LIVE' };

test('both captures replay into the complete closed signal vocabulary with immutable expected payloads', () => {
  const result = parseRuntimeLogText(text, options);
  assert.equal(result.selectedProfile.id, 'sc-4.10-live');
  assert.equal(result.events.length, 48);
  assert.deepEqual(result.events.map(event => event.payload), manifest.expectedCanonicalEvents.map(event => event.payload));
  assert.deepEqual([...new Set(result.events.map(event => event.payload.signalId))].sort(), [...SIGNAL_IDS].sort());
  assert.ok(result.events.every(event => event.provenance === 'observed' && validateRuntimeEvent(event).ok));
  const buys = result.events.filter(event => event.payload.signalId === 'SHP-01').map(event => event.payload);
  assert.deepEqual(buys.map(({ quantity, clientPrice }) => [quantity, clientPrice]), [[31, 16120], [1, 520]]);
  assert.ok(buys.every(event => event.requestId === null));
  const response = result.events.find(event => event.payload.signalId === 'SHP-02').payload;
  assert.equal(response.result, 'Success');
  assert.equal(response.kioskState, 'BuyRequestProcessing');
  assert.match(response.summary, /payment\/delivery unverified/);
});

test('chunking produces identical identities and separate repeated operations are retained', () => {
  const full = parseRuntimeLogText(text, options);
  const engine = new RuntimeLogParserEngine(options);
  const bytes = Buffer.from(text);
  for (let offset = 0; offset < bytes.length; offset += 137) engine.push(bytes.subarray(offset, offset + 137));
  assert.deepEqual(engine.end().events.map(event => event.eventId), full.events.map(event => event.eventId));
  const buy = text.split('\n').find(line => line.includes('SendShopBuyRequest'));
  const repeated = parseRuntimeLogText(`${buy}\n${buy}\n`, options);
  assert.equal(repeated.events.length, 2);
  assert.notEqual(repeated.events[0].eventId, repeated.events[1].eventId);
});

test('the renderer scan receives captured signals, including diagnostic categories', async () => {
  const scan = await parseLogFile(`${fixture}.log`, { ...options, username: 'SYNTH_PLAYER' });
  assert.equal(scan.promotedRuntimeEvents.length, 48);
  assert.ok(scan.promotedRuntimeEvents.some(event => event.payload.category === 'diagnostic'));
  const normalizedLines = new Set(scan.promotedRuntimeEvents.map(event => event.evidenceReference.lineRange.start));
  assert.ok(scan.userActivity.actions.every(action => !normalizedLines.has(action.lineNumber)));
});

test('unreviewed builds and channels cannot activate the capture profile', () => {
  const line = text.split('\n').find(line => line.includes('SendShopBuyRequest'));
  for (const variation of [{ gameBuild: '4.11.0' }, { releaseChannel: 'PTU' }]) {
    assert.equal(parseRuntimeLogText(`${line}\n`, { ...options, ...variation }).events.length, 0);
  }
});

test('malformed requests, notifications containing marker text, unobserved ports and unlogged actions do not create facts', () => {
  const malformed = [
    '<2026-10-29T17:01:43.133Z> [Notice] <CEntityComponentShopUIProvider::SendShopBuyRequest> itemName[SYNTH_ITEM] quantity[-1] client_price[520] shopName[SYNTH_SHOP]',
    '<2026-10-29T17:01:43.133Z> [Notice] <CEntityComponentShopUIProvider::SendShopBuyRequest> itemName[SYNTH_ITEM] quantity[31] client_price[NaN] shopName[SYNTH_SHOP]',
    '<2026-10-29T17:01:43.133Z> [Notice] <Add Inventory Management Move> malformed',
    '<2026-10-29T17:01:43.133Z> [Notice] <Notification> text <Inventory Request Completed> Request[1] Result[succeed]',
    '<2026-10-29T17:01:43.133Z> [Notice] <AttachmentReceived> Port[unknown_new_port]',
    '<2026-10-29T17:01:43.133Z> [Notice] <PlayerDrank> 100% to 0% then threw bottle'
  ];
  for (const line of malformed) assert.equal(parseCapturedRuntimeSignal(line), null);
  assert.equal(parseRuntimeLogText(`${malformed.join('\n')}\n`, options).events.length, 0);
});

test('captured summaries omit private identifiers, endpoints and raw context', () => {
  const line = '<2026-10-29T17:01:43.133Z> [Notice] <CEntityComponentShopUIProvider::SendShopBuyRequest> playerId[SYNTH_PRIVATE_ACCOUNT] itemName[SYNTH_ITEM] quantity[1] client_price[520] shopName[SYNTH_SHOP] endpoint[private.invalid]';
  const payload = parseCapturedRuntimeSignal(line);
  assert.ok(payload);
  assert.doesNotMatch(JSON.stringify(payload), /SYNTH_PRIVATE_ACCOUNT|private\.invalid|playerId|endpoint/);
  assert.match(payload.summary, /basis\/currency unverified/);
});

test('nullable fields are explicit and cannot weaken existing nonnullable contracts', () => {
  const example = RUNTIME_EVENT_EXAMPLES.RuntimeLogSignalObserved;
  assert.equal(validateRuntimeEvent(example).ok, true);
  const invalid = structuredClone(example);
  invalid.payload.signalId = 'OWN-01';
  assert.equal(validateRuntimeEvent(invalid).ok, false);
  const missing = structuredClone(example);
  delete missing.payload.quantity;
  assert.equal(validateRuntimeEvent(missing).ok, false);
  assert.throws(() => createRuntimeEvent({ ...RUNTIME_EVENT_EXAMPLES.ShopPurchaseRequested,
    payload: { ...RUNTIME_EVENT_EXAMPLES.ShopPurchaseRequested.payload, requestId: null } }));
});
