const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { RuntimeLogParserEngine, parseRuntimeLogText } = require('../src/runtimeLogParserEngine');
const { createOverlayEventFeed } = require('../src/overlayEventFeed');

const fixture = path.join(__dirname, 'fixtures/runtime-log/ptu/4.10-pub/sc-4.10-ptu/captured/inventory-completions.observed');
const text = fs.readFileSync(`${fixture}.log`, 'utf8');
const manifest = JSON.parse(fs.readFileSync(`${fixture}.manifest.json`, 'utf8'));
const options = { sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/PTU/Game.log',
  releaseChannel: 'PTU', gameBuild: '4.10.199.13454', branch: 'sc-alpha-4.10.2' };
const since = '2026-11-02T17:00:00Z';

test('reviewed PTU completion records match immutable payloads without inheriting LIVE capabilities', () => {
  const result = parseRuntimeLogText(text, options);
  assert.equal(result.parserHealth.status, 'compatible');
  assert.equal(result.selectedProfile.id, 'sc-4.10-ptu');
  assert.deepEqual(result.events.map(event => event.payload), manifest.expectedCanonicalEvents.map(event => event.payload));
  assert.equal(result.events.length, 6);
  assert.ok(result.events.every(event => event.gameChannel === 'PTU' && event.environmentKey.startsWith('PTU::')));
  const liveOnly = '<2026-11-02T17:28:00Z> [Notice] <CEntityComponentShopUIProvider::SendShopBuyRequest> itemName[SYNTH_ITEM] quantity[1] client_price[520] shopName[SYNTH_SHOP]\n';
  assert.equal(parseRuntimeLogText(liveOnly, options).events.length, 0, 'a valid LIVE marker cannot widen PTU profile scope');
});

test('PTU overlay shows non-query completion observations and keeps LIVE data separate', () => {
  const result = parseRuntimeLogText(text, options);
  const feed = createOverlayEventFeed({ events: result.events, since, environmentKey: result.environment.environmentKey,
    environment: 'PTU', monitoring: true, parserCompatibility: result.parserHealth });
  assert.equal(feed.state, 'monitoring');
  assert.equal(feed.events.length, 2);
  assert.ok(feed.events.every(event => event.summary === 'Inventory action completed'));
  const visibleOperations = feed.events.map(row => result.events.find(event => event.eventId === row.id).payload.operation).sort();
  assert.deepEqual(visibleOperations, ['Interaction', 'Store']);
  const fixtureLines = text.trimEnd().split('\n');
  const evidence = new Map(result.events.map((event, index) => [event.eventId, fixtureLines[index]]));
  const raw = createOverlayEventFeed({ events: result.events, since, environmentKey: result.environment.environmentKey,
    environment: 'PTU', monitoring: true, evidence, displayMode: 'raw' });
  assert.deepEqual(raw.events.map(row => row.id), feed.events.map(row => row.id));
  assert.ok(raw.events.every(row => row.rawEvidence.status === 'available' && row.rawEvidence.messages.length === 1));
  assert.ok(raw.events.every(row => row.rawEvidence.messages[0].includes('<Player Inventory Request Complete>')));
  assert.equal(createOverlayEventFeed({ events: result.events, since,
    environmentKey: 'LIVE::SYNTH', environment: 'LIVE', monitoring: true }).events.length, 0);
  assert.equal(createOverlayEventFeed({ events: result.events, since: '2026-11-02T18:00:00Z',
    environmentKey: result.environment.environmentKey, environment: 'PTU', monitoring: true }).events.length, 0, 'pre-launch observations remain excluded');
});

test('PTU profile preserves chunk and CRLF identities and rejects other builds/channels', () => {
  const crlf = text.replace(/\n/g, '\r\n');
  const full = parseRuntimeLogText(crlf, options);
  const engine = new RuntimeLogParserEngine(options);
  const bytes = Buffer.from(crlf);
  for (let offset = 0; offset < bytes.length; offset += 41) engine.push(bytes.subarray(offset, offset + 41));
  assert.deepEqual(engine.end().events.map(event => event.eventId), full.events.map(event => event.eventId));
  for (const variation of [{ gameBuild: '4.10.199.13455' }, { releaseChannel: 'LIVE' }, { releaseChannel: 'EPTU' },
    { releaseChannel: 'HOTFIX' }, { releaseChannel: 'TECH-PREVIEW' }, { branch: 'sc-alpha-4.11.0' }]) {
    assert.equal(parseRuntimeLogText(text, { ...options, ...variation }).events.length, 0, JSON.stringify(variation));
  }
  const invalid = '<2026-11-02T17:28:00Z> [Notice] <Player Inventory Request Complete> Request[103] Type[Store]\n';
  assert.equal(parseRuntimeLogText(invalid, options).events.length, 0, 'missing result cannot become a completion observation');
});

test('unsupported and unverified overlay builds report parser suppression separately from following the log', () => {
  for (const status of ['unsupported_profile', 'unverified_build']) {
    const feed = createOverlayEventFeed({ since, environment: 'PTU', monitoring: true,
      parserCompatibility: { status, gameBuild: '4.10.199.13455' } });
    assert.equal(feed.state, status);
    assert.match(feed.statusMessage, /Following PTU log/);
    assert.match(feed.statusMessage, /4\.10\.199\.13455/);
    assert.equal(feed.events.length, 0);
    const stopped = createOverlayEventFeed({ since, environment: 'PTU', monitoring: false,
      parserCompatibility: { status, gameBuild: '4.10.199.13455' } });
    assert.equal(stopped.state, 'waiting');
    assert.equal(stopped.statusMessage, null);
  }
});
