# Canonical event store

## Status

| Field | Value |
| --- | --- |
| Status | Implemented for issue [#28](https://github.com/Presstronic/astradock-local/issues/28) |
| Schema | `canonical-event-store/2` |
| Event contract | `runtime-event/v1` |
| Storage engine | `better-sqlite3-multiple-ciphers@13.0.3` |
| Encryption | SQLite3MultipleCiphers default `sqleet` cipher; 256-bit random local key |

## Boundary and data flow

`CanonicalEventStore` is a main-process repository. Parsers produce validated canonical events; scans append those events idempotently; renderer DTOs receive only storage health. Parser profiles, renderer code, and future synchronization code do not receive a database object, encryption key, SQL capability, or database path.

The database lives under Electron `userData/telemetry/canonical-events.db`. A random 32-byte key is wrapped with Electron `safeStorage` and the wrapped value is stored separately as `database-key.json` with owner-only permissions where the platform supports them. Key buffers are zeroed after use and on store close; only wrapped key metadata is persisted. If secure storage is unavailable, uses Linux `basic_text`, cannot unwrap the key, or returns malformed metadata, the database fails closed. Live monitoring remains available and reports that durability is unavailable; no plaintext database fallback is created.

Each completed scan offers all canonical events to the store. Since the prototype scanner can rescan the whole file, the primary-key and canonical-content check make repeated appends deterministic and idempotent. A reused event ID with different serialized content is an explicit conflict and rolls back its batch.

## Schema and ordering

Schema version 2 contains:

- `schema_metadata`: application schema version and last successful migration time;
- `events`: indexed canonical envelope fields plus the lossless serialized event; and
- `checkpoints`: environment-scoped, named, versioned JSON checkpoints with a total-order cursor.

Events retain IDs, type and contract version, environment, source and ingestion timestamps, order key, optional session correlation, profile/parser versions, provenance, confidence, sensitivity, sync policy, and the complete canonical JSON document. Reads deserialize and revalidate `runtime-event/v1`; corruption or unsupported event content is never silently returned.

Ordering uses the canonical event order key followed by event ID. Queries require `environmentKey`, accept optional session, event-type and time filters, enforce limits from 1 through 500, and return an opaque versioned cursor. Cursor pagination is stable and does not use mutable row offsets.

Event batches and an optional replay checkpoint commit in one SQLite transaction. This provides the atomic watermark boundary needed by issue #32 without making the event store own replay logic.

## Retention, deletion, and health

The default retention window is 30 days using ingestion time. Cleanup can be scoped to one environment and exposes before/after hooks for later evidence, projection, and size-cap coordination. The repository also supports deleting one environment or all telemetry; these operations delete matching checkpoints transactionally. Preferences, secure-key metadata, and local identity are outside this repository and are not removed by telemetry deletion.

Health includes schema version, encryption status, WAL mode, database byte size, event count, environment count, and oldest/newest source timestamps. Renderer-facing health contains no filesystem location or key information.

The ADR's 250 MB soft-cap orchestration, evidence/projection repositories, UI deletion controls, and compaction scheduling remain separate follow-up boundaries. The event store exposes the size and retention primitives those services need.

## Failure and recovery behavior

| Condition | Behavior |
| --- | --- |
| New database | Create directories, apply encryption key, migrate transactionally, enable foreign keys and WAL |
| Duplicate event | Compare the contract-owned event identity, return an idempotent duplicate count, and preserve the first stored envelope |
| Same ID, different content | Reject and roll back the batch |
| Invalid event or checkpoint | Reject before commit and roll back |
| Locked database | Report `store_locked`; caller may retry |
| Disk full | Report `disk_full`; never report success |
| Permission/open failure | Report `permission_denied` |
| Wrong key/corruption | Report `store_corrupt_or_wrong_key`, preserve the file, and require explicit recovery/reset |
| Future schema | Report non-recoverable `unsupported_schema`; never downgrade or delete |
| Failed migration | Roll back and report `migration_failed` |
| Corrupt checkpoint/event JSON | Reject the read; never substitute an empty value |

Automatic destructive repair is forbidden. Operators should preserve the database and wrapped-key metadata together, resolve secure-storage or permission problems, and retry. Reset/delete workflows require their separately specified confirmation boundary.

## Technology, packaging, and licensing

`better-sqlite3-multiple-ciphers` 13.0.3 is MIT licensed, requires Node 22 or newer, provides prebuilt native binaries for major targets, uses the synchronous `better-sqlite3` transaction API, and bundles SQLite 3.53.4 with SQLite3MultipleCiphers 2.4.0. Electron Builder must rebuild or select the native module for Electron's ABI during Windows NSIS/portable and Linux AppImage/deb packaging qualification. The dependency supports WAL and exposes buffer-based `key()`/`rekey()` APIs, avoiding SQL interpolation of encryption secrets.

Upgrades require release-note, SQLite format, cipher compatibility, Electron ABI, license, Windows packaging, and Linux packaging review. Issue #45 owns installer qualification; a package build in this change verifies native-module discovery on the development target.

No network API or external database service is introduced.

## Verification

Automated tests cover encrypted bytes, restart round-trip, exact canonical content, idempotency, transaction rollback, event-ID conflicts, LIVE/PTU isolation, deterministic filtering and cursor pagination, bounded limits, retention hooks, environment/all deletion, wrong keys, future-schema rejection, schema-1 migration, atomic event/checkpoint writes, checkpoint lifecycle, key wrapping, file permissions, and unprotected secure-storage rejection.

Run:

```text
npm test
npm run benchmark:store
npm run build
```
