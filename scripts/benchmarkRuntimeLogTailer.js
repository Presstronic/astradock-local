#!/usr/bin/env node

const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const { RuntimeLogTailer } = require('../src/runtimeLogTailer');

const LINE_BYTES = 192;
const SUSTAINED_LINES_PER_SECOND = 100;
const BURST_LINES_PER_SECOND = 1_000;

async function main() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'astradock-tailer-benchmark-'));
  const logPath = path.join(dir, 'game.log');
  await fsp.writeFile(logPath, '');

  const chunks = [];
  const lifecycle = [];
  const tailer = new RuntimeLogTailer(logPath, {
    useWatcher: false,
    pollIntervalMs: 0,
    onChunk: async (chunk) => chunks.push(chunk),
    onLifecycle: (record) => lifecycle.push(record)
  });

  try {
    await tailer.start();
    const sustained = await runWorkload({
      logPath,
      tailer,
      label: 'sustained',
      linesPerSecond: SUSTAINED_LINES_PER_SECOND,
      durationMs: 2_000,
      batchIntervalMs: 100
    });
    const burst = await runWorkload({
      logPath,
      tailer,
      label: 'burst',
      linesPerSecond: BURST_LINES_PER_SECOND,
      durationMs: 1_000,
      batchIntervalMs: 100
    });

    const deliveredBytes = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const expectedBytes = sustained.bytesWritten + burst.bytesWritten;
    const health = tailer.getHealth();
    const memory = process.memoryUsage();
    const report = {
      generatedAt: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      workloads: [summarizeWorkload(sustained), summarizeWorkload(burst)],
      tailer: {
        deliveredBytes,
        expectedBytes,
        chunkCount: chunks.length,
        generation: health.generation,
        offset: health.offset,
        backlogBytes: health.backlogBytes,
        status: health.status,
        lifecycleTypes: Array.from(new Set(lifecycle.map((record) => record.type)))
      },
      processMemory: {
        rssMb: roundMb(memory.rss),
        heapUsedMb: roundMb(memory.heapUsed)
      }
    };

    console.log(JSON.stringify(report, null, 2));

    if (deliveredBytes !== expectedBytes) {
      throw new Error(`Expected ${expectedBytes} delivered bytes, received ${deliveredBytes}.`);
    }
    if (health.backlogBytes !== 0 || health.status !== 'monitoring') {
      throw new Error(`Tailer did not drain cleanly: ${JSON.stringify(health)}`);
    }
    for (const workload of [sustained, burst]) {
      if (percentile(workload.latenciesMs, 95) > 500) {
        throw new Error(`${workload.label} p95 exceeded 500 ms.`);
      }
    }
  } finally {
    await tailer.stop('benchmark_done').catch(() => {});
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

async function runWorkload(input) {
  const batches = Math.ceil(input.durationMs / input.batchIntervalMs);
  const linesPerBatch = Math.floor(input.linesPerSecond * input.batchIntervalMs / 1_000);
  const latenciesMs = [];
  let bytesWritten = 0;
  const startedAt = performance.now();

  for (let batch = 0; batch < batches; batch += 1) {
    const payload = createPayload(input.label, batch, linesPerBatch);
    const appendStarted = performance.now();
    await fsp.appendFile(input.logPath, payload);
    await input.tailer.checkNow(`${input.label}_${batch}`);
    latenciesMs.push(performance.now() - appendStarted);
    bytesWritten += Buffer.byteLength(payload);
    await sleepUntil(startedAt + ((batch + 1) * input.batchIntervalMs));
  }

  return {
    label: input.label,
    linesPerSecond: input.linesPerSecond,
    durationMs: input.durationMs,
    lineCount: batches * linesPerBatch,
    bytesWritten,
    elapsedMs: performance.now() - startedAt,
    latenciesMs
  };
}

function createPayload(label, batch, lineCount) {
  let payload = '';
  for (let index = 0; index < lineCount; index += 1) {
    const prefix = `<2026-08-12T00:00:00.000Z> ${label} batch=${batch} line=${index} `;
    payload += `${prefix}${'.'.repeat(Math.max(0, LINE_BYTES - prefix.length - 1))}\n`;
  }
  return payload;
}

async function sleepUntil(targetMs) {
  const delayMs = targetMs - performance.now();
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function summarizeWorkload(workload) {
  return {
    label: workload.label,
    targetLinesPerSecond: workload.linesPerSecond,
    durationMs: workload.durationMs,
    lineCount: workload.lineCount,
    bytesWritten: workload.bytesWritten,
    elapsedMs: Number(workload.elapsedMs.toFixed(2)),
    p50DeliveryMs: Number(percentile(workload.latenciesMs, 50).toFixed(2)),
    p95DeliveryMs: Number(percentile(workload.latenciesMs, 95).toFixed(2)),
    maxDeliveryMs: Number(Math.max(...workload.latenciesMs).toFixed(2))
  };
}

function percentile(values, percentileValue) {
  const sorted = values.slice().sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[index];
}

function roundMb(bytes) {
  return Number((bytes / 1024 / 1024).toFixed(2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
