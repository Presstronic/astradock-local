# Local inventory coverage inspection — 2026-11-02

`CAP-2026-11-02-INVENTORY-AUDIT-01` is a bounded read-only inspection of separate original LIVE 4.10.197.2878 and PTU 4.10.199.13454 logs. Owner direction is to establish reliable **local location-stock changes before Station API work**. No timed action ledger was supplied for this inspection; no capture recall or repeatability claim is made. No original logs were copied into LIVE, edited, committed or uploaded.

The new [local audit](location-inventory-tracking.md) runs the existing production parser/correlation over a validated stable bounded capture and reports unresolved cases. It does not enable new canonical gameplay families, update inventory totals or contact Station. Prior [route](runtime-capture-findings-2026-11-02-inventory-routes.md) and [item](runtime-capture-findings-2026-11-02-ptu-item-context.md) findings remain intact.

## Snapshot observations

Both runs used cutoff 2026-11-02T17:00:00Z. Source inventory-record bounds were LIVE 18:39:44.942–20:51:39.091 UTC and PTU 17:15:23.045–18:08:50.962 UTC. Neither bounded window was truncated or ended with a partial record; no parsed results were omitted by the 160-result report cap.

| Diagnostic observation | LIVE | PTU |
| --- | ---: | ---: |
| Add QueryInventory records | 60 | 6 |
| Add Move / Drop / Interaction / Store | 18 / 2 / 9 / 6 | 0 / 0 / 11 / 6 |
| Add Split / StackAll | 2 / 5 | 0 / 0 |
| Non-query primary result records; parsed | 42; 42 | 17; 17 |
| Reported quantified location-route candidates | 6 | 0 |
| Item/request context unresolved | 12 | 0 |
| Route unresolved | 9 | 11 |
| Quantity unknown | 0 | 6 |
| Correlated route without an identified location change | 13 | 0 |
| Reported failure | 2 | 0 |
| Bulk item-class request records | 1 | 0 |
| Non-query queued zero source amounts | 12 | 6 |

These are source/result diagnostics, not unique action counts, inventory totals, false-negative rates or evidence that PTU had no location changes. Query/echo/access/UI/spawn records must not be added as extra inventory changes. LIVE's two additional non-query requests/results compared with the prior route inspection reflect a later source suffix, not an earlier-count correction.

## New and retained signals

| Signal / metadata | Observed fields or counts | Boundary / next investigation |
| --- | --- | --- |
| Update Inventory Location | LIVE 4 / PTU 1 records | Location-context lead; no named-location binding promoted. |
| RequestLocationInventory | LIVE 13 / PTU 1; Player and Location | Storage identity/query lead, not a stock change or a named station by itself. |
| InventoryManagement | LIVE 35 records; Inventory, Player, Data, Elapsed, HasPreviousPage, HasNextPage, StartCursor, EndCursor across record variants | Investigate full contents/completeness privately. Paging metadata alone is not a complete snapshot. |
| Show Location Inventory / Update Inventory Sections | LIVE 2 / 2 | UI/context observations; no item change proven. |
| Inventory Quick Equip Request / EquipItem / Update Inventory | LIVE 9 / 6 / 6; PTU 11 / 11 / 11 | Equip/attachment leads; do not promote all as location withdrawals. |
| OnInventoryStoreItem | LIVE 4 / PTU 1; Entity, Inventory | Store-context lead; identity remains local. |
| StoreItem | LIVE 4 / PTU 6; Request, Inventory, Class, Rank, ItemsCount | Same request/class can match Add Store, but Inventory field did not equal Add SourceInventory in this inspection. Quantity interpretation is unaccepted. |
| ItemsCount values | LIVE 76, 92, 122; PTU 575, 580–584 | **Do not use as transferred quantity.** For example MedPen metadata says 581 while queued Source is NULL/amount 0. This is negative evidence against assuming ItemsCount means the moved stack count; its exact meaning remains unproven. |
| Location Split | 20:01:42.900–43.180 LIVE; Add Location → INVALID, queue same Location → same Location, source amount 10, Succeed | Stack-shape operation; not proof of ten newly acquired/lost items. No quantity mutation detector promoted. |
| Failed StackAll | 20:03:23.075–23.223 and 20:03:24.701–24.864 LIVE; same-container queues, Failed primary results | Actual negative-outcome evidence now retained; successful StackAll records also exist, semantics unpromoted. |
| Revert Moves / Expire Local Attachment / Evaluate Inventory State On Failed Move | LIVE 2 each, around failed moves | Failure/rollback corroboration, not three additional losses. |
| Bulk Move | Location → Container; bracketed class-list content, NULL/zero queued source, reported Succeed | No accepted per-item/quantity breakdown. Retain unresolved; never treat as one item or invent quantity one. |

Existing attachment, query, access-token, drag-preview, UI-item insertion, unstow/spawn, close/remove/terminate UI and drop markers were counted without promoting additional effects. No otherwise uncategorized inventory-team markers remained in these exact snapshots after the diagnostic vocabulary was updated; this is not a promise that future markers or actions cannot be missed.

## Sanitized evidence and verification

The [15-record fixture](../test/fixtures/runtime-log/live/4.10-pub/sc-4.10-live/captured/inventory-coverage.observed.log) and [manifest](../test/fixtures/runtime-log/live/4.10-pub/sc-4.10-live/captured/inventory-coverage.observed.manifest.json) retain Store metadata, a same-location Split, one failed StackAll, a bulk Move and query metadata. Private identities, ranks and query context are synthetic; quoted player/item-instance names are replaced. Bulk contents are replaced wholesale while the bracketed shape is retained. Frozen canonical expectations remain completion/move observations, not acquisition/loss or qualified stock changes.

Tests cover existing LIVE/PTU route fixtures, unknown quantities/destinations, these new gap records, unsupported builds, missing/expired/foreign/conflicting context, partial lines, capture-start boundaries, malformed/oversized/unknown records, resource/result caps, environment conflict, stable lossless file identity, exclusive report creation and unchanged source content. Runtime detection repeatability remains untested without timed owner exercises.

Local verification passed: type checking, 278 Node tests (two platform skips), 103 renderer tests, documentation audit (88 Markdown files), security surface review and whitespace/diff checks. The original-source audits also ran successfully with stable metadata checks. No renderer presentation, production parser capability, canonical schema or Station code changed.

The [coverage matrix and work order](location-inventory-tracking.md#coverage-and-required-local-work) identify quantity/location binding, bulk/split/stack handling, failure/recovery and a future renderer-independent local journal as outstanding work. The next exercise must record exact actions and before/after counts, especially Store versus equip, within-location splits, move-all, failed attempts, nested contents and ship/person ↔ location boundaries. Do not replace those gaps with API work.
