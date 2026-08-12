# Hardened Electron Boundary

## Status and Purpose

| Field | Value |
| --- | --- |
| Status | Initial MVP hardening increment |
| Delivery issue | [#29](https://github.com/Presstronic/astradock-local/issues/29) |
| Runtime package | [`src/main.js`](../src/main.js), [`src/preload.js`](../src/preload.js) |
| Boundary helpers | [`src/ipcBoundary.js`](../src/ipcBoundary.js), [`src/subscriptionHub.js`](../src/subscriptionHub.js), [`src/electronSecurity.js`](../src/electronSecurity.js) |
| Tests | [`test/ipcBoundary.test.js`](../test/ipcBoundary.test.js), [`test/subscriptionHub.test.js`](../test/subscriptionHub.test.js), [`test/electronSecurity.test.js`](../test/electronSecurity.test.js), [`test/securitySurface.test.js`](../test/securitySurface.test.js) |

This document records the issue #29 boundary delivered inside the current CommonJS proof-of-concept shell. It does not supersede ADR-0001's TypeScript, React, Vite, and utility-process target. It hardens the Electron lifecycle and renderer gateway now so subsequent runtime-monitor work does not continue depending on raw prototype IPC.

## Technology and Libraries

None.

No new runtime or development dependency is introduced. The implementation uses Electron and Node.js built-ins only:

- Electron `BrowserWindow`, `webContents`, `session`, `ipcMain`, `dialog`, and `shell` for desktop lifecycle and native capabilities.
- Node.js `crypto` for local correlation/subscription identifiers.
- Node.js `fs`, `fs/promises`, and `path` for approved source monitoring and local settings.
- Manual runtime validation in `src/ipcBoundary.js` until the production schema library selected by the foundation work is approved and pinned.

If a schema, IPC, or Electron build helper is introduced later, the implementation issue must document exact package, version, license, maintenance posture, bundle/runtime cost, security implications, and migration behavior.

## Renderer API

The preload exposes one immutable `window.astradock` object:

```text
version
source.discover()
source.choose()
source.select(sourceId)
source.openFolder(sourceId)
monitor.getSnapshot()
monitor.scan({ sourceId, options })
monitor.start({ sourceId, options })
monitor.stop()
monitor.subscribe(listener, { resumeAfter })
events.query({ kind, cursor, limit })
events.getEvidenceDetail({ kind, id })
settings.get()
settings.update({ theme, username, userId })
diagnostics.getHealth()
```

The preload does not expose `ipcRenderer`, channel names, generic `invoke` or `send`, Node.js modules, filesystem functions, arbitrary paths, arbitrary URLs, or network helpers. All methods use versioned `astradock:v1:*` IPC channels and unwrap structured results into renderer exceptions with safe `code`, `message`, `retryable`, and `correlationId` fields.

Legacy prototype operations are intentionally removed:

- `api:fetchJson`
- `logs:scanSource`
- `logs:watchSource`
- `logs:unwatch`
- renderer-provided enrichment URLs

## IPC Validation and Errors

`src/ipcBoundary.js` validates renderer payloads before application behavior runs. The current validators bound:

- Source IDs to `src_` identifiers already created by privileged source discovery.
- Monitor filters to short username/user ID strings.
- Event queries to known kinds, numeric cursor bounds, and page limits no larger than 200.
- Evidence requests to known local evidence kinds and bounded IDs.
- Settings updates to `theme`, `username`, and `userId`.
- Subscription resume cursors and unsubscribe identifiers.

Malformed payloads return structured safe errors. Error details are allowlisted and filtered to avoid raw evidence, paths, secrets, tokens, passwords, and other sensitive values.

## Sender and Electron Hardening

The main process accepts IPC only from the single approved renderer `webContents` and the packaged renderer document URL. Other senders or navigated documents receive `invalid_sender`.

The BrowserWindow is created with:

```text
contextIsolation: true
nodeIntegration: false
sandbox: true
webSecurity: true
allowRunningInsecureContent: false
devTools: false in packaged builds
```

Navigation and window creation are denied unless they target the packaged renderer document. Webviews are denied. Session permission requests and permission checks are denied by default. A Content Security Policy is applied in the renderer document and response headers:

```text
default-src 'self';
script-src 'self';
style-src 'self';
img-src 'self' data:;
connect-src 'none';
font-src 'self';
object-src 'none';
base-uri 'none';
form-action 'none';
frame-src 'none'
```

## Monitor Ownership and Subscriptions

The main process now owns monitor state independently of renderer subscriptions. Starting the monitor scans the approved source, starts the file watcher, and publishes through one canonical subscription stream. Renderer reload or unsubscribe does not stop the watcher.

`src/subscriptionHub.js` provides:

- Monotonic sequence numbers for all monitor changes.
- Per-renderer subscription IDs.
- Cleanup when a renderer is destroyed or unsubscribes.
- Bounded pending messages per subscriber. When a subscriber falls behind, stale pending changes are dropped and the next envelope reports the drop count.

The current monitor still wraps the proof-of-concept whole-file parser and `fs.watch`; replacing that with the ADR-0001 utility-process runtime and resilient incremental tailer remains the responsibility of later runtime-monitor issues.

## Evidence Detail

Scan results no longer include raw lines or raw context by default. Rows carry `evidenceAvailable` and stable local IDs. The renderer must explicitly request permitted local evidence detail through `events.getEvidenceDetail({ kind, id })`.

Evidence detail remains local, bounded to at most 20 lines and 500 characters per line, and is available only for items in the current in-memory scan result. It is not a Station synchronization contract and is not persisted by this issue.

## Threat Model

### Assets

- Local filesystem paths and source locations.
- Raw `game.log` lines and surrounding context.
- Handles, account IDs, user IDs, server endpoints, environment/build data, and session activity.
- Future Station credentials and sync state, which must not enter renderer-visible contracts.
- Native capabilities such as file dialogs, folder opening, filesystem reads, and network access.

### Trusted Components

- Electron main process.
- Preload adapter code shipped with the application.
- Source discovery and parser modules after boundary validation.

### Less-Trusted Components

- Renderer JavaScript and DOM state.
- Renderer-supplied IDs, settings, filters, cursors, and subscription requests.
- All log-derived text displayed by the renderer.

### Primary Threats and Mitigations

| Threat | Mitigation |
| --- | --- |
| Renderer compromise invokes arbitrary native actions | Fixed preload API, no generic IPC, sender URL/webContents checks, no renderer-provided paths or URLs |
| Renderer obtains Node/Electron capabilities | sandbox, context isolation, Node integration disabled, no exposed Electron objects |
| Renderer navigates to attacker content and reuses IPC | navigation/window-open/webview denial and exact renderer URL checks |
| Malformed IPC destabilizes monitoring | runtime validators, bounded payloads, safe structured errors before application behavior |
| Subscription flood leaks memory | max subscribers, bounded per-subscriber queues, destroyed-renderer cleanup |
| Raw evidence leaks by default | scan DTO redaction and explicit bounded evidence-detail request |
| Third-party enrichment exfiltrates local values | unrestricted URL fetch and enrichment URL controls removed from MVP surface |

## Verification Guidance

Run:

```bash
npm test
npm run build
```

Focused coverage includes:

- IPC validation and safe error redaction.
- Hardened BrowserWindow options, CSP, and renderer URL policy.
- Subscription backpressure and cleanup.
- Static checks that legacy enrichment and raw log IPC surfaces are absent.

Manual desktop verification should cover:

1. Discover sources, choose or select an approved source, scan, start monitor, stop monitor, and reopen source folder.
2. Inspect a shard row and verify local evidence detail appears only after the explicit detail request.
3. Reload the renderer while monitoring and verify monitoring state is still reported by `monitor.getSnapshot()`.
4. Confirm attempts to navigate away or open a new window do not leave the packaged renderer.
