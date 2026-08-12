const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  parseEnvironmentTimeline,
  parseLogFile,
  parseLogText,
  parseShardEntries
} = require('../src/logParser');

const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'runtime-log');

test('parses shard id and name on one line', () => {
  const entries = parseShardEntries(`
<2026-07-23T19:12:10Z> Connected ShardID: 210 ShardName: Stanton-US Region: us Build: 4.2.1
`);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].shardId, '210');
  assert.equal(entries[0].shardName, 'Stanton-US');
  assert.equal(entries[0].region, 'us');
  assert.equal(entries[0].build, '4.2.1');
});

test('dedupes repeated shard sightings', () => {
  const entries = parseShardEntries(`
2026-07-23 19:12:10 ShardID=210 ShardName=Stanton-US
2026-07-23 20:12:10 ShardID=210 ShardName=Stanton-US
`);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].lastSeen, '2026-07-23 20:12:10');
});

test('parses json-like shard lines', () => {
  const entries = parseShardEntries(`
2026-07-23 19:12:10 {"shardId":"mesh-987","shardName":"Stanton EU","region":"eu"}
`);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].shardId, 'mesh-987');
  assert.equal(entries[0].shardName, 'Stanton EU');
  assert.equal(entries[0].region, 'eu');
});

test('keeps shard, session, action, and user identity state partitioned by environment', () => {
  const logText = fs.readFileSync(
    path.join(
      FIXTURE_ROOT,
      'multi',
      '4.9-pub',
      'sc-4.9-cross-env',
      'environment',
      'live-ptu-identical-identifiers.isolation.log'
    ),
    'utf8'
  );
  const result = parseLogText(logText, {
    username: 'SYNTH_HANDLE_SHARED',
    gameBuild: '4.9.0-MULTI.9000000-SYNTH',
    branch: 'sc-alpha-4.9-cross-env-synth'
  });
  const shardEnvironmentKeys = new Set(result.entries.map((entry) => entry.environmentKey));
  const sessionEnvironmentKeys = new Set(result.userActivity.sessions.map((session) => session.environmentKey));
  const actionEnvironmentKeys = new Set(result.userActivity.actions.map((action) => action.environmentKey));

  assert.equal(result.environmentPartitions.length, 2);
  assert.equal(result.entries.length, 2, 'same shard ID must not dedupe across environments');
  assert.equal(result.userActivity.sessions.length, 2, 'same shard session must not merge across environments');
  assert.equal(shardEnvironmentKeys.size, 2);
  assert.equal(sessionEnvironmentKeys.size, 2);
  assert.equal(actionEnvironmentKeys.size, 2);
  assert.ok(Array.from(shardEnvironmentKeys).some((key) => key.startsWith('LIVE::PU::')));
  assert.ok(Array.from(shardEnvironmentKeys).some((key) => key.startsWith('PTU::PU::')));
  assert.notEqual(result.userActivity.sessions[0].id, result.userActivity.sessions[1].id);
  assert.notEqual(result.userActivity.actions[0].id, result.userActivity.actions.at(-1).id);
  assert.equal(Object.keys(result.userActivity.userIdsByEnvironment).length, 2);
  assert.deepEqual(
    Object.values(result.userActivity.userIdsByEnvironment).map((userIds) => userIds.includes('SYNTH_ACCOUNT_SHARED')),
    [true, true]
  );
});

test('keeps EPTU and HOTFIX collisions isolated from each other', () => {
  const result = parseLogText(`
<2026-08-09T20:00:00.000Z> <Init> Environment[EPTU] Tag[EPTU] Config[Shipping] SourcePath[%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/EPTU/game.log]
<2026-08-09T20:00:01.000Z> <Game Version> version[4.9.0-EPTU.9000000-SYNTH] environment[EPTU]
<2026-08-09T20:00:02.000Z> <AccountLoginCharacterStatus_Character> name SYNTH_HANDLE_SHARED accountId SYNTH_ACCOUNT_SHARED geid SYNTH_CHARACTER_GEID_SHARED state Active
<2026-08-09T20:00:03.000Z> <Join PU> address[eptu-server-shared.example.invalid] port[64090] shard[SYNTH_SHARD_SHARED] locationId[SYNTH_LOCATION_SHARED]
<2026-08-09T20:10:00.000Z> <Init> Environment[HOTFIX] Tag[HOTFIX] Config[Shipping] SourcePath[%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/HOTFIX/game.log]
<2026-08-09T20:10:01.000Z> <Game Version> version[4.9.0-HOTFIX.9000000-SYNTH] environment[HOTFIX]
<2026-08-09T20:10:02.000Z> <AccountLoginCharacterStatus_Character> name SYNTH_HANDLE_SHARED accountId SYNTH_ACCOUNT_SHARED geid SYNTH_CHARACTER_GEID_SHARED state Active
<2026-08-09T20:10:03.000Z> <Join PU> address[hotfix-server-shared.example.invalid] port[64090] shard[SYNTH_SHARD_SHARED] locationId[SYNTH_LOCATION_SHARED]
`, {
    username: 'SYNTH_HANDLE_SHARED',
    branch: 'sc-alpha-4.9-hotfix-collision-synth'
  });
  const environmentKeys = new Set(result.entries.map((entry) => entry.environmentKey));

  assert.equal(result.environmentPartitions.length, 4, 'build observations create distinct source contexts');
  assert.equal(result.entries.length, 2);
  assert.equal(result.userActivity.sessions.length, 2);
  assert.equal(environmentKeys.size, 2);
  assert.ok(Array.from(environmentKeys).some((key) => key.startsWith('EPTU::PU::')));
  assert.ok(Array.from(environmentKeys).some((key) => key.startsWith('HOTFIX::PU::')));
  assert.equal(
    result.environmentPartitions.some(
      (partition) => partition.releaseChannel === 'HOTFIX' && partition.buildVersion.includes('EPTU')
    ),
    false,
    'source switches must not inherit the previous channel build'
  );
  assert.notEqual(result.entries[0].id, result.entries[1].id);
  assert.notEqual(result.userActivity.sessions[0].id, result.userActivity.sessions[1].id);
});

test('build changes inside one channel create a new partition and stale the prior current session', () => {
  const result = parseLogText(`
<2026-08-09T21:00:00.000Z> <Init> Environment[PUB] Tag[LIVE] Config[Shipping] SourcePath[%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log]
<2026-08-09T21:00:01.000Z> <Game Version> version[4.9.0-LIVE.9000000-SYNTH] environment[LIVE]
<2026-08-09T21:00:02.000Z> <Join PU> address[live-build-a.example.invalid] port[64090] shard[SYNTH_SHARD_SHARED] locationId[SYNTH_LOCATION_SHARED]
<2026-08-09T21:10:00.000Z> <Game Version> version[4.9.1-LIVE.9000001-SYNTH] environment[LIVE]
<2026-08-09T21:10:01.000Z> <Join PU> address[live-build-b.example.invalid] port[64090] shard[SYNTH_SHARD_SHARED] locationId[SYNTH_LOCATION_SHARED]
`);
  const sessionEnvironmentKeys = new Set(result.userActivity.sessions.map((session) => session.environmentKey));
  const staleSession = result.userActivity.sessions.find((session) => session.staleReason === 'environment_changed');

  assert.equal(result.entries.length, 2);
  assert.equal(result.userActivity.sessions.length, 2);
  assert.equal(sessionEnvironmentKeys.size, 2);
  assert.ok(staleSession, 'previous build session should not remain current truth');
  assert.notEqual(result.userActivity.sessions[0].environmentKey, result.userActivity.sessions[1].environmentKey);
});

test('unknown source evidence derives UNKNOWN release channel instead of LIVE', () => {
  const result = parseLogText(`
<2026-08-09T19:00:00.000Z> <Init> Environment[TECH-PREVIEW] Tag[TECH-PREVIEW] Config[Shipping] SourcePath[%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/TECH-PREVIEW/game.log]
<2026-08-09T19:00:01.000Z> <Join PU> address[unknown-server.example.invalid] port[64090] shard[SYNTH_SHARD_UNKNOWN] locationId[SYNTH_LOCATION_UNKNOWN]
`);

  assert.equal(result.environment.releaseChannel, 'UNKNOWN');
  assert.equal(result.environment.rawEnvironmentTag, 'TECH-PREVIEW');
  assert.equal(result.environment.buildVersion, 'UNKNOWN_BUILD');
  assert.ok(result.environmentKey.startsWith('UNKNOWN::PU::'));
  assert.equal(result.entries[0].gameChannel, 'UNKNOWN');
});

test('conflicting same-line environment evidence is quarantined without leaking source paths', () => {
  const sourcePath = '/Users/private/Roberts Space Industries/StarCitizen/LIVE/game.log';
  const timeline = parseEnvironmentTimeline([
    `<2026-08-09T19:00:00.000Z> <Init> Environment[PUB] Tag[LIVE] Config[Shipping] SourcePath[${sourcePath}] <Game Version> version[4.9.0-LIVE.9000000-SYNTH] environment[PTU]`
  ]);

  assert.equal(timeline.diagnostics.length, 1);
  assert.equal(timeline.diagnostics[0].code, 'conflicting_environment_evidence');
  assert.equal(JSON.stringify(timeline.diagnostics).includes(sourcePath), false);
  assert.equal(timeline.activeEnvironment.releaseChannel, 'UNKNOWN');
});

test('parseLogFile supports abortable reads for monitor cancellation', async () => {
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    () => parseLogFile(path.join(FIXTURE_ROOT, 'live', '4.9-pub', 'sc-4.9-live', 'spine', 'pu-join-shard-server.observed.log'), {
      signal: controller.signal
    }),
    {
      name: 'AbortError'
    }
  );
});
