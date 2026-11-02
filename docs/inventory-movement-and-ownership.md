# Inventory movement and ownership

Status: owner policy captured 2026-11-02; bounded route presentation implemented. Personal-container bindings, a gameplay ownership projection and automatic proposal generation remain evidence/API gated. No release phase is assigned by this document.

## User outcome and policy

As a player, I want to see which item moved from which inventory to which destination, so that moving my own gear does not look like acquiring or losing it.

Track **location/custody** separately from **membership in my tracked personal inventory**. In this policy, “owned” means included in that personal inventory; it does not assert game entitlement, insurance or recoverability.

| Completed action with sufficient evidence | Location effect | Personal owned quantity effect |
| --- | --- | --- |
| My station inventory → my backpack | Source −n, destination +n | Unchanged |
| My backpack → my station inventory | Source −n, destination +n | Unchanged |
| My backpack → another identified personal container, or my hand/equipment | Source −n, destination +n | Unchanged |
| My tracked container → ground/world | Source −n, world destination | Remove exactly n |
| Previously dropped world item → identified personal container | Source world, destination +n | Add exactly n only when recovery and prior membership are established; no implemented pickup detector yet |
| Failed, cancelled, pending or unresolved operation | Do not apply a completed movement | No mutation; unknown is not a confirmed zero delta |

The owner explicitly chooses ground placement/drop/throw as leaving tracked ownership. A completed throw must be detected separately from an inventory-grid drop. Picking up an already tracked item, receiving somebody else's item, entitlement reclaim, theft, sale, destruction and nested-container contents require their own evidence and reconciliation rules; this policy does not invent those detectors.

## What ships now

Friendly completion rows show a matching request item, evidenced positive requested/source quantity where available, and the queued source → destination. These are inferred presentations of client-reported results. The canonical completion events remain unchanged.

Examples from independently sanitized LIVE and PTU fixtures:

- `Transfer reported: 10× Cruz bottles · location inventory → container · ownership unverified`
- `Ground drop reported: 1× Cruz bottle · location inventory → ground · outgoing item reported`
- `Store reported: MedPen · unknown source → location inventory · ownership unverified`
- `Inventory update completed: 1× Explorer undersuit · location inventory → unknown destination · ownership unverified`

“Location inventory” identifies the log's container kind, not a named station. “Container” does not establish backpack, personal ownership or equipment status. Ground requires the reviewed explicit drop caller, agreeing queue, evidenced quantity and a client result. Only a successful result says outgoing; failure/unknown results do not. An `INVALID` endpoint alone is unknown. `Store` and `Interaction` alone are never acquisitions or losses.

The current overlay has no authoritative game-inventory balance. These rows do not alter Local balances, create Station proposals or submit Station updates. The policy table is the target reconciliation behavior once the required evidence exists. An outgoing report is evidence to review, not an already applied balance change.

Implementation: `src/overlayInventoryContext.js`, `src/overlayInventoryRoute.js`, `src/overlayMessages.js`. The [route ledger](runtime-capture-findings-2026-11-02-inventory-routes.md) records scope, fixtures and remaining gaps.

## Evidence and processing contract

1. Partition every observation by environment, source and generation/session. Clear transient associations at file/session/build/clock boundaries. Preview and LIVE identities, item balances, evidence and baselines must remain separate.
2. Match Add → queued request → primary completion by exact player/request identity, preceding source order and a ten-second window. Reused/ambiguous requests, conflicting classes/counts/operations, malformed records and missing context cannot strengthen the result.
3. Resolve operation-specific arguments. A reviewed `StoreItem` Add record passes its destination as SourceInventory; its queued record reverses that. Other reviewed routes require exact agreement between Add and queue. Conflicting duplicate queues suppress route inference. Preserve the item association separately when only the route is unresolved.
4. Resolve endpoint identity and kind independently from its ownership scope. Future bindings must be environment/source/session scoped and evidence backed. Access-token/entity-class records may help identify a backpack by an exact entity/container match, but access alone is not ownership. Never use a class-prefix guess or a fixed “container = backpack” mapping.
5. Derive location movement only on a supported successful result. Requests, previews, UI insertion, queries, attachments and unstow/spawn observations are not standalone acquisitions. Quantities must be positive safe integers tied to the exact request. NULL/zero/absent counts remain unknown, never default to one.
6. Determine personal membership separately: both endpoints positively bound to the same owner's tracked scope → unchanged; tracked source + evidenced completed world drop → outgoing; world source + evidenced completed recovery and deduplication → incoming. Any missing scope/item/count/outcome evidence → unresolved. Internal movements must not enqueue acquisition/removal transactions.
7. Before a future balance projection can ship, define stable item/stack identity, split/merge semantics, duplicate/replay idempotency, nested-container handling, reconnect recovery and baseline reconciliation. Do not maintain totals by adding every overlay row. Independent observations of one operation must have one effect.
8. Keep raw lines, account/container/entity IDs and presentation contexts local and bounded. Renderer Friendly DTOs carry descriptions only; Raw can show original contributing records. Do not upload source identifiers or infer a Station payload from Friendly text.

Future normalized movement contracts need explicit source/ingestion timestamps, environment/build/parser/rule versions, semantic operation identity, item identity/class, exact quantity or unknown, source/destination bindings, reported outcome, membership effect or unresolved, and evidence references. Define and review that contract before persisting derived ownership facts. This change introduces no canonical schema migration.

## Information and interaction requirements

The existing passive overlay row displays, in priority order: item/count; reported action/outcome; source → destination; membership qualification. Quantity is an integer with ×, item names use the exact lookup with original-class fallback, unknown endpoints are named explicitly, and time retains the existing local time presentation. Evidence details explain association, route basis, count limits and unverified membership. Raw/Friendly use the same event identity, action/item filters and contributing evidence. Transfer results match Move; explicit ground-drop results match Drop, including failed attempts. Store/generic Interaction remain Inventory result.

Use words as well as any future semantic color/icon; direction and ownership must not depend on color. Wrap long class identifiers/routes at narrow overlay widths, preserve readable text, keyboard-accessible Evidence details and the existing accessible view/filter controls. This change uses the existing row and adds no new visual component. A future ownership review screen requires design deliverables under the authoritative design system; this specification does not settle its visual composition.

Unknown, missing, stale, conflicting or unsupported evidence must remain explicit rather than showing an invented station/backpack or balance. A pending request does not become success on timeout. Interrupted capture/restart discards incomplete transient associations; recovery must not replay an inventory effect. Missing Raw contributors show partial/unavailable. Source switching clears context and stops following until restarted; disconnected/offline Station cannot affect local collection.

## Verification and promotion gate

Happy path: in each preview build, record timed station → backpack and reverse transfers with before/after counts, a stack transfer, movement to/from hands/equipment, a ground drop, recovery and a held throw as separate actions. Identify exact container/entity bindings from the original private log and compare them to the owner ledger. Replay sanitized fixtures and verify one movement, correct direction/count, no ownership delta for personal transfers, and one exact removal only for a qualifying completed outgoing action.

Unhappy path: exercise or simulate cancelled/failed attempts, full/unsupported destinations, missing/NULL/zero quantity, mismatched/reused request IDs, interleaved players, conflicting routes, generic `INVALID`, log rotation/truncation, clock reversal, duplicate notifications, source switches and missing context. None may fabricate a completed movement, named container or personal balance. Preserve evidence gaps as findings.

Follow the [patch capture runbook](preview-patch-capture-runbook.md#inventory-route-and-ownership-validation) in the original preview installation. Repeat in another session before claiming repeatability. No preview logs are copied into LIVE; a LIVE baseline is read separately.

Definition of Done for future membership tracking: accepted evidence and versioned contracts; sanitized fixtures plus meaningful positive/negative/replay tests; accurate container/owner bindings; documented unsupported paths; privacy, accessibility, bounded performance and migration review; durable catalog/ledger updates; reviewed implementation and PR. Station writes additionally require reviewed production contracts and **Review → first confirmation → second confirmation → enqueue/send**, bound to the exact payload and scope. Approval never upgrades insufficient detection evidence.

Technology and libraries: None. Current route presentation uses the existing CommonJS parsing/presentation boundary and bounded raw cache; no new dependency, network integration or background process is introduced.
