const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { parseLogFile } = require('./logParser');
const {
  assertSourceIsApproved,
  discoverRuntimeSources,
  loadSourcePreference,
  saveSourcePreference,
  toPublicSource,
  validateLogSource
} = require('./sourceDiscovery');

let mainWindow;
let watchedLogPath = null;
let watchedSourceId = null;
let watcher = null;
let watchOptions = {};
const sourceRegistry = new Map();
let activeSourceId = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 860,
    minHeight: 560,
    title: 'AstraDock Local',
    backgroundColor: '#111417',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('sources:discover', async () => {
  const discovery = await discoverAndRegisterSources();
  return {
    ...discovery,
    sources: discovery.sources.map(toPublicSource),
    activeSource: discovery.activeSource ? toPublicSource(discovery.activeSource) : null
  };
});

ipcMain.handle('sources:choose', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Star Citizen game.log',
    properties: ['openFile'],
    filters: [
      { name: 'Log files', extensions: ['log', 'txt'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });

  if (result.canceled) return null;
  const source = await validateLogSource(result.filePaths[0], {
    discoveryMethods: ['user_selected']
  });
  rememberSource(source);

  if (source.validation.isValid) {
    activeSourceId = source.sourceId;
    await saveSourcePreference(getSourcePreferencePath(), source);
  }

  return {
    source: toPublicSource(source),
    saved: source.validation.isValid
  };
});

ipcMain.handle('sources:select', async (_event, sourceId) => {
  const source = await revalidateRegisteredSource(sourceId);
  if (!source.validation.isValid) {
    return {
      source: toPublicSource(source),
      selected: false
    };
  }

  activeSourceId = source.sourceId;
  await saveSourcePreference(getSourcePreferencePath(), source);
  return {
    source: toPublicSource(source),
    selected: true
  };
});

ipcMain.handle('logs:scanSource', async (_event, sourceId, options = {}) => {
  const source = await getApprovedSource(sourceId || activeSourceId);
  const result = await parseLogFile(source.private.canonicalPath, options);
  return toRendererScanResult(result, source);
});

ipcMain.handle('logs:watchSource', async (_event, sourceId, options = {}) => {
  const source = await getApprovedSource(sourceId || activeSourceId);
  const logPath = source.private.canonicalPath;
  if (watcher) watcher.close();
  watchedLogPath = logPath;
  watchedSourceId = source.sourceId;
  watchOptions = options;

  watcher = fs.watch(logPath, { persistent: false }, async () => {
    if (!mainWindow || watchedLogPath !== logPath || watchedSourceId !== source.sourceId) return;
    try {
      const result = await parseLogFile(logPath, watchOptions);
      mainWindow.webContents.send('logs:changed', toRendererScanResult(result, source));
    } catch (error) {
      mainWindow.webContents.send('logs:error', error.message);
    }
  });

  return true;
});

ipcMain.handle('logs:unwatch', async () => {
  if (watcher) watcher.close();
  watcher = null;
  watchedLogPath = null;
  watchedSourceId = null;
  watchOptions = {};
  return true;
});

ipcMain.handle('sources:openFolder', async (_event, sourceId) => {
  const source = await revalidateRegisteredSource(sourceId || activeSourceId);
  if (!source.validation.isValid) {
    throw safeError(source.validation.status, source.validation.message);
  }
  await shell.openPath(path.dirname(source.private.canonicalPath));
  return true;
});

ipcMain.handle('api:fetchJson', async (_event, url) => {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json'
    }
  });

  const text = await response.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Some public APIs return useful plain text errors.
  }

  return {
    ok: response.ok,
    status: response.status,
    body
  };
});

function getSourcePreferencePath() {
  return path.join(app.getPath('userData'), 'source-preference.json');
}

async function discoverAndRegisterSources() {
  const preference = await loadSourcePreference(getSourcePreferencePath());
  const discovery = await discoverRuntimeSources({
    restoredSourcePath: preference?.selectedSourcePath || null,
    includePrivate: true
  });

  sourceRegistry.clear();
  for (const source of discovery.sources) rememberSource(source);
  activeSourceId = discovery.activeSource?.sourceId || null;
  return discovery;
}

function rememberSource(source) {
  sourceRegistry.set(source.sourceId, source);
}

async function revalidateRegisteredSource(sourceId) {
  const source = sourceRegistry.get(sourceId);
  if (!source?.private?.canonicalPath) {
    throw safeError('source_not_found', 'That log source is no longer available. Refresh source discovery and try again.');
  }

  const refreshed = await validateLogSource(source.private.canonicalPath, {
    discoveryMethods: source.discoveryMethods
  });
  if (refreshed.sourceId !== source.sourceId) sourceRegistry.delete(source.sourceId);
  rememberSource(refreshed);
  return refreshed;
}

async function getApprovedSource(sourceId) {
  const source = await revalidateRegisteredSource(sourceId);
  if (!source.validation.isValid) {
    throw safeError(source.validation.status, source.validation.message);
  }
  assertSourceIsApproved(source);
  activeSourceId = source.sourceId;
  return source;
}

function safeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function toRendererScanResult(result, source) {
  const {
    logPath: _logPath,
    ...safeResult
  } = result;
  return {
    ...safeResult,
    source: toPublicSource(source)
  };
}
