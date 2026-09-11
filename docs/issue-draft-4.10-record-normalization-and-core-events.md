# Issue draft: normalize 4.10 records and restore core runtime events

## Target phase

MVP — release-blocking telemetry recovery.

## Context and problem statement

4.10 emits records in a newer form such as `[Notice] <EventName>` with `key=value`, quoted values, and multiline HUD notifications. The current parser expects several 4.9 anchors and emits zero canonical events when the profile is unsupported. Its fallback exposes only one shard, one session, and one server-join action from the captured log.

## Technical story

As the telemetry pipeline, I need a versioned 4.10 record-normalization layer and core extractors, so that downstream projections consume stable events even when raw log syntax changes.

## Intended outcome

4.10 raw lines are assembled into bounded records, normalized into stable fields, and promoted into the proven core event families: build/environment, identity, PU join, connection, disconnect, frontend, and application lifecycle.

## In scope

- Extend line/record assembly for quoted values, bracket fields, and multiline notifications.
- Add 4.10 field aliases and event anchors behind the 4.10 profile.
- Restore normalized events for build/environment, identity, PU join, connection, disconnect, frontend, and application lifecycle where evidence exists.
- Preserve raw context, source timestamp, ingestion timestamp, line offsets, profile version, and confidence.
- Keep unknown records bounded and diagnostically inspectable.

## Explicit non-goals

- Inferring semantics from arbitrary unmatched lines.
- Uploading raw logs or changing Station contracts.
- Implementing party, mission, vehicle, quantum, or zone semantics covered by separate tickets.

## Dependencies and blockers

- 4.10 profile selection ticket.
- Sanitized representative LIVE records, including startup, join, disconnect, and shutdown.

## Assumptions, constraints, and risks

- A record may span physical lines; incomplete records must be retained until complete or safely flushed.
- Values may contain spaces, punctuation, quotes, or empty strings.
- Unknown event capture must not cause unbounded memory growth or renderer flooding.

## User acceptance criteria

- The captured 4.10 log produces canonical core events rather than only fallback shard/session rows.
- PU join preserves endpoint, port, shard, and location ID from the 4.10 `<Join PU>` record.
- Connection and disconnect events retain cause, reason, session, endpoint, and timestamps when present.
- Multiline notifications remain intact as one evidence record and do not corrupt following records.
- Unknown records remain visibly diagnostic and do not fabricate values.

## Definition of Done

- Normalization and extractor contracts are documented.
- Sanitized fixtures cover complete, partial, malformed, quoted, and multiline records.
- Tests cover field extraction, event completeness, offsets, replay, bounded buffering, and privacy redaction.
- Benchmarks remain within the existing parser objectives.
- `npm test` and parser benchmark pass.

## Verification guidance

Happy path:

1. Replay the 4.10 startup-to-in-game capture.
2. Verify build/environment, identity, PU join, channel, and lifecycle events with provenance.
3. Verify the same fixture emits the same event IDs and payloads on replay.

Unhappy path:

1. Split a notification across chunks and verify delayed assembly then correct emission.
2. Remove required fields and verify an explicit incomplete/unknown diagnostic.
3. Inject malformed quotes, duplicate notifications, truncation, and an interrupted tail and verify recovery without fabricated events.

## Technical elaboration

Keep record framing separate from semantic extraction. Normalize bracket fields, quoted key/value fields, legacy fields, and multiline continuation lines into a common record representation. Extractors should declare required fields and evidence markers; missing-field failures should suppress only the affected event family. The main process remains authoritative, and renderer state must not participate in parsing.

## Technology and libraries

None expected. Use the existing Node.js parser engine, tailer, fixture corpus, and test tools.
