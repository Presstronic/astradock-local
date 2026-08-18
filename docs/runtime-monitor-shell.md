# Runtime Monitor Shell Implementation

## Status and Scope

| Field | Value |
| --- | --- |
| Status | Initial implementation for issue #33 |
| Product area | Runtime Monitor shell and interim semantic design foundation |
| Originating issue | [#33](https://github.com/Presstronic/astradock-local/issues/33) |
| Design contract | [`mvp-design-tokens-and-interaction-matrix.md`](mvp-design-tokens-and-interaction-matrix.md) |
| Deferred test tracker | [#67](https://github.com/Presstronic/astradock-local/issues/67) |
| Runtime source | [`src/renderer/`](../src/renderer/) |

This document describes the first production-directed Runtime Monitor shell implementation. It replaces the original vanilla dashboard renderer rather than restyling it. The shell is intentionally local-only and consumes the existing renderer gateway from issue #29. It does not add Data Operations, History/Analytics, Station authentication, Station synchronization, asset mining, or unproven telemetry families.

## Technology and Libraries

| Package | Version | Role | License evidence |
| --- | ---: | --- | --- |
| `react` | `^19.2.8` | Renderer UI framework selected by ADR-0001 | MIT license from React package metadata |
| `react-dom` | `^19.2.8` | DOM renderer for the React shell | MIT license from React package metadata |
| `lucide-react` | `^1.31.0` | Bundled outline icon components; no CDN icon runtime | Package `LICENSE` is ISC and includes inherited MIT notices for Feather-derived icons |
| `@fontsource/space-grotesk` | `^5.3.0` | Bundled display font | Package `LICENSE` records SIL Open Font License 1.1 |
| `@fontsource/hanken-grotesk` | `^5.3.0` | Bundled body/UI font | Package `LICENSE` records SIL Open Font License 1.1 |
| `@fontsource/jetbrains-mono` | `^5.3.0` | Bundled data/time/terminal font | Package `LICENSE` records SIL Open Font License 1.1 |
| `typescript` | `^7.0.2` | Strict renderer typechecking | Apache-2.0 package license |
| `vite` | `^8.2.1` | Renderer build pipeline and asset bundling | MIT package license |
| `@vitejs/plugin-react` | `^6.0.5` | React transform for Vite | MIT package license |
| `vitest` | `^4.1.10` | Renderer test runner wiring; tests deferred to #67 | MIT package license |
| `@testing-library/react` | `^16.3.2` | Future renderer behavior/accessibility tests tracked by #67 | MIT package license |
| `@testing-library/jest-dom` | `^7.0.1` | Future DOM assertions tracked by #67 | MIT package license |
| `jsdom` | `^29.1.1` | Renderer test environment tracked by #67 | MIT package license |

Electron was updated to `^43.4.0` and electron-builder to `^26.15.3` because the prior versions produced high and critical npm audit findings. `npm audit --json` reported zero vulnerabilities after the update.

## Source Boundaries

The implemented renderer source is strict TypeScript and React:

- `src/renderer/index.html` is a minimal Vite entry document with the existing strict CSP and dark color-scheme declaration.
- `src/renderer/src/main.tsx` imports bundled fonts, global semantic CSS, and mounts the shell.
- `src/renderer/src/astradock-api.ts` adapts the typed `window.astradock` preload contract and provides a safe unavailable-client fallback for non-Electron renderer tests.
- `src/renderer/src/runtime-monitor-model.ts` is the pure state classification and presentation model for renderer-safe DTOs.
- `src/renderer/src/runtime-monitor-app.tsx` owns React presentation state only: focus, search text, selected event, detail loading state, and local view preferences.
- `src/renderer/src/styles.css` contains the interim semantic token aliases and layout rules consumed by the shell.

The renderer does not import Node.js, Electron, filesystem modules, package manager APIs, process environment, raw IPC, or privileged path handling. Source discovery, scanning, monitor lifecycle, evidence detail, diagnostics, and subscriptions continue to cross only through the typed preload gateway.

## Shell Information Architecture

The shell opens directly to Runtime Monitor and includes:

- Header landmark with product/workspace name, active Runtime Monitor tab, unavailable post-MVP workspace controls, monitor state, environment, build, freshness, optional warning count, and global monitor actions.
- Current-state rail with source health, current-state instruments, dedicated Party section, and dedicated Mission section.
- Stream workspace with Terminal/Table view switch, density control, per-view drawer placement control, bounded literal search, result count, attention/warnings region, and empty state.
- Shared detail dock for stream rows, instruments, Party, Mission, and alerts. The current implementation supports right and bottom push placements and preserves the stored placement preference separately for Terminal and Table.
- Status bar with monitor state, local-only indicator, bounded stream statement, search/filter state, alert state, and local view preference state.

## State Semantics

The renderer model exposes the issue #33 system states:

```text
loading
no-source
recovering
ready
stale
disconnected
unsupported-profile
degraded
fatal
```

Current-state instruments preserve these semantic value states:

```text
known
last-confirmed
unknown
transitioning
stale
disconnected
unsupported
```

Detail surfaces preserve these semantic states:

```text
empty
loading
ready
not-found
retention-removed
redacted
unsupported
error
```

Unknown values render as `Unknown`; unsupported values render as `Unsupported`; empty Party state renders as `Not in a party`; Mission state remains explicitly unsupported until evidence gates are closed by later issues.

## Formatting and Privacy Rules

- Environment values render as uppercase channel labels plus environment/build detail when available.
- Build values remain opaque strings.
- Freshness renders as compact elapsed duration and preserves exact timestamp in the header metric `title`.
- Warning count renders only when non-zero.
- Stream rows use immutable renderer evidence IDs for selection.
- Stream display is bounded to 100 visible rows until the dedicated virtualization/live-follow issue replaces this interim bound.
- Raw evidence is never present in default scan rows. Detail requests use `events.getEvidenceDetail({ kind, id })` and show only bounded local evidence returned by the main-process gateway.
- Examples and labels use synthetic generic values only.

## Accessibility and Responsive Behavior

Implemented shell semantics include:

- Skip links to stream and current state.
- Named header, main, current-state, stream, attention/warnings, detail, status, and workspace navigation regions.
- Runtime Monitor tab with `aria-current="page"` and visible post-MVP unavailable workspace controls.
- Keyboard-reachable monitor commands, instruments, stream view controls, density control, drawer placement controls, search/reset, stream row selection, and detail close.
- Terminal view uses listbox/option semantics; Table view uses native table semantics.
- Detail opening moves focus to the detail heading and close restores focus to the initiating control.
- Reduced-motion media query disables transitions/animations.
- Minimum effective window contract is aligned to `1024x640`; `1280x720` and larger use the full shell layout. Compact responsive layout moves the detail dock to the bottom when right dock space would be constrained.

Full release accessibility qualification remains tracked by #46, and the automated coverage deferred from this implementation is tracked by #67.

## Build, Packaging, and Offline Assets

The renderer is built with Vite into `dist/renderer`. Electron loads `dist/renderer/index.html`, and electron-builder includes `dist/renderer/**/*` in packaged artifacts. The application `start`, `build`, and `dist` scripts build the renderer before launching or packaging.

Vite emits local font files into `dist/renderer/assets`. No production font, icon, style, script, or image dependency is loaded from a CDN. The CSP continues to use `connect-src 'none'` for the renderer document.

## Verification Performed

Automated verification performed for this implementation:

```bash
npm run typecheck
npm run build:renderer
npm run test:node
npm run test:renderer
npm test
npm audit --json
npm run build
git diff --check
```

`npm run build` required network access for electron-builder to download Electron packaging resources. The first sandboxed attempt failed with `getaddrinfo EAI_AGAIN github.com`; the approved network retry passed.

Renderer behavior tests, deeper accessibility tests, responsive/Playwright checks, and additional security regression tests are intentionally deferred to #67 per owner direction for today's work.
