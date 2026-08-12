const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_MAX_CHUNK_BYTES = 64 * 1024;
const DEFAULT_SLOW_CONSUMER_MS = 250;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 2_000;

const START_MODES = Object.freeze({
  FROM_CURRENT_END: 'from_current_end',
  FROM_BEGINNING: 'from_beginning',
  FROM_CHECKPOINT: 'from_checkpoint'
});

const LIFECYCLE_TYPES = Object.freeze({
  STARTED: 'tailer.started',
  STOPPED: 'tailer.stopped',
  SOURCE_AVAILABLE: 'source.available',
  SOURCE_UNAVAILABLE: 'source.unavailable',
  SOURCE_REPLACED: 'source.replaced',
  SOURCE_TRUNCATED: 'source.truncated',
  BACKPRESSURE_PAUSED: 'backpressure.paused',
  BACKPRESSURE_RESUMED: 'backpressure.resumed',
  CONSUMER_ERROR: 'consumer.error',
  READ_ERROR: 'read.error'
});

class RuntimeLogTailer extends EventEmitter {
  constructor(sourcePath, options = {}) {
    super();
    if (!sourcePath || typeof sourcePath !== 'string') {
      throw new TypeError('A source path is required.');
    }

    this.sourcePath = path.resolve(sourcePath);
    this.startMode = normalizeStartMode(options.startMode);
    this.checkpoint = normalizeCheckpoint(options.checkpoint);
    this.maxChunkBytes = normalizePositiveInteger(options.maxChunkBytes, DEFAULT_MAX_CHUNK_BYTES);
    this.slowConsumerMs = normalizePositiveInteger(options.slowConsumerMs, DEFAULT_SLOW_CONSUMER_MS);
    this.pollIntervalMs = options.pollIntervalMs === 0
      ? 0
      : normalizePositiveInteger(options.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS);
    this.shutdownTimeoutMs = normalizePositiveInteger(options.shutdownTimeoutMs, DEFAULT_SHUTDOWN_TIMEOUT_MS);
    this.useWatcher = options.useWatcher !== false;
    this.now = options.now || (() => new Date().toISOString());
    this.onChunk = options.onChunk || null;
    this.onLifecycle = options.onLifecycle || null;
    this.fs = options.fs || fsp;
    this.watch = options.watch || fs.watch;

    this.started = false;
    this.stopped = false;
    this.checking = false;
    this.pendingCheck = false;
    this.deliveryInFlight = false;
    this.paused = false;
    this.pauseReason = null;
    this.everAvailable = false;
    this.sequence = 0;
    this.generation = 0;
    this.sourceState = null;
    this.lastLifecycleKey = null;
    this.lastErrorCode = null;
    this.fileWatcher = null;
    this.parentWatcher = null;
    this.pollTimer = null;
    this.currentCheck = null;
    this.currentDelivery = null;
  }

  async start() {
    if (this.started && !this.stopped) return this.getHealth();

    this.started = true;
    this.stopped = false;
    this.emitLifecycle(LIFECYCLE_TYPES.STARTED, {
      startMode: this.startMode,
      generation: this.generation
    });
    this.openParentWatcher();
    this.openPollTimer();
    await this.checkNow('startup');
    return this.getHealth();
  }

  async stop(reason = 'user_requested') {
    if (!this.started || this.stopped) return this.getHealth();

    this.stopped = true;
    this.closeWatchers();
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;

    if (this.currentDelivery) {
      await settleWithin(this.currentDelivery, this.shutdownTimeoutMs);
    }

    this.emitLifecycle(LIFECYCLE_TYPES.STOPPED, {
      reason,
      generation: this.generation,
      offset: this.sourceState?.offset || 0
    });
    return this.getHealth();
  }

  pause(reason = 'manual') {
    if (this.paused) return this.getHealth();
    this.paused = true;
    this.pauseReason = reason;
    this.emitLifecycle(LIFECYCLE_TYPES.BACKPRESSURE_PAUSED, {
      reason,
      generation: this.generation,
      offset: this.sourceState?.offset || 0
    });
    return this.getHealth();
  }

  async resume() {
    if (!this.paused) return this.getHealth();
    const reason = this.pauseReason;
    this.paused = false;
    this.pauseReason = null;
    this.emitLifecycle(LIFECYCLE_TYPES.BACKPRESSURE_RESUMED, {
      reason,
      generation: this.generation,
      offset: this.sourceState?.offset || 0
    });
    await this.checkNow('resume');
    return this.getHealth();
  }

  async checkNow(reason = 'manual') {
    if (!this.started || this.stopped) return this.getHealth();
    if (this.paused) return this.getHealth();

    this.pendingCheck = true;
    if (this.checking) {
      if (this.deliveryInFlight) this.markSlowConsumer('pending_delivery');
      return this.currentCheck || this.getHealth();
    }

    this.currentCheck = this.drainChecks(reason);
    try {
      await this.currentCheck;
    } finally {
      this.currentCheck = null;
    }
    return this.getHealth();
  }

  getHealth() {
    const backlogBytes = this.sourceState
      ? Math.max(0, (this.sourceState.size || 0) - (this.sourceState.offset || 0))
      : 0;

    return {
      status: this.stopped
        ? 'stopped'
        : this.paused
          ? 'paused'
          : this.sourceState?.available
            ? 'monitoring'
            : this.started
              ? 'waiting_for_source'
              : 'idle',
      available: Boolean(this.sourceState?.available),
      generation: this.generation,
      sequence: this.sequence,
      offset: this.sourceState?.offset || 0,
      fileSize: this.sourceState?.size || 0,
      backlogBytes,
      pendingCheck: this.pendingCheck || this.checking,
      deliveryInFlight: this.deliveryInFlight,
      paused: this.paused,
      pauseReason: this.pauseReason,
      lastErrorCode: this.lastErrorCode,
      sourceIdentity: this.sourceState?.identity || null,
      lastObservedAt: this.sourceState?.observedAt || null,
      lastDeliveredAt: this.sourceState?.lastDeliveredAt || null
    };
  }

  getCheckpoint() {
    if (!this.sourceState?.identity) return null;
    return {
      version: 1,
      sourceIdentity: this.sourceState.identity,
      offset: this.sourceState.offset,
      generation: this.generation,
      observedAt: this.sourceState.observedAt || null
    };
  }

  async drainChecks(reason) {
    this.checking = true;
    let nextReason = reason;
    try {
      while (this.pendingCheck && !this.stopped && !this.paused) {
        this.pendingCheck = false;
        await this.inspectSource(nextReason);
        nextReason = 'pending_notification';
      }
    } finally {
      this.checking = false;
    }
  }

  async inspectSource(reason) {
    let stat;
    try {
      stat = await this.fs.stat(this.sourcePath);
    } catch (error) {
      this.handleUnavailable(error, reason);
      return;
    }

    if (!stat.isFile()) {
      this.handleUnavailable(withCode('ENOTFILE'), reason);
      return;
    }

    const identity = createFileIdentity(stat);
    const observedAt = this.now();
    const previous = this.sourceState;

    if (!previous?.available) {
      const offset = this.everAvailable ? 0 : this.getInitialOffset(identity, stat.size);
      this.generation += 1;
      this.everAvailable = true;
      this.sourceState = {
        available: true,
        identity,
        offset,
        size: stat.size,
        observedAt,
        lastDeliveredAt: previous?.lastDeliveredAt || null
      };
      this.lastErrorCode = null;
      this.openFileWatcher();
      this.emitLifecycle(LIFECYCLE_TYPES.SOURCE_AVAILABLE, {
        reason,
        generation: this.generation,
        sourceIdentity: identity,
        offset,
        size: stat.size
      });
      await this.readAvailableBytes(stat);
      return;
    }

    if (identity !== previous.identity) {
      this.generation += 1;
      this.sourceState = {
        available: true,
        identity,
        offset: 0,
        size: stat.size,
        observedAt,
        lastDeliveredAt: previous.lastDeliveredAt || null
      };
      this.lastErrorCode = null;
      this.openFileWatcher();
      this.emitLifecycle(LIFECYCLE_TYPES.SOURCE_REPLACED, {
        reason,
        generation: this.generation,
        previousIdentity: previous.identity,
        sourceIdentity: identity,
        offset: 0,
        size: stat.size
      });
      await this.readAvailableBytes(stat);
      return;
    }

    this.sourceState.size = stat.size;
    this.sourceState.observedAt = observedAt;
    this.lastErrorCode = null;

    if (stat.size < previous.offset) {
      this.generation += 1;
      this.sourceState = {
        ...this.sourceState,
        offset: 0,
        size: stat.size
      };
      this.emitLifecycle(LIFECYCLE_TYPES.SOURCE_TRUNCATED, {
        reason,
        generation: this.generation,
        sourceIdentity: identity,
        previousOffset: previous.offset,
        size: stat.size
      });
      await this.readAvailableBytes(stat);
      return;
    }

    await this.readAvailableBytes(stat);
  }

  async readAvailableBytes(stat) {
    if (!this.sourceState?.available || this.paused) return;

    while (!this.stopped && !this.paused && this.sourceState.offset < stat.size) {
      const offsetStart = this.sourceState.offset;
      const byteLength = Math.min(this.maxChunkBytes, stat.size - offsetStart);
      let handle;
      try {
        handle = await this.fs.open(this.sourcePath, 'r');
        const buffer = Buffer.allocUnsafe(byteLength);
        const result = await handle.read(buffer, 0, byteLength, offsetStart);
        if (result.bytesRead <= 0) return;

        const offsetEnd = offsetStart + result.bytesRead;
        await this.deliverChunk({
          type: 'bytes',
          sequence: ++this.sequence,
          generation: this.generation,
          sourceIdentity: this.sourceState.identity,
          offsetStart,
          offsetEnd,
          byteLength: result.bytesRead,
          observedAt: this.sourceState.observedAt,
          ingestedAt: this.now(),
          fileSize: stat.size,
          bytes: buffer.subarray(0, result.bytesRead)
        });
        this.sourceState.offset = offsetEnd;
        this.sourceState.lastDeliveredAt = this.now();
      } catch (error) {
        this.handleReadError(error);
        return;
      } finally {
        if (handle) await handle.close().catch(() => {});
      }
    }
  }

  async deliverChunk(chunk) {
    let slowTimer = null;
    this.deliveryInFlight = true;
    const delivery = (async () => {
      try {
        slowTimer = setTimeout(() => {
          this.markSlowConsumer('slow_consumer');
        }, this.slowConsumerMs);

        if (this.onChunk) await this.onChunk(chunk);
        this.emit('chunk', chunk);
      } catch (error) {
        this.paused = true;
        this.pauseReason = 'consumer_error';
        this.lastErrorCode = 'consumer_error';
        this.emitLifecycle(LIFECYCLE_TYPES.CONSUMER_ERROR, {
          generation: this.generation,
          offset: chunk.offsetStart,
          retryable: true
        });
        throw error;
      } finally {
        if (slowTimer) clearTimeout(slowTimer);
        this.deliveryInFlight = false;
        if (this.pauseReason === 'slow_consumer' || this.pauseReason === 'pending_delivery') {
          this.paused = false;
          const reason = this.pauseReason;
          this.pauseReason = null;
          this.emitLifecycle(LIFECYCLE_TYPES.BACKPRESSURE_RESUMED, {
            reason,
            generation: this.generation,
            offset: chunk.offsetEnd
          });
        }
      }
    })();

    this.currentDelivery = delivery;
    try {
      await delivery;
    } finally {
      if (this.currentDelivery === delivery) this.currentDelivery = null;
    }
  }

  markSlowConsumer(reason) {
    if (this.paused || this.stopped) return;
    this.paused = true;
    this.pauseReason = reason;
    this.emitLifecycle(LIFECYCLE_TYPES.BACKPRESSURE_PAUSED, {
      reason,
      generation: this.generation,
      offset: this.sourceState?.offset || 0
    });
  }

  handleUnavailable(error, reason) {
    const errorCode = mapFsErrorCode(error);
    this.lastErrorCode = errorCode;
    this.closeFileWatcher();

    const wasAvailable = Boolean(this.sourceState?.available);
    this.sourceState = {
      available: false,
      identity: this.sourceState?.identity || null,
      offset: this.sourceState?.offset || 0,
      size: 0,
      observedAt: this.now(),
      lastDeliveredAt: this.sourceState?.lastDeliveredAt || null
    };

    if (wasAvailable || this.lastLifecycleKey !== `${LIFECYCLE_TYPES.SOURCE_UNAVAILABLE}:${errorCode}`) {
      this.emitLifecycle(LIFECYCLE_TYPES.SOURCE_UNAVAILABLE, {
        reason,
        status: errorCode,
        recoverable: errorCode !== 'permission_denied',
        generation: this.generation
      });
    }
  }

  handleReadError(error) {
    const errorCode = mapFsErrorCode(error);
    this.lastErrorCode = errorCode;
    this.emitLifecycle(LIFECYCLE_TYPES.READ_ERROR, {
      status: errorCode,
      retryable: errorCode !== 'permission_denied',
      generation: this.generation,
      offset: this.sourceState?.offset || 0
    });
    if (errorCode === 'missing' || errorCode === 'permission_denied') {
      this.handleUnavailable(error, 'read_error');
    }
  }

  emitLifecycle(type, payload = {}) {
    const record = {
      type,
      sequence: ++this.sequence,
      emittedAt: this.now(),
      ...payload
    };
    this.lastLifecycleKey = `${type}:${payload.status || payload.reason || ''}`;
    if (this.onLifecycle) this.onLifecycle(record);
    this.emit('lifecycle', record);
    return record;
  }

  getInitialOffset(identity, size) {
    if (
      this.startMode === START_MODES.FROM_CHECKPOINT
      && this.checkpoint
      && this.checkpoint.sourceIdentity === identity
    ) {
      return clampOffset(this.checkpoint.offset, size);
    }
    if (this.startMode === START_MODES.FROM_BEGINNING) return 0;
    return size;
  }

  openPollTimer() {
    if (!this.pollIntervalMs || this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      this.scheduleCheck('poll');
    }, this.pollIntervalMs);
    this.pollTimer.unref?.();
  }

  openParentWatcher() {
    if (!this.useWatcher || this.parentWatcher) return;
    try {
      this.parentWatcher = this.watch(path.dirname(this.sourcePath), { persistent: false }, (_eventType, filename) => {
        if (!filename || String(filename) === path.basename(this.sourcePath)) {
          this.scheduleCheck('parent_watch');
        }
      });
    } catch (error) {
      this.lastErrorCode = mapFsErrorCode(error);
    }
  }

  openFileWatcher() {
    if (!this.useWatcher) return;
    this.closeFileWatcher();
    try {
      this.fileWatcher = this.watch(this.sourcePath, { persistent: false }, () => {
        this.scheduleCheck('file_watch');
      });
    } catch (error) {
      this.lastErrorCode = mapFsErrorCode(error);
    }
  }

  scheduleCheck(reason) {
    if (this.stopped || !this.started) return;
    setImmediate(() => {
      this.checkNow(reason).catch((error) => {
        this.handleReadError(error);
      });
    });
  }

  closeWatchers() {
    this.closeFileWatcher();
    if (this.parentWatcher) this.parentWatcher.close();
    this.parentWatcher = null;
  }

  closeFileWatcher() {
    if (this.fileWatcher) this.fileWatcher.close();
    this.fileWatcher = null;
  }
}

function normalizeStartMode(value) {
  if (value === undefined || value === null || value === '') return START_MODES.FROM_CURRENT_END;
  if (!Object.values(START_MODES).includes(value)) {
    throw new TypeError(`Unsupported tailer start mode: ${value}`);
  }
  return value;
}

function normalizeCheckpoint(value) {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.sourceIdentity !== 'string') return null;
  return {
    version: 1,
    sourceIdentity: value.sourceIdentity,
    offset: Number.isSafeInteger(value.offset) && value.offset >= 0 ? value.offset : 0,
    generation: Number.isSafeInteger(value.generation) && value.generation >= 0 ? value.generation : 0
  };
}

function normalizePositiveInteger(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError('Expected a positive integer.');
  }
  return value;
}

function createFileIdentity(stat) {
  return [
    Number.isSafeInteger(stat.dev) ? stat.dev : 'unknown-dev',
    Number.isSafeInteger(stat.ino) ? stat.ino : 'unknown-ino',
    Number.isFinite(stat.birthtimeMs) ? Math.round(stat.birthtimeMs) : 'unknown-birth'
  ].join(':');
}

function clampOffset(offset, size) {
  if (!Number.isSafeInteger(offset) || offset < 0) return 0;
  return Math.min(offset, size);
}

function mapFsErrorCode(error) {
  switch (error?.code) {
    case 'ENOENT':
    case 'ENOTDIR':
      return 'missing';
    case 'EACCES':
    case 'EPERM':
      return 'permission_denied';
    case 'EBUSY':
    case 'ETXTBSY':
      return 'locked';
    case 'ENOTFILE':
      return 'not_file';
    default:
      return 'read_error';
  }
}

function withCode(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function settleWithin(promise, timeoutMs) {
  let timer;
  try {
    await Promise.race([
      promise.catch(() => {}),
      new Promise((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = {
  LIFECYCLE_TYPES,
  RuntimeLogTailer,
  START_MODES,
  createFileIdentity,
  mapFsErrorCode
};
