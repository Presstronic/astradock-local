const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC_ROOT = path.join(__dirname, '..', 'src');

function readSource(relativePath) {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');
}

function readRendererSources() {
  const rendererRoot = path.join(SRC_ROOT, 'renderer');
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (/\.(html|js|ts|tsx|css)$/.test(entry.name)) {
        files.push(fs.readFileSync(fullPath, 'utf8'));
      }
    }
  };
  visit(rendererRoot);
  return files.join('\n');
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
  const renderer = readRendererSources();
  const main = readSource('main.js');

  assert.doesNotMatch(renderer, /fetchJson|apiTemplate|https:\/\/api\.example/);
  assert.doesNotMatch(renderer, /Enrichment URL|api\.example/);
  assert.doesNotMatch(main, /api:fetchJson|fetch\(url/);
});

test('live monitor path uses the runtime tailer instead of watch-triggered whole-file rescans', () => {
  const main = readSource('main.js');

  assert.match(main, /RuntimeLogTailer/);
  assert.doesNotMatch(main, /require\('node:fs'\)/);
  assert.doesNotMatch(main, /scheduleMonitorScan|activeMonitorScanController|scanPending|fs\.watch/);
});

test('renderer gateway has an explicit TypeScript declaration surface', () => {
  const declaration = readSource('contracts/rendererApi.d.ts');

  assert.match(declaration, /export interface AstraDockApi/);
  assert.match(declaration, /source:/);
  assert.match(declaration, /monitor:/);
  assert.match(declaration, /events:/);
  assert.match(declaration, /settings:/);
  assert.match(declaration, /diagnostics:/);
  assert.match(declaration, /interface Window/);
});
