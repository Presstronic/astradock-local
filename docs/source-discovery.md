# Runtime Source Discovery

## Status and Purpose

| Field | Value |
| --- | --- |
| Status | Initial MVP source-discovery boundary |
| Delivery issue | [#14](https://github.com/Presstronic/astradock-local/issues/14) |
| Runtime package | [`src/sourceDiscovery.js`](../src/sourceDiscovery.js) |
| Electron boundary | [`src/main.js`](../src/main.js), [`src/preload.js`](../src/preload.js), [`docs/hardened-electron-boundary.md`](hardened-electron-boundary.md) |
| Tests | [`test/sourceDiscovery.test.js`](../test/sourceDiscovery.test.js) |

This document defines the current safe-discovery boundary for Star Citizen `game.log` sources in the existing CommonJS Electron application. It is intentionally scoped to issue #14 and does not rebuild the full TypeScript, React, Vite, and utility-process foundation selected by ADR-0001.

## Technology and Libraries

No new runtime or development dependency is introduced.

The implementation uses Node.js and Electron built-ins only:

- `node:fs/promises` for bounded candidate validation and local preference storage.
- `node:path` and `node:os` for platform-aware candidate construction.
- `node:crypto` for deterministic local source IDs.
- Electron `dialog` for trusted manual source selection.
- Electron `shell` for opening the approved source folder from the privileged process.

Any future installation-discovery package or external tool must be reviewed for version, maintenance, license, permissions, bundle cost, and privacy behavior before adoption.

## Responsibilities

Source discovery is owned by privileged application code, not the renderer.

The discovery service:

- Generates candidate `game.log` paths from supported Windows launcher/Steam roots and supported Linux Wine/Proton/LUG/Steam roots.
- Accepts explicit extra roots for non-default installations without recursively scanning arbitrary filesystems.
- Revalidates a restored user preference before reuse.
- Validates manual selections returned by the native file dialog.
- Canonicalizes readable files and symlink targets before deriving stable local IDs.
- Requires readable `game.log` files with recognizable Star Citizen log evidence.
- Derives channel/build hints from log evidence where available and treats directory names as lower-confidence hints.
- Returns actionable states for missing, inaccessible, non-file, malformed, and unsupported-channel sources.
- Produces renderer-safe DTOs that omit full paths and other privileged filesystem material.

The Electron main process:

- Keeps private source paths in an in-memory registry keyed by `sourceId`.
- Persists only the approved validated source path in local app settings.
- Revalidates a registered source before scan, watch, or selection reuse.
- Accepts renderer commands by `sourceId`, not arbitrary paths.
- Opens native dialogs and folders from privileged code only.

The renderer:

- Displays privacy-safe labels, channel hints, build hints, validation states, and action outcomes.
- Selects from approved source IDs or requests a native manual-selection flow.
- Does not own filesystem paths or submit typed paths to scan, watch, or open-folder operations.

## Public Source DTO

Renderer-facing source descriptors have this shape:

```text
sourceId              Stable local ID derived from the canonical source path.
sourceKind            "game_log".
discoveryMethods      automatic, restored_setting, or user_selected.
displayLabel          Privacy-safe source label.
displayPath           Privacy-safe path hint such as StarCitizen/LIVE/game.log.
channelHint           LIVE, PTU, EPTU, HOTFIX, or UNKNOWN.
channelConfidence     observed, path_hint, or unknown.
rawChannel            Optional observed raw channel when it differs or is unsupported.
buildVersion          Optional observed game build.
environmentName       Optional observed game environment name.
installationKind      rsi_launcher, steam, lug_wine, wine, or manual_or_unknown.
platformHint          Platform used for candidate generation.
validation.status     valid, missing, inaccessible, permission_denied, not_file, invalid_log, or unsupported_channel.
validation.isValid    Boolean approval for scan/watch/persistence.
validation.checkedAt  UTC validation timestamp.
validation.message    Safe user-facing status text.
validation.evidenceMarkers  Bounded marker names, never raw log lines.
```

The private DTO variant used inside `src/main.js` also contains `private.sourcePath` and `private.canonicalPath`. That private object is stripped before crossing the preload boundary and must not be displayed by default, logged to renderer diagnostics, or sent to Station.

## Selection and Preference Rules

Automatic discovery ranks valid sources before invalid sources. Restored validated preferences rank first, then manually selected sources, then automatic candidates. Within equal method priority, channels rank `LIVE`, `PTU`, `EPTU`, then `HOTFIX`, followed by `UNKNOWN`.

When multiple valid automatic sources exist, the deterministic active source is the highest-priority candidate and the discovery summary reports ambiguity so the UI can show explicit choices. Selecting a source saves it only after validation succeeds. Saved preferences are local app data and are revalidated on every discovery or scan/watch reuse; a moved, missing, malformed, inaccessible, or unsupported source becomes an actionable state rather than implicit approval.

## Privacy and Security Notes

- Full paths remain local-only privileged data.
- Public DTOs use labels and channel/build hints instead of private directories.
- Validation messages are safe text and do not echo private paths.
- Evidence markers are names such as `Init`, `GameVersion`, or `JoinPU`, not raw lines.
- Directory names never become authoritative environment evidence by themselves.
- Unknown or future channel vocabulary normalizes to `UNKNOWN`; it is never coerced to `LIVE`.
- Renderer APIs expose product capabilities through the `window.astradock.source` and `window.astradock.monitor` namespaces: discover sources, select a known source, choose through a native dialog, scan/watch the selected source, and open the selected source folder.

## Verification Guidance

Run `npm test`.

The source-discovery tests use temporary directories and synthetic logs to verify:

- Supported Windows launcher and Steam-like layouts.
- Supported Linux LUG/Wine and Steam-like layouts.
- Non-default roots and restored preference revalidation.
- Missing, directory, malformed, and unsupported-channel states.
- No recursive arbitrary filesystem scanning.
- Public DTO and validation-message redaction.
