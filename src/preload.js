const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('astradock', {
  discoverSources: () => ipcRenderer.invoke('sources:discover'),
  chooseLog: () => ipcRenderer.invoke('sources:choose'),
  selectSource: (sourceId) => ipcRenderer.invoke('sources:select', sourceId),
  scanSource: (sourceId, options) => ipcRenderer.invoke('logs:scanSource', sourceId, options),
  watchSource: (sourceId, options) => ipcRenderer.invoke('logs:watchSource', sourceId, options),
  unwatchLog: () => ipcRenderer.invoke('logs:unwatch'),
  openSourceFolder: (sourceId) => ipcRenderer.invoke('sources:openFolder', sourceId),
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
