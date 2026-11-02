# Capture-backed event display

## Scope

| Field | Value |
| --- | --- |
| Owner authorization | 2026-10-29: persistent overlay; today's objective signals displayed newest first |
| Evidence | `CAP-2026-10-29-01/02`; [catalog](runtime-observation-catalog.md) |
| Profile | `sc-4.10-live@2026-10-29.1` |
| Current presentation revision | `sc-4.10-live@2026-10-29.2`; [Friendly/Raw message contract](overlay-message-reference.md) |
| Build | LIVE `4.10.197.2878`; branch `sc-alpha-4.10.2` or unavailable metadata |
| Build evidence | Subsequent active-log header read: FileVersion/ProductVersion `4.10.197.2878`, branch `sc-alpha-4.10.2`, changelist `12913470` |
| Contract | `RuntimeLogSignalObserved`, `runtime-event/v1` |
| Coverage | 40 catalog signal IDs; 48 minimized representative fixture records |
| Certainty | The client logged a signal; unlogged gameplay outcomes and local attribution remain unproven |

This profile does not inherit 4.9 lifecycle/gameplay extractors. Untested builds and channels retain compatibility gates. Fixture validation is separate from repeated in-game reliability.

## Display coverage

| Signals | Category | Facts |
| --- | --- | --- |
| `INV-01` through `INV-19` | Action | Request/queue/process/result, drop/move/carry intent, unstow, query/UI/access, attachment ports, preview and cache activity |
| `SHP-01`, `SHP-02` | Action | Requested item/quantity/client price; separate buying response/result/processing state |
| `VEH-01` through `VEH-03` | Vehicle | List/inventory queries, separate subsystem counts, completion; no ownership or retrieval inference |
| `LOAD-01` | Runtime | Inventory/entity queries and dummy-spawn timings; no equipment change |
| `ENV-01` through `ENV-04`, `SYS-01`, `ATC-01` | Runtime | Platform/reference/effect/light state, service-channel reuse and storage-tracking reset |
| `DIA-01` through `DIA-08`, `NAV-01` | Diagnostic | Engine/UI/attachment errors and unattributed route guard; no player failure, owned-item loss or DGS handoff inferred |

Stage labels remain literal: **Inventory move requested**, not **Items transferred**; **Shop buying response**, not **Money paid**. Intermediate records are not additional completed user actions.

## Data and privacy

- Required fields: closed signal ID, category, label and generated summary. Request ID, operation, item class, quantity, client price, shop, kiosk state, result, elapsed seconds and attachment port are explicit `null` when unknown.
- Query/management IDs have separate namespaces; this display does not correlate them into completed actions. Price basis/currency and delivered quantities remain unverified.
- Generated summaries exclude raw messages, player/account/entity/container IDs, machine paths and endpoints. Events retain source time/position/generation, profile and evidence reference; Station sync remains `never`.
- Owner-requested Raw mode is a separate local overlay transport: original contributing records come from a bounded transient cache, never canonical payloads or the main scan DTO. See the message contract for limits and privacy.
- Distinct source records remain distinct; replay uses deterministic identity. Legacy generic action rows are suppressed when the same source line has a normalized observation.

## Ordering and visibility

1. Main stream: newest source occurrence first; source line and stable ID break ties.
2. Overlay: newest first, duplicate IDs removed, maximum 80 matching records; missing/invalid times last.
3. New arrivals return the live viewport to the top, including arrivals when the first ID is unchanged. Browser scroll anchoring is disabled in the overlay, Terminal and Table. Explicit main-stream history browsing preserves position until Return to live.
4. Content clicks, scrolling, opacity changes and focus transitions do not dismiss it. Close/native close explicitly dismiss it.
5. Opening uses `showInactive`; visible focus transitions reassert topmost stacking without taking game keyboard focus. Hidden overlays stay hidden.

The overlay now uses its own curated policy, independent of the main Kind filter. Exclusive-fullscreen/compositor behavior requires manual Windows testing; unit tests do not establish game visibility.

## Passive overlay and capture scope

| Rule | Behavior |
| --- | --- |
| Included by default | `INV-04` non-query primary results; `INV-05/06/07` drop/move/carry requests; `INV-09` grid closure; `INV-13/14/15` hand/hook attachments; `SHP-01/02` buying requests/responses |
| Excluded from overlay | Platform/XML, service, diagnostic, drag-preview, queue/access/query, cache, loadout-initialization and duplicate completion records. All 40 observed categories remain available to the main monitor/parser. |
| Capture boundary | Main process records AstraDock launch time. Runtime scans and overlay snapshots include only this run's observations from the selected active log/environment. No archive or durable-history query is used to populate the overlay. |
| Reading | Up to 64 KiB of header metadata plus a reverse-read recent suffix, capped at 8 MiB. Older history is not materialized. Capture-window metadata marks truncation when the cap applies. |
| Evidence coordinates | Bounded reads use absolute source byte offsets, not fabricated absolute line numbers. Moving the window preserves event IDs. Earlier session state can remain unknown. |
| Isolation | The main process produces the feed directly from canonical events, even when the main renderer is inactive. The overlay has only feed subscription, its own close, and opacity preferences. |
| Capture control | Per owner direction on 2026-11-02, the main-window **Open event overlay** command starts selected-source follow when stopped and preserves an existing follow. Overlay subscription, presentation controls and close cannot start/stop/scan capture, change main filters, query history or run exports. See [environment isolation](environment-isolation.md). |
| Bounds | At most 80 deduplicated gameplay entries, newest first; reopening uses the same run boundary. Restarting AstraDock establishes a fresh boundary. |

## Verification

The initial all-category implementation passed its test/build checks and a read-only full-log verification. That diagnostic scan is not the overlay's current history policy. The follow-up adds gameplay curation, a launch-time boundary, bounded reading, passive capability isolation and live viewport regression tests. Final verification uses `npm.cmd test`, `npm.cmd run build:renderer` and `git diff --check`; manual game checks remain separate.

| Tests | Coverage |
| --- | --- |
| `capturedRuntimeSignals.test.js` | 48 immutable payloads / 40 IDs, chunk/replay identity, scan delivery, duplicate legacy-row suppression, malformed input, build/channel gates, privacy and nullable contracts |
| `eventOverlayWindow.test.js` | Pinning/focus/close/reopen policy; legacy unpin preference migration; renderer isolation |
| `eventOverlay.test.tsx` | Close-only dismissal, rejected-close errors, newest-first insertion, scroll, dedupe and bounds |
| Fixture corpus / existing suites | Sanitization, contracts, parser and renderer regressions |
| `runtimeStreamScroll.test.tsx` / shared stream tests | Main Terminal/Table live following, preserved browsing, horizontal position, real timestamp ordering across offsets |
| `overlayEventFeed.test.js` | Gameplay-only whitelist, run/environment cutoff, deduplication and preload capability isolation |
| `runtimeCaptureWindow.test.js` | Bounded suffix/header reading, empty history window, cancellation and stable byte-addressed identities |

Manual steps:

1. Restart the updated app, select a valid environment and open the overlay while follow is stopped. Verify follow starts for that environment. Reopen while following and verify capture is not restarted. With no valid source, opening must fail without starting capture.
2. Perform purchase/inventory/attachment actions; check gameplay-only labels, top insertion, and absence of pre-launch history. Changing the main Kind filter must not change overlay curation. Switch environments and verify old rows disappear and follow stops; open the overlay to start follow for the new source.
3. Click content/opacity controls, scroll and return game focus; explicitly close and reopen.
4. Repeat at minimum overlay width and in windowed/borderless/exclusive-fullscreen modes; record limitations.

No automatic drinking, empty-bottle, held-bottle throw, wallet debit, purchase-delivery, UI-opening or settlement event is asserted. Owner annotations remain separate; historical actions are not fabricated as new live events.
