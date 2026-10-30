const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EVENT_TYPE_REGISTRY } = require('../src/contracts/runtimeEvents');

const DOC_PATH = path.join(__dirname, '..', 'docs', 'issue-101-death-medical-respawn-evidence-matrix.md');
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'runtime-log', 'live', '4.9-pub', 'sc-4.9-live', 'lifecycle');
const GATE_PATH = path.join(FIXTURE_ROOT, 'death-medical-respawn-evidence.unavailable.manifest.json');
const NOISE_LOG_PATH = path.join(FIXTURE_ROOT, 'death-medical-respawn-noise.non-event.log');

const CANDIDATES = [
  'LocalPlayerEmergencyTransitionObserved',
  'LocalPlayerMedicalRespawnObserved',
  'LocalPlayerLifecycleResetObserved',
  'LocalPlayerSelfTerminationInferred'
];

test('issue 101 records a complete evidence matrix and keeps every candidate deferred', () => {
  const document = fs.readFileSync(DOC_PATH, 'utf8');
  const manifest = JSON.parse(fs.readFileSync(GATE_PATH, 'utf8'));

  for (const requiredSection of [
    'Marker classification',
    'Promotion decisions',
    'Capture matrix and required evidence',
    'Proposed contract shape if later promoted',
    'Privacy, reliability, and performance',
    'Verification guidance',
    'Technology and Libraries'
  ]) {
    assert.match(document, new RegExp(`## ${requiredSection.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`));
  }

  for (const scenario of [
    'Backspace self-termination',
    'Combat death',
    'Environmental/fall/suffocation death',
    'Incapacitation',
    'Manual MedBed use',
    'Normal login/spawn',
    'Bed logout',
    'Normal menu logout',
    'ALT-F4',
    'Network disconnect/server error',
    'Shard/server transition'
  ]) {
    assert.match(document, new RegExp(scenario.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')));
  }

  assert.equal(manifest.outcome, 'unavailable');
  assert.deepEqual(manifest.expectedCanonicalEvents, []);
  const deferred = new Set(manifest.expectedNonEvents.map(({ eventType }) => eventType));
  for (const candidate of CANDIDATES) assert.ok(deferred.has(candidate), `candidate must remain deferred: ${candidate}`);
  assert.equal(Object.keys(EVENT_TYPE_REGISTRY).some((eventType) => CANDIDATES.includes(eventType)), false);
});

test('issue 101 noise fixture contains promising vocabulary but no direct transition marker', () => {
  const noise = fs.readFileSync(NOISE_LOG_PATH, 'utf8');
  assert.match(noise, /CleanupDeadReplicationLayers/);
  assert.match(noise, /EntityComponentMedBed/);
  assert.match(noise, /Initializing Game Telemetry/);
  assert.doesNotMatch(noise, /Standby, Local Emergency Services Are En Route/);
  assert.doesNotMatch(noise, /(?:backspace|suicide|self.?termination|(?:character|player)\s+death|respawn)/iu);
});
