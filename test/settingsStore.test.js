const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  DEFAULT_SETTINGS,
  loadRendererSettings,
  normalizeRendererSettings,
  updateRendererSettings
} = require('../src/settingsStore');

test('settings store persists supported local preferences and retention', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'astradock-settings-'));
  const filePath = path.join(directory, 'settings.json');
  const saved = await updateRendererSettings(filePath, {
    streamView: 'table', terminalDensity: 'relaxed', tableDrawer: 'right', retentionDays: 14
  }, { now: '2026-08-21T12:00:00.000Z' });

  assert.equal(saved.streamView, 'table');
  assert.equal(saved.retentionDays, 14);
  assert.deepEqual(await loadRendererSettings(filePath), saved);
  if (process.platform !== 'win32') assert.equal((await fs.stat(filePath)).mode & 0o777, 0o600);
});

test('invalid, unknown, and corrupt settings fall back to least-sensitive defaults', async () => {
  assert.deepEqual(normalizeRendererSettings({ retentionDays: 999, streamView: 'sql', username: 42 }), {
    ...DEFAULT_SETTINGS,
    savedAt: null
  });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'astradock-settings-'));
  const filePath = path.join(directory, 'settings.json');
  await fs.writeFile(filePath, '{broken');
  assert.deepEqual(await loadRendererSettings(filePath), { ...DEFAULT_SETTINGS });
});
