'use strict';

const { compareRuntimeEventOrder, createRuntimeEventOrderKey } = require('../contracts/runtimeEvents');
const { encodeCursor } = require('./canonicalEventStore');
const { PROJECTION_CONTRACT_VERSION } = require('../stateProjection');

const REPLAY_CHECKPOINT_VERSION = 1;
const DEFAULT_CHECKPOINT_NAME = 'runtime-projections';
const DEFAULT_PAGE_SIZE = 250;

class ReplayCoordinatorError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'ReplayCoordinatorError';
    this.code = code;
    this.recoverable = options.recoverable !== false;
    this.details = options.details || {};
  }
}

class ReplayCancelledError extends ReplayCoordinatorError {
  constructor(details = {}) {
    super('replay_cancelled', 'Runtime projection recovery was cancelled safely.', { details });
    this.name = 'ReplayCancelledError';
  }
}

/**
 * Coordinates durable canonical events, disposable projection checkpoints, and
 * the buffered handoff to live ingestion. It intentionally knows nothing
 * about Electron, files, parsers, or renderer DTOs.
 */
class ReplayCoordinator {
  constructor(options = {}) {
    if (!options.store || typeof options.store.query !== 'function') throw new TypeError('ReplayCoordinator requires an event store.');
    if (typeof options.createRegistry !== 'function') throw new TypeError('ReplayCoordinator requires a registry factory.');
    this.store = options.store;
    this.createRegistry = options.createRegistry;
    this.checkpointName = options.checkpointName || DEFAULT_CHECKPOINT_NAME;
    this.pageSize = normalizePageSize(options.pageSize);
    this.now = typeof options.now === 'function' ? options.now : () => new Date();
  }

  async recover(environmentKey, options = {}) {
    requireEnvironmentKey(environmentKey);
    const signal = options.signal;
    const registry = this.createRegistry({ environmentKey });
    if (!registry || typeof registry.replay !== 'function' || typeof registry.checkpoint !== 'function') {
      throw new TypeError('Registry factory must return a replayable projection registry.');
    }

    const startedAt = this.now();
    let mode = 'full_rebuild';
    let checkpoint = null;
    let checkpointIssue = null;
    try {
      checkpoint = this.store.getCheckpoint(environmentKey, this.checkpointName);
      if (checkpoint) {
        validateStoredCheckpoint(checkpoint, environmentKey);
        registry.restore(checkpoint.value.registry);
        mode = 'checkpoint_restore';
      }
    } catch (error) {
      checkpointIssue = describeCheckpointIssue(error);
      registry.reset?.(environmentKey);
      checkpoint = null;
      mode = 'full_rebuild';
    }

    let cursor = checkpoint?.orderCursor || null;
    let processed = 0;
    let applied = 0;
    let duplicates = 0;
    let lastCursor = cursor;
    let totalCount = null;

    try {
      while (true) {
        throwIfCancelled(signal, { processed, mode });
        const page = this.store.query({ environmentKey, cursor, limit: this.pageSize });
        totalCount = page.totalCount;
        if (!page.items.length) break;
        const result = registry.replay(page.items);
        processed += page.items.length;
        applied += result.applied;
        duplicates += page.items.length - result.applied;
        lastCursor = page.nextCursor || cursorForLast(page.items);
        await notifyProgress(options.onProgress, { phase: 'replay', mode, processed, totalCount, cursor: lastCursor });
        throwIfCancelled(signal, { processed, mode });
        if (page.nextCursor === null) break;
        cursor = page.nextCursor;
      }

      // The caller must capture this buffer before replay starts. Applying it
      // after the final query closes the restart gap; registry IDs make it
      // safe if an event was already present in the replay pages.
      const handoff = Array.isArray(options.liveEvents) ? [...options.liveEvents].sort(compareRuntimeEventOrder) : [];
      for (const event of handoff) {
        throwIfCancelled(signal, { processed, mode: 'live_handoff' });
        if (event.environmentKey !== environmentKey) continue;
        const result = registry.apply(event);
        if (result.status === 'applied') applied += 1;
        else duplicates += 1;
        lastCursor = cursorForEvent(event, lastCursor);
      }

      const value = createCheckpointValue(environmentKey, registry, lastCursor, options.sourceContext);
      this.store.putCheckpoint({
        environmentKey,
        name: this.checkpointName,
        version: REPLAY_CHECKPOINT_VERSION,
        orderCursor: lastCursor || cursorForEmptyStore(),
        value
      });
      await notifyProgress(options.onProgress, { phase: 'complete', mode: handoff.length ? 'live' : mode, processed, totalCount, cursor: lastCursor });
      return {
        environmentKey,
        mode: handoff.length ? 'live' : mode,
        recoveryState: handoff.length ? 'live' : 'last-confirmed',
        checkpointIssue,
        processed,
        applied,
        duplicates,
        totalCount,
        startedAt: toIso(startedAt),
        completedAt: toIso(this.now()),
        registry,
        snapshot: registry.query({ environmentKey })
      };
    } catch (error) {
      if (error instanceof ReplayCoordinatorError) throw error;
      throw new ReplayCoordinatorError('replay_failed', 'Runtime projection recovery failed before a safe handoff.', {
        cause: error,
        details: { environmentKey, processed, mode }
      });
    }
  }
}

function createCheckpointValue(environmentKey, registry, orderCursor, sourceContext) {
  return {
    format: `runtime-projection-checkpoint/${REPLAY_CHECKPOINT_VERSION}`,
    environmentKey,
    projectionContractVersion: PROJECTION_CONTRACT_VERSION,
    orderCursor: orderCursor || null,
    sourceContext: sourceContext ? sanitizeSourceContext(sourceContext) : null,
    registry: registry.checkpoint()
  };
}

function validateStoredCheckpoint(checkpoint, environmentKey) {
  if (!checkpoint || checkpoint.version !== REPLAY_CHECKPOINT_VERSION || !checkpoint.value) throw new ReplayCoordinatorError('checkpoint_incompatible', 'Projection checkpoint version is unsupported.');
  const value = checkpoint.value;
  if (value.format !== `runtime-projection-checkpoint/${REPLAY_CHECKPOINT_VERSION}`
    || value.environmentKey !== environmentKey
    || value.projectionContractVersion !== PROJECTION_CONTRACT_VERSION
    || !value.registry) {
    throw new ReplayCoordinatorError('checkpoint_incompatible', 'Projection checkpoint contract does not match the active replay coordinator.');
  }
}

function describeCheckpointIssue(error) {
  return { code: error?.code || 'checkpoint_invalid', message: 'A saved projection checkpoint was ignored and rebuilt from canonical events.' };
}

function cursorForLast(events) {
  return events.length ? cursorForEvent(events.at(-1), null) : null;
}

function cursorForEvent(event, fallback) {
  if (!event?.eventId) return fallback;
  return encodeCursor(createRuntimeEventOrderKey(event), event.eventId);
}

function cursorForEmptyStore() { return encodeCursor('', ''); }
function requireEnvironmentKey(value) { if (typeof value !== 'string' || !value.trim()) throw new TypeError('environmentKey is required for replay.'); }
function normalizePageSize(value) { return Number.isSafeInteger(value) && value > 0 && value <= 500 ? value : DEFAULT_PAGE_SIZE; }
function throwIfCancelled(signal, details) { if (signal?.aborted) throw new ReplayCancelledError(details); }
async function notifyProgress(callback, value) { if (typeof callback === 'function') await callback(Object.freeze({ ...value })); }
function toIso(value) { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
function sanitizeSourceContext(value) { return { sourceId: typeof value.sourceId === 'string' ? value.sourceId : null, buildVersion: typeof value.buildVersion === 'string' ? value.buildVersion : null, channel: typeof value.channel === 'string' ? value.channel : null }; }

module.exports = {
  DEFAULT_CHECKPOINT_NAME,
  DEFAULT_PAGE_SIZE,
  REPLAY_CHECKPOINT_VERSION,
  ReplayCancelledError,
  ReplayCoordinator,
  ReplayCoordinatorError,
  createCheckpointValue,
  validateStoredCheckpoint
};
