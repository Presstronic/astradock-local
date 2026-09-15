# MVP security and privacy review

Issue [#43](https://github.com/Presstronic/astradock-local/issues/43) is the release-blocking security review for the local Runtime Monitor. This document is the implementation record and must be updated when a capability, trust boundary, data contract, or packaging policy changes.

## Review decision

**Status:** MVP local-only boundary approved for continued alpha development on 2026-09-15.

The review found no open high/critical findings in the implemented local boundary. The approval does not cover Station synchronization, background services, automatic updates, bundled extraction tools, or a production signing key. Those capabilities remain release-gated follow-up work.

## Scope and trust boundaries

| Boundary | Trusted responsibility | Untrusted input/output | Controls |
| --- | --- | --- | --- |
| Renderer → preload | UI interaction and presentation | DOM state, user-entered fields, log-derived display values | React renderer has no Node/Electron/network capability; fixed namespaced API |
| Preload → Electron main | Capability translation | IPC payloads and sender identity | context isolation, sandbox, runtime payload validation, sender webContents and exact URL checks |
| Main → local filesystem | Source selection, settings, telemetry database, diagnostics | Selected files may be missing, replaced, malformed, or permission denied | native dialogs, source revalidation, canonical paths, bounded reads, atomic writes, restricted permissions |
| Log → parser/store | Observation and normalization | Game-controlled text, partial lines, format drift, identifiers and endpoints | bounded framing, deterministic parsing, versioned event validation, sensitivity classification, encrypted store |
| Main → shell | Open an approved source folder or reveal an application-created export | Filesystem state may change after validation | only registered/revalidated sources or application-created output paths reach shell operations |
| Package/update → host | Install and execute application code | Artifact, dependency, or update tampering | lockfile/npm ci, CI audit, explicit packaged-file allowlist, signed release remains a prerequisite |

## Assets and data classification

| Asset | Classification | Default handling | Allowed disclosure |
| --- | --- | --- | --- |
| Raw `Game.log` lines and context | personal/local; may contain secrets | never sent to renderer scan DTO by default; bounded explicit local evidence only | user-inspected local UI; never Station by default |
| Account IDs, handles, entity/session IDs | personal/social | normalized only where required; redacted from diagnostics and exports unless contract explicitly requires it | local event contract according to sensitivity; no automatic upload |
| IP addresses, server endpoints, source paths | personal/local | source paths stay in main; public source DTOs use display labels; diagnostics redact paths/endpoints | local operational error only in redacted form |
| Canonical telemetry events | local, with per-event sensitivity | encrypted SQLite store under Electron user data; retention and deletion apply | renderer-safe projections; future sync requires explicit consent and separate contract |
| Database encryption key | secret | wrapped by Electron OS secure storage; key buffer cleared after store creation | never renderer-visible, logged, or exported |
| Preferences and source preference | local; may contain a path | validated and atomically replaced with owner-only permissions | no network disclosure |
| Diagnostics | local operational | bounded rotating files; sensitive field names and paths redacted | user-controlled future support export only after review |
| Blueprint exports | user-created local output | explicit save dialog; not uploaded or deleted by app data reset | destination chosen by user |

## Mitigation matrix

| Abuse case | Mitigation | Verification | Owner |
| --- | --- | --- | --- |
| Compromised renderer invokes native APIs | fixed preload capabilities; no generic IPC, filesystem, shell, or URL API | `securitySurface.test.js`, `security:check` | desktop platform |
| Renderer navigates to attacker content | exact renderer URL allowlist; navigation/window-open/webview denial | `electronSecurity.test.js` | desktop platform |
| Malformed or oversized IPC request | per-channel allowlists, bounded text/integers, structured safe errors | `ipcBoundary.test.js` | application boundary |
| Arbitrary path is supplied to monitoring | source IDs refer to registered, revalidated sources; raw paths are not accepted by monitor IPC | `sourceDiscovery.test.js`, `ipcBoundary.test.js` | source boundary |
| Log text causes injection or memory growth | text is rendered as values, not markup; parser framing bounds line size and context | parser/tailer tests and renderer tests | telemetry pipeline |
| Sensitive evidence leaks in diagnostics | bounded structured logger redacts path, raw, identity, endpoint, and credential-like fields | `diagnosticLogger.test.js` | diagnostics |
| Database is read from disk | OS-backed secure-storage key wrapping and encrypted SQLite; startup fails closed when secure storage is unavailable | storage-key and canonical-store tests | persistence |
| Telemetry survives deletion unexpectedly | scoped transactional deletion, retention, reset, and monitor stop-before-delete behavior | canonical store and IPC tests | persistence |
| Dependency introduces a known severe vulnerability | committed lockfile, `npm ci`, production `npm audit --omit=dev --audit-level=high` in CI | CI workflow; local command when registry is available | release engineering |
| Package contains unintended source/data | electron-builder explicit `files` allowlist; no logs/assets in repository | package configuration and build verification | release engineering |

## Lifecycle review

1. Startup initializes diagnostics and encrypted local storage; failure to obtain OS-backed key protection does not open telemetry storage.
2. Native source discovery or selection validates a readable Star Citizen `game.log`; only the private main-process record retains its canonical path.
3. Monitoring owns tailing, framing, parsing, normalization, persistence, and subscriptions in the main process boundary; renderer reload does not grant new filesystem authority.
4. Renderer queries receive bounded projections. Raw evidence is absent unless an explicit, environment-scoped evidence request is made; sensitive canonical events return a redacted payload.
5. Retention and deletion stop affected monitoring before modifying telemetry. Reset removes application settings and source preference but never Star Citizen files or user exports.
6. Shutdown stops monitoring, closes the store, and closes diagnostics. Rotating diagnostic files are bounded and owner-readable where the platform supports file modes.

## Dependency and supply-chain review

Direct dependencies are inventoried from `package-lock.json` on this branch. Runtime packages are MIT, ISC, or OFL-1.1 licensed; development tooling is MIT or Apache-2.0 licensed. Exact versions are lockfile-pinned for CI installation.

The required reproducible checks are:

```bash
npm ci
npm audit --omit=dev --audit-level=high
npm run security:check
```

`npm audit` requires registry access. A local offline failure is not evidence of a clean audit and must be rerun in CI or with registry connectivity before release. License and advisory status must be rechecked when dependencies change.

## Residual risks and explicit limitations

- An attacker who already controls the user account can generally read the same local files and application data; local encryption primarily protects data at rest from casual access and does not defeat a running-user compromise.
- Electron and Chromium security depend on timely supported-version updates. The project must keep Electron current and repeat the audit for each release.
- The application is not code-signed in the current repository workflow. Distribution outside controlled testing requires a documented signing, provenance, and update-verification decision.
- User-selected export destinations are intentionally outside AstraDock data deletion guarantees.
- Station sync, authentication, diagnostics export, automatic updates, and external extraction tools are not approved by this review.
- Symlink and filesystem race conditions cannot be fully eliminated on a general-purpose user-writable filesystem; operations revalidate sources and keep privileged capabilities narrow.

## Sign-off criteria

This review is valid only while all of the following remain true: the automated tests and `security:check` pass; the production dependency audit has no high/critical findings; no new network, update, native-tool, or secret-bearing capability is introduced without an updated threat model; and the residual risks above are communicated for the intended alpha audience.
