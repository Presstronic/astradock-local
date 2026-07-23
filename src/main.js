const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {
  findExistingLogPath,
  getDefaultLogCandidates,
  parseLogFile
} = require('./logParser');

let mainWindow;
let watchedLogPath = null;
let watcher = null;

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

ipcMain.handle('logs:defaults', async () => ({
  candidates: getDefaultLogCandidates(),
  detectedPath: await findExistingLogPath()
}));

ipcMain.handle('logs:choose', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Star Citizen game.log',
    properties: ['openFile'],
    filters: [
      { name: 'Log files', extensions: ['log', 'txt'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });

  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('logs:scan', async (_event, logPath) => parseLogFile(logPath));

ipcMain.handle('logs:watch', async (_event, logPath) => {
  if (watcher) watcher.close();
  watchedLogPath = logPath;

  watcher = fs.watch(logPath, { persistent: false }, async () => {
    if (!mainWindow || watchedLogPath !== logPath) return;
    try {
      const result = await parseLogFile(logPath);
      mainWindow.webContents.send('logs:changed', result);
    } catch (error) {
      mainWindow.webContents.send('logs:error', error.message);
    }
  });

  return true;
});

ipcMain.handle('logs:openFolder', async (_event, logPath) => {
  if (!logPath) return false;
  await shell.openPath(path.dirname(logPath));
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
