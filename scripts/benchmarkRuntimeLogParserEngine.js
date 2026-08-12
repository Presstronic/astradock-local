#!/usr/bin/env node

const { performance } = require('node:perf_hooks');

const { parseRuntimeLogText } = require('../src/runtimeLogParserEngine');

const WORKLOAD_LINES = 5_000;
const EXPECTED_EVENTS = 50;
const MAX_PARSE_MS = 1_500;

function main() {
  const workload = createWorkload();
  const startedAt = performance.now();
  const result = parseRuntimeLogText(workload, {
    sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log',
    sourceProfileId: 'sc-4.9-live',
    ingestedAt: '2026-08-12T00:00:00.000Z',
    chunkSizes: [1, 7, 64, 8192]
  });
  const elapsedMs = performance.now() - startedAt;
  const memory = process.memoryUsage();
  const profileExtractorCount = result.selectedProfile.extractors.length;
  const report = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    workload: {
      lines: WORKLOAD_LINES,
      expectedEvents: EXPECTED_EVENTS,
      bytes: Buffer.byteLength(workload, 'utf8')
    },
    parser: {
      elapsedMs: Number(elapsedMs.toFixed(2)),
      recordsSeen: result.stats.recordsSeen,
      literalChecks: result.stats.literalChecks,
      extractorEvaluations: result.stats.extractorEvaluations,
      eventsEmitted: result.stats.eventsEmitted,
      unknownRecords: result.stats.unknownRecords,
      diagnosticsEmitted: result.stats.diagnosticsEmitted,
      extractorEvaluationRatio: Number((result.stats.extractorEvaluations / (result.stats.recordsSeen * profileExtractorCount)).toFixed(4))
    },
    processMemory: {
      rssMb: roundMb(memory.rss),
      heapUsedMb: roundMb(memory.heapUsed)
    }
  };

  console.log(JSON.stringify(report, null, 2));

  if (result.events.length !== EXPECTED_EVENTS) {
    throw new Error(`Expected ${EXPECTED_EVENTS} events, received ${result.events.length}.`);
  }
  if (elapsedMs > MAX_PARSE_MS) {
    throw new Error(`Parser benchmark exceeded ${MAX_PARSE_MS} ms: ${elapsedMs.toFixed(2)} ms.`);
  }
  if (result.stats.extractorEvaluations >= result.stats.recordsSeen * profileExtractorCount) {
    throw new Error('Parser invoked every extractor for every record.');
  }
  if (result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    throw new Error('Parser emitted error diagnostics during benchmark.');
  }
}

function createWorkload() {
  const lines = [];
  let promotedEvents = 0;
  lines.push('<2026-08-12T00:00:00.000Z> <Init> Environment[PUB] Tag[LIVE] Config[Shipping] SourcePath[%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log]');
  lines.push('<2026-08-12T00:00:00.010Z> <Game Version> version[4.9.0-LIVE.9000000-SYNTH] environment[LIVE]');

  for (let index = 0; index < WORKLOAD_LINES - 2; index += 1) {
    if (index > 0 && index % 100 === 0 && promotedEvents < EXPECTED_EVENTS) {
      const notification = String(index).padStart(4, '0');
      lines.push(
        `<2026-08-12T00:00:01.000Z> <SHUDEvent_OnNotification> Add NotificationId[SYNTH_NOTIFICATION_BENCH_${notification}] Type[Location] Message["Entered SYNTH_JURISDICTION_BENCH_${notification} Jurisdiction"]`
      );
      promotedEvents += 1;
      continue;
    }

    lines.push(`<2026-08-12T00:00:01.000Z> <NoiseSubsystem> category[SYNTH_NOISE] sequence[${index}] payload[SYNTH_PAYLOAD_${index}]`);
  }

  return `${lines.join('\n')}\n`;
}

function roundMb(bytes) {
  return Number((bytes / 1024 / 1024).toFixed(2));
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
