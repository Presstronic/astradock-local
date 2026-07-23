const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('astradock', {
  getDefaultLogs: () => ipcRenderer.invoke('logs:defaults'),
  chooseLog: () => ipcRenderer.invoke('logs:choose'),
  scanLog: (logPath, options) => ipcRenderer.invoke('logs:scan', logPath, options),
  watchLog: (logPath, options) => ipcRenderer.invoke('logs:watch', logPath, options),
  unwatchLog: () => ipcRenderer.invoke('logs:unwatch'),
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
