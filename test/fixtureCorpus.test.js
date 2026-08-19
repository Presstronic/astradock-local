const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'runtime-log');

const REQUIRED_MANIFEST_FIELDS = [
  'fixtureVersion',
  'fixtureId',
  'title',
  'releaseChannel',
  'gameBuild',
  'sourceProfileId',
  'sourceProfileVersion',
  'domain',
  'action',
  'outcome',
  'provenance',
  'evidenceBasis',
  'privacyClassification',
  'sensitivityHandling',
  'expectedCanonicalEvents',
  'expectedNonEvents',
  'correlation',
  'knownLimitations',
  'verificationNotes'
];

const CHANNELS = new Set(['LIVE', 'PTU', 'EPTU', 'HOTFIX', 'UNKNOWN', 'MULTI']);
const OUTCOMES = new Set(['observed', 'non-event', 'framing', 'isolation', 'unavailable']);
const SOURCE_PROFILES = new Set(['sc-4.9-live', 'sc-4.9-cross-env']);
const PROVENANCE = new Set([
  'sanitized_from_reviewed_private_log',
  'synthetic_edge_case',
  'unavailable_evidence_annotation'
]);
const PROMOTED_CONTRACT_STATUS = 'runtime-event/v1';
const EXPECTED_OBSERVED_EVENTS = new Set([
  'ClientBuildObserved',
  'ReleaseEnvironmentObserved',
  'GameDataVersionObserved',
  'LoginStarted',
  'AccountAuthenticated',
  'IdentityObserved',
  'PuJoinRequested',
  'PuReplicationConnectionEstablished',
  'UniverseHierarchyRegistered',
  'PuTerritorySetupCompleted',
  'PuEntered',
  'PartyCreated',
  'PartyLaunchInitiated',
  'PartyMemberConnected',
  'PartyLeft',
  'JurisdictionEntered',
  'MonitoredSpaceEntered',
  'ArmisticeStateChanged',
  'PuDisconnected',
  'ReturnedToFrontend',
  'ApplicationExited'
]);
const REQUIRED_NEGATIVE_EVENTS = new Set([
  'LocationConfirmed',
  'DestinationSet',
  'ShipOwnedOrPiloted',
  'MissionAccepted',
  'MissionObjectiveProgressed',
  'MissionCompleted',
  'CrossEnvironmentMergedIdentity'
]);
const ISSUE_9_PROMOTED_PARTY_EVENTS = new Set([
  'PartyCreated',
  'PartyLaunchInitiated',
  'PartyMemberConnected'
]);
const ISSUE_9_DEFERRED_PARTY_EVENTS = new Set([
  'PartyInviteObserved',
  'PartyJoined',
  'PartyMemberJoined',
  'PartyMemberDisconnected',
  'PartyMemberReconnected',
  'PartyMemberLeft',
  'PartyMemberRemoved',
  'PartyLeaderChanged',
  'PartyDisbanded',
  'PartyRosterReconstructedAtStartup'
]);
const ISSUE_9_PARTY_GUARD_EVENTS = new Set([
  'PartyMemberJoined',
  'PartyMemberLeft',
  'PartyMemberRemoved',
  'PartyDisbanded',
  'PartyRosterSizeChanged'
]);
const ISSUE_10_DEFERRED_MISSION_EVENTS = new Set([
  'MissionOffered',
  'MissionSharedWithPlayer',
  'MissionAccepted',
  'MissionSharedByLocalPlayer',
  'MissionObjectiveChanged',
  'MissionObjectiveCompleted',
  'MissionObjectiveFailed',
  'MissionCompleted',
  'MissionFailed',
  'MissionAbandoned',
  'MissionWithdrawn',
  'MissionExpired',
  'MissionCurrentSetConfirmedEmpty'
]);
const ISSUE_10_NEGATIVE_FIXTURES = new Set([
  'mission/mission-service-startup.non-event',
  'mission/mission-giver-asset-failure.non-event',
  'mission/tutorial-step-lifecycle.non-event',
  'mission/mission-lifecycle-transitions.unavailable',
  'negative/mission-notification-ui-lifecycle.non-event'
]);
const ISSUE_11_DEFERRED_DESTINATION_EVENTS = new Set([
  'DestinationSet',
  'DestinationChanged',
  'DestinationCleared',
  'TravelStarted',
  'TravelArrived',
  'TravelCancelled',
  'TravelFailed',
  'DestinationCurrentStateConfirmedEmpty'
]);
const ISSUE_11_NEGATIVE_FIXTURES = new Set([
  'destination/destination-travel-transitions.unavailable',
  'destination/place-name-destination-noise.non-event',
  'destination/temporal-proximity-route-noise.non-event',
  'negative/object-container-ship-navigation.non-event'
]);

const SENSITIVE_PATTERNS = [
  { name: 'ipv4 address', pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/ },
  { name: 'windows user path', pattern: /\b[A-Za-z]:\\(?:Users|Program Files|ProgramData|Windows)\\/ },
  { name: 'unix home path', pattern: /\/home\/[A-Za-z0-9._-]+|\/Users\/[A-Za-z0-9._-]+/ },
  { name: 'jwt-like token', pattern: /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/ },
  { name: 'aws access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'long hex token', pattern: /\b[0-9a-fA-F]{24,}\b/ },
  { name: 'email address', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { name: 'secret assignment', pattern: /\b(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*[^,\s\]]+/i },
  { name: 'real-looking account number', pattern: /\b(?:accountId|account_id|citizenId|playerId)\s*[:=]?\s*\d{6,}\b/i }
];

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

function relativeFixtureId(filePath) {
  const relativePath = path.relative(FIXTURE_ROOT, filePath).replaceAll(path.sep, '/');
  return relativePath.replace(/\.manifest\.json$/, '');
}

function assertNoSensitivePatterns(filePath) {
  const value = fs.readFileSync(filePath, 'utf8');
  for (const { name, pattern } of SENSITIVE_PATTERNS) {
    assert.doesNotMatch(value, pattern, `${filePath} contains ${name}`);
  }
}

function assertManifestShape(manifest, manifestPath) {
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    assert.ok(Object.hasOwn(manifest, field), `${manifestPath} missing ${field}`);
  }

  assert.equal(manifest.fixtureVersion, 1, `${manifestPath} fixtureVersion`);
  assert.equal(manifest.fixtureId, relativeFixtureId(manifestPath), `${manifestPath} fixtureId must match path`);
  assert.ok(CHANNELS.has(manifest.releaseChannel), `${manifestPath} releaseChannel`);
  assert.ok(SOURCE_PROFILES.has(manifest.sourceProfileId), `${manifestPath} sourceProfileId`);
  assert.ok(OUTCOMES.has(manifest.outcome), `${manifestPath} outcome`);
  assert.ok(PROVENANCE.has(manifest.provenance), `${manifestPath} provenance`);
  assert.ok(Array.isArray(manifest.privacyClassification), `${manifestPath} privacyClassification`);
  assert.ok(manifest.privacyClassification.includes('sanitized'), `${manifestPath} privacyClassification must include sanitized`);
  assert.equal(
    manifest.sensitivityHandling.syntheticPlaceholderPrefix,
    'SYNTH_',
    `${manifestPath} synthetic placeholder prefix`
  );
  assert.ok(Array.isArray(manifest.expectedCanonicalEvents), `${manifestPath} expectedCanonicalEvents`);
  assert.ok(Array.isArray(manifest.expectedNonEvents), `${manifestPath} expectedNonEvents`);
  assert.ok(Array.isArray(manifest.knownLimitations), `${manifestPath} knownLimitations`);
  assert.ok(manifest.correlation.dedupeKey, `${manifestPath} correlation.dedupeKey`);

  if (manifest.outcome === 'observed') {
    assert.ok(manifest.logFile, `${manifestPath} observed fixture requires logFile`);
    assert.ok(manifest.expectedCanonicalEvents.length > 0, `${manifestPath} observed fixture needs expected events`);
  }

  if (manifest.outcome === 'non-event' || manifest.outcome === 'unavailable') {
    assert.equal(manifest.expectedCanonicalEvents.length, 0, `${manifestPath} must not expect positive events`);
    assert.ok(manifest.expectedNonEvents.length > 0, `${manifestPath} requires expected non-events`);
  }

  for (const event of manifest.expectedCanonicalEvents) {
    assert.ok(event.eventType, `${manifestPath} eventType`);
    assert.ok(event.contractStatus, `${manifestPath} ${event.eventType} contractStatus`);
    assert.equal(
      event.contractStatus,
      PROMOTED_CONTRACT_STATUS,
      `${manifestPath} ${event.eventType} contractStatus must reference published runtime event contract`
    );
    assert.ok(event.confidence, `${manifestPath} ${event.eventType} confidence`);
    assert.equal(event.provenance, 'observed', `${manifestPath} ${event.eventType} provenance`);
    assert.ok(Array.isArray(event.requiredPayloadFields), `${manifestPath} ${event.eventType} requiredPayloadFields`);
    assert.ok(Array.isArray(event.evidenceMarkers), `${manifestPath} ${event.eventType} evidenceMarkers`);
    assert.ok(event.payload && typeof event.payload === 'object', `${manifestPath} ${event.eventType} payload`);

    for (const field of event.requiredPayloadFields) {
      assert.ok(
        Object.hasOwn(event.payload, field),
        `${manifestPath} ${event.eventType} payload missing required field ${field}`
      );
    }
  }

  for (const nonEvent of manifest.expectedNonEvents) {
    assert.ok(nonEvent.eventType, `${manifestPath} non-event eventType`);
    assert.ok(nonEvent.reason, `${manifestPath} non-event reason`);
  }
}

function assertLogFile(manifest, manifestPath) {
  if (!manifest.logFile) return;

  const logPath = path.join(path.dirname(manifestPath), manifest.logFile);
  assert.ok(fs.existsSync(logPath), `${manifestPath} logFile exists`);
  assert.equal(path.basename(logPath), manifest.logFile, `${manifestPath} logFile must be sibling basename`);
  assertNoSensitivePatterns(logPath);

  const logText = fs.readFileSync(logPath, 'utf8');
  assert.ok(logText.trim().length > 0, `${logPath} must not be empty`);
  assert.ok(!logText.includes('<IP>'), `${logPath} must not use ambiguous <IP> placeholder`);
  assert.ok(!logText.includes('<HANDLE>'), `${logPath} must not use ambiguous <HANDLE> placeholder`);
  assert.ok(!logText.includes('<ACCOUNT_ID>'), `${logPath} must not use ambiguous <ACCOUNT_ID> placeholder`);

  for (const event of manifest.expectedCanonicalEvents) {
    for (const marker of event.evidenceMarkers) {
      assert.ok(
        logText.includes(marker),
        `${logPath} missing evidence marker ${marker} for ${event.eventType}`
      );
    }
  }
}

function materializeFramingCase(framingCase) {
  if (framingCase.generatedLine) {
    const { prefix, repeat, repeatCount, suffix } = framingCase.generatedLine;
    return `${prefix}${repeat.repeat(repeatCount)}${suffix}`;
  }
  return (framingCase.segments || []).join('');
}

test('runtime log fixture manifests are valid, sanitized, and path-addressable', () => {
  const files = walkFiles(FIXTURE_ROOT);
  const manifests = files.filter((file) => file.endsWith('.manifest.json')).sort();
  const logs = files.filter((file) => file.endsWith('.log')).sort();

  assert.ok(manifests.length >= 10, 'expected representative manifest corpus');

  const manifestLogPaths = new Set();
  for (const manifestPath of manifests) {
    assertNoSensitivePatterns(manifestPath);
    const manifest = readJson(manifestPath);
    assertManifestShape(manifest, manifestPath);
    assertLogFile(manifest, manifestPath);

    if (manifest.logFile) {
      manifestLogPaths.add(path.join(path.dirname(manifestPath), manifest.logFile));
    }
  }

  for (const logPath of logs) {
    assert.ok(manifestLogPaths.has(logPath), `${logPath} must have sibling manifest`);
  }
});

test('runtime log fixture corpus covers issue 8 positive, negative, framing, and isolation requirements', () => {
  const manifests = walkFiles(FIXTURE_ROOT)
    .filter((file) => file.endsWith('.manifest.json'))
    .map(readJson);

  const observedEvents = new Set(manifests.flatMap((manifest) => (
    manifest.expectedCanonicalEvents.map((event) => event.eventType)
  )));
  const negativeEvents = new Set(manifests.flatMap((manifest) => (
    manifest.expectedNonEvents.map((event) => event.eventType)
  )));
  const outcomes = new Set(manifests.map((manifest) => manifest.outcome));

  for (const eventType of EXPECTED_OBSERVED_EVENTS) {
    assert.ok(observedEvents.has(eventType), `missing observed coverage for ${eventType}`);
  }

  for (const eventType of REQUIRED_NEGATIVE_EVENTS) {
    assert.ok(negativeEvents.has(eventType), `missing negative coverage for ${eventType}`);
  }

  for (const outcome of ['observed', 'non-event', 'framing', 'isolation', 'unavailable']) {
    assert.ok(outcomes.has(outcome), `missing ${outcome} fixture outcome`);
  }
});

test('privacy scanner rejects representative unsafe fixture content', () => {
  const samples = [
    { name: 'ipv4 address', value: '<Join PU> address[203.0.113.42]' },
    { name: 'windows user path', value: 'SourcePath[C:\\Users\\Player\\StarCitizen\\LIVE\\game.log]' },
    { name: 'unix home path', value: 'SourcePath[/home/player/Games/star-citizen/game.log]' },
    { name: 'jwt-like token', value: 'token=eyJaaaaaaaaaaaa.bbbbbbbbbbbbb.ccccccccccccc' },
    { name: 'long hex token', value: 'session=0123456789abcdef0123456789abcdef' },
    { name: 'secret assignment', value: 'password=do-not-commit' },
    { name: 'real-looking account number', value: 'accountId 1234567890' }
  ];

  for (const sample of samples) {
    const scanner = SENSITIVE_PATTERNS.find(({ name }) => name === sample.name);
    assert.ok(scanner, `missing scanner for ${sample.name}`);
    assert.match(sample.value, scanner.pattern, `${sample.name} sample must be rejected`);
  }
});

test('issue 9 party lifecycle evidence gates promoted and deferred events', () => {
  const evidenceMatrixPath = path.join(__dirname, '..', 'docs', 'party-lifecycle-evidence-matrix.md');
  assertNoSensitivePatterns(evidenceMatrixPath);

  const evidenceMatrix = fs.readFileSync(evidenceMatrixPath, 'utf8');
  for (const requiredText of [
    'Issue #9 evidence spike result',
    'PartyCreated',
    'PartyLaunchInitiated',
    'PartyMemberConnected',
    'marker-only',
    'mid-party',
    'Privacy Review',
    'Technology and Libraries'
  ]) {
    assert.ok(evidenceMatrix.includes(requiredText), `party evidence matrix missing ${requiredText}`);
  }

  const partyManifests = walkFiles(path.join(FIXTURE_ROOT, 'live', '4.9-pub', 'sc-4.9-live', 'party'))
    .filter((file) => file.endsWith('.manifest.json'))
    .map(readJson);

  const promotedEvents = new Set(partyManifests.flatMap((manifest) => (
    manifest.expectedCanonicalEvents.map((event) => event.eventType)
  )));
  const deferredEvents = new Set(partyManifests.flatMap((manifest) => (
    manifest.expectedNonEvents.map((event) => event.eventType)
  )));
  const unavailableManifest = partyManifests.find((manifest) => (
    manifest.fixtureId.endsWith('/party-lifecycle-transitions.unavailable')
  ));
  const markerGuardManifest = partyManifests.find((manifest) => (
    manifest.fixtureId.endsWith('/party-marker-only-membership.non-event')
  ));

  assert.ok(unavailableManifest, 'issue 9 unavailable party lifecycle annotation is required');
  assert.equal(unavailableManifest.outcome, 'unavailable');
  assert.ok(markerGuardManifest, 'issue 9 marker-only party guard fixture is required');
  assert.equal(markerGuardManifest.outcome, 'non-event');

  for (const eventType of ISSUE_9_PROMOTED_PARTY_EVENTS) {
    assert.ok(promotedEvents.has(eventType), `missing promoted issue 9 event ${eventType}`);
  }

  for (const eventType of ISSUE_9_DEFERRED_PARTY_EVENTS) {
    assert.ok(deferredEvents.has(eventType), `missing deferred issue 9 event gate ${eventType}`);
  }

  const markerGuardEvents = new Set(markerGuardManifest.expectedNonEvents.map((event) => event.eventType));
  for (const eventType of ISSUE_9_PARTY_GUARD_EVENTS) {
    assert.ok(markerGuardEvents.has(eventType), `marker-only fixture must guard ${eventType}`);
  }
});

test('issue 10 mission lifecycle evidence gates unsupported transitions', () => {
  const evidenceMatrixPath = path.join(__dirname, '..', 'docs', 'mission-lifecycle-evidence-matrix.md');
  assertNoSensitivePatterns(evidenceMatrixPath);

  const evidenceMatrix = fs.readFileSync(evidenceMatrixPath, 'utf8');
  for (const requiredText of [
    'Issue #10 evidence spike result',
    'MissionOffered',
    'MissionSharedWithPlayer',
    'MissionAccepted',
    'MissionObjectiveCompleted',
    'MissionCompleted',
    'MissionCurrentSetConfirmedEmpty',
    'unsupported',
    'unknown',
    'Privacy Review',
    'Technology and Libraries'
  ]) {
    assert.ok(evidenceMatrix.includes(requiredText), `mission evidence matrix missing ${requiredText}`);
  }

  const relevantManifests = walkFiles(path.join(FIXTURE_ROOT, 'live', '4.9-pub', 'sc-4.9-live'))
    .filter((file) => file.endsWith('.manifest.json'))
    .map(readJson)
    .filter((manifest) => ISSUE_10_NEGATIVE_FIXTURES.has(
      manifest.fixtureId.replace('live/4.9-pub/sc-4.9-live/', '')
    ));

  const fixtureIds = new Set(relevantManifests.map((manifest) => (
    manifest.fixtureId.replace('live/4.9-pub/sc-4.9-live/', '')
  )));
  const deferredEvents = new Set(relevantManifests.flatMap((manifest) => (
    manifest.expectedNonEvents.map((event) => event.eventType)
  )));
  const promotedMissionEvents = relevantManifests.flatMap((manifest) => (
    manifest.expectedCanonicalEvents.filter((event) => event.eventType.startsWith('Mission'))
  ));
  const unavailableManifest = relevantManifests.find((manifest) => (
    manifest.fixtureId.endsWith('/mission-lifecycle-transitions.unavailable')
  ));

  for (const fixtureId of ISSUE_10_NEGATIVE_FIXTURES) {
    assert.ok(fixtureIds.has(fixtureId), `missing issue 10 fixture ${fixtureId}`);
  }

  assert.ok(unavailableManifest, 'issue 10 unavailable mission lifecycle annotation is required');
  assert.equal(unavailableManifest.outcome, 'unavailable');
  assert.equal(promotedMissionEvents.length, 0, 'issue 10 must not promote mission canonical events');

  for (const eventType of ISSUE_10_DEFERRED_MISSION_EVENTS) {
    assert.ok(deferredEvents.has(eventType), `missing deferred issue 10 event gate ${eventType}`);
  }
});

test('issue 11 destination and travel evidence gates unsupported transitions', () => {
  const evidenceMatrixPath = path.join(__dirname, '..', 'docs', 'destination-travel-evidence-matrix.md');
  assertNoSensitivePatterns(evidenceMatrixPath);

  const evidenceMatrix = fs.readFileSync(evidenceMatrixPath, 'utf8');
  for (const requiredText of [
    'Issue #11 evidence spike result',
    'DestinationSet',
    'DestinationChanged',
    'DestinationCleared',
    'TravelStarted',
    'TravelArrived',
    'TravelCancelled',
    'TravelFailed',
    'DestinationCurrentStateConfirmedEmpty',
    'object-container',
    'place-name',
    'Temporal',
    'unsupported',
    'unknown',
    'Privacy Review',
    'Technology and Libraries'
  ]) {
    assert.ok(evidenceMatrix.includes(requiredText), `destination evidence matrix missing ${requiredText}`);
  }

  const relevantManifests = walkFiles(path.join(FIXTURE_ROOT, 'live', '4.9-pub', 'sc-4.9-live'))
    .filter((file) => file.endsWith('.manifest.json'))
    .map(readJson)
    .filter((manifest) => ISSUE_11_NEGATIVE_FIXTURES.has(
      manifest.fixtureId.replace('live/4.9-pub/sc-4.9-live/', '')
    ));

  const fixtureIds = new Set(relevantManifests.map((manifest) => (
    manifest.fixtureId.replace('live/4.9-pub/sc-4.9-live/', '')
  )));
  const deferredEvents = new Set(relevantManifests.flatMap((manifest) => (
    manifest.expectedNonEvents.map((event) => event.eventType)
  )));
  const promotedDestinationEvents = relevantManifests.flatMap((manifest) => (
    manifest.expectedCanonicalEvents.filter((event) => (
      event.eventType.startsWith('Destination') || event.eventType.startsWith('Travel')
    ))
  ));
  const unavailableManifest = relevantManifests.find((manifest) => (
    manifest.fixtureId.endsWith('/destination-travel-transitions.unavailable')
  ));

  for (const fixtureId of ISSUE_11_NEGATIVE_FIXTURES) {
    assert.ok(fixtureIds.has(fixtureId), `missing issue 11 fixture ${fixtureId}`);
  }

  assert.ok(unavailableManifest, 'issue 11 unavailable destination/travel lifecycle annotation is required');
  assert.equal(unavailableManifest.outcome, 'unavailable');
  assert.equal(promotedDestinationEvents.length, 0, 'issue 11 must not promote destination or travel canonical events');

  for (const eventType of ISSUE_11_DEFERRED_DESTINATION_EVENTS) {
    assert.ok(deferredEvents.has(eventType), `missing deferred issue 11 event gate ${eventType}`);
  }
});

test('malformed manifests and unknown profiles fail with clear assertions', () => {
  const goodManifestPath = path.join(
    FIXTURE_ROOT,
    'live',
    '4.9-pub',
    'sc-4.9-live',
    'spine',
    'client-build-environment.observed.manifest.json'
  );
  const goodManifest = readJson(goodManifestPath);

  assert.throws(
    () => assertManifestShape({ ...goodManifest, sourceProfileId: 'unknown-profile' }, goodManifestPath),
    /sourceProfileId/
  );

  const missingAction = { ...goodManifest };
  delete missingAction.action;
  assert.throws(
    () => assertManifestShape(missingAction, goodManifestPath),
    /missing action/
  );

  assert.throws(
    () => assertManifestShape({ ...goodManifest, expectedCanonicalEvents: [] }, goodManifestPath),
    /expected events/
  );
});

test('environment isolation fixture declares separate LIVE and PTU partitions', () => {
  const manifestPath = path.join(
    FIXTURE_ROOT,
    'multi',
    '4.9-pub',
    'sc-4.9-cross-env',
    'environment',
    'live-ptu-identical-identifiers.isolation.manifest.json'
  );
  const manifest = readJson(manifestPath);
  const environmentKeys = manifest.expectedCanonicalEvents.map((event) => event.payload.environmentKey);

  assert.equal(environmentKeys.length, 2);
  assert.notEqual(environmentKeys[0], environmentKeys[1]);
  assert.ok(environmentKeys.some((key) => key.startsWith('LIVE::')));
  assert.ok(environmentKeys.some((key) => key.startsWith('PTU::')));
  assert.ok(
    manifest.expectedNonEvents.some((event) => event.eventType === 'CrossEnvironmentMergedIdentity'),
    'cross-environment merge must be explicitly forbidden'
  );
});

test('framing manifests generate deterministic edge-case data', () => {
  const framingManifests = walkFiles(FIXTURE_ROOT)
    .filter((file) => file.endsWith('.manifest.json'))
    .map(readJson)
    .filter((manifest) => manifest.outcome === 'framing');

  assert.ok(framingManifests.length >= 2, 'expected framing manifests');

  for (const manifest of framingManifests) {
    if (!manifest.framingCases) continue;

    for (const framingCase of manifest.framingCases) {
      if (framingCase.fileLifecycle) {
        assert.ok(
          Array.isArray(framingCase.fileLifecycle) && framingCase.fileLifecycle.length >= 2,
          `${manifest.fixtureId}:${framingCase.caseId} file lifecycle`
        );
        assert.ok(
          framingCase.expectedBehavior,
          `${manifest.fixtureId}:${framingCase.caseId} expected lifecycle behavior`
        );
        continue;
      }

      const text = materializeFramingCase(framingCase);
      assert.ok(text.length > 0, `${manifest.fixtureId}:${framingCase.caseId} generated text`);

      if (framingCase.expectedCompleteLineCount) {
        const lines = text.split(/\r?\n/).filter(Boolean);
        assert.equal(
          lines.length,
          framingCase.expectedCompleteLineCount,
          `${manifest.fixtureId}:${framingCase.caseId} line count`
        );
      }

      if (framingCase.expectedMinimumBytes) {
        assert.ok(
          Buffer.byteLength(text, 'utf8') >= framingCase.expectedMinimumBytes,
          `${manifest.fixtureId}:${framingCase.caseId} minimum byte length`
        );
      }
    }
  }
});
