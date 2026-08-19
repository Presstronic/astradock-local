const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { parseRuntimeLogText } = require('../src/runtimeLogParserEngine');
const {
  projectRuntimeDestination,
  projectRuntimeLocation,
  projectRuntimeParty,
  toRendererDestinationSnapshot,
  toRendererLocationSnapshot,
  toRendererPartySnapshot
} = require('../src/runtimeStateProjections');

const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'runtime-log');
const LIVE_PROFILE_OPTIONS = {
  sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log',
  sourceProfileId: 'sc-4.9-live',
  sourceProfileVersion: 'draft-2026-08-12',
  gameBuild: '4.9.0-LIVE.9000000-SYNTH',
  ingestedAt: '2026-08-09T21:00:00.000Z'
};

test('party snapshot projects only promoted party evidence without inventing marker membership', () => {
  const events = parseFixture('party', 'party-create-launch-member-connected.observed.log').events;
  const snapshot = toRendererPartySnapshot(projectRuntimeParty(events, {
    activeEnvironmentKey: events.at(-1).environmentKey,
    now: '2026-08-09T19:06:05.000Z'
  }));
  const party = snapshot.environments[snapshot.activeEnvironmentKey];

  assert.equal(party.state, 'in_party');
  assert.equal(party.leader.handle, 'SYNTH_HANDLE_LOCAL');
  assert.equal(party.leader.isLocalPlayer, true);
  assert.equal(party.confirmedMemberCount, 1, 'only direct creation confirms local membership');
  assert.equal(party.possibleMemberCount, 1, 'connection notification is possible membership, not a join');
  assert.deepEqual(
    party.members.map((member) => [member.handle, member.membershipState, member.connectionState, member.isLeader]),
    [
      ['SYNTH_HANDLE_LOCAL', 'confirmed', 'unknown', true],
      ['SYNTH_HANDLE_PARTY_MEMBER', 'possible', 'connected', false]
    ]
  );
  assert.deepEqual(
    party.recentTransitions.map((transition) => transition.eventType),
    ['PartyMemberConnected', 'PartyLaunchInitiated', 'PartyCreated']
  );
});

test('marker-only party evidence leaves party state unknown', () => {
  const events = parseFixture('party', 'party-marker-only-membership.non-event.log').events;
  const snapshot = toRendererPartySnapshot(projectRuntimeParty(events, {
    now: '2026-08-09T19:12:05.000Z'
  }));

  assert.equal(events.length, 0);
  assert.equal(snapshot.activeEnvironmentKey, null);
  assert.deepEqual(snapshot.environments, {});
});

test('explicit local party leave clears party state while marker removal does not', () => {
  const created = readFixture('party', 'party-create-launch-member-connected.observed.log');
  const leaving = readFixture('party', 'party-explicit-leave.observed.log');
  const result = parseRuntimeLogText(`${created}\n${leaving}`, LIVE_PROFILE_OPTIONS);
  const snapshot = toRendererPartySnapshot(projectRuntimeParty(result.events, {
    activeEnvironmentKey: result.events.at(-1).environmentKey,
    now: '2026-08-19T03:33:09.000Z'
  }));
  const party = snapshot.environments[snapshot.activeEnvironmentKey];

  assert.equal(party.state, 'not_in_party');
  assert.equal(party.partyId, null);
  assert.equal(party.confirmedMemberCount, 0);
  assert.equal(party.possibleMemberCount, 0);
  assert.equal(party.recentTransitions[0].eventType, 'PartyLeft');
});

test('session boundaries stale party facts without inventing not-in-party', () => {
  const partyText = readFixture('party', 'party-create-launch-member-connected.observed.log');
  const disconnectText = readFixture('spine', 'disconnect-frontend-clean-exit.observed.log');
  const result = parseRuntimeLogText(`${partyText}\n${disconnectText}`, LIVE_PROFILE_OPTIONS);
  const snapshot = toRendererPartySnapshot(projectRuntimeParty(result.events, {
    activeEnvironmentKey: result.events.at(-1).environmentKey,
    now: '2026-08-09T20:10:01.000Z'
  }));
  const party = snapshot.environments[snapshot.activeEnvironmentKey];

  assert.equal(party.state, 'stale');
  assert.equal(party.leader.status, 'stale');
  assert.equal(party.members.find((member) => member.handle === 'SYNTH_HANDLE_PARTY_MEMBER').connectionState, 'stale');
  assert.notEqual(party.state, 'not_in_party');
});

test('location snapshot projects independent jurisdiction, monitored-space, and armistice facts', () => {
  const events = parseFixture('zone', 'jurisdiction-monitored-armistice.observed.log').events;
  const snapshot = toRendererLocationSnapshot(projectRuntimeLocation(events, {
    activeEnvironmentKey: events.at(-1).environmentKey,
    now: '2026-08-09T19:20:01.000Z'
  }));
  const location = snapshot.environments[snapshot.activeEnvironmentKey];

  assert.equal(location.state, 'known');
  assert.equal(location.jurisdiction.value, 'SYNTH_JURISDICTION_A');
  assert.equal(location.jurisdiction.state, 'last_confirmed');
  assert.equal(location.monitoredSpace.value, true);
  assert.equal(location.monitoredSpace.state, 'entered');
  assert.equal(location.armistice.value, false);
  assert.equal(location.armistice.state, 'left');
  assert.equal(location.exactLocation.state, 'unsupported');
});

test('quiet time does not stale latched party, location, or destination facts', () => {
  const partyEvents = parseFixture('party', 'party-create-launch-member-connected.observed.log').events;
  const locationEvents = parseFixture('zone', 'jurisdiction-monitored-armistice.observed.log').events;
  const destinationEvents = parseRuntimeLogText(
    readFixture('destination', 'quantum-target-change-arrival.observed.log'),
    { ...LIVE_PROFILE_OPTIONS, sourceProfileVersion: 'draft-2026-08-19.3', gameBuild: '4.9.188.23497' }
  ).events;
  const now = '2026-08-20T19:20:01.000Z';

  const partySnapshot = toRendererPartySnapshot(projectRuntimeParty(partyEvents, { now }));
  const locationSnapshot = toRendererLocationSnapshot(projectRuntimeLocation(locationEvents, { now }));
  const destinationSnapshot = toRendererDestinationSnapshot(projectRuntimeDestination(destinationEvents, { now }));

  expectProjectionState(partySnapshot, 'in_party');
  expectProjectionState(locationSnapshot, 'known');
  expectProjectionState(destinationSnapshot, 'arrived');
});

test('current notification vocabulary projects monitored-space exit independently', () => {
  const result = parseRuntimeLogText(
    readFixture('zone', 'live-4-9-188-zone-notifications.observed.log'),
    { ...LIVE_PROFILE_OPTIONS, sourceProfileVersion: 'draft-2026-08-19.2', gameBuild: '4.9.188.23497' }
  );
  const snapshot = toRendererLocationSnapshot(projectRuntimeLocation(result.events, {
    activeEnvironmentKey: result.events.at(-1).environmentKey,
    now: '2026-08-19T07:12:55.000Z'
  }));
  const location = snapshot.environments[snapshot.activeEnvironmentKey];

  assert.equal(location.monitoredSpace.value, false);
  assert.equal(location.monitoredSpace.state, 'exited');
  assert.equal(location.jurisdiction.value, 'SYNTH_JURISDICTION_CURRENT');
  assert.equal(location.armistice.value, false);
});

test('negative location fixtures cannot mutate location state', () => {
  const logText = [
    readFixture('negative', 'object-container-ship-navigation.non-event.log'),
    readFixture('destination', 'place-name-destination-noise.non-event.log'),
    readFixture('destination', 'temporal-proximity-route-noise.non-event.log')
  ].join('\n');
  const events = parseRuntimeLogText(logText, LIVE_PROFILE_OPTIONS).events;
  const snapshot = toRendererLocationSnapshot(projectRuntimeLocation(events, {
    now: '2026-08-09T19:20:01.000Z'
  }));

  assert.equal(events.length, 0);
  assert.equal(snapshot.activeEnvironmentKey, null);
  assert.deepEqual(snapshot.environments, {});
});

test('destination snapshot projects target replacement and final arrival without inventing travel state', () => {
  const result = parseRuntimeLogText(
    readFixture('destination', 'quantum-target-change-arrival.observed.log'),
    { ...LIVE_PROFILE_OPTIONS, sourceProfileVersion: 'draft-2026-08-19.3', gameBuild: '4.9.188.23497' }
  );
  const snapshot = toRendererDestinationSnapshot(projectRuntimeDestination(result.events, {
    activeEnvironmentKey: result.events.at(-1).environmentKey,
    now: '2026-08-19T07:04:01.000Z'
  }));
  const destination = snapshot.environments[snapshot.activeEnvironmentKey];

  assert.deepEqual(result.events.map((event) => event.eventType), [
    'QuantumTargetSelected', 'QuantumTargetChanged', 'QuantumTravelArrived'
  ]);
  assert.equal(destination.state, 'arrived');
  assert.equal(destination.currentTarget, null);
  assert.equal(destination.lastArrival.targetObservedId, 'SYNTH_TARGET_ORISON');
  assert.equal(destination.lastArrival.vehicleClassName, 'RSI_Meteor_SYNTH');
  assert.notEqual(destination.lastArrival.vehicleEntityId, 'SYNTH_VEHICLE_ENTITY_LOCAL');
});

test('unanchored quantum records cannot create destination state', () => {
  const result = parseRuntimeLogText(
    readFixture('destination', 'quantum-unanchored-local-selection.non-event.log'),
    { ...LIVE_PROFILE_OPTIONS, sourceProfileVersion: 'draft-2026-08-19.3', gameBuild: '4.9.188.23497' }
  );
  const snapshot = toRendererDestinationSnapshot(projectRuntimeDestination(result.events));
  assert.equal(result.events.length, 0);
  assert.equal(snapshot.activeEnvironmentKey, null);
  assert.deepEqual(snapshot.environments, {});
});

function parseFixture(domain, fixtureName) {
  return parseRuntimeLogText(readFixture(domain, fixtureName), LIVE_PROFILE_OPTIONS);
}

function readFixture(domain, fixtureName) {
  return fs.readFileSync(path.join(
    FIXTURE_ROOT,
    'live',
    '4.9-pub',
    'sc-4.9-live',
    domain,
    fixtureName
  ), 'utf8');
}

function expectProjectionState(snapshot, expectedState) {
  const projection = snapshot.environments[snapshot.activeEnvironmentKey];
  assert.equal(projection.state, expectedState);
  assert.equal(projection.freshness, 'current');
}
