# AstraDock Local user guide

This guide describes the current experimental local application. It is not a promise that Star Citizen, Wine, Proton, Linux distributions, or any third-party service supports the same environments. Read the release qualification and known limitations before using a build.

## Install and support

The current repository is intended for controlled testing. Node.js 22.14.0 (or a compatible Node 22 release) is required to build it. The intended v0.1.0 packaging policy is documented in [`ADR-0002`](architecture/adr-0002-mvp-platform-packaging-and-update-policy.md): Windows x64 is primary, Linux x86_64 uses an AppImage, and unsigned/unqualified artifacts are not production release claims.

Do not run the application as administrator/root. Keep the repository, logs, credentials, account identifiers, IP addresses, and generated exports out of public bug reports.

## First run and source selection

1. Start AstraDock and open the source selector.
2. Select the Roberts Space Industries directory when available. AstraDock checks the bounded installation layouts and uppercase environment directories containing `Game.log`.
3. If discovery fails, use the native file chooser to select a valid `game.log`.
4. Select the environment whose channel/build is shown as valid. A missing, inaccessible, malformed, unsupported, or non-log source remains unavailable and does not start monitoring.
5. Start monitoring and confirm the header shows the source environment and monitor state.

Source paths are used locally by the main process. The renderer receives privacy-safe labels and source IDs, not arbitrary filesystem capabilities. A moved or replaced source must be revalidated.

## Runtime Monitor

The Runtime Monitor has three kinds of information:

- The header identifies the active environment/build and whether monitoring is active, stale, disconnected, transitioning, or unavailable.
- Current-state sections summarize only evidence-backed shard/server, session, party, mission, destination, vehicle, location, and health facts. `Unknown`, `unsupported`, and `last confirmed` are meaningful states, not failures to hide.
- The Terminal and Table views are two presentations of the same bounded event stream. Select an event to open shared drilldown; selection is by stable event identity, not row position.

Shard identity and server connection are separate. A server endpoint is sensitive and is not dominant display content. Party communication-range changes are not server disconnects. Mission, destination, location, and vehicle states remain unavailable where the fixture corpus does not prove a transition.

Use live-follow to keep the newest event visible. Browsing pauses follow mode until it is resumed. Renderer reload does not itself stop the main-process monitor; reconnecting obtains a fresh snapshot.

## Event detail and provenance

Rows show a concise label, timestamp, environment, freshness, confidence, and provenance where available. Provenance means `observed`, `extracted`, `inferred`, or `enriched`; the MVP local monitor primarily uses `observed` and `inferred`. Evidence detail is local, bounded, and requested explicitly. Sensitive events may show a redacted payload.

No raw log line is uploaded by the MVP. The current application has no Station authentication or synchronization workflow.

## Settings, retention, and deletion

Settings controls the dark theme, stream presentation, density, drawer placement, and telemetry retention from 1–365 days; the default is 30 days. Telemetry is stored locally in an encrypted SQLite database when operating-system secure storage is available. If secure storage is unavailable, telemetry storage fails closed.

Retention removes expired telemetry. Deletion commands have explicit scope: sensitive evidence, one environment, all telemetry, or full reset. Full reset stops monitoring, removes AstraDock settings and source preference, and does not delete Star Citizen files or exports that the user saved elsewhere. Confirm destructive actions only after reading their stated scope.

## Diagnostics and troubleshooting

Diagnostics report monitor, source, parser, and storage health without exposing source paths or raw evidence. Diagnostic files are local, bounded, rotating, and privacy-sanitized.

Common outcomes:

- **No source found:** choose the installation directory or a validated `game.log` manually.
- **Permission denied:** close programs that restrict the file and verify the current user can read it; do not elevate AstraDock by default.
- **Unsupported or changed build:** retain the diagnostic result and do not assume events were recognized. A new profile requires reviewed evidence.
- **Stale/disconnected:** verify Star Citizen is running and the selected log is still being appended to; replacement or rotation may require recovery.
- **Storage unavailable:** check OS secure-storage configuration and available local disk space. The app must not silently fall back to plaintext telemetry.
- **Malformed input:** keep the raw log private and provide only a sanitized fixture or diagnostic summary to maintainers.

## Uninstall and local data

The v0.1.0 policy requires an explicit retain/delete choice during uninstall. Retain is the safe default. Application reset/deletion covers AstraDock-owned settings, telemetry, checkpoints, caches, and diagnostics within its documented scope; it never removes Star Citizen installation files, compatibility prefixes, or user exports.

## Current limitations

The current repository is not a release-ready v0.1.0. Station sync, background monitoring, installed game-data mining, user-authored rules, historical analytics, production signing, complete installers/update validation, support-export workflow, performance qualification, and full accessibility qualification remain gated work. See [`release-readiness-audit.md`](release-readiness-audit.md) and the issue links it cites.
