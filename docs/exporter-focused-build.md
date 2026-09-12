# Exporter-focused standalone build

The Exporter-focused artifact is a maintainer test build for validating the MVP Exporter workflow in isolation. It is not a supported release, portable distribution, or automatic-update target.

Run it from the repository root:

```sh
npm run dist:standalone:exporter:win
```

The command type-checks the application, compiles the renderer with Vite's `exporter` mode, and packages only a Windows x64 standalone test artifact with publication disabled. Output is isolated under `dist/standalone-exporter/` and is named `AstraDock-Local-<version>-exporter-standalone-test-x64.exe`.

The normal `npm run build`, `npm run dist`, and `npm run dist:standalone:win` commands use the normal renderer mode and retain Runtime Monitor plus Exporter navigation. The focused renderer starts in Exporter and exposes only Exporter and Settings; unfinished workspaces and Runtime Monitor are not presented in that artifact. Settings remains available because it controls local retention, privacy, and source preferences used by Exporter.

Focused-build verification should confirm the artifact exists, starts in Exporter, permits keyboard navigation, and does not expose unfinished workspace controls. Do not transfer real logs, credentials, account identifiers, IP addresses, private paths, or extracted game assets with the artifact.

## Log source-set boundary

Exporter accepts only a source ID issued by main-process source discovery. The renderer never supplies a filesystem path. Before scanning, the main process revalidates the selected LIVE `game.log`, resolves its sibling `logbackups` directory, and builds a deterministic set containing the current log followed by matching `Game Build(...) date (time).log` backups. Matching is case-insensitive and permits harmless spacing or suffix variation; unrelated names, directories, and temporary files are reported as skipped.

Each input is stat-checked before reading and streamed one at a time, so scan memory is bounded. Missing, permission-denied, malformed, empty, partial, replaced, or changed inputs are reported per file and do not expose full paths. A metadata fingerprint identifies the source set for diagnostics. If a file changes during the read, the output is retained as partial/diagnostic rather than claiming an unchanged snapshot. A missing `logbackups` directory is a valid current-log-only scan; a missing or inaccessible current log is retryable and cannot produce a successful export.
