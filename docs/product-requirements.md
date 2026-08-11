# AstraDock Local Product Requirements

## Document status

| Field | Value |
| --- | --- |
| Status | Working draft for requirements gathering |
| Product | AstraDock Local |
| Companion product | AstraDock Station |
| Last consolidated | 2026-08-09 |
| Delivery stage | Product and technical specification; implementation is not authorized |

This document is the consolidated product-requirements source for AstraDock Local. It replaces the earlier project and session handoff documents. Repository-level working instructions remain in [`AGENTS.md`](../AGENTS.md) and are authoritative for how work is performed.

Requirements use the following labels:

- **Settled**: directed by the owner or required by the product mission.
- **Candidate**: supported by evidence or product value but not yet committed to a release.
- **Open**: requires a product, technical, legal, or operational decision.

MVP, Phase 1, and Phase 2 assignments are intentionally not made in this draft. Phase boundaries must follow user value, risk reduction, dependencies, and the smallest coherent release.

## 1. Product summary

AstraDock Local is a trusted, local-first desktop companion for a player's Star Citizen installation. It turns information available on the player's machine into useful, near-real-time telemetry and selectively synchronizes explicitly approved information to the player's AstraDock Station SaaS installation.

The product owns local installation discovery, runtime collection, extraction, parsing, normalization, rule evaluation, local persistence, and controlled synchronization. Station is the remote SaaS counterpart.

## 2. Problem statement

Star Citizen exposes useful but unstable information across runtime logs and large installed game assets. That information is difficult for a player to follow during a session, is not normalized for history or analysis, changes between game builds, and may contain sensitive personal or system data.

AstraDock Local should convert this local evidence into coherent, traceable facts without requiring the player to inspect raw files, without treating patch-specific strings as permanent contracts, and without silently sending private data off the machine.

## 3. Product vision and outcomes

### 3.1 Vision

Players can understand what happened during and across Star Citizen sessions through reliable live telemetry, session history, and selected official game context. They retain control over what is collected, retained, and synchronized.

### 3.2 Desired user outcomes

- See meaningful in-game events appear locally with low latency.
- Know the current game, shard, server-connection, session, and party state when observable.
- Review a coherent session history rather than raw log noise.
- Understand whether a fact was observed, extracted, inferred, or externally enriched.
- Continue useful local operation while Station or the network is unavailable.
- Inspect and control what data is eligible for synchronization.
- Detect and process a new LIVE game build into explicitly selected official datasets.
- Diagnose unsupported or changed log formats without silent data loss.

### 3.3 Target users

**Open:** Define primary personas and prioritize their workflows. Likely users include an individual player reviewing personal sessions, a group/organization member coordinating activity, and a Station administrator publishing selected official game datasets.

## 4. Product principles

1. **Local first.** Raw logs and extracted assets remain local unless the player knowingly configures synchronization.
2. **Evidence before inference.** User-facing facts must identify their provenance and confidence.
3. **Stable contracts over unstable wording.** Game-build-specific extraction produces versioned canonical data.
4. **Two distinct data planes.** Runtime observations and mined official definitions retain separate schemas, lifecycles, and upload policies.
5. **Privacy by default.** Minimize and redact at outbound boundaries; never upload raw logs by default.
6. **Resilient across patches.** Unknown input is captured safely for diagnosis rather than silently discarded.
7. **Explicit, inspectable synchronization.** Remote transfer is consent-driven, durable, and visible.
8. **Replaceable integrations.** External extraction tools are adapters, not domain truth.
9. **Strict environment isolation.** LIVE/PU, PTU, EPTU, HOTFIX, and future environments never share mutable state or lose their source identity.

## 5. Scope model

### 5.1 Runtime telemetry plane

Runtime telemetry is observed from the active Star Citizen `game.log`. The system incrementally tails the file, detects known record families, maintains necessary context, emits canonical events, evaluates rules, persists useful history, streams state to the interface, and queues only approved synchronization.

Runtime data can contain account identifiers, player handles, IP addresses, local paths, hardware fingerprints, social relationships, and raw player activity. It is sensitive by default.

### 5.2 Official installed-data plane

Official data is mined from installed assets such as `Data.p4k`, DataCore (`.dcb`), CryXML, and related formats. Mining is an explicit, scoped, cancellable background job. Results are normalized into versioned datasets and cached by source build or fingerprint.

Extracted definitions are not runtime observations. They may be correlated in the product, but their provenance and contracts remain distinct.

### 5.3 Explicit non-goals for the current stage

- Rebuilding or materially extending the application before implementation authorization.
- Treating the existing proof-of-concept UI or architecture as a product requirement.
- Extracting or uploading the entire game database by default.
- Encoding application business logic inside extraction-profile configuration.
- Claiming unsupported telemetry solely because a subsystem keyword appears in a log.
- Uploading raw log lines, private identifiers, or other players' social data by default.

### 5.4 MVP product boundary — Settled

MVP is a production-quality, local-only Runtime Monitor focused on delivering an exceptional live-information experience while the user is actively playing Star Citizen.

MVP includes:

- Reliable local source discovery and incremental `game.log` monitoring.
- Strict environment/build isolation and visible current source context.
- Versioned extraction of evidence-backed canonical runtime events.
- Current-state projections and a continuously updating event history.
- Terminal and Table presentations with shared event drilldown.
- At-a-glance information that reduces the need to open game debug screens or interrupt play for known status/context.
- Local persistence/replay needed for reliability, restart recovery, and current/session context.
- Local settings, privacy controls, diagnostics, and sanitized fixture-driven verification.

MVP explicitly excludes:

- Station authentication or any other Station network integration.
- Uploading, synchronization, shared organization views, or ready-up networking.
- Installed game-data extraction, processing, Data Operations, or dataset publication.
- Personal historical charts, correlations, and the History & Analytics workspace.
- User-authored rules/assertions unless later proven indispensable to the coherent Runtime Monitor release.
- Telemetry event families that lack current representative evidence and acceptance fixtures.

The excluded capabilities remain part of the long-term product direction but shall not expand the MVP architecture or interface beyond establishing clean future seams.

## 6. Functional requirements: runtime collection

### 6.1 Installation and source discovery — Settled

The application shall:

- Discover common native Windows and Linux/Wine/Proton Star Citizen installations.
- Detect game channel and build when the source exposes them.
- Permit a user-selected `game.log` when automatic discovery fails.
- Clearly identify the active source path and monitoring state.
- Treat path and machine details as sensitive local information.

### 6.2 Incremental log monitoring — Settled

The tailer shall:

- Read only newly appended bytes during normal operation.
- Correctly handle startup position, partial lines, CRLF/LF boundaries, and very long lines.
- Handle file truncation, rotation, replacement, duplicate filesystem notifications, and clean shutdown.
- Apply bounded buffering and backpressure.
- Preserve source timestamp and ingestion timestamp.
- Assemble supported multi-line semantic records.
- Operate independently of renderer state.

### 6.3 Format detection and extraction — Settled

The processing flow is:

```text
Raw game.log bytes
  -> line and continuation framing
  -> log format/profile detection
  -> versioned extraction profile
  -> canonical event validation
  -> persistence, rule evaluation, UI, and optional synchronization
```

Extraction profiles may define:

- Line shapes or tags identifying candidate events.
- Canonical event type mappings.
- Named field extraction and aliases/fallbacks.
- Required fields and profile compatibility metadata.

Application code retains responsibility for file handling, parsing-engine execution, multi-line/context state, validation, confidence, DTO emission, persistence, UI behavior, and synchronization.

Grok-style named patterns are the leading candidate for semi-structured text. JSONPath or JMESPath may be used for JSON-like payloads. Drain/LogPAI may later assist corpus clustering and pattern discovery.

### 6.4 Efficient recognition — Settled

Monitoring shall use cheap literal or tag dispatch before applying field extraction. It shall not execute every pattern against every line. Event-family-specific contextual correlation and deduplication must follow extraction.

### 6.5 Unknown evidence — Settled

The system shall retain diagnostically useful unknown records locally under bounded retention controls. Capture must be configurable and privacy-aware. Unknown records must not be uploaded by default.

## 7. Canonical runtime model

### 7.1 Event envelope — Settled

Every normalized runtime event shall use a versioned envelope containing at least:

```text
eventId
eventType
contractVersion
sourceTimestamp
ingestedAt
environmentKey
gameChannel
gameBuild
sourceLocation
sourceProfileId
sourceProfileVersion
parserVersion
provenance
confidence
correlationIds
payload
evidenceReference
```

Raw evidence remains local by default and should be referenced rather than copied into synchronization payloads.

### 7.2 Provenance — Settled

Values and events must distinguish:

- `observed`: directly present in a local runtime source.
- `extracted`: decoded from official installed game data.
- `inferred`: derived by an AstraDock rule or correlation.
- `enriched`: supplied by an external service.

Derived events must retain traceable reasons and contributing event references.

### 7.3 Confidence and uncertainty — Settled

Contracts shall represent uncertainty explicitly. Absence of evidence must not be converted to a false value. Stateful features require an `unknown` condition when monitoring starts mid-state or terminal evidence is missing.

### 7.4 Identity correlation — Settled

The local identity model must preserve separately named identifiers rather than collapsing them into one player ID. Current evidence supports character name, handle, account ID, character GEID, network player GEID, node ID, entity ID, login session, client session, trace/process session, and environment session.

Identity mappings shall be additive and evidence-backed. Conflicts must remain observable. Other-player name-to-ID mappings require direct evidence and must not be inferred from proximity alone.

### 7.5 Telemetry dimensions — Settled

Telemetry shall be classified through independent dimensions rather than assigned to one mutually exclusive category. An event or projection may have real-time, historical, diagnostic, privacy, and synchronization value at the same time.

Each canonical event type and materialized projection shall declare or derive the following traits:

| Dimension | Purpose | Example values |
| --- | --- | --- |
| Temporal utility | How quickly the information matters | `live`, `near_real_time`, `session_summary`, `long_term_history` |
| Persistence policy | Whether and for how long it survives application/session closure | `ephemeral`, `session`, `durable`, plus a retention policy |
| Station sync policy | Whether the data may leave the device | `never`, `eligible_with_consent`, `required_for_enabled_feature`; eligibility does not mean it is currently queued or uploaded |
| Diagnostic utility | Whether it supports parser, game, integration, or application troubleshooting | `none`, `operational`, `parser_drift`, `game_bug`, `support_bundle` |
| Provenance | Where the fact originated | `observed`, `extracted`, `inferred`, `enriched` |
| Confidence | Strength of evidence | `confirmed`, `high`, `medium`, `low`, `unknown` |
| Sensitivity | Privacy/security handling | `public`, `local`, `personal`, `social`, `secret` |
| Subject scope | Whom or what the fact describes | `local_player`, `other_player`, `party`, `session`, `shard`, `server_connection`, `installation`, `game_build` |
| Lifecycle | Whether it is an occurrence, current state, or aggregate | `event`, `state`, `snapshot`, `metric`, `definition` |
| Volume/cost class | Expected ingestion, storage, and sync cost | `low`, `moderate`, `high`, `bulk` |

Additional dimensions may be introduced through contract versioning, but environment identity is mandatory and governed separately below.

“Surface to Station” should be expressed as a synchronization policy rather than a boolean. A boolean cannot distinguish data that must never leave the device from data that is eligible but lacks consent, is temporarily disabled, or is intentionally retained only locally for a particular session.

“Bug-hunting information” should be expressed as diagnostic utility and intended diagnostic audience. Parser-format drift, AstraDock operational failures, game-client faults, and user-generated support bundles have different retention, redaction, and sharing requirements.

### 7.6 Environment identity and isolation — Settled, non-negotiable

PU/LIVE, PTU, EPTU, HOTFIX, and any future or unknown environment must never be conflated. Environment is a first-class identity and storage partition, not a UI tag added after parsing.

Because available log vocabulary may mix installation channel, deployment environment, game mode, branch, and build, the normalized environment context shall preserve each separately:

```text
EnvironmentContext {
  environmentKey,
  releaseChannel,       // LIVE, PTU, EPTU, HOTFIX, UNKNOWN, or future value
  universe,             // PU or another observed game mode/universe
  environmentName,      // normalized deployment environment when known
  rawEnvironmentTag,
  branch,
  buildVersion,
  changelist,
  databaseVersion,
  sourceInstallationId,
  observedAt,
  confidence,
  evidenceReference
}
```

The implementation shall:

- Derive a stable `environmentKey` from explicit environment/channel/build evidence and preserve the raw values used.
- Use `unknown` rather than defaulting an unrecognized source to LIVE.
- Partition active state, event streams, identity correlations, sessions, party rosters, deduplication windows, persistence/replay, retention, mining fingerprints/caches, rules, exports, and Station queues by `environmentKey`.
- Reset or switch projections explicitly when the monitored source changes environment.
- Reject or quarantine records whose environment conflicts with the active source rather than silently joining them.
- Include environment identity in event IDs, idempotency keys, sync payloads, dataset versions, and diagnostic evidence.
- Prevent a Station retry queued for one environment from being relabeled or sent as another.
- Label environment prominently anywhere users inspect live state, history, exports, diagnostics, or synchronization.
- Permit cross-environment comparison only as an explicit read/analysis operation over separately retained partitions; comparison must not merge source records or mutable state.
- Test isolation with interleaved fixtures containing identical handles, shard-like identifiers, event timestamps, and entity IDs from different environments.

Build changes within the same named release channel also remain distinct source contexts. Whether product history groups multiple builds for display is a query/presentation decision and must not weaken storage or provenance boundaries.

## 8. Runtime telemetry requirements

### 8.1 Client, build, and lifecycle — Settled

Track when observable:

- Application start and clean/unclean end.
- File/product version, branch, changelist, build date/time, configuration, and release environment.
- Game/DataCore/class/archetype/component/object-container/database version fingerprints.
- Authentication started/completed/failed.
- Frontend entered and exited.
- Loading phase, completion, significant long waits, and failure.

### 8.2 Shard, server, and PU session — Settled

Track separately:

- PU join requested.
- Matchmaking request/status.
- Shard label and raw shard segments.
- Server endpoint and port as observed by the client.
- Location ID returned by matchmaking.
- Network channel establishment and successful in-game entry.
- Connection/session duration.
- Disconnect cause, reason, and local/remote origin.
- Return to frontend.
- Shard/server transition when future evidence supports it.

A server endpoint is not necessarily a stable server identity. Startup trace values such as `@host_session: local_shard` must not replace the PU shard identity.

The Runtime Monitor shall maintain separate current `ShardSnapshot` and `ServerConnectionSnapshot` projections. The shard snapshot identifies the logical shard; the server snapshot identifies the currently observed network server/endpoint connection. A server transition must update the server snapshot and emit a transition event even when the logical shard does not change. A shard transition must update both projections as supported by the observed connection sequence.

Every transition must be correlated to an explicit join, channel, endpoint, or other validated server-change sequence. Server-meshing or local-route subsystem messages that do not identify the local player's authoritative connection are insufficient by themselves. The interface shall show `unknown`, `transitioning`, or `disconnected` when a current server cannot be established rather than retaining a stale endpoint as current.

The currently expected player-facing server-selection regions are `US`, `EU`, `AUS`, and `ASIA`, based on owner product knowledge. Internal shard labels may expose more specific deployment segments—for example, the reviewed sample contains a `use1b`-shaped segment that is consistent with `US`—but this mapping is not yet validated as a stable CIG contract.

Region normalization shall therefore:

- Preserve the complete observed shard label and raw region/deployment segment.
- Resolve raw segments through a versioned mapping associated with compatible game builds/profiles.
- Represent the friendly region separately from datacenter, deployment cell, shard, and server endpoint.
- Allow future and unknown region values without parser failure.
- Use `unknown` or reduced confidence when the mapping is absent, conflicting, or inferred only from naming convention.
- Never rewrite historical records merely because a later build changes the mapping.

### 8.3 Live party status — Settled

AstraDock Local shall maintain a near-real-time, evidence-backed view of the local player's party.

The current snapshot should answer, when observable:

- Whether the local player is in a party.
- Which handles are confirmed or possibly current members.
- Who just joined, connected, disconnected, left, or was removed.
- When the party was created, launched, joined, left, or disbanded.
- Who is party leader.
- Which facts are confirmed, inferred, stale, or unknown.

Candidate canonical events include:

```text
PartyCreated
PartyJoined
PartyLaunchInitiated
PartyMemberJoined
PartyMemberConnected
PartyMemberDisconnected
PartyMemberLeft
PartyMemberRemoved
PartyLeaderChanged
PartyLeft
PartyDisbanded
PartyMarkerObserved
PartyMarkerRemoved
```

The state model shall address:

- Monitoring that begins while already in a party.
- Reconnects and duplicate notification lifecycle records.
- Missing terminal events and stale-member expiration.
- Per-member membership versus connection state.
- Party-marker evidence that lacks a proven handle mapping.
- Session boundaries and application restarts.
- Local persistence/replay reconstruction.

Current 4.9 LIVE evidence directly supports party creation, party launch, and a named member connection. Marker identifiers and tracked entity IDs are observable, but marker count is not yet an authoritative membership count and marker activity alone must not add or remove a named member.

Party membership is sensitive social telemetry. The live roster remains local by default. Station synchronization, history, or retention involving other players' handles or stable identifiers requires an explicit purpose, consent, minimization, and deletion policy.

### 8.4 Mission lifecycle and alerts — Provisional MVP target

The Runtime Monitor should surface mission alerts and maintain a current mission projection when direct evidence supports events such as:

- Mission offered or shared with the local player.
- Mission accepted.
- Mission shared by the local player or with party members.
- Objective added, changed, completed, or failed.
- Mission completed, failed, abandoned, withdrawn, or expired.

Generic HUD notifications that merely carry a `MissionId`, mission-service initialization, mission-giver asset errors, and tutorial-loading steps are not proof of a mission lifecycle event. Each event family requires annotated action/outcome fixtures and negative tests before activation. Alerts must deduplicate notification UI lifecycle echoes such as add, next, fade, and remove.

### 8.5 Location and zone state — Candidate

Current evidence supports promising events for:

- Jurisdiction entered.
- Monitored space entered.
- Armistice zone entered or left.
- Loaded world/location context.

Loaded object-container context is not automatically proof that the player visited or occupied a location. Direct player/zone evidence is preferred.

The MVP shall make a best effort to maintain a `LocationSnapshot` using only validated, player-relevant evidence. Current evidence supports last-confirmed jurisdiction, monitored-space state, and armistice entry/exit. Exact position, map marker, destination, or travel route must remain unknown unless a dedicated source record or deterministically validated local-player sequence exposes it.

Location extraction follows an evidence allowlist. Object-container streaming, entity loading, ship navigation belonging to unproven entities, and nearby location-name errors shall not change current player location. Candidate patterns enter the allowlist only after annotated positive/negative fixtures demonstrate acceptable reliability, and shall be removed or disabled for affected builds when testing shows they are unreliable.

### 8.5.1 Current destination — Provisional MVP target

If setting or changing a destination in the game produces direct, repeatable log evidence attributable to the local player, the Runtime Monitor should maintain a `DestinationSnapshot` and emit destination-set, destination-changed, destination-cleared, travel-started, arrival, cancellation, and failure events as individually supported.

Destination state shall include the raw observed destination identity/name, display label when safely resolved, observation time, environment/build, provenance, confidence, and freshness. It shall clear or become unknown on explicit cancellation, arrival, incompatible session/environment transition, or bounded stale-state policy.

No destination shall be inferred from loaded object containers, arbitrary place names, another ship's quantum-navigation record, or temporal proximity alone. Until annotated destination-setting and travel samples prove a pattern, the instrument surface displays destination as unavailable/unknown rather than guessing.

### 8.6 Inventory, equipment, and cargo — Candidate

Current evidence exposes inventory requests, moves, stores, equipment/attachment state, item classes, source/target inventory identifiers, completion outcomes, and cargo-platform state.

The design must distinguish startup hydration and streamed-world activity from deliberate user actions. Inventory movement is not proof of a commercial trade without price, currency, commodity, and transaction evidence.

### 8.7 Desired event families requiring more evidence — Candidate

Capture and evaluate fresh annotated evidence for:

- Kill and death, including player/NPC/environment classification.
- Ship retrieval, spawn, ownership, boarding, seat entry, flight, landing, storage, and destruction.
- Quantum spool, calibration, engage, arrival, cancel, interdiction, and failure.
- Jump-point and jump-tunnel lifecycle.
- Trade, cargo transfer, purchase, sale, currency, and transaction outcomes.
- Login/logout variants beyond the currently observed lifecycle.
- Organization and friend presence updates.
- Server latency or other defensible connection-quality metrics.
- Global, party, direct, and ship chat.
- Player population or roster state.

Subsystem initialization, configuration pings, actor instance counts, ship-class mentions, and generic notifications are insufficient evidence for these facts.

### 8.8 Additional diagnostic telemetry — Candidate

Potential local diagnostic features include:

- Loading-performance summaries.
- Network and service failure categories.
- Parser/profile compatibility and unknown-event counts.
- Hardware/runtime metadata with explicit privacy controls.
- Client-health snapshots under bounded sampling.

Hardware inventory and device IDs are sensitive fingerprinting data and are local-only by default.

### 8.9 Station shared situational awareness — Explicitly post-MVP

A future Station experience may present selected, normalized local telemetry to authorized organization members who keep Station visible on another screen. Candidate outcomes include:

- See consenting organization members' current environment, coarse or precise location, and travel state.
- See party membership and relevant member connection state.
- Share selected mission and objective state.
- Coordinate party readiness through an explicit ready/not-ready workflow.
- Surface a deliberately small set of high-value runtime details in purpose-built Station views.

This is not a raw-log streaming feature. AstraDock Local shall emit allowlisted canonical facts or state changes with explicit environment, subject, provenance, confidence, and expiry. Station views must not depend on patch-specific log wording.

This capability is post-MVP and requires a dedicated product/security specification covering:

- Per-user and per-data-category opt-in.
- Organization and party audience authorization.
- Exact versus coarse location sharing.
- Presence and state expiry so disconnected clients do not appear current.
- Mission-data ownership, conflicts, and authoritative source.
- Ready-state lifecycle, reset rules, and party leadership permissions.
- Environment isolation and prevention of cross-environment presence.
- Retention, audit, deletion, blocking, and abuse controls.
- Behavior when local evidence is uncertain, stale, unavailable, or contradicted.

Location, travel, mission, party, and readiness information can reveal sensitive social or tactical activity. Default sharing must be minimized, short-lived, visible to the local user, and revocable.

### 8.10 Personal history and analytics — Explicitly post-MVP

AstraDock Local shall provide this capability after MVP: a local-first analytical experience over the player's durable normalized runtime history. Its purpose is exploratory personal insight: understanding how often events occur, how activity changes over time, and which events appear related.

Candidate measures include, when supported by reliable source evidence:

- Sessions, playtime, and activity by day/week/month.
- Kills and deaths by type, environment, location, ship, party state, mission context, and time played.
- Kill/death rates and rolling averages rather than only lifetime totals.
- Shard joins, shard hops, server disconnects, reconnects, and connection duration.
- Party creation, party size, time grouped, and member join/leave activity.
- Location, jurisdiction, monitored-space, armistice, quantum, and jump travel activity.
- Mission acceptance, completion, failure, abandonment, duration, and objective progress.
- Ship usage, boarding, flight time, loss/destruction, cargo, trade, and inventory activity.
- Parser/profile coverage, unknown-event volume, and periods where expected evidence was unavailable.

The experience should support:

- Totals, averages, rates, distributions, percentiles, trends, and moving windows.
- Time-series charts, categorical comparisons, distributions, heatmaps where meaningful, and sortable/grouped tabular results.
- Filtering and grouping by time range, environment, build, session, shard/region, server connection, party/member, location, ship, mission, event type, provenance, and confidence.
- Event co-occurrence within configurable windows.
- Before/after and lead/lag exploration.
- Common event sequences and transitions.
- Drilldown from every aggregate, chart mark, or table cell to the contributing canonical events and evidence.
- Saved local queries/views and export of user-selected results.

Analytics must preserve statistical honesty:

- Correlation, temporal proximity, and sequence do not establish causation.
- Results shall expose sample size, covered time, missing/unknown periods, confidence filters, and relevant parser/profile/build changes.
- Rates shall identify their denominator, such as per hour, per session, per mission, or per shard connection.
- Duplicate events, startup hydration, partial sessions, and unsupported builds must not silently distort aggregates.
- Contract/profile migrations shall be deterministic and queryable; incompatible historical data must be labeled rather than coerced.
- Environments remain separated by default. Cross-environment comparison is explicit and visually grouped; data is never merged into an unlabeled aggregate.

Analytics are derived projections, not replacements for canonical event history. Derived aggregates should be reproducible from retained events and versioned query/metric definitions. Expensive calculations may use local incremental rollups or caches that can be rebuilt.

Personal history and saved analytical views remain local by default. Any future Station synchronization of aggregates or analyses requires separate consent and policy from live telemetry sharing.

## 9. Local persistence and replay

### 9.1 Requirements — Settled

The application shall:

- Persist normalized events and necessary state so useful telemetry survives restarts.
- Reconstruct derived state deterministically through replay.
- Preserve event/schema/profile/parser versions.
- Provide bounded retention and deletion behavior.
- Support diagnosis without requiring renderer state.
- Avoid storing unnecessary raw sensitive data.

### 9.2 Persistence decision — Settled

The MVP local store uses encrypted SQLite, main-process repository boundaries, 30-day telemetry retention, and a 250 MB soft cap. Storage architecture must support sensitive-evidence deletion, current-environment telemetry deletion, all-telemetry deletion, and reset-all-app-data semantics, although the MVP UI may initially expose only all-telemetry deletion and reset-all-app-data controls.

See [`ADR-0003`](architecture/adr-0003-mvp-local-persistence-engine-and-retention-model.md).

## 10. Rules and assertions

### 10.1 Direction — Settled

Rules consume canonical events and emit explicit derived events or actions with traceable reasons. They do not parse raw log wording directly.

### 10.2 Open decisions

- User-authored rule language and authoring experience.
- Trust, sandbox, resource, and denial-of-service boundaries.
- Versioning, migration, sharing, and validation.
- Which actions rules may trigger.

User-authored patterns/assertions should follow stable event contracts and provenance, not precede them.

## 11. Station synchronization

### 11.1 Authentication and authorization — Settled direction

AstraDock Local should authenticate to AstraDock Station, not directly to Discord. Station may continue to use Discord as an upstream registration/login identity provider, but it shall issue and validate the Local application's own standards-based credentials and authorization.

The preferred desktop flow is OpenID Connect/OAuth Authorization Code with PKCE using the user's external system browser and a protected native-app redirect. Embedded login webviews and bundled client secrets are not acceptable. A device-authorization flow may be evaluated as an accessibility/fallback option if Station supports it, but it is not the default direction.

Requirements include:

- Short-lived access tokens and a deliberately designed refresh/re-authentication lifecycle.
- Token storage through an operating-system credential facility, never renderer storage or logs.
- Exact redirect validation, transaction-bound PKCE/state/nonce handling, issuer/audience validation, and logout/revocation behavior.
- A locally visible signed-in identity, Station destination/tenant, scopes, and authorization status.
- No trust in a client-supplied role or hidden-navigation state.

Data Operations access and every privileged dataset extraction-publication action shall be authorized server-side. The Station super-admin role may be the initial authorized audience, but access should be expressed through explicit roles/permissions and token scopes rather than hard-coded usernames or Discord IDs. Hiding the workspace in the client is a usability measure, not a security boundary.

### 11.2 Durable synchronization requirements — Settled

Outbound synchronization shall be opt-in, inspectable, and mediated by a durable queue with:

- Authentication and device/tenant identity.
- Validated, versioned payload contracts.
- Batching and payload limits.
- Retry with bounded exponential backoff.
- Idempotency and deduplication.
- Offline operation and restart recovery.
- Visible queue and sync status.
- Explicit data-category consent.
- Redaction/minimization before enqueue or at a clearly defined protected boundary.
- No secrets in renderer code, telemetry, or logs.

### 11.3 Realtime collaboration transport — Post-MVP direction

Use authenticated secure WebSockets (`wss`) for low-latency, bidirectional, ephemeral collaboration such as organization presence, travel/location updates, shared party state, mission-state changes, and ready-up commands/results.

Use HTTPS request/response APIs and durable asynchronous jobs for authentication exchanges, configuration, history queries, consent changes, dataset manifests, bulk event/dataset upload, publication, deletion, and reconciliation. Large or durable data shall not be transferred as an unacknowledged WebSocket firehose.

The realtime application protocol over WebSocket shall define:

- Versioned message envelopes and event types.
- Authenticated connection establishment and permission revalidation.
- Environment-, organization-, party-, and user-scoped subscriptions/channels.
- Per-stream sequence numbers, event IDs, server timestamps, and expiry.
- Acknowledgement semantics for state-changing commands such as ready-up.
- Idempotency for retried commands and state changes.
- Heartbeats, stale-presence expiry, reconnect with bounded backoff, and resume cursors.
- Snapshot-then-delta recovery when a client misses messages.
- Payload limits, rate limits, backpressure, and abuse controls.
- Authorization checks on every subscribe, publish, and command path.
- Observable but privacy-safe connection and delivery status.

Realtime delivery is not durable truth. Station owns the authorized collaborative projection and any permitted history; Local maintains its outbound queue and reconciles after reconnect. Sensitive sharing must stop or expire promptly when consent, party/org membership, authorization, environment, or connection state changes.

Server-Sent Events may remain an implementation option for future strictly one-way feeds, but the proposed ready-up and collaborative state flows are bidirectional, making WebSocket the better primary fit. MQTT, WebTransport, and custom peer-to-peer protocols are not justified by current requirements.

### 11.4 Open decisions

- Station endpoints and API contracts.
- Authentication mechanism and credential lifecycle.
- Tenant, user, and device identity relationships.
- Retention and deletion semantics.
- Conflict and idempotency rules.
- Uploadable runtime event types and fields.
- Party/social data purpose and whether it should ever synchronize.
- Dataset publication workflow and permissions.
- Whether Station will operate its own OAuth/OIDC authorization service or broker an existing provider.
- Native-app redirect strategy by supported operating system.
- Token scopes, role/permission model, and super-admin provisioning/recovery.
- Realtime gateway deployment, message schema, scale targets, and permitted retention.

## 12. Official game-data mining

### 12.1 Requirements — Settled

The application shall:

- Detect the installed LIVE/PU build and meaningful updates.
- Run mining only through an explicit, cancellable background job.
- Scope each job to named datasets.
- Cache results by source fingerprint/build.
- Normalize output into versioned contracts with provenance.
- Validate tool output and fail with actionable errors.
- Keep tool invocation behind replaceable adapters.
- Avoid repeatedly processing `Data.p4k` without a source change or explicit request.

### 12.2 Initial tool candidates

#### StarBreaker

<https://github.com/diogotr7/StarBreaker>

StarBreaker is the leading initial candidate. Its Rust toolkit and CLI cover P4k access, DataCore query/export, CryXML, geometry/characters, DDS textures, Wwise data, and common Windows/Linux installation discovery. The CLI is the preferred initial process boundary.

#### unp4k

<https://github.com/dolkensp/unp4k>

unp4k is an established .NET suite for P4k access and extraction, including a read-only Dokan virtual filesystem on Windows. It remains a compatibility and reference option behind the same adapter boundary.

### 12.3 Open decisions

- First official datasets worth mining and publishing.
- Bring-your-own executable, managed download, or bundled distribution.
- License, release packaging, redistribution, and update implications.
- Supported tool versions and game-build compatibility.
- Process isolation, resource limits, and cancellation behavior.
- Whether a later native/library integration materially improves deployment or performance.

## 13. Security and privacy requirements

### 13.1 Local privilege boundary — Settled

- Renderer isolation must be maintained.
- Filesystem, process, and network capabilities are exposed only through narrow, validated main-process IPC.
- Secrets never enter renderer code.
- External tool paths, arguments, outputs, and exit behavior are validated.
- Network destinations and payloads are constrained by explicit contracts.

### 13.2 Sensitive data — Settled

The following are local-only by default and must not appear in fixtures or routine uploads:

- Raw log lines.
- Account, character, player, entity, node, trace, login, and session identifiers.
- Public/local IP addresses and ports.
- Local usernames, installation paths, and filesystem paths.
- Authentication tokens, subscription keys, service URLs containing identifiers, and credentials.
- Hardware/device fingerprints.
- Other players' handles, social relationships, party membership, and chat content.
- Extracted copyrighted game assets.

### 13.3 User controls — Settled direction

The specification must define understandable consent, current collection/sync status, per-category scope, retention, deletion, and failure behavior. Upload scope must be inspectable before synchronization.

## 14. Reliability and performance requirements

The MVP Runtime Monitor uses provisional numeric objectives for latency, throughput, resource use, workload shape, stale detection, data integrity, recovery, and release soak testing. The targets are strict enough to gate implementation and release review, but may be revised when representative sanitized corpus data and packaged-build measurements justify a change.

See [`ADR-0004`](architecture/adr-0004-mvp-performance-and-reliability-objectives.md).

## 15. User experience requirements

The existing proof-of-concept interface and the current AstraDock Station application are not visual or styling references. The owner-supplied design-system documents in `docs/Project vs. Design System choice.zip` are authoritative for AstraDock Local's visual and interaction direction until the owner supplies a replacement.

The future experience must nevertheless:

- Make monitoring source and status clear.
- Distinguish live, stale, disconnected, unknown, and error states.
- Present current party and session state without overstating uncertain evidence.
- Expose provenance/confidence where it affects interpretation.
- Show local persistence and synchronization status.
- Make consent, privacy scope, retention, and deletion understandable.
- Provide actionable errors and recovery paths.
- Meet applicable accessibility and keyboard/semantic interaction standards.

### 15.0 Design foundation — Settled direction

The supplied examples establish the approved interim direction: a dark-default, dense, mission-control-inspired application; instrument-like current state; Terminal/Table presentations over one live stream; stable shared drilldown with locally configurable right/bottom docks; restrained motion; semantic tokens; and production-grade responsive/accessibility behavior.

Detailed artifact authority, visual foundations, interaction rules, settled tokens, open design work, reuse restrictions, and implementation guardrails are maintained in [`interim-design-foundation.md`](interim-design-foundation.md). Within the supplied archive, `DECISIONS.md` overrides conflicting specimens and `tokens/astradock.css` is the code contract. `AstraDock Interactions.dc.html` remains unfinished and `AstraDock Dashboard.dc.html` remains substantially unfinished; unspecified behavior must not be inferred. This PRD remains authoritative for product behavior and MVP scope.

Mock features and telemetry in design specimens do not expand scope or prove data availability. The design documents are authoritative for design direction rather than production source, and their shadcn/ui mapping does not settle the application framework.

### 15.1 Primary product workspaces — Settled direction

AstraDock Local has three distinct long-term workflows and corresponding workspaces. Runtime Monitor and Data Operations correspond to the two source data planes; History & Analytics derives local insight from persisted runtime events. Final user-facing names remain open.

#### Runtime Monitor

The Runtime Monitor is a live, second-screen experience intended for use while the player is actively playing Star Citizen. It monitors `game.log`, maintains current gameplay/session projections, and surfaces timely information such as environment, session, shard/server connection, party state, critical events, and relevant warnings.

The Runtime Monitor shall be the default workspace when AstraDock Local starts or opens its primary window. Authentication state or Data Operations authorization shall not redirect an ordinary player away from this default. Locally stored navigation preferences may be considered later, but the product default remains Runtime Monitor.

Its design shall prioritize:

- Immediate legibility on a secondary monitor.
- Low interaction cost while the game has primary attention.
- Near-real-time updates and unmistakable freshness/connection state.
- User-configurable emphasis and filtering for critical information.
- Both Terminal and Table presentations with shared drilldown.
- Bounded CPU, memory, disk, and GPU impact while the game is running.

#### Data Operations

Data Operations is post-MVP. The future workspace controls the official installed-data plane and its publication workflow. It shall allow the user to:

- Inspect detected installations, environment/channel, build, and source fingerprints.
- Choose explicitly which named datasets to extract.
- Configure the approved extraction-tool adapter and executable source/path.
- Start, cancel, retry, and inspect extraction and processing jobs.
- See progress, phase, throughput, resource use, warnings, errors, and outcomes.
- Inspect generated dataset identity, schema/version, provenance, validation status, size, and change summary.
- Choose explicitly which completed datasets are eligible to synchronize to Station.
- Review destination, scope, payload/record counts, and privacy/licensing implications before publication.
- Start, cancel where safe, retry, and inspect Station synchronization jobs and queue state.
- Review historical extraction, processing, validation, and synchronization runs.

Data Operations is a control plane for deliberate, potentially expensive background work. Detecting a new build may create a local availability/update notification, but shall not automatically mine or publish broad datasets without the configured user authorization and scope.

#### History & Analytics

History & Analytics is the explicitly post-MVP exploratory personal-data workspace described in Section 8.10. It supports charts, graphs, tables, metric cards, correlation/sequence exploration, and drilldown into contributing events.

The final presentation remains open. It may be a dedicated top-level view/tab, a large half/full-screen drawer reachable from Runtime Monitor, or a combination: a full workspace for deep exploration plus contextual analytics drawers for quick pivots from a live event, party, shard, session, or metric. The design system and workflow testing should determine the navigation model without reducing analytical depth.

Runtime Monitor remains the default startup workspace regardless of the eventual analytics presentation.

#### Shared activity and drilldown experience

Runtime Monitor and Data Operations may reuse the same event-stream, Terminal/Table, selection, and drilldown component system. Data Operations uses it to inspect operational records from extraction, transformation, validation, queue, and synchronization jobs. History & Analytics reuses the same immutable event identities and detail experience when users drill from an aggregate to its contributing records.

Component reuse must not conflate the underlying domains:

- Runtime events describe observed or inferred game/session activity.
- Operational events describe AstraDock jobs, stages, progress, diagnostics, and outcomes.
- Extracted records describe official installed game definitions.

Each domain retains its own canonical contracts, filters, retention, sensitivity, environment partition, and Station policy. A workspace supplies an explicit stream query/scope to the shared component; operational job logs do not appear as gameplay telemetry unless a user deliberately selects a combined diagnostic view.

### 15.2 Central live event stream — Settled

The primary runtime experience shall center on an actively updating, vertically scrolling stream of captured canonical events. Users can switch between two presentations of the same underlying query, ordering, filters, and event identities:

1. **Terminal view.** A polished TUI-inspired presentation resembling a carefully formatted live `tail`. It should be dense, fast to scan, visually structured, and keyboard-friendly. Selecting a line opens the shared event drilldown, by default in a right-side drawer. It displays normalized AstraDock events rather than implying that every row is a raw log line. Raw evidence, when retained and permitted, belongs in drilldown context.
2. **Table view.** A more structured and styled event table with explicit columns, row selection, sorting/filter affordances where appropriate, and the same event drilldown, by default in a bottom drawer.

Switching views shall not restart monitoring, create a second subscription, change the active environment/session, lose scroll/query context unnecessarily, or duplicate events. Both views consume the same canonical event-stream projection.

### 15.3 Live-follow and browsing behavior — Settled direction

- New events append continuously while live follow is enabled.
- The experience shall make live-follow, paused/browsing, stale, disconnected, and historical/replay modes visually unambiguous.
- If the user scrolls away from the live edge, the application should preserve their reading position and expose an unseen-event count plus a clear return-to-live action.
- Rendering shall remain bounded and responsive through virtualization or an equivalent strategy; an indefinitely growing DOM is not acceptable.
- Event ordering shall be deterministic when source timestamps collide or late events arrive.
- Current environment and session context shall remain prominent in both views.

### 15.4 Event selection and shared drilldown — Settled

Selecting a table row or terminal line shall open the same details experience for that event while ingestion and visible live updates continue. The default presentation differs by view:

- Table view opens the details drawer from the bottom.
- Terminal view opens the details drawer from the right side.

Users shall be able to override drawer placement at any time through visible on-screen controls. The selected placement shall be stored only on the local machine for now. It is a presentation preference, is not Station telemetry, and shall not be synchronized. The precise preference scope—global, per view, or per workspace—remains to be finalized with the interaction design, but behavior must be deterministic and resettable.

The drawer is anchored to the immutable event ID, not the row or line's current visual index, so new events, filtering, virtualization, retention, or reordering cannot silently change the selected subject. Terminal and table views use the same drilldown data contract, content rules, privacy treatment, actions, and loading/error states; drawer placement must not create divergent detail features.

The drawer should present, as applicable:

- Human-readable event summary and canonical event type.
- Source and ingestion timestamps.
- Environment, build, shard, server-connection, and session context.
- Structured payload fields.
- Provenance and confidence.
- Correlation and identity references with privacy-aware display.
- Parser and extraction-profile versions.
- Contributing/related events and derivation reasons.
- Sanitized raw evidence or diagnostic context when locally retained and authorized.
- Persistence, retention, and Station synchronization status.

The selected event remains inspectable even as it scrolls out of the virtualized terminal or table viewport. If retention removes its backing data while the drawer is open, the interface must explain that state rather than showing a different event or failing silently.

### 15.5 Shared stream controls — Candidate pending workflow design

Terminal and table views should likely share environment-scoped controls for event-type filters, session/time range, party/member, shard/server, provenance, confidence, diagnostic visibility, search, live/historical mode, and export. Drawer placement is confirmed as a locally persisted preference. Exact scope and persistence behavior for other preferences, along with remaining controls, defaults, and URL/navigation state, await the design system and workflow specification.

### 15.6 MVP at-a-glance live context — Settled direction

The rolling event stream answers “what just happened.” The Runtime Monitor shall also maintain stable, glanceable current-state surfaces that answer “what is true now” without requiring the player to stop, search the tail, open a game debug overlay, or enter a map solely for known context.

Based on current 4.9 LIVE evidence, the MVP should prioritize:

| Live information | Player value | Evidence/status |
| --- | --- | --- |
| Environment and build | Prevent confusion about LIVE/PTU/EPTU/HOTFIX and verify the active patch | Direct, high confidence |
| Monitoring/source health | Know whether AstraDock is live, stale, paused, recovering, or reading the wrong/rotated source | Application-authoritative |
| Game lifecycle | See launching, authenticating, frontend, matchmaking, loading, in-game, disconnected, or exiting | Direct/contextual, high confidence |
| Current shard and region | Quickly identify the shard and friendly region without debug output | Direct shard label; region mapping versioned |
| Server connection | See connecting/connected/disconnected, observed endpoint, connection age, and last disconnect cause | Direct, high confidence; endpoint belongs in optional detail |
| Session timing | Current app/PU connection duration and important transition times | Direct/derived from timestamps |
| Party state | See whether party state is known, confirmed members, recent member connections, and uncertainty | Direct for creation/launch/named connection; incomplete lifecycle evidence |
| Jurisdiction and zone status | See latest confirmed jurisdiction, monitored-space state, and armistice entry/exit | Direct notification evidence, high/medium confidence |
| Critical warnings | Surface disconnects, failed joins, long loading waits, parser/profile mismatch, and monitoring failure | Direct/application-authoritative |

The design should distinguish primary play-relevant state from expandable diagnostic detail. Account/character IDs, node/session IDs, server endpoint, database versions, parser/profile versions, and raw evidence may be useful for troubleshooting but should not dominate the second-screen default.

Current evidence does not justify presenting exact player position, route destination, shard population, player roster, server latency/FPS, current ship ownership/occupancy, mission objective state, quantum phase, jump-tunnel phase, kills, or deaths as reliable live state. These may be added to MVP only if fresh annotated fixtures establish dependable patterns without delaying the coherent release; otherwise they remain later evidence-driven additions.

Potential presentation regions, pending the design system, are:

- A persistent environment/source/status header.
- Compact current-state cards or a status rail for shard/connection, party, jurisdiction/zone, and session time.
- A prioritized warning/attention area that appears only when actionable.
- The central rolling Terminal/Table event stream.
- Shared event drilldown drawers for detail and evidence.

State surfaces must show freshness and uncertainty. When a terminal event is missing or monitoring begins mid-session, the interface shall display `unknown` or `stale` rather than carrying an old value forward as current truth.

### 15.7 Instrument-cluster interaction model — Settled

The Runtime Monitor's persistent current-state region should behave like a vehicle instrument cluster: stable, continuously updated, glanceable, and optimized for information needed during active play. It complements rather than replaces the rolling event stream.

The cluster shall prioritize:

- Current environment and build.
- Current logical shard and friendly region.
- Current observed server connection and connection/transition state.
- Current or last-confirmed player location context at the strongest supported precision.
- Current destination/travel state when direct evidence exists.
- Current party status and confirmed members.
- Current mission state when direct evidence exists.
- Session/connection duration and monitor freshness.
- Active critical warnings requiring attention.

Party and Mission shall have dedicated live sections rather than being represented only as generic status instruments:

- **Party section:** current known party state, confirmed/possible members, connection or membership state per member, leader when known, recent join/leave/connect/disconnect activity, freshness, and uncertainty. It should support quick member-focused drilldown without exposing sensitive identifiers by default.
- **Mission section:** current known active/shared/offered missions and their latest confirmed lifecycle/objective state, plus high-priority share/accept/abandon/complete/fail alerts when supported. It shall clearly distinguish an empty confirmed mission set from unavailable/unsupported mission evidence.

The final layout may make these persistent panels, expandable regions, or responsive sections based on available screen size. Their domain identity and drilldown behavior must remain distinct even if the design system combines them visually with the instrument cluster.

Every instrument is a materialized current-state projection with:

```text
value
state                  // known, unknown, transitioning, stale, disconnected, unsupported
environmentKey
sourceTimestamp
lastUpdatedAt
freshness
provenance
confidence
supportingEventIds
```

Instrument changes produce canonical transition events that also appear in the Terminal/Table stream. Selecting an instrument may filter or focus the stream and open the same shared drilldown used by event rows/lines, subject to final interaction design.

Party, mission, destination, location, shard, and server alerts shall be driven by validated state transitions, not every matching physical log line. Alerts need priority, deduplication, expiry/acknowledgement behavior, and a path to supporting evidence.

The instrument cluster shall degrade honestly. Unsupported signals are hidden or labeled unavailable; uncertain or stale signals are visually distinct from confirmed current state. A friendly label or icon must never conceal an inferred value's confidence or age when that distinction matters.

### 15.8 Telemetry promotion and removal policy — Settled

MVP pattern development may make a best-effort attempt to recognize useful player state, but a candidate signal is promoted to an enabled instrument or alert only after:

- The intended in-game action and outcome are timestamp-annotated.
- Representative positive fixtures match.
- Similar unrelated negative fixtures do not match.
- Local-player attribution is demonstrated where required.
- State start, update, clear, session-boundary, and stale behavior are defined.
- Deduplication and multi-line behavior are tested.
- Supported environment/build/profile scope is explicit.
- Privacy and drilldown evidence handling are defined.

If later testing or a game patch makes the signal unreliable, the affected extraction profile shall disable or downgrade it. The UI then reports unsupported/unknown rather than continuing to emit questionable facts. Historical events retain their original profile version and confidence for auditability.

## 16. Supported platforms and packaging

The approved v0.1.0 platform, artifact, lifecycle, validation, and update contract is defined by [`ADR-0002`](architecture/adr-0002-mvp-platform-packaging-and-update-policy.md).

- Windows is primary. Windows 10 22H2 x64 and supported Windows 11 x64 releases are supported. Windows 10 support must be revisited if it restricts security, supported Electron/Chromium upgrades, or product functionality.
- Windows ships one per-user NSIS installer without administrator privileges. No Windows portable artifact ships.
- Linux x86_64 support follows the explicit LUG-aligned distribution matrix in ADR-0002 and initially ships one AppImage rather than distribution-native packages.
- GitHub Releases is the expected v0.1.0 publication and update origin.
- Updates are checked and downloaded automatically, verified, and installed silently on the next normal application restart. AstraDock never force-restarts during active monitoring.
- Very limited prerelease alpha builds may temporarily be unsigned with explicit warnings. Signed and timestamped Windows artifacts are required before v0.1.0 is complete under [issue #50](https://github.com/Presstronic/astradock-local/issues/50).
- Upgrades preserve application data. Downgrades are best effort and must fail safely rather than corrupting or silently discarding newer data.
- Windows uninstall prompts to retain or delete local application data, with retention as the safe default. Linux program removal and XDG application-data deletion remain separate explicit actions.

## 17. Evidence and validation strategy

### 17.1 Sanitized corpus — Settled

Maintain small, representative, sanitized fixtures organized by Star Citizen channel/build and known action. Never commit real player logs or destructive over-sanitization that removes correlation structure.

Each capture should record privately:

- Wall-clock action time.
- What the player did.
- Expected target/entity.
- Observed outcome.
- Game channel/build.

Then produce minimal sanitized snippets for the repository.

### 17.2 Priority captures

- Party join, invite, accept, connect, disconnect, reconnect, leave, kick, leader change, disband, and mid-party monitor startup.
- Player/NPC/environment kills and deaths.
- Ship lifecycle and occupancy actions.
- Quantum and jump-tunnel lifecycle.
- Mission lifecycle.
- Trade and cargo transactions.
- Chat channels.
- Friend/organization presence.
- Population/roster changes if exposed.
- Normal PU exit, server error, network loss, crash, and shard/server transition.
- Repeat representative actions after a LIVE patch to measure format drift.

### 17.3 Pattern acceptance — Settled direction

Each extraction pattern should document:

- Supported profiles/builds.
- Positive and negative fixtures.
- Required and optional fields.
- Multi-line/context requirements.
- Confidence and provenance.
- Deduplication key.
- Sensitive fields and redaction.
- Expected canonical event.
- Known false positives and limitations.

## 18. Current evidence summary

The reviewed 4.9 LIVE/PUB sample supports a first telemetry spine:

```text
Client/build observed
  -> authentication and local identity
  -> frontend ready
  -> party creation/launch (when applicable)
  -> PU matchmaking with shard and server endpoint
  -> network connection and successful game entry
  -> party member connection and party markers
  -> jurisdiction/zone and inventory observations
  -> disconnect and frontend return
  -> clean application exit
```

Detailed sanitized findings and evidence gaps are maintained in [`game-log-pattern-analysis-2026-08-09.md`](game-log-pattern-analysis-2026-08-09.md).

## 19. Current proof-of-concept state

The repository currently contains a small CommonJS Electron proof of concept using vanilla HTML, CSS, and JavaScript:

- `src/main.js`: Electron lifecycle, file selection, filesystem watching, parsing IPC, folder opening, and optional HTTP JSON enrichment.
- `src/preload.js`: narrow `window.astradock` renderer bridge.
- `src/logParser.js`: common path discovery, whole-file parsing, heuristic shard recognition, `<Join PU>` sessions, and local-user filtering.
- `src/renderer/`: temporary dashboard and controls.
- `test/logParser.test.js`: basic shard parsing and deduplication coverage.

The watcher reparses the entire file after `fs.watch` notifications. Existing shard regexes expect optimistic legacy fields. This code is capability evidence, not an architecture or interface to preserve. Most or all may be replaced when implementation is authorized.

### 19.1 Prototype retention and replacement policy — Settled

Implementation planning shall begin from the required product and system boundaries, not from a presumption that the proof of concept must be evolved in place. A greenfield application foundation is acceptable and may be preferable.

Existing code is retained only when review demonstrates that it:

- Implements an approved requirement or provides reusable evidence/fixtures.
- Fits the intended process, privilege, data-contract, and module boundaries.
- Meets security, privacy, correctness, performance, accessibility, and operational requirements.
- Has or can receive proportionate deterministic tests without preserving harmful coupling.
- Is clearer and lower-risk to adapt than to replace.
- Does not force prototype UI, whole-file rescanning, renderer-owned state, permissive IPC, hard-coded patch vocabulary, or other rejected shortcuts into the new design.

Code that fails those criteria shall be replaced or removed. Replacement is not justified merely for stylistic novelty, and retention is not justified merely to minimize the diff. Useful fixtures, discovered paths, behavioral knowledge, and tests may survive even when their original implementation does not.

Before implementation, the technical specification or architecture decision records shall document the chosen application foundation, evaluated alternatives, migration/salvage plan, security boundaries, data ownership, and verification strategy.

The production application foundation, process and trust boundaries, strict TypeScript policy, prototype disposition, and migration sequence are established by [`architecture/adr-0001-production-application-foundation.md`](architecture/adr-0001-production-application-foundation.md).

Run the existing prototype with:

```bash
npm install
npm start
```

Run current tests with:

```bash
npm test
```

## 20. Architecture direction

The application-stack and process-architecture decision is recorded in [`ADR-0001`](architecture/adr-0001-production-application-foundation.md). The flow below remains the product-level architecture direction; ADR-0001 defines how the MVP application hosts and isolates it.

The following boundaries are settled directions, while technology choices remain open:

```text
Source discovery
  -> resilient tailer
  -> framing/profile detection
  -> deterministic extraction
  -> canonical event validation
  -> local event store
  -> state projections and rule engine
  -> renderer-facing query/subscription boundary
  -> consent/redaction boundary
  -> durable Station sync queue

Installed build detection
  -> mining job coordinator
  -> external-tool adapter
  -> normalized official-data contracts
  -> fingerprinted local cache
  -> approved dataset publication queue
```

Runtime parsing, rules, persistence, and synchronization must not depend on renderer state. Runtime and official-data contracts remain separate even when correlated.

## 21. Open product and technical decisions

1. Primary persona and single indispensable first-release workflow.
2. MVP, Phase 1, and Phase 2 scope and explicit non-goals.
3. Initial canonical event set beyond the proven telemetry spine.
4. Party-history retention and whether social data may ever synchronize.
5. Rule/assertion authoring model and sandbox.
6. Station API, authentication, device identity, schemas, and retention.
7. First official datasets to mine and publish.
8. Extraction-tool distribution and update model.
9. Packaging implementation details not settled by [`ADR-0002`](architecture/adr-0002-mvp-platform-packaging-and-update-policy.md), including exact tool versions and CI integration.
10. Product analytics and diagnostics policy.
11. Design-system delivery and future UI information architecture.

## 22. Risks and mitigations

| Risk | Impact | Direction |
| --- | --- | --- |
| CIG changes log formats between builds | Silent loss or incorrect events | Versioned profiles, fixtures, unknown capture, confidence, compatibility status |
| Attractive but ambiguous log lines | False gameplay facts | Evidence requirements, contextual state, negative fixtures, provenance |
| Sensitive data leakage | Player privacy/security harm | Local-first defaults, minimization, consent, redaction, narrow IPC |
| Duplicate filesystem/log lifecycle records | Incorrect counts and state | Event-family deduplication and idempotent projections |
| Missing start/end evidence | Stale or invented state | Explicit `unknown`, expiry policy, session boundaries, replay |
| Station/network unavailable | Lost or blocked telemetry | Durable local queue, offline operation, retry/backoff |
| Large-asset mining exhausts resources | Poor system/game performance | Explicit jobs, scoping, caching, limits, cancellation |
| External tool/license change | Integration or distribution failure | Adapter boundary, license review, configurable executable path |
| Prototype constrains product design | Long-term architecture debt | Treat existing code and UI as disposable evidence |

## 23. Backlog translation requirements

After this PRD is coherent enough to phase, create a reviewable issue backlog organized into MVP, Phase 1, and Phase 2. Every issue must:

- Be independently understandable and actionable.
- Identify its phase and user value.
- State dependencies and explicit non-goals.
- Include verifiable acceptance criteria.
- Address security/privacy/performance where applicable.
- Be small enough to review without fragmenting work into meaningless chores.

Research spikes are appropriate where evidence, external contracts, licensing, or technical feasibility remains genuinely unknown.

## 24. Requirements-gathering next steps

1. Define primary user/persona and the indispensable first-release workflow.
2. Inventory what Station already owns and define offline expectations.
3. Review and name the first canonical event contracts.
4. Capture fresh annotated fixtures, beginning with party lifecycle and combat/session events.
5. Specify Station contracts.
6. Justify MVP/Phase 1/Phase 2 boundaries.
7. Translate the approved specification into the issue backlog.

Do not begin rebuilding the application until the owner explicitly authorizes implementation.

## Appendix A. Research references

These sources informed early feasibility work. Public log examples may predate the current game build and are research inputs, not current truth.

### Star Citizen log evidence and related tools

- Public `game.log` sample dated 2025-07-19: <https://pastebin.com/p4ii24JT>
- Star Citizen log-monitor example: <https://gist.github.com/KelSolaar/83373288538a6ad3ec24985c1bcb230d>
- Support-derived log notes: <https://sites.google.com/view/sessioncouncil>
- Gunhead Connect: <https://gunhead.space/connect-app>
- Schaulers shard-detection guide: <https://schaulers.space/guide>

### Parsing and normalization approaches

- Elastic Grok: <https://www.elastic.co/docs/solutions/observability/logs/streams/management/extract/grok>
- JSONPath Plus: <https://www.npmjs.com/package/jsonpath-plus>
- JMESPath: <https://jmespath.org/>
- JSONata: <https://jsonata.org/>
- Vector Remap Language: <https://github.com/vectordotdev/vrl>
- Drain/LogPAI: <https://github.com/logpai/logparser>

The current recommendation is to investigate Grok-style named patterns for text records, JSONPath or JMESPath for JSON-like payloads, and Drain/LogPAI later for corpus-driven template discovery. This is a direction for evaluation, not a settled library selection.

### Identity and realtime transport standards

- OAuth 2.0 for Native Apps (RFC 8252): <https://www.rfc-editor.org/info/rfc8252/>
- OAuth 2.0 Security Best Current Practice (RFC 9700): <https://www.rfc-editor.org/rfc/rfc9700.html>
- OpenID Connect Core 1.0: <https://openid.net/specs/openid-connect-core-1_0.html>
- The WebSocket Protocol (RFC 6455): <https://www.rfc-editor.org/info/rfc6455/>
