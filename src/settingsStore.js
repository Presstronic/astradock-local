const fs = require('node:fs/promises');
const path = require('node:path');

const SETTINGS_VERSION = 2;
const RETENTION_MIN_DAYS = 1;
const RETENTION_MAX_DAYS = 365;
const DEFAULT_SETTINGS = Object.freeze({
  version: SETTINGS_VERSION,
  theme: 'dark',
  username: '',
  userId: '',
  streamView: 'terminal',
  terminalDensity: 'compact',
  tableDensity: 'default',
  terminalDrawer: 'right',
  tableDrawer: 'bottom',
  retentionDays: 30
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
    theme: 'dark',
    username: normalizeText(value.username, 64),
    userId: normalizeText(value.userId, 128),
    streamView: value.streamView === 'table' ? 'table' : DEFAULT_SETTINGS.streamView,
    terminalDensity: normalizeChoice(value.terminalDensity, ['compact', 'default', 'relaxed'], DEFAULT_SETTINGS.terminalDensity),
    tableDensity: normalizeChoice(value.tableDensity, ['compact', 'default', 'relaxed'], DEFAULT_SETTINGS.tableDensity),
    terminalDrawer: normalizeChoice(value.terminalDrawer, ['right', 'bottom'], DEFAULT_SETTINGS.terminalDrawer),
    tableDrawer: normalizeChoice(value.tableDrawer, ['right', 'bottom'], DEFAULT_SETTINGS.tableDrawer),
    retentionDays: normalizeInteger(value.retentionDays, RETENTION_MIN_DAYS, RETENTION_MAX_DAYS, DEFAULT_SETTINGS.retentionDays),
    savedAt: typeof value.savedAt === 'string' ? value.savedAt : null
  };
}

function normalizeChoice(value, choices, fallback) {
  return choices.includes(value) ? value : fallback;
}

function normalizeInteger(value, min, max, fallback) {
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
}

function normalizeText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength);
}

module.exports = {
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
  RETENTION_MIN_DAYS,
  RETENTION_MAX_DAYS,
  loadRendererSettings,
  normalizeRendererSettings,
  updateRendererSettings
};
