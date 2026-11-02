# PTU inventory item presentation evidence — 2026-11-02

## Source and owner feedback

`CAP-2026-11-02-PTU-02` is a bounded, read-only follow-up inspection of the original PTU log for build **4.10.199.13454**, branch **sc-alpha-4.10.2**. It covers retained source records from approximately 17:14:34 through 18:08:58 UTC. It is not another timed gameplay exercise. The owner reports seeing only “Inventory action completed” while changing inventory and requests the item identity in Friendly view. Exact owner action timing and an item-by-item action ledger were not supplied.

No original logs were copied into LIVE, written or committed. The prior [PTU completion inspection](runtime-capture-findings-2026-11-02-ptu.md) and its fixture remain valid. This follow-up reviews item association for presentation, not a new inventory/ownership detector or broader PTU parser support.

## Observations and limits

| Signal | Direct evidence | Meaning / missing evidence |
| --- | --- | --- |
| INV-01 | `Add Inventory Management Move`: Request, Player, Type and ItemClass | Names the item class for Store/Interaction requests. It is intent/context, not independently confirmed movement or ownership. |
| INV-02 | `Inventory Mgmt Request Queued`: same request/player; Source class and first amount | Interaction examples contain a source class and amount 1. Store examples contain Source[NULL] and amounts 0/0; those zeros cannot become quantity zero or a guessed quantity one. |
| INV-04 | `Player Inventory Request Complete`: same player/request, Type and Result | Primary result usually lacks an item class. Its Item identifier is not a display name. Match only preceding, unambiguous item context; timing alone is insufficient. |
| INV-04 echo | `Inventory Request Completed`: request, result and elapsed time | Separate physical record, not another gameplay action. Existing overlay curation continues to omit it. |

The minimized [fixture](../test/fixtures/runtime-log/ptu/4.10-pub/sc-4.10-ptu/captured/inventory-item-context.observed.log) and [manifest](../test/fixtures/runtime-log/ptu/4.10-pub/sc-4.10-ptu/captured/inventory-item-context.observed.manifest.json) retain a MedPen Store request/result and an Explorer undersuit Interaction request/result, including queued context and completion echoes. Identity values are consistently synthetic; short request IDs are remapped. Frozen expected canonical payloads still contain only the completion observations, without inferred item/quantity fields.

The wider inspected source contains the following distinct public item classes. Labels are conservative local descriptions from exact class lookup, not official/localized catalog names or new acquisition claims. Cosmetic variants are not resolved beyond the specified label. Unknown classes continue to display their original class identifier; there is no prefix-based name or type guessing.

| Observed class | Friendly label |
| --- | --- |
| crlf_consumable_healing_01 | MedPen; existing owner-confirmed mapping |
| klwe_pistol_energy_01_mag | energy pistol magazine |
| klwe_pistol_energy_01 | energy pistol |
| rsi_odyssey_undersuit_helmet_01_01_01 | Odyssey helmet |
| rsi_odyssey_undersuit_01_01_01 | Odyssey undersuit |
| rsi_explorer_undersuit_01_01_concierge | Explorer undersuit |
| qrt_specialist_medium_core_01_01_04 | Specialist medium chest armor |
| qrt_specialist_medium_arms_01_01_04 | Specialist medium arm armor |
| qrt_specialist_medium_legs_01_01_04 | Specialist medium leg armor |
| qrt_specialist_medium_helmet_01_01_04 | Specialist medium helmet |
| rrs_combat_light_backpack_02_02_01 | light combat backpack |
| fio_glasses_01_01_01 | glasses |
| crlf_medgun_01_msn_rwd02 | medical gun |
| gmni_sniper_ballistic_01_arctic01 | ballistic sniper rifle |
| klwe_ubarrel_lasr_s1 | size 1 underbarrel laser attachment |
| klwe_ubarrel_lasr_s1_02 | size 1 underbarrel laser attachment (variant 02) |

Owner feedback confirms that inventory interaction occurred and that the prior wording was insufficient. It does not prove every inspected Store/Interaction request was user initiated, its destination, delivered quantity or ownership effect. Store remains a client-reported inventory operation type, not a vehicle-store detector. No new purchase, consumption, drinking, held-item throw, wallet-debit or Station synchronization evidence was gathered. One source does not establish repeatability across sessions/builds.

## Implemented presentation rule

`inventory-presentation/v1` correlates the explicit request item with a supported primary result using **exact player + request ID**, preceding source order and a maximum ten-second source-time window. It is independently restricted to reviewed LIVE build 4.10.197.2878 and PTU build 4.10.199.13454/profile identities. PTU allows reviewed Store/Interaction context only. The known LIVE Move/Drop → Interaction vocabulary remains permitted for item association without importing LIVE gameplay capabilities into PTU.

Duplicate pending requests, conflicting item/quantity/operation context, missing identity, expired/future requests, reversed clocks, oversized/invalid/partial records and observed session/file boundaries yield no association. Reused IDs after a consumed completion start a new pending request. Pending requests and result contexts are capped at 160 each. Request records before the capture window are not read back from history.

Examples are **Inventory update completed: MedPen** and **Inventory update completed: 1× Explorer undersuit**. The positive count comes only from matching queued source/request evidence; it is not an independent delivered-count measurement. Failures and unknown outcomes retain their own wording. Missing/ambiguous item context explicitly says **item unknown**. Do not say “Stored” or name a destination from the Store enum alone.

The [sanitized-fixture UI image](images/inventory-item-messages-synthetic.png) demonstrates Friendly wording only, without private source text or an additional gameplay-reliability claim.

Associations are labeled **inferred**, with medium presentation confidence and an evidence note containing the exact public item class and limitations. Canonical result provenance/payload/confidence are unchanged. Item-type filtering uses the enriched class before filtering, through exact mappings; unmapped types remain Unclassified. Action classification remains Inventory result rather than a fabricated movement/storage outcome.

Raw view contains the exact original contributing request and primary completion, plus queued context when it supplied the displayed quantity. It retains the same completion row ID and item classification as Friendly. Missing contributing cache entries produce partial/unavailable evidence, never reconstructed text. Additional context shares the existing 160-record, 64 KiB per record and 256 KiB total cache limits. It remains transient and is explicitly omitted from canonical persistence, main scan/snapshot DTOs and Station.

## Verification and follow-ups

A read-only replay of the expanded original PTU source yielded 17 item-associated overlay rows, all with available contributing Raw evidence at inspection time. Counts are source-snapshot observations, not a claim that 17 deliberate player moves occurred. Regression tests cover the frozen fixture, item naming, quantity absence, exact Raw CRLF/byte coordinates, unchanged canonical payloads, filter equivalence, failure/unknown handling, duplicate/foreign/stale/conflicting requests, ID reuse/session boundaries, bounded eviction, profile isolation and main DTO exclusion.

Further item names require exact reviewed mappings or future authoritative catalog data. Direction, destination and actual ownership/delivery remain unavailable unless separately proven. Repeat under the [patch capture runbook](preview-patch-capture-runbook.md) with owner action times before extending semantics.

Subsequent work: the [route inspection](runtime-capture-findings-2026-11-02-inventory-routes.md) preserves selected container-kind/caller metadata in separate fixtures and adds bounded queued-route presentation. This ledger retains the original item-only findings and v1 behavior; the follow-up does not establish personal ownership or delivery.
