# Local location-inventory tracking

Owner direction, 2026-11-02: focus on accurate local log capture and interpretation before specifying or connecting Station's API. The remote application is named **Station**. This document concerns the user client only; it introduces no API contract or connected feature.

## What we are measuring

The target is changes to **stored stock at a location**, excluding items carried on a person or ship. This is separate from aggregate ownership. A completed station-storage → backpack movement can leave ownership unchanged while reducing that location's stock. A later backpack → ground drop must not subtract from the original location again. A deposit back into location storage increases that location's stock. A split/merge within that same storage can change stack shape without changing its total stock.

Location identity, item, exact quantity, direction and completed outcome all need reliable evidence. A `:Location:` container kind alone is not a named station, and an `INVALID` endpoint does not identify world, hand or equipment. Failed, pending, duplicate, missing and ambiguous observations cannot silently become successful changes or zero quantities.

## Local capture audit

Run this against the **original** selected environment's Game.log after a controlled capture, preferably after exiting the game. No copied preview log is needed or permitted in LIVE. Use the actual absolute capture start time with a timezone; UTC is recommended.

```powershell
npm.cmd run audit:inventory -- --log 'D:\StarCitizen\PTU\Game.log' --since '2026-11-02T17:00:00Z' --output 'dist\ptu-inventory-capture-01.json'
```

Replace the example path/time with the real preview installation and your recorded start time. Use an existing output directory and a new output filename each run; existing files are never overwritten. Omit `--output` to print the report only. Reports are local diagnostics: review their timestamps/classes before sharing and keep real capture reports out of commits. The generated `dist` directory is ignored by Git.

The audit validates the source, independently reads its build/channel evidence and bounded recent window, and checks lossless file identity, size and modification metadata before/after. A changing/replaced/conflicting source blocks the report rather than presenting a mixed snapshot. Retry during a quiet interval or after the game exits. The tool never starts capture, changes source selection, writes to the game log, changes a balance or contacts Station.

The reader retains at most the existing 8-MiB suffix plus bounded header metadata. Reports retain at most 160 parsed non-query primary results. `truncated`, `trailingPartialRecord`, invalid/oversized-record counts, omitted parsed results and raw-versus-parsed result counts expose coverage limits. An unfinished final line is withheld. A complete report still does not prove the game logged every action.

Report fields:

| Field | Meaning |
| --- | --- |
| `scope` | Channel/build and production parser compatibility; unsupported builds still expose diagnostic marker counts without promoted changes |
| `observations.markers` | Counts of known source markers, including request/query/access/UI/corroboration records; not action counts |
| `requestsByOperation` | Raw Add-record vocabulary, including unsupported Store/Split/StackAll/bulk contexts |
| `locationRequestsByOperation` | Add records with a typed Location source/target; intent only, not completed changes |
| `bulkItemRequests`, `zeroSourceQueueQuantities`, `unknownInventoryMarkers` | Leads or gaps requiring investigation; unknown markers are counted without exposing their text |
| `primaryResultRecords`, `parsedPrimaryResults`, `unparsedPrimaryResultRecords` | Non-query primary source records versus supported parser observations; not a recall percentage |
| `secondaryResultRecords` | Completion echoes, including query echoes; never add these to primary results to count changes |
| `results[].status` | Reported location change, unknown item/request context, unknown route/count, failure, unknown outcome, or no location change identified in a correlated route |
| `candidateLocationEffects` | Signed integer source/destination effects from fully resolved reviewed routes and positive source/request quantity; diagnostic only, never applied balances |
| `namedLocation` | Currently null: no named-location binding has been promoted |

Raw text, source paths, actor/account/container/entity IDs and credentials are omitted. Byte offsets allow local inspection against the original file. Item classes and timestamps are still local gameplay data. This report is not an inventory snapshot, deduplicated inventory ledger, auto-generated Station submission or complete list of physical user actions.

Implementation: `src/locationInventoryAudit.js`, `scripts/auditLocationInventory.js`; verification: `test/locationInventoryAudit.test.js`. The diagnostic reuses the existing production parser and bounded request/route association, rather than creating a competing gameplay detector. No dependency or canonical schema changes.

## Coverage and required local work

Evidence is in the [catalog](runtime-observation-catalog.md), [route ledger](runtime-capture-findings-2026-11-02-inventory-routes.md) and [audit ledger](runtime-capture-findings-2026-11-02-inventory-audit.md). An observed signal and tested parser behavior are distinct from repeatable gameplay detection.

| Action or condition | Current client evidence/status | Required before accurate location tracking |
| --- | --- | --- |
| Single/stack Move involving Location | Reviewed LIVE request/queue/result routes and positive source count; local diagnostic candidates | Timed bidirectional examples, exact per-location identity and repeatability; quantity is not independent delivered-count verification |
| Store into Location | PTU presentation handles reversed queue direction; zero source counts remain unknown. LIVE Store item context is still withheld | Establish quantity from a reliable attributable source; review LIVE separately; do not substitute `ItemsCount` |
| Quick equip/AttachItem/Carry from Location | Typed source and request counts can exist with unresolved destination | Prove the location-side stock effect using owner annotations and exact request/result/attachment attribution; exclude previews/background loadout work |
| Inventory-grid ground drop | Explicit reviewed LIVE Drop caller/queue/success; Location source can produce a diagnostic outgoing candidate | Repeat from Location and backpack separately; no extra location decrement for a backpack drop |
| Held place/throw and ground recovery | Prior owner-confirmed throw has no accepted log detector | Separate timed captures; do not treat carry, spawn or cleanup as drop/recovery |
| Split/merge/StackAll | Observed LIVE Split and StackAll, including successful same-location Split and two failed StackAll results | Prove stack reconciliation without inventing stock additions/removals; retain failures as no successful change |
| Bulk/move-all | Observed bracketed class list with NULL/zero queued source | Determine per-item quantities/completion from actual evidence; never treat list as one item or guess count one |
| Location query/paging | RequestLocationInventory and InventoryManagement paging metadata observed | Determine whether complete item quantities and a consistent snapshot are logged; missing rows/pages are not losses |
| Location identity | Location-kind IDs and location request/update markers observed | Exact persistent-storage ID → named-location evidence; current player location alone is insufficient |
| Ship/person ↔ location | Generic Container is not necessarily a ship, backpack or personal storage | Exact container identity/type attribution, then count only the location side; person ↔ ship alone is outside location stock |
| Purchase delivery/sale/consumption of stored goods | Shop success alone does not prove delivery/location; no accepted full location-effect family | Per-action evidence for whether and where location stock actually changed |
| Nested filled container | No accepted recursive-content rule | Test whether moving the container also moves item contents; avoid losing/double-counting nested stock |
| Cancel/failure/partial request | Failed StackAll evidence now retained; missing intent/completion remains unresolved | Attributable failed/cancelled/time-out cases, no success on timeout, and explicit incomplete activity |
| Rapid/interleaved/repeated actions | Existing bounded identity/time/session guards and duplicate-echo exclusion | Match every annotated action once across bursts; distinguish correlation expiry, eviction and truly absent signals |
| Restart/rotation/truncation/offline intervals | Existing tailer recovery guards; presentation uses a bounded recent window | A local movement journal independent of overlay filters/history; stable semantic identity and explicit capture gaps before any balance projection |
| New patches/environments | Exact reviewed build policies and separate sources; diagnostics on unsupported builds | Separate per-build/channel fixtures and replay comparisons; never force LIVE rules onto preview data |

## Work order and acceptance gate

1. **Measure current coverage locally.** Use the audit and the timed runbook; retain unmatched/unsupported records and reasons. The new audit is this step, not a declaration that comprehensive tracking is finished.
2. **Close quantity, route and location-identity gaps.** Investigate Store, bulk, split/merge, exact container identity and query/page contents. Promote each narrowly supported action with sanitized positive/negative fixtures and repeatability evidence. Keep direct evidence separate from user-confirmed ground truth.
3. **Maintain one local movement lifecycle per physical action.** Correlate intent, processing, primary/echo outcomes and corroboration independently of renderer state. Persist a versioned minimized local movement journal with deterministic replay, scoped deduplication, explicit incomplete/expired/conflicting states, and bounded resource/retention behavior. This journal remains future local work; current transient overlay context is not that journal. Design its contract before implementation.
4. **Validate location stock effects against controlled gameplay.** Start with known before/after counts in the game for each location. Test that withdrawals, deposits and internal stack changes reconcile exactly once; unknown baselines remain unknown. Do not reconstruct all current inventory by summing incomplete historical logs.
5. **Only after local evidence is accepted, revisit Station integration.** No API specification or connection work is authorized by this investigation.

Use [the capture runbook](preview-patch-capture-runbook.md#inventory-route-and-ownership-validation), extended with move-all, split/merge, Store, failed/cancelled operations, filled containers, ship/person crossings and multiple named locations. Record visible before/after counts and exact UTC times. Repeat in another session/build. For every owner action, classify matched, incorrectly matched, incomplete, ambiguous, or no signal identified. Record false positives during idle/query/preview-only controls separately. Do not report a percentage without a complete ground-truth action ledger and a declared denominator.

Acceptance for each supported action/build requires: correct item/count/location-side direction; attributable completed outcome; one effect per physical action across echoes/replay/restart; no stock effect from failed/preview/query/internal-stack operations; explicit unsupported/unknown states; tested capture/source boundaries; sanitized fixtures, updated ledger/catalog and reviewed local implementation. Any unverified action remains listed as a gap. Named location, current totals and org/personal ownership must not be guessed to make a test pass.
