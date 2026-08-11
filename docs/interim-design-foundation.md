# AstraDock Local Design Foundation

## Status and purpose

This document inventories and interprets the owner-supplied design-system documents for AstraDock Local. Those source documents are authoritative for visual and interaction direction until the owner supplies a replacement. The current AstraDock Station application is not a styling reference. This document supplements the product requirements in [`product-requirements.md`](product-requirements.md); it does not expand MVP scope, prove telemetry availability, or authorize implementation.

Source archive: `docs/Project vs. Design System choice.zip`

The replacement archive dated 2026-08-10 contains nine AstraDock HTML design documents, `DECISIONS.md`, `PLAN.md`, an exported design-system package, tokens, generated preview runtimes, a manifest/adherence configuration, and image references. The package name does not authorize copying or deriving styles from the current Station application; only the supplied documents and assets are authoritative.

Authority within the archive is explicit:

1. `DECISIONS.md` wins when it disagrees with a `.dc.html` specimen.
2. `tokens/astradock.css` is the code contract for tokens.
3. `AstraDock Runtime Monitor.dc.html` is the implementation-ready Runtime Monitor direction.
4. `AstraDock Palette Decision.dc.html` records the palette comparison and decision.
5. Other specimens remain authoritative for what they define, subject to the precedence above. `AstraDock Interactions.dc.html` is not yet complete, and `AstraDock Dashboard.dc.html` is substantially incomplete; do not infer missing decisions from either document.

## Authoritative direction

The examples are sufficiently coherent to guide early product design in these areas:

- Dark-default, dense, mission-control-inspired product surfaces.
- Stable, glanceable instrument/current-state regions above or alongside a live event stream.
- Terminal and Table presentations over one canonical stream.
- Identical event detail content in both presentations.
- Right and bottom detail docks that preserve an event snapshot while streaming continues.
- A visible, locally persisted dock-placement preference.
- Compact event rows, bounded chrome, hairline dividers, mono data labels, and efficient spatial rhythm.
- Event-kind color separated from urgency weight.
- Fast restrained motion with reduced-motion support.
- Dark-only MVP product theming; light tokens exist only to prevent invented values and are not a supported product surface.

## Artifact inventory and interpretation

### `DECISIONS.md` and `tokens/astradock.css`

`DECISIONS.md` is the authoritative decision record, and `tokens/astradock.css` is the implementation token contract. Settled decisions include the palette and accent law, three density steps, panel chrome, row behavior, detail-dock behavior, Terminal/Table distinctions, left-rail regions, shell dimensions, and cross-cutting state/accessibility rules. The repository-level issue #7 contract is recorded in [`mvp-design-tokens-and-interaction-matrix.md`](mvp-design-tokens-and-interaction-matrix.md).

### `AstraDock Runtime Monitor.dc.html`

This is the implementation-ready direction for the Runtime Monitor, constrained by product scope, validated data availability, and the authority rules above.

### `AstraDock Density Directions.dc.html`

This is the strongest interaction and density reference. It explores:

- Instrument brackets, a tiling terminal, and a ledger/time-spine shell.
- Three density levels whose final values are locked by `DECISIONS.md` at 22px, 31px, and 38px.
- Partial, full-row, and underline hover/selection treatments.
- Event-kind-colored chips/rails with solid fill reserved for rare urgent events.
- Bottom status bars, compact type filters, metric strips, zebra versus hairline rows.
- Expandable rows, master/detail, right overlay/push drawers, and bottom docks.
- Stable selected-event copies while new records continue arriving.
- An “events since selection” counter.
- One shared detail payload and one dock preference across Table and Terminal.

Table defaults to a bottom push dock and Terminal defaults to a right push dock. Users may override either locally, persisted per view and resettable.

### `AstraDock Dashboard.dc.html`

This document is substantially incomplete. Treat completed material as source design work, but do not infer missing shell, navigation, state, or feature decisions from it. Its extraction, publishing, Station, RabbitMQ, and related mock panels do not expand MVP scope.

### `AstraDock Components.dc.html`

Provides early specimens for buttons, badges, fields, selects, search, checkboxes, radios, switches, tabs, tables, menus, dialogs, alerts, progress, skeletons, and tooltips. These are visual/behavioral references, not production-ready components.

The token-shaped webhook example, private-looking paths, identifiers, and raw log content must be replaced with unmistakably inert sanitized placeholders before any reuse.

### `AstraDock Interactions.dc.html`

This document is not yet complete. Treat completed interactions as source design work, but do not extrapolate unspecified behavior. Any behavior required for implementation that is absent or ambiguous must be confirmed with the owner.

### Palette, token, and theme documents

`AstraDock Palette Decision.dc.html`, `AstraDock Palette.dc.html`, `AstraDock Tokens.dc.html`, `AstraDock Themes.dc.html`, and `tokens/astradock.css` define the AstraDock palette and token system:

- Interaction accent blue `#38B6FF` for selection, focus, active controls, links, primary actions, and panel ticks.
- Signal red `#FF3440` for urgent harm, never brand, primary action, or focus.
- Critical red `#C4141F` with white text for critical/fatal states and destructive-action hover.
- Near-black/navy ink surfaces.
- Separate success, warning, event-kind, and severity semantics.
- A dark `.dark`/`:root` MVP surface. The light `:root:not(.dark)` token block is not a shipping product surface.

The palette and accent law are locked in `DECISIONS.md`. The framework/component choice remains a separate technical decision.

### Exported Presstronic/Station design system

The `_ds/station-design-system-*` package defines a newer shared-brand direction:

- Cornflower blue `#53AEF7` and Deepwater blue variants as primary.
- Firefly navy `#0B1D29` and cool Hit Gray `#A9B3BD` foundations.
- Coral `#F05A45` as the reserved warm accent.
- Space Grotesk, Hanken Grotesk, and JetBrains Mono.
- A 4px spacing scale, 12–16px common radii, hairline borders, restrained glows, and 120–360ms motion tokens.
- Lucide outline icons and no emoji.
- Semantic token aliases, dark theme, core Button/Badge contracts, and lint guidance discouraging raw color/spacing values and internal component imports.

Its readme, manifest, tokens, and lint policy are design references. `_ds_bundle.js` and `support.js` are generated preview artifacts and are not application dependencies.

### Image references

- One image documents repository permission configuration for the design-import tool; it is not product UI.
- One image captures the existing proof-of-concept AstraDock dashboard and explains the origin of the red/ink token study; it is not a target interface to preserve.

## Locked palette and accent law

AstraDock deliberately uses interaction accent blue `#38B6FF` on canvas `#07090D`, rather than the bound design system's cornflower `#53AEF7` on Firefly navy `#0B1D29`. Signal red `#FF3440` is reserved for urgent harm, and critical red `#C4141F` is reserved for critical/fatal states. Interaction blue always wins the selection rail; severity remains visible through its badge and other non-color cues. Exact aliases and values come from `tokens/astradock.css`.

## Typography and icon direction

- Display/headings: Space Grotesk.
- Body/UI: Hanken Grotesk.
- Data, time, identifiers, terminal content, badges, and micro-labels: JetBrains Mono.
- Icons: Lucide outline icons or an approved equivalent with consistent stroke/optical sizing.
- No emoji as status or navigation language.

Remote Google Fonts and CDN-delivered Lucide used by the specimens are not an offline desktop distribution plan. The MVP direction is bundled or self-hosted Space Grotesk, Hanken Grotesk, JetBrains Mono, and Lucide assets with included license notices and system fallbacks. Current source review records Space Grotesk, Google Fonts/source-package Hanken Grotesk, and JetBrains Mono under SIL Open Font License 1.1; Lucide is ISC with inherited MIT notices for Feather-derived icons. Exact package/file selection remains an implementation supply-chain review.

## Live-stream interaction rules

- Terminal and Table operate on the same query and immutable event identities.
- Selection copies/anchors the selected event by ID; it never points at a mutable visual index.
- The live stream continues while detail is open.
- Table defaults to a bottom drawer; Terminal defaults to a right drawer.
- Users can change dock placement through visible controls; the preference remains local, persisted per view, and resettable.
- Selecting or browsing away from the live edge preserves reading position and shows unseen-event count/return-to-live affordance.
- Detail repeats enough selected-row context to remain intelligible after the row leaves the viewport.
- Event-kind hue identifies type; stronger visual weight communicates urgency. Urgent styling must remain rare.
- Rendering must be virtualized/bounded and must not depend on an indefinitely growing DOM.

## Instrument and panel direction

- Treat persistent live state as an instrument cluster, not a grid of decorative KPI cards.
- Prefer compact ruled regions, bracket/tick language, title strips, or similarly bounded chrome where it improves density.
- Party and Mission remain dedicated semantic sections even if the visual system shares panel primitives.
- Current environment, monitor freshness, game lifecycle, shard/server, session duration, party, and confirmed location/zone state take priority over diagnostic identifiers.
- Unknown, stale, transitioning, disconnected, and unsupported states must be visually distinct.
- Avoid decorative effects that compete with active-play glanceability.

## Accessibility and responsive requirements

Early specimens are not accessibility acceptance evidence. Production design shall meet the matrix in [`mvp-design-tokens-and-interaction-matrix.md`](mvp-design-tokens-and-interaction-matrix.md), including:

- Complete keyboard navigation and visible focus.
- Correct table/grid/list/dialog/drawer semantics.
- Focus entry, containment where appropriate, restoration, and Escape behavior for drawers/dialogs.
- Screen-reader announcements for meaningful live updates without flooding.
- Non-color status/type/urgency cues and verified contrast.
- Reduced-motion behavior and no essential blinking/pulsing-only information.
- Scalable text and useful layouts at supported desktop sizes and display scaling.
- Pointer targets appropriate for controls even when data rows are dense.
- Responsive drawer/panel behavior that keeps primary live state accessible.

## Security, privacy, and content rules

- Never place real credentials, token-like strings, account IDs, private paths, IPs, raw player logs, or other players' identities in design fixtures.
- Examples should use obviously synthetic placeholders and sanitized evidence.
- Raw evidence is local/permissioned drilldown content, not default visual decoration.
- Do not load production-required fonts, icons, scripts, or styles from third-party CDNs without an explicit security/offline policy.
- Mock functionality must not create implied network calls, authorization, or privacy behavior.

## Component and implementation boundary

The examples reference shadcn/ui concepts and React specimens. That is useful vocabulary but does not settle the application stack. Framework selection belongs in the technical specification and must account for Electron security, offline packaging, rendering performance, testability, accessibility, long-lived maintenance, and the chosen process architecture.

Production code should consume semantic design tokens and reviewed components rather than copy inline specimen styles. Generated preview runtimes and compiled design bundles are excluded from the application dependency graph.

## Decisions and design work still open

1. Base shell language: instrument brackets, tiling terminal, or ledger spine; Runtime Monitor currently assumes instrument brackets.
2. Whether the metric-row history treatment is needed; current Instruments have no sparklines.
3. Mission evidence gate.
4. Party and Mission interiors.
5. Completion of `AstraDock Interactions.dc.html`.
6. Completion of `AstraDock Dashboard.dc.html`.
7. Exact component vendor choices, package versions, and implementation architecture behind the design-system boundary.
8. Any implementation requirement not settled by the authoritative files or [`mvp-design-tokens-and-interaction-matrix.md`](mvp-design-tokens-and-interaction-matrix.md) must be confirmed with the owner rather than inferred.
