# Party Lifecycle Evidence Matrix

## Status and Purpose

| Field | Value |
| --- | --- |
| Status | Issue #9 evidence spike result |
| Decision issue | [#9](https://github.com/Presstronic/astradock-local/issues/9) |
| Applies to | MVP runtime log party profile decisions for `sc-4.9-live` |
| Fixture corpus | `test/fixtures/runtime-log/live/4.9-pub/sc-4.9-live/party/` |
| Fixture standard | [`runtime-log-fixture-corpus.md`](runtime-log-fixture-corpus.md) |

This document records the current evidence boundary for live party status. It decides which party lifecycle signals are safe for the MVP parser profile and which must remain unavailable until controlled gameplay captures prove them.

The result is intentionally conservative. AstraDock Local may show supported party facts from direct evidence, but it must not invent party membership, terminal state, or leadership from marker counts, duplicate UI notification lifecycle records, or monitoring that begins mid-party.

## Evidence Sources

| Evidence | Repository artifact | Result |
| --- | --- | --- |
| Reviewed 4.9 LIVE private log analysis | [`game-log-pattern-analysis-2026-08-09.md`](game-log-pattern-analysis-2026-08-09.md#settled-requirement-live-party-status) | Supports creation, launch, a named member connection, and explicit local leave. |
| Positive party fixture | `party/party-create-launch-member-connected.observed` | Provides deterministic positive coverage for `PartyCreated`, `PartyLaunchInitiated`, and `PartyMemberConnected`. |
| Explicit leave fixture | `party/party-explicit-leave.observed` | Provides direct local voluntary-leave evidence while proving marker removal alone is not terminal evidence. |
| Marker-only negative fixture | `party/party-marker-only-membership.non-event` | Proves marker stream activity must not create, remove, or count named party members. |
| Unavailable lifecycle annotation | `party/party-lifecycle-transitions.unavailable` | Records missing invite, accept/join, disconnect, reconnect, other-member leave, kick/removal, leader change, disband, and mid-party startup evidence. |
| Duplicate notification lifecycle fixture | `framing/duplicate-notification-lifecycle.framing` | Proves notification add/next/fade/remove echoes and duplicate add records must dedupe to one semantic event family. |

## Promotion Decisions

| Action or transition | Candidate event | Decision | Confidence | Evidence | Projection implication |
| --- | --- | --- | --- | --- | --- |
| Local party creation | `PartyCreated` | Promote for `sc-4.9-live` provisional profile | Medium | Direct sanitized party service line with synthetic party ID and leader handle | Set party state to `in_party` when the leader is the local player or local attribution is otherwise proven. |
| Party launch | `PartyLaunchInitiated` | Promote for `sc-4.9-live` provisional profile | Medium | Direct party notification message | Add recent launch activity; do not change roster membership. |
| Named member connection | `PartyMemberConnected` | Promote for `sc-4.9-live` provisional profile | Medium | Direct party notification naming one member handle | Mark that member connection state as `connected`; do not treat as proof of join time or permanent membership without supporting lifecycle evidence. |
| Party invite | No settled canonical event | Defer | None | Not captured in the reviewed build | Keep unknown and do not show invite alerts. |
| Invite accepted or local joins existing party | `PartyJoined`, `PartyMemberJoined` | Defer | None | Not captured in the reviewed build | Do not transition from `unknown` to `in_party` unless a supported creation/join line is observed. |
| Other member joins | `PartyMemberJoined` | Defer | None | Not captured in the reviewed build | Do not add a member from marker count or notification lifecycle echoes. |
| Other member disconnects | `PartyMemberDisconnected` | Defer | None | Not captured in the reviewed build | Existing confirmed members may become stale only by bounded policy, not by marker removal alone. |
| Member reconnects | No settled canonical event beyond connection update | Defer | None | Not captured in the reviewed build | A repeated connection notification may refresh connection evidence only after dedupe rules are implemented. |
| Local voluntary leave | `PartyLeft` | Promote for `sc-4.9-live` provisional profile | High | Direct `<Leave group>` record names the local player GEID and party ID | Set local party state to `not_in_party` and clear the active party/roster; marker removal by itself remains non-terminal. |
| Other member voluntary leave | `PartyMemberLeft` | Defer | None | Not captured in the reviewed build | Do not remove a member from marker-only evidence. |
| Removal or kick | `PartyMemberRemoved` | Defer | None | Not captured in the reviewed build | Do not infer removal from disconnect, marker loss, or duplicate UI lifecycle records. |
| Leader change | `PartyLeaderChanged` | Defer | None | Not captured in the reviewed build | Preserve known leader until direct evidence, session boundary, or stale policy clears it. |
| Party disband | `PartyDisbanded` | Defer | None | Not captured in the reviewed build | Do not declare `not_in_party` from missing terminal lines. |
| Marker appears | `PartyMarkerObserved` | Defer as user-facing party state; allow only as future diagnostic evidence | Low | Marker IDs and tracked entities appear without a handle bridge | May corroborate party activity in local drilldown, but must not add named members or size. |
| Marker disappears | `PartyMarkerRemoved` | Defer as user-facing party state; allow only as future diagnostic evidence | Low | Marker stream teardown is not tied to membership lifecycle | Must not remove members or disband the party. |
| Monitor starts mid-party | No event; projection bootstrap state | Defer | None | Not captured in the reviewed build | Start as `unknown`; do not reconstruct a roster from marker-only state. |

## State Semantics

Party projection state uses three top-level values until stronger lifecycle evidence exists:

| State | Meaning | Entry evidence | Clear or transition evidence |
| --- | --- | --- | --- |
| `unknown` | Monitor does not have enough current-session evidence to know whether the local player is in a party. | App startup, monitor startup mid-file, session replay without supported party start evidence, or unsupported build/profile. | Direct supported `PartyCreated` or future supported join evidence. |
| `in_party` | Direct evidence supports that the local player is currently in a party or recently created one. | Supported `PartyCreated`; future supported join evidence. | Future supported leave/disband evidence, session boundary, or stale policy expiration. |
| `not_in_party` | Direct evidence supports no current party. | Supported local `PartyLeft` evidence. | Supported creation or join evidence. |

Per-member state is separate:

| Field | Meaning | Current support |
| --- | --- | --- |
| `membershipState` | Whether the player is a confirmed member, possible member, not a member, stale, or unknown. | `unknown` or `possible` only for named connection evidence until join/leave evidence exists. |
| `connectionState` | Whether the member is connected, disconnected, stale, or unknown. | `connected` is supported for named connection notifications. Disconnect and reconnect remain unsupported. |
| `leaderState` | Current leader and confidence. | Supported only when direct creation evidence names the leader. Leader change remains unsupported. |

## Attribution Rules

- Local-player attribution must be proven by the current session identity chain before a party event changes local party state.
- Other-player handles from party notifications are sensitive social telemetry and remain local by default.
- Marker IDs, tracked entities, player GEIDs, node IDs, and handles are distinct identifiers. Do not merge them without direct evidence.
- Temporal proximity between a marker and a handle-bearing notification is not enough to identify the marker's player.
- Duplicate notification lifecycle records must dedupe by notification/message/family within a bounded window. They must not produce repeated joins, repeated connects, or roster churn.

## Stale and Boundary Rules

- Missing terminal evidence is not terminal evidence. Absence of a supported leave, disband, or disconnect line must not clear party state immediately.
- Runtime projection may mark party and member facts `stale` after a bounded no-refresh interval once the extraction profile defines that interval.
- A PU disconnect, frontend return, game process exit, log rotation, or environment/profile change may clear or partition current party state only through explicit session-boundary rules.
- Replay must preserve the original parser/profile version, confidence, timestamps, and evidence references.

## Privacy Review

Party evidence contains other-player handles and social relationships. Repository fixtures use only synthetic placeholders. Product behavior must keep raw log lines, handles, stable identifiers, and marker mappings local by default. Any future Station synchronization for party state requires an explicit purpose, consent, minimization, retention, and deletion policy before implementation.

The current fixtures intentionally avoid real handles, account IDs, player IDs, node IDs, session IDs, endpoints, local paths, hardware identifiers, service URLs, tokens, and full logs. `npm test` runs the fixture privacy scanner against manifests and snippets.

## Technology and Libraries

None. Issue #9 is an evidence, fixture, documentation, and validation change using existing repository conventions and Node.js built-in tests.

## Verification Guidance

Happy-path checks:

1. Replay `party-create-launch-member-connected.observed` and emit only `PartyCreated`, `PartyLaunchInitiated`, and `PartyMemberConnected`.
2. Confirm the projected party is `in_party` only when local attribution is supported.
3. Confirm the named member's connection evidence is retained without inventing join time or stable marker identity.
4. Replay `party-explicit-leave.observed`, emit one `PartyLeft`, and project `not_in_party` only from the direct leave record.

Unhappy-path checks:

1. Replay `party-marker-only-membership.non-event` and assert no member join, leave, removal, disband, or roster-size event is emitted.
2. Replay duplicate notification lifecycle records and assert one semantic event per notification family rather than one event per physical UI lifecycle line.
3. Start monitoring after existing marker records and assert the party state remains `unknown`.
4. Replay missing-terminal and session-boundary sequences and assert facts become stale or partitioned instead of silently remaining current forever.
5. Run the privacy scanner and reject real handles, identifiers, paths, IP addresses, credentials, service URLs, and full-log excerpts.

## Remaining Evidence Gaps

Controlled gameplay captures are still required before enabling the deferred event families:

- Invite.
- Accept or local join.
- Other member join.
- Other member disconnect and reconnect.
- Other member voluntary leave.
- Removal or kick.
- Leader change.
- Disband.
- Monitor startup while already in a party.
