const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MATRIX_PATH = path.join(__dirname, '..', 'docs', 'pu-transition-evidence-matrix.md');
const SPINE_ROOT = path.join(__dirname, 'fixtures', 'runtime-log', 'live', '4.9-pub', 'sc-4.9-live', 'spine');

function readManifest(name) {
  return JSON.parse(fs.readFileSync(path.join(SPINE_ROOT, name), 'utf8'));
}

test('issue 70 evidence matrix references the reviewed capture and unavailable gate', () => {
  const matrix = fs.readFileSync(MATRIX_PATH, 'utf8');
  for (const reference of [
    'pu-join-shard-server.observed.manifest.json',
    'disconnect-frontend-clean-exit.observed.manifest.json',
    'live-4-9-188-repeated-pu-ready.observed.manifest.json',
    'delayed-pu-disconnect-correlation.observed.manifest.json',
    'pu-transition-evidence.unavailable.manifest.json',
    'failure-transition-evidence.unavailable.manifest.json'
  ]) {
    assert.match(matrix, new RegExp(reference.replaceAll('.', '\\.'), 'u'));
  }
});

test('issue 70 unavailable transitions cannot claim promoted runtime events', () => {
  const manifest = readManifest('pu-transition-evidence.unavailable.manifest.json');
  assert.equal(manifest.outcome, 'unavailable');
  assert.equal(manifest.provenance, 'unavailable_evidence_annotation');
  assert.deepEqual(manifest.expectedCanonicalEvents, []);
  assert.deepEqual(
    manifest.expectedNonEvents.map((item) => item.eventType),
    [
      'MatchmakingFailed',
      'MatchmakingCancelled',
      'InSessionServerHandoffObserved',
      'InSessionShardChanged',
      'ActiveSessionRecoveredAfterRestart'
    ]
  );
  assert.ok(manifest.expectedNonEvents.every((item) => item.reason.length > 20));
});

