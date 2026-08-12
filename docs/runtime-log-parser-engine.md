# Runtime Log Parser Engine

## Status

Issue #21 introduced the first dependency-free runtime log parser engine boundary. It consumes byte chunks from the incremental tailer, frames complete lines, assembles bounded semantic records, selects a compatible extraction profile, and emits only validated `runtime-event/v1` events for fixture-promoted patterns.

Issue #22 adds bounded, privacy-aware unknown-evidence diagnostics and parser health reporting to that boundary. Unknown evidence is classified after framing/profile dispatch, sampled under explicit count/byte/time caps, minimized before it can appear in summaries, partitioned by environment/build, and kept local-only by default.

The legacy scan parser in `src/logParser.js` remains available for the current proof-of-concept renderer. New telemetry pipeline work should use `src/runtimeLogParserEngine.js`.

## Technology and Libraries

None. The implementation uses Node.js built-ins only:

- `TextDecoder` for streaming UTF-8 decoding across arbitrary byte boundaries.
- `node:test` for fixture and boundary verification.
- The existing `runtime-event/v1` contract helpers for event creation, validation, deterministic identity, and environment partitioning.

No Grok, regex, schema, or JSON-query dependency was added. Profile dispatch uses reviewed literal sets before any field extraction. Input is bounded by configured line and record byte limits to keep pathological records from creating unbounded memory or regular-expression exposure.

## Boundaries

The parser engine owns:

- Streaming UTF-8 decoding and CRLF/LF line framing.
- Incomplete trailing-line retention.
- Oversized, malformed, empty, orphan-continuation, unsupported-profile, missing-field, conflict, and validation diagnostics.
- Bounded multiline continuation assembly for known continuation records.
- Deterministic profile loading, validation, ordering, compatibility selection, and dispatch.
- Canonical `runtime-event/v1` emission for promoted fixture-backed event families.
- Classified, minimized, bounded unknown evidence for unsupported, unmatched, incomplete, or conflicting records.
- Parser/profile compatibility and suspected-drift health summaries.

The parser engine does not own:

- File watching, offset recovery, truncation, rotation, or backpressure. Those remain in `RuntimeLogTailer`.
- Durable persistence, replay, renderer projections, or Station synchronization.
- SQLite persistence of unknown-evidence diagnostics. The current implementation is an in-memory repository boundary that matches the accepted retention/deletion semantics and can be replaced by the encrypted SQLite store selected by ADR-0003.
- User-authored rules or arbitrary executable profile code.
- Event promotion for mission, destination, travel, unsupported party lifecycle, crash, network-loss, or shard-transition families.

## Profile Model

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

Each event-producing extractor includes an ID, a reviewed kind implemented by application code, explicit `eventType`, cheap dispatch literals, required payload fields, confidence, sensitivity, evidence markers, and optional dedupe fields. State-only extractors may remember build, identity, matchmaking, channel, or frontend facts, but must not declare event metadata.

`fieldAliases` records reviewed source vocabulary for canonical field names, such as `remoteAddr` mapping into endpoint/port extraction or `playerGEID` mapping into `playerGeid`. The initial CommonJS implementation still performs extraction in reviewed application code, but the profile schema exposes the alias inventory and required-field contract for review and future migration to a stricter schema system.

Profile data cannot execute arbitrary JavaScript. Application-owned correlation state handles multi-line and multi-record facts such as build metadata, identity fragments, matchmaking request IDs, channel creation, and frontend return reason.

## Authoring, Review, and Versioning

Profile changes require accepted positive or negative fixtures before an extractor can emit a new canonical event. Additions must update `sourceProfileVersion`, document known limitations, and keep compatibility scoped to explicit release-channel and game-build evidence. The loader validates profile schema version, unique profile and extractor IDs, compatibility metadata, field aliases, dispatch literals, event mappings, required fields, and known limitations before any profile can run.

Breaking profile changes require a new profile version. Breaking changes include changing event mappings, required fields, dedupe identity, compatibility scope, or the meaning of an alias. Future profile versions should preserve old versions for replay until the persistence layer has a migration/quarantine policy.

## Failure Handling

Malformed UTF-8 is reported and decoded with replacement so monitoring can continue. Oversized complete lines are quarantined. Oversized incomplete lines are discarded until the next newline. Incomplete trailing bytes are retained by default and reported on `end()` unless the caller explicitly asks to emit incomplete lines.

Unsupported builds and invalid profile requests produce diagnostics and unknown evidence. Conflicting matches for the same event type on one record are quarantined rather than guessed.

Runtime events do not copy raw line text. Evidence references include source IDs, fixture IDs when applicable, evidence markers, line ranges, and sensitivity.

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
- Fixture-backed canonical event emission for all promoted MVP patterns.
- Duplicate notification dedupe.
- Negative fixtures producing no canonical events.
- Unsupported build/profile diagnostics.
- Privacy minimization for unknown samples and metadata.
- High-volume unknown sampling caps with preserved aggregate counts.
- Environment/build partitioning, retention cleanup, scoped deletion, and reset.
- Parser compatibility and suspected drift health events.

The parser benchmark feeds 5,000 framed records across deliberately uneven chunk sizes, requires 50 promoted canonical events, checks that dispatch avoids invoking every extractor for every record, and enforces a conservative local parse ceiling.
