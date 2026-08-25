# Issue 124: Recover current telemetry when monitoring starts mid-session

## Context and problem

Players can open AstraDock after Star Citizen is already running. Starting a file tail at the current end alone cannot describe party, mission, location, destination, vehicle, or lifecycle evidence written earlier in the active `game.log`.

## User story

As a player who starts AstraDock after entering the game, I want the monitor to reconstruct the latest supported telemetry from the retained game log, so that I can see useful current context immediately.

## Intended outcome

Monitor startup explicitly performs a bounded whole-file bootstrap scan, persists recognized canonical events idempotently, and exposes the resulting state as `last_confirmed` until new bytes prove a live handoff. The tailer still begins at the current file end, so bootstrap does not replay the entire file through the live stream.

## In scope

- Add a validated `bootstrapMode` contract with `current_state` and `none` values.
- Make monitor startup use `current_state` by default.
- Add a repeatable `Recover current state` action while monitoring.
- Return recovery provenance, event count, observation time, and the limitation that log reconstruction is not proof of a live connection.
- Preserve existing projection qualification and parser/profile limitations.

## Non-goals

- Inferring unsupported state from marker-only or ambiguous log lines.
- Claiming that the player is currently connected without post-bootstrap live evidence.
- Reading another source, querying Station, or uploading raw logs.
- Replaying old bytes through the tailer or changing canonical event identity/deduplication.

## Dependencies, assumptions, and risks

- Depends on the existing canonical parser, encrypted event store, projections, and tailer.
- The active `game.log` is the only bootstrap source; truncated, rotated, or incomplete logs can only produce partial state.
- Parser compatibility and per-projection freshness remain authoritative. Unknown and unsupported values must remain visible.
- Whole-file bootstrap cost follows current log size and must remain covered by existing parse performance limits.

## Acceptance criteria

1. Starting monitoring with no explicit bootstrap option performs a full-log bootstrap scan and starts tailing at the current file end.
2. The scan contains all supported canonical events retained in the approved log and current-state projections derived from them.
3. The renderer exposes a `Recover current state` action that refreshes projections without restarting the tailer.
4. Recovery metadata identifies `full_log_scan`, `last_confirmed`, the canonical event count, observation time, and the live-evidence limitation.
5. A later appended log record is processed normally and does not duplicate bootstrap events.
6. Unsupported, malformed, truncated, or empty evidence remains unknown/stale/unsupported according to the existing projection contracts.

## Definition of Done

- IPC, renderer, and documentation contracts are updated.
- Automated validation covers accepted/rejected bootstrap modes and startup default behavior.
- `npm test` passes.
- No real logs, account identifiers, paths, IP addresses, credentials, or game assets are committed.
- The diff is reviewed for privacy, performance, accessibility, and compatibility impact.

## Verification guidance

Happy path: start AstraDock while a sanitized fixture is already in PU, verify party/mission/location/vehicle projections and `last_confirmed` recovery metadata, append a new supported line, and verify one live incremental update.

Unhappy path: use an empty, truncated, rotated, malformed, unsupported-build, or marker-only fixture; verify no invented current state, no raw evidence crossing IPC, no duplicate canonical events, and a recoverable diagnostic outcome.

## Technology and libraries

None. The change uses the existing Electron IPC boundary, parser, canonical store, tailer, React renderer, and test tooling.
