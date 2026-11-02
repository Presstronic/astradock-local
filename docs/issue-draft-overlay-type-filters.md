# Overlay event, action, and item-type filters

| Field | Value |
| --- | --- |
| Status | Specification/story draft; implementation not included |
| Owner request | 2026-10-30 |
| Phase | Unassigned local overlay increment; owner release decision required |
| Type | User Story |
| Dependencies | Existing curated overlay feed; approved taxonomy and filter interactions; source/build evidence for any newly recognized signal |

## Context, story, and intended outcome

As a player, I want to choose the types of activity and items shown in the overlay log, so that I can follow what matters during play without changing local capture or the main monitor.

Action type and item type are useful independent dimensions. The current owner worktree has purchase requests/shop-reported outcomes, inventory move/drop/carry/attachment/closing signals, and a curated feed of vehicle, travel, party and other supported gameplay events. Known item examples include MedPens, Cruz bottles, energy/ballistic LMG magazines and a helmet. These examples support a small reviewed taxonomy, not a complete game-wide classification or reliable sale/loss detection. See the owner's existing runtime observation catalog and October 29 ledgers before promoting new signals.

## Evidence and implementation boundary

At drafting time, `src/overlayEventFeed.js`, `src/overlayMessages.js`, `src/overlayPurchasePresentation.js`, the overlay renderer and their documentation/tests are existing **uncommitted owner work**. They are context for this story and are not introduced or committed by it. Their final reviewed contracts must be available before implementation. Current feed DTOs expose broad `action`/`runtime` kinds and display summaries; these are insufficient to identify all requested filter dimensions. Add explicit versioned classification metadata at the projection boundary instead of parsing friendly text or raw logs in the renderer.

The current overlay is curated, passive, scoped to the active log/environment since application launch, newest first and bounded. Filtering must preserve those properties, raw-evidence bounds and main-monitor isolation. This draft does not assign overlay work to the local-only MVP or depend on Station authorization. Overlay use and its filters work without Discord/Station sign-in.

## In scope and proposed taxonomy

Provide separately named dimensions with stable IDs and user-facing labels:

| Dimension | Initial candidate values | Evidence/semantic constraint |
| --- | --- | --- |
| Event category | Inventory, Shop, Equipment, Vehicle, Travel, Party, Mission, Area/status | Only current curated, accepted event families appear; listing a category does not enable unsupported detectors |
| Action type | Purchase, Move/transfer, Drop, Carry, Attachment, Inventory closing; family-specific existing vehicle/travel/party actions | Names classify the operation, not its outcome. Do not call an attachment acquisition or inventory-closing item loss |
| Item type | Medical consumables, Food/drink, Ammunition/magazines, Armor/equipment, Unclassified item, No item | Initial exact known-class mappings only; broader parent groupings and final labels require review. The helmet supports equipment classification, not an assumed weapon/ammo relationship |
| Outcome, optional extension | Requested, In progress, Reported success, Reported failure, Unknown, Not applicable | Confirm whether the owner wants a separate control. A shop-reported success is not independent proof of delivery or payment |

The owner explicitly requested action and item filtering; event-category and outcome controls are proposals for review. Their presence/labels must be settled before design and implementation. Do not expose an enabled Sale, Lost, Consumed or Thrown filter as if a reliable corresponding detector exists. A supported family with no matching current entries can have zero results; an unsupported detector needs an explicit unavailable state.

An event category describes what domain the event belongs to. An action describes what operation is reported. Item type describes a referenced item definition, and outcome describes the reported stage/result. Preserve those separate meanings even where multiple signals contribute to one friendly row.

## Expected components and data/control flow

Introduce a deterministic, tested classification projection for curated overlay rows. Candidate fields are stable category/action IDs, item-type IDs plus classification status/source/version, and independent outcome. Exact DTO shape follows existing contract conventions and review. Keep canonical events immutable and main filters unchanged. Treat unrecognized enum IDs safely; persisted selections migrate by stable IDs rather than display names.

Flow: bounded eligible observations -> existing scoped correlation/deduplication/grouping -> row classification -> overlay-only selection predicate -> bounded visible rows -> Friendly/Raw presentation. Apply user filters **after** context correlation so hiding a purchase request cannot prevent its success association. Classification and row selection are identical in Friendly and Raw; Raw changes only the evidence presentation. Linked rows retain their original source IDs and evidence availability semantics.

Filter the bounded eligible live buffer before the final visible-row limit, rather than filtering only the already limited displayed rows. Otherwise hidden noisy categories can starve useful matches. Keep a separately bounded candidate buffer using the reviewed overlay limits; do not read historic logs or increase retained raw evidence to fill a filter. When no matching events exist within that buffer/window, say so; never promise unlimited filtered history.

Map exact known classes through an explicit local taxonomy first. If Station later supplies permitted compatible item-type metadata, an adapter can enrich classification through the existing cache policy; overlay subscription/filter changes never trigger sign-in or network calls. Unknown mapping stays Unclassified item. A row with no referenced item is No item, distinct from a known item of unknown type. Display names, translated text, substring/prefix guesses and local transient entity names must not decide category membership.

For generic completion/response rows, inherit item/action context only through an accepted bounded unambiguous correlation; without it retain unknown/not-applicable classification. Row grouping must not fabricate item details. For rows legitimately referencing multiple items, match any referenced item's selected type; final multi-item semantics require review if such rows are introduced. Item-type revisions may refresh presentation but cannot alter evidence, inventory or sync eligibility.

## Filter specificity and remaining decisions

**Settled owner direction:** apply filters in order of specificity and narrow cumulatively: **all active filter dimensions must match**. Present and explain broad event category, then the more specific action type, then item type; an optional outcome remains a separate refinement if approved. The specificity rule is not a reason to filter raw records before correlation or to change the bounded feed. Keep classification/correlation before row filtering and the visible cap afterward.

The owner explicitly confirmed cumulative narrowing, with no specificity override. Selecting **Purchase + Ammunition** shows only ammunition purchases. An active ammunition-only selection excludes unrelated vehicle/travel/party rows with no item; include the explicit No item choice if those rows should also match that dimension. A restrictive action/category still has to match, so selecting No item does not bypass Purchase. Contradictory selections yield no matches, not an automatic relaxation or reset. Unclassified items only match an active item dimension if Unclassified item is selected. Changing control order never changes the result for identical final selections.

Use OR among selected values within one multi-select dimension and AND across active dimensions. Default/reset means all currently eligible curated types. Distinguish an inactive dimension from an intentionally empty selection, if the design permits empty selection; document how All/None/Clear work rather than overloading an empty array. Unknown/unclassified and no-item values remain explicitly selectable. All means all curated supported overlay events, never parser/system/debug traffic.

| Active selections | Matching result |
| --- | --- |
| None (all dimensions inactive) | All eligible curated rows |
| Action: Purchase | Purchase rows across all item types, including missing item context if otherwise eligible |
| Item: Ammunition | Ammunition rows across eligible actions; no unrelated/no-item or unclassified rows |
| Action: Purchase; Item: Ammunition | Ammunition purchase rows only |
| Action: Purchase; Item: Ammunition or Medical consumables | Purchase rows for either selected item type |
| Category: Party; Item: Ammunition | No matches for the current unrelated/no-item party rows; neither filter overrides the other |
| Item: Ammunition or No item | Ammunition rows plus no-item rows, still subject to every other active dimension |
| Item: Unclassified item | Rows with a referenced item whose type is unknown, not rows with no referenced item |

Remaining decisions: approve final taxonomy/grouping and labels; whether outcome is exposed initially; empty-selection behavior; preferences shared across environments or scoped per environment; selections retained across runs; filter management placement; interaction while new matching events arrive; and final responsive/accessibility behavior. Specificity, cumulative matching and no-item/unclassified treatment are settled above. Remaining design deliverables do not permit inferring unfinished archive interactions.

Filter settings must be overlay-specific and local. If persisted, validate, version and migrate them through the approved preference store; do not reuse main-monitor filter state or queue preferences for Station. Reset clears only the overlay filter selection. Applying a filter never starts/stops capture, invokes a scan/export, changes source/environment, fetches older history or modifies canonical retention.

## Required information architecture and behavior

Expose Event category, Action type and Item type as separate labeled dimensions once approved, with an accessible summary of active selections and a clear reset/show-all action. Outcomes are separate if approved. Available choices show stable descriptive labels, not parser signal IDs. Counts, if shown, are integers explicitly scoped to the retained live buffer; they cannot suggest full-session totals. Unknown is not zero.

Preserve live context: active environment/source label, capture/feed status, newest-first events, local display timestamp with canonical detail where provided, summary, provenance/confidence, and Friendly/Raw mode. Classification detail should identify local mapping versus Station enrichment and unresolved status without exposing private account/entity identifiers. Filters operate on semantic metadata, so translating a name or changing Friendly/Raw does not change matches.

Distinguish: no observed gameplay yet; no matches for active filters; an empty selection if supported; monitoring waiting/stopped; unknown classification; unsupported family/build; loading/restoring preferences; stale enrichment; source transition/disconnected; successful preference update; and recoverable storage/validation error. Preserve valid current selections on a failed save. Explain that categories cannot show unsupported or uncaptured events. Show raw evidence unavailable/partial notices unchanged for matching rows.

The design agent must supply filter control behavior/composition and all selection, empty, loading, error and overflow states using the authoritative design sources. Require keyboard-operable multi-selection with proper labels/state, focus retention as results change, visible focus, color-independent selection, screen-reader result announcements without live-feed spam, long-label handling, reduced motion and usable supported narrow/scaled viewports. Opening controls and choosing types cannot close the overlay or change monitoring. New matching live rows remain at the top according to the established overlay behavior; main history browsing retains its own position.

## Non-goals; assumptions, constraints, and risks

- No gameplay detector changes, broad inventory inference, new main-monitor filters or Station authentication dependency.
- No arbitrary filter scripts/regex, raw-log searches, persistent raw evidence, unlimited history, or new parser diagnostics in the overlay.
- No assumption that item class prefixes form a verified taxonomy or that missing metadata means an event should disappear.
- Correlation, classification and filtering must remain bounded under a noisy stream and must not change capture throughput or expose sensitive text to an account API.
- The current evidence cannot establish every requested item/action type or outcome. Unsupported action families remain gated, and Station data is optional enrichment.

## User acceptance criteria

- Category/action/item choices follow the specificity order and cumulative decision table: OR within selected values, AND across active dimensions, no override. Purchase + Ammunition excludes unrelated/no-item rows and contradictory selections produce no matches.
- The known synthetic MedPen/drink/magazine/helmet cases receive their reviewed types; unknown classes remain selectable and distinguishable from no-item events.
- Purchase request/result grouping and raw evidence remain correct when related stages or categories are filtered out.
- Friendly and Raw modes select the same semantic rows; class/name translation does not change identity or matching.
- Filters affect only overlay visibility/preferences, keep the bounded active-source/run scope and preserve newest-first behavior.
- Empty/no-match/unsupported/waiting/error states explain what the user is seeing; reset reliably restores all curated supported activity.
- Local-only use needs no login. No filter interaction triggers network, scan/export, main control/filter changes or retention changes.

## Happy-path test steps

1. Feed synthetic supported purchases, moves/drop/carry/attachments, vehicle/travel/party events and exact known item classes through the bounded overlay pipeline.
2. Select broad categories, specific actions and item types in different orders; verify the approved specificity decision table gives identical final results for the same selections, including conflicting/no-item combinations. Reset and verify all eligible curated rows return.
3. Switch Friendly/Raw and verify identical semantic matches, grouped purchase evidence IDs and unchanged source text when available.
4. Add new matching events and verify top visibility; verify main capture, main filters and main history browsing remain unchanged.
5. Exercise keyboard controls, focus/status announcements and supported narrow/scaled viewports. If persistence is approved, restart and verify scope/versioned restoration.

## Unhappy-path test steps

1. Include unknown item classes, generic uncorrelated completions, absent items, stale/missing/ambiguous Station metadata, unsupported builds and future enum IDs; verify no invented classification or silent disappearance.
2. Include overlapping purchases, duplicate completions, result-only records, partial/missing raw evidence and misleading item-class prefixes; verify correlation and privacy boundaries.
3. Generate enough hidden noisy rows to exceed the visible limit; verify matches are selected from the bounded candidate buffer before the visible cap, with no history scan or unbounded growth.
4. Corrupt saved selections, remove a taxonomy option, fail a preference write, switch sources/environments and stop monitoring. Verify safe migration/defaults, explicit states, scope isolation and no capture side effects.
5. Attempt invalid preference values or unsupported type IDs over IPC; verify validation and no expansion of renderer authority.

## Definition of Done

- Settled cumulative matching/no-item semantics are retained; remaining owner/design decisions settle taxonomy, outcome control, empty selections, scope/persistence and missing interactions before UI implementation.
- Approved design deliverables cover required content, selection and degraded states without borrowing Station styling.
- Classification/projection contracts, bounded pipeline behavior and preference migration are documented; existing owner overlay work is a reviewed prerequisite.
- Focused domain/IPC/UI tests verify semantics, correlation-before-filtering, identity/privacy bounds, passive isolation and scroll behavior. Avoid tests that merely mirror a lookup table.
- Accessibility, security/privacy, cache/filter performance, compatibility and local-only offline behavior are reviewed.
- `npm test`, relevant renderer build and diff review pass; a documented PR contains screenshots/recording when practical and names any withheld types.

## Technology and libraries

Reuse the existing Electron/preload boundary, deterministic overlay projection, local preferences and React/TypeScript test/rendering stack after the owner overlay changes are reviewed. New dependencies: **None expected**. Future Station item metadata uses the separately reviewed catalog adapter and is not required for this story.
