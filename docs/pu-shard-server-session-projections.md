# PU shard, server, and session projections

Issue #25 extends the environment-scoped runtime projection with three deliberately separate read models. A shard label is logical matchmaking evidence, a server endpoint is a current network observation rather than stable identity, and a PU session is the local player's correlated connection lifecycle.

## Snapshot semantics

| Event | Shard snapshot | Server snapshot | PU session |
| --- | --- | --- | --- |
| `MatchmakingStatusObserved` | unchanged | unchanged | `connecting`; records request ID/status and request time |
| `PuJoinRequested` | `transitioning`; records opaque shard and location ID | `transitioning`; records candidate endpoint and port | `connecting`; correlates the request |
| `GameServerConnectionEstablished` | unchanged | `connected`; records endpoint, port, node, rules, and connection time | remains `connecting` |
| `PuEntered` | `connected` when shard evidence exists | unchanged | `in_game`; records entry time |
| `PuDisconnected` | `disconnected` | `disconnected`; clears current endpoint/port/node and retains last endpoint plus reason | `disconnected`; uses directly observed channel uptime |

Starting mid-session remains `unknown`. An incomplete join remains `transitioning`. Missing disconnect evidence does not invent a terminal state. Connected snapshots become `stale` after the ADR-0004 15-second health boundary, while an observed disconnect clears the current endpoint immediately.

Server-only and shard-changing transition behavior is intentionally not promoted as fixture-validated functionality yet. The reducer keeps the snapshots independent so those transitions can be enabled once representative sanitized evidence is approved.

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
