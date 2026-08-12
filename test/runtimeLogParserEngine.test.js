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
  validateRuntimeEvent
} = require('../src/contracts/runtimeEvents');

const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'runtime-log');
const LIVE_PROFILE_OPTIONS = {
  sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log',
  sourceProfileId: 'sc-4.9-live',
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
  assert.equal(JSON.stringify(malformed.diagnostics).includes('game-server-alpha'), false);
});
