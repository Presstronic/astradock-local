# AstraDock Local

Fast local Electron app for reading Star Citizen `game.log` and showing recent shard history.

## Run

```bash
npm install
npm start
```

## Build

```bash
npm run dist
```

The normal distribution build targets only the approved release artifacts: a per-user Windows x64 NSIS installer and a Linux x86_64 AppImage. See [`ADR-0002`](docs/architecture/adr-0002-mvp-platform-packaging-and-update-policy.md).

Maintainers who need to copy a build to another Windows x64 machine for testing can create a separate, non-release standalone artifact:

```bash
npm run dist:standalone:win
```

The command creates `dist/standalone/AstraDock-Local-<version>-standalone-test-x64.exe`, never publishes it, and does not create an installer. It is a narrowly distributed test tool, not a supported release format or automatic-update target. Build, transfer, verification, data-retention, and cleanup guidance is in [`docs/windows-standalone-testing.md`](docs/windows-standalone-testing.md).

To create the focused Exporter-only standalone test artifact, run `npm run dist:standalone:exporter:win`. It starts in Exporter, hides unfinished and non-exporter workspaces, writes to `dist/standalone-exporter/`, and is never a release or upload target. See [`docs/exporter-focused-build.md`](docs/exporter-focused-build.md).

## Current Functionality

- Auto-discovers common Windows and supported Linux/Wine/Proton/LUG Star Citizen `game.log` sources without full-disk scanning.
- Lets you choose a custom `game.log` through a trusted native dialog and revalidates the saved source before reuse.
- Scans for shard entries and displays shard ID, name, region, build, last seen time, and source line.
- Monitors the selected log with an incremental byte tailer that tracks offsets, source generations, replacement, truncation, source loss/reappearance, and backpressure without watch-triggered whole-file rescans.
- Keeps full filesystem paths in the privileged process and shows privacy-safe source labels in the renderer by default.
- Uses a sandboxed, context-isolated renderer with a fixed capability API, validated IPC, sender checks, bounded subscriptions, and no arbitrary renderer-controlled network fetches.

The parser is intentionally heuristic because Star Citizen log formats vary between builds. Inspecting a row requests bounded local evidence detail so the parser can be tightened against real logs without sending raw context by default.

Exporter source scanning is local-only and source-ID based: it validates the selected environment's `game.log`, scans its matching sibling `logbackups` files in deterministic order, streams one file at a time, supports JSON/CSV output and no-write test exports, reports skipped or changing inputs, and exposes a privacy-safe metadata fingerprint. See [`docs/exporter-focused-build.md`](docs/exporter-focused-build.md) for the source-set contract.

Source discovery, validation states, privacy-safe DTOs, and local preference behavior are documented in [`docs/source-discovery.md`](docs/source-discovery.md).
The hardened Electron lifecycle and renderer API are documented in [`docs/hardened-electron-boundary.md`](docs/hardened-electron-boundary.md).
The resilient incremental monitor tailer is documented in [`docs/runtime-log-tailer.md`](docs/runtime-log-tailer.md).

Local settings, retention, privacy, and reset behavior are documented in [`docs/local-settings-and-privacy-controls.md`](docs/local-settings-and-privacy-controls.md).
Telemetry timestamp parsing, normalization, ordering, duration, persistence, and local display are governed by [`docs/time-contract.md`](docs/time-contract.md).
