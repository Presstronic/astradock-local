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

function configureChromiumRuntimeFlags({ app, platform = process.platform }) {
  if (platform !== 'linux') return [];

  const applied = [];
  const disableFeatures = mergeSwitchValues(
    app.commandLine?.getSwitchValue?.('disable-features'),
    ['Vulkan']
  );
  app.commandLine?.appendSwitch?.('disable-features', disableFeatures);
  applied.push({
    name: 'disable-features',
    value: disableFeatures,
    scope: 'electron_chromium_process'
  });

  return applied;
}

function mergeSwitchValues(currentValue, additions) {
  const values = new Set(
    String(currentValue || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
  for (const addition of additions) values.add(addition);
  return Array.from(values).join(',');
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
  configureChromiumRuntimeFlags,
  createBrowserWindowOptions,
  getContentSecurityPolicy,
  getRendererUrl,
  installAppSecurityPolicy,
  isAllowedRendererUrl
};
