# AstraDock Local

[![CI](https://github.com/Presstronic/astradock-local/actions/workflows/ci.yml/badge.svg)](https://github.com/Presstronic/astradock-local/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-local%20desktop%20app-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)

> **Caveat emptor:** AstraDock Local is experimental software. It is provided for local testing and inspection at your own risk. The blueprint exporter is the only workflow currently intended for practical use; the rest of the application is unfinished, unstable, and not a deployable product.

AstraDock Local is an open-source Electron companion for Star Citizen. The project is being developed as a local-first tool that can turn selected information from the player's machine into useful telemetry and, eventually, support carefully controlled workflows around that information.

## Primary use: build the blueprint exporter locally

The main reason to clone this repository today is to build the focused, Exporter-only test application and generate a local blueprint file from supported Star Citizen logs. This workflow scans the selected environment's `Game.log` and matching `logbackups` files, deduplicates observed blueprint names, and writes a JSON, CSV, or XML file for manual use with AstraDock Station.

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

The artifact is written to `dist/standalone-exporter/` as a non-release, portable Windows executable. Start it, choose the Star Citizen installation directory, select the detected environment, run **Test export** if you want a preview, then run the JSON, CSV, or XML export and choose a destination file.

The current blueprint profile is intentionally narrow. It recognizes only owner-reviewed English `Received Blueprint` evidence for approved builds. The log evidence currently supplies the blueprint name, but not authoritative `type` or `shared` values; those fields remain empty in exported files rather than being guessed. See [`docs/exporter-focused-build.md`](docs/exporter-focused-build.md) and [`docs/blueprint-exporter-evidence-matrix.md`](docs/blueprint-exporter-evidence-matrix.md).

## Project status and known limitations

This repository is public so people can inspect the code, build the focused blueprint tool, and decide for themselves whether to run it. There are no release-quality support guarantees, and repository builds should be treated as test artifacts.

Currently implemented or explored:

- Local Star Citizen `game.log` discovery, validation, parsing, and incremental monitoring.
- Runtime telemetry views for selected log activity.
- A profile-gated, local blueprint export workflow with JSON, CSV, XML, preview, deduplication, and source diagnostics.
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

> **Community disclosure:** AstraDock Local is an unofficial, community-made Star Citizen tool. It is not affiliated with, endorsed by, sponsored by, or licensed by Cloud Imperium Games or Roberts Space Industries. Star Citizen and all related marks, logos, characters, and content belong to their respective owners. Official site: <https://robertsspaceindustries.com/>.

The project currently uses AstraDock-owned branding and does not bundle RSI/CIG imagery. Any future use of Fan Kit assets will be considered only after reviewing and accepting the current Fan Kit Agreement and confirming that its terms cover this public software distribution.

## Runtime Monitor local development

Settings now includes optional Station sign-in management, personal access/consent controls and inventory views, also reachable from the header's Station button. You can save your service configuration, but live Discord sign-in and inventory synchronization remain unavailable until Station's developer-portal integration is ready. Local monitoring and the overlay do not require an account. Inventory changes require review followed by two separate confirmations; offline inventory views clearly show when data was last updated.

In the event overlay, expand **Filter events** to select event categories, actions and item types. Selections narrow together: Purchase + Ammunition shows only ammunition purchases. Values within one group combine as alternatives; an empty group means all types. **Show all types** resets the overlay filters. Unknown items and events with no item have separate choices. Filters stay local, persist across runs and do not change capture or the main monitor.

Use the header's **Environment** selector to switch between installed `LIVE`, `PTU`, `EPTU`, `HOTFIX`, and `TECH-PREVIEW` logs. LIVE remains your source of truth; preview telemetry stays in separate local partitions. Logs are read in place: never copy preview logs into your LIVE installation. Switching clears the previous view and stops follow; choose **Start follow** or **Open event overlay** to follow the selected environment. Parser support still depends on reviewed build/channel evidence. See [environment isolation](docs/environment-isolation.md).

PTU build `4.10.199.13454` supports the reviewed inventory request-completion observations in the monitor and overlay. Other PTU gameplay events and preview builds remain evidence-gated. Unsupported/unverified builds display their parser status instead of silently waiting for events. Restart the updated app, select PTU, open the overlay and perform an inventory action to produce new post-launch records.

Friendly inventory results identify the item and, when matching request/queue evidence is available, its route: **Transfer reported: 10× Cruz bottles · location inventory → container · ownership unverified**. Explicit successful ground drops show **Ground drop reported** and **outgoing item reported**; generic interactions with an unresolved endpoint never imply a drop. Quantity is omitted when unknown; missing/ambiguous item context is labeled **item unknown**. Evidence details explain the inferred association, and Raw includes its original supporting records. Container kinds do not yet identify a named station, personal backpack or ownership; no inventory balance or Station update is applied. See [movement and ownership policy](docs/inventory-movement-and-ownership.md).

For controlled captures, the [local inventory audit](docs/location-inventory-tracking.md) compares original log markers/results with supported item/route associations and exposes unresolved counts, bulk/split/stack operations, failures and capture limits. Run `npm.cmd run audit:inventory -- --log '<original Game.log path>' --since '<capture start with timezone>'`; add `--output 'dist/capture-report.json'` to create a new local report. This diagnostic changes no inventory and makes no Station requests. Accurate local location-stock tracking is the current focus.

In Runtime Monitor, **Open event overlay** starts follow for the selected validated environment if stopped, then shows a curated gameplay feed: inventory actions, hand/helmet attachments, purchase requests and shop responses. An existing follow continues without restarting. Platform, XML, service and other debug records stay out of the overlay. New records appear at the top; older records move down. Adjust opacity as needed and use **Close** to dismiss it. Closing or subscribing to the overlay does not change capture or main-view filters.

Runtime capture is scoped to observations since AstraDock started, using a bounded recent log window rather than loading all historical records. Reopening the overlay can show the latest matching events from this run, up to 80. Restart the app after updating its code; fullscreen game visibility still depends on the OS/game display mode.

Use **View** beside opacity to switch between **Friendly** messages and **Raw log** records. For example, a matched buying-success response can show **5× MedPens purchased**. Raw mode shows the original contributing messages, including local identifiers; unavailable evidence is labeled. Evidence details preserve the distinction between shop-reported success and verified payment/delivery. The chosen view is saved locally. See the [message lookup and templates](docs/overlay-message-reference.md).

The capture-backed LIVE `4.10.197.2878` profile displays observed inventory, shop, vehicle-query and loadout signals. Purchase requests and shop-reported success remain distinct from verified payment or item delivery. See [display coverage and evidence limits](docs/captured-runtime-event-display.md).

## Documentation

- [`docs/exporter-focused-build.md`](docs/exporter-focused-build.md) — focused blueprint build and source-set behavior
- [`docs/blueprint-exporter-evidence-matrix.md`](docs/blueprint-exporter-evidence-matrix.md) — approved blueprint evidence and limitations
- [`docs/hardened-electron-boundary.md`](docs/hardened-electron-boundary.md) — renderer and IPC security boundary
- [`docs/runtime-log-tailer.md`](docs/runtime-log-tailer.md) — incremental log monitoring behavior
- [`docs/local-settings-and-privacy-controls.md`](docs/local-settings-and-privacy-controls.md) — local settings, retention, and reset behavior
- [`docs/diagnostics-and-support-export.md`](docs/diagnostics-and-support-export.md) — privacy-aware local diagnostics and support export
- [`docs/cig-community-guidance.md`](docs/cig-community-guidance.md) — current CIG/RSI disclosure and imagery policy used by the project
- [`docs/user-guide.md`](docs/user-guide.md) — installation, source selection, monitoring, privacy, troubleshooting, and uninstall guidance
- [`docs/mvp-requirement-traceability.md`](docs/mvp-requirement-traceability.md) — requirement-to-evidence audit and MVP non-goal review
- [`docs/release-readiness-audit.md`](docs/release-readiness-audit.md) — current v0.1.0 go/no-go decision and open release gates
- [`docs/release-notes-v0.1.0.md`](docs/release-notes-v0.1.0.md) — draft scope and limitations for v0.1.0
- [`docs/station-client-implementation.md`](docs/station-client-implementation.md) — delivered Station client boundaries, verification and live-integration blockers

## License

Released under the [MIT License](LICENSE). See the caveats above before running or redistributing builds.
