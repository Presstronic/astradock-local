const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { readRuntimeCaptureWindow } = require('../src/runtimeCaptureWindow');
const { parseLogFile } = require('../src/logParser');
const { parseRuntimeLogText } = require('../src/runtimeLogParserEngine');

test('capture window reads a small suffix plus metadata instead of loading old history', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'astradock-window-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const file = path.join(directory, 'Game.log');
  const old = '<2026-10-29T15:00:00Z> old historical record\n';
  const header = '<2026-10-29T15:00:00Z> FileVersion: 4.10.197.2878\n<2026-10-29T15:00:00Z> Branch: sc-alpha-4.10.2\n';
  const prefix = header + old.repeat(50000);
  const recent = '<2026-10-29T17:02:00Z> [Notice] <Close Inventory Grid> Player[SYNTH_PLAYER] closing inventory in progress...\n';
  await fs.writeFile(file, prefix + recent);
  const since = '2026-10-29T17:00:00Z';
  const capture = await readRuntimeCaptureWindow(file, { since });
  assert.equal(capture.text, recent);
  assert.equal(capture.gameBuild, '4.10.197.2878');
  assert.equal(capture.sourceByteOffset, Buffer.byteLength(prefix));
  assert.ok(capture.bytesRead < Buffer.byteLength(prefix) / 4);
  const scan = await parseLogFile(file, { captureSince: since, releaseChannel: 'LIVE' });
  assert.equal(scan.runtimeEvents.length, 1);
  assert.equal(scan.runtimeEvents[0].payload.signalId, 'INV-09');
  assert.equal(scan.runtimeEvents[0].ordering.sourceByteOffset, Buffer.byteLength(prefix));
  assert.equal(scan.captureWindow.lineNumbers, 'capture_relative');
  assert.equal((await readRuntimeCaptureWindow(file, { since: '2026-10-30T00:00:00Z' })).text, '');
});

test('capture windows reject invalid boundaries and honor cancellation', async () => {
  await assert.rejects(readRuntimeCaptureWindow('unopened.log', { since: 'invalid' }), TypeError);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readRuntimeCaptureWindow('unopened.log', { since: '2026-10-29T17:00:00Z', signal: controller.signal }), { name: 'AbortError' });
});

test('byte-addressed evidence keeps the same event ID when a bounded window moves', () => {
  const older = '<2026-10-29T17:01:00Z> [Notice] <Close Inventory Grid> Player[SYNTH_PLAYER] closing inventory in progress...\n';
  const newer = '<2026-10-29T17:02:00Z> [Notice] <Close Inventory Grid> Player[SYNTH_PLAYER] closing inventory in progress...\n';
  const options = { sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log', gameBuild: '4.10.197.2878',
    releaseChannel: 'LIVE', evidenceCoordinates: 'byte' };
  const full = parseRuntimeLogText(older + newer, options);
  const moved = parseRuntimeLogText(newer, { ...options, framer: { sourceByteOffset: Buffer.byteLength(older) } });
  assert.equal(full.events[1].eventId, moved.events[0].eventId);
  assert.equal(moved.events[0].evidenceReference.lineRange, undefined);
  assert.equal(moved.events[0].evidenceReference.sourceByteOffset, Buffer.byteLength(older));
});
