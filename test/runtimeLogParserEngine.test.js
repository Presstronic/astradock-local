const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  BUILT_IN_RUNTIME_LOG_PROFILES
} = require('../src/runtimeLogProfiles');
const {
  RuntimeLogLineFramer,
  RuntimeLogParserEngine,
  RuntimeLogProfileValidationError,
  loadRuntimeLogProfiles,
  parseRuntimeLogText
} = require('../src/runtimeLogParserEngine');
const {
  compareRuntimeEventOrder,
  validateRuntimeEvent
} = require('../src/contracts/runtimeEvents');

const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'runtime-log');
const LIVE_PROFILE_OPTIONS = {
  sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log',
  sourceProfileId: 'sc-4.9-live',
  gameBuild: '4.9.0-LIVE.9000000-SYNTH',
  ingestedAt: '2026-08-09T21:00:00.000Z'
};

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

function observedManifests() {
  return walkFiles(path.join(FIXTURE_ROOT, 'live', '4.9-pub', 'sc-4.9-live'))
    .filter((file) => file.endsWith('.manifest.json'))
    .map((manifestPath) => ({ manifestPath, manifest: readJson(manifestPath) }))
    .filter(({ manifest }) => manifest.expectedCanonicalEvents.length > 0 && manifest.logFile);
}

function eventProjection(events) {
  return events.map((event) => ({
    eventType: event.eventType,
    payload: event.payload,
    sourceProfileId: event.sourceProfileId,
    sourceProfileVersion: event.sourceProfileVersion,
    parserVersion: event.parserVersion
  }));
}

function expectedProjection(manifest) {
  return manifest.expectedCanonicalEvents.map((event) => ({
    eventType: event.eventType,
    payload: event.payload
  }));
}

function assertPayloadIncludes(actual, expected, context) {
  assert.equal(actual.eventType, expected.eventType, `${context} eventType`);
  for (const [key, value] of Object.entries(expected.payload)) {
    assert.deepEqual(actual.payload[key], value, `${context} payload.${key}`);
  }
}

test('line framer preserves CRLF, LF, split UTF-8, and incomplete trailing lines', () => {
  const framer = new RuntimeLogLineFramer();
  const first = framer.push(Buffer.concat([
    Buffer.from('<2026-08-09T19:00:00.000Z> alpha\r\n<2026-08-09T19:00:01.000Z> split-', 'utf8'),
    Buffer.from([0xc3])
  ]));
  const second = framer.push(Buffer.concat([
    Buffer.from([0xa9]),
    Buffer.from('\n<2026-08-09T19:00:02.000Z> partial', 'utf8')
  ]));
  const ended = framer.end();

  assert.deepEqual(first.lines.map((line) => line.text), ['<2026-08-09T19:00:00.000Z> alpha']);
  assert.deepEqual(second.lines.map((line) => line.text), ['<2026-08-09T19:00:01.000Z> split-\u00e9']);
  assert.equal(ended.lines.length, 0);
  assert.ok(ended.diagnostics.some((diagnostic) => diagnostic.code === 'incomplete_line_retained'));
});

test('line framer quarantines invalid UTF-8 and oversized lines without emitting raw text', () => {
  const framer = new RuntimeLogLineFramer({ maxLineBytes: 32 });
  const output = framer.push(Buffer.concat([
    Buffer.from('<2026-08-09T19:00:00.000Z> ', 'utf8'),
    Buffer.from([0xff]),
    Buffer.from('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n', 'utf8')
  ]));

  assert.equal(output.lines.length, 0);
  assert.ok(output.diagnostics.some((diagnostic) => diagnostic.code === 'invalid_utf8'));
  assert.ok(output.diagnostics.some((diagnostic) => diagnostic.code === 'line_too_long'));
  assert.equal(JSON.stringify(output.diagnostics).includes('AAAAAAAA'), false);
});

test('profile loader validates schema, ordering, dispatch metadata, and event mappings', () => {
  const loaded = loadRuntimeLogProfiles(BUILT_IN_RUNTIME_LOG_PROFILES);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.profiles[0].id, 'sc-4.9-live');
  assert.ok(loaded.profiles[0].extractors.every((extractor) => extractor.literals.length > 0));
  assert.ok(Object.keys(loaded.profiles[0].fieldAliases).length > 0);
  assert.ok(loaded.profiles[0].extractors
    .filter((extractor) => extractor.eventType)
    .every((extractor) => extractor.requiredFields.length > 0));

  const invalid = {
    ...BUILT_IN_RUNTIME_LOG_PROFILES[0],
    extractors: [
      ...BUILT_IN_RUNTIME_LOG_PROFILES[0].extractors,
      { id: 'party.created', kind: 'partyCreated', literals: ['PartyCreated'] }
    ]
  };
  const invalidResult = loadRuntimeLogProfiles([invalid]);
  assert.equal(invalidResult.ok, false);
  assert.ok(invalidResult.errors.some((error) => error.code === 'duplicate_extractor_id'));

  const missingMapping = {
    ...BUILT_IN_RUNTIME_LOG_PROFILES[0],
    extractors: [
      {
        id: 'missing.mapping',
        kind: 'partyCreated',
        literals: ['PartyCreated'],
        confidence: 'medium',
        sensitivity: 'social',
        evidenceMarkers: ['PartyCreated']
      }
    ]
  };
  const missingMappingResult = loadRuntimeLogProfiles([missingMapping]);
  assert.equal(missingMappingResult.ok, false);
  assert.ok(missingMappingResult.errors.some((error) => error.code === 'invalid_event_mapping'));
  assert.ok(missingMappingResult.errors.some((error) => error.code === 'invalid_required_fields'));

  assert.throws(
    () => new RuntimeLogParserEngine({ profiles: [{ id: 'broken' }] }),
    RuntimeLogProfileValidationError
  );
});

test('fixture-backed promoted profiles emit canonical runtime-event/v1 payloads deterministically', () => {
  for (const { manifestPath, manifest } of observedManifests()) {
    const logText = fs.readFileSync(path.join(path.dirname(manifestPath), manifest.logFile), 'utf8');
    const contiguous = parseRuntimeLogText(logText, {
      ...LIVE_PROFILE_OPTIONS,
      fixtureId: manifest.fixtureId,
      gameBuild: manifest.gameBuild,
      sourceProfileVersion: manifest.sourceProfileVersion
    });
    const split = parseRuntimeLogText(logText, {
      ...LIVE_PROFILE_OPTIONS,
      fixtureId: manifest.fixtureId,
      gameBuild: manifest.gameBuild,
      sourceProfileVersion: manifest.sourceProfileVersion,
      chunkSizes: [1, 2, 5, 13, 64]
    });
    const actual = eventProjection(contiguous.events);
    const expected = expectedProjection(manifest);

    assert.equal(contiguous.selectedProfile.id, manifest.sourceProfileId, `${manifest.fixtureId} profile`);
    assert.deepEqual(
      split.events.map((event) => event.eventId),
      contiguous.events.map((event) => event.eventId),
      `${manifest.fixtureId} split chunks must preserve canonical event identity`
    );
    assert.equal(actual.length, expected.length, `${manifest.fixtureId} event count`);

    actual.forEach((event, index) => {
      assertPayloadIncludes(event, expected[index], `${manifest.fixtureId}[${index}]`);
      assert.equal(event.sourceProfileId, manifest.sourceProfileId);
      assert.equal(event.sourceProfileVersion, manifest.sourceProfileVersion);
      assert.ok(event.parserVersion.startsWith('runtime-log-parser/'));
    });

    for (const event of contiguous.events) {
      assert.equal(validateRuntimeEvent(event).ok, true, `${manifest.fixtureId} ${event.eventType} validates`);
      assert.equal(JSON.stringify(event).includes('rawLine'), false);
    }
    assert.deepEqual(
      contiguous.events.map((event) => event.ordering.ingestionSequence),
      contiguous.events.map((_event, index) => index + 1),
      `${manifest.fixtureId} ingestion sequence`
    );
  }
});

test('mesh diagnostics require a completed network hierarchy and PU territory context', () => {
  const result = parseRuntimeLogText([
    '<2026-08-19T02:10:00.000Z> <RegisterUniverseHierarchy_Begin> bNetRecvd="0" nodeCount="1"',
    '<2026-08-19T02:10:00.010Z> <RegisterUniverseHierarchy_End>',
    '<2026-08-19T02:10:00.020Z> <ContextEstablisherTaskFinished> taskname="SetupTerritories" gamerules="SC_Frontend" status="Finished" runningTime=0.000010',
    '<2026-08-19T02:10:01.000Z> <RegisterUniverseHierarchy_Begin> bNetRecvd="1" nodeCount="197018"'
  ].join('\n') + '\n', LIVE_PROFILE_OPTIONS);

  assert.deepEqual(result.events, []);
});

test('matched evidence with an offset-less timestamp is diagnosed and not promoted', () => {
  const result = parseRuntimeLogText(
    '<2026-08-19T23:10:50.145> [Notice] <SHUDEvent_OnNotification> Added notification "Entered Monitored Space: " [0] to queue. New queue size: 1, MissionId: [00000000-0000-0000-0000-000000000000], ObjectiveId: []\n',
    LIVE_PROFILE_OPTIONS
  );

  assert.deepEqual(result.events, []);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'timestamp_ambiguous'));
  assert.ok(result.unknownEvidence.some((evidence) => evidence.reason === 'timestamp_ambiguous'));
  assert.equal(JSON.stringify(result.diagnostics).includes('2026-08-19T23:10:50.145'), false);
});

test('4.9.188 alternative PU-ready sequence is ordered, bounded, and idempotent', () => {
  const valid = parseRuntimeLogText([
    '<2026-08-19T07:06:05.000Z> <Join PU> address[replicant-ready.example.invalid] port[64332] shard[SYNTH_SHARD_READY] locationId[SYNTH_LOCATION_READY]',
    '<2026-08-19T07:06:06.000Z> <ContextEstablisherTaskFinished> taskname="SetupTerritories" gamerules="SC_Default" status="Finished" runningTime=0.000009',
    '<2026-08-19T07:06:06.250Z> <[GameRules] GameRulesActionEvent_GameModeCreated> Game mode created',
    '<2026-08-19T07:06:17.000Z> <Initializing Game Telemetry> Initializing game telemetry component of local player',
    '<2026-08-19T07:06:18.000Z> <Initializing Game Telemetry> Initializing game telemetry component of local player'
  ].join('\n') + '\n', { ...LIVE_PROFILE_OPTIONS, gameBuild: '4.9.188.23497' });

  assert.equal(valid.events.filter((event) => event.eventType === 'PuEntered').length, 1);
  assert.equal(valid.events.find((event) => event.eventType === 'PuEntered').payload.loadDurationSeconds, 12);

  const invalidSequences = [
    [
      '<2026-08-19T07:06:05.000Z> <Join PU> address[replicant-ready.example.invalid] port[64332] shard[SYNTH_SHARD_READY] locationId[SYNTH_LOCATION_READY]',
      '<2026-08-19T07:06:06.250Z> <[GameRules] GameRulesActionEvent_GameModeCreated> Game mode created',
      '<2026-08-19T07:06:17.000Z> <Initializing Game Telemetry> Initializing game telemetry component of local player'
    ],
    [
      '<2026-08-19T07:06:05.000Z> <Join PU> address[replicant-ready.example.invalid] port[64332] shard[SYNTH_SHARD_READY] locationId[SYNTH_LOCATION_READY]',
      '<2026-08-19T07:06:06.250Z> <[GameRules] GameRulesActionEvent_GameModeCreated> Game mode created',
      '<2026-08-19T07:06:07.000Z> <ContextEstablisherTaskFinished> taskname="SetupTerritories" gamerules="SC_Default" status="Finished" runningTime=0.000009',
      '<2026-08-19T07:06:17.000Z> <Initializing Game Telemetry> Initializing game telemetry component of local player'
    ],
    [
      '<2026-08-19T07:00:00.000Z> <Join PU> address[replicant-ready.example.invalid] port[64332] shard[SYNTH_SHARD_READY] locationId[SYNTH_LOCATION_READY]',
      '<2026-08-19T07:00:01.000Z> <ContextEstablisherTaskFinished> taskname="SetupTerritories" gamerules="SC_Default" status="Finished" runningTime=0.000009',
      '<2026-08-19T07:00:02.000Z> <[GameRules] GameRulesActionEvent_GameModeCreated> Game mode created',
      '<2026-08-19T07:06:00.000Z> <Initializing Game Telemetry> Initializing game telemetry component of local player'
    ]
  ];

  for (const lines of invalidSequences) {
    const result = parseRuntimeLogText(lines.join('\n') + '\n', { ...LIVE_PROFILE_OPTIONS, gameBuild: '4.9.188.23497' });
    assert.equal(result.events.some((event) => event.eventType === 'PuEntered'), false);
  }
});

test('repeated PU sessions do not dedupe identical ready payloads', () => {
  const sequence = (minute, endpoint, shard) => [
    `<2026-08-19T07:${minute}:00.000Z> <Join PU> address[${endpoint}] port[64332] shard[${shard}] locationId[SYNTH_LOCATION_READY]`,
    `<2026-08-19T07:${minute}:01.000Z> <ContextEstablisherTaskFinished> taskname="SetupTerritories" gamerules="SC_Default" status="Finished" runningTime=0.000009`,
    `<2026-08-19T07:${minute}:01.250Z> <[GameRules] GameRulesActionEvent_GameModeCreated> Game mode created`,
    `<2026-08-19T07:${minute}:12.000Z> <Initializing Game Telemetry> Initializing game telemetry component of local player`
  ];
  const result = parseRuntimeLogText([
    ...sequence('06', 'replicant-one.example.invalid', 'SYNTH_SHARD_070'),
    '<2026-08-19T07:10:00.000Z> <Channel Disconnected> cause=30016 reason="SYNTH_EXIT" isRemote=0 gamerules="SC_Default" remoteAddr=replicant-one.example.invalid:64332 uptime_secs=234',
    ...sequence('11', 'replicant-two.example.invalid', 'SYNTH_SHARD_110')
  ].join('\n') + '\n', { ...LIVE_PROFILE_OPTIONS, gameBuild: '4.9.188.23497' });

  assert.equal(result.events.filter((event) => event.eventType === 'PuTerritorySetupCompleted').length, 2);
  assert.equal(result.events.filter((event) => event.eventType === 'PuEntered').length, 2);
  assert.equal(new Set(result.events.filter((event) => event.eventType === 'PuEntered').map((event) => event.eventId)).size, 2);
});

test('legacy OnClientEnteredGame accepts SC_Default only', () => {
  const result = parseRuntimeLogText([
    '<2026-08-19T07:05:39.510Z> taskname="OnClientEnteredGame" state=eCVS_InGame(17) status="Finished" rules="SC_Frontend" elapsedSecs=1',
    '<2026-08-19T07:06:17.000Z> taskname="OnClientEnteredGame" state=eCVS_InGame(17) status="Finished" rules="SC_Default" elapsedSecs=12'
  ].join('\n') + '\n', LIVE_PROFILE_OPTIONS);
  assert.deepEqual(result.events.map((event) => event.eventType), ['PuEntered']);
  assert.equal(result.events[0].payload.gamerules, 'SC_Default');
});

test('malformed current notifications fail closed with privacy-safe diagnostics', () => {
  const result = parseRuntimeLogText(
    '<2026-08-19T07:06:45.175Z> <SHUDEvent_OnNotification> Added notification "Entered Monitored Space: " [NOT_AN_ID] to queue.\n',
    { ...LIVE_PROFILE_OPTIONS, gameBuild: '4.9.188.23497' }
  );
  assert.equal(result.events.length, 0);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'missing_required_fields'));
  assert.equal(JSON.stringify(result.diagnostics).includes('Entered Monitored Space'), false);
});

test('party leave is emitted only when the client GEID matches observed local identity', () => {
  const result = parseRuntimeLogText([
    '<2026-08-19T03:32:00.000Z> <AccountLoginCharacterStatus_Character> name SYNTH_HANDLE_LOCAL accountId SYNTH_ACCOUNT_LOCAL geid SYNTH_CHARACTER_GEID_LOCAL state Active',
    '<2026-08-19T03:32:00.100Z> <Expect Incoming Connection> nickname="SYNTH_HANDLE_LOCAL" playerGEID=SYNTH_PLAYER_GEID_LOCAL node_id=SYNTH_NODE_FRONTEND session=SYNTH_CLIENT_SESSION_A',
    '<2026-08-19T03:33:08.000Z> <Leave group> Client SYNTH_PLAYER_GEID_OTHER leave group SYNTH_PARTY_A'
  ].join('\n') + '\n', LIVE_PROFILE_OPTIONS);

  assert.deepEqual(result.events.map((event) => event.eventType), ['IdentityObserved']);
});

test('multiline continuation records produce one semantic notification event', () => {
  const result = parseRuntimeLogText([
    '<2026-08-09T19:52:00.000Z> <SHUDEvent_OnNotification> Add NotificationId[SYNTH_NOTIFICATION_MULTI] Type[Location]',
    '  Message["Entered SYNTH_JURISDICTION_MULTI Jurisdiction"]'
  ].join('\n') + '\n', {
    ...LIVE_PROFILE_OPTIONS,
    sourceProfileVersion: 'draft-2026-08-11',
    fixtureId: 'runtime-log-parser/multiline-test'
  });

  assert.deepEqual(result.events.map((event) => event.eventType), ['JurisdictionEntered']);
  assert.deepEqual(result.events[0].payload, {
    notificationId: 'SYNTH_NOTIFICATION_MULTI',
    jurisdiction: 'SYNTH_JURISDICTION_MULTI'
  });
  assert.deepEqual(result.events[0].evidenceReference.lineRange, { start: 1, end: 2 });
});

test('duplicate notification lifecycle records are deduped by profile hints', () => {
  const manifestPath = path.join(
    FIXTURE_ROOT,
    'live',
    '4.9-pub',
    'sc-4.9-live',
    'framing',
    'duplicate-notification-lifecycle.framing.manifest.json'
  );
  const manifest = readJson(manifestPath);
  const logText = fs.readFileSync(path.join(path.dirname(manifestPath), manifest.logFile), 'utf8');
  const result = parseRuntimeLogText(logText, {
    ...LIVE_PROFILE_OPTIONS,
    fixtureId: manifest.fixtureId,
    gameBuild: manifest.gameBuild,
    sourceProfileVersion: manifest.sourceProfileVersion
  });

  assert.deepEqual(result.events.map((event) => event.eventType), ['JurisdictionEntered']);
  assertPayloadIncludes(result.events[0], manifest.expectedCanonicalEvents[0], manifest.fixtureId);
});

test('orchestration suppresses only bounded duplicate event-family identities', () => {
  const duplicateLine = '<2026-08-09T19:52:00.000Z> <SHUDEvent_OnNotification> Add NotificationId[SYNTH_NOTIFICATION_REPEAT] Type[Location] Message["Entered SYNTH_JURISDICTION_REPEAT Jurisdiction"]';
  const repeatedAfterWindow = '<2026-08-09T20:10:00.000Z> <SHUDEvent_OnNotification> Add NotificationId[SYNTH_NOTIFICATION_REPEAT] Type[Location] Message["Entered SYNTH_JURISDICTION_REPEAT Jurisdiction"]';
  const result = parseRuntimeLogText([
    duplicateLine,
    duplicateLine,
    repeatedAfterWindow
  ].join('\n') + '\n', {
    ...LIVE_PROFILE_OPTIONS,
    fixtureId: 'runtime-log-parser/orchestration-dedupe-window',
    sourceProfileVersion: 'draft-2026-08-12'
  });

  assert.deepEqual(result.events.map((event) => event.eventType), ['JurisdictionEntered', 'JurisdictionEntered']);
  assert.notEqual(result.events[0].eventId, result.events[1].eventId, 'same payload outside the bounded window remains distinct');
  assert.equal(result.orchestration.stats.duplicateSuppressed, 1);
  assert.ok(result.orchestration.decisions.some((decision) => decision.decision === 'suppressed_duplicate'));
  assert.ok(result.events.every((event) => event.extensions.orchestration.policyId.includes('JurisdictionEntered')));
});

test('orchestration dedupe never crosses environment partitions', () => {
  const notification = '<SHUDEvent_OnNotification> Add NotificationId[SYNTH_NOTIFICATION_SHARED] Type[Location] Message["Entered SYNTH_JURISDICTION_SHARED Jurisdiction"]';
  const result = parseRuntimeLogText([
    '<2026-08-09T19:00:00.000Z> <Init> Environment[PUB] Tag[LIVE] Config[Shipping] SourcePath[%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log]',
    '<2026-08-09T19:00:00.010Z> <Game Version> version[4.9.0-LIVE.9000000-SYNTH] environment[LIVE]',
    `<2026-08-09T19:01:00.000Z> ${notification}`,
    '<2026-08-09T19:02:00.000Z> <Init> Environment[PTU] Tag[PTU] Config[Shipping] SourcePath[%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/PTU/game.log]',
    '<2026-08-09T19:02:00.010Z> <Game Version> version[4.9.0-PTU.9000000-SYNTH] environment[PTU]',
    `<2026-08-09T19:03:00.000Z> ${notification}`
  ].join('\n') + '\n', {
    sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log',
    sourceProfileId: 'sc-4.9-cross-env',
    gameBuild: '4.9.0-LIVE.9000000-SYNTH',
    fixtureId: 'runtime-log-parser/orchestration-cross-environment',
    sourceProfileVersion: 'draft-2026-08-12',
    ingestedAt: '2026-08-09T21:00:00.000Z'
  });

  assert.deepEqual(result.events.map((event) => event.eventType), [
    'ReleaseEnvironmentObserved',
    'JurisdictionEntered',
    'ReleaseEnvironmentObserved',
    'JurisdictionEntered'
  ]);
  const jurisdictions = result.events.filter((event) => event.eventType === 'JurisdictionEntered');
  assert.equal(new Set(jurisdictions.map((event) => event.environmentKey)).size, 2);
  assert.equal(new Set(jurisdictions.map((event) => event.correlationIds.notificationId)).size, 2);
  assert.equal(result.orchestration.stats.duplicateSuppressed, 0);
});

test('tailer chunk generation changes reset bounded correlation and preserve source ordering metadata', () => {
  const engine = new RuntimeLogParserEngine({
    ...LIVE_PROFILE_OPTIONS,
    fixtureId: 'runtime-log-parser/orchestration-source-generation',
    sourceProfileVersion: 'draft-2026-08-12'
  });
  const line = '<2026-08-09T19:52:00.000Z> <SHUDEvent_OnNotification> Add NotificationId[SYNTH_NOTIFICATION_GENERATION] Type[Location] Message["Entered SYNTH_JURISDICTION_GENERATION Jurisdiction"]\n';
  const bytes = Buffer.from(line, 'utf8');

  engine.push({ bytes, generation: 1, sequence: 10, offsetStart: 4096 });
  engine.push({ bytes, generation: 1, sequence: 11, offsetStart: 4096 });
  engine.push({ bytes, generation: 1, sequence: 12, offsetStart: 4096 });
  engine.push({ bytes, generation: 2, sequence: 13, offsetStart: 0 });
  const result = engine.end();

  assert.equal(result.events.length, 2);
  assert.deepEqual(result.events.map((event) => event.ordering.sourceGeneration), [1, 2]);
  assert.deepEqual(result.events.map((event) => event.ordering.sourceByteOffset), [4096, 0]);
  assert.equal(result.orchestration.stats.duplicateSuppressed, 1);
  assert.equal(result.orchestration.stats.sourceScopeResets, 1);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'source_generation_changed'));
});

test('event order comparator is stable for late arrivals with equal source timestamps', () => {
  const result = parseRuntimeLogText([
    '<2026-08-09T19:52:00.000Z> <SHUDEvent_OnNotification> Add NotificationId[SYNTH_NOTIFICATION_ORDER_B] Type[Location] Message["Entered SYNTH_JURISDICTION_ORDER_B Jurisdiction"]',
    '<2026-08-09T19:52:00.000Z> <SHUDEvent_OnNotification> Add NotificationId[SYNTH_NOTIFICATION_ORDER_A] Type[Location] Message["Entered SYNTH_JURISDICTION_ORDER_A Jurisdiction"]',
    '<2026-08-09T19:51:59.000Z> <SHUDEvent_OnNotification> Add NotificationId[SYNTH_NOTIFICATION_ORDER_LATE] Type[Location] Message["Entered SYNTH_JURISDICTION_ORDER_LATE Jurisdiction"]'
  ].join('\n') + '\n', {
    ...LIVE_PROFILE_OPTIONS,
    fixtureId: 'runtime-log-parser/orchestration-total-order',
    sourceProfileVersion: 'draft-2026-08-12'
  });
  const sorted = result.events.slice().sort(compareRuntimeEventOrder);

  assert.deepEqual(sorted.map((event) => event.payload.notificationId), [
    'SYNTH_NOTIFICATION_ORDER_LATE',
    'SYNTH_NOTIFICATION_ORDER_B',
    'SYNTH_NOTIFICATION_ORDER_A'
  ]);
  assert.deepEqual(result.events.map((event) => event.ordering.ingestionSequence), [1, 2, 3]);
});

test('negative fixtures produce no canonical events and do not invoke every extractor', () => {
  const negativeManifests = walkFiles(path.join(FIXTURE_ROOT, 'live', '4.9-pub', 'sc-4.9-live'))
    .filter((file) => file.endsWith('.manifest.json'))
    .map((manifestPath) => ({ manifestPath, manifest: readJson(manifestPath) }))
    .filter(({ manifest }) => ['non-event', 'unavailable'].includes(manifest.outcome) && manifest.logFile);

  for (const { manifestPath, manifest } of negativeManifests) {
    const logText = fs.readFileSync(path.join(path.dirname(manifestPath), manifest.logFile), 'utf8');
    const result = parseRuntimeLogText(logText, {
      ...LIVE_PROFILE_OPTIONS,
      fixtureId: manifest.fixtureId,
      gameBuild: manifest.gameBuild,
      sourceProfileVersion: manifest.sourceProfileVersion
    });
    const profileExtractorCount = BUILT_IN_RUNTIME_LOG_PROFILES[0].extractors.length;

    assert.equal(result.events.length, 0, `${manifest.fixtureId} must remain a non-event`);
    assert.ok(result.unknownEvidence.length > 0, `${manifest.fixtureId} unknown evidence is classified`);
    assert.ok(
      result.stats.extractorEvaluations < result.stats.recordsSeen * profileExtractorCount,
      `${manifest.fixtureId} must use cheap dispatch before extraction`
    );
  }
});

test('unsupported builds fail observably without best-guess events', () => {
  const result = parseRuntimeLogText(
    '<2026-08-09T19:00:00.000Z> <Init> Environment[TECH-PREVIEW] Tag[TECH-PREVIEW] Config[Shipping] SourcePath[%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/TECH-PREVIEW/game.log]\n' +
    '<2026-08-09T19:00:01.000Z> <Join PU> address[tech-preview.example.invalid] port[64090] shard[SYNTH_SHARD_TP] locationId[SYNTH_LOCATION_TP]\n',
    {
      sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/TECH-PREVIEW/game.log',
      ingestedAt: '2026-08-09T21:00:00.000Z'
    }
  );

  assert.equal(result.events.length, 0);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'unsupported_profile'));
  assert.ok(result.unknownEvidence.some((evidence) => evidence.reason === 'unsupported_profile'));
  assert.equal(result.parserHealth.status, 'unsupported_profile');
  assert.ok(result.healthEvents.some((event) => event.eventType === 'ParserCompatibilityStatusObserved'));
  assert.ok(result.healthEvents.every((event) => validateRuntimeEvent(event).ok));
});

test('reviewed LIVE executable version selects the 4.9 profile without widening future compatibility', () => {
  const reviewedLive = parseRuntimeLogText(
    '<2026-08-19T05:55:09.825Z> <Join PU> address[replicant-live.example.invalid] port[64332] shard[SYNTH_SHARD_LIVE_4_9_188] locationId[SYNTH_LOCATION_LIVE]\n',
    {
      sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log',
      releaseChannel: 'LIVE',
      gameBuild: '4.9.188.23497',
      ingestedAt: '2026-08-19T06:00:00.000Z'
    }
  );

  assert.equal(reviewedLive.selectedProfile.id, 'sc-4.9-live');
  assert.equal(reviewedLive.selectedProfile.version, '2026-08-19.5');
  assert.equal(reviewedLive.parserHealth.status, 'compatible');
  assert.deepEqual(reviewedLive.events.map((event) => event.eventType), ['PuJoinRequested']);
  assert.ok(reviewedLive.events.every((event) => validateRuntimeEvent(event).ok));

  for (const candidate of [
    { releaseChannel: 'LIVE', gameBuild: '4.9.189.10000', expectedStatus: 'unverified_build' },
    { releaseChannel: 'PTU', gameBuild: '4.10.189.23056', expectedStatus: 'unsupported_profile' }
  ]) {
    const unsupported = parseRuntimeLogText(
      '<2026-08-19T06:00:00.000Z> <Join PU> address[unsupported.example.invalid] port[64332] shard[SYNTH_SHARD_UNSUPPORTED] locationId[SYNTH_LOCATION_UNSUPPORTED]\n',
      {
        sourceLocation: `%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/${candidate.releaseChannel}/game.log`,
        ...candidate,
        ingestedAt: '2026-08-19T06:01:00.000Z'
      }
    );

    assert.equal(unsupported.events.length, 0);
    assert.equal(unsupported.parserHealth.status, candidate.expectedStatus);
  }
});

test('profile family reports exact tested, unverified, excluded, and mismatched builds distinctly', () => {
  const parseBuild = (gameBuild, overrides = {}) => parseRuntimeLogText(
    '<2026-08-19T06:00:00.000Z> <Join PU> address[family.example.invalid] port[64332] shard[SYNTH_SHARD_FAMILY] locationId[SYNTH_LOCATION_FAMILY]\n',
    {
      sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log',
      releaseChannel: 'LIVE',
      gameBuild,
      ingestedAt: '2026-08-19T06:01:00.000Z',
      ...overrides
    }
  );

  const tested = parseBuild('4.9.0-LIVE.9000000-SYNTH');
  const unverified = parseBuild('4.9.189.10000');
  const excluded = parseBuild('4.9.999.0-BLOCKED-SYNTH');
  const futureMinor = parseBuild('4.10.0-LIVE.10000');
  const wrongBranch = parseBuild('4.9.188.23497', { branch: 'sc-alpha-unsupported-branch' });
  const malformed = parseBuild('not-a-build');
  const wrongChannel = parseBuild('4.9.188.23497', { releaseChannel: 'PTU' });

  assert.equal(tested.parserHealth.status, 'compatible');
  assert.equal(tested.parserHealth.compatibilityBasis, 'exact_tested_build');
  assert.equal(unverified.parserHealth.status, 'unverified_build');
  assert.equal(unverified.parserHealth.compatibilityBasis, 'major_minor_family_match');
  assert.equal(unverified.events.length, 0);
  assert.equal(excluded.parserHealth.status, 'unsupported_profile');
  assert.equal(excluded.parserHealth.reason, 'build_explicitly_excluded');
  assert.equal(excluded.parserHealth.exclusionReason, 'synthetic_known_incompatible_vocabulary');
  assert.equal(futureMinor.parserHealth.status, 'unsupported_profile');
  assert.equal(wrongBranch.parserHealth.status, 'unsupported_profile');
  assert.equal(malformed.parserHealth.status, 'unsupported_profile');
  assert.equal(wrongChannel.parserHealth.status, 'unsupported_profile');
  assert.ok(unverified.healthEvents.every((event) => validateRuntimeEvent(event).ok));
});

test('field-shape drift suppresses only its affected event family', () => {
  const result = parseRuntimeLogText([
    '<2026-08-19T06:00:00.000Z> <SHUDEvent_OnNotification> Add Type[Location] Message["Entered SYNTH_BAD Jurisdiction"]',
    '<2026-08-19T06:00:01.000Z> <SHUDEvent_OnNotification> Add NotificationId[SYNTH_ZONE_AFTER_DRIFT] Type[Location] Message["Entered SYNTH_AFTER Jurisdiction"]',
    '<2026-08-19T06:00:02.000Z> <PartyService> PartyCreated partyId[SYNTH_PARTY_UNAFFECTED] leader[SYNTH_HANDLE_LOCAL]'
  ].join('\n') + '\n', LIVE_PROFILE_OPTIONS);

  assert.deepEqual(result.events.map((event) => event.eventType), ['PartyCreated']);
  assert.equal(result.parserHealth.status, 'suspected_drift');
  assert.equal(result.parserHealth.reason, 'event_family_field_shape_changed');
  assert.deepEqual(result.parserHealth.affectedEventFamilies, ['zone']);
  assert.ok(result.unknownEvidence.some((item) => item.reason === 'event_family_suppressed'));
});

test('replay preserves an explicitly stored immutable profile version', () => {
  const result = parseRuntimeLogText(
    '<2026-08-19T06:00:00.000Z> <Join PU> address[replay.example.invalid] port[64332] shard[SYNTH_SHARD_REPLAY] locationId[SYNTH_LOCATION_REPLAY]\n',
    { ...LIVE_PROFILE_OPTIONS, sourceProfileVersion: '2026-08-11.immutable' }
  );
  assert.equal(result.selectedProfile.version, '2026-08-19.5');
  assert.equal(result.events[0].sourceProfileVersion, '2026-08-11.immutable');
});

test('conflicting matches and malformed records fail safely and observably', () => {
  const conflictProfile = {
    ...BUILT_IN_RUNTIME_LOG_PROFILES[0],
    extractors: [
      {
        id: 'conflict.armistice-entered',
        kind: 'armisticeStateChanged',
        eventType: 'ArmisticeStateChanged',
        state: 'entered',
        literals: ['<SHUDEvent_OnNotification>', 'Entering Armistice Zone'],
        requiredFields: ['notificationId', 'state'],
        confidence: 'high',
        sensitivity: 'local',
        evidenceMarkers: ['Entering Armistice Zone'],
        dedupeFields: ['notificationId', 'state']
      },
      {
        id: 'conflict.armistice-left',
        kind: 'armisticeStateChanged',
        eventType: 'ArmisticeStateChanged',
        state: 'left',
        literals: ['<SHUDEvent_OnNotification>', 'Entering Armistice Zone'],
        requiredFields: ['notificationId', 'state'],
        confidence: 'high',
        sensitivity: 'local',
        evidenceMarkers: ['Entering Armistice Zone'],
        dedupeFields: ['notificationId', 'state']
      }
    ]
  };
  const conflict = parseRuntimeLogText(
    '<2026-08-09T19:10:02.000Z> <SHUDEvent_OnNotification> Add NotificationId[SYNTH_NOTIFICATION_ARMISTICE_A] Type[Location] Message["Entering Armistice Zone"]\n',
    {
      ...LIVE_PROFILE_OPTIONS,
      profiles: [conflictProfile]
    }
  );
  const malformed = parseRuntimeLogText(
    '<2026-08-09T19:05:01.000Z> <Join PU> address[game-server-alpha.example.invalid]\n',
    LIVE_PROFILE_OPTIONS
  );

  assert.equal(conflict.events.length, 0);
  assert.ok(conflict.diagnostics.some((diagnostic) => diagnostic.code === 'match_conflict'));
  assert.equal(malformed.events.length, 0);
  assert.ok(malformed.diagnostics.some((diagnostic) => diagnostic.code === 'missing_required_fields'));
  assert.ok(malformed.unknownEvidence.some((evidence) => evidence.reason === 'matched_missing_required_fields'));
  assert.equal(JSON.stringify(malformed.diagnostics).includes('game-server-alpha'), false);
});

test('parser health reports suspected drift from bounded privacy-aware unknown evidence', () => {
  const logText = Array.from({ length: 12 }, (_unused, index) => (
    `<2026-08-09T19:30:${String(index).padStart(2, '0')}.000Z> <UnknownTelemetry> accountId[ACC_${index}] handle[HANDLE_${index}] remoteAddr 10.1.0.${index}:64090 SourcePath[/home/pilot/StarCitizen/LIVE/game.log]`
  )).join('\n') + '\n';

  const result = parseRuntimeLogText(logText, {
    ...LIVE_PROFILE_OPTIONS,
    gameBuild: '4.9.0-LIVE.9000000',
    sourceProfileVersion: 'draft-2026-08-11',
    unknownEvidence: {
      maxSamples: 2,
      maxSamplesPerBucket: 1,
      maxTotalSampleBytes: 320,
      maxSampleBytes: 160
    },
    driftDetection: {
      minRecords: 10,
      minUnknownRecords: 8,
      unknownRatio: 0.7
    }
  });

  assert.equal(result.events.length, 0);
  assert.equal(result.parserHealth.status, 'suspected_drift');
  assert.equal(result.parserHealth.reason, 'high_unknown_ratio');
  assert.equal(result.unknownEvidenceSummary.recordCount, 12);
  assert.ok(result.unknownEvidenceSummary.sampleCount <= 2);
  assert.ok(result.unknownEvidenceSummary.droppedSampleCount > 0);
  assert.equal(JSON.stringify(result.unknownEvidence).includes('ACC_'), false);
  assert.equal(JSON.stringify(result.unknownEvidence).includes('HANDLE_'), false);
  assert.equal(JSON.stringify(result.unknownEvidence).includes('10.1.0.'), false);
  assert.equal(JSON.stringify(result.unknownEvidence).includes('/home/pilot'), false);
  assert.ok(result.healthEvents.some((event) => event.eventType === 'ParserDriftSuspected'));
  assert.ok(result.healthEvents.every((event) => validateRuntimeEvent(event).ok));
});

test('parser exposes scoped query, delete, and reset interfaces for unknown evidence', () => {
  const engine = new RuntimeLogParserEngine({
    ...LIVE_PROFILE_OPTIONS,
    gameBuild: '4.9.0-LIVE.9000000',
    sourceProfileVersion: 'draft-2026-08-11',
    unknownEvidence: {
      maxSamples: 10,
      maxSamplesPerBucket: 2
    }
  });

  engine.push(Buffer.from([
    '<2026-08-09T19:40:00.000Z> <UnknownLive> accountId[ACC_LIVE]',
    '<2026-08-09T19:40:01.000Z> <UnknownLive> accountId[ACC_LIVE_2]'
  ].join('\n') + '\n'));
  engine.end();

  const query = engine.queryUnknownEvidence({ includeSamples: true, limit: 10 });
  assert.equal(query.summary.recordCount, 2);
  assert.equal(JSON.stringify(query).includes('ACC_LIVE'), false);

  const deletedSensitive = engine.deleteUnknownEvidence({ mode: 'sensitive_evidence' });
  assert.equal(deletedSensitive.deletedRecords, 2);
  assert.equal(engine.queryUnknownEvidence().summary.recordCount, 0);

  engine.push(Buffer.from('<2026-08-09T19:40:02.000Z> <UnknownLiveAgain>\n'));
  engine.end();
  assert.equal(engine.queryUnknownEvidence().summary.recordCount, 1);
  const reset = engine.resetUnknownEvidence();
  assert.equal(reset.deletedRecords, 1);
  assert.equal(engine.queryUnknownEvidence().summary.recordCount, 0);
});
