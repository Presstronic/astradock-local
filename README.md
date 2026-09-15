# AstraDock Local

[![CI](https://github.com/Presstronic/astradock-local/actions/workflows/ci.yml/badge.svg)](https://github.com/Presstronic/astradock-local/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-local%20desktop%20app-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)

> **Caveat emptor:** AstraDock Local is experimental software. It is provided for local testing and inspection at your own risk. The blueprint exporter is the only workflow currently intended for practical use; the rest of the application is unfinished, unstable, and not a deployable product.

AstraDock Local is an open-source Electron companion for Star Citizen. The project is being developed as a local-first tool that can turn selected information from the player's machine into useful telemetry and, eventually, support carefully controlled workflows around that information.

## Primary use: build the blueprint exporter locally

The main reason to clone this repository today is to build the focused, Exporter-only test application and generate a local blueprint file from supported Star Citizen logs. This workflow scans the selected environment's `Game.log` and matching `logbackups` files, deduplicates observed blueprint names, and writes a JSON or CSV file for manual use with AstraDock Station.

The exporter is local-only. It does not upload logs or automatically synchronize with Station.

### Requirements

- Windows x64 is the primary supported workload for the focused build.
- Node.js 22.14.0 or a compatible Node 22 release.
- A valid Roberts Space Industries Star Citizen installation with a supported `Game.log`.

### Build the focused blueprint application

```bash
npm ci
npm run dist:standalone:exporter:win
```

The artifact is written to `dist/standalone-exporter/` as a non-release, portable Windows executable. Start it, choose the Star Citizen installation directory, select the detected environment, run **Test export** if you want a preview, then run the JSON or CSV export and choose a destination file.

The current blueprint profile is intentionally narrow. It recognizes only owner-reviewed English `Received Blueprint` evidence for approved builds. The log evidence currently supplies the blueprint name, but not authoritative `type` or `shared` values; those fields remain empty in exported files rather than being guessed. See [`docs/exporter-focused-build.md`](docs/exporter-focused-build.md) and [`docs/blueprint-exporter-evidence-matrix.md`](docs/blueprint-exporter-evidence-matrix.md).

## Project status and known limitations

This repository is public so people can inspect the code, build the focused blueprint tool, and decide for themselves whether to run it. There are no release-quality support guarantees, and repository builds should be treated as test artifacts.

Currently implemented or explored:

- Local Star Citizen `game.log` discovery, validation, parsing, and incremental monitoring.
- Runtime telemetry views for selected log activity.
- A profile-gated, local blueprint export workflow with JSON, CSV, preview, deduplication, and source diagnostics.
- Electron isolation, validated IPC, local filesystem boundaries, and privacy-oriented defaults.

The broader Runtime Monitor, Station integration, account/authentication workflows, data retention model, and production packaging are not ready for deployment. Expect breaking changes, incomplete screens, unsupported Star Citizen builds, parser drift, and behavior that may change without notice.

## Roadmap overview

The long-term direction is intentionally staged:

1. **Blueprint workflow:** improve evidence coverage, validate the export contract, and document the supported build and locale boundaries.
2. **Local telemetry foundation:** make log tailing, normalized events, persistence, replay, rules, diagnostics, and UI behavior reliable enough for broader testing.
3. **Selective Station workflows:** define consent-driven authentication, synchronization, privacy minimization, retries, and compatibility only after the local contracts are stable.
4. **Future game-data exploration:** investigate whether optional reading of installed game data could provide useful context that logs do not contain. This remains high-level exploratory work and is subject to additional technical, legal, licensing, and game-policy review. No future game-file capability, data extraction scope, redistribution plan, or ToS position is promised by this repository.

The roadmap is not a commitment to a release schedule. The current proof of concept does not define the final architecture or product experience.

## Development

Run the application locally:

```bash
npm ci
npm start
```

Run the complete verification suite:

```bash
npm test
```

Create normal development builds:

```bash
npm run dist
```

Other test artifacts and focused-build details are documented in [`docs/windows-standalone-testing.md`](docs/windows-standalone-testing.md) and [`docs/exporter-focused-build.md`](docs/exporter-focused-build.md).

## Privacy and safety

Keep real logs, credentials, account identifiers, IP addresses, local paths, and extracted game data out of issues, pull requests, fixtures, and releases. Raw logs remain local by default. Review generated files before sharing them; even sanitized-looking game logs may contain identifying or sensitive information.

The application is not affiliated with or endorsed by Cloud Imperium Games. Star Citizen, Roberts Space Industries, and related marks belong to their respective owners.

## Documentation

- [`docs/exporter-focused-build.md`](docs/exporter-focused-build.md) — focused blueprint build and source-set behavior
- [`docs/blueprint-exporter-evidence-matrix.md`](docs/blueprint-exporter-evidence-matrix.md) — approved blueprint evidence and limitations
- [`docs/hardened-electron-boundary.md`](docs/hardened-electron-boundary.md) — renderer and IPC security boundary
- [`docs/runtime-log-tailer.md`](docs/runtime-log-tailer.md) — incremental log monitoring behavior
- [`docs/local-settings-and-privacy-controls.md`](docs/local-settings-and-privacy-controls.md) — local settings, retention, and reset behavior

## License

Released under the [MIT License](LICENSE). See the caveats above before running or redistributing builds.
