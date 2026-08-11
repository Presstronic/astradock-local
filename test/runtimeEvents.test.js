const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  CONTRACT_VERSION,
  EVENT_TYPE_REGISTRY,
  RUNTIME_EVENT_EXAMPLES,
  createRuntimeEvent,
  deserializeRuntimeEvent,
  deriveRuntimeEventId,
  serializeRuntimeEvent,
  toPersistenceRecord,
  validateRuntimeEvent
} = require('../src/contracts/runtimeEvents');

const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'runtime-log');
const UNPROVEN_EVENT_PREFIXES = ['Destination', 'Travel', 'Mission'];
const DEFERRED_PARTY_EVENTS = new Set([
  'PartyInviteObserved',
  'PartyJoined',
  'PartyMemberJoined',
  'PartyMemberDisconnected',
  'PartyMemberReconnected',
  'PartyLeft',
  'PartyMemberLeft',
  'PartyMemberRemoved',
  'PartyLeaderChanged',
  'PartyDisbanded',
  'PartyRosterReconstructedAtStartup',
  'PartyMarkerObserved',
  'PartyMarkerRemoved'
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function walkFiles(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) return walkFiles(entryPath);
    return entryPath;
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validationCodes(result) {
  assert.equal(result.ok, false, 'expected validation failure');
  return new Set(result.errors.map((error) => error.code));
}

test('runtime event registry exposes validated examples for every supported event type', () => {
  const eventTypes = Object.keys(EVENT_TYPE_REGISTRY);

  assert.ok(eventTypes.length >= 20, 'expected MVP runtime contract coverage');
  assert.deepEqual(Object.keys(RUNTIME_EVENT_EXAMPLES).sort(), eventTypes.sort());

  for (const eventType of eventTypes) {
    const example = RUNTIME_EVENT_EXAMPLES[eventType];
    const result = validateRuntimeEvent(example);

    assert.equal(result.ok, true, `${eventType} example must validate`);
    assert.equal(example.contractVersion, CONTRACT_VERSION);
    assert.equal(example.eventType, eventType);
    assert.equal(example.eventId, deriveRuntimeEventId(example), `${eventType} event ID`);
    assert.equal(example.traits.stationSyncPolicy, 'never', `${eventType} must remain local-only in MVP`);
    assert.ok(example.environmentKey.startsWith(`${example.gameChannel}::`), `${eventType} environment key`);
    assert.ok(!JSON.stringify(example.evidenceReference).includes('rawLine'), `${eventType} evidence must be referenced`);
  }
});

test('fixture-promoted canonical events are covered by the runtime event registry', () => {
  const manifests = walkFiles(FIXTURE_ROOT)
    .filter((file) => file.endsWith('.manifest.json'))
    .map(readJson);

  const promotedEventTypes = new Set(manifests.flatMap((manifest) => (
    manifest.expectedCanonicalEvents.map((event) => event.eventType)
  )));

  for (const eventType of promotedEventTypes) {
    assert.ok(EVENT_TYPE_REGISTRY[eventType], `missing contract for promoted fixture event ${eventType}`);
  }

  for (const eventType of Object.keys(EVENT_TYPE_REGISTRY)) {
    assert.equal(
      UNPROVEN_EVENT_PREFIXES.some((prefix) => eventType.startsWith(prefix)),
      false,
      `${eventType} must not be promoted before fixture evidence`
    );
    assert.equal(DEFERRED_PARTY_EVENTS.has(eventType), false, `${eventType} is still deferred by issue 9 evidence`);
  }
});

test('runtime events serialize and deserialize deterministically for persistence-shaped records', () => {
  for (const [eventType, event] of Object.entries(RUNTIME_EVENT_EXAMPLES)) {
    const serialized = serializeRuntimeEvent(event);
    const deserialized = deserializeRuntimeEvent(serialized);
    const persistenceRecord = toPersistenceRecord(deserialized);

    assert.deepEqual(deserialized, event, `${eventType} serialized round-trip`);
    assert.equal(serializeRuntimeEvent(deserialized), serialized, `${eventType} stable serialization`);
    assert.equal(persistenceRecord.eventId, event.eventId, `${eventType} persistence eventId`);
    assert.equal(persistenceRecord.environmentKey, event.environmentKey, `${eventType} persistence environmentKey`);
    assert.equal(persistenceRecord.serializedEvent, serialized, `${eventType} persistence payload`);
    assert.doesNotThrow(() => deserializeRuntimeEvent(persistenceRecord.serializedEvent));
  }
});

test('contract validation fails safely for missing fields, malformed timestamps, and unsupported versions', () => {
  const missingField = clone(RUNTIME_EVENT_EXAMPLES.PuJoinRequested);
  delete missingField.payload.shard;
  assert.ok(validationCodes(validateRuntimeEvent(missingField)).has('missing_payload_field'));

  const timestampCandidate = clone(RUNTIME_EVENT_EXAMPLES.PuJoinRequested);
  timestampCandidate.sourceTimestamp = '2026-08-09 12:00:00Z';
  assert.ok(validationCodes(validateRuntimeEvent(timestampCandidate)).has('nondeterministic_timestamp'));

  const unsupportedVersion = clone(RUNTIME_EVENT_EXAMPLES.PuJoinRequested);
  unsupportedVersion.contractVersion = 'runtime-event/v2';
  assert.ok(validationCodes(validateRuntimeEvent(unsupportedVersion)).has('unsupported_contract_version'));

  const portCandidate = clone(RUNTIME_EVENT_EXAMPLES.PuJoinRequested);
  portCandidate.payload.port = 70000;
  assert.ok(validationCodes(validateRuntimeEvent(portCandidate)).has('payload_number_too_large'));

  const extraPayload = clone(RUNTIME_EVENT_EXAMPLES.PuJoinRequested);
  extraPayload.payload.unregisteredField = 'SYNTH_EXTRA_VALUE';
  assert.ok(validationCodes(validateRuntimeEvent(extraPayload)).has('unknown_payload_field'));
});

test('contract validation rejects conflicting context and unknown vocabulary', () => {
  const conflictingContext = clone(RUNTIME_EVENT_EXAMPLES.IdentityObserved);
  conflictingContext.environment.environmentKey = 'PTU::PU::4.9.0-LIVE.9000000-SYNTH::sc-4.9-live';
  assert.ok(validationCodes(validateRuntimeEvent(conflictingContext)).has('environment_key_mismatch'));

  const unknownEnum = clone(RUNTIME_EVENT_EXAMPLES.ReleaseEnvironmentObserved);
  unknownEnum.environment.releaseChannel = 'NIGHTLY';
  assert.ok(validationCodes(validateRuntimeEvent(unknownEnum)).has('invalid_enum'));

  const unknownPayloadEnum = clone(RUNTIME_EVENT_EXAMPLES.ArmisticeStateChanged);
  unknownPayloadEnum.payload.state = 'maybe';
  assert.ok(validationCodes(validateRuntimeEvent(unknownPayloadEnum)).has('invalid_payload_enum'));
});

test('identical observed identifiers remain distinct across LIVE and PTU environment keys', () => {
  const liveEvent = RUNTIME_EVENT_EXAMPLES.IdentityObserved;
  const ptuEnvironment = {
    ...clone(liveEvent.environment),
    environmentKey: 'PTU::PU::4.9.0-LIVE.9000000-SYNTH::sc-4.9-live',
    releaseChannel: 'PTU',
    rawEnvironmentTag: 'PTU',
    sourceInstallationId: 'SYNTH_INSTALLATION_PTU'
  };
  const ptuEvent = createRuntimeEvent({
    ...clone(liveEvent),
    environmentKey: ptuEnvironment.environmentKey,
    environment: ptuEnvironment,
    gameChannel: 'PTU'
  });

  assert.notEqual(liveEvent.environmentKey, ptuEvent.environmentKey);
  assert.notEqual(liveEvent.eventId, ptuEvent.eventId);
  assert.deepEqual(liveEvent.payload, ptuEvent.payload, 'identity identifiers intentionally match across partitions');
});

test('validation rejects inferred events without traceable contributors and reasons', () => {
  const inferred = createRuntimeEvent({
    ...clone(RUNTIME_EVENT_EXAMPLES.ReturnedToFrontend),
    provenance: 'inferred',
    derivation: {
      reason: 'contract test',
      contributingEventIds: [RUNTIME_EVENT_EXAMPLES.PuDisconnected.eventId]
    }
  });
  const invalidInferred = clone(inferred);
  delete invalidInferred.derivation;

  assert.equal(validateRuntimeEvent(inferred).ok, true);
  assert.ok(validationCodes(validateRuntimeEvent(invalidInferred)).has('missing_derivation'));
});

test('validation errors do not echo raw evidence or sensitive values', () => {
  const rawLine = 'SENSITIVE_SYNTH_RAW_LINE_SHOULD_NOT_APPEAR_IN_ERRORS';
  const candidate = clone(RUNTIME_EVENT_EXAMPLES.PartyMemberConnected);
  candidate.evidenceReference.rawLine = rawLine;

  const result = validateRuntimeEvent(candidate);
  assert.equal(result.ok, false);
  assert.ok(validationCodes(result).has('raw_evidence_forbidden'));
  assert.equal(JSON.stringify(result.errors).includes(rawLine), false);

  const payloadLeak = clone(RUNTIME_EVENT_EXAMPLES.PartyMemberConnected);
  payloadLeak.payload.rawLine = rawLine;
  const payloadLeakResult = validateRuntimeEvent(payloadLeak);
  assert.equal(payloadLeakResult.ok, false);
  assert.ok(validationCodes(payloadLeakResult).has('raw_evidence_forbidden'));
  assert.equal(JSON.stringify(payloadLeakResult.errors).includes(rawLine), false);
});
