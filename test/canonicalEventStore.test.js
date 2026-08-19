const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3-multiple-ciphers');

const { createRuntimeEvent, deriveEnvironmentContext, RUNTIME_EVENT_EXAMPLES } = require('../src/contracts/runtimeEvents');
const { parseLogFile } = require('../src/logParser');
const {
  CanonicalEventStore,
  CanonicalEventStoreError,
  SCHEMA_VERSION
} = require('../src/persistence/canonicalEventStore');
const {
  StorageKeyProviderError,
  createElectronStorageKeyProvider
} = require('../src/persistence/storageKeyProvider');

const KEY = crypto.createHash('sha256').update('astradock-test-key').digest();
const LIVE_ENVIRONMENT_KEY = environmentFor('LIVE_ENV', '2026-08-19T00:00:00.000Z').environmentKey;
const PTU_ENVIRONMENT_KEY = environmentFor('PTU_ENV', '2026-08-19T00:00:00.000Z').environmentKey;

test('encrypted canonical events append idempotently and round-trip across restart', async (t) => {
  const fixture = await createStoreFixture(t);
  const live = eventAt('2026-08-19T10:00:00.000Z', 'LIVE_ENV', 'ClientBuildObserved');
  const ptu = eventAt('2026-08-19T10:00:01.000Z', 'PTU_ENV', 'ReleaseEnvironmentObserved');

  assert.deepEqual(fixture.store.append([live, ptu, live], { checkpoint: {
    environmentKey: live.environmentKey,
    name: 'projection-watermark',
    version: 1,
    orderCursor: live.eventId,
    value: { appliedEventId: live.eventId }
  } }), { attempted: 3, inserted: 2, duplicates: 1 });
  assert.deepEqual(fixture.store.query({ environmentKey: LIVE_ENVIRONMENT_KEY }).items, [live]);
  assert.equal(fixture.store.query({ environmentKey: LIVE_ENVIRONMENT_KEY }).totalCount, 1);
  if (process.platform !== 'win32') assert.equal(fs.statSync(fixture.filePath).mode & 0o077, 0);
  assert.equal(fixture.store.query({ environmentKey: PTU_ENVIRONMENT_KEY }).items[0].eventId, ptu.eventId);
  assert.equal(fixture.store.getById(ptu.eventId, LIVE_ENVIRONMENT_KEY), null);
  assert.deepEqual(fixture.store.getById(ptu.eventId, PTU_ENVIRONMENT_KEY), ptu);
  fixture.store.close();

  fixture.store = new CanonicalEventStore({ filePath: fixture.filePath, encryptionKey: KEY });
  assert.deepEqual(fixture.store.query({ environmentKey: LIVE_ENVIRONMENT_KEY }).items, [live]);
  assert.deepEqual(fixture.store.getCheckpoint(LIVE_ENVIRONMENT_KEY, 'projection-watermark'), {
    version: 1,
    orderCursor: live.eventId,
    value: { appliedEventId: live.eventId },
    updatedAt: fixture.store.getCheckpoint(LIVE_ENVIRONMENT_KEY, 'projection-watermark').updatedAt
  });
  const databaseBytes = fs.readFileSync(fixture.filePath);
  assert.equal(databaseBytes.includes(Buffer.from('ClientBuildObserved')), false, 'canonical content must not appear in plaintext database bytes');
});

test('queries are deterministic, cursor-based, bounded, typed, and environment scoped', async (t) => {
  const fixture = await createStoreFixture(t);
  const events = [
    eventAt('2026-08-19T10:00:02.000Z', 'LIVE_ENV', 'ClientBuildObserved'),
    eventAt('2026-08-19T10:00:00.000Z', 'LIVE_ENV', 'ReleaseEnvironmentObserved'),
    eventAt('2026-08-19T10:00:01.000Z', 'LIVE_ENV', 'ClientBuildObserved')
  ];
  fixture.store.append(events);
  const first = fixture.store.query({ environmentKey: LIVE_ENVIRONMENT_KEY, eventTypes: ['ClientBuildObserved'], limit: 1 });
  assert.equal(first.items.length, 1);
  assert.equal(first.totalCount, 2);
  assert.ok(first.nextCursor);
  const second = fixture.store.query({ environmentKey: LIVE_ENVIRONMENT_KEY, eventTypes: ['ClientBuildObserved'], limit: 1, cursor: first.nextCursor });
  assert.equal(second.items.length, 1);
  assert.notEqual(second.items[0].eventId, first.items[0].eventId);
  assert.equal(second.nextCursor, null);
  assert.throws(() => fixture.store.query({}), (error) => error.code === 'invalid_query');
  assert.throws(() => fixture.store.query({ environmentKey: LIVE_ENVIRONMENT_KEY, cursor: 'not-a-cursor' }), (error) => error.code === 'invalid_cursor');
  assert.throws(() => fixture.store.query({ environmentKey: LIVE_ENVIRONMENT_KEY, limit: 501 }), (error) => error.code === 'invalid_query');
});

test('failed batches roll back and event ID conflicts are rejected', async (t) => {
  const fixture = await createStoreFixture(t);
  const valid = eventAt('2026-08-19T10:00:00.000Z', 'LIVE_ENV', 'ClientBuildObserved');
  assert.throws(() => fixture.store.append([valid, { ...valid, eventType: 'UnknownEvent' }], { checkpoint: {
    environmentKey: LIVE_ENVIRONMENT_KEY, name: 'must-not-commit', version: 1,
    orderCursor: valid.eventId, value: { invalidBatch: true }
  } }), /append failed|validation/i);
  assert.equal(fixture.store.query({ environmentKey: LIVE_ENVIRONMENT_KEY }).items.length, 0);
  assert.equal(fixture.store.getCheckpoint(LIVE_ENVIRONMENT_KEY, 'must-not-commit'), null);

  fixture.store.append(valid);
  const conflicting = eventAt('2026-08-19T10:00:01.000Z', 'LIVE_ENV', 'ReleaseEnvironmentObserved');
  fixture.store.database.prepare('UPDATE events SET serialized_event = ? WHERE event_id = ?').run(JSON.stringify(conflicting), valid.eventId);
  assert.throws(() => fixture.store.append(valid), (error) => error.code === 'event_id_conflict');
  fixture.store.database.prepare('UPDATE events SET serialized_event = ? WHERE event_id = ?').run(JSON.stringify(valid), valid.eventId);
  assert.deepEqual(fixture.store.getById(valid.eventId, LIVE_ENVIRONMENT_KEY), valid);
});

test('repeated source evidence is idempotent when observation metadata changes', async (t) => {
  const fixture = await createStoreFixture(t);
  const first = eventAt('2026-08-19T10:00:00.000Z', 'LIVE_ENV', 'ClientBuildObserved');
  const replay = createRuntimeEvent({
    ...first,
    eventId: undefined,
    ingestedAt: '2026-08-19T11:00:00.000Z',
    environment: { ...first.environment, observedAt: '2026-08-19T11:00:00.000Z' },
    ordering: {
      ...first.ordering,
      ingestionSequence: first.ordering.ingestionSequence + 10,
      sourceGeneration: 2,
      sourceChunkSequence: 4
    }
  });

  assert.equal(replay.eventId, first.eventId);
  assert.deepEqual(fixture.store.append(first), { attempted: 1, inserted: 1, duplicates: 0 });
  assert.deepEqual(fixture.store.append(replay), { attempted: 1, inserted: 0, duplicates: 1 });
  assert.deepEqual(fixture.store.getById(first.eventId, LIVE_ENVIRONMENT_KEY), first);
  assert.equal(fixture.store.getHealth().eventCount, 1);
});

test('repeated application scans persist as idempotent redeliveries', async (t) => {
  const fixture = await createStoreFixture(t);
  const logPath = path.join(__dirname, 'fixtures/runtime-log/live/4.9-pub/sc-4.9-live/spine/client-build-environment.observed.log');
  const firstScan = await parseLogFile(logPath);
  await new Promise((resolve) => setTimeout(resolve, 2));
  const secondScan = await parseLogFile(logPath);

  assert.ok(firstScan.runtimeEvents.length > 0);
  assert.deepEqual(firstScan.runtimeEvents.map((event) => event.eventId), secondScan.runtimeEvents.map((event) => event.eventId));
  fixture.store.append(firstScan.runtimeEvents);
  const replay = fixture.store.append(secondScan.runtimeEvents);
  assert.equal(replay.inserted, 0);
  assert.equal(replay.duplicates, secondScan.runtimeEvents.length);
  assert.equal(fixture.store.getHealth().status, 'ready');
});

test('corrupt stored duplicate content fails closed without overwrite', async (t) => {
  const fixture = await createStoreFixture(t);
  const event = eventAt('2026-08-19T10:00:00.000Z', 'LIVE_ENV', 'ClientBuildObserved');
  fixture.store.append(event);
  fixture.store.database.prepare('UPDATE events SET serialized_event = ? WHERE event_id = ?').run('{"corrupt":true}', event.eventId);
  assert.throws(
    () => fixture.store.append(event),
    (error) => error.code === 'store_corrupt' && error.recoverable === false
  );
  assert.equal(fixture.store.database.prepare('SELECT serialized_event FROM events WHERE event_id = ?').get(event.eventId).serialized_event, '{"corrupt":true}');
});

test('retention hooks and deletion preserve environment isolation', async (t) => {
  const calls = [];
  const fixture = await createStoreFixture(t, {
    now: () => new Date('2026-08-20T00:00:00.000Z'),
    retentionHooks: {
      onBeforeDelete: (value) => calls.push(['before', value]),
      onAfterDelete: (value) => calls.push(['after', value])
    }
  });
  fixture.store.append([
    eventAt('2026-07-01T00:00:00.000Z', 'LIVE_ENV', 'ClientBuildObserved'),
    eventAt('2026-08-19T00:00:00.000Z', 'LIVE_ENV', 'ReleaseEnvironmentObserved'),
    eventAt('2026-08-19T00:00:01.000Z', 'PTU_ENV', 'ClientBuildObserved')
  ]);
  const outcome = fixture.store.applyRetention({ cutoff: '2026-08-01T00:00:00.000Z', environmentKey: LIVE_ENVIRONMENT_KEY });
  assert.equal(outcome.deleted, 1);
  assert.deepEqual(calls.map(([name]) => name), ['before', 'after']);
  assert.equal(fixture.store.query({ environmentKey: LIVE_ENVIRONMENT_KEY }).items.length, 1);
  assert.equal(fixture.store.query({ environmentKey: PTU_ENVIRONMENT_KEY }).items.length, 1);
  assert.equal(fixture.store.deleteEnvironment(LIVE_ENVIRONMENT_KEY), 1);
  assert.equal(fixture.store.query({ environmentKey: PTU_ENVIRONMENT_KEY }).items.length, 1);
  assert.equal(fixture.store.deleteAllTelemetry(), 1);
  assert.equal(fixture.store.getHealth().eventCount, 0);
});

test('wrong keys and unsupported future schemas fail closed without destructive repair', async (t) => {
  const fixture = await createStoreFixture(t);
  fixture.store.append(eventAt('2026-08-19T10:00:00.000Z', 'LIVE_ENV', 'ClientBuildObserved'));
  fixture.store.close();
  assert.throws(
    () => new CanonicalEventStore({ filePath: fixture.filePath, encryptionKey: crypto.randomBytes(32) }),
    (error) => error.code === 'store_corrupt_or_wrong_key' && error.recoverable === false
  );

  const database = new Database(fixture.filePath);
  database.key(KEY);
  database.pragma(`user_version = ${SCHEMA_VERSION + 1}`);
  database.close();
  assert.throws(
    () => new CanonicalEventStore({ filePath: fixture.filePath, encryptionKey: KEY }),
    (error) => error.code === 'unsupported_schema' && error.recoverable === false
  );
  assert.ok(fs.existsSync(fixture.filePath));
});

test('event-only schema migrates forward transactionally to checkpoint support', async (t) => {
  const fixture = await createStoreFixture(t);
  fixture.store.database.exec('DROP TABLE checkpoints');
  fixture.store.database.pragma('user_version = 1');
  fixture.store.close();
  fixture.store = new CanonicalEventStore({ filePath: fixture.filePath, encryptionKey: KEY });
  assert.equal(fixture.store.getHealth().schemaVersion, SCHEMA_VERSION);
  fixture.store.putCheckpoint({
    environmentKey: LIVE_ENVIRONMENT_KEY,
    name: 'tailer',
    version: 1,
    orderCursor: 'cursor-1',
    value: { offset: 42 }
  });
  assert.equal(fixture.store.getCheckpoint(LIVE_ENVIRONMENT_KEY, 'tailer').value.offset, 42);
  assert.equal(fixture.store.deleteCheckpoint(LIVE_ENVIRONMENT_KEY, 'tailer'), 1);
});

test('storage key provider wraps keys atomically and fails closed for unprotected backends', async (t) => {
  const directory = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'astradock-key-test-'));
  t.after(() => fsPromises.rm(directory, { recursive: true, force: true }));
  const keyFilePath = path.join(directory, 'database-key.json');
  const safeStorage = {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'secret_service',
    encryptString: (value) => Buffer.from(`wrapped:${value}`, 'utf8'),
    decryptString: (value) => value.toString('utf8').replace(/^wrapped:/, '')
  };
  const provider = createElectronStorageKeyProvider({ safeStorage, keyFilePath, randomBytes: () => Buffer.alloc(32, 7) });
  const first = await provider.getOrCreateKey();
  const second = await provider.getOrCreateKey();
  assert.deepEqual(first, Buffer.alloc(32, 7));
  assert.deepEqual(second, first);
  if (process.platform !== 'win32') assert.equal((await fsPromises.stat(keyFilePath)).mode & 0o077, 0);
  assert.equal((await fsPromises.readFile(keyFilePath, 'utf8')).includes(first.toString('base64')), false);

  const insecure = createElectronStorageKeyProvider({
    safeStorage: { ...safeStorage, getSelectedStorageBackend: () => 'basic_text' },
    keyFilePath: path.join(directory, 'insecure.json')
  });
  await assert.rejects(() => insecure.getOrCreateKey(), (error) => error instanceof StorageKeyProviderError && error.code === 'secure_storage_unprotected');
});

async function createStoreFixture(t, options = {}) {
  const directory = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'astradock-event-store-'));
  const fixture = {
    directory,
    filePath: path.join(directory, 'telemetry.db'),
    store: null
  };
  fixture.store = new CanonicalEventStore({ filePath: fixture.filePath, encryptionKey: KEY, ...options });
  t.after(async () => {
    fixture.store?.close();
    await fsPromises.rm(directory, { recursive: true, force: true });
  });
  return fixture;
}

function eventAt(timestamp, environmentKey, eventType) {
  const example = RUNTIME_EVENT_EXAMPLES[eventType];
  const environment = environmentFor(environmentKey, timestamp, example.environment.evidenceReference);
  return createRuntimeEvent({
    ...example,
    eventId: undefined,
    sourceTimestamp: timestamp,
    ingestedAt: timestamp,
    environmentKey: environment.environmentKey,
    environment,
    ordering: { ...example.ordering, ingestionSequence: Date.parse(timestamp) }
  });
}

function environmentFor(environmentKey, timestamp, evidenceReference = RUNTIME_EVENT_EXAMPLES.ClientBuildObserved.environment.evidenceReference) {
  const ptu = environmentKey === 'PTU_ENV';
  return deriveEnvironmentContext({
    releaseChannel: ptu ? 'PTU' : 'LIVE',
    universe: 'PU',
    environmentName: 'PUB',
    rawEnvironmentTag: ptu ? 'PTU' : 'LIVE',
    branch: 'sc-alpha-4.9-live-synth',
    buildVersion: '4.9.0-LIVE.9000000-SYNTH',
    sourceInstallationId: ptu ? 'SYNTH_INSTALLATION_PTU' : 'SYNTH_INSTALLATION_LIVE',
    observedAt: timestamp,
    confidence: 'confirmed',
    evidenceReference
  });
}
