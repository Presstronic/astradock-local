const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseRuntimeLogText } = require('../src/runtimeLogParserEngine');
const { createOverlayEventFeed } = require('../src/overlayEventFeed');

const text = fs.readFileSync(path.join(__dirname, 'fixtures/runtime-log/live/4.10-pub/sc-4.10-live/captured/signals.observed.log'), 'utf8');
const parsed = parseRuntimeLogText(text, { sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log', releaseChannel: 'LIVE' });
const options = { events: parsed.events, environmentKey: parsed.environment.environmentKey, environment: 'LIVE', monitoring: true,
  since: '2026-10-29T16:47:10Z' };

test('overlay includes only the curated gameplay stages, never platform/system/debug records', () => {
  const feed = createOverlayEventFeed(options);
  assert.ok(feed.events.length > 0);
  assert.ok(feed.events.every(event => event.kind === 'action'));
  assert.doesNotMatch(JSON.stringify(feed), /Platform|XML|reference resolved|desynchronization|Service channel|loadout|QueryInventory/i);
  assert.ok(feed.events.some(event => event.summary.includes('purchased')));
  assert.ok(feed.events.some(event => event.summary === 'Item drop requested'));
  assert.ok(feed.events.every((event, index) => index === 0 || Date.parse(event.timestamp) <= Date.parse(feed.events[index - 1].timestamp)));
});

test('application start, environment and deduplication restrict the passive feed', () => {
  const feed = createOverlayEventFeed({ ...options, events: [...parsed.events, ...parsed.events], since: '2026-10-29T17:01:44Z' });
  assert.ok(feed.events.length > 0);
  assert.equal(new Set(feed.events.map(event => event.id)).size, feed.events.length);
  assert.ok(feed.events.every(event => Date.parse(event.timestamp) >= Date.parse('2026-10-29T17:01:44Z')));
  assert.equal(createOverlayEventFeed({ ...options, since: '2026-10-30T00:00:00Z' }).events.length, 0);
  assert.equal(createOverlayEventFeed({ ...options, environmentKey: 'other' }).events.length, 0);
  assert.equal(createOverlayEventFeed({ ...options, monitoring: false }).state, 'waiting');
});

test('overlay preload has no capture, source, settings, exporter, open or publish capabilities', async () => {
  const calls = [];
  let exposed;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/preload.js'), 'utf8'), {
    process: { argv: ['electron', '--astradock-overlay'] },
    require: name => {
      assert.equal(name, 'electron');
      return { contextBridge: { exposeInMainWorld: (_name, api) => { exposed = api; } },
        ipcRenderer: { invoke: async channel => { calls.push(channel); return {}; }, on() {}, removeListener() {} } };
    }
  });
  assert.deepEqual(Object.keys(exposed).sort(), ['overlay', 'version']);
  assert.deepEqual(Object.keys(exposed.overlay).sort(), ['close', 'getPreferences', 'subscribeFeed', 'updatePreferences']);
  assert.equal(calls.length, 0);
  const unsubscribe = exposed.overlay.subscribeFeed(() => {});
  await Promise.resolve();
  unsubscribe();
  assert.deepEqual(calls, ['astradock:v1:overlay:feed-subscribe']);
});
