# MVP Design Tokens and Interaction Acceptance Matrix

## Status

| Field | Value |
| --- | --- |
| Status | Accepted interim MVP contract |
| Product area | Runtime Monitor design system |
| Decision issue | [#7](https://github.com/Presstronic/astradock-local/issues/7) |
| Source archive | `docs/Project vs. Design System choice.zip` |
| Applies to | MVP Runtime Monitor shell, stream, instruments, detail docks, Party, Mission, alerts, settings, diagnostics, and release accessibility qualification |

This document finalizes the interim semantic-token map and interaction/accessibility acceptance matrix for AstraDock Local's MVP Runtime Monitor. It is framework-independent and does not authorize component implementation by itself.

Archive authority remains:

1. `DECISIONS.md` overrides conflicting `.dc.html` specimens.
2. `tokens/astradock.css` is the token code contract.
3. `AstraDock Runtime Monitor.dc.html` is the implementation-ready Runtime Monitor direction.
4. Unfinished `AstraDock Interactions.dc.html` and substantially incomplete `AstraDock Dashboard.dc.html` must not be used to infer missing behavior.

## Resolved Decisions

| Decision | Accepted rule |
| --- | --- |
| Accent system | Use explicit semantic mapping. Interaction blue `#38B6FF` owns selection, focus, active controls, links, primary action, panel ticks, and information. Signal red `#FF3440` owns urgent harm only. Critical red `#C4141F` owns critical/fatal/error solid states and destructive-action hover. |
| Event kind vs urgency | Event-kind hue identifies the event family. Urgency is visual weight plus glyph/text label. Kind hues never become interactive chrome. |
| Shipping theme | Dark is the only shipping MVP product surface. The light `:root:not(.dark)` token block exists only to prevent invented light values and is not a supported screen requirement. |
| Density | Three user-selectable row densities: compact `22px`, default `31px`, relaxed `38px`. Terminal defaults to compact; Table defaults to default. Density is persisted per view. |
| Drawer defaults | Terminal defaults to a right push dock. Table defaults to a bottom push dock. Drawer placement override is local, persisted per view, and resettable. |
| Motion | Use restrained tokenized motion. `prefers-reduced-motion` disables live pulse and arrival animation; state changes must remain understandable without animation. |
| Font delivery | Space Grotesk, Hanken Grotesk, and JetBrains Mono are the approved families. Production-required font files must be bundled or self-hosted in the application package with licenses; remote Google Fonts loading is not allowed. |
| Icon delivery | Lucide outline icons are the approved icon family unless an implementation issue records an equivalent replacement. Production icons must be bundled from package assets; CDN Lucide loading is not allowed. |
| Sanitization | Design fixtures, examples, screenshots, docs, tests, and support exports must use obviously synthetic sanitized data and must not include real credentials, tokens, private paths, IP addresses, account IDs, stable player IDs, real handles, raw logs, or copyrighted extracted assets. |

## Semantic Token Map

Token names refer to `tokens/astradock.css`; implementation may expose equivalent platform-native aliases only if the meaning, contrast, and non-color rules are preserved.

| Semantic role | Token(s) | Use | Required non-color cue |
| --- | --- | --- | --- |
| Application canvas | `--background` | App root and behind-shell void | Not applicable |
| Rail/dock surface | `--surface-rail` | Left rail and detail docks | Structural region name and landmarks |
| Stream surface | `--surface-stream`, `--surface-zebra`, `--surface-hover` | Terminal/Table body, rows, hover | Row position, header labels, focusable row semantics |
| Header/toolbar/status chrome | `--surface-chrome`, `--surface-strip` | Header, tabs, toolbars, panel title strips | Landmarks, labels, active state text |
| Borders and dividers | `--line-row`, `--line-inner`, `--border`, `--border-faint` | Hairlines, panel boundaries, badge borders | Separation must not be the only state cue |
| Text, high priority | `--foreground`, `--text-bright` | Primary values, selected row text, headings | Semantic heading/label structure |
| Text, normal | `--text-body`, `--text-muted`, `--text-dim`, `--text-label`, `--text-faint`, `--text-ghost` | Values, labels, timestamps, secondary text | No readable text may use `--nontext-*` |
| Non-text decoration | `--nontext-300`, `--nontext-200`, `--nontext-100` | Leaders, inactive indicators, disabled chrome, hairline-only affordances | Never used for readable strings |
| Primary action | `--primary`, `--primary-foreground`, `--primary-hover` | Main constructive action, active segment, links | Button/link label and role |
| Focus/selection | `--ring`, `--primary-tint`, `--primary-border`, `--rail-width` | Keyboard focus, selected row, active tab, selected dock control | Visible focus ring plus `aria-current`, `aria-selected`, or equivalent state |
| Information | `--info` | Neutral informational state when not an action | Info icon or text label |
| Success/live | `--success`, `--success-border`, `--success-sunken` | Live, healthy, completed, fully accepted | Text label plus round settled/live symbol when appropriate |
| Warning/stale/notice | `--warning`, `--warning-border`, `--warning-sunken` | Stale, delayed, partial, notice | Text label plus triangle/notice glyph |
| Unknown | `--unknown` | Unknown, indeterminate, not yet observed | Text label `Unknown`; never render as `No` or `false` |
| Urgent harm | `--danger`, `--danger-text`, `--danger-border`, `--danger-prose` | Death, ship destroyed, disconnect, important non-fatal harm | Outlined chip, square urgency glyph, text severity label |
| Critical/error/destructive hover | `--danger-solid`, `--danger-foreground` | Fatal, parse failure, unrecoverable error, destructive hover | Solid chip/button state, square glyph, explicit destructive/error text |
| Event kind | `--kind-*` | Kind dot and kind tag only | Human kind label; machine type in detail |

### State Semantics

| State | Meaning | Required treatment |
| --- | --- | --- |
| Known/current | Evidence-backed and fresh enough for current-state use | Value plus freshness/provenance where material |
| Last confirmed | Terminal evidence missing, but prior value is still useful | Value must be qualified as `Last confirmed` with age |
| Unknown | Evidence absent or monitoring began mid-state | Render `Unknown`; do not infer negative truth |
| Transitioning | A state change is in progress and terminal evidence is pending | Render action/state label plus freshness; do not treat as final |
| Stale | Previously known value has exceeded freshness threshold or source health is questionable | Preserve last confirmed value only with stale qualification |
| Disconnected | Source/runtime/game connection unavailable or ended | Explicit disconnected label and recovery path |
| Unsupported | Current profile/build cannot support this fact | Explicit unsupported label and optional evidence/support detail |
| Loading | User or runtime request is in progress | Named loading label; skeletons/spinners cannot be the only cue |
| Error/degraded | Operation failed or subsystem cannot meet contract | Safe user-facing error, retryability, and diagnostic reference |
| Empty, no telemetry | No events have been collected in scope | Empty state names the source/scope condition |
| Empty, no matches | Filter/search excludes all retained events | Empty state names filters/search and offers reset when safe |
| Redacted | Value exists but is sensitive for default display | Redacted label and reveal/copy only through permitted detail action |
| Retention removed | Selected evidence/event backing aged out or was deleted | Tombstone state; never redirect selection to another event |

## Typography, Icons, and Offline Assets

| Asset | Role | Current license evidence | Delivery rule |
| --- | --- | --- | --- |
| Space Grotesk | Display/headings | SIL Open Font License 1.1 in the [official Space Grotesk source repository](https://github.com/floriankarsten/space-grotesk) | Bundle or self-host approved font files and license text; fallback `system-ui, sans-serif` |
| Hanken Grotesk | Body/UI | SIL Open Font License 1.1 in the Google Fonts/source-package records for Hanken Grotesk; do not assume separately sold MyFonts packages use the same license | Bundle or self-host approved font files and license text; fallback `system-ui, sans-serif` |
| JetBrains Mono | Data, time, identifiers, terminal content, labels | JetBrains publishes [JetBrains Mono](https://www.jetbrains.com/lp/mono/) under SIL Open Font License 1.1 | Bundle or self-host approved font files and license text; fallback `ui-monospace, monospace` |
| Lucide | Outline UI icons | [Lucide](https://github.com/lucide-icons/lucide/blob/main/LICENSE) is licensed under ISC; Feather-derived icons retain MIT notices | Use package-bundled static React/SVG imports with license notices; no CDN or runtime node swapping |

This is not legal advice and does not approve dependencies. Each implementation issue must pin exact packages/files, confirm the source license for the distributed files, include license notices in release artifacts, and complete supply-chain review before installation or bundling.

## Technology and Libraries

This decision adds no runtime, development, packaging, or test dependency.

Future implementation issues must evaluate and pin exact versions, licenses, bundle impact, accessibility behavior, maintenance status, and supply-chain risk for:

- Font files or font packages for Space Grotesk, Hanken Grotesk, and JetBrains Mono.
- Lucide package assets or an explicitly approved equivalent icon source.
- Token formatting or transformation tooling if CSS tokens are not consumed directly.
- Component-system or primitive libraries used behind the AstraDock design-system boundary.
- Virtualization, focus-management, accessibility-test, or browser/assistive-technology tooling needed to verify this matrix.

## Responsive, Density, and Window Contract

| Area | Accepted rule |
| --- | --- |
| Minimum window | The Electron primary window minimum is `1024x640` CSS pixels. Below that effective viewport, the app may prevent resizing or show an unsupported-size state rather than allowing overlap or clipped critical controls. |
| Full MVP target | The primary Runtime Monitor layout must be fully qualified at `1280x720` CSS pixels and larger. |
| Supported scaling | Release qualification covers 100%, 125%, 150%, and 200% OS display scaling when the effective CSS viewport remains at least `1024x640`. Text zoom or platform text scaling up to 200% must remain operable with scrolling, wrapping, or responsive disclosure. |
| Compact layout | Between `1024x640` and `1279x719` CSS pixels, the app must preserve header health/source context, current-state access, stream access, drilldown access, and global actions. Lower-priority columns/panels may collapse, stack, or move behind explicit controls. |
| Overflow | Status bar may scroll horizontally. Data values may truncate only with accessible full value in permitted detail. Long identifiers and synthetic edge cases must not overlap adjacent controls. |
| Dense rows | Row pitch is fixed by density token and includes the hairline through `box-sizing: border-box`. Rows are selectable items in a keyboard-first stream. Interactive sub-controls are not placed inside compact `22px` rows. Pointer-heavy users can select default or relaxed density. |
| Pointer targets | Standalone buttons, toggles, menu items, drawer handles, destructive controls, and settings controls must meet at least `24x24` CSS pixels and target `44x44` where space permits. Adjacent dense rows must provide keyboard parity, full-width hit areas, and visible focus/selection. |
| Right dock | Right push dock is allowed only when the remaining stream region stays at least `560px` wide and no required header/status controls are lost. Otherwise use the responsive fallback without changing the stored preference. |
| Bottom dock | Bottom push dock is allowed only when the remaining stream region stays at least `280px` tall. Otherwise use the responsive fallback without changing the stored preference. |
| Responsive fallback | If the stored drawer placement cannot fit, detail opens in the other push dock if it fits, then in a full-window detail route/panel with a Back/Close action while monitoring continues. The UI must indicate the temporary placement and preserve the user's stored preference. |

## Interaction and Accessibility Matrix

This matrix defines acceptance behavior. It intentionally avoids prescribing final visual composition beyond the semantic constraints above.

| Pattern | Information and roles | Keyboard and focus | Screen reader and live updates | State and non-color acceptance |
| --- | --- | --- | --- | --- |
| App shell | Header, tabs, Runtime Monitor main landmark, left current-state rail, stream region, detail host, status bar | Predictable tab order; skip to stream and skip to current state; active tab reachable and announced | Landmarks have stable names; unavailable post-MVP tabs announce unavailable/Post-MVP | Header health/source visible while stream/drawer changes; unavailable tabs are not hidden |
| Header/source health | Environment enum, build string, monitor state, freshness, privacy-safe source label, global actions | Source/retry/detail actions are buttons with visible focus and deterministic result focus | Meaningful state transitions announced politely; frequent freshness ticks do not spam | States include discovering, awaiting source, starting, live, paused, stale, recovering, disconnected/source missing, unsupported profile, degraded, stopped, error; each has text plus shape cue |
| Status bar | Monitoring state, environment, local-only, retention, backlog, parser profile | Horizontally scrollable by keyboard when overflowing | Status region is named; backlog/degraded changes announce only when material | Content truncation never hides exact values from permitted detail |
| Shared stream model | One environment-scoped query with immutable event IDs and deterministic ordering | Live edge, browse anchor, view switch, pagination, and selection are keyboard reachable | Mode changes and unseen count updates are announced with throttling | Live, Browsing, Paused, Stale, Disconnected, Replay are text states; new events never move a browsing viewport |
| Terminal view | Absolute time, kind tag, urgency glyph, summary, context, confidence in one dense line | Arrow/Page/Home/End navigation where appropriate; Enter/Space selects; focus ring remains visible in compact density | Use listbox/grid semantics chosen during implementation; row accessible name includes key fields without raw evidence | No badges; urgency glyph and text/label available; long/untrusted content cannot execute or break layout |
| Table view | Kind dot+tag, severity badge, summary, attributes, shard, relative age; no default timestamp column | Header navigation and sortable controls only where supported; row selection opens detail | Table/grid headers relate to cells; sort direction announced | Responsive hiding preserves all fields in detail; event kind and urgency are not color-only |
| Filters/search/attention controls | Event kind, time/session, shard/server, party, provenance, confidence, diagnostic visibility, search, alert controls where justified | Controls have labels, reset path, and deterministic focus after apply/reset | Result count and mode changes announced without flooding | Search is bounded, debounced, literal by default; empty no-matches differs from no telemetry and unsupported |
| Live-follow and browsing | Live-follow state, unseen count, return-to-live action, historical/replay mode | Scrolling away enters browsing; Return to live reachable by keyboard and does not steal focus unexpectedly | Unseen count announced at bounded cadence; return action has exact count | New events do not move browse viewport; selected event remains anchored |
| Event selection | Immutable `eventId`, selected snapshot, selected context repeated in detail | Selection by row/line/instrument/member restores focus on close; selection survives virtualization | Selected state announced; events-since-selection announced when detail is active and count changes materially | Blue selection rail wins over severity rail; severity remains in badge/glyph/text |
| Detail dock | Same detail content across Terminal, Table, instruments, Party, Mission; loading/not found/retention removed/error/redacted/unsupported evidence | Opening moves focus to detail heading or first meaningful control; Escape/Close returns focus; focus contained only when modal/full-window fallback requires it | Drawer/panel has role/name; loading/error/tombstone states announced | Pushes rather than overlays when docked; placement override local, per view, resettable; retention removal shows tombstone |
| Related event navigation | Related/contributing events and derivation reasons | Back context preserved; invalid target returns safe error state | Relationship labels explain why events are related | Never navigates to another event silently after retention or filter changes |
| Instruments | Shard+region, server connection+age, PU duration, app duration, latest jurisdiction, monitored space, armistice, active critical warnings | Instruments are focusable only when actionable; selection filters/focuses stream or opens shared detail | Each instrument exposes value, state, freshness, provenance/confidence where material | Current/Last confirmed/Unknown/Stale/Disconnected/Unsupported are distinct text labels |
| Party section | Live roster only, leader, member connection/membership state, empty state | Member focus and drilldown reachable; list remains usable when long | Roster changes announced politely and grouped during bursts | Empty `Not in a party` differs from Unknown/Unsupported; sensitive IDs hidden by default |
| Mission section | Running session history, active first then newest, shared acceptance counts when supported, unsupported state when evidence gate is closed | Item delete and Clear all are explicit controls; destructive hover/focus semantics are clear | Mission lifecycle changes announced when supported; unsupported evidence state named | Unshared missions show no counter; `8/10 accepted` format only when evidence supports numerator/denominator |
| Alerts/warnings | Severity, concise title/message, occurred time/age, active/cleared/acknowledged state, supporting event | Alert actions and evidence links reachable; focus does not jump on new alert | Important alerts announced assertively only when user attention is required; repeated alerts dedupe | Urgent/critical use glyph + text + weight; event kind never determines urgency by itself |
| Dialogs/settings/reset | Source selection, density, drawer preference, local settings, privacy/retention/deletion, diagnostics | Dialog focus enters, cycles, restores; destructive actions require explicit choice | Role/dialog labels, descriptions, validation errors, and results exposed | Destructive actions use red only for destructive state/hover plus explicit text; reset is local and reversible where applicable |
| Loading/error/empty states | Named state, affected scope, safe recovery action, support detail if available | Retry/reset/details reachable; focus goes to newly revealed actionable state when appropriate | State changes announced once per meaningful transition | No generic empty state covers no matches, no telemetry, unsupported, redacted, or retention removed |
| Privacy/evidence detail | Redacted/default-safe values, explicit evidence availability, retention status | Reveal/copy/open actions require permitted detail surface and clear focus | Redacted state is announced as redacted, not absent | Raw evidence remains local by default; examples and support exports are sanitized |

## Verification Guidance

Implementation and release issues that consume this contract must include:

- Happy-path checks at `1280x720` and larger: valid source, live stream, view switch, drawer placement override, instrument selection, Party/Mission states, alerts, settings, and diagnostics.
- Compact/minimum checks at `1024x640`: no overlap, no clipped critical controls, temporary drawer fallback works, and lower-priority content remains available through explicit controls or detail.
- Scaling checks at 100%, 125%, 150%, and 200% when effective viewport is supported.
- Keyboard-only workflows for source setup, monitoring, view switching, filtering, browsing, selection, drilldown, settings, deletion/reset, and diagnostics.
- Screen-reader workflows covering shell landmarks, stream semantics, row/table navigation, live updates, alert announcements, drawer focus, tombstones, and redacted/unsupported states.
- Contrast checks against `--surface-hover`, not only `--background`.
- Reduced-motion checks proving no essential information depends on pulse, blink, or arrival animation.
- Long/untrusted text checks using synthetic identifiers, paths, event summaries, and payload values.
- Missing font/icon checks proving system fallbacks remain usable and no remote production asset is required.
- Sanitization checks proving examples contain no plausible secrets, token-like strings, private paths, IP addresses, account IDs, stable player IDs, real handles, raw logs, or extracted game assets.

### Happy-Path Acceptance Checks

1. Apply the token map and interaction rules to representative instrument, stream row, selection, drawer, alert, Party, and Mission examples.
2. Validate dark MVP behavior at `1280x720` CSS pixels and larger with supported display scaling.
3. Navigate the shell, stream, filters, live-follow, selection, drawer, instruments, Party, Mission, settings, and diagnostics using keyboard and expected screen-reader semantics.
4. Confirm bundled/self-hosted font and icon fallbacks keep the UI usable offline.

### Unhappy-Path Acceptance Checks

1. Test minimum `1024x640` CSS viewport, high display/text scaling, long identifiers, missing font, missing icon, reduced motion, and unsupported-size fallback.
2. Verify urgent harm, critical/error, destructive actions, primary actions, event kind, and selection/focus cannot be confused with one another and are never color-only.
3. Exercise unknown, stale, transitioning, disconnected, unsupported, redacted, empty no-telemetry, empty no-matches, loading, error, and retention-removed states.
4. Confirm sanitized examples contain no plausible secrets, private paths, IP addresses, account IDs, real handles, raw logs, or extracted copyrighted game assets.

## Explicit Non-Goals

- Pixel-perfect final screen design.
- Component implementation.
- Importing generated preview bundles, runtime support files, remote CDN dependencies, or mock Station functionality.
- Adding support for Data Operations, History & Analytics, Station authentication, synchronization, asset mining, or unproven telemetry to MVP.
- Treating light theme as a shipping MVP requirement.

## Remaining Design Work

The following remain outside issue #7 and must be resolved through their own issues or design reviews:

- Final visual composition and component implementation of the Runtime Monitor shell.
- Party and Mission interior details beyond the information/interaction acceptance rules above.
- Evidence gates for mission/destination telemetry.
- Exact component vendor choices, package versions, and implementation architecture behind the AstraDock design-system boundary.
- Final release qualification evidence produced by issue #46 after implementation exists.
