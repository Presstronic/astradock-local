# Runtime lifecycle projection

Issue #24 promotes the fixture-backed build, environment, local identity, and game lifecycle events into an environment-scoped current-state read model. Projection version 2 renames the ambiguous server connection to a PU replication connection and replaces its generic node field with `observedNodeId`. The authoritative reducer is `src/runtimeLifecycleProjection.js`; the renderer receives only its privacy-safe DTO.

## Directly supported transitions

| Accepted event | Current lifecycle state |
| --- | --- |
| `LoginStarted` | `authenticating` |
| `AccountAuthenticated` | `authenticated` |
| `IdentityObserved` | `frontend` |
| `PuJoinRequested` | `loading` |
| `PuReplicationConnectionEstablished` | `loading` |
| `PuEntered` | `in_game` |
| `PuDisconnected` | `disconnected` |
| `ReturnedToFrontend` | `frontend` |
| `ApplicationExited` | `exited` |

Application start, explicit frontend exit, authentication failure, loading progress/failure, and unclean termination remain unsupported because the approved corpus does not contain direct evidence for them. Starting monitoring mid-session produces `unknown` until an accepted event is observed. A missing terminal event never becomes a clean exit.

## Identity and privacy

Handle, character name, account ID, character GEID, player GEID, identity node ID, login session ID, and client session ID remain separate additive facts. The connection-specific opaque `observedNodeId` is retained separately and is not asserted to be a DGS, hierarchy, or EntityGraph identifier. Each fact retains its observation time, confidence, evidence event ID, and distinct claims. More than one value for the same field in one environment is `conflicting`; identical values in different environment keys never conflict.

The renderer DTO exposes handle and character name as display labels. Stable identifiers are truncated to two leading and two trailing characters, and full values and evidence event IDs remain behind the privileged boundary. Raw canonical events are not copied into the scan response.

## Freshness and compatibility

The implementation correction is tracked by [#87](https://github.com/Presstronic/astradock-local/issues/87).

Source health, observation age, parser compatibility, and domain lifecycle are independent dimensions:

- **source health** answers whether the selected file is available, being followed, advancing when bytes exist, paused, recovering, or failed;
- **observation age** reports when any log record and each domain fact were last observed;
- **parser compatibility** reports whether build/profile vocabulary is supported; and
- **domain lifecycle** remains latched until direct transition evidence or a defined session/source boundary changes it.

The ADR-0004 15-second objective applies to detecting and surfacing an actual monitoring fault after it becomes observable. It does not make a healthy quiet log, replication connection, shard, or PU session stale merely because no new domain event arrived. A connected replication projection remains connected through quiet gameplay until a direct disconnect, replacement, source-generation/session boundary, process exit, or explicit source-loss recovery rule applies. The UI may show “last log activity” and per-fact age as neutral context without raising a stale warning.

Parser compatibility is reported separately as `compatible`, `unverified_build`, `unsupported_profile`, or `suspected_drift` under [`runtime-profile-compatibility-policy.md`](runtime-profile-compatibility-policy.md). Unknown or future release tags remain unknown; `PUB`, `PU`, and `LIVE` are never treated as aliases.

LIVE 4.9.188 evidence also requires an alternative bounded `SC_Default` ready sequence because `OnClientEnteredGame` is absent. The profile must require the accepted game-mode/territory/local-player terminal conjunction and negative fixtures for frontend or incomplete loading before emitting `PuEntered`.

## Verification

`test/runtimeLifecycleProjection.test.js` replays the sanitized startup-to-clean-exit spine and covers missing evidence, stale state, conflicting identities, renderer redaction, and cross-environment isolation. Parser profile positive, negative, duplicate, malformed, and compatibility coverage remains in `test/runtimeLogParserEngine.test.js`.
