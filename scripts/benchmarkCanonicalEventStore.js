const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createRuntimeEvent,
  deriveEnvironmentContext,
  RUNTIME_EVENT_EXAMPLES
} = require('../src/contracts/runtimeEvents');
const { CanonicalEventStore } = require('../src/persistence/canonicalEventStore');

const EVENT_COUNT = 5_000;
const PAGE_SIZE = 100;
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'astradock-store-benchmark-'));
const filePath = path.join(directory, 'events.db');
const key = crypto.randomBytes(32);
let store;

try {
  store = new CanonicalEventStore({ filePath, encryptionKey: key });
  const events = Array.from({ length: EVENT_COUNT }, (_, index) => benchmarkEvent(index));
  const appendStarted = performance.now();
  for (let index = 0; index < events.length; index += 250) store.append(events.slice(index, index + 250));
  const appendElapsedMs = performance.now() - appendStarted;

  const queryStarted = performance.now();
  let cursor = null;
  let queried = 0;
  do {
    const page = store.query({ environmentKey: events[0].environmentKey, limit: PAGE_SIZE, cursor });
    queried += page.items.length;
    cursor = page.nextCursor;
  } while (cursor);
  const queryElapsedMs = performance.now() - queryStarted;

  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    workload: { eventCount: EVENT_COUNT, pageSize: PAGE_SIZE },
    append: { elapsedMs: round(appendElapsedMs), eventsPerSecond: round(EVENT_COUNT / (appendElapsedMs / 1000)) },
    query: { elapsedMs: round(queryElapsedMs), queried, eventsPerSecond: round(queried / (queryElapsedMs / 1000)) },
    health: store.getHealth()
  }, null, 2)}\n`);
} finally {
  store?.close();
  key.fill(0);
  fs.rmSync(directory, { recursive: true, force: true });
}

function benchmarkEvent(index) {
  const example = RUNTIME_EVENT_EXAMPLES.ClientBuildObserved;
  const timestamp = new Date(Date.parse('2026-08-19T00:00:00.000Z') + index).toISOString();
  const environment = deriveEnvironmentContext({
    ...example.environment,
    observedAt: timestamp
  });
  return createRuntimeEvent({
    ...example,
    eventId: undefined,
    sourceTimestamp: timestamp,
    ingestedAt: timestamp,
    environmentKey: environment.environmentKey,
    environment,
    ordering: { ...example.ordering, ingestionSequence: index + 1 }
  });
}

function round(value) {
  return Math.round(value * 100) / 100;
}
