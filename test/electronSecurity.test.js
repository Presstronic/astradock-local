const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  createBrowserWindowOptions,
  getContentSecurityPolicy,
  getRendererUrl,
  isAllowedRendererUrl
} = require('../src/electronSecurity');

test('BrowserWindow options enforce renderer hardening', () => {
  const options = createBrowserWindowOptions('/tmp/preload.js', { isPackaged: true });

  assert.equal(options.webPreferences.contextIsolation, true);
  assert.equal(options.webPreferences.nodeIntegration, false);
  assert.equal(options.webPreferences.sandbox, true);
  assert.equal(options.webPreferences.webSecurity, true);
  assert.equal(options.webPreferences.allowRunningInsecureContent, false);
  assert.equal(options.webPreferences.devTools, false);
});

test('CSP blocks network connections, embedded objects, and frame navigation', () => {
  const csp = getContentSecurityPolicy();

  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-src 'none'/);
  assert.match(csp, /base-uri 'none'/);
});

test('renderer URL validation allows only the packaged renderer document', () => {
  const rendererUrl = getRendererUrl(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));

  assert.equal(isAllowedRendererUrl(rendererUrl, rendererUrl), true);
  assert.equal(isAllowedRendererUrl('https://example.invalid/', rendererUrl), false);
  assert.equal(isAllowedRendererUrl('file:///tmp/other.html', rendererUrl), false);
  assert.equal(isAllowedRendererUrl('javascript:alert(1)', rendererUrl), false);
});
