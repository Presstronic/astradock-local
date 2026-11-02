# Inventory route inspection — 2026-11-02

Capture `CAP-2026-11-02-ROUTES-01` is a bounded read-only inspection of separate original LIVE 4.10.197.2878 and PTU 4.10.199.13454 logs. No original log was copied into LIVE, edited, committed or uploaded. This is not a timed gameplay exercise: the owner provided the transfer/drop ownership requirement and examples, not an action ledger identifying each inspected operation.

The [movement/ownership specification](inventory-movement-and-ownership.md) records the owner policy separately from detection. Prior [LIVE capture](runtime-capture-findings-2026-10-29.md) and [PTU item-context inspection](runtime-capture-findings-2026-11-02-ptu-item-context.md) remain intact.

## Findings

| Source/time UTC | Observed records | Supported interpretation / limit |
| --- | --- | --- |
| LIVE 20:01:39.889–40.318 | Add `Drop`, caller `DropItemFromContainerImpl`, Location source/INVALID target; matching queue Interaction, bottle class, amount 1, action None; primary result Succeed | Client-reported ground drop from location inventory. Distinct from a transfer; not independently verified world state or an applied Station change. |
| LIVE 20:01:44.389–44.686 | Add/queue Move, Location → Container, bottle class, amount 10; Succeed | Client-reported transfer; container ownership/type not established by the route itself. |
| LIVE 20:24:20.623–20.901 | Add/queue Move, Container → Location, `behr_sniper_ballistic_01_mag`, amount 1; Succeed | Reverse route is distinct; unknown public class retains its identifier. |
| PTU 17:27:43.333–43.728 | MedPen StoreItem Add Location → INVALID; queue INVALID → same Location, NULL source, zero amounts; Succeed | Queue identifies store destination, not source. Quantity unknown. Reading Add direction literally would invert the route. |
| PTU 17:27:48.658–48.932 | Explorer undersuit AttachItem/Interaction Add and queue Location → INVALID, amount 1; Succeed | Item interaction with unresolved destination. INVALID is also present in attachment intent and cannot mean ground or lost ownership. |

Minimized, field-wise sanitized fixtures retain original record shapes, public classes, caller names, container kind suffixes, primitive quantities/outcomes and consistently synthetic private identities. Each manifest freezes canonical payloads independently of the presentation assertions:

- [LIVE route fixture](../test/fixtures/runtime-log/live/4.10-pub/sc-4.10-live/captured/inventory-directions.observed.log) / [manifest](../test/fixtures/runtime-log/live/4.10-pub/sc-4.10-live/captured/inventory-directions.observed.manifest.json): nine records, three operations.
- [PTU route fixture](../test/fixtures/runtime-log/ptu/4.10-pub/sc-4.10-ptu/captured/inventory-directions.observed.log) / [manifest](../test/fixtures/runtime-log/ptu/4.10-pub/sc-4.10-ptu/captured/inventory-directions.observed.manifest.json): six records, two operations. This preserves kind/caller metadata omitted by the earlier item-only fixture; the earlier fixture was not rewritten.

## Additional observations and negative evidence

The inspected current LIVE suffix extends through 20:27:30 UTC; PTU through 18:08:58 UTC. The broader LIVE request inspection found 40 non-query Add records: Move 18, Drop 1, Interaction 8, Store 6, Split 2, StackAll 5. Split/StackAll and LIVE Store are outside the existing reviewed item-context policy and remain unsupported by this change. One Move uses bracketed bulk item-class content and a zero queue source count; it does not become a named single-item transfer or default quantity one.

Other inspected LIVE Move records include `Mining_Gadget_GRIN_OptiMax`, `Mining_Gadget_GRIN_WaveShift` and `grin_tractor_01` between two Container endpoints, plus MedPen movement in both Location/Container directions. These are route observations, not new catalog-name mappings, acquisitions or proof that both containers are personal. Interaction examples include `ksar_gren_frag_01`; Store examples include `apar_special_ballistic_01_tan01`. No capability is promoted for those item names or operation types.

Inventory access-token Entity IDs can match a Container ID prefix. An observed matching class was `rsi_utility_heavy_backpack_01_01_12`; the PTU inspection also saw `rrs_combat_light_backpack_02_02_01` entity-token context. This is a candidate for future exact container-type association. Access/type alone does not prove personal ownership, current equipped state or a named station, and this implementation does not resolve containers from token records. Relinquishment records can have empty Inventory fields; do not assume that field supplies a usable container binding.

No timed owner ground truth, ground recovery signal, reliable held-item throw detector, accepted personal-container ownership binding, complete current inventory baseline or nested-container removal semantics was established. Prior owner-confirmed throwing with no identified signal remains an open gap. Store/AttachItem intent is not independent proof of what the player did. Multiple requests in one source do not establish reliability across sessions or builds.

## Delivery and verification

`inventory-presentation/v2` keeps the earlier exact player/request, build/profile, bounded source/order/time and ambiguity guards. Reviewed queue routes provide typed endpoints only when Add/queue agree, with the explicit Store reversal. Conflicting duplicate routes suppress direction; item identity can still display. Explicit Drop + agreeing queue/source class/positive count + known caller distinguishes ground intent. Success says outgoing reported; failed/unknown results do not assert removal. Generic INVALID stays unknown. No canonical schema, profile capability, ownership balance or Station gate changes.

Raw adds the direction-bearing queue even when it supplies no quantity. All contributors share the existing 160-record/64-KiB-per-record/256-KiB cache and transport budgets. Private actor/container/entity identities remain transient and absent from Friendly/main scan DTOs, canonical persistence and Station.

Focused tests freeze canonical payloads, assert both directions and Store reversal, verify exact Raw contributors/action filtering, and reject generic INVALID/Carry/wrong caller, missing queue, failed/unknown result, malformed/same-container routes and conflicting duplicate queues. Existing stale/foreign/ambiguous request, environment, session/clock and bounded-cache tests remain required. Use the [capture sequence](preview-patch-capture-runbook.md#inventory-route-and-ownership-validation) before promoting named containers or membership effects.

The [sanitized LIVE-fixture screenshot](images/inventory-routes-synthetic.png) demonstrates transfer versus outgoing-drop wording in the existing overlay row. It is a presentation review, not new gameplay evidence. Local verification passed: 270 Node tests (two platform skips), 103 renderer tests, type checking, renderer build, documentation audit and security surface review.
