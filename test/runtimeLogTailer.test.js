const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  LIFECYCLE_TYPES,
  RuntimeLogTailer,
  START_MODES
} = require('../src/runtimeLogTailer');

test('runtime log tailer reads only appended bytes in exact source order', async () => {
  const { logPath, cleanup } = await createTempLog('existing\n');
  const chunks = [];
  const tailer = new RuntimeLogTailer(logPath, {
    useWatcher: false,
    pollIntervalMs: 0,
    onChunk: async (chunk) => chunks.push(chunk)
  });

  try {
    await tailer.start();
    assert.equal(chunks.length, 0, 'from_current_end must not replay existing bytes');

    await fsp.appendFile(logPath, 'first\n');
    await tailer.checkNow('append');
    await tailer.checkNow('duplicate_notification');

    await fsp.appendFile(logPath, 'second\n');
    await tailer.checkNow('append');

    assert.equal(Buffer.concat(chunks.map((chunk) => chunk.bytes)).toString('utf8'), 'first\nsecond\n');
    assert.deepEqual(chunks.map((chunk) => [chunk.offsetStart, chunk.offsetEnd]), [
      [9, 15],
      [15, 22]
    ]);
  } finally {
    await tailer.stop('test_done');
    await cleanup();
  }
});

test('runtime log tailer supports replay and restart checkpoints', async () => {
  const { logPath, cleanup } = await createTempLog('alpha\n');
  const replayed = [];
  const firstTailer = new RuntimeLogTailer(logPath, {
    startMode: START_MODES.FROM_BEGINNING,
    useWatcher: false,
    pollIntervalMs: 0,
    onChunk: async (chunk) => replayed.push(chunk)
  });

  try {
    await firstTailer.start();
    assert.equal(Buffer.concat(replayed.map((chunk) => chunk.bytes)).toString('utf8'), 'alpha\n');
    const checkpoint = firstTailer.getCheckpoint();
    await firstTailer.stop('restart');

    await fsp.appendFile(logPath, 'beta\n');
    const recovered = [];
    const secondTailer = new RuntimeLogTailer(logPath, {
      startMode: START_MODES.FROM_CHECKPOINT,
      checkpoint,
      useWatcher: false,
      pollIntervalMs: 0,
      onChunk: async (chunk) => recovered.push(chunk)
    });
    await secondTailer.start();

    assert.equal(Buffer.concat(recovered.map((chunk) => chunk.bytes)).toString('utf8'), 'beta\n');
    assert.equal(recovered[0].offsetStart, checkpoint.offset);
    await secondTailer.stop('test_done');
  } finally {
    await cleanup();
  }
});

test('runtime log tailer handles source creation delay and bounded long writes', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'astradock-tailer-'));
  const logPath = path.join(dir, 'game.log');
  const chunks = [];
  const lifecycles = [];
  const tailer = new RuntimeLogTailer(logPath, {
    startMode: START_MODES.FROM_BEGINNING,
    maxChunkBytes: 8,
    useWatcher: false,
    pollIntervalMs: 0,
    onChunk: async (chunk) => chunks.push(chunk),
    onLifecycle: (record) => lifecycles.push(record)
  });

  try {
    await tailer.start();
    assert.equal(tailer.getHealth().status, 'waiting_for_source');
    assert.ok(lifecycles.some((record) => record.type === LIFECYCLE_TYPES.SOURCE_UNAVAILABLE));

    await fsp.writeFile(logPath, '0123456789abcdef');
    await tailer.checkNow('created');

    assert.equal(Buffer.concat(chunks.map((chunk) => chunk.bytes)).toString('utf8'), '0123456789abcdef');
    assert.deepEqual(chunks.map((chunk) => chunk.byteLength), [8, 8]);
    assert.ok(lifecycles.some((record) => record.type === LIFECYCLE_TYPES.SOURCE_AVAILABLE));
  } finally {
    await tailer.stop('test_done');
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('runtime log tailer starts new generations on truncation and replacement', async () => {
  const { logPath, cleanup } = await createTempLog('old-line\n');
  const chunks = [];
  const lifecycles = [];
  const tailer = new RuntimeLogTailer(logPath, {
    startMode: START_MODES.FROM_BEGINNING,
    useWatcher: false,
    pollIntervalMs: 0,
    onChunk: async (chunk) => chunks.push(chunk),
    onLifecycle: (record) => lifecycles.push(record)
  });

  try {
    await tailer.start();
    await fsp.truncate(logPath, 0);
    await tailer.checkNow('truncate');
    await fsp.appendFile(logPath, 'after-truncate\n');
    await tailer.checkNow('append_after_truncate');

    const replacementPath = `${logPath}.next`;
    await fsp.writeFile(replacementPath, 'replacement\n');
    await fsp.rename(replacementPath, logPath);
    await tailer.checkNow('replace');

    assert.equal(
      Buffer.concat(chunks.map((chunk) => chunk.bytes)).toString('utf8'),
      'old-line\nafter-truncate\nreplacement\n'
    );
    assert.ok(lifecycles.some((record) => record.type === LIFECYCLE_TYPES.SOURCE_TRUNCATED));
    assert.ok(lifecycles.some((record) => record.type === LIFECYCLE_TYPES.SOURCE_REPLACED));
    assert.equal(new Set(chunks.map((chunk) => chunk.generation)).size, 3);
  } finally {
    await tailer.stop('test_done');
    await cleanup();
  }
});

test('runtime log tailer reports source loss and reappearance without path disclosure', async () => {
  const { logPath, cleanup } = await createTempLog('ready\n');
  const chunks = [];
  const lifecycles = [];
  const tailer = new RuntimeLogTailer(logPath, {
    startMode: START_MODES.FROM_BEGINNING,
    useWatcher: false,
    pollIntervalMs: 0,
    onChunk: async (chunk) => chunks.push(chunk),
    onLifecycle: (record) => lifecycles.push(record)
  });

  try {
    await tailer.start();
    await fsp.unlink(logPath);
    await tailer.checkNow('delete');
    await fsp.writeFile(logPath, 'returned\n');
    await tailer.checkNow('reappear');

    assert.ok(lifecycles.some((record) => record.type === LIFECYCLE_TYPES.SOURCE_UNAVAILABLE));
    assert.ok(lifecycles.filter((record) => record.type === LIFECYCLE_TYPES.SOURCE_AVAILABLE).length >= 2);
    assert.equal(JSON.stringify(lifecycles).includes(logPath), false);
    assert.equal(Buffer.concat(chunks.map((chunk) => chunk.bytes)).toString('utf8'), 'ready\nreturned\n');
  } finally {
    await tailer.stop('test_done');
    await cleanup();
  }
});

test('runtime log tailer clean shutdown closes monitoring and suppresses later appends', async () => {
  const { logPath, cleanup } = await createTempLog('');
  const chunks = [];
  const lifecycles = [];
  const tailer = new RuntimeLogTailer(logPath, {
    useWatcher: false,
    pollIntervalMs: 0,
    onChunk: async (chunk) => chunks.push(chunk),
    onLifecycle: (record) => lifecycles.push(record)
  });

  try {
    await tailer.start();
    await tailer.stop('application_shutdown');
    await fsp.appendFile(logPath, 'ignored\n');
    await tailer.checkNow('after_stop');

    assert.equal(chunks.length, 0);
    assert.equal(tailer.getHealth().status, 'stopped');
    assert.ok(lifecycles.some((record) => record.type === LIFECYCLE_TYPES.STOPPED));
  } finally {
    await cleanup();
  }
});

test('runtime log tailer surfaces slow-consumer backpressure and preserves unread bytes', async () => {
  const { logPath, cleanup } = await createTempLog('');
  const chunks = [];
  const lifecycles = [];
  let unblock;
  const blocked = new Promise((resolve) => {
    unblock = resolve;
  });
  let blockFirstChunk = true;
  const tailer = new RuntimeLogTailer(logPath, {
    useWatcher: false,
    pollIntervalMs: 0,
    slowConsumerMs: 5,
    onLifecycle: (record) => lifecycles.push(record),
    onChunk: async (chunk) => {
      chunks.push(chunk);
      if (blockFirstChunk) {
        blockFirstChunk = false;
        await blocked;
      }
    }
  });

  try {
    await tailer.start();
    await fsp.appendFile(logPath, 'a');
    const firstRead = tailer.checkNow('append');
    await delay(20);

    assert.equal(tailer.getHealth().paused, true);
    assert.ok(lifecycles.some((record) => record.type === LIFECYCLE_TYPES.BACKPRESSURE_PAUSED));

    await fsp.appendFile(logPath, 'b');
    unblock();
    await firstRead;
    await tailer.checkNow('post_backpressure_append');

    assert.equal(Buffer.concat(chunks.map((chunk) => chunk.bytes)).toString('utf8'), 'ab');
    assert.ok(lifecycles.some((record) => record.type === LIFECYCLE_TYPES.BACKPRESSURE_RESUMED));
  } finally {
    await tailer.stop('test_done');
    await cleanup();
  }
});

test('runtime log tailer pauses on consumer failure without advancing the checkpoint', async () => {
  const { logPath, cleanup } = await createTempLog('');
  const lifecycles = [];
  const tailer = new RuntimeLogTailer(logPath, {
    useWatcher: false,
    pollIntervalMs: 0,
    onLifecycle: (record) => lifecycles.push(record),
    onChunk: async () => {
      throw new Error('downstream failed');
    }
  });

  try {
    await tailer.start();
    await fsp.appendFile(logPath, 'will-retry\n');
    await tailer.checkNow('append');

    assert.equal(tailer.getHealth().paused, true);
    assert.equal(tailer.getHealth().offset, 0);
    assert.equal(tailer.getCheckpoint().offset, 0);
    assert.ok(lifecycles.some((record) => record.type === LIFECYCLE_TYPES.CONSUMER_ERROR));
    assert.equal(lifecycles.some((record) => record.type === LIFECYCLE_TYPES.READ_ERROR), false);
  } finally {
    await tailer.stop('test_done');
    await cleanup();
  }
});

test('runtime log tailer reports permission denial without exposing source paths', async () => {
  const sourcePath = path.join(os.tmpdir(), 'private-game.log');
  const lifecycles = [];
  const tailer = new RuntimeLogTailer(sourcePath, {
    useWatcher: false,
    pollIntervalMs: 0,
    fs: {
      stat: async () => {
        const error = new Error(`denied: ${sourcePath}`);
        error.code = 'EACCES';
        throw error;
      }
    },
    onLifecycle: (record) => lifecycles.push(record)
  });

  await tailer.start();
  await tailer.stop('test_done');

  const unavailable = lifecycles.find((record) => record.type === LIFECYCLE_TYPES.SOURCE_UNAVAILABLE);
  assert.ok(unavailable);
  assert.equal(unavailable.status, 'permission_denied');
  assert.equal(unavailable.recoverable, false);
  assert.equal(JSON.stringify(lifecycles).includes(sourcePath), false);
});

async function createTempLog(contents) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'astradock-tailer-'));
  const logPath = path.join(dir, 'game.log');
  await fsp.writeFile(logPath, contents);
  return {
    logPath,
    cleanup: () => fsp.rm(dir, { recursive: true, force: true })
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
