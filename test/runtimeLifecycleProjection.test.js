const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { parseRuntimeLogText } = require('../src/runtimeLogParserEngine');
const {
  DEFAULT_STALE_AFTER_MS,
  projectRuntimeLifecycle,
  redactEndpoint,
  redactStableIdentifier,
  toRendererLifecycleProjection
} = require('../src/runtimeLifecycleProjection');
const { REGION_MAPPING_VERSION, mapShardRegion } = require('../src/runtimeRegionMappings');

const SPINE_ROOT = path.join(__dirname, 'fixtures', 'runtime-log', 'live', '4.9-pub', 'sc-4.9-live', 'spine');
const PARSER_OPTIONS = {
  sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log',
  sourceProfileId: 'sc-4.9-live',
  gameBuild: '4.9.0-LIVE.9000000-SYNTH',
  ingestedAt: '2026-08-09T21:00:00.000Z'
};

function readFixture(name) {
  return fs.readFileSync(path.join(SPINE_ROOT, name), 'utf8');
}

function parseSpine() {
  const text = [
    'client-build-environment.observed.log',
    'local-identity-login.observed.log',
    'pu-join-shard-server.observed.log',
    'disconnect-frontend-clean-exit.observed.log'
  ].map(readFixture).join('\n');
  return parseRuntimeLogText(text, PARSER_OPTIONS);
}

test('fixture-backed lifecycle projection reaches clean exit without inventing unsupported transitions', () => {
  const parsed = parseSpine();
  const projected = projectRuntimeLifecycle(parsed.events, { now: '2026-08-09T19:10:21.000Z' });
  const current = projected.environments[projected.activeEnvironmentKey];

  assert.equal(current.environment.releaseChannel, 'LIVE');
  assert.equal(current.build.productVersion, '4.9.0-LIVE.9000000-SYNTH');
  assert.equal(current.build.changelist, 'SYNTH_CHANGE_9000000');
  assert.equal(current.identity.handle.value, 'SYNTH_HANDLE_LOCAL');
  assert.equal(current.identity.accountId.value, 'SYNTH_ACCOUNT_LOCAL');
  assert.equal(current.identity.characterGeid.value, 'SYNTH_CHARACTER_GEID_LOCAL');
  assert.equal(current.identity.playerGeid.value, 'SYNTH_PLAYER_GEID_LOCAL');
  assert.equal(current.lifecycle.state, 'exited');
  assert.equal(current.lifecycle.cleanExit, true);
  assert.equal(current.lifecycle.status, 'known');
  assert.equal(current.freshness, 'current');
  assert.equal(current.shard.shardLabel, 'SYNTH_SHARD_STANTON_US_EAST_A');
  assert.equal(current.shard.region.friendlyRegion, 'US');
  assert.equal(current.shard.state, 'disconnected');
  assert.equal(current.serverConnection.state, 'disconnected');
  assert.equal(current.serverConnection.endpoint, null);
  assert.equal(current.serverConnection.lastEndpoint, 'game-server-alpha.example.invalid');
  assert.equal(current.serverConnection.disconnect.origin, 'remote');
  assert.equal(current.puSession.durationSeconds, 3900);
  assert.equal(current.puSession.durationSource, 'observed_connection_uptime');
});

test('identity evidence remains additive and exposes conflicts without collapsing identifiers', () => {
  const parsed = parseSpine();
  const identityEvent = parsed.events.find((event) => event.eventType === 'IdentityObserved');
  const conflicting = {
    ...identityEvent,
    eventId: `${identityEvent.eventId}-conflict`,
    sourceTimestamp: '2026-08-09T19:01:04.000Z',
    ordering: { ...identityEvent.ordering, ingestionSequence: identityEvent.ordering.ingestionSequence + 100 },
    payload: { ...identityEvent.payload, accountId: 'SYNTH_ACCOUNT_CONFLICT' }
  };
  const result = projectRuntimeLifecycle([...parsed.events, conflicting], { now: '2026-08-09T19:01:04.000Z' });
  const identity = result.environments[result.activeEnvironmentKey].identity;

  assert.equal(identity.accountId.status, 'conflicting');
  assert.equal(identity.accountId.claims.length, 2);
  assert.equal(identity.characterGeid.status, 'known');
  assert.notEqual(identity.accountId.value, identity.characterGeid.value);
});

test('renderer DTO redacts stable identifiers and retains permitted display names', () => {
  const parsed = parseSpine();
  const projected = projectRuntimeLifecycle(parsed.events, { now: '2026-08-09T19:10:21.000Z' });
  const dto = toRendererLifecycleProjection(projected);
  const identity = dto.environments[dto.activeEnvironmentKey].identity;

  assert.equal(identity.handle.value, 'SYNTH_HANDLE_LOCAL');
  assert.equal(identity.characterName.value, 'SYNTH_HANDLE_LOCAL');
  assert.equal(identity.accountId.value, redactStableIdentifier('SYNTH_ACCOUNT_LOCAL'));
  assert.equal(JSON.stringify(dto).includes('SYNTH_ACCOUNT_LOCAL'), false);
  assert.equal(JSON.stringify(dto).includes('SYNTH_PLAYER_GEID_LOCAL'), false);
  assert.equal(JSON.stringify(dto).includes('SYNTH_LOGIN_SESSION_LOCAL'), false);
  assert.equal(JSON.stringify(dto).includes('game-server-alpha.example.invalid'), false);
  assert.equal(identity.accountId.value, 'SY…AL');
  assert.equal(dto.environments[dto.activeEnvironmentKey].serverConnection.lastEndpoint, 'ga…ha.example.invalid');
});

test('region mappings use only versioned shard naming conventions and preserve unknowns', () => {
  assert.deepEqual(mapShardRegion('shard-Stanton-use1b-008'), {
    friendlyRegion: 'US',
    rawSegment: 'use1b',
    confidence: 'medium',
    basis: 'naming_convention',
    mappingVersion: REGION_MAPPING_VERSION
  });
  assert.equal(mapShardRegion('shard-Pyro-eu2a-001').friendlyRegion, 'EU');
  assert.equal(mapShardRegion('shard-Stanton-aus1-001').friendlyRegion, 'AUS');
  assert.equal(mapShardRegion('shard-Pyro-apac1-001').friendlyRegion, 'ASIA');
  assert.deepEqual(mapShardRegion('SYNTH_SHARD_FUTURE_X1'), {
    friendlyRegion: 'UNKNOWN',
    rawSegment: null,
    confidence: 'unknown',
    basis: 'unmapped',
    mappingVersion: REGION_MAPPING_VERSION
  });
});

test('renderer endpoint redaction handles IP addresses, hostnames, and absent values', () => {
  assert.equal(redactEndpoint('203.0.113.45'), '203.0.*.*');
  assert.equal(redactEndpoint('game-server-alpha.example.invalid'), 'ga…ha.example.invalid');
  assert.equal(redactEndpoint(null), null);
});

test('incomplete joins remain transitioning and do not claim successful entry', () => {
  const parsed = parseRuntimeLogText([
    '<2026-08-09T19:05:00.000Z> {Join PU} id[SYNTH_MATCHMAKING_INCOMPLETE] status[Queued] port[64090]',
    '<2026-08-09T19:05:01.000Z> <Join PU> address[incomplete.example.invalid] port[64090] shard[SYNTH_SHARD_STANTON_EU_1] locationId[SYNTH_LOCATION_INCOMPLETE]'
  ].join('\n') + '\n', PARSER_OPTIONS);
  const projected = projectRuntimeLifecycle(parsed.events, { now: '2026-08-09T19:05:02.000Z' });
  const current = projected.environments[projected.activeEnvironmentKey];

  assert.equal(current.shard.state, 'transitioning');
  assert.equal(current.serverConnection.state, 'transitioning');
  assert.equal(current.puSession.state, 'connecting');
  assert.equal(current.puSession.matchmakingStatus, 'Queued');
  assert.equal(current.puSession.enteredAt, null);
});

test('missing evidence stays unknown and freshness becomes stale at the approved health boundary', () => {
  assert.deepEqual(projectRuntimeLifecycle([], { now: '2026-08-09T19:00:00.000Z' }), {
    version: 1,
    activeEnvironmentKey: null,
    environments: {}
  });

  const parsed = parseRuntimeLogText(readFixture('local-identity-login.observed.log'), PARSER_OPTIONS);
  const projected = projectRuntimeLifecycle(parsed.events, {
    now: new Date(Date.parse('2026-08-09T19:01:03.000Z') + DEFAULT_STALE_AFTER_MS + 1).toISOString()
  });
  const current = projected.environments[projected.activeEnvironmentKey];
  assert.equal(current.lifecycle.state, 'frontend');
  assert.equal(current.freshness, 'stale');
  assert.equal(current.lifecycle.cleanExit, null);
});

test('identical identifiers remain isolated across environment partitions', () => {
  const parsed = parseRuntimeLogText([
    '<2026-08-09T19:00:00.000Z> <Init> Environment[PUB] Tag[LIVE] Config[Shipping] SourcePath[%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log]',
    '<2026-08-09T19:00:00.010Z> <Game Version> version[4.9.0-LIVE.9000000-SYNTH] environment[LIVE]',
    '<2026-08-09T19:00:01.000Z> <Legacy login response> status[Success] handle[SYNTH_HANDLE_SHARED] accountId[SYNTH_ACCOUNT_SHARED]',
    '<2026-08-09T19:10:00.000Z> <Init> Environment[PTU] Tag[PTU] Config[Shipping] SourcePath[%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/PTU/game.log]',
    '<2026-08-09T19:10:00.010Z> <Game Version> version[4.9.0-PTU.9000000-SYNTH] environment[PTU]',
    '<2026-08-09T19:10:01.000Z> <Legacy login response> status[Success] handle[SYNTH_HANDLE_SHARED] accountId[SYNTH_ACCOUNT_SHARED]'
  ].join('\n') + '\n', {
    sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log',
    sourceProfileId: 'sc-4.9-cross-env',
    gameBuild: '4.9.0-LIVE.9000000-SYNTH',
    ingestedAt: '2026-08-09T21:00:00.000Z'
  });
  const projected = projectRuntimeLifecycle(parsed.events, { now: '2026-08-09T21:00:00.000Z' });
  const partitions = Object.values(projected.environments)
    .filter((partition) => partition.identity.accountId.status === 'known');

  assert.equal(partitions.length, 2);
  assert.notEqual(partitions[0].environmentKey, partitions[1].environmentKey);
  assert.ok(partitions.every((partition) => partition.identity.accountId.status !== 'conflicting'));
});
