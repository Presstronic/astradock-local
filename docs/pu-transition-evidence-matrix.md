# PU Server and Shard Transition Evidence Matrix

## Status and purpose

| Field | Value |
| --- | --- |
| Status | Issue #70 evidence-spike result |
| Decision issue | [#70](https://github.com/Presstronic/astradock-local/issues/70) |
| Related projection | [PU shard, replication connection, and session projections](pu-shard-server-session-projections.md) |
| Fixture corpus | `test/fixtures/runtime-log/live/4.9-pub/sc-4.9-live/spine/` and `mesh/` |
| Fixture standard | [Runtime Log Fixture Corpus and Sanitization Standard](runtime-log-fixture-corpus.md) |
| Reviewed source | Owner-annotated LIVE 4.9.188 capture from 2026-08-19 |

This matrix records the strongest conclusions supported by the supplied sanitized evidence. It is intentionally narrower than the player annotations: a display-overlay observation can guide investigation, but it cannot become a `game.log` event without a safe local-player correlation. An absent or ambiguous capture is recorded as unavailable, never as a successful transition.

## Capture inventory

The reviewed material is one game process/source generation represented by cumulative private log fragments. The repository contains only minimized sanitized excerpts; the raw files remain local and ignored.

| Scenario | Repository evidence | Result |
| --- | --- | --- |
| Frontend → PU join → in-game → disconnect → frontend | [`pu-join-shard-server.observed`](../test/fixtures/runtime-log/live/4.9-pub/sc-4.9-live/spine/pu-join-shard-server.observed.manifest.json), [`disconnect-frontend-clean-exit.observed`](../test/fixtures/runtime-log/live/4.9-pub/sc-4.9-live/spine/disconnect-frontend-clean-exit.observed.manifest.json) | Observed and promoted within `runtime-event/v1`. |
| Two sequential PU sessions in one source generation | [`live-4-9-188-repeated-pu-ready.observed`](../test/fixtures/runtime-log/live/4.9-pub/sc-4.9-live/spine/live-4-9-188-repeated-pu-ready.observed.manifest.json) | Observed. Sessions and shard identities remain separate. |
| Delayed prior-PU disconnect after a new join | [`delayed-pu-disconnect-correlation.observed`](../test/fixtures/runtime-log/live/4.9-pub/sc-4.9-live/spine/delayed-pu-disconnect-correlation.observed.manifest.json) | Observed. The delayed event cannot mutate the newer shard. |
| Same logical shard with overlay-reported DGS label change | [`mesh-vocabulary-noise.non-event`](../test/fixtures/runtime-log/live/4.9-pub/sc-4.9-live/mesh/mesh-vocabulary-noise.non-event.manifest.json) plus owner annotation | Overlay-only observation; no promotable `game.log` event. |
| Return to frontend and join a different shard | Repeated-session evidence above | Shard changes across distinct PU sessions are observed; this is not an in-session mesh handoff. |
| Failed/cancelled matchmaking | [`pu-transition-evidence.unavailable`](../test/fixtures/runtime-log/live/4.9-pub/sc-4.9-live/spine/pu-transition-evidence.unavailable.manifest.json) | Unavailable; no positive event is enabled. |
| AstraDock restart during an active PU session | [`pu-transition-evidence.unavailable`](../test/fixtures/runtime-log/live/4.9-pub/sc-4.9-live/spine/pu-transition-evidence.unavailable.manifest.json) | Unavailable; startup state remains unknown/transitioning without direct evidence. |
| Server error, local network loss, or client crash | [`failure-transition-evidence.unavailable`](../test/fixtures/runtime-log/live/4.9-pub/sc-4.9-live/spine/failure-transition-evidence.unavailable.manifest.json) | Unavailable; no positive event is enabled. |

## Promotion decisions

| Transition | Decision | Required evidence boundary |
| --- | --- | --- |
| PU join and candidate shard | Promoted | A bounded `<Join PU>` record with shard, endpoint, port, and location context. |
| Replication connection established | Promoted | Direct connection evidence correlated to the active join candidate. |
| PU entry | Promoted | The accepted LIVE 4.9.188 ready sequence: `SC_Default` territory setup, game-mode creation, and local-player telemetry initialization within the bounded join window. |
| PU disconnect | Promoted | A true PU channel disconnect correlated by environment and endpoint. Frontend transport disconnects are rejected. |
| Shard change across frontend return | Promoted as separate sequential sessions | A new join candidate starts a new immutable session; the previous session is not rewritten. |
| In-session server/DGS handoff with unchanged shard | Deferred | A direct local-player-correlated source record, stable transition identity, and sanitized positive/negative fixtures are required. Generic `NOT AUTH`, authority, reroute, router, mesh, and zone-host records do not qualify. |
| In-session logical shard change | Deferred | A direct local-player-correlated shard transition without frontend return is required. A later `<Join PU>` is a new session, not proof of an in-session transition. |
| Failed matchmaking | Deferred | A controlled failure/cancellation sequence with an unambiguous local request identity and terminal outcome is required. |
| Cancelled matchmaking | Deferred | A distinct cancellation record or bounded terminal sequence is required; timeout and missing records are not cancellation. |
| Active-session recovery after AstraDock restart | Deferred | A restart capture with a known active session and replay/bootstrap behavior is required. Startup observations must not reconstruct state from unrelated lines. |

## Correlation and state rules

- Partition every correlation by environment key, source generation, and active PU session candidate. LIVE, PTU, and adjacent builds must never share transition evidence.
- Preserve the raw shard label and endpoint privately. Friendly region mapping remains a versioned naming-convention convenience, not server identity or geolocation.
- A new join closes or supersedes the active candidate according to direct evidence and creates a new immutable session. It must not rewrite the earlier session's shard, endpoint, or timestamps.
- A disconnect with an explicit endpoint may terminate only the matching session. An unattributed or conflicting disconnect remains historical evidence and does not mutate current state.
- A quiet log, missing terminal record, generic mesh line, or overlay annotation does not change a connected snapshot into disconnected, recovered, or handed-off state.
- Unsupported transitions are represented as `unknown`, `transitioning`, or unavailable evidence according to the existing projection contract. They do not produce invented canonical events.

## Privacy and review result

The committed fixture excerpts use synthetic identifiers and `.invalid` endpoints. They contain no raw paths, account identifiers, IP addresses, handles, or extracted game assets. The fixture corpus privacy scanner and parser replay tests are the required review gates. Raw owner captures remain outside the repository.

The 2026-08-19 overlay observation is retained only as an owner annotation in [`runtime-capture-findings-2026-08-19.md`](runtime-capture-findings-2026-08-19.md); it is not copied into an observed event payload. Any future overlay/OCR source must have its own source contract, provenance, privacy treatment, and correlation rules.

## Follow-up capture requirements

Issue 70 is complete for the supplied evidence when this matrix and its gates are reviewed. The following remain explicit follow-ups rather than hidden implementation assumptions:

1. Capture a controlled same-shard server/DGS handoff and a controlled in-session shard transition, if the build exposes safe local-player evidence.
2. Capture failed and cancelled matchmaking with request identity and terminal outcome.
3. Capture AstraDock restart while Star Citizen remains in PU, including expected replay/bootstrap semantics.
4. Replace each unavailable annotation only after privacy review and positive/negative replay tests pass.

## Technology and libraries

None. The matrix and fixture gates use repository Markdown, JSON fixtures, Node.js built-ins, and the existing `node:test` runner.
