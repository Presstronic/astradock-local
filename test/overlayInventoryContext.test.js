const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseRuntimeLogText } = require('../src/runtimeLogParserEngine');
const { parseLogFile } = require('../src/logParser');
const { collectOverlayInventoryContext, MAX_PENDING_REQUESTS } = require('../src/overlayInventoryContext');
const { collectRuntimeEvidence } = require('../src/runtimeEvidenceCache');
const { createOverlayEventFeed, isGameplayEvent } = require('../src/overlayEventFeed');

const options = { sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/PTU/Game.log',
  releaseChannel: 'PTU', gameBuild: '4.10.199.13454', branch: 'sc-alpha-4.10.2' };
const since = '2026-11-02T17:00:00Z';
const fixture = path.join(__dirname, 'fixtures/runtime-log/ptu/4.10-pub/sc-4.10-ptu/captured/inventory-item-context.observed');
function line(second, marker, message) { return `<2026-11-02T17:02:${String(second).padStart(2, '0')}.000Z> [Notice] <${marker}> ${message}\r\n`; }
function request(second = 1, id = '1', item = 'crlf_consumable_healing_01', player = 'SYNTH_PLAYER', operation = 'Interaction') {
  return line(second, 'Add Inventory Management Move', `New Request[${id}] Player[${player}] Type[${operation}] ItemClass[${item}]`);
}
function queued(second = 2, id = '1', item = 'crlf_consumable_healing_01', quantity = 2, player = 'SYNTH_PLAYER') {
  return line(second, 'Inventory Mgmt Request Queued', `Queued Request[${id}] Type[Interaction] for '${player}' [SYNTH_ACTOR] Source[${item}] amount[${quantity}] Target[NULL] amount[0]`);
}
function complete(second = 3, id = '1', result = 'Succeed', player = 'SYNTH_PLAYER', operation = 'Interaction') {
  return line(second, 'Player Inventory Request Complete', `Request[${id}] for '${player}' [SYNTH_ACTOR] Type[${operation}] Result[${result}] Item[SYNTH_ITEM]`);
}
function inspect(text, parseOptions = options) {
  const parsed = parseRuntimeLogText(text, parseOptions);
  const presentation = collectOverlayInventoryContext(text, parsed.events);
  const evidence = collectRuntimeEvidence(text, [...parsed.events.filter(isGameplayEvent), ...presentation.evidenceEvents]);
  const feed = extra => createOverlayEventFeed({ events: parsed.events, since, environmentKey: parsed.environment.environmentKey,
    inventoryContexts: presentation.contexts, evidence, ...extra });
  return { parsed, presentation, evidence, feed };
}

test('reviewed PTU item context names MedPen/undersuit without changing canonical completion payloads', () => {
  const text = fs.readFileSync(`${fixture}.log`, 'utf8');
  const manifest = JSON.parse(fs.readFileSync(`${fixture}.manifest.json`, 'utf8'));
  const { parsed, presentation, feed } = inspect(text);
  assert.deepEqual(parsed.events.map(event => event.payload), manifest.expectedCanonicalEvents.map(event => event.payload));
  assert.equal(presentation.contexts.size, 2);
  assert.deepEqual(feed().events.map(event => event.summary), ['Inventory update completed: 1\u00d7 Explorer undersuit', 'Inventory update completed: MedPen']);
  assert.ok(feed().events.every(event => event.provenance === 'inferred' && /Item association is inferred/.test(event.evidenceNote)));
  assert.ok(feed().events.every(event => event.confidence === 'medium'));
  assert.equal(parsed.events.filter(event => event.payload.itemClass).length, 0, 'presentation must not strengthen canonical completion facts');
});

test('request quantities and item filters apply to the enriched result, while Raw contains exact contributing source records', () => {
  const initial = request(); const queue = queued(); const result = complete();
  const { feed } = inspect(initial + queue + result);
  const friendly = feed({ filters: { itemTypes: ['medical'] } });
  const raw = feed({ displayMode: 'raw', filters: { itemTypes: ['medical'] } });
  assert.equal(friendly.events.length, 1);
  assert.equal(friendly.events[0].summary, 'Inventory update completed: 2\u00d7 MedPens');
  assert.deepEqual(raw.events.map(row => row.id), friendly.events.map(row => row.id));
  assert.deepEqual(raw.events[0].rawEvidence.messages, [initial, queue, result]);
  assert.equal(raw.events[0].rawEvidence.status, 'available');
  assert.equal(friendly.events[0].rawEvidence, undefined);
  assert.equal(feed({ filters: { itemTypes: ['ammunition'] } }).events.length, 0);
  assert.equal(feed({ environmentKey: 'LIVE::SYNTH' }).events.length, 0);
  assert.doesNotMatch(JSON.stringify(friendly), /SYNTH_PLAYER|SYNTH_ACTOR|inventory_context_/);
  assert.match(friendly.events[0].evidenceNote, /not an independent delivered-count measurement/);
});

test('missing, stale, future, foreign-player/request and ambiguous item context remains explicitly unknown', () => {
  const cases = [complete(), request() + complete(20), complete(1) + request(2),
    request(1, '2') + complete(), request(1, '1', 'SYNTH_ITEM', 'SYNTH_OTHER') + complete(),
    request() + request(2, '1', 'SYNTH_OTHER_ITEM') + complete(), request() + queued(2, '1', 'SYNTH_OTHER_ITEM') + complete(),
    request() + queued() + queued(2, '1', 'crlf_consumable_healing_01', 3) + complete(),
    request() + queued().replace('Type[Interaction]', 'Type[QueryInventory]') + complete(),
    request(1, '1', 'Default') + complete(), request(1, '1', 'PRIVATE_ACCOUNT_123456789') + complete(),
    request(1, '1', 'crlf_consumable_healing_01', 'SYNTH_PLAYER', 'Store') + complete()];
  for (const text of cases) {
    const { presentation, feed } = inspect(text);
    assert.equal(presentation.contexts.size, 0, text);
    for (const event of feed().events) {
      assert.equal(event.summary, 'Inventory action completed (item unknown)');
      assert.match(event.evidenceNote, /no unambiguous matching item request/);
    }
  }
});

test('supported LIVE move-to-Interaction vocabulary keeps item context without borrowing PTU support', () => {
  const text = request(1, '1', 'Drink_bottle_cruz_01_lux_a', 'SYNTH_PLAYER', 'Move')
    + queued(2, '1', 'Drink_bottle_cruz_01_lux_a', 2) + complete();
  const live = inspect(text, { ...options, releaseChannel: 'LIVE', gameBuild: '4.10.197.2878',
    sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/Game.log' });
  assert.ok(live.feed().events.some(row => row.summary === 'Inventory update completed: 2\u00d7 Cruz bottles'));
  assert.equal(inspect(text).presentation.contexts.size, 0, 'unreviewed PTU Move context stays unavailable');
});

test('session, file metadata and reversed-clock boundaries prevent reused request IDs from borrowing an item', () => {
  for (const marker of ['<Init> Tag[PTU]', '<Join PU> shard[SYNTH_SHARD]', '<SystemQuit>',
    '<Channel Disconnected>', '<Channel Created> frontend', 'FileVersion: 4.10.199.13454']) {
    assert.equal(inspect(request() + `<2026-11-02T17:02:02.000Z> ${marker}\n` + complete()).presentation.contexts.size, 0, marker);
  }
  assert.equal(inspect(request(4) + complete(3)).presentation.contexts.size, 0);
  assert.equal(inspect(request() + 'FileVersion: 4.10.199.13454\n' + complete()).presentation.contexts.size, 0);
  assert.equal(inspect(request() + '<invalid-time> <Add Inventory Management Move> Request[1]\n' + complete()).presentation.contexts.size, 0);
  const text = request() + complete() + request(4, '1', 'SYNTH_SECOND_ITEM') + complete(5);
  const { feed } = inspect(text);
  assert.deepEqual(feed().events.map(row => row.summary), ['Inventory update completed: SYNTH_SECOND_ITEM', 'Inventory update completed: MedPen']);
});

test('unknown quantities, unknown classes, reported failure and missing raw context never fabricate values', () => {
  assert.equal(inspect(request() + complete()).feed().events[0].summary, 'Inventory update completed: MedPen');
  assert.equal(inspect(request() + queued(2, '1', 'NULL', 0) + complete()).feed().events[0].summary, 'Inventory update completed: MedPen');
  assert.equal(inspect(request(1, '1', 'SYNTH_NEW_ITEM') + complete()).feed().events[0].summary, 'Inventory update completed: SYNTH_NEW_ITEM');
  assert.equal(inspect(request() + complete(3, '1', 'Failed')).feed().events[0].summary, 'Inventory update failed: MedPen');
  const { feed, evidence, presentation } = inspect(request() + complete());
  evidence.delete(presentation.evidenceEvents[0].eventId);
  const raw = feed({ displayMode: 'raw' }).events[0].rawEvidence;
  assert.equal(raw.status, 'partial');
  assert.deepEqual(raw.messages, [complete()]);
});

test('context work remains bounded and byte offsets preserve exact Raw evidence when a capture window moves', () => {
  let text = '';
  for (let id = 1; id <= MAX_PENDING_REQUESTS + 1; id++) text += request(1, String(id));
  text += complete();
  assert.equal(inspect(text).presentation.contexts.size, 0, 'oldest pending request is evicted');
  const recent = request() + queued() + complete();
  const base = 1234;
  const parsed = parseRuntimeLogText(recent, { ...options, evidenceCoordinates: 'byte', framer: { sourceByteOffset: base } });
  const presentation = collectOverlayInventoryContext(recent, parsed.events, base);
  const evidence = collectRuntimeEvidence(recent, [...parsed.events, ...presentation.evidenceEvents], base);
  const feed = createOverlayEventFeed({ events: parsed.events, since, environmentKey: parsed.environment.environmentKey,
    inventoryContexts: presentation.contexts, evidence, displayMode: 'raw' });
  assert.deepEqual(feed.events[0].rawEvidence.messages, [request(), queued(), complete()]);
});

test('read-time context stays out of normal scan results unless explicitly requested and never mutates canonical payloads', async () => {
  const normal = await parseLogFile(`${fixture}.log`, options);
  const local = await parseLogFile(`${fixture}.log`, { ...options, collectEvidenceFor: isGameplayEvent });
  assert.equal(normal.overlayInventoryContexts, undefined);
  assert.equal(local.overlayInventoryContexts.size, 2);
  // Separate reads have separate ingestion instants; immutable canonical content is unchanged.
  const immutable = events => events.map(({ ingestedAt, ...event }) => event);
  assert.deepEqual(immutable(local.runtimeEvents), immutable(normal.runtimeEvents));
  assert.ok(local.overlayEvidence.size > local.runtimeEvents.filter(isGameplayEvent).length);
});
