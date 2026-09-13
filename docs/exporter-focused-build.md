# Exporter-focused standalone build

The Exporter-focused artifact is a maintainer test build for validating the MVP Exporter workflow in isolation. It is not a supported release, portable distribution, or automatic-update target.

Run it from the repository root:

```sh
npm run dist:standalone:exporter:win
```

The command type-checks the application, compiles the renderer with Vite's `exporter` mode, and packages only a Windows x64 standalone test artifact with publication disabled. Output is isolated under `dist/standalone-exporter/` and is named `AstraDock-Local-<version>-exporter-standalone-test-x64.exe`.

The normal `npm run build`, `npm run dist`, and `npm run dist:standalone:win` commands use the normal renderer mode and retain Runtime Monitor, Exporter, and Settings as peer views. The focused renderer starts in Exporter and exposes only Exporter and Settings; unfinished workspaces and Runtime Monitor are not presented in that artifact. Settings remains available because it controls local retention, privacy, and source preferences used by Exporter.

Focused-build verification should confirm the artifact exists, starts in Exporter, permits keyboard navigation, and does not expose unfinished workspace controls. Do not transfer real logs, credentials, account identifiers, IP addresses, private paths, or extracted game assets with the artifact.

## Log source-set boundary

Exporter accepts only a source ID issued by main-process source discovery. The renderer never supplies a filesystem path. The user-selected installation root must be the `Roberts Space Industries` directory and must contain both `RSI Launcher` and `Star Citizen` (the legacy `StarCitizen` spelling is also accepted). Direct uppercase child directories under the game directory are offered as environments only when they contain a `Game.log`, including `LIVE`, `PTU`, `EPTU`, `HOTFIX`, `TECH-PREVIEW`, and future uppercase channel names. Before scanning, the main process revalidates the selected environment's `game.log`, resolves its sibling `logbackups` directory, and builds a deterministic set containing the current log followed by matching `Game Build(...) date (time).log` backups. Matching is case-insensitive and permits harmless spacing or suffix variation; unrelated names, directories, and temporary files are reported as skipped.

Each input is stat-checked before reading and streamed one at a time, so scan memory is bounded. Missing, permission-denied, malformed, empty, partial, replaced, or changed inputs are reported per file and do not expose full paths. A metadata fingerprint identifies the source set for diagnostics. If a file changes during the read, the output is retained as partial/diagnostic rather than claiming an unchanged snapshot. A missing `logbackups` directory is a valid current-log-only scan; a missing or inaccessible current log is retryable and cannot produce a successful export.

The Exporter configuration selects Blueprint Data, a validated environment, and JSON or CSV output. Test Export runs the same validation, scanning, profile, normalization, and progress pipeline without opening a save dialog or writing a file. JSON retains its array-of-records contract. CSV uses the deterministic `name,type,shared` columns, writes UTF-8 text with CRLF row endings, quotes every cell, doubles embedded quotes, and represents unknown `shared` values as an empty cell.

The native export workflow is single-flight and reports measured file, record, and duplicate counts as scanning proceeds; when a percentage cannot be derived it remains explicitly indeterminate. Save selection is performed by Electron's native dialog with an appropriate extension filter and overwrite confirmation. Output is written as UTF-8 through a unique, permission-restricted temporary file, flushed before an atomic rename, and removed if cancellation or failure occurs before commit. Recoverable dialog and write failures receive one automatic retry. A successful export reveals the destination in the user's file manager; the renderer displays only the output filename. Cancellation is honored through scanning and before the final rename, while a commit already completed is never falsely reported as cancelled.

## Installation discovery

On Windows, automatic discovery checks `C:\Program Files\Roberts Space Industries` first, then `D:\Program Files\Roberts Space Industries`. The first valid root supplies the primary RSI environment set; compatibility Steam roots remain bounded fallback candidates. A selected root must itself be the `Roberts Space Industries` directory and contain both `RSI Launcher` and `Star Citizen` (the legacy `StarCitizen` spelling is also accepted). Only immediate child directories with all-uppercase names and a readable `Game.log` are offered as environments. Invalid roots are reported without preventing startup.
