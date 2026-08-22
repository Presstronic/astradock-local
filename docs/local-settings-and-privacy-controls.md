# Local settings and privacy controls

Issue #30 establishes the local-only controls for AstraDock Local. The renderer receives these values through the validated Electron bridge; it never receives a database handle, encryption key, arbitrary path, or SQL capability.

## Stored preferences

The main process stores a versioned, atomically replaced `renderer-settings.json` under Electron's user-data directory. Supported values are the active source-related identity fields, stream view, terminal/table density and drawer placement, and telemetry retention in the inclusive range of 1–365 days. Unknown, malformed, or out-of-range values use the documented defaults. The file is created with owner-only permissions on platforms that support POSIX modes.

The source path remains in the existing source-preference boundary and is revalidated before use. Settings and telemetry never make network requests.

## Storage and retention

Settings exposes only non-sensitive storage metrics: event count, environment count, database size, and oldest/newest retained event timestamps. Full source paths, raw lines, handles, identifiers, and keys are not returned by the settings API.

The default retention period is 30 days. Updating the retention value applies the cleanup to the encrypted canonical event store. A manual retention action may be scoped to an environment. Retention failures are returned as safe IPC errors and do not disclose filesystem details.

## Deletion and reset

All destructive actions require an explicit confirmation in the renderer and use a fixed command enum:

- `sensitive_evidence`: removes canonical events classified as personal, social, or secret and their associated checkpoints.
- `environment`: removes events and checkpoints for the explicitly supplied environment key only.
- `all_telemetry`: removes all canonical events and checkpoints while preserving preferences and local identity metadata.
- `reset`: stops monitoring, deletes all telemetry, removes settings and source preference, and returns the app to first-run state.

Deletion is performed by encrypted-store transactions. Monitoring is stopped before scoped environment deletion or reset. If storage is unavailable, the command fails without attempting arbitrary filesystem deletion.

The current MVP canonical store does not persist raw log lines or an independent event-evidence table. Unknown parser evidence remains bounded by the parser's in-memory evidence policy; a future durable evidence repository must join these same retention and deletion commands before unknown evidence is persisted.

## UI contract

The settings panel must expose loading/calculating, empty, success, and error states; binary storage units; localized dates; integer retention days; and a clear restatement of destructive scope in confirmation. Controls are keyboard reachable, have labels, and keep destructive actions grouped separately from ordinary preferences. Styling remains governed by the project design-system documents.
