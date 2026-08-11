# Destination and Travel Evidence Matrix

## Status and Purpose

| Field | Value |
| --- | --- |
| Status | Issue #11 evidence spike result |
| Decision issue | [#11](https://github.com/Presstronic/astradock-local/issues/11) |
| Applies to | MVP runtime log destination/travel profile decisions for `sc-4.9-live` |
| Fixture corpus | `test/fixtures/runtime-log/live/4.9-pub/sc-4.9-live/destination/` and `test/fixtures/runtime-log/live/4.9-pub/sc-4.9-live/negative/object-container-ship-navigation.non-event` |
| Fixture standard | [`runtime-log-fixture-corpus.md`](runtime-log-fixture-corpus.md) |

This document records the current evidence boundary for current destination and travel state. It decides which destination and travel signals are safe for the MVP parser profile and which must remain unavailable until controlled gameplay captures prove them.

The result is intentionally conservative. The reviewed 4.9 LIVE/PUB evidence contains object-container activity, nearby place-name noise, and quantum route records from unproven entities, but it does not prove that setting, changing, clearing, starting travel to, arriving at, cancelling, or failing travel for the local player's destination emits authoritative records. AstraDock Local must therefore show destination/travel state as unsupported or unknown for the `sc-4.9-live` provisional profile rather than infer intent from world streaming or route subsystem activity.

## Evidence Sources

| Evidence | Repository artifact | Result |
| --- | --- | --- |
| Reviewed 4.9 LIVE private log analysis | [`game-log-pattern-analysis-2026-08-09.md`](game-log-pattern-analysis-2026-08-09.md#requested-telemetry-feasibility) | Records quantum status feasibility as low and requires annotated start/abort/complete samples. |
| PRD destination policy | [`product-requirements.md`](product-requirements.md#851-current-destination--provisional-mvp-target) | Requires direct repeatable local-player evidence before maintaining `DestinationSnapshot`. |
| Object-container and ship-navigation guard | `negative/object-container-ship-navigation.non-event` | Proves loaded containers, route-object traces, and ship entity mentions must not promote location, destination, travel, or ship ownership facts. |
| Nearby place-name guard | `destination/place-name-destination-noise.non-event` | Proves place-name, label cache, and resolver errors must not set or change the local player's destination. |
| Temporal-proximity route guard | `destination/temporal-proximity-route-noise.non-event` | Proves map-adjacent timing plus route subsystem activity is not enough to attribute travel to the local player. |
| Unavailable lifecycle annotation | `destination/destination-travel-transitions.unavailable` | Records missing set, change, clear, travel-start, arrival, cancellation, failure, and mid-route startup evidence. |

## Promotion Decisions

| Action or transition | Candidate event | Decision | Confidence | Evidence | Projection implication |
| --- | --- | --- | --- | --- | --- |
| Destination set by local player | `DestinationSet` | Defer | None | No controlled map destination-set capture proves local-player attribution and destination identity. | Keep destination state `unknown` or `unsupported`; do not create a destination from place names or route objects. |
| Destination changed by local player | `DestinationChanged` | Defer | None | No controlled change sequence proves previous and next destination identity. | Do not mutate the current destination from repeated route or label records. |
| Destination cleared by local player | `DestinationCleared` | Defer | None | No controlled clear sequence proves an authoritative local clear. | Do not clear by absence of route records, notification removal, or unrelated session noise. |
| Travel started | `TravelStarted` | Defer | None | `[QuantumTravel]` records exist, but no capture proves local-player travel state or the enum/phase meaning. | Do not show active travel from route subsystem activity alone. |
| Arrival at destination | `TravelArrived` | Defer | None | No arrival sequence proves destination identity, local-player attribution, or terminal travel state. | Do not mark arrival from object-container streaming or nearby place names. |
| Travel cancelled | `TravelCancelled` | Defer | None | No cancellation or abort sequence was captured. | Do not clear or downgrade state from missing continuation records. |
| Travel failed | `TravelFailed` | Defer | None | No failure or interdiction-like terminal sequence was captured. | Do not raise travel failure alerts from subsystem errors or timing gaps. |
| Confirmed empty destination state | `DestinationCurrentStateConfirmedEmpty` | Defer | None | No source proves an authoritative empty destination when monitoring starts or when no destination record is present. | Start as `unknown` or `unsupported`; never convert missing evidence into confirmed no-destination state. |
| Monitor starts mid-route | No event; projection bootstrap state | Defer | None | No mid-route startup capture with proven active destination/travel state exists. | Start destination/travel projection as `unknown`; do not reconstruct travel from nearby route records. |

No issue #11 candidate destination or travel event is promoted for the current `sc-4.9-live` provisional profile.

## Identity, Payload, and Display Rules

Future destination or travel event promotion requires direct evidence for all fields needed to avoid misleading the player:

| Field | Meaning | Required treatment |
| --- | --- | --- |
| `destinationObservedId` | Raw destination identity as observed in the source. | Required when the source exposes a stable identifier; preserve unknown separately from empty string. |
| `destinationObservedName` | Raw source name or label when present. | Optional; must not be resolved from nearby place noise or object-container paths. |
| `destinationDisplayLabel` | User-facing label after safe resolution. | Optional; may be unavailable in MVP because installed asset name resolution is explicitly out of scope. |
| `travelPhase` | Set, changed, cleared, started, arrived, cancelled, failed, stale, or unknown. | Must come from semantic source evidence, not timing proximity or route-object presence. |
| `actionActor` | Local player, another player/entity, game system, or unknown. | Local-player attribution must be proven before changing current destination/travel state. |
| `sourceTimestamp` | Timestamp attached to the source line or assembled record. | Required for ordering and freshness. |
| `environmentKey` | Release channel, build/profile, and session partition. | Required; destination/travel correlations must never cross LIVE/PTU/EPTU or build/profile boundaries. |
| `confidence` | Strength of evidence. | `confirmed` or `high` only after positive action/outcome fixtures; current profile remains unsupported. |
| `evidenceRef` | Pointer to retained local evidence or fixture marker. | Required for diagnosis; raw sensitive evidence remains local by default. |

Correlation must partition by environment, build/profile, session, local identity, destination identity when available, source route object, and travel phase. Object-container paths, arbitrary place names, unproven ship entity IDs, route objects owned by unknown entities, and temporal proximity to map interaction are insufficient by themselves. Dedupe may collapse repeated route/label records only after a semantic destination or travel family has been proven by positive fixtures.

## State Semantics

Destination/travel projection state uses explicit unsupported and uncertainty states until stronger lifecycle evidence exists:

| State | Meaning | Entry evidence | Clear or transition evidence |
| --- | --- | --- | --- |
| `unsupported` | The current extraction profile has no promoted destination/travel events. | `sc-4.9-live` issue #11 decision or any unsupported build/profile. | Future profile version with positive destination/travel fixtures and promotion decisions. |
| `unknown` | The profile may support some destination/travel events, but current session evidence is insufficient to know destination or travel state. | App startup, monitoring starts mid-session, partial replay, missing terminal evidence, or ambiguous/redacted source sequence. | Direct supported destination/travel evidence, session boundary, or stale policy. |
| `destination_set` | Direct evidence proves a current destination for the local player. | Future supported set or change evidence. | Future supported clear, arrival, cancellation, failure, incompatible session/environment boundary, or stale policy. |
| `traveling` | Direct evidence proves the local player is traveling toward a destination. | Future supported travel-start evidence. | Future supported arrival, cancellation, failure, incompatible session/environment boundary, or stale policy. |
| `terminal` | Direct evidence proves a final travel outcome. | Future supported arrival, cancellation, or failure evidence. | Projection retention expiry or user/session boundary policy. |

An empty destination is a confirmed value only after a future supported source proves that no current destination exists. Missing captures, object-container streaming, route silence, application restart, or UI label disappearance must not produce a confirmed empty destination/travel state.

## UI Behavior Required Until Promotion

The Destination and Travel instrument must be honest about support level:

- Show `unsupported` for profiles where no destination/travel events are promoted.
- Show `unknown` for partial sessions, unsupported builds, or missing evidence; do not display a confirmed no-destination value unless a future source proves it.
- Display route, place-name, and object-container noise only in a local evidence or diagnostics drilldown with provenance and confidence, not as destination/travel alerts.
- Preserve observed raw identifiers in diagnostic detail when safe, but do not invent friendly labels from installed assets or string fragments in MVP.
- Label event freshness with source timestamp and ingestion timestamp once destination/travel events exist.
- Redact destination identifiers, player handles, account identifiers, endpoints, local paths, and raw lines in any user-shareable export.
- Keep controls available for future capture/export only after the user can inspect and approve what data leaves the machine.

## Privacy Review

Destination and travel evidence can expose play location, route intent, party coordination, tactical activity, timestamps, handles, account identifiers, ship/entity identifiers, endpoints, and local machine paths. Repository fixtures use only synthetic placeholders. Product behavior must keep raw log lines and stable destination/player/entity identifiers local by default. Any future Station synchronization for destination or travel state requires explicit purpose, consent, minimization, retention, deletion, authentication, and idempotency rules before implementation.

The current fixtures intentionally avoid real handles, account IDs, player IDs, ship IDs, route IDs, session IDs, endpoints, local paths, service URLs, tokens, and full logs. `npm test` runs the fixture privacy scanner against manifests and snippets.

## Technology and Libraries

None. Issue #11 is an evidence, fixture, documentation, and validation change using existing repository conventions and Node.js built-in tests.

## Verification Guidance

Happy-path checks for future controlled captures:

1. Set, change, and clear known destinations while recording player action time, actor, expected destination, release channel, build/profile, and session.
2. Perform supported travel start, arrival, cancellation, and failure cases while recording expected outcome and destination identity.
3. Align the minimal sanitized log sequence to the action and verify direct semantic evidence for local-player attribution, travel phase, and destination identity.
4. Replay the positive fixture with neighboring negative fixtures and emit only the promoted destination/travel event family.
5. Reconstruct only the destination/travel state proven by the sequence and preserve unknown fields instead of inventing defaults.

Unhappy-path checks:

1. Replay `negative/object-container-ship-navigation.non-event`, `destination/place-name-destination-noise.non-event`, and `destination/temporal-proximity-route-noise.non-event`.
2. Confirm none emit destination set, changed, cleared, travel started, arrival, cancellation, failure, or confirmed-empty destination events.
3. Interleave identical synthetic destination or route identifiers across LIVE/PTU/EPTU partitions and confirm correlations do not cross environment keys.
4. Start monitoring mid-session or mid-route and confirm destination/travel projection starts as `unknown` or `unsupported`, not an empty confirmed destination.
5. Run the privacy scanner and reject real destination IDs, handles, identifiers, paths, IP addresses, credentials, service URLs, and full-log excerpts.

## Remaining Evidence Gaps

Controlled gameplay captures are still required before enabling any destination or travel event family:

- Destination set by the local player.
- Destination changed by the local player.
- Destination cleared by the local player.
- Travel started toward a destination.
- Arrival at the destination.
- Travel cancellation or abort.
- Travel failure or interruption.
- Monitor startup while a destination is already set.
- Monitor startup while travel is already active.
