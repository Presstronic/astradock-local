const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const { CHANNELS } = require('../src/ipcBoundary');
const { validateLogSource } = require('../src/sourceDiscovery');

// Exercise the real main-process command handlers without launching Electron,
// accessing real player logs, starting network services, or opening a database.
async function harness(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'astradock-main-scope-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const filename = path.resolve(__dirname, '../src/main.js');
  const actualRequire = createRequire(filename);
  const handlers = new Map();
  const changes = [];
  const saved = [];
  const tailers = [];
  const windows = [];
  const webContents = { id: 1, isDestroyed: () => false, getURL: () => 'file:///renderer.html' };
  class Window extends EventEmitter {
    constructor() { super(); windows.push(this); this.webContents = new EventEmitter(); this.webContents.setWindowOpenHandler = () => {}; this.webContents.send = () => {}; }
    loadFile() {}
    isDestroyed() { return false; }
  }
  class Tailer {
    constructor(file, options) { this.file = file; this.options = options; this.starts = 0; this.stops = 0; tailers.push(this); }
    async start() { this.starts += 1; }
    async stop() { this.stops += 1; }
    getHealth() { return { status: this.stops ? 'stopped' : 'monitoring', available: true }; }
    getCheckpoint() { return null; }
  }
  let parse = actualRequire('./logParser').parseLogFile;
  const overrides = {
    electron: {
      app: { whenReady: () => new Promise(() => {}), on() {}, getPath: () => directory },
      BrowserWindow: Window, ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) }
    },
    './electronSecurity': { configureChromiumRuntimeFlags() {}, installAppSecurityPolicy() {}, getRendererUrl: () => 'file:///renderer.html', isAllowedRendererUrl: () => true },
    './eventOverlayWindow': { ...actualRequire('./eventOverlayWindow'), installEventOverlayVisibility() {}, showEventOverlay() {} },
    './runtimeLogTailer': { RuntimeLogTailer: Tailer },
    './logParser': { parseLogFile: (...args) => parse(...args) },
    './subscriptionHub': { SubscriptionHub: class { publish(change) { changes.push(change); } getStats() { return { sequence: changes.length }; } } }
  };
  const context = vm.createContext({
    require: name => overrides[name] || actualRequire(name), module: { exports: {} }, __dirname: path.dirname(filename),
    process: { ...process, on() {} }, console, Buffer, URL, setTimeout, clearTimeout, setInterval, clearInterval
  });
  const source = await fs.readFile(filename, 'utf8');
  vm.runInContext(source + `\nmodule.exports = { activateSource, scanSource, startMonitor, stopMonitor, getMonitorSnapshot, getOverlayFeed, rememberSource,
    initializeTest() { mainWindow = { webContents: testWebContents, isDestroyed: () => false }; eventStore = { append(events) { testSaved.push(...events); return {}; }, getHealth() { return { status: 'ready' }; } }; } };`, context);
  context.testWebContents = webContents;
  context.testSaved = saved;
  const api = context.module.exports;
  api.initializeTest();
  t.after(() => api.stopMonitor('test_complete'));
  return {
    api, changes, saved, tailers, windows,
    setParser(next) { parse = next; },
    async invoke(channel, data = {}) { return handlers.get(channel)({ sender: webContents, senderFrame: { url: 'file:///renderer.html' } }, { data }); },
    subscribeOverlay() { return handlers.get('astradock:v1:overlay:feed-subscribe')({ sender: windows[0].webContents, senderFrame: { url: 'file:///renderer.html?overlay=1' } }); },
    async source(channel) {
      const log = path.join(directory, 'StarCitizen', channel, 'Game.log');
      await fs.mkdir(path.dirname(log), { recursive: true });
      await fs.writeFile(log, `<2000-01-01T00:00:00Z> <Init> Environment[PUB] Tag[${channel}]\nFileVersion: 4.10.197.2878\n`);
      const source = await validateLogSource(log);
      api.rememberSource(source);
      return source;
    }
  };
}

test('switching LIVE to preview stops capture, clears view/overlay/checkpoint, preserves stored data and returns to LIVE', async t => {
  const h = await harness(t);
  const live = await h.source('LIVE');
  const ptu = await h.source('PTU');
  await h.api.activateSource(live);
  await h.api.startMonitor(live);
  await h.api.scanSource(live);
  assert.ok(h.api.getMonitorSnapshot().scan);
  h.saved.push({ marker: 'retained LIVE data' });
  const selected = await h.invoke(CHANNELS.sourceSelect, { sourceId: ptu.sourceId });
  assert.equal(selected.ok, true);
  assert.equal(selected.data.selected, true);
  assert.equal(h.tailers[0].stops, 1);
  assert.equal(h.api.getMonitorSnapshot().scan, null);
  assert.equal(h.api.getMonitorSnapshot().source.channelHint, 'PTU');
  assert.equal(h.api.getMonitorSnapshot().monitor.checkpoint, null);
  assert.equal(h.api.getMonitorSnapshot().monitor.tailer, null);
  assert.equal(h.api.getOverlayFeed().environment, 'PTU');
  assert.equal(h.api.getOverlayFeed().events.length, 0);
  assert.equal(h.saved.at(-1).marker, 'retained LIVE data');
  const stale = await h.invoke(CHANNELS.monitorScan, { sourceId: live.sourceId });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, 'source_not_approved');
  await h.invoke(CHANNELS.sourceSelect, { sourceId: live.sourceId });
  assert.equal(h.api.getMonitorSnapshot().source.channelHint, 'LIVE');
  assert.equal(h.api.getMonitorSnapshot().monitor.active, false);
});

test('an in-flight old-environment scan cannot persist or repopulate a newly selected environment', async t => {
  const h = await harness(t);
  const live = await h.source('LIVE');
  const ptu = await h.source('PTU');
  await h.api.activateSource(live);
  let finish;
  h.setParser(() => new Promise(resolve => { finish = resolve; }));
  const pending = h.api.scanSource(live);
  const rejected = assert.rejects(pending, { code: 'source_changed' });
  await h.api.activateSource(ptu);
  finish({ runtimeEvents: [{ marker: 'must not persist' }] });
  await rejected;
  assert.equal(h.saved.length, 0);
  assert.equal(h.api.getMonitorSnapshot().scan, null);
});

test('mixed or changed environment results are rejected before persistence', async t => {
  const h = await harness(t);
  const live = await h.source('LIVE');
  await h.api.activateSource(live);
  h.setParser(async () => ({ environment: { releaseChannel: 'PTU' }, runtimeEvents: [{ marker: 'must not persist' }] }));
  await assert.rejects(h.api.scanSource(live), { code: 'environment_mismatch' });
  assert.equal(h.saved.length, 0);
  assert.equal(h.api.getMonitorSnapshot().scan, null);
});

test('transient inventory presentation context never crosses the main scan or snapshot DTO', async t => {
  const h = await harness(t);
  const ptu = await h.source('PTU');
  await h.api.activateSource(ptu);
  h.setParser(async () => ({ environment: { releaseChannel: 'PTU' }, runtimeEvents: [],
    overlayInventoryContexts: new Map([['SYNTH_EVENT', { itemClass: 'SYNTH_ITEM', evidenceKeys: ['SYNTH_PRIVATE_CONTEXT'] }]]) }));
  const response = await h.invoke(CHANNELS.monitorScan, { sourceId: ptu.sourceId });
  assert.equal(response.ok, true);
  assert.equal(Object.hasOwn(response.data, 'overlayInventoryContexts'), false);
  assert.equal(Object.hasOwn(h.api.getMonitorSnapshot().scan, 'overlayInventoryContexts'), false);
  assert.equal(h.saved.length, 0);
});

test('main-process overlay feed retains PTU parser rejection details while file follow runs', async t => {
  const h = await harness(t);
  const ptu = await h.source('PTU');
  await h.api.activateSource(ptu);
  await h.api.startMonitor(ptu);
  h.setParser(async () => ({ environment: { releaseChannel: 'PTU' }, runtimeEvents: [],
    parserCompatibility: { status: 'unverified_build', gameBuild: '4.10.199.13455' } }));
  await h.api.scanSource(ptu);
  const feed = h.api.getOverlayFeed();
  assert.equal(feed.state, 'unverified_build');
  assert.match(feed.statusMessage, /Following PTU log.*4\.10\.199\.13455/);
  assert.equal(h.api.getMonitorSnapshot().monitor.active, true);
});

test('Open event overlay starts follow once, keeps an existing monitor and cannot be triggered by overlay subscription', async t => {
  const h = await harness(t);
  const live = await h.source('LIVE');
  await h.api.activateSource(live);
  await Promise.all([h.invoke('astradock:v1:overlay:open'), h.invoke('astradock:v1:overlay:open')]);
  assert.equal(h.api.getMonitorSnapshot().monitor.active, true);
  assert.equal(h.tailers.length, 1);
  assert.equal(h.tailers[0].starts, 1);
  assert.equal(h.windows.length, 1);
  await h.invoke('astradock:v1:overlay:open');
  assert.equal(h.tailers.length, 1);
  assert.equal(h.tailers[0].stops, 0);
  assert.equal(h.windows.length, 1);
  await assert.rejects(h.invoke('astradock:v1:overlay:feed-subscribe'), { code: 'invalid_sender' });
  assert.equal(h.tailers.length, 1);
  await h.api.stopMonitor('user_pause');
  assert.equal(h.subscribeOverlay().state, 'waiting');
  assert.equal(h.api.getMonitorSnapshot().monitor.active, false);
  assert.equal(h.tailers.length, 1);
});

test('Open event overlay refuses a missing source and rolls back follow when initial capture fails', async t => {
  const h = await harness(t);
  await assert.rejects(h.invoke('astradock:v1:overlay:open'), { code: 'source_not_found' });
  assert.equal(h.windows.length, 0);
  const live = await h.source('LIVE');
  await h.api.activateSource(live);
  h.setParser(async () => { throw Object.assign(new Error('Synthetic read failure'), { code: 'EACCES' }); });
  await assert.rejects(h.invoke('astradock:v1:overlay:open'), { code: 'EACCES' });
  assert.equal(h.api.getMonitorSnapshot().monitor.active, false);
  assert.equal(h.tailers[0].stops, 1);
  assert.equal(h.windows.length, 0);
});
