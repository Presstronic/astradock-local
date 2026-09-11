# Issue draft: restore 4.10 mission, zone, vehicle, and quantum telemetry

## Target phase

Phase 1 — restore the remaining 4.9-visible gameplay coverage after MVP core recovery.

## Context and problem statement

The screenshot marks mission, destination/travel, jurisdiction, hanger vehicle, and related instruments as unsupported or unknown. Raw 4.10 evidence still contains HUD notifications, jurisdiction changes, vehicle-control records, and quantum-target records, but no canonical events are emitted while the 4.10 profile is rejected and the vocabulary is not fully mapped.

## User story

As a player, I want the monitor to recover location, mission, vehicle, and travel activity from 4.10 logs, so that the live dashboard reflects more than server connectivity.

## Intended outcome

Each proven event family resumes independently with family-level compatibility and graceful degradation when 4.10 evidence is incomplete.

## In scope

- Capture and classify 4.10 mission/HUD notification, jurisdiction/zone, vehicle lifecycle, quantum target/travel, and destination evidence.
- Map new field shapes and event names to existing versioned contracts.
- Preserve unknown and unsupported family states independently.
- Update projections and monitor instruments with freshness, provenance, and confidence.

## Explicit non-goals

- Inferring a destination solely from a generic notification.
- Treating all physics, cargo, inventory, or graphics notices as product telemetry.
- Expanding product scope beyond event families already supported or explicitly specified for 4.9.

## Dependencies and blockers

- 4.10 profile and normalization work.
- Annotated captures for each gameplay action and negative cases.
- Design review for any changed instrument semantics.

## Assumptions, constraints, and risks

- Generic HUD messages can be duplicated or localized.
- Vehicle and quantum records may be state transitions rather than complete lifecycle events.
- Family-level drift must not suppress unaffected core or party events.

## User acceptance criteria

- Proven 4.10 vehicle, quantum, zone, and mission sequences appear in the corresponding instruments with correct ordering and timestamps.
- Destination/travel remains unknown when only target or notification evidence is present.
- Each family can be supported, degraded, unsupported, or unknown independently.
- Stale, interrupted, malformed, and disconnected sequences do not leave a false active state.

## Definition of Done

- Evidence matrices and event contracts are updated for 4.10.
- Positive and negative sanitized fixtures exist for each family.
- Automated tests cover transitions, deduplication, incomplete records, family isolation, and replay.
- UI state and accessibility behavior are verified.
- Parser and renderer benchmarks remain within objectives.

## Verification guidance

Happy path:

1. Replay annotated vehicle retrieval/control/release, quantum target/arrival, jurisdiction entry/exit, and mission notification captures.
2. Verify each projection and instrument receives only evidence-supported states.

Unhappy path:

1. Truncate each sequence at every transition and verify recovering/unknown rather than completion.
2. Duplicate or reorder notifications and verify deterministic deduplication.
3. Mix unrelated graphics, cargo, and inventory records and verify they do not become gameplay events.

## UI information architecture and behavior

Each instrument must show the event/state label, value meaning and units, freshness, source/provenance, confidence, and exact timestamp in detail. It must define loading, empty, unknown, stale, transitioning, disconnected, unsupported, degraded, success, and error states. Values must not use fabricated precision. Controls and details must remain keyboard accessible; visual styling belongs to the design agent.

## Technology and libraries

None expected. Use the existing event contracts, projections, fixtures, and test infrastructure.
