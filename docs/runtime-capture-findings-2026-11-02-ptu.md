# PTU overlay diagnosis and bounded log inspection — 2026-11-02

## Provenance and limits

`CAP-2026-11-02-PTU-01` is a read-only inspection of the owner's existing original `PTU/Game.log`, prompted by an empty overlay report. It is not a timed gameplay exercise and includes no owner action ledger. No original log was copied, written, committed or moved into LIVE. The existing bounded capture-window reader inspected source records from approximately 17:14:34 to 17:31:09 UTC; this diagnostic review occurred after those records were written. The exact inspected build is **4.10.199.13454**, branch **sc-alpha-4.10.2**, release channel **PTU**. Locale is not established.

The log was readable, the saved selected source was PTU and overlay filters were all empty (show all). Before the fix, profile selection returned `unsupported_profile / no_compatible_profile`: the production 4.10 captured-signal profile only accepted LIVE build 4.10.197.2878. The overlay reported monitoring without surfacing that semantic extraction was suppressed. Environment isolation was working; it did not imply PTU parser support.

## Observed signals

These are log observations from one existing source, not independently verified gameplay outcomes or repeatability claims. Counts are from the bounded diagnostic snapshot. Existing IDs retain their catalog meanings; presence here does not enable every listed signal in the PTU profile.

| Catalog signal | Observed marker(s) and count | Evidence/implementation boundary |
| --- | --- | --- |
| INV-01 | Add Inventory Management Move: 10 recognized request records | QueryInventory requests recognized by the shared signal parser; request type Store also appears but has no approved request extractor. Not enabled in the PTU profile. |
| INV-02 | Inventory Mgmt Request Handle / Queued: 20 recognized records | Request handling, not completion or ownership. Not enabled. |
| INV-03 | Inventory Mgmt Request Process: 5 recognized records | Query processing only. Not enabled. |
| INV-04 | Player Inventory Request Complete: 15; Inventory Request Completed: 15 | Five QueryInventory, five Store and five Interaction reported results, each with a completion echo. Narrow observed-result display is enabled; no inventory quantity/ownership mutation is inferred. |
| INV-08 | UnstowPendingEntities: 5 | Entity unstow finalization, not proof of ownership. Not enabled. |
| INV-11 | Query Inventory / Request Personal Inventory Data: 25 | Query activity. Not enabled; QueryInventory completions are excluded from the gameplay overlay. |
| INV-12 | Inventory Token Flow: 2 | Access lifecycle, not an inventory change. Not enabled. |
| INV-16 candidate | AttachmentReceived: 59 marker occurrences | The reviewed shared port allowlist did not produce a recognized attachment signal. Do not claim helmet/hand/pocket gameplay evidence. |
| INV-17 | OnDragInventoryItemModifyTarget: 5 | Drag preview only. Not enabled. |
| INV-18 | Update Container Items Add New Item: 5 | UI insertion, not an independent acquisition. Not enabled. |
| VEH-01 | OnRequestFetchVehicles: 3 | Vehicle-list query only. Not enabled. |
| VEH-02 | BuildInventoryStowedAggregateRoots: 4 | Query aggregates, not owned fleet totals. Not enabled. |
| VEH-03 | VehicleListQuery: 1 | Vehicle-list query result, not retrieval/storage. Not enabled. |
| SYS-01 | ReuseChannel: 26 | Service reuse only. Not enabled. |
| ENV-01 | OnLoadingPlatformStateChanged: 10 | Loading-platform state, not local elevator use. Not enabled. |
| ENV-02 | LoadEntitiesReference / callback: 22 | Reference lifecycle. Not enabled. |
| ENV-03 | StopEffectForAllTags: 9 | Platform effects lifecycle. Not enabled. |
| ENV-04 | TransitionLightGroupState: 9 | Platform state. Not enabled. |
| DIA-01 | AggregateBindParentOutOfSync: 17 | Diagnostic only; no proven gameplay loss. Not enabled. |
| DIA-02 | BuildingBlocks Invalid Url: 2 | UI diagnostic only. Not enabled. |
| DIA-03 | TransitionLightGroupState errors: 2 | Diagnostic only. Not enabled. |
| DIA-04 | LoadingPlatformUtilities XML markers: 14 | Diagnostic only. Not enabled. |
| ATC-01 | ATC_Reset_VehiclesBeingStoredCleared: 8 | Tracking reset, not a vehicle-store event. Not enabled. |

No shop purchase markers, grid-close marker, supported hand/helmet attachment, drinking, held-item throw or independently confirmed acquisition/loss was established by this inspection. Other engine/context initialization records were not promoted into gameplay signals. The owner's empty-overlay report is confirmed product feedback; it does not strengthen any gameplay detector's reliability.

## Accepted implementation and evidence

`sc-4.10-ptu@2026-11-02.1` accepts only exact PTU build 4.10.199.13454, branch sc-alpha-4.10.2 or unavailable branch metadata, universe PU. It enables only `Player Inventory Request Complete` and `Inventory Request Completed` as existing `RuntimeLogSignalObserved / INV-04` observations. The immutable [sanitized fixture](../test/fixtures/runtime-log/ptu/4.10-pub/sc-4.10-ptu/captured/inventory-completions.observed.log) and [manifest](../test/fixtures/runtime-log/ptu/4.10-pub/sc-4.10-ptu/captured/inventory-completions.observed.manifest.json) retain one result/echo pair per reported operation. Player/item identifiers are synthetic and request IDs are consistently remapped. Confidence describes recognition of explicit log fields; automatic gameplay outcome reliability remains unestablished.

The existing curated overlay includes the ten non-query primary results and suppresses query completions and secondary completion echoes. Friendly text remains **Inventory action completed**; Raw uses the original contributing record in bounded transient memory. No Station proposals, uploads or ownership changes are enabled. LIVE and all other preview channels retain independent allowlists and environment keys; an adjacent PTU build remains unverified.

Read-only bounded verification against the original PTU source produced 30 canonical completion observations, ten gameplay overlay entries and available Raw evidence for all ten. All resulting channel/environment keys remained PTU. This diagnostic replay deliberately used a source-time window beginning before the observations; it does not change production's AstraDock-launch cutoff or fabricate old records as newly live.

The overlay now distinguishes unsupported/unverified parser builds from an active file follow, showing the exact build and suppression reason. A stopped follow points to Start follow / Open event overlay. Switching environments still stops follow; opening the overlay starts it for the selected source. After rebuilding/restarting, perform another inventory interaction to test new post-launch records.

The [synthetic unsupported-build screenshot](images/overlay-parser-status-synthetic.png) demonstrates the diagnostic layout only; it contains no private log content and is not gameplay evidence.

## Verification and follow-ups

The subsequent [item-context inspection](runtime-capture-findings-2026-11-02-ptu-item-context.md) addresses generic Friendly wording through bounded transient request association. It preserves this original completion-only canonical profile and its evidence limits.

Automated coverage checks frozen fixture payloads, CRLF/chunk identity, exact build/channel/branch gates, malformed completion rejection, no LIVE-profile fallback, no purchase-scope expansion, query/echo curation, pre-launch exclusion, PTU/LIVE isolation, Raw evidence, and visible unsupported-build diagnostics.

Repeat across another PTU session/build and collect an owner action ledger before expanding gameplay interpretation. Purchases, drops, carry/hand/helmet attachments, lifecycle/location events and other preview channels need their own evidence. Do not copy a preview log into LIVE to work around profile gates.
