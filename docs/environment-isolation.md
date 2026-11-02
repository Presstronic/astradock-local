# Game environment isolation

Owner direction, 2026-11-02: LIVE is the source of truth. Testing a preview game installation must not mix its logs, telemetry or exports into LIVE. This concerns Star Citizen game channels, not Station service deployment profiles.

## User behavior

- The Runtime Monitor header has an explicitly labeled **Environment** selector. It lists discovered sources for LIVE, PTU, EPTU, HOTFIX and TECH-PREVIEW; unavailable/conflicting candidates carry a reason and cannot be selected. Duplicate installations remain independently selectable with numbered source labels. Full source paths stay out of this control.
- The environment notice identifies LIVE as the source of truth and preview channels as isolated local data. Source details and the Exporter retain their existing explicit path inspection flows.
- Switching to a different source stops follow, clears the previous scan, current-state projections, stream selection/browsing/search/filters, evidence detail, notifications, tailer health/checkpoint and overlay feed. Existing durable telemetry remains in its original partitions. A failed scan of the new source leaves an empty view with an actionable error; it does not restore the old environment's rows.
- Select **Start follow** to monitor the new source. **Open event overlay** also starts follow when stopped, using the selected validated source and bounded launch-time bootstrap. Reopening while already following preserves the existing monitor. A missing/invalid source or failed initial capture prevents opening and reports an error. The overlay renderer itself cannot control capture; subscribing, closing, changing Friendly/Raw or filtering remains passive.
- The selected source is remembered across restarts. A missing or invalid saved source never silently selects LIVE or another environment. Choose a valid candidate explicitly.
- Exporter selections use the same source transition. Results reset on source changes; default export filenames include the channel, for example `astradock-blueprints-ptu.json`. Files contain the existing Station-compatible blueprint schema; the filename does not authorize an upload or change that schema.
- Compatibility > Registered builds is ordered by descending numeric build identifier, including after family filtering; newest registered build is initially selected. Registration and parser capability remain separate claims.

## Engineering boundaries

No dependencies are added. `src/gameEnvironments.js` owns the shared channel vocabulary and observed-channel conflict checks. The canonical contract now recognizes TECH-PREVIEW explicitly instead of normalizing it to UNKNOWN. Existing parser profile allowlists remain unchanged; this does not claim new preview gameplay support.

Canonical events, deduplication, checkpoints and projections already use `environmentKey`, which includes channel, universe, build, branch and source installation identity. All game channels retain separate keys in the existing encrypted database; no separate database, copied log or synthetic LIVE path is needed. The renderer additionally scopes its shared stream query to the active canonical environment key.

The main process serializes source changes, explicit monitor commands and exports. A source transition invalidates the monitor generation; old live scans cannot publish, save events, restore an old snapshot or modify a newer scan's scheduling state. Scan/export commands cannot implicitly select an unselected source. Source preferences are saved before a manual selection is activated. The `monitor.source_changed` subscription message clears renderer state even when the subsequent scan fails. Renderer evidence requests and scan responses are invalidated by source changes; late messages from other sources/channels are ignored.

Validation compares observed release markers with both selected and canonical path channels, rejecting conflicting symlink aliases and mixed-channel samples. Bounded runtime capture also checks header provenance, even when the header predates app launch or the file lives outside a channel folder, and checks the captured suffix before parsing/persistence. Source metadata remains bounded; this is not an unlimited historical log audit.

The blueprint exporter scans only the selected source and its own `logbackups` directory. It checks channel evidence throughout each file and holds its observations separately until the file completes and its fingerprint is stable. A conflicting/mixed/changed file contributes no records, including notifications appearing before the conflicting marker. Other valid files may still export with explicit warnings. A file with no channel markers can only inherit its containing source's channel: AstraDock cannot prove the original environment of an untagged manually copied file. Keep originals in their own installations and review exports before any manual Station import.

No Star Citizen file is written, moved, renamed or copied. Raw evidence remains transient and bounded. No telemetry-to-inventory proposals, Station destinations or production API contracts are added; automatic Station synchronization remains disabled. Changing a game environment never grants remote access or consent.

## Compatibility and verification

Existing rows and environment keys are not rewritten. Previously stored TECH-PREVIEW observations that normalized to UNKNOWN remain UNKNOWN; automatically relabeling them would assert unproven provenance. New TECH-PREVIEW observations use their own partition. The database schema and source-preference format are unchanged. Existing export filenames chosen by the user are not renamed.

Run `npm test`, `npm run build:renderer`, `npm run security:check`, `npm run docs:check`, and `git diff --check`. Focused coverage lives in `test/mainSourceIsolation.test.js`, `test/environmentSwitching.test.tsx`, `test/sourceDiscovery.test.js`, `test/runtimeCaptureWindow.test.js`, `test/runtimeEvents.test.js`, `test/buildCompatibilityCatalog.test.js`, and `test/blueprintExporter.test.js`.

Happy path: select LIVE, open the overlay while stopped, verify follow starts, reopen without restarting, switch to PTU/HOTFIX/TECH-PREVIEW, verify old data disappears and follow stops, then open the overlay to start following the new source. Return to LIVE and verify its source remains unchanged. Export each environment and inspect its channel-specific filename and records. Filter Registered builds by family and verify descending build order.

Unhappy path: remove a saved preview log while LIVE remains available; restart and verify no automatic fallback. Select an inaccessible or conflicting source; verify the current selection is retained and an error is shown. Inject delayed LIVE scan/evidence completion after switching; verify it cannot repopulate preview. Put explicit PTU evidence in a synthetic LIVE file or backup and verify capture/export exclusion. Fail initial overlay bootstrap and verify follow stops without opening an overlay. Repeat with unsupported parser builds/channels; retain explicit unsupported state instead of claiming semantic coverage.

Synthetic UI screenshots, when included in a PR, demonstrate layout only. Real Star Citizen sessions, Windows file permissions/symlinks, in-game overlay stacking and Linux behavior require platform testing; passing unit tests does not establish those gameplay observations.

Review images: [preview environment selector (synthetic)](images/environment-preview-synthetic.png) and [newest-first registered builds](images/compatibility-newest-synthetic.png).
