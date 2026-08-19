# Destination and Travel Evidence Matrix

## Status and Purpose

| Field | Value |
| --- | --- |
| Status | Issue #11 evidence spike result, revised by annotated LIVE 4.9.188 evidence |
| Decision issue | [#11](https://github.com/Presstronic/astradock-local/issues/11) |
| Applies to | MVP runtime log destination/travel profile decisions for `sc-4.9-live` |
| Fixture corpus | `test/fixtures/runtime-log/live/4.9-pub/sc-4.9-live/destination/` and `test/fixtures/runtime-log/live/4.9-pub/sc-4.9-live/negative/object-container-ship-navigation.non-event` |
| Fixture standard | [`runtime-log-fixture-corpus.md`](runtime-log-fixture-corpus.md) |
| Revised implementation | [#86](https://github.com/Presstronic/astradock-local/issues/86) |

This document records the current evidence boundary for current destination and travel state. Issue #11 established the conservative unsupported baseline. The annotated 2026-08-19 capture now provides a bounded local-player/vehicle correlation for quantum target selection and final arrival, while leaving other phases unsupported until minimized fixtures are accepted.

The result remains intentionally conservative. Uncorrelated object-container, nearby place-name, and ship-navigation records remain non-events. Promotion is possible only when a fixture-approved local control anchor and the same vehicle/route identity establish attribution within one PU session.

The original `DestinationSet` and `DestinationChanged` candidates remain historical issue #11 names. The revised evidence uses the narrower `QuantumTargetSelected` and `QuantumTargetChanged` vocabulary so a selected quantum target is not overstated as a general navigation destination.

## Evidence Sources

| Evidence | Repository artifact | Result |
| --- | --- | --- |
| Reviewed 4.9 LIVE private log analysis | [`game-log-pattern-analysis-2026-08-09.md`](game-log-pattern-analysis-2026-08-09.md#requested-telemetry-feasibility) | Records quantum status feasibility as low and requires annotated start/abort/complete samples. |
| PRD destination policy | [`product-requirements.md`](product-requirements.md#851-current-destination--provisional-mvp-target) | Requires direct repeatable local-player evidence before maintaining `DestinationSnapshot`. |
| Object-container and ship-navigation guard | `negative/object-container-ship-navigation.non-event` | Proves loaded containers, route-object traces, and ship entity mentions must not promote location, destination, travel, or ship ownership facts. |
| Nearby place-name guard | `destination/place-name-destination-noise.non-event` | Proves place-name, label cache, and resolver errors must not set or change the local player's destination. |
| Temporal-proximity route guard | `destination/temporal-proximity-route-noise.non-event` | Proves map-adjacent timing plus route subsystem activity is not enough to attribute travel to the local player. |
| Unavailable lifecycle annotation | `destination/destination-travel-transitions.unavailable` | Records missing set, change, clear, travel-start, arrival, cancellation, failure, and mid-route startup evidence. |
| Annotated 4.9.188 gameplay sequence | [`runtime-capture-findings-2026-08-19.md`](runtime-capture-findings-2026-08-19.md) | Correlates local RSI Meteor control with several quantum targets and two final-destination arrivals; manual interruption is owner annotation only. |

## Promotion Decisions

| Action or transition | Candidate event | Decision | Confidence | Evidence | Projection implication |
| --- | --- | --- | --- | --- | --- |
| Quantum target selected by local player | `QuantumTargetSelected` | Promote after sanitized fixture | High | Target-selection records are correlated to the locally controlled RSI Meteor and owner actions. | Set/update the observed quantum target; do not claim travel started. |
| Quantum target changed by local player | `QuantumTargetChanged` | Promote after sanitized fixture | High | Repeated local selections include a manual redirection from Area18 to Orison. | Replace target while preserving prior event history; cancellation reason remains unknown. |
| Destination cleared by local player | `DestinationCleared` | Defer | None | No controlled clear sequence proves an authoritative local clear. | Do not clear by absence of route records, notification removal, or unrelated session noise. |
| Travel started | `TravelStarted` | Defer | None | `[QuantumTravel]` records exist, but no capture proves local-player travel state or the enum/phase meaning. | Do not show active travel from route subsystem activity alone. |
| Final quantum destination reached | `QuantumTravelArrived` | Promote after sanitized fixture | High | Two direct final-destination arrival records correlate to the locally controlled vehicle sequence. | Mark final arrival and clear active target only according to the accepted fixture contract. |
| Travel cancelled | `TravelCancelled` | Defer | None | Manual interruption is owner-annotated but no distinct direct cancellation record was isolated. | Do not infer cancellation from a later target or missing continuation records. |
| Travel failed | `TravelFailed` | Defer | None | No failure or interdiction-like terminal sequence was captured. | Do not raise travel failure alerts from subsystem errors or timing gaps. |
| Confirmed empty destination state | `DestinationCurrentStateConfirmedEmpty` | Defer | None | No source proves an authoritative empty destination when monitoring starts or when no destination record is present. | Start as `unknown` or `unsupported`; never convert missing evidence into confirmed no-destination state. |
| Monitor starts mid-route | No event; projection bootstrap state | Defer | None | No mid-route startup capture with proven active destination/travel state exists. | Start destination/travel projection as `unknown`; do not reconstruct travel from nearby route records. |

`QuantumTargetSelected`/`QuantumTargetChanged` and `QuantumTravelArrived` are provisionally approved for registry promotion only after minimized sanitized fixtures and negative guards pass review. All other issue #11 decisions remain deferred.

## Identity, Payload, and Display Rules

Future destination or travel event promotion requires direct evidence for all fields needed to avoid misleading the player:

| Field | Meaning | Required treatment |
| --- | --- | --- |
| `destinationObservedId` | Raw destination identity as observed in the source. | Required when the source exposes a stable identifier; preserve unknown separately from empty string. |
| `destinationObservedName` | Raw source name or label when present. | Optional; must not be resolved from nearby place noise or object-container paths. |
| `destinationDisplayLabel` | User-facing label after safe resolution. | Optional; may be unavailable in MVP because installed asset name resolution is explicitly out of scope. |
| `travelPhase` | Target selected/changed, cleared, started, arrived, cancelled, failed, stale, or unknown. | Must come from semantic source evidence, not timing proximity or route-object presence. |
| `vehicleEntityId` | Vehicle participating in the quantum record. | Required for local attribution and sensitive by default; must correlate to an accepted local-control anchor. |
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
| `unsupported` | The current extraction profile has no promoted destination/travel events. | Unsupported build/profile or current profile revision before the new fixtures are accepted. | Compatible profile version with positive fixtures and promotion decisions. |
| `unknown` | The profile may support some destination/travel events, but current session evidence is insufficient to know destination or travel state. | App startup, monitoring starts mid-session, partial replay, missing terminal evidence, or ambiguous/redacted source sequence. | Direct supported destination/travel evidence, session boundary, or stale policy. |
| `destination_set` | Direct evidence proves a current quantum target for the locally correlated vehicle. | Supported target selection/change evidence. | Supported clear, final arrival, incompatible session/environment boundary, or explicit uncertainty policy. |
| `traveling` | Direct evidence proves the local player is traveling toward a destination. | Future supported travel-start evidence. | Future supported arrival, cancellation, failure, incompatible session/environment boundary, or stale policy. |
| `terminal` | Direct evidence proves a final travel outcome. | Future supported arrival, cancellation, or failure evidence. | Projection retention expiry or user/session boundary policy. |

An empty destination is a confirmed value only after a future supported source proves that no current destination exists. Missing captures, object-container streaming, route silence, application restart, or UI label disappearance must not produce a confirmed empty destination/travel state.

## UI Behavior Required Until Promotion

The Destination and Travel instrument must be honest about support level:

- Show `unsupported` for profiles where no destination/travel events are promoted; show a target/final-arrival state only for a profile revision with the accepted correlation fixtures.
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

Controlled gameplay captures are still required before enabling the remaining destination or travel event families:

- Sanitized fixture extraction for the now-observed target selection/change and final-arrival sequence.
- Destination cleared by the local player.
- Travel started toward a destination.
- Intermediate-stop, unmatched-target, and arrival-without-prior-monitoring behavior.
- Travel cancellation or abort.
- Travel failure or interruption.
- Monitor startup while a destination is already set.
- Monitor startup while travel is already active.
