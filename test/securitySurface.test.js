const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC_ROOT = path.join(__dirname, '..', 'src');

function readSource(relativePath) {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');
}

test('preload exposes the namespaced capability API without legacy generic operations', () => {
  const preload = readSource('preload.js');

  assert.match(preload, /source: Object\.freeze/);
  assert.match(preload, /monitor: Object\.freeze/);
  assert.match(preload, /events: Object\.freeze/);
  assert.match(preload, /settings: Object\.freeze/);
  assert.match(preload, /diagnostics: Object\.freeze/);
  assert.doesNotMatch(preload, /fetchJson|api:fetchJson|logs:scanSource|logs:watchSource|ipcRenderer\.send\(/);
});

test('renderer and main no longer expose third-party enrichment fetch controls', () => {
  const renderer = readSource('renderer/renderer.js');
  const html = readSource('renderer/index.html');
  const main = readSource('main.js');

  assert.doesNotMatch(renderer, /fetchJson|apiTemplate|https:\/\/api\.example/);
  assert.doesNotMatch(html, /apiTemplate|Enrichment URL|api\.example/);
  assert.doesNotMatch(main, /api:fetchJson|fetch\(url/);
});
