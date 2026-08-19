# ADR-0003: MVP local persistence engine and retention model

- **Status:** Accepted
- **Date:** 2026-08-11
- **Decision owners:** AstraDock Local product owner and maintainers
- **Decision issue:** [#5](https://github.com/Presstronic/astradock-local/issues/5)
- **Applies to:** MVP local persistence and replay unless superseded

## Context

AstraDock Local needs durable local state for the MVP Runtime Monitor. The app must survive restarts, replay recent telemetry, reconstruct projections, preserve bounded diagnostic evidence, retain user preferences, and keep Star Citizen environments isolated from each other.

The persistence decision must support a self-contained Electron desktop app on Windows and Linux without requiring the user to install or manage a separate database service. It must also account for privacy-sensitive data that can appear in `game.log`, including player handles, account identifiers, server or network details, and filesystem paths.

This ADR decides the MVP storage technology, logical boundaries, retention defaults, deletion semantics, encryption posture, recovery behavior, and packaging expectations. It does not implement the store.

## Decision

AstraDock Local will use an encrypted SQLite database as the MVP local persistence engine.

Storage access will be isolated behind main-process repository interfaces. Parsers, rule evaluators, renderers, and future sync code must not depend directly on SQLite APIs, SQL statements, driver-specific behavior, or database file paths.

The application will store the database under Electron's `app.getPath('userData')`, scoped to AstraDock Local's application identity. The main process is the only database writer. Renderer access goes through narrow, validated IPC methods.

The SQLite database must use:

- Write-ahead logging when compatible with the selected encryption driver and target package formats.
- Explicit schema migrations with an application-managed schema version.
- Transactions for event append, projection checkpoint updates, retention cleanup, deletion, and migration steps that must be atomic.
- Indexes aligned to the required replay, filtering, retention, and environment-isolation queries.
- Local encryption at rest, with encryption keys stored through operating-system secure storage where available.

The initial retention model is a 30-day rolling window for persisted telemetry and evidence, with a conservative 250 MB soft cap for the local database. Time-based retention is the primary control. Size-based cleanup exists to prevent the app from becoming a storage or memory burden while real-world usage data is still unknown.

All persisted telemetry and evidence classes follow the same 30-day retention window for MVP unless later evidence proves that a class needs a stricter or longer policy. This includes canonical normalized events, diagnostic unknown evidence, sanitized evidence snippets, projections, and checkpoints. User preferences are not telemetry and are not deleted by normal telemetry retention.

Raw Star Citizen logs must not be retained wholesale. The store may contain bounded evidence records, sanitized snippets, parser diagnostics, and source references needed for diagnosis and replay. Sensitive data must be identified, minimized, classified, and documented so the policy can be revisited before wider release.

The ADR defines four deletion/reset modes:

- Delete sensitive evidence only.
- Delete current environment telemetry.
- Delete all telemetry.
- Reset all app data.

The MVP UI may expose only "Delete all telemetry" and "Reset all app data" initially, but the storage architecture must support all four modes without requiring a schema redesign.

## Rationale

SQLite is the standard embedded database choice for a self-contained desktop app that needs durable structured storage, indexed queries, transactions, migrations, crash recovery, and bounded retention without an external service. It is widely deployed, operationally simple, well understood, and appropriate for append/query/replay workloads at AstraDock Local's expected MVP scale.

The main tradeoff is Electron packaging. SQLite access from Node usually requires a native module or bundled native extension. That creates build and distribution work for Windows and Linux, especially across Electron ABI changes. This risk is acceptable because the alternative engines either fit the workload less well or create larger architectural compromises.

Encryption at rest is required because even minimized local telemetry can contain sensitive player, account, network, or filesystem evidence. Encryption does not remove the need for minimization, retention, deletion, and renderer isolation.

The 30-day retention window gives enough history for session replay and debugging without turning AstraDock Local into a long-term telemetry archive. The 250 MB soft cap is intentionally conservative until real log volume and event density are measured.

## Alternatives Considered

### Plain SQLite

Plain SQLite provides the right storage model, query capability, and operational simplicity, but does not meet the encryption-at-rest requirement. It remains the logical engine, but must be paired with an encryption-capable driver or extension.

### JSON or Append-Only Files

Flat files avoid native module packaging but make schema evolution, indexed queries, retention, atomic checkpoints, deletion semantics, and corruption recovery harder. They are acceptable for small preferences but not for the MVP event store.

### Electron Store

Electron Store is suitable for small settings and preferences. It is not appropriate for telemetry replay, event indexing, migrations across data classes, environment partitioning, or retention enforcement at meaningful volume.

### IndexedDB

IndexedDB is available in renderer/browser contexts but would push persistence into the wrong process boundary. AstraDock Local needs main-process ownership of filesystem, parsing, privacy, and future sync boundaries. IndexedDB is also less convenient for deterministic repository tests and package-level backup/repair behavior.

### LevelDB or RocksDB

Key-value stores can handle append-style data but make relational filtering, migrations, inspection, and deletion semantics less transparent. They are less compelling than SQLite for this workload and add native packaging concerns without enough benefit.

### DuckDB

DuckDB is strong for analytical columnar workloads but is not the right default for operational event append, transactional checkpointing, and small indexed replay queries in an MVP desktop companion.

### Embedded Postgres or External Database

Postgres is inappropriate for a fully self-contained MVP desktop app. It would add process management, port conflicts, upgrades, backups, failure modes, and user-visible operational burden.

## Logical Data Model

The database will separate these logical data classes:

- Canonical events: normalized versioned telemetry events produced from observed runtime data or later mined-data jobs.
- Event evidence: bounded sanitized snippets, source offsets, source references, parser diagnostics, and classification metadata that explain how an event was produced.
- Unknown evidence: bounded records for lines or observations that were not recognized but are useful for parser improvement.
- Projections: derived read models such as current session state, recent timeline summaries, shard history, and UI-ready counters.
- Checkpoints: tailer offsets, source fingerprints, parser versions, projection replay positions, and migration state.
- Preferences: local user choices such as selected log path, retention preferences, and UI settings.
- Local identity and security metadata: device-local identifiers, encrypted-key metadata, and future sync credential references.

The initial schema sketch is:

| Table or data class | Required purpose | Required partitioning | Retention behavior |
| --- | --- | --- | --- |
| `events` | Canonical normalized event envelope and event payload | `environmentKey` | 30-day telemetry retention |
| `event_evidence` | Sanitized snippets, source offsets, parser diagnostics, and event provenance detail | `environmentKey`, event ID | 30-day telemetry retention |
| `unknown_evidence` | Bounded unrecognized observations for parser improvement | `environmentKey` | 30-day telemetry retention |
| `projections` | Rebuildable read models for sessions, timeline, shard history, and UI summaries | `environmentKey`, projection name | Rebuilt or pruned with source telemetry |
| `checkpoints` | Tailer offsets, source fingerprints, parser versions, replay positions, and migration markers | `environmentKey` where source-specific | Pruned when source telemetry expires or environment is deleted |
| `preferences` | User choices and non-telemetry application settings | App-level or named scope | Kept until reset or explicit preference deletion |
| `local_identity` | Device-local identifiers, encryption metadata references, and future sync identity references | App-level | Kept until reset |

Each row that represents environment-specific runtime or mined game state must include an `environmentKey`. The key partitions Star Citizen channel/build scope such as `LIVE`, `PTU`, `EPTU`, or a richer derived key when channel alone is insufficient. Identical identifiers from different environments must never collide.

Canonical events must include, at minimum:

- Stable local event ID.
- Event type and event schema version.
- Environment key.
- Source timestamp when available.
- Ingestion timestamp.
- Source location reference.
- Parser or rule version.
- Provenance classification.
- Redaction or sensitivity classification.
- Event payload.

The storage layer may use JSON payload columns for event-specific fields in MVP, but indexed columns must exist for common queries: environment, event type, source timestamp, ingestion timestamp, session correlation, retention eligibility, and sync/export eligibility once that exists.

## Repository Interface Boundary

SQLite must be hidden behind stable application interfaces owned by the main process. The initial boundary should include repositories or services equivalent to:

| Interface | Responsibility |
| --- | --- |
| Event store | Append canonical events with evidence, query recent events, query by environment/session/type/time, and expose replay cursors. |
| Projection store | Read and write rebuildable projections with versioned checkpoints. |
| Checkpoint store | Persist tailer offsets, source fingerprints, parser versions, and replay positions atomically with related work where needed. |
| Evidence store | Persist bounded event evidence and unknown evidence, classify sensitivity, and delete sensitive evidence independently. |
| Preference store | Persist non-telemetry user settings without coupling them to event retention. |
| Retention service | Apply time-based cleanup, size-cap cleanup, compaction, and storage metrics. |
| Deletion service | Execute the four deletion/reset modes transactionally or resume them after interruption. |
| Migration service | Open, validate, migrate, repair, or reject the local database before normal app work starts. |

Renderer IPC may call application commands backed by these interfaces, but it must not receive database handles, encryption keys, arbitrary SQL execution, or unrestricted filesystem paths.

## Retention Policy

The default telemetry retention window is 30 days.

| Data class | Default retention | Size-cap behavior | User deletion behavior |
| --- | --- | --- | --- |
| Canonical events | 30 days | Eligible after normal retention cleanup; preserved over evidence when possible | Environment, all telemetry, reset |
| Event evidence | 30 days | Eligible before canonical events if size pressure remains | Sensitive-only, environment, all telemetry, reset |
| Unknown evidence | 30 days | Eligible before canonical events if size pressure remains | Sensitive-only, environment, all telemetry, reset |
| Projections | Source telemetry lifetime | Rebuild or prune after cleanup | Environment, all telemetry, reset |
| Checkpoints | Relevant source lifetime | Prune stale source checkpoints | Environment, all telemetry, reset |
| Preferences | Until explicit reset/change | Not deleted for telemetry size cleanup | Reset app data |
| Local identity and encryption metadata | Until explicit reset | Not deleted for telemetry size cleanup | Reset app data |

Retention cleanup applies to:

- Canonical events.
- Event evidence.
- Unknown evidence.
- Projections derived only from expired telemetry.
- Checkpoints that no longer correspond to retained sources.

Retention cleanup does not automatically delete:

- User preferences.
- App configuration.
- Current encryption-key metadata.
- Local identity records required to open the database or preserve app continuity.

The database has a 250 MB soft cap for MVP. When the database exceeds the soft cap, the app should:

1. Run normal time-based retention cleanup.
2. Compact or vacuum according to the selected SQLite encryption driver's supported safe procedure.
3. Surface storage status to the app if the database remains above the cap.
4. Prefer deleting telemetry/evidence before deleting preferences or identity metadata.

The app should collect local, non-sensitive storage metrics such as database size, oldest retained event timestamp, row counts by data class, retention cleanup duration, and last cleanup outcome.

## Deletion and Reset Semantics

Delete sensitive evidence only:

- Deletes event evidence and unknown evidence classified as sensitive.
- Keeps canonical events, non-sensitive projections, checkpoints, and preferences.
- Rebuilds affected projections if they included evidence-derived fields.

Delete current environment telemetry:

- Deletes canonical events, event evidence, unknown evidence, projections, and checkpoints for the selected `environmentKey`.
- Keeps telemetry for other environments.
- Keeps preferences and app-level identity metadata unless they are explicitly scoped to the deleted environment.

Delete all telemetry:

- Deletes canonical events, event evidence, unknown evidence, telemetry projections, and telemetry checkpoints across all environments.
- Keeps user preferences, application configuration, encryption metadata, and local identity records.

Reset all app data:

- Deletes telemetry, evidence, projections, checkpoints, preferences, local identity records, sync configuration, and encryption metadata.
- Leaves the app in first-run state.
- Must require a clear user confirmation before execution.

Deletion must be transactional where possible. If interrupted, the app must either finish the deletion on next startup or leave enough state to detect and repair the partial operation.

## Privacy and Sensitive Data Handling

AstraDock Local must treat local telemetry as potentially sensitive even before Station sync exists.

MVP storage must:

- Avoid retaining raw log files or unbounded raw line history.
- Store only bounded evidence needed for diagnostics, replay, or parser improvement.
- Classify evidence sensitivity at write time where practical.
- Track whether persisted values are observed, extracted, inferred, or enriched.
- Keep unknown evidence local.
- Keep secrets out of the renderer and logs.
- Redact or minimize player handles, account identifiers, network details, and filesystem paths where they are not required for the user-facing feature.

The early MVP may store sensitive evidence locally so the team can identify real sensitive data classes before wider release. This is acceptable only with encryption at rest, bounded retention, deletion controls, local-only default behavior, and explicit follow-up review before broad distribution.

## Encryption and Key Management

The selected SQLite access layer must support encryption at rest. Candidate implementation options include SQLCipher-compatible SQLite drivers or another actively maintained encrypted SQLite distribution suitable for Electron packaging.

The encryption key must be generated locally and stored outside the renderer through an operating-system secure storage mechanism where available. The key must not be hardcoded, logged, uploaded, or exposed through renderer IPC.

If secure storage is unavailable or locked, the app must fail closed for database access and present a recoverable local error path. Recovery options may include retrying secure storage access, resetting all app data, or restoring from a future backup flow if one is added.

## Migration and Versioning

The database schema must have an explicit version table. Migrations must be deterministic, ordered, idempotency-aware, and covered by tests before implementation.

Migration behavior must address:

- Startup migration before normal reads and writes.
- Interrupted migrations.
- Roll-forward repair when safe.
- Backup or copy-before-migrate for risky migrations where practical.
- Clear error reporting when the store cannot be migrated.

Event schema versioning is separate from database schema versioning. The event envelope must retain each event's schema version so future replay can handle historical records.

## Reliability and Recovery

The storage layer must support:

- Atomic event append and checkpoint updates where required for replay correctness.
- Crash consistency for normal writes.
- Detection of corrupt or unreadable stores.
- A documented repair path for corruption, disk full, permission denied, locked file, failed compaction, and failed migration.
- Startup checks that can distinguish "no database yet" from "database exists but cannot be opened."

If the database is corrupt and repair is not possible, the app must avoid silent data loss. It should preserve the corrupt file where practical, create a new clean store only after clear user action or documented recovery policy, and report the failure in local diagnostics.

## Packaging and Licensing Requirements

The implementation issue must evaluate concrete encrypted SQLite driver options before adding dependencies.

The evaluation must document:

- Driver or extension name and version.
- License and redistribution compatibility.
- Native build requirements.
- Electron ABI rebuild support.
- Windows NSIS/portable compatibility.
- Linux AppImage/deb compatibility.
- WAL and compaction behavior with encryption enabled.
- Test strategy in CI and local packaging builds.

No storage dependency is added by this ADR.

## Consequences

Positive consequences:

- Provides a standard embedded persistence model for a self-contained desktop app.
- Supports robust replay, filtering, checkpoints, and retention.
- Keeps storage implementation details out of parsers, renderers, and future sync code.
- Establishes privacy and deletion expectations before implementation.

Negative consequences:

- Encrypted SQLite increases packaging and dependency evaluation work.
- Keychain integration adds platform-specific failure modes.
- Retention, compaction, and deletion behavior need focused tests instead of ad hoc file cleanup.

## Implementation selection

Issue #28 selects `better-sqlite3-multiple-ciphers` 13.0.3 (MIT) with SQLite3MultipleCiphers and Electron `safeStorage` key wrapping. The repository and operational contract are documented in [`../canonical-event-store.md`](../canonical-event-store.md). This selection satisfies encrypted embedded SQLite without exposing SQL or key material outside the main-process persistence boundary. Native Windows/Linux packaging remains subject to issue #45 release qualification.

## Follow-Up Issues

Follow-on implementation issues should reference this ADR and cover:

- Select and package an encrypted SQLite driver.
- Define repository interfaces and initial migrations.
- Implement event append, query, replay, and checkpoints.
- Implement retention cleanup and storage metrics.
- Implement deletion/reset flows.
- Add corruption, disk-full, permission-denied, locked-file, and interrupted-migration tests.
- Add privacy classification tests for sensitive evidence handling.
