# Star Citizen `Game.log` Pattern Analysis — 2026-08-09

## Purpose and scope

This document records an evidence-based review of the owner's current Star Citizen `Game.log` for telemetry that AstraDock Local could recognize incrementally. It is a planning artifact, not an extraction-profile implementation or a promise that a pattern will survive future game builds.

The reviewed file contains 4,853 lines spanning about 1 hour 52 minutes. It identifies itself as a LIVE/PUB, 64-bit client from the Star Citizen 4.9 line. Values below are intentionally represented with placeholders. The source log contains a player handle, account and character identifiers, IP addresses, local paths, hardware details, service endpoints, and authentication-adjacent material; it must not be committed or uploaded as a fixture.

## Confidence vocabulary

- **High**: a purpose-specific line directly states the event and required fields.
- **Medium**: a consistent line or short sequence strongly implies the event, but semantics or ownership need another annotated sample.
- **Low**: an interesting correlation or subsystem trace that should not yet produce a user-facing fact.
- **Absent**: this recording contains no credible evidence for the requested event.

## Executive findings

The sample materially improves on the older public-log evidence:

- A purpose-specific `<Join PU>` line directly exposes the shard label, public server address, server port, and a location ID.
- The local player's handle can be mapped to account ID, character GEID, network `playerGEID`, node ID, client session, and login session. These IDs are not interchangeable and should remain separately named.
- Login, successful PU entry, forced disconnect, frontend return, and clean process exit are all observable.
- Build, branch, release channel, environment, changelist, database version, and several source-version fingerprints are directly available.
- Jurisdiction, monitored-space, and armistice transitions are promising location/activity telemetry.
- The sample does **not** provide a trustworthy shard population, general player roster, server latency, actor death/kill event, trade transaction, chat message, jump-tunnel event, or organization presence feed.

The monitoring pipeline should use cheap literal/tag dispatch before field extraction. Most high-value records have stable-looking markers such as `<Join PU>`, `<AccountLoginCharacterStatus_Character>`, `<Channel Disconnected>`, `<SystemQuit>`, or `<SHUDEvent_OnNotification>`. There is no reason to run every regular expression against every line.

## Identifier model

### Proven local identity chain

The following records can be correlated during startup:

| Identifier | Evidence | Meaning and handling | Confidence |
| --- | --- | --- | --- |
| Character name | `AccountLoginCharacterStatus_Character ... name <HANDLE>` | Current in-game character/display identity in this sample | High |
| Handle | `User Login Success - Handle[<HANDLE>]` | Login handle; equals the character name here, but do not assume universal equality | High |
| Account ID | `... accountId <ACCOUNT_ID> ...` | Account-scoped numeric identifier; sensitive | High |
| Character GEID | `... geid <CHARACTER_GEID> ...` | Character/entity-graph identity; sensitive | High |
| Network player GEID | `nickname="<HANDLE>" playerGEID=<PLAYER_GEID>` | Player identity used by the network gateway | High |
| Network node ID | Same gateway lines, `node_id=<UUID>` | Network node identity for this connection/session | High |
| Client session | Gateway lines, `session=<HEX>` / `sessionId="<HEX>"` | Stable across frontend and PU channels in this recording | High |
| Login session ID | `<InitiateLogin> ... LoginSessionId: <UUID>` | Login transaction/session, not the PU session | High |
| Trace/process session | Startup `@session` and `<Init> Local:` | Client-process trace correlation ID | High |
| Environment session | Startup `@env_session` / process `Env:` | Deployment/build environment, not a shard | High |

The `AccountLoginCharacterStatus_Character` record is the best local name → account ID and name → character GEID source. Gateway records are the best name → network `playerGEID` and node ID source. In this sample, the character GEID and network `playerGEID` should be compared and stored independently even if their observed values happen to agree.

### Other players

A party notification exposes another player's handle in a `"<HANDLE> connected."` message. Party-marker records expose marker IDs and tracked entity IDs. This file does not provide a defensible bridge between that other handle and those IDs. Do not infer the association solely from temporal proximity.

Recommended identity state:

```text
IdentityObserved {
  handle?, characterName?, accountId?, characterGeid?, playerGeid?,
  nodeId?, entityId?, relationship?, firstObservedAt, lastObservedAt,
  evidence[], confidence
}
```

Mappings should be additive and evidence-backed. Conflicting mappings must be retained as conflicts, not silently overwritten.

## Shard, server, and session sequence

### High-confidence PU join

Primary marker:

```text
<Join PU> address[<IP>] port[<PORT>] shard[<SHARD>] locationId[<LOCATION_ID>]
```

Immediately adjacent records add a matchmaking/request ID and confirm the network connection:

```text
{Join PU} ... id[<UUID>] status[<STATUS>] port[<PORT>]
<Session Manager [Request Connect]> Connecting <IP>:<PORT>
<Channel Created> ... remoteAddr=<IP>:<PORT> ... nickname="<HANDLE>" playerGEID=<ID>
<Channel Connection Complete> ... remoteAddr=<IP>:<PORT> ...
...
taskname="OnClientEnteredGame" state=eCVS_InGame(17) status="Finished"
```

Recommended derived events:

1. `PuJoinRequested` from `<Join PU>` with matchmaking ID, shard, location ID, endpoint, and port.
2. `PuReplicationConnectionEstablished` only after the matching remote channel completes.
3. `PuEntered` only after the relevant `OnClientEnteredGame`/`eCVS_InGame` sequence completes under `SC_Default`.

This avoids declaring a successful join when matchmaking returned an endpoint but loading failed.

### Shard metadata available in this sample

- Full shard label.
- Region-like segment embedded in the shard label (for example a US-East-looking token). Parse it as a raw shard segment first; map it to a friendly region only through versioned knowledge.
- Public game-server IP address and UDP/TCP port as observed by the client.
- Matchmaking request/session UUID.
- Location ID returned with the join.
- Map and game rules (`megamap`, `SC_Default`).
- Network connection tuple, local endpoint, remote endpoint, node ID, player GEID, and channel uptime.
- Database version fetched during PU loading.
- Loading phase and duration.

The startup `@host_session: local_shard` is client tracing metadata and must not replace the PU shard from `<Join PU>`.

### Disconnect and session end

```text
<Channel Disconnected> cause=<CODE> reason="<REASON>" isRemote=<0|1>
  viewState=<STATE> gamerules="<RULES>" remoteAddr=<ENDPOINT>
  nickname="<HANDLE>" playerGEID=<ID> uptime_secs=<SECONDS>
```

This is high-value telemetry. It distinguishes remote versus local termination, supplies an error/cause code and reason, and gives a direct connection uptime. Deduplicate `<Channel Disconnected>`, `<Channel Process Disconnection>`, and `<Channel Destroyed>` into one logical connection end keyed by connection tuple/node/endpoint and a short time window.

In this recording, a remote inactivity disconnect is followed by `RequestFrontEndReason="OnLobbyPostGameUnload"`, an error popup, anti-cheat session end, and a local frontend channel. This should produce `PuDisconnected` and `ReturnedToFrontend`, not a full application logout.

Clean application exit is directly visible:

```text
<SystemQuit> ... cause=<CODE>, reason=<REASON>, exitCode=<CODE>
```

EOF without `SystemQuit`, especially after fatal/crash markers, can be classified as an unclean end only after the file handle closes or the process is known to have exited.

## Requested telemetry feasibility

| Requested item | Result in this log | Recommended treatment |
| --- | --- | --- |
| Shard | **High** | Emit from `<Join PU>`; preserve the full raw label and optional derived region segments. |
| Server | **High for endpoint**, unknown for stable server identity | Store public IP/port and connection identity. Do not call the IP a permanent server ID. |
| Mission | **Low/partial** | Mission subsystem and notification IDs appear, but no proven accepted/completed mission contract is present. Generic HUD messages frequently carry `MissionId` and are not necessarily missions. |
| Kill | **Absent** | No actor-death/kill record exists in this session. Keep known death patterns as candidates for annotated combat samples. |
| Death | **Absent** | Same limitation as kill. |
| Ship | **Low/partial** | Many ship class/entity names appear, particularly quantum navigation and docking/stowing traces, but ownership/occupancy is not proven. Do not attribute nearby ships to the local player. |
| Trade | **Absent as commerce** | Inventory moves and cargo-platform activity exist, but no price, currency, buy/sell, commodity transfer, or completed transaction is proven. |
| Login | **High** | Model `LoginStarted`, `AccountAuthenticated`, identity observed, frontend entered, and PU entered separately. |
| Logout | **High for clean application quit; medium for game-session leave** | Use `SystemQuit` for clean app exit and channel/frontend sequences for PU leave. |
| Quantum status | **Low** | `[QuantumTravel]` records expose route/navigation objects and `FinalStop`, but do not establish local-player travel state or the enum meaning. Needs annotated quantum start/abort/complete samples. |
| Jump tunnel status | **Absent** | No credible jump or tunnel record. Capture an annotated inter-system jump sample. |
| Organization member updates | **Absent** | Presence, contacts, and social services initialize, but no org member status payload appears. |
| Server ping | **Absent** | `ping` hits are gRPC keepalive configuration, not measured latency. Channel uptime is not ping. |
| Chat | **Absent** | A subsystem/service mention is not a chat message. No sender/body/channel record was found. |
| Player population | **Absent** | No roster or player-count record. Actor/physics instance counts are not shard population. |

## Additional promising telemetry

### Settled requirement: live party status

The owner has established live party status as a required AstraDock capability. The application must derive and maintain a current party snapshot—not merely display raw party notifications—including known members and recent joins, connections, disconnects, departures, removals, leadership changes, and party lifecycle transitions.

This sample directly supports `PartyCreated`, `PartyLaunchInitiated`, and `PartyMemberConnected`. Two party markers stream in after PU entry and stream out during teardown, but the sample does not establish their handle mapping or prove that marker count is an authoritative party size. Until annotated samples prove stronger semantics, marker records may corroborate party activity but must not independently add or remove named members.

Monitoring can begin after a party already exists, and logs may omit a terminal transition. The state model therefore needs `unknown`, `not_in_party`, and `in_party` states; per-member connection and membership state; evidence timestamps; confidence; stale-state handling; and explicit session-boundary behavior. Other players' handles and relationships are sensitive and remain local by default.

### High confidence

| Event | Marker/evidence | Useful fields |
| --- | --- | --- |
| `ClientBuildObserved` | `FileVersion`, `ProductVersion`, `Branch`, `Changelist`, build timestamps | semantic/file version, branch, changelist, build date/time |
| `ReleaseEnvironmentObserved` | `Environment`, `Tag`, `Config`, executable channel path | PUB/LIVE-like channel, shipping config, install path fingerprint |
| `GameDataVersionObserved` | `<Game Version>` and `<SetDatabaseVersion>` | game-version identifier, DataCore/class/archetype/component/OC versions, database version |
| `PuJoinRequested` | `<Join PU>` | shard, endpoint, port, location ID, matchmaking ID/status |
| `PuEntered` | completed `OnClientEnteredGame` under `SC_Default` | entry timestamp, session, load duration |
| `PuDisconnected` | `<Channel Disconnected>` | cause, reason, remote/local, endpoint, uptime |
| `ApplicationExited` | `<SystemQuit>` | cause, reason, exit code, clean flag |
| `JurisdictionEntered` | HUD notification `Entered <name> Jurisdiction` | jurisdiction label, notification/mission correlation ID |
| `MonitoredSpaceEntered` | HUD notification `Entered Monitored Space` | state and timestamp |
| `ArmisticeStateChanged` | `Entering Armistice Zone` / `Leaving Armistice Zone` | entered/left state |
| `InventoryOperation` | `<Add Inventory Management Move>` plus completion | operation type, item class, source/target inventory kind and ID, request ID, outcome |

HUD notifications are split across physical lines in this file. The tailer must retain multi-line assembly state rather than treating every newline as an independent semantic record. Repeated `Next`, `StartFade`, and `Remove` lifecycle records are UI transitions, not repeated domain events.

### Medium confidence or diagnostic value

| Candidate | Why it is useful | Guardrail |
| --- | --- | --- |
| `LocationContextObserved` | Object-container paths reveal places such as a station/location code | Treat as loaded world context, not proof the player visited or stood there, until corroborated by player/jurisdiction evidence. |
| `PartyNotificationObserved` | Party creation/launch and a member connection are visible | Text is localized and sometimes multi-line; do not infer member IDs without a bridge. |
| `InventoryEquipped` / `InventoryStored` | Equipment and item attachment records name item classes and ports | Startup hydration replays many persistent attachments; distinguish hydration from user actions. |
| `CargoPlatformStateChanged` | Freight/ship elevator platform states and cargo subsystem records appear | Many are streamed-world or error records unrelated to a user action. Require local interaction correlation. |
| `ShipEntityObserved` | Ship manufacturer/model class names and entity IDs appear | Observation is not ownership, spawn, boarding, or piloting. |
| `LoadingPerformanceObserved` | Loading steps include running times and long-wait warnings | Aggregate selected phase durations; do not emit hundreds of per-step UI events. |
| `NetworkFailureObserved` | Authentication, subscription, WebRTC, and channel errors are explicit | Redact tokens, topic keys, account IDs, endpoints, and internal service details before display/upload. |
| `HardwareRuntimeObserved` | OS, CPU, memory, GPU, driver, display, and API versions are logged | Sensitive fingerprinting data; local diagnostics only and explicit consent before sync. |
| `ClientHealthSnapshot` | Physics/memory instance snapshots repeat | Diagnostic rather than gameplay telemetry; costly/noisy and not a population signal. |

## Recognition strategy for fast monitoring

### Stage 1: line framing

- Incrementally decode appended bytes.
- Preserve incomplete trailing bytes and partial lines.
- Parse the leading ISO timestamp when present.
- Attach continuation lines to the preceding timestamped record where the event family permits it.
- Handle truncation, replacement, and duplicate filesystem notifications before parsing.

### Stage 2: cheap dispatch

Use literal substring/tag lookup to select a small extractor set. Initial high-value keys:

```text
<AccountLoginCharacterStatus_Character>
<Legacy login response>
<Expect Incoming Connection>
<Join PU>
<Channel Connection Complete>
taskname="OnClientEnteredGame"
<Channel Disconnected>
<SHUDEvent_OnNotification>
<Add Inventory Management Move>
<Inventory Request Completed>
<SystemQuit>
FileVersion:
Branch:
Changelist:
<Game Version>
<SetDatabaseVersion>
```

Only the selected extractor should run. Aho–Corasick or a simple ordered literal index can be evaluated later; at this log volume, well-ordered `includes` checks are likely sufficient and easier to audit.

### Stage 3: extraction and contextual correlation

- Prefer field-delimiter extraction for `name=value`, `field[value]`, and quoted fields over a single monolithic regex.
- Key joins by explicit IDs, endpoint/port, connection tuple, node ID, request ID, and bounded timestamps.
- Maintain separate state machines for client lifecycle, authentication, frontend connection, PU connection, identity, inventory requests, and notification assembly.
- Emit a user-facing event only at a semantic terminal point (for example connection complete or request completed).
- Preserve the contributing evidence records locally for diagnosis.

### Stage 4: deduplication

Several records occur twice or represent lifecycle echoes. Deduplicate by event-family-specific keys, not raw-line equality alone:

- Identity: account ID + character GEID + state + short window.
- Join: matchmaking ID or shard + endpoint + port + request timestamp.
- Disconnect: connection tuple/node + cause + short window.
- Notification: notification correlation/mission ID + message + first-added timestamp.
- Inventory: request ID + operation + completion outcome.

## Privacy and security classification

### Never upload by default

- Raw log lines.
- Account ID, character GEID, player GEID, node ID, trace/login/session IDs.
- Public and local IP addresses or ports.
- Local usernames and filesystem paths.
- Authentication tokens, subscription keys, service URLs, or query URLs.
- Hardware inventory and device IDs.
- Other players' handles, chat/social content, or relationship information.

### Safer normalized telemetry

- Timestamp, parser/profile version, game build/channel.
- Pseudonymous locally generated device/session identifiers.
- Shard label or a minimized/hash form, depending on Station need.
- Coarse region derived from a versioned mapping.
- Event type and non-sensitive outcome/cause category.
- User-approved gameplay facts with raw evidence removed.

Identifiers needed for local correlation can be stored locally with retention controls. If Station requires stable player identity, that contract needs explicit consent, purpose, minimization, encryption, and deletion behavior before implementation.

## Evidence gaps and next capture checklist

One log cannot establish format stability or cover actions that did not occur. Capture small, sanitized, timestamp-annotated snippets for:

- [ ] Player kills another player.
- [ ] Player kills an NPC and is killed by a player/NPC/environment.
- [ ] Ship retrieval/spawn, boarding, seat entry, takeoff, landing, exit, storage, and destruction.
- [ ] Quantum spool, calibration, engage, arrival, cancel, interdiction, and failure.
- [ ] Jump-point approach and complete inter-system tunnel transit.
- [ ] Mission accept, objective progress, complete, abandon, and fail.
- [ ] Commodity buy/sell and cargo transfer at terminal/elevator.
- [ ] Global, party, direct, and ship chat send/receive.
- [ ] Friend and organization member online/offline transitions.
- [ ] Joining a populated shard alone and with a party; compare mobiGlas roster changes if logged.
- [ ] Normal exit from PU to menu, server error, client crash, and network loss.
- [ ] Shard transfer/server-meshing transition without returning to frontend.
- [ ] Repeat the same actions after the next LIVE patch to measure drift.

For each action, record the wall-clock time, what the player did, expected target/entity, and outcome. Sanitize only after preserving a private original so correlation is not destroyed.

## Proposed first extraction-profile priorities

1. Client build and release environment.
2. Local identity observation and typed identifier correlations.
3. Authentication/login lifecycle.
4. PU join request, server connection, successful entry, disconnect, and frontend return.
5. Clean application exit and unclean-end classification.
6. Jurisdiction, monitored-space, and armistice transitions.
7. Inventory operations with startup-hydration suppression.
8. Diagnostic unknown-line capture for the remaining requested event families.

The kill/death, ship ownership/occupancy, quantum, jump tunnel, mission, trade, chat, organization, population, and latency profiles should wait for annotated evidence rather than being inferred from subsystem keywords.

## Review conclusion

This log supports a useful first telemetry spine: build → authentication/identity → frontend → PU matchmaking → shard/server connection → successful game entry → location-zone observations and local inventory activity → disconnect/return → application exit. It also supports strong local diagnostic metadata.

The most important product boundary is to distinguish direct observation from inference. A ship class mentioned by quantum navigation is not necessarily the user's ship; a loaded object container is not necessarily a visited location; an actor instance count is not population; gRPC ping configuration is not latency; and a generic notification carrying a mission UUID is not proof of mission progress.
