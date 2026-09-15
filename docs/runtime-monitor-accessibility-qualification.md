# Runtime Monitor accessibility qualification

## Purpose and release scope

This record is the reproducible accessibility evidence for issue [#46](https://github.com/Presstronic/astradock-local/issues/46). It qualifies the MVP Runtime Monitor against the accepted interaction matrix in [`mvp-design-tokens-and-interaction-matrix.md`](mvp-design-tokens-and-interaction-matrix.md).

The evidence covers the shipped local Runtime Monitor surface: shell navigation, source health and controls, current-state instruments, Terminal and Table streams, filtering and browse controls, shared drilldown, alerts, Party, Mission/Destination, settings, diagnostics, responsive behavior, reduced motion, and sanitized content handling. It does not certify post-MVP workspaces or a particular assistive-technology vendor beyond the matrix below.

## Automated evidence

Run from the repository root:

```text
npm test
npm run docs:check
npm run security:check
```

The automated accessibility contract is [`test/runtimeMonitorAccessibilityContract.test.ts`](../test/runtimeMonitorAccessibilityContract.test.ts). It checks source-level invariants that are stable in CI:

- named shell landmarks and skip links;
- labelled controls, stream view state, Terminal listbox and Table grid semantics;
- keyboard navigation keys, immutable selection identity, detail focus entry, and focus restoration;
- explicit state/urgency text and non-colour cues;
- bounded stream announcements rather than announcing every rendered count mutation;
- detail panel naming and an explicitly labelled close action;
- the `1024px` minimum shell width, 24px native control target, visible focus treatment, and reduced-motion override;
- bundled local font/icon imports and the offline renderer policy.

The test is a contract check, not a substitute for a browser accessibility tree or human assistive-technology assessment. It intentionally fails if a future implementation removes one of these release-critical hooks.

### Evidence captured on 2026-09-15

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript/build verification | Pass | `npm test` (`typecheck` plus renderer and Node suites) |
| Renderer accessibility contract | Pass | `test/runtimeMonitorAccessibilityContract.test.ts` |
| Design token and reduced-motion contract | Pass | `test/runtimeMonitorDesignContract.test.ts`, `styles.css` |
| Documentation and local-link audit | Pass | `npm run docs:check` |
| Security/privacy surface audit | Pass | `npm run security:check` |
| Synthetic fixture/privacy scan | Pass | Existing fixture corpus and security tests; no real logs or identifiers added by this issue |

## Manual qualification matrix

The manual procedure is deliberately explicit so a release reviewer can repeat it on the supported installation targets. The repository CI environment does not expose a native Windows desktop, OS display scaling, high-contrast mode, or screen-reader bridge; those rows are therefore not represented as automated passes.

| Matrix | Procedure and expected result | Evidence status |
| --- | --- | --- |
| Keyboard, 1280x720 CSS px | Tab through skip links, tabs, source actions, stream controls, filters, browse controls, rows, drawer, settings, and destructive actions. Use arrows/Home/End/Enter/Space in both stream views. Close detail with Escape and confirm focus returns to the initiating control. | Source/automated contract pass; execute on packaged candidate before release sign-off |
| Keyboard, 1024x640 CSS px | Repeat the workflow at the minimum supported viewport. Confirm required source/header context, promoted telemetry, stream, current-state access, and drilldown remain reachable without overlap or clipped focus. | CSS/source contract pass; execute on packaged candidate |
| Screen reader: NVDA, Windows 11 | Inspect landmarks, tab names/current state, source health, instruments, listbox/grid rows, selected state, detail name, alert severity, empty/error/tombstone states, and polite stream announcements. | Requires owner Windows hardware/AT pass |
| Screen reader: Narrator, Windows 11 | Repeat the critical workflow and confirm native controls, focus restoration, alerts, and state text. | Requires owner Windows hardware/AT pass |
| Screen reader: Orca, supported Linux desktop | Repeat the critical workflow on the supported Linux desktop/runtime. | Requires owner Linux desktop/AT pass |
| Display scaling 100/125/150/200% | Verify the effective viewport remains supported, controls remain usable, status overflow scrolls, and detail fallback preserves access. | CSS/source contract pass; execute on packaged candidate |
| Text growth/zoom to 200% | Verify labels wrap or disclose responsively, no control is obscured, and exact values remain available in permitted detail. | CSS/source contract pass; execute on packaged candidate |
| High contrast/forced colours | Confirm text, focus, selected state, urgency, kind, and errors remain distinguishable with text/glyph/structure and are not colour-only. | Source token/non-colour contract pass; execute on Windows policy configuration |
| Reduced motion | Enable `prefers-reduced-motion: reduce`; confirm no live pulse/arrival animation is required to understand state and focus/selection remain visible. | Automated CSS pass |
| Pointer targets and long content | Exercise 24px controls, dense rows, long synthetic identifiers, localized-length strings, unknown/stale/unsupported/disconnected/loading/error/empty states, and rapid alert/event bursts. | Source/fixture contract pass; execute on packaged candidate |

## Findings and limitations

No new critical or high-severity accessibility defect was identified by the automated/source qualification performed for this issue. The renderer now gives the stream a bounded polite announcement channel and names the detail region and close action explicitly. Stream presentation changes remain visible in the normal UI without depending on the live region.

The remaining manual rows require a physical supported desktop and assistive technology. They are release evidence to collect, not evidence this repository can fabricate. A release reviewer must attach the packaged-candidate results and record any findings before declaring platform/AT certification. This issue does not claim certification beyond the evidence listed above.

## Reproduction and handoff

Use only the sanitized fixture corpus under [`test/fixtures/runtime-log`](../test/fixtures/runtime-log). Do not attach real `game.log` files, account identifiers, IP addresses, private paths, or extracted game assets to the issue, pull request, screenshots, or support exports. Record OS version, display scaling, effective CSS viewport, browser/Electron build, screen-reader version, test date, workflow, result, and a sanitized diagnostic reference for every manual row.

