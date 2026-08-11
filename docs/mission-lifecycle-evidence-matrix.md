# Mission Lifecycle Evidence Matrix

## Status and Purpose

| Field | Value |
| --- | --- |
| Status | Issue #10 evidence spike result |
| Decision issue | [#10](https://github.com/Presstronic/astradock-local/issues/10) |
| Applies to | MVP runtime log mission profile decisions for `sc-4.9-live` |
| Fixture corpus | `test/fixtures/runtime-log/live/4.9-pub/sc-4.9-live/mission/` and `test/fixtures/runtime-log/live/4.9-pub/sc-4.9-live/negative/mission-notification-ui-lifecycle.non-event` |
| Fixture standard | [`runtime-log-fixture-corpus.md`](runtime-log-fixture-corpus.md) |

This document records the current evidence boundary for mission alerts and mission state. It decides which mission lifecycle signals are safe for the MVP parser profile and which must remain unavailable until controlled gameplay captures prove them.

The result is intentionally conservative. The reviewed 4.9 LIVE/PUB evidence contains mission subsystem records, generic HUD notification lifecycle records, tutorial records, and mission-giver asset records, but it does not prove semantic mission transitions attributable to the local player. AstraDock Local must therefore show mission state as unsupported or unknown for the `sc-4.9-live` provisional profile rather than inventing mission offers, acceptance, objective progress, or terminal outcomes from MissionId-shaped noise.

## Evidence Sources

| Evidence | Repository artifact | Result |
| --- | --- | --- |
| Reviewed 4.9 LIVE private log analysis | [`game-log-pattern-analysis-2026-08-09.md`](game-log-pattern-analysis-2026-08-09.md#requested-telemetry-feasibility) | Records mission feasibility as low/partial and states generic `MissionId` notifications are not proof of mission progress. |
| PRD mission promotion policy | [`product-requirements.md`](product-requirements.md#84-mission-lifecycle-and-alerts--provisional-mvp-target) | Requires annotated action/outcome fixtures and negative tests before activation. |
| Generic mission notification guard | `negative/mission-notification-ui-lifecycle.non-event` | Proves `MissionId` on add/next/fade/remove HUD lifecycle records must not promote mission transitions. |
| Mission service startup guard | `mission/mission-service-startup.non-event` | Proves startup, hydration, and subscription records must not create a current mission set. |
| Mission-giver asset guard | `mission/mission-giver-asset-failure.non-event` | Proves asset loading or missing mission-giver data is not player-facing mission state. |
| Tutorial step guard | `mission/tutorial-step-lifecycle.non-event` | Proves tutorial task/progress records are not general mission lifecycle records. |
| Unavailable lifecycle annotation | `mission/mission-lifecycle-transitions.unavailable` | Records missing offered/shared, accepted, local-share, objective, terminal, and mid-session evidence. |

## Promotion Decisions

| Action or transition | Candidate event | Decision | Confidence | Evidence | Projection implication |
| --- | --- | --- | --- | --- | --- |
| Mission offered to local player | `MissionOffered` | Defer | None | No controlled offer/share capture proves a local-player-facing offer. | Keep mission section `unknown` or `unsupported`; do not show offer alerts. |
| Mission shared with local player | `MissionSharedWithPlayer` | Defer | None | No controlled party/local share receipt capture exists. | Do not infer shares from `MissionId`, party, or notification lifecycle records. |
| Mission accepted by local player | `MissionAccepted` | Defer | None | No accepted action sequence proves local-player attribution and mission identity. | Do not set a current mission from startup, UI notification, or tutorial records. |
| Mission shared by local player | `MissionSharedByLocalPlayer` | Defer | None | No local-share capture exists. | Do not present outgoing share status. |
| Objective added or changed | `MissionObjectiveChanged` | Defer | None | No objective lifecycle sequence proves a semantic mission objective change. | Do not alter objective lists from generic notification add/next/fade/remove records. |
| Objective completed | `MissionObjectiveCompleted` | Defer | None | No objective completion outcome was captured. | Do not advance progress from notification echoes or tutorial steps. |
| Objective failed | `MissionObjectiveFailed` | Defer | None | No objective failure outcome was captured. | Do not mark objectives failed from subsystem errors. |
| Mission completed | `MissionCompleted` | Defer | None | No terminal completion sequence, reward, or authoritative outcome was captured. | Do not show completion alerts or clear current state as completed. |
| Mission failed | `MissionFailed` | Defer | None | No terminal mission failure sequence was captured. | Do not show failure alerts from errors, timeouts, or asset failures. |
| Mission abandoned | `MissionAbandoned` | Defer | None | No local abandonment action was captured. | Do not clear current mission state by absence of later records. |
| Mission withdrawn | `MissionWithdrawn` | Defer | None | No withdrawal sequence was captured. | Do not infer withdrawn from notification removal or missing mission giver data. |
| Mission expired | `MissionExpired` | Defer | None | No expiry sequence was captured. | Do not infer expiry from stale notification lifecycle or elapsed wall-clock time alone. |
| Confirmed empty current mission set | `MissionCurrentSetConfirmedEmpty` | Defer | None | No source proves an authoritative empty active mission set. | Do not convert startup, missing captures, or mid-session replay into a confirmed zero-mission state. |
| Monitor starts mid-mission | No event; projection bootstrap state | Defer | None | No mid-session startup capture with proven active mission state exists. | Start mission projection as `unknown`; never convert missing evidence into an empty confirmed mission set. |

No issue #10 candidate mission event is promoted for the current `sc-4.9-live` provisional profile.

## Payload, Attribution, and Correlation Rules

Future mission event promotion requires direct evidence for all fields needed to avoid misleading the player:

| Field | Meaning | Required treatment |
| --- | --- | --- |
| `missionInstanceId` | Stable mission instance or contract identity as observed in the source. | Required for lifecycle correlation when present; sanitize or hash in repository fixtures and any upload boundary. |
| `missionTitle` | Player-facing mission label when available. | Optional; must preserve unknown separately from empty string. |
| `actionActor` | Local player, another player, party, game system, or unknown. | Local-player attribution must be proven before changing local current mission state. |
| `objectiveId` | Objective identity or stable label for objective transitions. | Required for objective-specific completion/failure; objective-free terminal mission events must not fabricate it. |
| `outcome` | Offered, shared, accepted, changed, completed, failed, abandoned, withdrawn, expired, or unknown. | Must come from semantic source evidence, not notification lifecycle state. |
| `sourceTimestamp` | Timestamp attached to the source line or assembled record. | Required for ordering and freshness. |
| `environmentKey` | Release channel, build/profile, and session partition. | Required; mission correlations must never cross LIVE/PTU/EPTU or build/profile boundaries. |
| `confidence` | Strength of evidence. | `confirmed` or `high` only after positive action/outcome fixtures; current profile remains unsupported. |
| `evidenceRef` | Pointer to retained local evidence or fixture marker. | Required for diagnosis; raw sensitive evidence remains local by default. |

Correlation must partition by environment, build/profile, session, mission instance, objective identity, and action family. Dedupe must collapse add/next/fade/remove notification echoes and duplicate physical records into one semantic event only after a semantic event family has been proven by positive fixtures. Temporal proximity to a `MissionId`, notification text, mission service startup, asset failure, or tutorial record is insufficient by itself.

## State Semantics

Mission projection state uses explicit unsupported and uncertainty states until stronger lifecycle evidence exists:

| State | Meaning | Entry evidence | Clear or transition evidence |
| --- | --- | --- | --- |
| `unsupported` | The current extraction profile has no promoted mission lifecycle events. | `sc-4.9-live` issue #10 decision or any unsupported build/profile. | Future profile version with positive mission fixtures and promotion decisions. |
| `unknown` | The profile may support some mission events, but current session evidence is insufficient to know active mission state. | App startup, monitoring starts mid-session, partial replay, missing terminal evidence, or redacted/ambiguous source sequence. | Direct supported mission evidence, session boundary, or stale policy. |
| `active` | Direct evidence proves one mission is current for the local player. | Future supported local acceptance/share evidence. | Future supported completion, failure, abandon, withdrawal, expiry, session-boundary, or stale policy. |
| `terminal` | Direct evidence proves a final mission outcome. | Future supported completion, failure, abandon, withdrawal, or expiry evidence. | Projection retention expiry or user/session boundary policy. |

An empty mission list is a confirmed value only after a future supported source proves that no current mission exists. Missing captures, notification removal, startup hydration, elapsed time, or application restart must not produce an empty confirmed mission set.

## UI Behavior Required Until Promotion

The Mission section must be honest about support level:

- Show `unsupported` for profiles where no mission events are promoted.
- Show `unknown` for partial sessions, unsupported builds, or missing evidence; do not display a zero-count mission state as confirmed.
- Display any diagnostic mission-related noise only in a local evidence or diagnostics drilldown with provenance and confidence, not as mission alerts.
- Label event freshness with source timestamp and ingestion timestamp once mission events exist.
- Redact mission identifiers, player handles, account identifiers, endpoints, local paths, and raw lines in any user-shareable export.
- Keep controls available for future capture/export only after the user can inspect and approve what data leaves the machine.

## Privacy Review

Mission evidence can expose play intent, party coordination, mission giver, location, objective progress, timestamps, handles, account identifiers, and sensitive tactical activity. Repository fixtures use only synthetic placeholders. Product behavior must keep raw log lines and stable mission/player identifiers local by default. Any future Station synchronization for mission state requires explicit purpose, consent, minimization, retention, deletion, authentication, and idempotency rules before implementation.

The current fixtures intentionally avoid real handles, account IDs, player IDs, mission IDs, notification IDs, session IDs, endpoints, local paths, service URLs, tokens, and full logs. `npm test` runs the fixture privacy scanner against manifests and snippets.

## Technology and Libraries

None. Issue #10 is an evidence, fixture, documentation, and validation change using existing repository conventions and Node.js built-in tests.

## Verification Guidance

Happy-path checks:

1. For each future controlled mission action, record the player action time, actor, mission, objective when applicable, expected outcome, release channel, build/profile, and session.
2. Align the minimal sanitized log sequence to the action and verify direct semantic evidence for local-player attribution and outcome.
3. Replay the positive fixture with neighboring negative fixtures and emit only the promoted mission event family.
4. Reconstruct only the mission state proven by the sequence and preserve unknown fields instead of inventing defaults.

Unhappy-path checks:

1. Replay `mission-service-startup.non-event`, `mission-giver-asset-failure.non-event`, `tutorial-step-lifecycle.non-event`, and `negative/mission-notification-ui-lifecycle.non-event`.
2. Confirm none emit mission offered, shared, accepted, objective, completed, failed, abandoned, withdrawn, expired, or empty confirmed mission-set events.
3. Interleave identical synthetic mission identifiers across LIVE/PTU/EPTU partitions and confirm correlations do not cross environment keys.
4. Start monitoring mid-session and confirm mission projection starts as `unknown` or `unsupported`, not an empty confirmed set.
5. Run the privacy scanner and reject real mission IDs, handles, identifiers, paths, IP addresses, credentials, service URLs, and full-log excerpts.

## Remaining Evidence Gaps

Controlled gameplay captures are still required before enabling any mission event family:

- Mission offered to the local player.
- Mission shared with the local player.
- Mission accepted by the local player.
- Mission shared by the local player.
- Objective added or changed.
- Objective completed.
- Objective failed.
- Mission completed.
- Mission failed.
- Mission abandoned.
- Mission withdrawn.
- Mission expired.
- Monitor startup while a mission is already active.
