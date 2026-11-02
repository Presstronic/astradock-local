# Runtime capture 02: shop and vehicle/loadout queries

## 1. Capture metadata

| Field | Value |
| --- | --- |
| Capture ID | `CAP-2026-10-29-02` |
| Date / channel | 2026-10-29 / LIVE |
| Duration | 60.000 seconds |
| Approximate window | 17:01:14 to 17:02:14 UTC |
| First / last received record | 17:01:41.092 / 17:02:12.508 UTC |
| Collection | Binary EOF polling, approximately 200 ms; shrink and file-identity checks |
| Continuity | No truncation/replacement notice; initial approximately 26 seconds quiet |
| Build / locale / profile | Unverified; service endpoint vocabulary does not establish client build |
| Record inventory | 178 records / 23 distinct marker names in bounded source recheck |
| Retention | Minimized summaries only; no raw log fixture saved |
| Owner annotations | Pending; no new gameplay confirmation supplied yet |

Record counts were checked by rereading from the initial byte offset through the last captured timestamp. This is an ad hoc observer, not production parser validation. Private player/entity/container IDs, endpoints, and absolute paths are omitted. Local attribution uses the previously observed owner identity; no new session-boundary proof was collected.

## 2. Purchase evidence

Shop name: `SCShop_Pyro_RestStop_BlackMarket_FPSItems`. This is source vocabulary, not proof of the player's exact physical location.

| Request UTC | Item class | Requested quantity | Raw `client_price` | Response UTC | Response fields |
| --- | --- | --- | --- | --- | --- |
| 17:01:43.133 | `klwe_lmg_energy_01_mag` | 31 | `16120.000000` | 17:01:43.694 | `result[Success] type[Buying] kioskState[BuyRequestProcessing]` |
| 17:01:46.342 | `behr_lmg_ballistic_01_mag` | 1 | `520.000000` | 17:01:46.838 | Same fields |

| Claim | Classification | Evidence boundary |
| --- | --- | --- |
| Buy requests, quantities, item classes, client prices | `log_observed` | Direct request fields; quantities are requested, not independently counted delivered items. |
| Shop reported success for buying flow | `log_observed` | Direct response fields; processing-state semantics remain unverified. |
| Each response belongs to the preceding request | `inferred` | Same player/shop/kiosk, ordered without observed overlap; delays 0.561 / 0.496 s. Response has no item, quantity, price, or shared transaction/request ID. |
| Unit price 520 for each item | `inferred`, conditional | If `client_price` is a line total: 16,120 / 31 = 520; 520 / 1 = 520. |
| Combined purchase value 16,640 | `inferred`, conditional | Sum of client prices if they are line totals; currency unit not explicit in these records. |
| Money actually debited / amount paid | `signal_not_identified` | No wallet before/after, debit record, or settlement amount. |
| Items actually delivered | `signal_not_identified` | No delivery record or inventory delta independently proving both purchase outcomes. |

Safe wording: **buy request followed by a shop response reporting success**. Do not label 16,640 as verified money spent. Failed, overlapping, delayed, duplicated, or unsolicited responses require further evidence before correlation is considered reliable.

Owner follow-up: maintain a running purchase total. This establishes the [ledger requirement](runtime-observation-catalog.md#6-running-purchase-ledger-requirement), not confirmation of payment, price semantics, or delivered quantities. Provisional baseline: two success-associated requests, quantity 32, client-price sum 16,640.

## 3. Other observations and inferences

| UTC | Direct observation | Interpretation / limit |
| --- | --- | --- |
| 17:01:41.092-41.384 | Loading-platform `OpenIdle`, references/effects/light activity and errors | Environment/platform initialization; no local elevator use or player location established. |
| 17:01:43.699 | Location inventory cache removal, UI removal, access termination | Cache/access invalidation; not an explicit inventory closure or delivered purchase. |
| 17:01:47.186 | `Local Route Guard - Server Rerouted`, `NOT AUTH`, vehicle mention | Navigation diagnostic; no local travel, vehicle ownership, or DGS handoff established. |
| 17:02:06.851-09.172 | Five service-channel reuse records | Entitlement, reputation, chat, notifications, entity-document plumbing; not rewards, messages, or ownership changes. |
| 17:02:09.172-09.953 | Player vehicle list requested; location/hangar inventory queried; aggregates/results | Likely ASOP/vehicle-terminal interaction, but UI opening/user command not explicit. |
| 17:02:09.952-09.953 | One vehicle at location; zero stowed vehicles across one hangar; zero entitlements out of one vehicle | Preserve separate subsystem counts; not total fleet, ownership, successful claim, retrieval, or storage. |
| 17:02:11.045-12.508 | Loadout inventory/entity query and dummy spawn batch timings | Likely loadout-screen interaction; no actual equipment modification established. |
| 17:02:11.802-12.508 | Duplicate-port, refused-creation, missing-attachment, destroyed-entity diagnostics | Rendering/entity setup errors; not proof owned gear was destroyed or a user action failed. |
| 17:02:12.502 | ATC reset cleared zero storage-list entries | Diagnostic reset; no vehicle stored. |

Loadout timings: inventory query 0.246216 s; persistent-entity query 0.155762 s; local dummy-spawn batch 0.708252 s. They measure subsystem work, not end-to-end UI responsiveness or gameplay modification latency.

## 4. Complete marker inventory

Counts describe physical records, not user-action counts. Every marker below is observed once as a family in this capture; repeatability and fixture validation remain pending.

| Marker | Count | Treatment |
| --- | --- | --- |
| `CSCLoadingPlatformManager::OnLoadingPlatformStateChanged` | 2 | Platform state; not player action |
| `CSCLoadingPlatformManager::TransitionLightGroupState` | 3 | Two missing-light errors; one light transition notice |
| `CSCLoadingPlatformManager::StopEffectForAllTags` | 2 | Effect lifecycle |
| `CSCLoadingPlatformManager::LoadEntitiesReference` | 3 | Reference loading |
| `LoadingPlatformUtilities::LoadFromXmlNode` | 1 | Missing `ObstructionCheckBounds` child |
| `CSCLoadingPlatformManager::loadEntityFromXML::<lambda_1>::operator ()` | 1 | XML entity lookup failure |
| `CSCLoadingPlatformManager::LoadEntitiesReference::<lambda_1>::operator ()` | 3 | Platform reference resolved |
| `CEntityComponentShopUIProvider::SendShopBuyRequest` | 2 | Purchase intent and requested values |
| `CEntityComponentShopUIProvider::RmShopFlowResponse` | 2 | Shop-reported response |
| `Inventory Terminate Location Container` | 1 | Location cache invalidation |
| `Remove Inventory Container UI` | 1 | UI container removal; existing INV-09 signal reused |
| `Request Terminate Access To Inventory` | 1 | Access termination; existing INV-12 signal reused |
| `Local Route Guard - Server Rerouted` | 1 | Unattributed navigation diagnostic |
| `ReuseChannel` | 5 | Service-channel reuse |
| `OnRequestFetchVehicles` | 3 | Fetch plus location/hangar queries |
| `BuildInventoryStowedAggregateRoots` (anonymous namespace) | 2 | Separate location/hangar aggregate counts |
| `VehicleListQuery` | 1 | Query completion / entitlement counts |
| `UI - LoadoutEditor` | 4 | Inventory request; inventory/entity query and dummy-spawn timings |
| `DuplicatedItemPorts` | 62 | Duplicate attachment-port errors |
| `CreationRefusedEntity` | 62 | Creation refused for duplicate ports |
| `Failed attachment` | 5 | Missing parent/port errors |
| `ATC_Reset_VehiclesBeingStoredCleared` | 1 | Zero-entry reset |
| `Failed to attach to itemport, destroying entity` | 10 | Failed spawned-entity attachment cleanup |

## 5. Verification steps

1. Obtain owner action order, observed purchase outcomes, wallet change, delivered quantities, and any silent actions.
2. Verify `client_price` line-total/unit-price and currency semantics against controlled purchases.
3. Capture success, failure, cancellation, rapid overlapping buys, duplicates, and inventory delivery separately.
4. Test vehicle/loadout UI opening without changes versus actual retrieval/storage/equipment changes.
5. Add sanitized fixtures and correlation/negative tests before promoting automatic detection.

See the [catalog](runtime-observation-catalog.md) for stable IDs; this capture makes no implementation or global reliability claim.
