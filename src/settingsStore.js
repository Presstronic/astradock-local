const fs = require('node:fs/promises');
const path = require('node:path');

const SETTINGS_VERSION = 1;
const DEFAULT_SETTINGS = Object.freeze({
  version: SETTINGS_VERSION,
  theme: 'dark',
  username: '',
  userId: ''
});

async function loadRendererSettings(settingsPath) {
  try {
    const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
    return normalizeRendererSettings(parsed);
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return { ...DEFAULT_SETTINGS };
    throw error;
  }
}

async function updateRendererSettings(settingsPath, patch, options = {}) {
  const current = await loadRendererSettings(settingsPath);
  const next = normalizeRendererSettings({
    ...current,
    ...patch,
    savedAt: options.now || new Date().toISOString()
  });
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  const tempPath = `${settingsPath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tempPath, settingsPath);
  return next;
}

function normalizeRendererSettings(value = {}) {
  return {
    version: SETTINGS_VERSION,
    theme: value.theme === 'light' ? 'light' : 'dark',
    username: normalizeText(value.username, 64),
    userId: normalizeText(value.userId, 128),
    savedAt: typeof value.savedAt === 'string' ? value.savedAt : null
  };
}

function normalizeText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength);
}

module.exports = {
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
  loadRendererSettings,
  normalizeRendererSettings,
  updateRendererSettings
};
