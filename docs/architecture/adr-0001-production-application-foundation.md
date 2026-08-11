# ADR-0001: Production application foundation and prototype disposition

- **Status:** Accepted
- **Date:** 2026-08-10
- **Decision owners:** AstraDock Local product owner and maintainers
- **Decision issue:** [#3](https://github.com/Presstronic/astradock-local/issues/3)
- **Applies to:** MVP application foundation and all later phases unless superseded

## Context

AstraDock Local is an offline-first desktop companion that observes a local Star Citizen installation, converts `game.log` evidence into versioned canonical events, persists and replays those events, projects current state, and presents the result through the Runtime Monitor. Future phases may add local asset mining and consent-driven Station synchronization, but those capabilities are outside the MVP.

The current repository is a CommonJS Electron proof of concept. It demonstrates that the product can discover log files, parse selected lines, and display results, but it is not an acceptable production boundary:

- `src/main.js` combines Electron lifecycle, dialogs, filesystem watching, parsing orchestration, shell access, and arbitrary HTTP JSON retrieval.
- `src/preload.js` exposes renderer-controlled paths, options, and URLs across a privileged boundary.
- `src/logParser.js` reads whole files and combines discovery, extraction, correlation, presentation-oriented summaries, and raw evidence.
- `src/renderer/` participates in monitoring control and represents temporary product exploration.
- Renderer sandboxing is explicitly disabled.
- Monitoring state and work are not isolated from renderer and Electron-main lifecycle concerns.
- Contracts crossing process boundaries are neither versioned nor runtime-validated.

The proof of concept is capability evidence only. The owner has explicitly approved replacing all prototype application code where doing so yields a deliberate production foundation.

## Decision drivers

The foundation must support:

- Windows-first local desktop operation with a credible Linux/Wine path subject to the platform decision in issue #4.
- Reliable monitoring that does not depend on renderer state.
- Low-latency append processing without blocking Electron window or application lifecycle work.
- Explicit privilege, process, data-ownership, and failure-containment boundaries.
- Strict compile-time types and runtime validation at every untrusted or cross-process boundary.
- Deterministic domain tests without launching Electron or React.
- Accessible, dense, responsive UI implementation from the approved design direction.
- Durable storage and replay through the persistence boundary later selected by [`ADR-0003`](adr-0003-mvp-local-persistence-engine-and-retention-model.md).
- Versioned canonical events without preempting the event-contract work in issue #12.
- Replaceable infrastructure and UI dependencies with focused integration points.
- A migration that can be delivered and reviewed in coherent vertical increments.
- Clean future seams for post-MVP synchronization and asset mining without implementing either in MVP.

## Decision summary

AstraDock Local will use:

- Electron as the desktop host.
- Strict TypeScript and ECMAScript modules for production application code.
- React for the renderer.
- Vite with an Electron-oriented integration for main, preload, utility-process, and renderer development/build orchestration. The implementation issue must evaluate and pin the exact integration and versions before installation.
- npm and a single-package repository for MVP.
- One supervised Electron utility process as the authoritative runtime-telemetry process.
- A small Electron main process responsible for desktop lifecycle, native capabilities, security policy, validated IPC routing, and utility-process supervision.
- A sandboxed, context-isolated renderer with no Node.js, Electron, filesystem, database, process, environment-variable, secret, or unrestricted network access.
- A fixed, capability-oriented preload bridge that exposes product operations rather than generic IPC or platform primitives.
- Framework-independent domain, application, and contract modules.
- Port interfaces for persistence, clocks, filesystem access, diagnostics, and other infrastructure whose implementations are selected by later decisions.
- Vitest for unit, contract, and integration tests; React Testing Library for renderer behavior; and Playwright for critical desktop workflows. Useful existing `node:test` assertions may be migrated incrementally.

This ADR authorizes architectural documentation and subsequent planned foundation work. It does not itself authorize implementation outside the scope and delivery workflow of the relevant issues.

## Process and trust boundaries

### Renderer process

The renderer owns:

- React rendering and interaction behavior.
- Ephemeral presentation state such as local focus, open drawers, and unsaved filter controls.
- Accessible semantics and announcements.
- Formatting renderer-approved values through shared presentation utilities.
- Issuing typed application commands and queries.
- Consuming snapshots and bounded subscriptions.

The renderer does not own:

- Source discovery or filesystem paths.
- File watching, offsets, framing, parsing, correlation, or deduplication.
- Canonical events or authoritative current state.
- Persistence, migrations, retention execution, or replay.
- Secrets, credentials, raw operating-system capabilities, or arbitrary networking.
- The decision that monitoring is healthy merely because messages are arriving.

Renderer input, including all log-derived strings, is treated as untrusted display content and must not be interpreted as markup or code.

### Preload process context

The preload owns only the renderer-facing capability adapter. It:

- Exposes a fixed, namespaced `window.astradock` API.
- Converts renderer calls to enumerated commands and queries.
- Provides safe subscription registration and deterministic unsubscribe behavior.
- Does not expose `ipcRenderer`, raw channel names, Electron objects, Node.js modules, generic `invoke`/`send`, filesystem functions, arbitrary paths, or arbitrary URLs.
- Contains no domain rules, persistence logic, or authoritative state.

The preload API is a public compatibility surface within the application. Changes require contract versioning or coordinated compatibility handling.

### Electron main process

The main process owns:

- Electron application and window lifecycle.
- Secure `BrowserWindow` construction.
- Content Security Policy, navigation restrictions, permission policy, and window-creation restrictions.
- Native file/folder dialogs and narrowly approved shell operations.
- Validation of IPC sender identity and all renderer-supplied payloads.
- Utility-process creation, supervision, health tracking, bounded restart, and shutdown.
- Routing of approved typed commands, queries, results, and subscription messages.
- Translation of process failures into structured health state.

The main process does not own parser rules, event correlation, projections, persistence queries, renderer state, or React concepts.

### Runtime telemetry utility process

One Electron utility process owns the authoritative runtime telemetry lifecycle:

- Approved-source discovery and monitoring coordination.
- Incremental file reads, offsets, partial-line buffering, truncation, rotation, and replacement handling.
- Format/profile detection and deterministic extraction.
- Canonical-event validation.
- Event correlation, ordering, and deduplication.
- Persistence coordination, replay, checkpoints, and projection reconstruction.
- Authoritative current-state projections.
- Runtime health, bounded diagnostics, and renderer-safe updates.

It imports no React or renderer code. Its domain behavior is implemented in framework-independent modules that are testable in-process; the utility-process entrypoint is an adapter and composition root.

The MVP uses one telemetry utility process, not a process per subsystem. Post-MVP asset mining should use a separate cancellable process boundary because its workload and lifecycle differ. Station synchronization must remain behind its own consent, redaction, authentication, and durable-queue boundary when implemented.

## Application lifecycle

For MVP, AstraDock monitors only while the application is running:

1. Electron starts and establishes security policy.
2. The main process starts the telemetry utility process and waits for a bounded readiness result.
3. The window and renderer obtain an authoritative snapshot and then subscribe to changes.
4. Renderer reload or renderer crash does not stop monitoring; a returning renderer obtains a new snapshot or resumes from an approved cursor.
5. Closing the final application window begins orderly application shutdown.
6. The main process stops accepting new renderer commands, asks the runtime to flush required durable state and checkpoints, waits for a bounded acknowledgement, and terminates the runtime if it exceeds the shutdown deadline.
7. Electron exits and monitoring stops.

Background, startup, service, and system-tray monitoring are explicit non-goals for MVP. Adding them requires a product decision covering consent, visibility, notifications, resources, startup policy, upgrades, and shutdown.

## Contract and type-safety policy

### Strict TypeScript

Production TypeScript projects must enable strict checking and, where compatible with the chosen toolchain:

- `strict`
- `noUncheckedIndexedAccess`
- `exactOptionalPropertyTypes`
- `noImplicitOverride`
- `useUnknownInCatchVariables`
- `noFallthroughCasesInSwitch`
- `noUncheckedSideEffectImports`
- isolated module compilation required by the build pipeline

Linting must reject explicit `any`, unsafe assignment/call/member access/return, floating promises, and other configured escapes from type safety. Unavoidable third-party exceptions require the narrowest possible adapter, a written rationale, and focused tests.

Untrusted data begins as `unknown`. Type assertions do not constitute validation. Cross-process, persisted, external-tool, filesystem-derived, and network-derived payloads require runtime validation before becoming domain values.

Discriminated unions must be handled exhaustively. Domain identifiers and sensitive values should use distinct named types where this prevents accidental conflation or disclosure.

### Process messages

Process communication uses explicit message families rather than arbitrary channels:

- Commands request an intentional state change.
- Queries request a bounded snapshot or page.
- Results pair with commands or queries through correlation identifiers.
- Subscription messages report versioned changes, health, or invalidation.
- Structured errors contain stable codes, safe user-facing context, retryability, and a correlation identifier; they do not expose secrets or unsanitized raw evidence.

Every message family has:

- A versioned runtime schema.
- A compile-time type derived from or checked against that schema.
- Size, frequency, and timeout expectations.
- An explicit owner and permitted sender/receiver.
- Compatibility and unsupported-version behavior.
- Privacy classification and renderer-safe representation.

The exact canonical event envelope, first event payloads, schema technology, and compatibility rules remain issue #12 decisions. This ADR requires the boundary; it does not invent those schemas.

## Capability-oriented renderer API

The renderer API represents product capabilities. Illustrative namespaces include:

```ts
interface AstraDockApi {
  monitor: {
    getSnapshot(): Promise<MonitorSnapshot>;
    selectSource(): Promise<SourceSelectionResult>;
    start(): Promise<CommandResult>;
    stop(): Promise<CommandResult>;
    subscribe(listener: (change: MonitorChange) => void): Unsubscribe;
  };
  events: {
    query(query: EventQuery): Promise<EventPage>;
  };
  settings: {
    get(): Promise<RendererSettings>;
    update(command: UpdateSettingCommand): Promise<RendererSettings>;
  };
  diagnostics: {
    getHealth(): Promise<RendererHealth>;
    export(): Promise<DiagnosticExportResult>;
  };
}
```

These names are illustrative and are not accepted contracts. The implementation must preserve the capability shape:

- Source selection opens a trusted native dialog; the renderer cannot command the application to read an arbitrary path.
- Event queries accept constrained query objects; they cannot supply SQL or storage-specific expressions.
- Settings updates accept enumerated commands and validated values.
- Diagnostic export uses a privileged, inspectable workflow; it cannot write arbitrary renderer-provided content to an arbitrary destination.
- Subscriptions are bounded, sanitized, disposable, and recoverable through a snapshot or query.

## Logical architecture and dependency direction

```text
Renderer (React)
  -> renderer application client
  -> shared renderer-safe contracts
  -> preload capability adapter
  -> validated main-process IPC handlers
  -> runtime process client
  -> application use cases
  -> domain model and ports
  -> infrastructure adapters
```

Dependencies point inward:

- Domain modules depend on no UI framework, Electron API, database driver, filesystem implementation, or network client.
- Application use cases depend on domain contracts and ports.
- Infrastructure implements ports and may depend on operating-system or selected-library APIs.
- Electron entrypoints compose the application and adapt process messages.
- React features depend on renderer-safe client interfaces and design-system primitives, not Electron or storage.

Circular dependencies and imports that bypass these boundaries are prohibited. Foundation implementation must add automated architecture checks through lint boundaries, TypeScript project references, package exports, or an equivalently enforceable mechanism.

## Persistence boundary

Issue #3 determines ownership and dependency direction; [`ADR-0003`](adr-0003-mvp-local-persistence-engine-and-retention-model.md) selects the persistence engine and retention model.

The application layer will define focused ports for at least:

- Canonical-event append and bounded query.
- Environment-partitioned event deletion.
- Projection checkpoint load and commit.
- Preferences load and update.
- Migration and health reporting at the composition boundary.

Parsers, projections, and React components must not execute storage-specific queries or depend on database schemas. Transactions, indexes, migrations, durability, corruption recovery, compaction, native-module risk, file locking, and retention defaults follow [`ADR-0003`](adr-0003-mvp-local-persistence-engine-and-retention-model.md).

## Renderer and design-system boundary

React features consume AstraDock-owned design-system primitives and semantic tokens. Vendor-specific UI imports must be concentrated behind the design-system integration boundary wherever replacement cost or behavioral consistency is material.

```text
renderer/design-system/
  components/
  icons/
  tokens/
  formatters/
  accessibility/
```

Application features should import AstraDock primitives such as `Button`, `Dialog`, `Tabs`, `Drawer`, `Table`, and `StatusIndicator`, not a component vendor directly. This does not justify abstracting ordinary HTML without a meaningful consistency, accessibility, or replacement benefit.

The supplied design-system archive settles the semantic palette and the design rules explicitly recorded in its authoritative `DECISIONS.md` and `tokens/astradock.css`. Component foundation, packaged typography/icon delivery, and any interaction acceptance behavior not yet completed in the design documents remain open. Missing or ambiguous design behavior must be confirmed with the owner rather than inferred.

## Error containment and recovery

### Renderer failure

- Monitoring continues while the application remains active.
- Main/runtime state does not depend on renderer objects or subscriptions.
- Stale subscriptions are disposed when their `webContents` is destroyed.
- A replacement renderer receives an authoritative snapshot before incremental updates.

### Runtime utility-process failure

- The main process records a structured, sanitized failure and exposes degraded health.
- Restarts use a bounded retry policy with backoff and loop prevention.
- Recovery uses durable offsets/checkpoints and idempotent event handling as defined by later issues.
- Failure to recover remains visible and does not silently report healthy monitoring.

### Persistence failure

- The runtime follows the durability policy selected in [`ADR-0003`](adr-0003-mvp-local-persistence-engine-and-retention-model.md).
- It must never report an event as durably accepted when the required commit failed.
- Disk-full, permission, locking, migration, and corruption states produce actionable, sanitized health information.

### Main-process failure

- Electron exits; the MVP does not install or leave an independent background service.
- On restart, the runtime reconstructs state according to issue #32.

### Malformed or unauthorized IPC

- The receiver rejects the message before invoking application behavior.
- Rejection is bounded and safely diagnosable.
- No fallback generic channel or permissive object pass-through exists.

## Testing architecture

The test strategy separates behavior by boundary:

- **Domain unit tests:** deterministic extraction helpers, reducers/projections, correlation, deduplication, privacy classification, and state transitions without Electron.
- **Contract tests:** runtime schemas, compatibility, redaction, size limits, error shapes, and renderer-safe transformations.
- **Adapter tests:** tailing, filesystem, persistence, clocks, diagnostics, and runtime-process adapters using controlled fixtures and temporary resources.
- **Process integration tests:** main/preload/runtime command, query, subscription, restart, timeout, and shutdown behavior.
- **Renderer tests:** accessible roles, keyboard behavior, state transitions, formatting, and component interaction with a mocked application client.
- **Desktop end-to-end tests:** critical packaged or production-like flows, including startup, source selection, monitoring, renderer reload, recovery, and shutdown.

Vitest is the default unit/contract/integration runner, React Testing Library covers renderer behavior, and Playwright covers critical desktop workflows. The implementation issue must evaluate exact packages, versions, licenses, Electron support, and CI implications before installation.

Sanitized representative fixtures are mandatory. Real user logs, identifiers, paths, IP addresses, credentials, and copyrighted extracted assets must not enter the repository or test output.

## Proposed source structure

The following is the initial target. Names may be refined without weakening ownership or dependency rules.

```text
src/
  main/
    app/
    windows/
    ipc/
    security/
    services/
    index.ts

  preload/
    api/
    index.ts

  runtime/
    lifecycle/
    telemetry/
    projections/
    replay/
    index.ts

  domain/
    contracts/
    events/
    environments/
    identities/
    errors/

  application/
    commands/
    queries/
    subscriptions/
    ports/

  infrastructure/
    filesystem/
    tailing/
    persistence/
    diagnostics/

  renderer/
    app/
    features/
    design-system/
    state/
    styles/
    index.tsx

test/
  fixtures/
  unit/
  contract/
  integration/
  e2e/
```

TypeScript project references or equivalent build boundaries should separate main/preload/runtime and renderer environments while allowing carefully selected shared domain and contract modules.

## Prototype salvage and removal matrix

| Current area | Disposition | Rationale and salvageable evidence |
| --- | --- | --- |
| `src/main.js` | Replace | Responsibility mixing, permissive renderer inputs, arbitrary HTTP, whole-file watcher orchestration, and disabled sandbox conflict with the chosen foundation. Preserve knowledge of required dialogs, lifecycle events, and supported native actions. |
| `src/preload.js` | Replace | Preserve the narrow-bridge intent, but replace renderer-controlled paths/URLs and unversioned payloads with validated capability contracts. |
| `src/logParser.js` | Replace as production source | Whole-file parsing and coupled presentation objects conflict with the streaming canonical pipeline. Review and salvage proven path candidates, parsing evidence, and useful pure behaviors into new fixtures/tests. Do not copy optimistic regexes without evidence acceptance. |
| `src/renderer/index.html` | Replace | Temporary application structure and content are not product requirements. Preserve only generic Electron bootstrapping knowledge if still applicable. |
| `src/renderer/renderer.js` | Replace | Renderer-owned monitoring flow and prototype presentation do not match authoritative runtime ownership. Preserve demonstrated user tasks only when confirmed by the PRD. |
| `src/renderer/styles.css` | Replace | The prototype visual system is superseded by the owner-supplied design system. |
| `test/logParser.test.js` | Adapt selectively | Preserve valuable behavioral intent and sanitized examples after checking them against accepted evidence and canonical contracts. Move them into the new fixture and test architecture. |
| `package.json` | Replace/adapt incrementally | Retain project identity and scripts only where still accurate. Toolchain, security, packaging, and targets require issues #3, #4, and #45 decisions. |
| `package-lock.json` | Regenerate only through approved dependency changes | Existing unrelated user changes must be preserved until intentional dependency work. |
| `README.md` | Update with delivered behavior | Keep user-facing; do not document planned architecture as shipped functionality. |

No prototype file is retained merely to reduce diff size. No file is deleted before its useful evidence is reviewed and a replacement path is available.

## Migration sequence

1. **Record decisions:** accept this ADR and complete dependent platform, persistence, quality-target, design-foundation, fixture, and contract decisions.
2. **Create production scaffolding:** introduce strict TypeScript projects, build orchestration, lint/type boundaries, secure Electron entrypoints, and test harnesses without porting prototype behavior wholesale.
3. **Establish process contracts:** implement main/runtime supervision and a minimal validated preload API with health/snapshot behavior.
4. **Build a thin trustworthy vertical slice:** approved source selection to incremental append, one evidence-backed canonical event, durable append, projection, renderer query/subscription, and clean shutdown.
5. **Expand the telemetry spine:** framing/profiles, unknown evidence, correlation/deduplication, lifecycle/session/shard/party/location event families, and recovery in dependency order.
6. **Build durable state and Runtime Monitor:** complete store, replay, projections, settings, shared stream, drilldown, instruments, and diagnostics through their issues.
7. **Remove superseded prototype code:** delete obsolete paths only after replacement behavior and tests are verified; update packaging and user documentation.
8. **Qualify the release:** security/privacy, accessibility, performance/reliability, packaging, and traceability gates must pass before release readiness.

Each implementation increment must preserve a buildable, reviewable repository and must not create a temporary permissive IPC or renderer-owned monitoring path.

## Worked flow: canonical event to renderer

1. The runtime tailer receives appended bytes from an approved source.
2. The framer emits complete lines and retains an incomplete trailing fragment.
3. A compatible profile deterministically recognizes a supported record.
4. The extractor produces an untrusted candidate value set.
5. Runtime validation creates a versioned canonical event with source and ingestion timestamps, environment/build identity, provenance, confidence, parser version, and privacy classification.
6. The event store port durably appends the event according to [`ADR-0003`](adr-0003-mvp-local-persistence-engine-and-retention-model.md) semantics.
7. Relevant projection functions consume the committed event.
8. The runtime emits a bounded renderer-safe change or invalidation through its process contract.
9. Main routes the approved message to active subscribers.
10. The renderer application client updates React state without acquiring ownership of the underlying event or projection.

If the renderer is absent, steps 1–7 continue. If persistence fails, the runtime follows the explicit durability/failure policy and does not falsely report success. If a subscription falls behind, the renderer recovers through a new snapshot or cursor-based query rather than requiring the runtime to preserve unbounded UI messages.

## Alternatives considered

### Continue the CommonJS/vanilla prototype

Rejected. The prototype conflates responsibilities, lacks enforceable contracts, disables renderer sandboxing, reparses whole files, and would make accidental behavior the production architecture. Incremental cleanup would preserve more coupling and migration risk than a deliberate replacement.

### Electron with telemetry in the main process

Rejected as the production target. It reduces initial process-contract work but puts tailing, parsing bursts, storage, replay, and recovery on the application lifecycle event loop. It weakens failure isolation and increases the chance that telemetry work makes the desktop host unresponsive.

### Electron with telemetry in the renderer

Rejected. Monitoring would depend on window/renderer lifecycle and would expose privileged capabilities to the least-trusted process. Renderer reload or crash could interrupt collection or corrupt authoritative state.

### Node.js worker thread for the complete telemetry runtime

Rejected as the default runtime boundary. A worker isolates CPU execution but shares the containing process's failure lifecycle and is less explicit as the owner of a long-lived I/O, storage, replay, and health subsystem. Worker threads remain available inside a privileged process for a measured CPU-bound operation when evidence justifies them.

### Separate operating-system service or daemon

Deferred. It would enable monitoring after window/application exit but introduces installation, startup, upgrades, permissions, consent, visibility, diagnostics, and uninstall complexity. MVP explicitly stops monitoring when AstraDock exits.

### Tauri or another native desktop host

Rejected for MVP. A native host could reduce some runtime footprint, but changing the host would add Rust/native integration, plugin capability evaluation, packaging work, and migration risk without removing the need for the same process, contract, storage, and security design. Electron fits the approved web UI direction and existing project expertise when properly hardened.

### Vanilla TypeScript, Web Components, Vue, or Svelte renderer

Rejected for the production UI decision. Each could implement the product, but React aligns with the existing design vocabulary, accessibility/testing ecosystem, and anticipated component workflow. Domain and application boundaries prevent React from becoming application truth.

### Monorepo/workspace from MVP start

Rejected for now. The application has no independently versioned or published packages. A single package with TypeScript/build boundaries provides sufficient separation without workspace release and dependency-management overhead. This can be revisited when independently consumed packages exist.

## Consequences

### Positive

- Monitoring survives renderer reload and renderer failure while the application remains active.
- Electron's privileged main process remains small and reviewable.
- Domain behavior can be tested without Electron, React, or a real database.
- Runtime schemas protect boundaries that TypeScript alone cannot protect.
- Persistence and design-system choices remain replaceable behind focused ports.
- UI implementation aligns with the approved React-oriented design workflow without making generated code authoritative.
- Process failure, restart, shutdown, and recovery have explicit owners.
- Post-MVP capabilities have clean seams without expanding MVP scope.

### Costs

- Main/runtime/preload contracts and lifecycle supervision require deliberate implementation and tests.
- Multiple TypeScript targets increase build configuration compared with the prototype.
- Utility-process integration complicates debugging and packaging relative to one process.
- Runtime validation adds code and modest processing cost at boundaries.
- Design-system and infrastructure ports require discipline to avoid meaningless abstraction or leaky implementations.

These costs are accepted because they directly support the product's reliability, security, testability, and long-term maintainability requirements.

## Security and privacy implications

- Renderer sandboxing and context isolation are mandatory.
- Node integration, remote code execution, arbitrary navigation, permissive window creation, and generic IPC are prohibited.
- CSP and Electron security policy must be explicit and tested.
- IPC sender identity and runtime payload schemas must be validated.
- Raw logs, private paths, IP addresses, handles, account identifiers, and secrets remain privileged/sensitive and are minimized before renderer or diagnostic exposure.
- Remote resources and CDN-required production assets are prohibited unless a later reviewed requirement explicitly authorizes them.
- No Station secret or future credential may enter renderer code, process messages intended for the renderer, or logs.

## Performance and reliability implications

- Telemetry work is isolated from the Electron main event loop and renderer frame budget.
- Message payloads and subscriptions must be bounded; event streams use paging/invalidation rather than unbounded pushes.
- Backpressure exists at filesystem, processing, persistence, and renderer-delivery boundaries.
- Shutdown, runtime readiness, commands, queries, and restarts use explicit timeouts.
- Numeric performance and reliability objectives remain issue #6 decisions and must be applied to this architecture.

## Accessibility implications

- React does not provide accessibility automatically; semantic HTML, focus management, keyboard behavior, live-region policy, scaling, reduced motion, and screen-reader verification remain explicit requirements.
- Shared primitives concentrate accessible behavior without preventing native HTML use.
- Renderer tests and release qualification must cover the acceptance matrix established by issue #7 and issue #46.

## Packaging and compatibility implications

- The build must package main, preload, runtime utility-process, renderer, schemas, migrations, and approved assets without development or private evidence.
- Utility-process entrypoints and any future native persistence module must be included and verified in installed artifacts.
- Operating-system, architecture, artifact, signing-gate, update, and release-validation policy is settled by [`ADR-0002`](adr-0002-mvp-platform-packaging-and-update-policy.md). Exact implementation versions and release automation remain delivery decisions under issues #45 and #50.
- Production dependencies must be pinned through the lockfile and reviewed for maintenance, license, security, and offline packaging behavior.

## Deferred decisions

This ADR intentionally does not settle:

- Exact packaging and updater dependency versions and CI integration, within the policy established by [`ADR-0002`](adr-0002-mvp-platform-packaging-and-update-policy.md): issues #45 and #50.
- Persistence driver selection and implementation details under the policy established by [`ADR-0003`](adr-0003-mvp-local-persistence-engine-and-retention-model.md).
- Numeric latency, resource, backlog, recovery, and soak objectives: issue #6.
- Component foundation, packaged typography/icons, and unfinished interaction acceptance details: design-system follow-up; semantic colors are settled by the supplied design system.
- Fixture corpus and evidence acceptance: issues #8–#11.
- Exact canonical events, process schemas, schema library, and version compatibility: issue #12.
- Detailed source discovery, tailing, parsing, projection, replay, and Runtime Monitor implementation: their dedicated issues.
- Background/tray operation, Station synchronization, asset mining, history/analytics, and user-authored rules: post-MVP or separately approved work.

## Compliance checklist for implementation reviews

An implementation conforms to this ADR only when:

- Renderer code cannot import Electron or Node.js capabilities.
- The production renderer is sandboxed and context-isolated.
- Preload exposes only fixed capability methods with safe subscription disposal.
- Main validates sender identity and runtime payloads before dispatch.
- Telemetry state remains authoritative outside the renderer.
- Tailer/parser/store/projection behavior does not run on the Electron main event loop as the production architecture.
- Domain and application modules do not import React, Electron, or concrete storage implementations.
- Cross-process and persisted values are runtime-validated.
- Explicit and implicit `any` are rejected by the configured quality gates.
- UI vendor dependencies remain concentrated behind appropriate AstraDock design-system boundaries.
- Closing the final window stops monitoring and terminates the application cleanly.
- Renderer reload and renderer crash do not stop monitoring while the application remains active.
- Failure, restart, timeout, backpressure, shutdown, and recovery paths have automated verification proportionate to risk.
- No prototype shortcut is retained without documented evidence that it satisfies the new boundary.

## Supersession

Changes to the selected host, renderer framework, authoritative process, trust boundary, repository topology, or strict-type policy require a superseding ADR. Implementation refinements that preserve these decisions may update this ADR with review and a dated rationale.
