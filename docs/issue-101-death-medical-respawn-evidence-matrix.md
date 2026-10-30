# Local-player Death and Medical Respawn Evidence Matrix

## Status and decision

| Field | Value |
| --- | --- |
| Status | Issue #101 evidence-spike result — defer promotion |
| Decision issue | [#101](https://github.com/Presstronic/astradock-local/issues/101) |
| Tested profile | `sc-4.9-live`, exact build not established for the supplied death observation |
| Fixture gate | [`death-medical-respawn-evidence.unavailable.manifest.json`](../test/fixtures/runtime-log/live/4.9-pub/sc-4.9-live/lifecycle/death-medical-respawn-evidence.unavailable.manifest.json) |
| Runtime contract change | None |

This investigation separates death/emergency, incapacitation, revival, medical respawn, and cause attribution. The supplied controlled observation establishes owner action context (Backspace) and a promising sequence, but the action is not a `Game.log` observation. No production event is promoted by this issue.

## Evidence reviewed

The owner-described sequence contains the following sanitized observations:

1. `Standby, Local Emergency Services Are En Route` at `00:03:45Z`.
2. A MedBed component initializes approximately 28 seconds later.
3. Local-player telemetry initializes again immediately afterward.
4. Later HUD notifications report monitored space, armistice, and `microTech` jurisdiction.

The repository also contains older and unrelated occurrences of `EntityComponentMedBed` and `CleanupDeadReplicationLayers`. Those are retained as noise controls: neither is local-player attribution or proof of death. The reviewed source corpus contains no direct `backspace`, `suicide`, `self-termination`, `death`, or `respawn` marker that independently identifies cause.

The owner action annotation is evidence about the test scenario, not parser input. Raw logs and personal identifiers are not copied into the fixture corpus.

## Marker classification

| Observation | Classification | Supported meaning | Prohibited meaning |
| --- | --- | --- | --- |
| `Standby, Local Emergency Services Are En Route` | Contextual, promising | An emergency/medical transition occurred in the observed client context | It proves death, incapacitation, local-player ownership, or cause |
| `EntityComponentMedBed` initialization | Noise/contextual | A MedBed-related component initialized | It proves respawn, death, revival, or a player bed interaction |
| Local-player telemetry initialization | Contextual, promising | Local telemetry was initialized or rebound | It uniquely identifies respawn rather than login, streaming, bed use, or server transition |
| Post-transition jurisdiction/monitored-space/armistice notification | Contextual | HUD location/jurisdiction text was observed | It proves the preceding transition was a medical respawn or establishes an exact physical location |
| `CleanupDeadReplicationLayers` | Noise | Replication layers were cleaned up | It proves character death or actor destruction |
| `backspace`, `suicide`, `self-termination`, or equivalent | Absent in reviewed evidence | Nothing | It must not be inferred from owner action timing |

## Promotion decisions

| Candidate | Decision | Reason |
| --- | --- | --- |
| `LocalPlayerEmergencyTransitionObserved` | Defer | One owner-described sequence does not prove local-player specificity or uniqueness versus incapacitation/rescue/other-player activity. |
| `LocalPlayerMedicalRespawnObserved` | Defer | MedBed and telemetry initialization are not unique to respawn, and no repeated controlled capture or negative corpus exists. |
| `LocalPlayerLifecycleResetObserved` | Defer | The reset boundary is promising but its semantics and correlation identity are not established. |
| `LocalPlayerSelfTerminationInferred` | Reject for current evidence | Backspace is owner-confirmed context only; the log does not independently support cause attribution. |

Generic death, incapacitation, revival, medical respawn, killer, damage source, legal status, inventory loss, regeneration eligibility, corpse location, and physical respawn location remain `unknown`/unsupported. The jurisdiction text may be retained as observed context in a future evidence record, never as an invented location.

## Capture matrix and required evidence

| Scenario | Current repository state | Required promotion evidence |
| --- | --- | --- |
| Backspace self-termination → medical respawn | One owner-described observation; no sanitized fixture | Repeat across builds and isolate direct cause marker from common lifecycle markers. |
| Combat death → medical respawn | Unavailable | Positive capture with local identity and a distinct owner annotation. |
| Environmental/fall/suffocation death → medical respawn | Unavailable | Positive capture and comparison against common emergency/respawn sequence. |
| Incapacitation → timeout/death → respawn | Unavailable | Separate incapacitation and terminal evidence with ordering and bounds. |
| Incapacitation → player medical revival | Unavailable; party-assisted test needed | Positive revival capture proving no respawn and no false death promotion. |
| Manual MedBed use without death | Unavailable | Negative capture proving MedBed initialization is not sufficient. |
| Normal login/spawn at hospital or habitation | Unavailable | Negative capture with the same telemetry/location markers where possible. |
| Bed logout and return | Unavailable | Negative capture and source-generation/session boundary. |
| Normal menu logout | Existing session-boundary evidence only | Verify no lifecycle promotion. |
| ALT-F4 | Existing session-boundary evidence only | Verify no lifecycle promotion. |
| Network disconnect/server error recovery | Existing unavailable transition annotation | Verify no lifecycle promotion. |
| Shard/server transition without death | Existing transition evidence only | Verify correlation reset and no lifecycle promotion. |

The solo-feasible scenarios may proceed independently. Party-assisted revival remains externally blocked until another participant is available; it must not block analysis of solo negatives.

## Proposed contract shape if later promoted

No contract is approved today. A future direct observation should first emit small observed records containing source timestamp, ingestion timestamp, environment/session/source generation, parser profile/version, evidence reference, sensitivity, and confidence. A derived lifecycle record may only include contributing event IDs and a human-readable derivation reason. Correlation must be bounded by environment, source generation, active PU session, local identity, and a documented time window; it must reset at restart, source replacement, and incompatible session boundaries.

Any future medical-location field must preserve the exact observed HUD text, freshness, provenance, and confidence. An absent location is `unknown`, not an empty or resolved physical location. Cause is `Unknown` unless independently observed.

## Privacy, reliability, and performance

Death and medical activity can reveal sensitive gameplay behavior, timestamps, location, identity, and party context. Raw log lines, handles, account/player IDs, endpoints, paths, and stable entity IDs remain local and are excluded from shareable fixtures and default synchronization. Any future upload requires explicit minimization and consent policy.

No parser profile or runtime extractor was added, so issue 101 adds no runtime cost or performance regression. The fixture gate intentionally tests literal noise and missing-evidence behavior without broad regular-expression scanning. A future extractor must benchmark literal dispatch and bounded correlation against representative logs before promotion.

## Verification guidance

Happy path for a future capture:

1. Record exact build/channel/profile, session, source generation, and owner action time separately from the log.
2. Sanitize the smallest pre/post excerpt and replay it with the manifest.
3. Confirm each direct marker, ordering constraint, correlation key, time bound, confidence, provenance, and evidence reference.
4. Compare at least multiple causes against common emergency/medical observations before naming a generic lifecycle event.

Unhappy path:

1. Replay the committed MedBed/replication noise fixture and confirm no candidate event is promoted.
2. Replay login, hospital proximity, ordinary MedBed use, streaming, logout, ALT-F4, disconnect, and shard-transition captures when supplied; confirm no false death/respawn event.
3. Remove a required marker, exceed the correlation window, or cross a session/source-generation/environment boundary; retain `unknown`/incomplete state.
4. Supply malformed or drifted markers; quarantine them with privacy-safe diagnostics and do not best-guess.

## Technology and Libraries

None. This result uses Markdown, sanitized JSON/log fixtures, Node.js built-in tests, and existing fixture validation.

## Follow-up issues

1. Capture and sanitize repeated local-player emergency/medical sequences across the scenario matrix.
2. Add a separately reviewed observed-event contract only after the promotion gates pass.
3. Add bounded lifecycle correlation and UI work as separate implementation stories if the contract is promoted.
