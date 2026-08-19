# PU shard, replication connection, and session projections

Issue #25 extends the environment-scoped runtime projection with three deliberately separate read models. A shard label is logical matchmaking evidence, a Replicant endpoint is a current PU replication observation rather than stable DGS identity, and a PU session is the local player's correlated lifecycle.

For the upstream CIG architecture and the distinction among static, quasi-dynamic, and full dynamic server meshing, see [`star-citizen-server-meshing-reference.md`](star-citizen-server-meshing-reference.md). That research reference informs these boundaries but does not replace fixture-backed runtime contracts.

## Snapshot semantics

| Event | Shard snapshot | Replication-connection snapshot | PU session |
| --- | --- | --- | --- |
| `MatchmakingStatusObserved` | unchanged | unchanged | `connecting`; records request ID/status and request time |
| `PuJoinRequested` | `transitioning`; records opaque shard and location ID | `transitioning`; records candidate endpoint and port | `connecting`; correlates the request |
| `PuReplicationConnectionEstablished` | unchanged | `connected`; records endpoint, port, opaque observed node ID, Replicant host type, rules, and connection time | remains `connecting` |
| `PuEntered` | `connected` when shard evidence exists | unchanged | `in_game`; records entry time |
| `PuDisconnected` | `disconnected` | `disconnected`; clears current endpoint/port/node and retains last endpoint plus reason | `disconnected`; uses directly observed channel uptime |

Starting mid-session remains `unknown`. An incomplete join remains `transitioning`. Missing disconnect evidence does not invent a terminal state. Connected snapshots become `stale` after the ADR-0004 15-second health boundary, while an observed disconnect clears the current endpoint immediately.

DGS replacement, authority transfer, and shard-changing transition behavior are intentionally not promoted as fixture-validated functionality yet. The reducer keeps the snapshots independent so those transitions can be enabled once representative sanitized evidence is approved.

## Disconnect classification and correlation

Issue #79 adds fixture-backed protection for a transition pattern observed during owner testing. A `<Channel Disconnected>` record for `gamerules="SC_Frontend"` is frontend transport plumbing during a PU transition and is not a PU/server leave. Both the legacy scan parser and normalized runtime parser reject it as a non-event.

True PU disconnect evidence is correlated within its environment to an immutable session candidate by exact server endpoint/port before shard context is attached. A delayed disconnect for an earlier endpoint must not disconnect or relabel a newer shard projection. When multiple candidates exist and no correlation field selects exactly one, the legacy compatibility DTO emits an explicitly unattributed disconnect with no `sessionId` or `shardId`; it never borrows the latest shard. The normalized current-state reducer likewise ignores a disconnect whose explicit endpoint conflicts with the active server endpoint. Historical event evidence remains available for future connection-history projection work.

This policy does not infer that a player left at an earlier wall-clock time. Source timestamp remains the time of the first accepted evidence, and a missing true PU disconnect remains missing rather than being reconstructed from a frontend-channel transition.

## Region mapping

The raw shard label is preserved unchanged. `src/runtimeRegionMappings.js` applies versioned naming-convention mappings to recognizable shard segments for the owner-confirmed friendly values `US`, `EU`, `AUS`, and `ASIA`. These mappings are `medium` confidence because the naming convention is not a stable CIG contract. Unmatched or future segments remain `UNKNOWN`.

Region never derives from the player's physical location, installation, previous selection, account, or endpoint geolocation. The renderer instrument may show the friendly value; drilldown data includes the raw segment, confidence, mapping basis, and mapping version.

## Privacy and formatting

- The privileged projection retains full endpoints for deterministic correlation.
- Renderer DTOs redact IPv4 endpoints after the first two octets and partially redact the hostname label while preserving its suffix.
- Matchmaking request IDs use the stable-identifier truncation policy.
- Endpoint and port remain diagnostic detail rather than the dominant default instrument.
- Duration is `HH:MM:SS` when at least one hour and `MM:SS` otherwise. Direct disconnect uptime supersedes timestamp-derived elapsed time.

## Unsupported data

Shard population, roster, latency, server FPS, and generic mesh/router observations are not projected. `local_shard` startup traces never become PU shard evidence.
