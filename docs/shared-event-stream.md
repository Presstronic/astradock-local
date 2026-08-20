# Shared Runtime Event Stream Contract

Issue [#40](https://github.com/Presstronic/astradock-local/issues/40) establishes one renderer-owned event-stream model for the Runtime Monitor Terminal and Table views. The views are presentations of the same query, selection, anchor, and bounded window; they must not create independent subscriptions or retain independent event arrays.

## Source and lifecycle

The application owns one `monitor.subscribe` connection. Scan snapshots delivered through that connection are normalized into immutable `StreamEvent` records and reconciled by `shared-event-stream-model.ts`. Duplicate immutable IDs collapse before rendering. Total order is newest source timestamp first, then descending source line, then immutable ID. Late observations enter that order without changing the selected ID.

The model deliberately separates live edge from browse anchor:

- `live`: the window starts at the current edge and new IDs do not increment unseen count.
- `browsing`: the anchor is an immutable event ID plus viewport offset. New IDs increment unseen count and do not force the viewport to the live edge.
- `paused`, `stale`, and `disconnected`: monitoring health is explicit and is not presented as ordinary log silence.
- `replay`: retained events are displayed while active monitoring is off.

`returnToLive` clears the browse anchor and unseen count atomically. A view switch changes only presentation; query, selection, browse anchor, and unseen count remain shared.

## Query, paging, and bounded rendering

The logical query is scoped by optional environment key, optional session ID, and literal search text. Filters are applied consistently before windowing. The adapter exposes a maximum window of 200 rows (80 by default), so neither Terminal nor Table has an unbounded DOM path. `getStreamWindow` is the only array the view should render.

The current renderer scan is the query snapshot and the monitor subscription is its invalidation/update channel. Store-backed cursor traversal can replace that snapshot producer without changing the consumer model: reconcile a returned page into immutable events, preserve the anchor ID, and expose the cursor outside the presentation components. Invalid or expired cursors must become a recoverable query error, never an empty-history claim.

No third-party virtualization library is used. The bounded slice is smaller, dependency-free, keyboard-readable in DOM order, and sufficient for the provisional MVP workloads. If measurements later justify variable-height virtualization, the replacement must preserve native reading order, focusability, exact accessible counts, immutable-ID anchors, and the 200-node ceiling while documenting package version, license, bundle cost, and benchmarks.

## Selection and retention

Selection is an immutable event ID shared across both views. Reordering or view changes do not silently select a different subject. If filtering or retention removes that ID, `selectionUnavailable` becomes true and an accessible status announces that the selected event is unavailable. A future store-backed detail refresh should distinguish filter exclusion from a confirmed retention tombstone in the visible drilldown; the model already preserves the original selection ID for that check.

## Accessibility and performance contract

- Mode changes and exact unseen counts are exposed through a polite live region. Compact count formatting may be added only with an exact accessible label.
- Return-to-live and browse controls are native keyboard-operable buttons.
- Terminal and Table consume the same bounded ordered slice and selected ID.
- Stream reconciliation is linear in the supplied snapshot plus `O(n log n)` deterministic ordering, with bounded rendered output and no additional subscription.
- New batches should be reconciled once per published scan rather than once per row. Duplicate delivery is idempotent by immutable ID.

## Verification

`test/sharedEventStreamModel.test.ts` covers deterministic ordering and deduplication, bounded windows, browsing and unseen counts, return-to-live, shared view state, environment/session/search filters, selection removal, and paused/stale/disconnected/replay distinctions.
