# Issue 41: live instrument cluster

## Context and problem

Runtime Monitor already receives environment-scoped lifecycle and location projections, but the current-state rail must present those facts as stable, glanceable instruments. The instrument surface must remain honest when evidence is missing, stale, unsupported, disconnected, or transitioning, and selecting an instrument must lead to the same retained evidence used by the shared event detail surface.

## User story

As a player, I want stable glanceable instruments for my current shard, region, server connection, session time, validated zone context, and active critical warnings, so that I can understand my current runtime state without opening game debug screens.

## Intended outcome

The header continues to own shard/region, replication connection, PU duration, and application-duration slots. The rail owns jurisdiction, monitored-space, armistice, and critical-warning instruments. Each value has an explicit state, freshness/age where meaningful, provenance, and supporting event IDs.

## In scope

- Add the active critical-warning instrument with an integer count, active-state wording, age, alert-lifecycle provenance, and supporting event IDs.
- Preserve separate shard and replication-connection instruments; display server connection age as `MM:SS` or `HH:MM:SS` duration.
- Display validated monitored-space and armistice facts as `Yes`, `No`, or `Unknown`; unsupported profiles remain `Unsupported`.
- Carry supporting event IDs from projected facts into instrument selection and open the shared evidence detail when retained evidence is available.
- Add occurrence timestamps to alert state and expose alert age in the bounded attention surface.
- Cover known, unknown, unsupported, disconnected, stale, and no-evidence behavior with model tests.

## Explicit non-goals

- No new telemetry inference, endpoint geolocation, shard population, latency, FPS, exact location, ship/combat, mission, or destination claims.
- No outbound synchronization, OS notifications, or alerting on every physical log line.
- No visual redesign or styling prescription; the existing authoritative design tokens and semantic component contract remain the UI source of truth.

## Dependencies and blockers

- Issue #25 PU shard/server/session projections.
- Issue #27 normalized runtime event contracts and replay.
- Issue #29 shared current-state projection integration.
- Issue #36 alert lifecycle and bounded attention surface.
- Issue #37 shared immutable event detail.
- Issue #39 structured stream presentation and issue #42 source/health context.

## Assumptions, constraints, and risks

- The main process and projections remain authoritative; the renderer does not parse logs or infer state from silence.
- Event IDs are opaque and are used for selection. Retention may remove supporting evidence, so the existing tombstone/error behavior remains valid.
- Critical-warning count is derived from active critical alert state, not from physical line count. Unknown/unsupported source capability is never rendered as zero.
- Durations clamp invalid or future timestamps safely and use the central time contract.
- Raw endpoints and raw log lines remain detail-only and retain existing redaction behavior.

## User acceptance criteria

- Shard and server instruments remain separate and update from projection transitions without requiring a full-shell remount.
- Server age and PU duration use bounded `MM:SS`/`HH:MM:SS` formatting.
- Jurisdiction is labeled as current/last confirmed in its detail; monitored-space and armistice display only `Yes`, `No`, or `Unknown` when supported.
- Unsupported profiles display `Unsupported`; missing, stale, transitioning, disconnected, and unknown states remain textually distinct.
- The critical-warning instrument displays an integer active count, concise severity/age detail, and no false zero when warning evaluation is unsupported.
- Selecting an instrument uses its supporting event IDs and opens the shared evidence detail when the event is retained; missing evidence remains a safe detail/tombstone state.
- Alert cards expose occurrence age while preserving bounded visibility, deduplication, focus behavior, and critical versus warning announcement semantics.

## Happy-path verification

1. Replay sanitized join, replication connection, PU entry, jurisdiction, monitored-space, armistice, and source-health sequences.
2. Verify header and rail ownership, values, duration formats, freshness, provenance, and integer warning count.
3. Select shard, server, zone, and warning instruments and confirm the correct supporting event opens in shared detail.
4. Trigger a critical alert, verify one deduplicated warning instrument/card with occurrence age, then clear it and confirm the active count returns to zero.

## Unhappy-path verification

1. Start monitoring mid-session, omit terminal evidence, provide unknown region/zone values, and confirm `Unknown`/last-confirmed semantics rather than guessed values.
2. Exercise unsupported and unverified profiles, source loss, stale facts, malformed timestamps, future timestamps, retention removal, and rapid repeated updates.
3. Confirm unsupported warning evaluation is not shown as zero, disconnected server state does not borrow an older session, endpoint content remains detail-only, and critical/warning semantics do not rely on color.

## Definition of Done

- Model, renderer, and alert contracts implement the scoped behavior with focused automated tests.
- Typecheck, Node tests, renderer tests, and a production renderer build pass.
- Accessibility behavior remains keyboard reachable, textually labeled, focus-restoring, and compatible with reduced motion.
- Privacy, retention, performance, and compatibility implications are reviewed; no real logs or copyrighted game assets are added.
- This specification and the implementation PR document verification, known limitations, and follow-ups.

## Technology and libraries

None. The change uses the approved React/TypeScript renderer, existing projection contracts, and existing alert/detail components.

## Design deliverables for the UI/UX design agent

Define the final composition and responsive treatment for header and rail instrument groups, warning count prominence, unknown/unsupported/stale/disconnected states, focus/selected states, and compact-width behavior using the existing semantic labels and tokens. Do not change the data semantics or introduce unsupported telemetry.
