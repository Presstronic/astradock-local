const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3-multiple-ciphers');
const { normalizeAbsoluteInstant } = require('../time');
const {
  createRuntimeEventOrderKey,
  deserializeRuntimeEvent,
  serializeRuntimeEventIdentity,
  toPersistenceRecord
} = require('../contracts/runtimeEvents');

const SCHEMA_VERSION = 2;
const DEFAULT_QUERY_LIMIT = 100;
const MAX_QUERY_LIMIT = 500;
const DEFAULT_RETENTION_DAYS = 30;

class CanonicalEventStoreError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'CanonicalEventStoreError';
    this.code = code;
    this.recoverable = options.recoverable !== false;
    this.details = options.details || {};
  }
}

class CanonicalEventStore {
  constructor(options = {}) {
    this.filePath = requireAbsoluteFilePath(options.filePath);
    this.key = requireEncryptionKey(options.encryptionKey);
    this.readonly = options.readonly === true;
    this.now = typeof options.now === 'function' ? options.now : () => new Date();
    this.retentionHooks = options.retentionHooks || {};
    this.closed = false;
    this.database = null;
    this.open();
  }

  open() {
    try {
      if (!this.readonly) fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
      this.database = new Database(this.filePath, {
        readonly: this.readonly,
        fileMustExist: this.readonly,
        timeout: 5_000
      });
      this.database.key(this.key);
      this.database.pragma('foreign_keys = ON');
      this.database.pragma('busy_timeout = 5000');
      this.assertReadable();
      if (!this.readonly) {
        this.database.pragma('journal_mode = WAL');
        this.database.pragma('synchronous = FULL');
        migrate(this.database, this.now);
        restrictFilePermissions(this.filePath);
      } else {
        assertSupportedSchema(this.database);
      }
      this.prepareStatements();
    } catch (error) {
      try { this.database?.close(); } catch (_closeError) {}
      this.database = null;
      throw normalizeStoreError(error, 'open_failed');
    }
  }

  assertReadable() {
    this.database.prepare('SELECT count(*) AS count FROM sqlite_master').get();
  }

  prepareStatements() {
    this.insertStatement = this.database.prepare(`
      INSERT INTO events (
        event_id, event_type, contract_version, environment_key, source_timestamp,
        ingested_at, order_key, session_id, source_profile_id, source_profile_version,
        parser_version, provenance, confidence, sensitivity, station_sync_policy,
        serialized_event, stored_at
      ) VALUES (
        @eventId, @eventType, @contractVersion, @environmentKey, @sourceTimestamp,
        @ingestedAt, @orderKey, @sessionId, @sourceProfileId, @sourceProfileVersion,
        @parserVersion, @provenance, @confidence, @sensitivity, @stationSyncPolicy,
        @serializedEvent, @storedAt
      ) ON CONFLICT(event_id) DO NOTHING
    `);
    this.readByIdStatement = this.database.prepare('SELECT serialized_event FROM events WHERE event_id = ?');
    this.upsertCheckpointStatement = this.database.prepare(`
      INSERT INTO checkpoints(environment_key, checkpoint_name, checkpoint_version, order_cursor, serialized_checkpoint, updated_at)
      VALUES (@environmentKey, @name, @version, @orderCursor, @serializedCheckpoint, @updatedAt)
      ON CONFLICT(environment_key, checkpoint_name) DO UPDATE SET
        checkpoint_version = excluded.checkpoint_version,
        order_cursor = excluded.order_cursor,
        serialized_checkpoint = excluded.serialized_checkpoint,
        updated_at = excluded.updated_at
    `);
    this.appendTransaction = this.database.transaction((events, checkpoint) => {
      const results = events.map((event) => this.appendOne(event));
      if (checkpoint) this.putCheckpointOne(checkpoint);
      return results;
    });
  }

  append(events, options = {}) {
    this.assertOpen();
    if (this.readonly) throw new CanonicalEventStoreError('store_readonly', 'Canonical event store is read-only.');
    const list = Array.isArray(events) ? events : [events];
    if (list.length === 0) return { attempted: 0, inserted: 0, duplicates: 0 };
    try {
      const checkpoint = options.checkpoint ? normalizeCheckpoint(options.checkpoint, this.now) : null;
      const results = this.appendTransaction(list, checkpoint);
      return {
        attempted: results.length,
        inserted: results.filter((result) => result === 'inserted').length,
        duplicates: results.filter((result) => result === 'duplicate').length
      };
    } catch (error) {
      throw normalizeStoreError(error, 'append_failed');
    }
  }

  putCheckpoint(checkpoint) {
    this.assertOpen();
    if (this.readonly) throw new CanonicalEventStoreError('store_readonly', 'Canonical event store is read-only.');
    try {
      this.putCheckpointOne(normalizeCheckpoint(checkpoint, this.now));
    } catch (error) {
      throw normalizeStoreError(error, 'checkpoint_write_failed');
    }
  }

  putCheckpointOne(checkpoint) {
    this.upsertCheckpointStatement.run(checkpoint);
  }

  getCheckpoint(environmentKey, name) {
    this.assertOpen();
    const row = this.database.prepare(`
      SELECT checkpoint_version, order_cursor, serialized_checkpoint, updated_at
      FROM checkpoints WHERE environment_key = ? AND checkpoint_name = ?
    `).get(requireNonEmptyString(environmentKey, 'environmentKey'), requireNonEmptyString(name, 'name'));
    if (!row) return null;
    try {
      return {
        version: row.checkpoint_version,
        orderCursor: row.order_cursor,
        value: JSON.parse(row.serialized_checkpoint),
        updatedAt: row.updated_at
      };
    } catch (error) {
      throw new CanonicalEventStoreError('checkpoint_corrupt', 'Stored checkpoint payload is invalid.', { cause: error, recoverable: false });
    }
  }

  deleteCheckpoint(environmentKey, name) {
    this.assertOpen();
    this.assertWritable();
    return this.database.prepare('DELETE FROM checkpoints WHERE environment_key = ? AND checkpoint_name = ?')
      .run(requireNonEmptyString(environmentKey, 'environmentKey'), requireNonEmptyString(name, 'name')).changes;
  }

  appendOne(event) {
    const record = toPersistenceRecord(event);
    const serializedEvent = record.serializedEvent;
    const result = this.insertStatement.run({
      ...record,
      orderKey: createRuntimeEventOrderKey(event),
      sessionId: sessionCorrelationId(event),
      storedAt: normalizeTimestamp(this.now())
    });
    if (result.changes === 1) return 'inserted';
    const existing = this.readByIdStatement.get(record.eventId);
    let existingEvent;
    try {
      existingEvent = deserializeRuntimeEvent(existing?.serialized_event);
    } catch (error) {
      throw new CanonicalEventStoreError('store_corrupt', 'An existing canonical event could not be validated.', {
        cause: error,
        recoverable: false,
        details: { eventId: record.eventId }
      });
    }
    if (serializeRuntimeEventIdentity(existingEvent) !== serializeRuntimeEventIdentity(event)) {
      throw new CanonicalEventStoreError('event_id_conflict', 'An event ID already exists with different canonical content.', {
        recoverable: false,
        details: { eventId: record.eventId }
      });
    }
    return 'duplicate';
  }

  query(options = {}) {
    this.assertOpen();
    const environmentKey = requireNonEmptyString(options.environmentKey, 'environmentKey');
    const limit = normalizeLimit(options.limit);
    const cursor = decodeCursor(options.cursor);
    const clauses = ['environment_key = @environmentKey'];
    const params = { environmentKey, limit: limit + 1 };

    if (options.sessionId) {
      clauses.push('session_id = @sessionId');
      params.sessionId = requireNonEmptyString(options.sessionId, 'sessionId');
    }
    if (options.eventTypes?.length) {
      const eventTypes = Array.from(new Set(options.eventTypes.map((value) => requireNonEmptyString(value, 'eventTypes'))));
      clauses.push(`event_type IN (${eventTypes.map((_, index) => `@eventType${index}`).join(', ')})`);
      eventTypes.forEach((value, index) => { params[`eventType${index}`] = value; });
    }
    if (options.from) {
      clauses.push('source_timestamp >= @from');
      params.from = normalizeTimestamp(options.from);
    }
    if (options.to) {
      clauses.push('source_timestamp <= @to');
      params.to = normalizeTimestamp(options.to);
    }
    if (cursor) {
      clauses.push('(order_key > @cursorOrderKey OR (order_key = @cursorOrderKey AND event_id > @cursorEventId))');
      params.cursorOrderKey = cursor.orderKey;
      params.cursorEventId = cursor.eventId;
    }

    const where = clauses.join(' AND ');
    try {
      const rows = this.database.prepare(`
        SELECT event_id, order_key, serialized_event
        FROM events WHERE ${where}
        ORDER BY order_key ASC, event_id ASC LIMIT @limit
      `).all(params);
      const hasMore = rows.length > limit;
      const selected = rows.slice(0, limit);
      const items = selected.map((row) => deserializeRuntimeEvent(row.serialized_event));
      const last = selected.at(-1);
      return {
        items,
        nextCursor: hasMore && last ? encodeCursor(last.order_key, last.event_id) : null,
        totalCount: this.database.prepare(`SELECT count(*) AS count FROM events WHERE ${clauses.filter((clause) => !clause.startsWith('(order_key >')).join(' AND ')}`).get(params).count
      };
    } catch (error) {
      throw normalizeStoreError(error, 'query_failed');
    }
  }

  getById(eventId, environmentKey) {
    this.assertOpen();
    const row = this.database.prepare(`
      SELECT serialized_event FROM events WHERE event_id = ? AND environment_key = ?
    `).get(requireNonEmptyString(eventId, 'eventId'), requireNonEmptyString(environmentKey, 'environmentKey'));
    return row ? deserializeRuntimeEvent(row.serialized_event) : null;
  }

  applyRetention(options = {}) {
    this.assertOpen();
    if (this.readonly) throw new CanonicalEventStoreError('store_readonly', 'Canonical event store is read-only.');
    const retentionDays = positiveNumber(options.retentionDays, DEFAULT_RETENTION_DAYS);
    const cutoff = options.cutoff ? normalizeTimestamp(options.cutoff) : new Date(this.now().valueOf() - retentionDays * 86_400_000).toISOString();
    const environmentKey = options.environmentKey ? requireNonEmptyString(options.environmentKey, 'environmentKey') : null;
    const startedAt = normalizeTimestamp(this.now());
    this.retentionHooks.onBeforeDelete?.({ cutoff, environmentKey });
    try {
      const result = this.database.transaction(() => {
        if (environmentKey) return this.database.prepare('DELETE FROM events WHERE environment_key = ? AND ingested_at < ?').run(environmentKey, cutoff);
        return this.database.prepare('DELETE FROM events WHERE ingested_at < ?').run(cutoff);
      })();
      const outcome = { cutoff, environmentKey, deleted: result.changes, startedAt, completedAt: normalizeTimestamp(this.now()) };
      this.retentionHooks.onAfterDelete?.(outcome);
      return outcome;
    } catch (error) {
      throw normalizeStoreError(error, 'retention_failed');
    }
  }

  deleteEnvironment(environmentKey) {
    this.assertOpen();
    this.assertWritable();
    const key = requireNonEmptyString(environmentKey, 'environmentKey');
    return this.database.transaction(() => {
      this.database.prepare('DELETE FROM checkpoints WHERE environment_key = ?').run(key);
      return this.database.prepare('DELETE FROM events WHERE environment_key = ?').run(key).changes;
    })();
  }

  deleteAllTelemetry() {
    this.assertOpen();
    this.assertWritable();
    return this.database.transaction(() => {
      this.database.prepare('DELETE FROM checkpoints').run();
      return this.database.prepare('DELETE FROM events').run().changes;
    })();
  }

  getHealth() {
    this.assertOpen();
    const databaseSizeBytes = databaseFootprint(this.filePath);
    const row = this.database.prepare(`
      SELECT count(*) AS event_count, min(source_timestamp) AS oldest_event_at,
             max(source_timestamp) AS newest_event_at, count(DISTINCT environment_key) AS environment_count
      FROM events
    `).get();
    return {
      status: 'ready',
      errorCode: null,
      recoverable: true,
      schemaVersion: this.database.pragma('user_version', { simple: true }),
      encrypted: true,
      journalMode: String(this.database.pragma('journal_mode', { simple: true })).toLowerCase(),
      databaseSizeBytes,
      eventCount: row.event_count,
      environmentCount: row.environment_count,
      oldestEventAt: row.oldest_event_at,
      newestEventAt: row.newest_event_at
    };
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.database?.close();
    this.database = null;
    this.key.fill(0);
  }

  assertOpen() {
    if (this.closed || !this.database) throw new CanonicalEventStoreError('store_closed', 'Canonical event store is closed.');
  }

  assertWritable() {
    if (this.readonly) throw new CanonicalEventStoreError('store_readonly', 'Canonical event store is read-only.');
  }
}

function migrate(database, now) {
  const current = Number(database.pragma('user_version', { simple: true }));
  if (current > SCHEMA_VERSION) throw new CanonicalEventStoreError('unsupported_schema', `Database schema ${current} is newer than supported schema ${SCHEMA_VERSION}.`, { recoverable: false });
  if (current === SCHEMA_VERSION) return;
  try {
    database.transaction(() => {
      if (current < 1) {
        database.exec(`
          CREATE TABLE IF NOT EXISTS schema_metadata (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            schema_version INTEGER NOT NULL,
            migrated_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS events (
            event_id TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            contract_version TEXT NOT NULL,
            environment_key TEXT NOT NULL,
            source_timestamp TEXT NOT NULL,
            ingested_at TEXT NOT NULL,
            order_key TEXT NOT NULL,
            session_id TEXT,
            source_profile_id TEXT NOT NULL,
            source_profile_version TEXT NOT NULL,
            parser_version TEXT NOT NULL,
            provenance TEXT NOT NULL,
            confidence TEXT NOT NULL,
            sensitivity TEXT NOT NULL,
            station_sync_policy TEXT NOT NULL,
            serialized_event TEXT NOT NULL,
            stored_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS events_environment_order_idx ON events(environment_key, order_key, event_id);
          CREATE INDEX IF NOT EXISTS events_environment_type_order_idx ON events(environment_key, event_type, order_key, event_id);
          CREATE INDEX IF NOT EXISTS events_environment_session_order_idx ON events(environment_key, session_id, order_key, event_id);
          CREATE INDEX IF NOT EXISTS events_retention_idx ON events(ingested_at, environment_key);
        `);
      }
      if (current < 2) {
        database.exec(`
          CREATE TABLE IF NOT EXISTS checkpoints (
            environment_key TEXT NOT NULL,
            checkpoint_name TEXT NOT NULL,
            checkpoint_version INTEGER NOT NULL,
            order_cursor TEXT NOT NULL,
            serialized_checkpoint TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY(environment_key, checkpoint_name)
          );
          CREATE INDEX IF NOT EXISTS checkpoints_updated_idx ON checkpoints(updated_at, environment_key);
        `);
      }
      database.prepare(`
        INSERT INTO schema_metadata(singleton, schema_version, migrated_at) VALUES (1, ?, ?)
        ON CONFLICT(singleton) DO UPDATE SET schema_version = excluded.schema_version, migrated_at = excluded.migrated_at
      `).run(SCHEMA_VERSION, normalizeTimestamp(now()));
      database.pragma(`user_version = ${SCHEMA_VERSION}`);
    })();
  } catch (error) {
    if (error instanceof CanonicalEventStoreError) throw error;
    throw new CanonicalEventStoreError('migration_failed', 'Canonical event store migration failed and was rolled back.', { cause: error });
  }
}

function assertSupportedSchema(database) {
  const current = Number(database.pragma('user_version', { simple: true }));
  if (current !== SCHEMA_VERSION) throw new CanonicalEventStoreError('unsupported_schema', `Read-only database schema ${current} is not supported.`, { recoverable: false });
}

function sessionCorrelationId(event) {
  const correlations = event.correlationIds || {};
  return correlations.puSessionId || correlations.sessionId || correlations.loginSessionId || null;
}

function normalizeCheckpoint(input, now) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CanonicalEventStoreError('invalid_checkpoint', 'Checkpoint must be an object.', { recoverable: false });
  const version = input.version;
  if (!Number.isSafeInteger(version) || version < 1) throw new CanonicalEventStoreError('invalid_checkpoint', 'Checkpoint version must be a positive integer.', { recoverable: false });
  let serializedCheckpoint;
  try {
    serializedCheckpoint = JSON.stringify(input.value);
    if (serializedCheckpoint === undefined) throw new Error('not serializable');
  } catch (error) {
    throw new CanonicalEventStoreError('invalid_checkpoint', 'Checkpoint value must be JSON serializable.', { cause: error, recoverable: false });
  }
  return {
    environmentKey: requireNonEmptyString(input.environmentKey, 'environmentKey'),
    name: requireNonEmptyString(input.name, 'name'),
    version,
    orderCursor: requireNonEmptyString(input.orderCursor, 'orderCursor'),
    serializedCheckpoint,
    updatedAt: normalizeTimestamp(now())
  };
}

function encodeCursor(orderKey, eventId) {
  return Buffer.from(JSON.stringify({ v: 1, orderKey, eventId }), 'utf8').toString('base64url');
}

function decodeCursor(value) {
  if (!value) return null;
  try {
    const cursor = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    if (cursor.v !== 1 || typeof cursor.orderKey !== 'string' || typeof cursor.eventId !== 'string') throw new Error('invalid cursor');
    return cursor;
  } catch (error) {
    throw new CanonicalEventStoreError('invalid_cursor', 'Event query cursor is invalid.', { cause: error });
  }
}

function normalizeStoreError(error, fallbackCode) {
  if (error instanceof CanonicalEventStoreError) return error;
  const message = String(error?.message || error || 'Unknown storage error');
  const code = String(error?.code || '');
  if (code.includes('SQLITE_BUSY') || code.includes('SQLITE_LOCKED')) return new CanonicalEventStoreError('store_locked', 'Canonical event store is locked by another operation.', { cause: error });
  if (code.includes('SQLITE_FULL')) return new CanonicalEventStoreError('disk_full', 'Canonical event store could not write because the disk is full.', { cause: error });
  if (code.includes('SQLITE_CORRUPT') || code.includes('SQLITE_NOTADB') || /not a database|encrypted/i.test(message)) return new CanonicalEventStoreError('store_corrupt_or_wrong_key', 'Canonical event store is unreadable, corrupt, or encrypted with a different key.', { cause: error, recoverable: false });
  if (code === 'EACCES' || code === 'EPERM' || code.includes('SQLITE_PERM') || code.includes('SQLITE_CANTOPEN')) return new CanonicalEventStoreError('permission_denied', 'Canonical event store cannot be opened with current filesystem permissions.', { cause: error });
  return new CanonicalEventStoreError(fallbackCode, `Canonical event store operation failed: ${message}`, { cause: error });
}

function requireAbsoluteFilePath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.basename(value) === '') throw new CanonicalEventStoreError('invalid_store_path', 'Canonical event store path must be an absolute file path.', { recoverable: false });
  return path.normalize(value);
}

function requireEncryptionKey(value) {
  if (!Buffer.isBuffer(value) || value.byteLength < 32) throw new CanonicalEventStoreError('encryption_key_unavailable', 'A 256-bit or stronger local encryption key is required.', { recoverable: false });
  return Buffer.from(value);
}

function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new CanonicalEventStoreError('invalid_query', `${field} must be a non-empty string.`, { recoverable: false });
  return value.trim();
}

function normalizeTimestamp(value) {
  const instant = normalizeAbsoluteInstant(value);
  if (!instant) throw new CanonicalEventStoreError('invalid_timestamp', 'Timestamp must be a valid offset-bearing instant.', { recoverable: false });
  return instant;
}

function normalizeLimit(value) {
  if (value === undefined) return DEFAULT_QUERY_LIMIT;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_QUERY_LIMIT) throw new CanonicalEventStoreError('invalid_query', `limit must be between 1 and ${MAX_QUERY_LIMIT}.`, { recoverable: false });
  return value;
}

function positiveNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function databaseFootprint(filePath) {
  return [filePath, `${filePath}-wal`, `${filePath}-shm`].reduce((total, candidate) => {
    try { return total + fs.statSync(candidate).size; } catch (_error) { return total; }
  }, 0);
}

function restrictFilePermissions(filePath) {
  if (process.platform === 'win32') return;
  fs.chmodSync(filePath, 0o600);
}

module.exports = {
  CanonicalEventStore,
  CanonicalEventStoreError,
  DEFAULT_RETENTION_DAYS,
  MAX_QUERY_LIMIT,
  SCHEMA_VERSION,
  decodeCursor,
  encodeCursor
};
