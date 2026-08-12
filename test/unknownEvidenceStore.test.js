const test = require('node:test');
const assert = require('node:assert/strict');

const {
  UnknownEvidenceStore,
  minimizeUnknownEvidence
} = require('../src/unknownEvidenceStore');

test('unknown evidence minimization redacts sensitive identifiers, endpoints, secrets, and paths', () => {
  const minimized = minimizeUnknownEvidence(
    '<2026-08-09T19:00:00.000Z> <UnknownAuth> handle[SYNTH_HANDLE] accountId[12345] token=supersecret remoteAddr 10.0.0.12:64090 SourcePath[C:\\Users\\pilot\\StarCitizen\\LIVE\\game.log]',
    { maxSampleBytes: 256 }
  );

  assert.equal(minimized.sensitivity, 'secret');
  assert.equal(minimized.snippet.includes('SYNTH_HANDLE'), false);
  assert.equal(minimized.snippet.includes('12345'), false);
  assert.equal(minimized.snippet.includes('supersecret'), false);
  assert.equal(minimized.snippet.includes('10.0.0.12'), false);
  assert.equal(minimized.snippet.includes('C:\\Users'), false);
  assert.ok(minimized.redactedKinds.includes('secret'));
  assert.ok(minimized.redactedKinds.includes('endpoint'));
});

test('unknown evidence store bounds samples while preserving partitioned counts', () => {
  const store = new UnknownEvidenceStore({
    now: () => '2026-08-09T20:00:00.000Z',
    policy: {
      maxSamples: 3,
      maxSamplesPerBucket: 2,
      maxTotalSampleBytes: 512,
      maxSampleBytes: 160
    }
  });

  for (let index = 0; index < 20; index += 1) {
    store.capture({
      reason: 'no_profile_match',
      text: `<2026-08-09T19:00:${String(index).padStart(2, '0')}.000Z> <UnknownThing> accountId[ACC_${index}] remoteAddr 192.168.1.${index}:64090 path[/home/pilot/StarCitizen/LIVE/game.log]`,
      environmentKey: 'env_live',
      releaseChannel: 'LIVE',
      gameBuild: '4.9.0-LIVE.9000000',
      sourceProfileId: 'sc-4.9-live',
      sourceProfileVersion: 'draft-2026-08-11',
      parserVersion: 'runtime-log-parser/0.1.0',
      sourceTimestamp: `2026-08-09T19:00:${String(index).padStart(2, '0')}.000Z`,
      lineRange: { start: index + 1, end: index + 1 },
      sourceByteOffset: index * 100
    });
  }

  for (let index = 0; index < 5; index += 1) {
    store.capture({
      reason: 'unsupported_profile',
      text: `<2026-08-09T19:10:${String(index).padStart(2, '0')}.000Z> <Join PU> address[ptu.example.invalid] port[64090] shard[SYNTH_PTU]`,
      environmentKey: 'env_ptu',
      releaseChannel: 'PTU',
      gameBuild: '4.9.0-PTU.9000000',
      sourceTimestamp: `2026-08-09T19:10:${String(index).padStart(2, '0')}.000Z`,
      lineRange: { start: index + 100, end: index + 100 }
    });
  }

  const summary = store.getSummary();
  assert.equal(summary.recordCount, 25);
  assert.ok(summary.sampleCount <= 3);
  assert.ok(summary.droppedSampleCount > 0);
  assert.equal(summary.byEnvironment.env_live.recordCount, 20);
  assert.equal(summary.byEnvironment.env_ptu.recordCount, 5);

  const live = store.query({ environmentKey: 'env_live', includeSamples: true });
  assert.equal(live.summary.recordCount, 20);
  assert.equal(JSON.stringify(live).includes('ACC_'), false);
  assert.equal(JSON.stringify(live).includes('192.168.1.'), false);
  assert.equal(JSON.stringify(live).includes('/home/pilot'), false);

  const deleted = store.delete({ environmentKey: 'env_live' });
  assert.equal(deleted.deletedRecords, 20);
  assert.equal(store.getSummary().recordCount, 5);

  const reset = store.reset();
  assert.equal(reset.deletedRecords, 5);
  assert.equal(store.getSummary().recordCount, 0);
});

test('unknown evidence retention removes expired buckets without crossing environments', () => {
  const store = new UnknownEvidenceStore({
    now: () => '2026-08-09T20:00:00.000Z',
    policy: { retentionMs: 1_000 * 60 }
  });

  store.capture({
    reason: 'no_profile_match',
    text: '<2026-08-09T19:00:00.000Z> <OldRecord>',
    environmentKey: 'env_live',
    gameBuild: '4.9.0-LIVE.9000000',
    observedAt: '2026-08-09T19:00:00.000Z'
  });
  store.capture({
    reason: 'no_profile_match',
    text: '<2026-08-09T19:59:30.000Z> <FreshRecord>',
    environmentKey: 'env_ptu',
    gameBuild: '4.9.0-PTU.9000000',
    observedAt: '2026-08-09T19:59:30.000Z'
  });

  const summary = store.getSummary({ now: '2026-08-09T20:00:00.000Z' });
  assert.equal(summary.recordCount, 1);
  assert.equal(summary.byEnvironment.env_ptu.recordCount, 1);
  assert.equal(summary.byEnvironment.env_live, undefined);
});
