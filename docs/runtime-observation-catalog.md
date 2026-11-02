# Runtime observation catalog

## 1. Purpose and status

Retain all observed signals, separate inferences, and preserve owner-confirmed actions with no identified log signal. Use this catalog as the entry point; dated ledgers retain detailed evidence.

| Field | Value |
| --- | --- |
| Document ID | `runtime-observation-catalog` |
| Updated | 2026-11-02 |
| Scope | Evidence catalog; display implementation tracked separately; no phase assignment |
| Current capture | `CAP-2026-11-02-PTU-01` — existing-log inspection |
| Source | Original Star Citizen `PTU/Game.log` |
| Duration | Not a timed gameplay exercise; bounded read-only inspection |
| Approximate source window | 2026-11-02, 17:14:34 to 17:31:09 UTC |
| Build / locale / profile | 4.10.199.13454 / locale unknown / sc-4.10-ptu@2026-11-02.1 (completion observations only) |
| Collection | Bounded header/suffix reader; no original logs copied or modified |
| Detailed evidence | [PTU inspection ledger](runtime-capture-findings-2026-11-02-ptu.md) |

### Capture index

| Capture | Scope | Ledger |
| --- | --- | --- |
| `CAP-2026-10-29-01` | Inventory, helmet, bottle handling; owner-confirmed drinking/throwing | [Capture 01](runtime-capture-findings-2026-10-29.md) |
| `CAP-2026-10-29-02` | Shop requests/responses; vehicle/loadout queries; owner annotations pending | [Capture 02](runtime-capture-findings-2026-10-29-02.md) |
| `CAP-2026-10-29-03` | Owner-confirmed five-MedPen purchase and copied normalized messages; friendly-name/view requirement | [Owner example](runtime-capture-findings-2026-10-29-03.md) |
| `CAP-2026-11-02-PTU-01` | Empty-overlay diagnosis; PTU 4.10.199.13454 request results/echoes; additional known markers and negative evidence | [PTU inspection](runtime-capture-findings-2026-11-02-ptu.md) |

The PTU inspection adds observed request type **Store** alongside QueryInventory and Interaction. It is a client-reported inventory request type, not a vehicle-store, ownership, acquisition or loss detector. Only INV-04 completion observations are enabled for that exact PTU build. The ledger records all distinct recognized markers, unrecognized attachment-port evidence and missing gameplay signals separately from delivery status. No owner action timing or cross-session repeatability is asserted; prior LIVE findings remain unchanged below.

### Classification vocabulary

Keep these fields independent. Labels describe evidence, not registered runtime event types.

| Field | Allowed values |
| --- | --- |
| `evidence_kind` | `log_observed`, `inferred`, `owner_confirmed`, `repository_reference` |
| `detection_status` | `observed_once`, `repeatability_pending`, `fixture_validated`, `signal_not_identified`, `untested` |
| `delivery_status` | `evidence_only`, `specified`, `implemented`, `unknown` |
| `outcome` | `requested`, `queued`, `processing`, `succeeded`, `failed`, `pending`, `unknown` |

- One capture establishes observations, not repeatable detection.
- Owner confirmation establishes gameplay ground truth, not an automatic detector.
- Missing signals do not establish inactivity or permanent impossibility of detection.
- Existing [contracts](runtime-event-contracts.md), fixtures, and domain matrices govern supported parser behavior.

## 2. Directly observed signals

Defaults: capture `CAP-2026-10-29-01`; evidence `log_observed`; detection `observed_once` with repeatability pending; delivery `evidence_only`. Detailed times and correlations remain in the capture ledger.

| ID | Signal / action | Log marker or field | Boundary |
| --- | --- | --- | --- |
| INV-01 | Operation requested | `Add Inventory Management Move` | Intent only; retain caller, item, source/destination, player, request ID. |
| INV-02 | Request handled / queued | `Inventory Mgmt Request Handle`, `Inventory Mgmt Request Queued` | Intermediate stages; no additional user action. |
| INV-03 | Request processing | `Inventory Mgmt Request Process` | Seen for queries; other operations may differ. |
| INV-04 | Success / elapsed time | `Player Inventory Request Complete`, `Inventory Request Completed` | Correlate and deduplicate; failure evidence pending. |
| INV-05 | Bottle dropped to ground | `Inventory Drop From Container`, `Type[Drop]`, success, unstow | One completed backpack drop; later queued as `Interaction`. |
| INV-06 | Two bottles transferred | `Type[Move]`, `amount[2]`, success | Location inventory to backpack; no geographic location established. |
| INV-07 | Bottle retrieved / carried | `action[Carry]`, success, unstow, right-hand attachment | One bottle from backpack; no consumption established. |
| INV-08 | Entity unstow / spawn finalized | `UnstowPendingEntities` | Initial request 13 predates capture; original action unknown. |
| INV-09 | Inventory closing / UI teardown | `Close Inventory Grid`, `Remove Inventory Container UI` | Two closures; container removals are not separate closures. |
| INV-10 | Closure with pending operation | `Close Inventory Grid`, pending request 19 | Request later succeeded; closure is not cancellation. |
| INV-11 | Inventory data query / completion | `Query Inventory`, `Request Personal Inventory Data` | Backpack/chest/leg queries; no item mutation implied. |
| INV-12 | Container access lifecycle | `Inventory Token Flow`, `Request Terminate Access To Inventory` | Request/relinquishment; token request alone does not prove grant. |
| INV-13 | Helmet attached to left hand | `AttachmentReceived`, `weapon_attach_hand_left` | Persistent attachment; prior worn state unknown. |
| INV-14 | Helmet attached to hook | `AttachmentReceived`, `helmethook_attach` | Same persistent helmet; semantic transition is INF-02. |
| INV-15 | Bottle attached to right hand | `AttachmentReceived`, `weapon_attach_hand_right` | Persistent attachment after carry; no drinking implied. |
| INV-16 | Bottle pocket attachments | `AttachmentReceived`, `inventory_pocket_2`, `inventory_pocket` | Local / persistent records; local `Default` entities are not acquisitions. |
| INV-17 | Drag target / capacity preview | `OnDragInventoryItemModifyTarget` | Noisy preview; invalid target is not operation failure; units unverified. |
| INV-18 | Container UI item insertion | `Update Container Items Add New Item` | Corroboration only; not a separate acquisition. |
| DIA-01 | Attachment-parent desynchronization | `AggregateBindParentOutOfSync` | Engine diagnostic; no proven crash, loss, or failed user action. |
| DIA-02 | Unavailable UI category variable | `[BuildingBlocks] Invalid Url`, `list_CategoryItemList` | UI diagnostic; no proven opening or user-visible failure. |

### Confirmed log sequences

| UTC time | Sequence | Reported outcome |
| --- | --- | --- |
| 16:47:12-13 | Backpack to ground; one bottle | Success; approximately 0.850 s |
| 16:47:19-20 | Location inventory to backpack; two bottles | Success; approximately 0.558 s |
| 16:47:22 | Inventory closing | UI/access teardown |
| 16:47:26 / 28 | Helmet left-hand / hook attachments | Both persistent states recorded |
| 16:47:30-31 | Backpack to right hand; one bottle | Success; approximately 1.147 s |
| 16:47:31 | Inventory closing with carry pending | Carry completed afterward |

### Capture 02 additions

Defaults: capture `CAP-2026-10-29-02`; evidence `log_observed`; detection `observed_once`, repeatability pending; delivery `evidence_only`. Reused INV-09/INV-12 markers prove UI/access teardown here, not inventory-grid closure. Counts and exact markers are in the capture ledger.

| ID | Signal | Boundary |
| --- | --- | --- |
| SHP-01 | Buy request: item, quantity, client price, player/shop/kiosk/class GUID | Two requests: 31 energy-LMG magazines / 16,120; one ballistic-LMG magazine / 520. Raw item classes retained in ledger. Price meaning/currency unverified. |
| SHP-02 | Buying-flow response reporting `Success` | State `BuyRequestProcessing`; no item/quantity/price/shared transaction ID, wallet debit, or delivery proof. |
| INV-19 | Location inventory cache invalidation | `Inventory Terminate Location Container`; not item loss or purchase delivery. |
| VEH-01 | Player vehicle-list and location/hangar queries | `OnRequestFetchVehicles`; query intent only. |
| VEH-02 | Location/hangar aggregate counts | One vehicle at location; zero stowed across one hangar; not total fleet or ownership. |
| VEH-03 | Vehicle-list query completed | `VehicleListQuery`: zero entitlements out of one vehicle; not retrieval/storage. |
| LOAD-01 | Loadout inventory/entity query and dummy-spawn lifecycle | `UI - LoadoutEditor`; request and three timings; no equipment change proven. |
| SYS-01 | Service channel reused | Five `ReuseChannel` notices; not entitlement/reputation/chat/notification outcomes. |
| ENV-01 | Loading-platform state | `OpenIdle`; not attributable elevator use. |
| ENV-02 | Platform references loading/resolved | `LoadEntitiesReference` and callback; not player location. |
| ENV-03 | Platform effects stopped | `StopEffectForAllTags`; system lifecycle only. |
| ENV-04 | Platform light state transition | `TransitionLightGroupState` notice; not user action. |
| DIA-03 | Missing platform light-group reference | Two `TransitionLightGroupState` errors. |
| DIA-04 | XML child/entity lookup failures | Two markers for missing `ObstructionCheckBounds`; not two user failures. |
| DIA-05 | Duplicate attachment ports | 62 `DuplicatedItemPorts` records; spawned loadout entities. |
| DIA-06 | Entity creation refused | 62 `CreationRefusedEntity` records; not owned-item loss. |
| DIA-07 | Attachment parent/port missing | Five `Failed attachment` records; gameplay impact unknown. |
| DIA-08 | Failed attachment entity cleanup | Ten destruction diagnostics; no proven destruction of owned gear. |
| NAV-01 | Route guard reroute / `NOT AUTH` | Unattributed vehicle mention; not local travel or DGS handoff. |
| ATC-01 | Storage tracking reset | Zero entries cleared; not a vehicle-store event. |

## 3. Inferences and owner-confirmed actions

### Inferences

Defaults: evidence `inferred`; delivery `evidence_only`; no validated automatic detector.

| ID | Interpretation | Supporting signals | Strength / limit |
| --- | --- | --- | --- |
| INF-01 | Inventory likely reopened around 16:47:28 | INV-11, DIA-02 after closure | Tentative; background refresh possible; no opening marker. |
| INF-02 | Helmet moved from hand to hook | INV-13 followed by INV-14; same entity | Strong interpretation; intent and prior equipped state unknown. |
| INF-03 | Player possibly preparing to drink | INV-07, INV-15 | Weak; holding does not prove consumption. Owner confirmation below establishes this test's actual actions separately. |
| INF-04 | Vehicle terminal likely opened (capture 02) | VEH-01 through VEH-03 | Tentative; background query is an alternative; no explicit UI opening. |
| INF-05 | Loadout screen likely opened (capture 02) | LOAD-01 | Tentative; loading does not prove user command or equipment change. |
| INF-06 | Shop response likely matches preceding buy (capture 02) | SHP-01, SHP-02 | Same player/shop/kiosk, ordered without observed overlap; no shared transaction ID. |
| INF-07 | Unit prices 520; combined value 16,640 (capture 02) | SHP-01 quantities/client prices | Conditional on `client_price` being a line total; not verified money paid or delivered quantities. |

### Owner-confirmed ground truth

Defaults: capture `CAP-2026-10-29-01`; evidence `owner_confirmed`; detection `signal_not_identified`; delivery `evidence_only`. Exact action times were not supplied; occurrence within the precise collection boundaries is not independently timed. Capture 02 owner annotations remain pending.

| ID | Confirmed action / state | Log evidence | Relationship |
| --- | --- | --- | --- |
| OWN-01 | Drank bottle contents from 100% to 0% | No consumption / quantity signal identified | Owner confirmation after capture report. |
| OWN-02 | Bottle became empty | No fullness value identified | End state of OWN-01; not another drinking action. |
| OWN-03 | Threw the emptied bottle | No held-item throw signal identified | After OWN-01; distinct from earlier inventory drop INV-05. |
| OWN-04 | Bought five MedPens (`CAP-2026-10-29-03`) | Owner report plus copied normalized request/success messages | Class `crlf_consumable_healing_01`; client price 1195 is not verified wallet debit. |

No hydration, nutrition, drinking duration, or intermediate fullness values were established.

## 4. Correlation and evidence rules

1. Attribute signals to the player within one environment, session, and source generation.
2. Correlate intent, queue/process, result, and attachment/spawn in sequence where available.
3. Keep management-request and query-request IDs in separate namespaces; IDs may reset.
4. Preserve original operation types: `Drop` can become `Interaction` downstream.
5. Deduplicate repeated completion markers and per-container UI teardown.
6. Preserve uncertainty, corrections, contradictory evidence, and owner annotations separately.

| Evidence gap / risk | Required treatment |
| --- | --- |
| Capture 01: no new bytes during final approximately 40 s | Report reader silence; gameplay may continue. |
| Capture 01 reader checked shrink, not file replacement identity | Rotation continuity unverified for capture 01; capture 02 checked identity. |
| Capture began mid-request | Do not reconstruct missing intent. |
| No failed / cancelled operation observed | Failure detection remains untested. |
| Query or preview activity | Do not infer item changes, authoritative inventory totals, or exact position. |
| Private identifiers / raw logs | Remain local; share minimized summaries or [sanitized fixtures](runtime-log-fixture-corpus.md). |

## 5. Prior evidence index

Evidence kind: `repository_reference`. These findings were not revalidated in the October capture. Consult sources for build gates, individual confidence, delivery status, and disagreements.

| Domain | Recorded capabilities | Limits / source |
| --- | --- | --- |
| App / build / identity | Source/monitor lifecycle; environment/version; login/authentication/identity | [Contracts](runtime-event-contracts.md) |
| PU / shard / replication | Join, connection, hierarchy/territory setup, entry/disconnect, frontend return, exit | [PU matrix](pu-transition-evidence-matrix.md); in-session handoffs/failure classification gated. |
| Vehicle | Retrieval, control acquisition/release, storage | [Vehicle matrix](vehicle-lifecycle-evidence-matrix.md); direct/inferred boundaries; boarding/exiting/ownership gaps. |
| Navigation | Local quantum target selection/change; final arrival | [Travel matrix](destination-travel-evidence-matrix.md); general start/cancel/failure and confirmed empty state deferred. |
| Zones | Jurisdiction, monitored-space, armistice announcements | [August ledger](runtime-capture-findings-2026-08-19.md); not exact position. |
| Party | Creation, launch, named connection/join, explicit local leave | [Party matrix](party-lifecycle-evidence-matrix.md); remaining transitions gated. |
| Mission | No promoted attributable lifecycle/payout/reputation evidence | [Mission matrix](mission-lifecycle-evidence-matrix.md) |
| Blueprint | Narrow observed display-name extraction | [Blueprint matrix](blueprint-exporter-evidence-matrix.md); type/share/ownership unproven. |
| Shop | Registered request event; capture 02 additionally observes buying-flow success responses | [Contracts](runtime-event-contracts.md), [capture 02](runtime-capture-findings-2026-10-29-02.md); response promotion pending; not payment/delivery. |
| Other candidate notes | Store requests; currency-transfer prompts/declines; generic transaction notices | Existing owner worktree `StarCitizen_Log_Event_Reference.md`; not independently verified here; amounts/incoming payments/type unproven. |

### Earlier owner annotations

Source: [2026-08-19 capture ledger](runtime-capture-findings-2026-08-19.md). Preserve these separately from log-derived facts.

| Owner-confirmed activity | Evidence boundary |
| --- | --- |
| Ship boarding / flying / exiting | Correlated control supports flying; boarding/exiting lack isolated transitions. |
| Manual quantum interruption | No distinct cancellation signal isolated. |
| Same-shard DGS label change | Overlay observation; not a direct log fact. |
| Bed logout | Indistinguishable from ordinary menu exit in that capture. |
| Hydrogen / quantum refueling | No attributable completion sequence. |
| Passenger-elevator travel | No attributable movement sequence. |
| ASOP Store selected | Correlated storage inference; ownership unproven. |

## 6. Running purchase ledger requirement

Owner direction, 2026-10-29: maintain a running total. Status: `specified`; implementation and price semantics remain pending. This is a purchase-history estimate, not a verified wallet balance.

| Requirement | Treatment |
| --- | --- |
| Entry fields | Source time, item class, requested quantity, raw client price, price basis/currency, shop response, correlation confidence, evidence reference. Unknown fields remain unknown. |
| Eligible estimate | Count each unambiguously correlated buying-success response once; identify the result as shop-reported, not settled payment. |
| Pending / failed / ambiguous | Retain separately; exclude from the success-associated subtotal. Do not infer cancellation from silence. |
| Price basis | Preserve raw `client_price`; show conditional calculations until unit/line-total meaning and currency are validated. |
| Quantity | Sum requested quantities associated with eligible responses; do not label them delivered quantities. |
| Deduplication | Repeated responses, file rereads, and replay must not add another purchase. Request/response correlation must tolerate missing transaction IDs. |
| Persistence | Retain entries and deduplication state across restarts; rebuild totals from entries. |
| Coverage | Display included time range, gaps, and incomplete capture history; do not imply lifetime completeness. |
| Corrections | Retain original evidence and correction history; recompute the estimate. Owner confirmation remains a separate evidence source. |
| Capture 02 baseline | Two success-associated requests; quantity 32; client-price sum 16,640. Estimated cost is 16,640 only if prices are line totals. Actual paid amount unknown. |
| Wallet balance | Not derivable from purchases alone; starting balance and other credits/debits are unverified. |

Verification:

- Replay/restart/duplicate inputs produce the same entries and total.
- Missing, failed, overlapping, or ambiguous responses do not inflate the subtotal.
- Unknown price basis/currency and coverage gaps remain visible; corrections recalculate totals.

## 7. Maintenance and validation

Presentation update: [Friendly/Raw messages](overlay-message-reference.md) use a reusable template/name lookup and bounded request/response association. Profile revision `2026-10-29.2` adds hashed shop context. Raw source records are local, transient and overlay-only in Raw mode; normalized contracts remain separate. Friendly wording does not promote new canonical payment/delivery facts.

Implementation update: all 40 directly observed IDs now have capture-backed display extraction through `RuntimeLogSignalObserved` in `sc-4.10-live@2026-10-29.1`. A subsequent active-log header read identified build `4.10.197.2878` / branch `sc-alpha-4.10.2`. See [coverage and verification](captured-runtime-event-display.md). Earlier `evidence_only` defaults describe capture-time status; these log signals are now implemented and fixture-validated for this exact build, while repeated in-game reliability remains pending. `INF-*` / `OWN-*` records retain separate evidence status and are not fabricated as automatic events.

1. Read this catalog and relevant domain matrices before each capture.
2. Record capture ID/date, build/profile, method, timing, continuity limits, and player attribution; mark unverified fields unknown.
3. Add every distinct signal with a stable ID, markers, fields, outcome, and source reference; preserve existing IDs.
4. Record inferences with contributors/alternatives and owner confirmations with their separate annotation times.
5. Update the dated ledger and this catalog before reporting completion; retain corrections and missed actions.
6. Promote detection only after repeat trials, positive/negative sanitized fixtures, correlation/deduplication checks, and build/profile validation.

Next controlled trials:

- Drink without throwing; throw without drinking; full versus empty bottle.
- Inventory drop; cancelled drag; successful and failed transfer.
- Helmet head/hand/hook transitions; no-action and unrelated-player controls.

No new parser behavior or release scope is authorized by this document.
