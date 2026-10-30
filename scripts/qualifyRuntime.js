#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const { parseRuntimeLogText } = require('../src/runtimeLogParserEngine');
const { RuntimeLogTailer } = require('../src/runtimeLogTailer');
const { CanonicalEventStore } = require('../src/persistence/canonicalEventStore');
const { createRuntimeEvent, deriveEnvironmentContext, RUNTIME_EVENT_EXAMPLES } = require('../src/contracts/runtimeEvents');

const TARGETS = Object.freeze({
  durableP95Ms: 500,
  replayP95Ms: 5_000,
  maxLineBytes: 64 * 1024,
  maxBacklogRecoveryMs: 30_000,
  maxMemoryMb: 250,
  maxDatabaseMb: 250,
  maxStreamWindow: 200
});

async function qualify(options = {}) {
  const startedAt = performance.now();
  const results = [];
  results.push(runParserQualification());
  results.push(await runTailerQualification({ durationMs: options.durationMs ?? 2_000 }));
  results.push(await runRecoveryQualification());
  results.push(runStoreQualification());
  results.push(runRendererBoundQualification());

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    applicationVersion: require('../package.json').version,
    commit: gitCommit(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    workloadGenerator: 'scripts/qualifyRuntime.js@1',
    targets: TARGETS,
    elapsedMs: round(performance.now() - startedAt),
    status: results.every((result) => result.status === 'pass') ? 'pass' : 'fail',
    results
  };
  return report;
}

function runParserQualification() {
  const workload = createParserWorkload(5_000);
  const started = performance.now();
  const result = parseRuntimeLogText(workload, {
    sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log',
    sourceProfileId: 'sc-4.9-live',
    gameBuild: '4.9.0-LIVE.9000000-SYNTH',
    ingestedAt: '2026-09-15T00:00:00.000Z',
    chunkSizes: [1, 7, 64, 8192]
  });
  const elapsedMs = performance.now() - started;
  const checks = {
    expectedEvents: result.events.length === 50,
    noErrorDiagnostics: !result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
    dispatchIsSelective: result.stats.extractorEvaluations < result.stats.recordsSeen * result.selectedProfile.extractors.length,
    parseUnderTarget: elapsedMs <= 1_500
  };
  return resultRecord('parser-steady-unknown', { lines: 5_000, bytes: Buffer.byteLength(workload), elapsedMs: round(elapsedMs), stats: result.stats }, checks);
}

async function runTailerQualification({ durationMs }) {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'astradock-runtime-qualification-'));
  const logPath = path.join(directory, 'game.log');
  await fsp.writeFile(logPath, '');
  const chunks = [];
  const latenciesMs = [];
  const tailer = new RuntimeLogTailer(logPath, { useWatcher: false, pollIntervalMs: 0, onChunk: async (chunk) => chunks.push(Buffer.from(chunk.bytes)) });
  let expectedBytes = 0;
  try {
    await tailer.start();
    const phases = [
      { label: 'sustained', durationMs: Math.min(2_000, durationMs), linesPerSecond: 100 },
      { label: 'burst', durationMs: durationMs, linesPerSecond: 1_000 }
    ];
    let batch = 0;
    let lineCount = 0;
    for (const phase of phases) {
      const batches = Math.max(1, Math.ceil(phase.durationMs / 100));
      const linesPerBatch = phase.linesPerSecond / 10;
      for (let index = 0; index < batches; index += 1) {
        const payload = createTailerPayload(`${phase.label}_${index}`, linesPerBatch);
        const started = performance.now();
        await fsp.appendFile(logPath, payload);
        await tailer.checkNow(`qualification_${batch}`);
        latenciesMs.push(performance.now() - started);
        expectedBytes += Buffer.byteLength(payload);
        lineCount += linesPerBatch;
        batch += 1;
      }
    }
    const health = tailer.getHealth();
    const memory = process.memoryUsage();
    const p95 = percentile(latenciesMs, 95);
    return resultRecord('tailer-steady-and-burst', {
      durationMs,
      lines: lineCount,
      expectedBytes,
      deliveredBytes: chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0),
      p95DeliveryMs: round(p95),
      maxDeliveryMs: round(Math.max(...latenciesMs)),
      backlogBytes: health.backlogBytes,
      status: health.status,
      rssMb: roundMb(memory.rss)
    }, {
      exactDelivery: chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0) === expectedBytes,
      drained: health.backlogBytes === 0 && health.status === 'monitoring',
      p95UnderTarget: p95 <= TARGETS.durableP95Ms,
      memoryUnderTarget: memory.rss / 1024 / 1024 <= TARGETS.maxMemoryMb
    });
  } finally {
    await tailer.stop('qualification_done').catch(() => {});
    await fsp.rm(directory, { recursive: true, force: true });
  }
}

async function runRecoveryQualification() {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'astradock-runtime-recovery-'));
  const logPath = path.join(directory, 'game.log');
  const chunks = [];
  const lifecycle = [];
  const tailer = new RuntimeLogTailer(logPath, { useWatcher: false, pollIntervalMs: 0, onChunk: async (chunk) => chunks.push(Buffer.from(chunk.bytes)), onLifecycle: (event) => lifecycle.push(event.type) });
  try {
    await fsp.writeFile(logPath, 'partial');
    await tailer.start();
    await fsp.appendFile(logPath, '-completed\n');
    await tailer.checkNow('complete-partial-line');
    await fsp.truncate(logPath, 0);
    await fsp.appendFile(logPath, 'after-truncation\n');
    await tailer.checkNow('truncation');
    const rotated = path.join(directory, 'game.log.1');
    await fsp.rename(logPath, rotated);
    await fsp.writeFile(logPath, 'after-replacement\n');
    await tailer.checkNow('replacement');
    const health = tailer.getHealth();
    return resultRecord('tailer-recovery-rotation-truncation-partial', { lifecycleTypes: [...new Set(lifecycle)], generation: health.generation, deliveredBytes: chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0) }, {
      observedTruncation: lifecycle.includes('source.truncated'),
      observedReplacement: lifecycle.includes('source.replaced'),
      resumedMonitoring: health.status === 'monitoring',
      noCrash: true
    });
  } finally {
    await tailer.stop('qualification_done').catch(() => {});
    await fsp.rm(directory, { recursive: true, force: true });
  }
}

function runStoreQualification() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'astradock-store-qualification-'));
  const filePath = path.join(directory, 'events.db');
  const store = new CanonicalEventStore({ filePath, encryptionKey: crypto.randomBytes(32) });
  const events = Array.from({ length: 1_000 }, (_, index) => benchmarkEvent(index));
  const started = performance.now();
  const firstAppend = store.append(events);
  const duplicateAppend = store.append(events);
  const page = store.query({ environmentKey: events[0].environmentKey, limit: 500 });
  const replayStarted = performance.now();
  const replay = store.query({ environmentKey: events[0].environmentKey, limit: 500 });
  const replayMs = performance.now() - replayStarted;
  const health = store.getHealth();
  const dbSizeMb = fs.statSync(filePath).size / 1024 / 1024;
  store.close();
  fs.rmSync(directory, { recursive: true, force: true });
  return resultRecord('store-append-query-replay-dedup', { eventCount: events.length, appendMs: round(performance.now() - started), replayMs: round(replayMs), inserted: firstAppend.inserted, duplicates: duplicateAppend.duplicates, queried: page.items.length, dbSizeMb: round(dbSizeMb), eventCountInHealth: health.eventCount }, {
    allInserted: firstAppend.inserted === events.length,
    deduplicated: duplicateAppend.duplicates === events.length,
    paged: page.items.length === 500 && page.nextCursor,
    replayUnderTarget: replayMs <= TARGETS.replayP95Ms,
    databaseUnderTarget: dbSizeMb <= TARGETS.maxDatabaseMb
  });
}

function runRendererBoundQualification() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/src/shared-event-stream-model.ts'), 'utf8');
  const hasWindowBound = source.includes('slice(state.windowStart, state.windowStart + state.windowSize)');
  return resultRecord('renderer-window-bound', { source: 'shared-event-stream-model.ts', maxWindowSize: TARGETS.maxStreamWindow }, { boundedWindowImplementation: hasWindowBound });
}

function resultRecord(name, metrics, checks) {
  return { name, status: Object.values(checks).every(Boolean) ? 'pass' : 'fail', metrics, checks };
}

function createParserWorkload(lineCount) {
  const lines = ['<2026-09-15T00:00:00.000Z> <Init> Environment[PUB] Tag[LIVE] Config[Shipping] SourcePath[%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log]'];
  for (let index = 0; index < lineCount - 1; index += 1) {
    lines.push(index > 0 && index % 100 === 0
      ? `<2026-09-15T00:00:01.000Z> <SHUDEvent_OnNotification> Add NotificationId[SYNTH_NOTIFICATION_${index}] Type[Location] Message["Entered SYNTH_JURISDICTION_${index} Jurisdiction"]`
      : `<2026-09-15T00:00:01.000Z> <NoiseSubsystem> category[SYNTH_NOISE] sequence[${index}] payload[SYNTH_PAYLOAD_${index}]`);
  }
  return `${lines.join('\n')}\n`;
}

function createTailerPayload(batch, count) {
  return Array.from({ length: count }, (_, index) => `<2026-09-15T00:00:00.000Z> synthetic batch=${batch} line=${index}\n`).join('');
}

function benchmarkEvent(index) {
  const example = RUNTIME_EVENT_EXAMPLES.ClientBuildObserved;
  const timestamp = new Date(Date.parse('2026-09-15T00:00:00.000Z') + index).toISOString();
  const environment = deriveEnvironmentContext({ ...example.environment, observedAt: timestamp });
  return createRuntimeEvent({ ...example, eventId: undefined, sourceTimestamp: timestamp, ingestedAt: timestamp, environmentKey: environment.environmentKey, environment, ordering: { ...example.ordering, ingestionSequence: index + 1 } });
}

function percentile(values, value) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value / 100) - 1)] || 0;
}

function round(value) { return Number(value.toFixed(2)); }
function roundMb(bytes) { return round(bytes / 1024 / 1024); }
function gitCommit() { try { return require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (_) { return 'unknown'; } }

if (require.main === module) {
  qualify({ durationMs: Number(process.env.ASTRADOCK_QUALIFICATION_DURATION_MS) || 2_000 }).then((report) => {
    const output = process.argv[2];
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (output) fs.writeFileSync(path.resolve(output), serialized, { mode: 0o600 });
    process.stdout.write(serialized);
    if (report.status !== 'pass') process.exitCode = 1;
  }).catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}

module.exports = { TARGETS, qualify, runParserQualification, runTailerQualification, runRecoveryQualification, runStoreQualification, runRendererBoundQualification };
