const path = require('node:path');
const { pathToFileURL } = require('node:url');

function createBrowserWindowOptions(preloadPath, options = {}) {
  return {
    width: 1120,
    height: 760,
    minWidth: 1024,
    minHeight: 640,
    title: 'AstraDock Local',
    backgroundColor: '#111417',
    show: false,
    webPreferences: {
      preload: path.resolve(preloadPath),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !options.isPackaged
    }
  };
}

function getRendererUrl(rendererIndexPath) {
  return pathToFileURL(path.resolve(rendererIndexPath)).toString();
}

function getContentSecurityPolicy() {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'none'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'"
  ].join('; ');
}

function isAllowedRendererUrl(candidateUrl, rendererUrl) {
  try {
    const candidate = new URL(candidateUrl);
    const expected = new URL(rendererUrl);
    return candidate.href === expected.href;
  } catch {
    return false;
  }
}

function installAppSecurityPolicy({ app, session, rendererUrl }) {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event, navigationUrl) => {
      if (!isAllowedRendererUrl(navigationUrl, rendererUrl)) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });

  app.whenReady().then(() => {
    const defaultSession = session.defaultSession;
    defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    defaultSession.setPermissionCheckHandler(() => false);
    defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [getContentSecurityPolicy()]
        }
      });
    });
  });
}

module.exports = {
  createBrowserWindowOptions,
  getContentSecurityPolicy,
  getRendererUrl,
  installAppSecurityPolicy,
  isAllowedRendererUrl
};
