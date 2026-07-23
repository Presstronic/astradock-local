const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('astradock', {
  getDefaultLogs: () => ipcRenderer.invoke('logs:defaults'),
  chooseLog: () => ipcRenderer.invoke('logs:choose'),
  scanLog: (logPath) => ipcRenderer.invoke('logs:scan', logPath),
  watchLog: (logPath) => ipcRenderer.invoke('logs:watch', logPath),
  openLogFolder: (logPath) => ipcRenderer.invoke('logs:openFolder', logPath),
  fetchJson: (url) => ipcRenderer.invoke('api:fetchJson', url),
  onLogChanged: (callback) => {
    const listener = (_event, result) => callback(result);
    ipcRenderer.on('logs:changed', listener);
    return () => ipcRenderer.removeListener('logs:changed', listener);
  },
  onLogError: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('logs:error', listener);
    return () => ipcRenderer.removeListener('logs:error', listener);
  }
});
