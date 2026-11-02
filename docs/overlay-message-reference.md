# Overlay message reference

## Contract

| Field | Rule |
| --- | --- |
| Default view | Friendly; View switch beside opacity selects Friendly / Raw log |
| Names | Exact item-class lookup; unknown classes remain visible without guessed names |
| Templates | Authored strings with named placeholders; no expressions, HTML or new template dependency |
| Purchase wording | Matched shop-reported success uses `{count}× {item} purchased` |
| Evidence | Group keeps all contributing canonical event IDs; association is explicitly `inferred` |
| Financial limit | Wording describes shop-reported success; wallet debit, delivery and price basis remain unverified in Evidence details |
| Raw view | Original contributing log records, including spacing/line endings; never reconstructed normalized summaries |
| Isolation | View switch changes only overlay preferences/feed; it cannot start capture or change main controls |

## Item lookup

Implementation: [`src/overlayMessages.js`](../src/overlayMessages.js).

| Item class | Singular | Plural | Basis |
| --- | --- | --- | --- |
| `crlf_consumable_healing_01` | MedPen | MedPens | Owner-confirmed example |
| `Drink_bottle_cruz_01_lux_a` | Cruz bottle | Cruz bottles | Conservative captured-class description |
| `klwe_lmg_energy_01_mag` | energy LMG magazine | energy LMG magazines | Descriptive class label; not an asserted official product name |
| `behr_lmg_ballistic_01_mag` | ballistic LMG magazine | ballistic LMG magazines | Descriptive class label |
| `outlaw_legacy_armor_medium_helmet_01_01_01` | helmet | helmets | Generic captured-item description |
| Unknown | Original class identifier | Original class identifier | No invented display name |

## Friendly templates

| Situation | Wording |
| --- | --- |
| Request only | `{count}× {item} purchase requested` |
| Matched success | `{count}× {item} purchased` |
| Matched failure | `{count}× {item} purchase failed` |
| Unmatched response | Shop reported purchase success/failure, or Shop response received |
| Matched inventory result | Inventory update completed/failed: `{count}× {item}`; omit count when unknown |
| Inventory result without item context | Inventory action completed/failed (item unknown), or Inventory response received (item unknown) |
| Drop / move / carry intent | Item drop requested / `{item} move requested` / Item carry requested |
| Inventory closing | Closing inventory |
| Left / right hand | Holding `{item}` in left/right hand |
| Helmet hook | `{item} attached to helmet hook` |

## Purchase association

1. Restrict to the active environment, source, generation and application-run window.
2. Match a hashed player/shop/kiosk context; actual identifiers do not enter friendly summaries.
3. Require a preceding request within ten seconds. A shared explicit request ID takes precedence.
4. Without a shared request ID, require one unambiguous outstanding request. Overlapping or mismatched requests stay separate.
5. A recognized success/failure replaces the pending row, retaining its ID and both evidence IDs. No timeout invents a failure or success.
6. Sort by the resulting observation time; updates to an existing row still bring the live viewport to the top.

The profile is now `sc-4.10-live@2026-10-29.2`, parser `runtime-log-parser/0.3.1`; this revision adds scoped hashed shop correlation IDs without copying raw IDs into the normalized contract.

## Inventory item association

Implementation: `src/overlayInventoryContext.js`, rule `inventory-presentation/v1`. The [PTU item-context ledger](runtime-capture-findings-2026-11-02-ptu-item-context.md) documents the reviewed records and exact-class descriptive names. Unknown item classes remain visible as class identifiers; cosmetic/localized names are not guessed.

For reviewed LIVE 4.10.197.2878 and PTU 4.10.199.13454 completion events, match a preceding `Add Inventory Management Move` by exact player/request identity within ten seconds and the same source/session scope. The request supplies ItemClass; matching queued Source/amount can supply a positive integer requested/source quantity. NULL/zero or absent queued quantity remains unknown. Conflicting identities/items/operations/counts, overlapping reused IDs, missing/expired context, malformed/oversized records and session/file/clock boundaries prevent association. The LIVE Move/Drop-to-Interaction transition does not widen PTU's Store/Interaction context scope.

The completion row retains its identity, becomes inferred with medium presentation confidence, and records its item class/quantity limits in Evidence details. Raw includes the exact supporting request, any quantity-bearing queue record and the completion. Friendly/Raw filtering uses the same item classification; known exact classes map to existing types and unknown types stay Unclassified. The canonical completion event remains unchanged. Context never becomes an ownership/Station change or an asserted destination. Missing item context is explicit rather than silently inventing a name/count.

## Raw evidence and privacy

| Boundary | Behavior |
| --- | --- |
| Cache | Memory only; at most 160 curated/contributing records, 64 KiB per record, 256 KiB total shared across all evidence |
| Lifetime | Replaced by current bounded capture data; cleared with process lifetime/source replacement |
| Canonical storage / Station | No raw evidence is added to canonical events, persistence or Station sync |
| Main renderer | Private evidence cache is excluded from scan DTOs |
| Overlay transport | Source text is included only in Raw mode, after an overlay preference change or restoration of the user's saved Raw preference |
| Rendering | Plain React text in `pre`; HTML-like source remains inert |
| Missing / oversized / invalid-decoding record | Explicit unavailable/partial notice; no silent truncation, reconstructed text or history read |

Raw mode deliberately displays local source identifiers exactly as logged. It is the owner's requested diagnostic view, not a shareable/redacted export. Both modes use the same curated events and application boundary.

## Verification

- `test/overlayMessages.test.js`: naming/templates; request/success/failure/overlap/mismatch/timeout; duplicate delivery; exact CRLF/source text; cache bounds and missing evidence.
- `test/eventOverlay.test.tsx`: accessible View switch, inert original text, no capture/close side effects.
- Existing fixture, parser, privacy, lifecycle, scrolling and capability-isolation suites remain required.
