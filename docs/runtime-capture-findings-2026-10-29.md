# Annotated runtime capture findings - 2026-10-29

## Capture metadata and limitations

| Field | Value |
| --- | --- |
| Capture ID | `CAP-2026-10-29-01` |
| Source | Owner-selected Star Citizen `LIVE/Game.log`; private absolute path omitted |
| Duration | 60.172 seconds reported by the observation process |
| Method | Opened binary file at EOF, polled appended bytes about every 200 ms; decoded UTF-8 with replacement; no historical scan |
| Capture boundary | Approximately 16:47:11 through 16:48:11 UTC on 2026-10-29, derived from source times and receipt offsets; exact wall-clock endpoints were not separately recorded |
| First/last received source record | `2026-10-29T16:47:11.328Z` / `2026-10-29T16:47:31.575Z` |
| Channel/build/profile | LIVE from selected source path; exact build, locale, and extraction profile not verified |
| Pipeline | Ad hoc read-only observer, not a production parser validation run |
| Evidence retained | Minimized record/signature summary and owner annotations below; private raw capture was returned transiently to the conversation, not saved as a repository fixture |

No new bytes were received after the last attachment record for roughly the final 40 seconds. This is an observation of this reader, not proof the game stopped or no actions occurred. The observer checked file-size shrink but did not implement file-identity/rotation recovery; do not generalize its coverage to a production tailer. The initial unstow request began before the capture. No synthetic excerpt here should be represented as an original log fixture.

## Direct observations and correlated outcomes

Times are source UTC on the capture date. Request numbers are retained only as local correlation labels, not global IDs. Player, account, container, entity, and rank values are omitted. The same source container was later identified as a backpack by its access-token records.

| Time | Request / signal | Minimum defensible conclusion |
| --- | --- | --- |
| 16:47:11.328 | `UnstowPendingEntities`, request 13, bottle class `Drink_bottle_cruz_01_lux_a` | Bottle spawn finalized. Original intent/result chain predates capture; do not classify another drop/carry. |
| 16:47:11.466-12.714 | `OnDragInventoryItemModifyTarget` | Repeated drag previews, including `Target[INVALID]`, zero moved capacity, source/target capacities. Not multiple actions or proof of a failed move. |
| 16:47:12.713-13.670 | `Inventory Drop From Container`; `Add Inventory Management Move` request 14 `Type[Drop]`; queued as `Interaction`, quantity one; both completion markers succeed; `UnstowPendingEntities` | One bottle dropped from backpack to ground with a reported successful outcome and spawned entity. Completion latency approximately 0.850 seconds. |
| 16:47:16.875 and 19.701 | `AggregateBindParentOutOfSync` | Engine desynchronization diagnostics for UI-related entities. No attributable player action/outcome. |
| 16:47:19.125-19.641 | Drag preview and `Update Container Items Add New Item` | UI preview/insertion activity around the following transfer; not an additional acquisition. Preview capacities have unverified units. |
| 16:47:19.640-20.198 | Request 15 `Type[Move]`, bottle class, location inventory to backpack container; queued source `amount[2]`; both completion markers succeed | Reported successful transfer of quantity two. Latency approximately 0.558 seconds. Do not infer a named geographic location or authoritative full inventory from this. |
| 16:47:22.393-22.400 | `Close Inventory Grid`, `Remove Inventory Container UI`, `Request Terminate Access To Inventory`, `Inventory Token Flow` relinquishment | Inventory closing and UI/access teardown for client/location/backpack/chest/leg inventories; one closure, not one action per container. Token details identify container classes, not proof of ownership/equipment status. |
| 16:47:26.022 | `AttachmentReceived`, helmet class `outlaw_legacy_armor_medium_helmet_01_01_01`, `Status[persistent]`, `Port[weapon_attach_hand_left]` | Helmet attached to left hand. Whether previously worn or picked up is unknown. |
| 16:47:28.109-28.504 | Requests 16/17/18 `Type[QueryInventory]`; handle/queue/process; `Query Inventory`; `Request Personal Inventory Data` sent/completed; successful results; token requests | Backpack/chest/leg data queried. Management requests 16/17/18 map to query requests 7/8/9 via their processing sequences; these ID namespaces must remain distinct. Reported management latencies approximately 0.157/0.274/0.395 seconds. No item mutation implied. |
| 16:47:28.166 | `[BuildingBlocks] Invalid Url`, `list_CategoryItemList`, unavailable variable | UI diagnostic; not proof of a failed player action. |
| 16:47:28.340 | Persistent `AttachmentReceived`, same helmet, `Port[helmethook_attach]` | Helmet attached to hook. Same-entity hand-to-hook interpretation is supported; no head/equipped transition was captured. |
| 16:47:29.311 and 29.400 | Bottle `AttachmentReceived`, `Status[local]`, `Default` entity, `Port[inventory_pocket_2]` | Two local bottle attachment records. They do not establish two new acquisitions or authoritative possession transitions. |
| 16:47:30.047-31.575 | Request 19 `Type[Interaction]`, bottle from backpack, quantity one, `action[Carry]`; success; persistent pocket attachment; unstow/spawn; persistent right-hand attachment | One bottle retrieved/carried into right hand. Request completion latency approximately 1.147 seconds. Holding does not prove drinking. |
| 16:47:31.164-31.194 | Grid closure/UI/access teardown while request 19 pending, then successful request completion | A second inventory closure. Pending work can finish after closing; closure is not cancellation. |

## Complete distinct marker inventory

All observed marker families are retained here, including intermediate/diagnostic signals that should not become separate player-action events:

- Inventory intent/queue: `Inventory Drop From Container`, `Add Inventory Management Move`, `Inventory Mgmt Request Handle`, `Inventory Mgmt Request Queued`, `Inventory Mgmt Request Process`.
- Outcomes/entities: `Player Inventory Request Complete`, `Inventory Request Completed`, `UnstowPendingEntities`, `AttachmentReceived`.
- UI previews/teardown: `OnDragInventoryItemModifyTarget`, `Update Container Items Add New Item`, `Close Inventory Grid`, `Remove Inventory Container UI`.
- Query/access: `Query Inventory`, `Request Personal Inventory Data`, `Request Terminate Access To Inventory`, `Inventory Token Flow`.
- Diagnostics: `AggregateBindParentOutOfSync`, `[BuildingBlocks] Invalid Url`.

Useful fields include source timestamp/severity/subsystem, player attribution, management request ID versus query request ID, operation type and caller, source/target inventory identity and kind, item class/entity, quantity, action, result, elapsed seconds, pending count/list, attachment status/port, token lifecycle, and preview capacity. Sensitive identifiers remain local; preview capacity units and percentage semantics are unverified and must not be converted into user-facing units by assumption.

## Inferences kept separate

| Inference | Contributors | Limits |
| --- | --- | --- |
| Inventory likely reopened around 16:47:28 | Queries for three containers and UI category-list activity after earlier closure | No explicit opening marker. Background refresh is an alternative; opening time unknown. |
| Helmet stowed from hand onto hook | Same persistent helmet attached left-hand then helmet-hook | Attachment states are direct, semantic transition inferred. Prior head state and user command unknown. |
| Player might be preparing to drink | Bottle retrieved into right hand | Weak inference only. Does not establish ingestion, duration, quantity, empty state, or intent in a new session. |

## Owner-confirmed ground truth without identified log signals

After the capture report, the owner explicitly confirmed drinking the bottle contents from **100% to 0%**, then **throwing the bottle**. Preserve this correction as a separate source. Exact action times were not supplied; association with this exercise is owner-reported, not synchronized per-action evidence of timing inside the collection window.

| Ground truth | Observed automatically? | Safe tracking policy |
| --- | --- | --- |
| Drank bottle contents | No explicit consumption signal identified | Owner-confirmed action; no log detector established. |
| Fullness went from 100% to 0%; bottle became empty | No fullness/consumption values identified | Values come from owner confirmation only. Do not infer hydration or nutrition changes. |
| Threw bottle after emptying it | No held-item throw signal identified after retrieval | Owner-confirmed action; do not relabel the earlier inventory drop as this throw. |

The earlier interpretation correctly distinguished carry from consumption, but the lack of later records cannot be interpreted as inactivity. Do not label these behaviors globally unsupported on the strength of one capture.

## Reliability gates and follow-up captures

The signals above were observed once; no parser implementation or fixture acceptance is claimed. No failed/cancelled operation was observed, even though failure is a future outcome to investigate. `Target[INVALID]` in a drag preview is not a failure result. Request numbering changes type across stages and can reset across sessions; correlate within source generation/environment/session/player and retain event origin instead of matching solely by type or number.

Next controlled trials should separately annotate drink-without-throw, throw-without-drink, full versus empty bottle, inventory drop, cancelled drag, successful/failed transfer, and helmet head/hand/hook changes. Include no-action baselines and matching positive/negative sequences. Record owner action times independently and verify build/profile and reader continuity before interpreting absence. Use minimal sanitized fixtures only after the original proving sequence is available and reviewed.

See the [catalog](runtime-observation-catalog.md) for stable candidate IDs and links to prior domain evidence.
