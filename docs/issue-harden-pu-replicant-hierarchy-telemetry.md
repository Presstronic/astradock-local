# Technical Story: Harden PU Replicant, hierarchy, and party telemetry contracts

## Target phase

MVP. This reduces semantic risk in the existing runtime telemetry spine and turns the owner's reviewed 4.9 LIVE capture into sanitized regression evidence.

## Context and problem statement

The parser previously named `<Channel Connection Complete>` as a game-server connection and exposed its opaque `node_id` as a generic node. The reviewed session instead reports `hostType="Replicant"`; the log does not prove that the endpoint or node is a DGS identity. The same session also provides bounded, direct evidence for a network-received universe hierarchy, PU territory initialization, and a local voluntary party leave. Generic words such as `Server Rerouted`, `NOT AUTH`, marker streaming, and frontend hierarchy setup remain unsafe proxies for mesh reassignment, authority transfer, or party membership.

The four private logs are cumulative checkpoints from one owner-led capture session spanning two technical game-log generations. The raw logs remain ignored and must not be committed.

## Technical story

As the runtime telemetry and projection maintainers, we need fixture-backed Replicant, hierarchy, territory, and party-leave contracts with conservative naming and negative guards, so that AstraDock reports what the client directly observed without inventing DGS identity, dynamic-mesh handoffs, hierarchy topology, or social state.

## Intended outcome

- The transport observation is named `PuReplicationConnectionEstablished` and explicitly records `hostType: Replicant`.
- Its opaque connection value is `observedNodeId`, not an asserted server, DGS, hierarchy, or EntityGraph node.
- Completed network hierarchy registration and PU `SC_Default` territory setup produce bounded diagnostic events.
- A local `PartyLeft` event requires the leaving player GEID to match the observed local identity.
- Frontend hierarchy setup, incomplete hierarchy pairs, quantum routing, generic authority text, marker removal, and non-local group leaves do not produce stronger semantic events.

## In scope

- Update the canonical runtime-event registry, declarations, parser profile, orchestrator policies, correlation identifiers, lifecycle projection, renderer-safe DTO, and stream labeling.
- Add sanitized positive and negative fixtures derived from the reviewed session.
- Promote explicit local voluntary leave and update the party projection and evidence matrix.
- Document the server-meshing and node/hierarchy vocabulary boundary that guides future contracts.
- Preserve generation resets across log deletion, truncation, or replacement.

## Explicit non-goals

- Detecting a DGS, DGS reassignment, server-authority transfer, static-cell boundary, quasi-dynamic reassignment, or dynamic-meshing decision.
- Materializing the universe hierarchy's individual nodes or edges.
- Treating quantum `Server Rerouted`, `NOT AUTH`, `Lost authority`, object-container, territory, or marker vocabulary as proof of a mesh handoff.
- Uploading raw logs or stable identifiers to Station.
- Rebuilding the monitoring UI or implementing durable persistence in this story.

## Dependencies and blockers

- Depends on the existing `runtime-event/v1` contract, streaming parser, orchestration, and projection boundaries.
- The current CIG log format is not a public stable API; extraction remains profile-versioned and build-sensitive.
- Remote issue and pull-request publication require working GitHub connector/CLI authentication.

## Assumptions, constraints, and risks

- `hostType="Replicant"` identifies the observed transport role but does not identify the backing DGS.
- `node_id` is intentionally opaque. Its namespace and stability are unknown.
- `RegisterUniverseHierarchy` describes client hierarchy registration; node count and duration do not reveal topology or authority ownership.
- The explicit leave line is local only after correlation with the current local `playerGeid`.
- Raw private samples remain excluded by `*.log`; only small sanitized fixtures are reviewable source.
- Future builds may rename or reorder records, so missing evidence degrades to unknown rather than a guessed state.

## User acceptance criteria

1. A reviewed Replicant channel-complete record emits a valid `PuReplicationConnectionEstablished` containing endpoint, port, `observedNodeId`, player GEID, gamerules, and `hostType: Replicant`.
2. The application labels this as a PU replication connection and does not present it as a proven game server or DGS.
3. A completed `bNetRecvd="1"` hierarchy begin/end pair emits one `UniverseHierarchyRegistered` with node count and non-negative elapsed milliseconds.
4. A finished `SetupTerritories` task for `SC_Default` emits one `PuTerritorySetupCompleted`.
5. A `<Leave group>` record emits `PartyLeft` only when its client GEID matches the observed local identity; projection then becomes `not_in_party`.
6. Frontend/incomplete hierarchy records, non-Replicant channel records, marker removal, mesh-like vocabulary, and non-local leave records do not emit the promoted events.
7. Log generation changes clear incomplete hierarchy and connection correlation state.
8. Full private logs and their sensitive identifiers are absent from the tracked diff.

## Information architecture and behavior

The existing connection instrument remains a compact state summary, relabeled **PU replication connection**. Its optional diagnostic drilldown may show the redacted Replicant endpoint and port. Full endpoint, player GEID, and observed node ID remain privileged/local data; the renderer receives redacted values under the existing policy. Unknown, transitioning, connected, disconnected, stale, and unsupported states retain their established accessibility and freshness semantics. Hierarchy count/timing and territory completion are diagnostic telemetry, not new primary dashboard claims; any future visual treatment requires a separate design deliverable.

## Technology and libraries

None. The change uses the existing CommonJS runtime, TypeScript declarations, deterministic contract validators, profile dispatcher, projections, and Node/Vitest test suites.

## Happy-path verification

1. Replay the sanitized PU join fixture and assert one Replicant connection event with the renamed payload and correlation domain.
2. Replay the hierarchy/territory fixture contiguously and with arbitrary chunk boundaries; assert stable event IDs and the expected `9,147 ms` hierarchy duration.
3. Replay the explicit-leave fixture after identity observation; assert one `PartyLeft` and a `not_in_party` projection.
4. Run type checking, Node tests, renderer tests, and the renderer production build.

## Unhappy-path verification

1. Replay frontend `bNetRecvd="0"` hierarchy/territory records and an incomplete network hierarchy; assert no PU hierarchy or territory diagnostic.
2. Replay quantum reroute and generic authority vocabulary; assert no DGS or authority-transfer event.
3. Replay party marker removal without an explicit leave; assert no party terminal transition.
4. Replay a leave for a different or unknown player GEID; assert no local `PartyLeft`.
5. Split records across chunks and reset the source generation between hierarchy begin/end; assert no cross-generation correlation.
6. Run the fixture privacy scanner and reject raw identifiers, paths, IPs, credentials, or full-log excerpts.

## Definition of Done

- Contracts, declarations, extraction profiles, orchestration, projections, renderer-safe labeling, and documentation agree on the new terminology.
- Positive, negative, framing, identity-attribution, and projection tests cover the new behavior.
- Profile version is advanced for the semantic change.
- `npm test`, `npm run build:renderer`, and `git diff --check` pass.
- Security/privacy review confirms no private sample log is tracked and no raw line is copied into canonical events.
- Performance remains bounded: literal dispatch precedes extraction, hierarchy state is constant-size, and no hierarchy graph is retained.
- Compatibility and limitations are documented, including the intentional lack of DGS/handoff detection.
- The change is committed on a dedicated branch and presented as a reviewable draft PR; it is not merged without owner permission.
