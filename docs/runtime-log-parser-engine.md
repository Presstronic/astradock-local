# Runtime Log Parser Engine

## Status

Issue #21 introduced the first dependency-free runtime log parser engine boundary. It consumes byte chunks from the incremental tailer, frames complete lines, assembles bounded semantic records, selects a compatible extraction profile, and emits only validated `runtime-event/v1` events for fixture-promoted patterns.

Issue #22 adds bounded, privacy-aware unknown-evidence diagnostics and parser health reporting to that boundary. Unknown evidence is classified after framing/profile dispatch, sampled under explicit count/byte/time caps, minimized before it can appear in summaries, partitioned by environment/build, and kept local-only by default.

Issue #23 adds deterministic runtime-event orchestration between extractor output and parser emission. The orchestration layer owns total ordering metadata, bounded event-family dedupe windows, source-generation resets, domain correlation IDs, conflict quarantine, and observable decisions for replay/debugging.

The legacy scan parser in `src/logParser.js` remains available for the current proof-of-concept renderer. New telemetry pipeline work should use `src/runtimeLogParserEngine.js`.

## Technology and Libraries

None. The implementation uses Node.js built-ins only:

- `TextDecoder` for streaming UTF-8 decoding across arbitrary byte boundaries.
- `node:test` for fixture and boundary verification.
- The existing `runtime-event/v1` contract helpers for event creation, validation, deterministic identity, and environment partitioning.
- The local `RuntimeEventOrchestrator` boundary for deterministic ordering, correlation, and dedupe decisions.

No Grok, regex, schema, or JSON-query dependency was added. Profile dispatch uses reviewed literal sets before any field extraction. Input is bounded by configured line and record byte limits to keep pathological records from creating unbounded memory or regular-expression exposure.

## Boundaries

The parser engine owns:

- Streaming UTF-8 decoding and CRLF/LF line framing.
- Incomplete trailing-line retention.
- Oversized, malformed, empty, orphan-continuation, unsupported-profile, missing-field, conflict, and validation diagnostics.
- Bounded multiline continuation assembly for known continuation records.
- Deterministic profile loading, validation, ordering, compatibility selection, and dispatch.
- Canonical `runtime-event/v1` emission for promoted fixture-backed event families.
- Deterministic orchestration of extractor candidates into emitted canonical events.
- Classified, minimized, bounded unknown evidence for unsupported, unmatched, incomplete, or conflicting records.
- Parser/profile compatibility and suspected-drift health summaries.

The parser engine does not own:

- File watching, offset recovery, truncation, rotation, or backpressure. Those remain in `RuntimeLogTailer`.
- Durable persistence, replay, renderer projections, or Station synchronization.
- SQLite persistence of unknown-evidence diagnostics. The current implementation is an in-memory repository boundary that matches the accepted retention/deletion semantics and can be replaced by the encrypted SQLite store selected by ADR-0003.
- User-authored rules or arbitrary executable profile code.
- Event promotion for mission, destination, travel, unsupported party lifecycle, crash, network-loss, or shard-transition families.

## Profile Model

Profile selection follows [`runtime-profile-compatibility-policy.md`](runtime-profile-compatibility-policy.md). Profiles normally share extraction logic at `major.minor + channel/universe + branch` scope, while exact tested builds, exclusions, immutable profile revisions, and family-level drift gates decide whether a particular patch may emit events. Matching `major.minor` alone is never sufficient evidence of compatibility, and a profile never crosses channel, branch, universe, or minor-version boundaries implicitly.

Built-in profiles live in `src/runtimeLogProfiles.js`. A profile includes:

- `schemaVersion`
- `id`
- `version`
- `priority`
- `compatibility.releaseChannels`
- `compatibility.gameBuildPrefixes`
- `parserVersion`
- `fieldAliases`
- `knownLimitations`
- `extractors`

Each event-producing extractor includes an ID, a reviewed kind implemented by application code, explicit `eventType`, cheap dispatch literals, required payload fields, confidence, sensitivity, evidence markers, and optional dedupe fields. Dedupe fields are policy hints consumed by the orchestrator; extractors do not suppress events themselves. State-only extractors may remember build, identity, matchmaking, channel, or frontend facts, but must not declare event metadata.

`fieldAliases` records reviewed source vocabulary for canonical field names, such as `remoteAddr` mapping into endpoint/port extraction or `playerGEID` mapping into `playerGeid`. The initial CommonJS implementation still performs extraction in reviewed application code, but the profile schema exposes the alias inventory and required-field contract for review and future migration to a stricter schema system.

Profile data cannot execute arbitrary JavaScript. Application-owned correlation state handles multi-line and multi-record facts such as build metadata, identity fragments, matchmaking request IDs, channel creation, and frontend return reason.

## Ordering, Correlation, and Dedupe

`RuntimeEventOrchestrator` processes validated extractor candidates one record at a time. It groups candidates by event type, quarantines conflicting payloads for the same event type and record, applies event-family dedupe keys inside bounded windows, assigns final ingestion sequence values only to emitted events, and annotates emitted events with `extensions.orchestration` metadata:

- `policyId`
- `decision`
- `reason`
- `dedupeWindowMs`
- `correlationWindowMs`
- `orderKey`
- `extractorIds`

These annotations are diagnostic metadata and do not participate in `eventId` identity. Raw log lines and sensitive payload values are not copied into decisions or extensions.

Runtime event ordering uses the shared contract comparator: source timestamp, ingestion sequence, source generation, source byte offset, and event ID. Tailer chunk sequence is preserved in `ordering.sourceChunkSequence` for traceability, but it is not part of the stable order key because live and replay chunking may differ.

The parser accepts both raw byte/string chunks and tailer chunk envelopes. When a tailer source generation changes because of truncation or replacement, the parser resets incomplete framing, semantic-record assembly, channel/matchmaking/frontend correlation state, and orchestrator dedupe context. It emits a `source_generation_changed` diagnostic without exposing the source path.

Event-specific correlation IDs are deterministic partitioned IDs scoped by `environmentKey`. Supported domain IDs currently include login session, local account, client session, matchmaking request, PU replication connection, party, notification, build fingerprint, event family, event dedupe, and parser environment session. Raw handles, account IDs, endpoints, and notification IDs are not used directly as correlation values.

Promoted event-family policies are:

| Event family | Dedupe identity | Window | Correlation scope |
| --- | --- | --- | --- |
| `ClientBuildObserved` | File version, product version, branch, changelist | 24 hours | Environment/build |
| `ReleaseEnvironmentObserved` | Release channel, environment name, config, source location | 24 hours | Environment/build |
| `GameDataVersionObserved` | Game/data-core/archetype/component versions | 24 hours | Environment/build |
| `LoginStarted` | Login session ID | 30 minutes | Local-player session |
| `AccountAuthenticated` | Handle and account ID | 30 minutes | Local account |
| `IdentityObserved` | Account ID, character GEID, player GEID, client session | 30 minutes | Local account/client session |
| `PuJoinRequested` | Matchmaking request, shard, endpoint, port, location | 30 minutes | Matchmaking/replication connection |
| `PuReplicationConnectionEstablished` | Endpoint, port, observed node, player GEID, gamerules, Replicant host type | 30 minutes | PU replication connection |
| `UniverseHierarchyRegistered` | Network-received flag and node count | 30 minutes | PU hierarchy initialization |
| `PuTerritorySetupCompleted` | Gamerules and terminal setup status | 30 minutes | PU territory initialization |
| `PuEntered` | Gamerules and load duration | 30 minutes | PU session |
| `PuDisconnected` | Endpoint, cause, reason | 30 minutes | PU replication connection |
| `ReturnedToFrontend` | Frontend reason | 30 minutes | PU/frontend transition |
| `ApplicationExited` | Cause, reason, exit code | 30 minutes | Application session |
| `PartyCreated` | Party ID | 10 minutes | Party |
| `PartyLaunchInitiated` | Notification ID and message | 10 minutes | Party notification |
| `PartyMemberConnected` | Notification ID and member handle | 10 minutes | Party notification/member |
| `PartyLeft` | Party ID, local player GEID, voluntary-leave reason | 10 minutes | Party/local player |
| `JurisdictionEntered` | Notification ID and jurisdiction | 10 minutes | Location notification |
| `MonitoredSpaceEntered` | Notification ID and state | 10 minutes | Location notification |
| `ArmisticeStateChanged` | Notification ID and state | 10 minutes | Location notification |

Duplicate suppression never crosses `environmentKey`. A repeated action with the same payload after its bounded dedupe window emits a distinct event; the source timestamp and evidence reference keep the event ID distinct.

## Runtime State Projections

For LIVE 4.9.188, `PuEntered` has two supported terminal paths. The legacy completed `OnClientEnteredGame` record remains accepted only for `SC_Default`. The current path requires one active PU join followed, in order and within a bounded five-minute window, by completed `SC_Default` territory setup, game-mode creation, and local-player telemetry initialization. A new join replaces the pending candidate; disconnect, frontend return, application exit, or source-generation replacement clears it. Frontend, missing, misordered, duplicate, cross-session, and expired anchors cannot complete the sequence.

Repeated PU sessions use the active join identity as bounded deduplication scope, so identical territory and entry payloads in two sessions remain distinct canonical events while duplicate physical records inside one session remain suppressed.

The current 4.9.188 HUD notification shape is normalized alongside the legacy shape. Its bracket counter is treated only as a notification-scoped correlation value. Trailing colon text and armistice descriptions are normalized for supported event extraction; jurisdiction, monitored-space entry/exit, and armistice events retain observed-announcement provenance and do not assert authoritative physical containment.

`parseLogFile` now projects promoted runtime events into renderer-safe current-state DTOs:

- `rendererLifecycle` for game lifecycle, shard, PU Replicant connection, and PU session.
- `partySnapshot` for environment-scoped party state from `PartyCreated`, `PartyLaunchInitiated`, `PartyMemberConnected`, and `PartyLeft`.
- `locationSnapshot` for independently fresh jurisdiction, monitored-space, and armistice facts from validated HUD notification events.
- `promotedRuntimeEvents` for sanitized party and zone stream rows backed by canonical runtime event IDs.

Party and location snapshots are conservative by contract. Party-marker records, object-container paths, route subsystem records, nearby place-name noise, missing terminal lines, and unsupported lifecycle candidates do not mutate current state. Session boundaries and stale windows mark existing facts stale or unknown instead of inventing clear, false, disband, leave, or not-in-party state.

## Authoring, Review, and Versioning

Profile changes require accepted positive or negative fixtures before an extractor can emit a new canonical event. Additions must update `sourceProfileVersion`, document known limitations, and keep compatibility scoped to explicit release-channel and game-build evidence. The loader validates profile schema version, unique profile and extractor IDs, compatibility metadata, field aliases, dispatch literals, event mappings, required fields, and known limitations before any profile can run.

Breaking profile changes require a new profile version. Breaking changes include changing event mappings, required fields, dedupe identity, compatibility scope, or the meaning of an alias. Future profile versions should preserve old versions for replay until the persistence layer has a migration/quarantine policy.

The `sc-4.9-live` profile version `draft-2026-08-19.1` recognizes both the reviewed `4.9.0-LIVE.*` fixture form and the directly observed LIVE executable-version family `4.9.188.*`. Compatibility still requires the LIVE channel. Numerically adjacent future families and PTU 4.10 remain unsupported until separately reviewed; the matcher must not collapse the rule to a broad `4.9.*` prefix.

## Failure Handling

Malformed UTF-8 is reported and decoded with replacement so monitoring can continue. Oversized complete lines are quarantined. Oversized incomplete lines are discarded until the next newline. Incomplete trailing bytes are retained by default and reported on `end()` unless the caller explicitly asks to emit incomplete lines.

Unsupported builds and invalid profile requests produce diagnostics and unknown evidence. Conflicting matches for the same event type on one record are quarantined rather than guessed.

Runtime events do not copy raw line text. Evidence references include source IDs, fixture IDs when applicable, evidence markers, line ranges, and sensitivity.

Orchestration diagnostics are bounded. `snapshot().orchestration` includes aggregate counts and recent decisions such as emitted events, suppressed duplicates, quarantined conflicts, dedupe evictions, and source-scope resets. Decisions contain event IDs, policy IDs, dedupe IDs, extractor IDs, and reasons only.

## Unknown Evidence Diagnostics

Unknown evidence is retained for parser diagnosis only. It is never uploaded by the parser engine and is not written into application logs. Capture currently covers:

- `unsupported_profile`: no loaded profile is compatible with the active release channel/build evidence.
- `no_profile_match`: a compatible profile exists, but cheap dispatch found no extractor for the record.
- `matched_missing_required_fields`: an extractor matched but could not build a valid event payload.
- `match_conflict`: multiple extractors produced conflicting payloads for one event type.

The in-memory store records aggregate counts even when samples are capped. Samples are grouped by environment key, game build, category, reason, and a redacted fingerprint. Defaults are intentionally conservative:

- Retention: 30 days.
- Maximum retained samples: 250.
- Maximum sample size: 320 bytes.
- Maximum total sample bytes: 96 KiB.
- Maximum samples per bucket: 4.
- Maximum buckets: 1,000.

Summaries include bucket/category/environment counts, sample counts, dropped sample counts, sensitivity, redaction status, structural evidence markers, line ranges, source byte offsets, and redacted snippets when detail is explicitly requested. They do not include raw log lines.

Minimization currently redacts common secrets, session tokens, account/player identifiers, handles, endpoints, and local filesystem paths. Redaction is not the sole privacy control: the store also bounds capture, deduplicates repeated evidence, partitions by environment/build, supports scoped deletion/reset, and omits raw lines from diagnostics.

The parser engine exposes:

- `queryUnknownEvidence(query)` for bounded local inspection by environment/build/category/reason.
- `deleteUnknownEvidence(scope)` for targeted local removal, including sensitive-only deletion.
- `resetUnknownEvidence()` for complete local unknown-evidence reset.
- `getParserHealth()` for compatibility/drift status without sample detail.

## Parser Health

Parser health is reported separately from canonical gameplay telemetry so that UI and persistence code can treat it as diagnostics. `snapshot()` returns:

- `unknownEvidenceSummary`
- `unknownEvidence`
- `parserHealth`
- `healthEvents`

`healthEvents` contains validated `runtime-event/v1` diagnostic events:

- `ParserCompatibilityStatusObserved`
- `ParserDriftSuspected`

The drift heuristic is deliberately conservative and configurable. By default it requires at least 25 records, at least 15 unknown records, and an unknown ratio of 75% before reporting `suspected_drift`. Unsupported profiles are reported as compatibility uncertainty, not as a Star Citizen fault.

## Verification

Run:

```bash
npm test
npm run benchmark:parser
```

Focused coverage includes:

- CRLF/LF framing across arbitrary chunks.
- Split UTF-8 sequences, invalid UTF-8, oversized lines, incomplete trailing lines.
- Bounded multiline semantic record assembly.
- Deterministic profile validation and ordering.
- Deterministic ordering keys, bounded event-family dedupe, cross-environment dedupe isolation, and source-generation reset behavior.
- Fixture-backed canonical event emission for all promoted MVP patterns.
- Duplicate notification dedupe.
- Negative fixtures producing no canonical events.
- Unsupported build/profile diagnostics.
- Privacy minimization for unknown samples and metadata.
- High-volume unknown sampling caps with preserved aggregate counts.
- Environment/build partitioning, retention cleanup, scoped deletion, and reset.
- Parser compatibility and suspected drift health events.

The parser benchmark feeds 5,000 framed records across deliberately uneven chunk sizes, requires 50 promoted canonical events, checks that dispatch avoids invoking every extractor for every record, and enforces a conservative local parse ceiling.
