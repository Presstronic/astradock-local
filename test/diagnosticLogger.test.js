const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createDiagnosticLogger } = require('../src/diagnosticLogger');

test('diagnostic logger writes privacy-safe structured records and rotates bounded files', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'astradock-diagnostics-'));
  const logger = createDiagnosticLogger({ directory, maxBytes: 180, maxFiles: 2, now: () => new Date('2026-08-20T12:00:00.000Z') });
  logger.info('startup', { sourcePath: '/home/player/game.log', token: 'must-not-be-logged', count: 1 });
  logger.error('failure', new Error('failed to open /Users/player/private.log'));
  logger.warn('burst', { message: 'x'.repeat(500) });
  logger.close();

  const files = fs.readdirSync(directory).filter((name) => name.startsWith('astradock.log'));
  assert.ok(files.length <= 3);
  const content = files.map((name) => fs.readFileSync(path.join(directory, name), 'utf8')).join('\n');
  assert.match(content, /"event":"startup"/);
  assert.match(content, /\[path\]/);
  assert.doesNotMatch(content, /game\.log|private\.log|must-not-be-logged/);
  if (process.platform !== 'win32') {
    for (const name of files) assert.equal(fs.statSync(path.join(directory, name)).mode & 0o077, 0);
  }
});

test('diagnostic logger rejects relative directories', () => {
  assert.throws(() => createDiagnosticLogger({ directory: 'logs' }), /absolute/);
});
