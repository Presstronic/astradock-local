# Runtime lifecycle projection

Issue #24 promotes the fixture-backed build, environment, local identity, and game lifecycle events into an environment-scoped current-state read model. The authoritative reducer is `src/runtimeLifecycleProjection.js`; the renderer receives only its privacy-safe DTO.

## Directly supported transitions

| Accepted event | Current lifecycle state |
| --- | --- |
| `LoginStarted` | `authenticating` |
| `AccountAuthenticated` | `authenticated` |
| `IdentityObserved` | `frontend` |
| `PuJoinRequested` | `loading` |
| `GameServerConnectionEstablished` | `loading` |
| `PuEntered` | `in_game` |
| `PuDisconnected` | `disconnected` |
| `ReturnedToFrontend` | `frontend` |
| `ApplicationExited` | `exited` |

Application start, explicit frontend exit, authentication failure, loading progress/failure, and unclean termination remain unsupported because the approved corpus does not contain direct evidence for them. Starting monitoring mid-session produces `unknown` until an accepted event is observed. A missing terminal event never becomes a clean exit.

## Identity and privacy

Handle, character name, account ID, character GEID, player GEID, node ID, login session ID, and client session ID remain separate additive facts. Each fact retains its observation time, confidence, evidence event ID, and distinct claims. More than one value for the same field in one environment is `conflicting`; identical values in different environment keys never conflict.

The renderer DTO exposes handle and character name as display labels. Stable identifiers are truncated to two leading and two trailing characters, and full values and evidence event IDs remain behind the privileged boundary. Raw canonical events are not copied into the scan response.

## Freshness and compatibility

Projection freshness uses the 15-second unhealthy/stale visibility objective from ADR-0004. Parser compatibility is reported separately as `compatible`, `unsupported_profile`, or `suspected_drift`. Unknown or future release tags remain unknown; `PUB`, `PU`, and `LIVE` are never treated as aliases.

## Verification

`test/runtimeLifecycleProjection.test.js` replays the sanitized startup-to-clean-exit spine and covers missing evidence, stale state, conflicting identities, renderer redaction, and cross-environment isolation. Parser profile positive, negative, duplicate, malformed, and compatibility coverage remains in `test/runtimeLogParserEngine.test.js`.
