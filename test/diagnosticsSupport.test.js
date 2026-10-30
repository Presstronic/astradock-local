const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createDiagnosticsSupportService } = require('../src/diagnosticsSupport');

test('diagnostics preview and export are bounded, redacted, local, and integrity-addressed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astradock-support-'));
  const logs = path.join(root, 'logs');
  fs.mkdirSync(logs);
  fs.writeFileSync(path.join(logs, 'astradock.log'), JSON.stringify({ level: 'error', event: 'source_failed', details: { path: '/Users/player/Game.log', endpoint: '203.0.113.9:64000', accountId: 'private-account' } }) + '\n');
  const service = createDiagnosticsSupportService({
    logDirectory: logs,
    metadata: { appVersion: '0.1.0', build: 'test', platform: 'linux', arch: 'x64', packaged: false },
    getHealth: () => ({ status: 'idle', source: { displayLabel: 'LIVE' }, activeSourceId: 'stable-source', parser: { profileId: 'profile-v1' } })
  });
  const preview = service.preview();
  assert.equal(preview.automaticUpload, false);
  assert.ok(preview.files.some((file) => file.name === 'health.json'));
  assert.ok(preview.redaction.total >= 3);
  const destination = path.join(root, 'nested', 'diagnostics.json');
  const result = service.export(destination);
  assert.equal(result.status, 'completed');
  const bundle = JSON.parse(fs.readFileSync(destination, 'utf8'));
  assert.equal(bundle.metadata.appVersion, '0.1.0');
  assert.equal(bundle.manifest.algorithm, 'sha256');
  assert.equal(JSON.stringify(bundle).includes('/Users/player'), false);
  assert.equal(JSON.stringify(bundle).includes('203.0.113.9'), false);
  assert.equal(JSON.stringify(bundle).includes('private-account'), false);
  assert.equal(JSON.stringify(bundle).includes('game.log'), false);
  assert.equal(fs.existsSync(`${destination}.tmp`), false);
});

test('diagnostics deletion removes only the bounded application log set', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astradock-support-delete-'));
  const logs = path.join(root, 'logs');
  fs.mkdirSync(logs);
  fs.writeFileSync(path.join(logs, 'astradock.log'), '{}\n');
  fs.writeFileSync(path.join(logs, 'astradock.log.1'), '{}\n');
  fs.writeFileSync(path.join(logs, 'keep.txt'), 'keep');
  const service = createDiagnosticsSupportService({ logDirectory: logs, getHealth: () => ({}) });
  assert.deepEqual(service.deleteLocalDiagnostics(), { deletedFiles: 2 });
  assert.equal(fs.existsSync(path.join(logs, 'keep.txt')), true);
});

test('diagnostics service rejects renderer-controlled relative destinations', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astradock-support-destination-'));
  const service = createDiagnosticsSupportService({ logDirectory: root, getHealth: () => ({}) });
  assert.throws(() => service.export('diagnostics.json'), /absolute destination/);
});
