# AstraDock Local: Project Memory

## Mission

AstraDock Local is the trusted local companion for a Star Citizen installation. It should turn information available on the player's machine into useful, near-real-time telemetry and selectively synchronize that information to the user's AstraDock Station SaaS installation.

There are two primary data planes:

1. **Observed runtime data** from Star Citizen `game.log`: tail the active log, recognize known patterns, evaluate assertions/rules, create normalized events, and show those events in the local app with low latency.
2. **Mined official game data** from installed game assets: use external tooling such as StarBreaker and/or unp4k to read `Data.p4k`, DataCore (`.dcb`), CryXML, and related formats, normalize selected records, and publish explicitly chosen datasets to Station.

The intended result is an AstraDock desktop application where log activity—and potentially relevant mined game data—can be viewed as live telemetry. Station is the remote SaaS counterpart; AstraDock Local owns local discovery, extraction, parsing, and controlled upload.

## Standing Owner Directives

- Treat the existing application as a proof of concept, not as an architecture or interface that must be preserved. Most or all of it may be replaced when a cleaner, safer, faster, or more maintainable design warrants it.
- The current UI/UX is temporary and will be replaced entirely by the owner's forthcoming design system. Do not treat existing markup, styling, visual language, layout, or interaction patterns as product requirements. Until that design system is available, avoid unnecessary investment in polishing or expanding the current UI unless explicitly requested.
- Apply the strictest practical engineering standards to every change: code ergonomics, clarity, cohesion, maintainability, documentation, performance, security, testability, accessibility where applicable, and operational robustness are requirements rather than optional follow-up work.
- Do not preserve prototype shortcuts merely to minimize the diff. Prefer deliberate boundaries, explicit contracts, safe defaults, focused modules, deterministic behavior, useful errors, and proportionate automated verification.
- Unless the owner explicitly limits the task or requests a different stopping point, carry implementation work through a production-ready handoff: inspect relevant context, implement the complete scoped change, update tests and documentation, run appropriate verification, review the resulting diff, and create a robust, well-documented pull request.
- A robust pull request must have an intentional branch and commits, a clear title and description, motivation and scope, implementation notes, verification performed, security/privacy/performance considerations where relevant, migration or compatibility impact, screenshots or recordings for visual changes when practical, and explicit follow-ups or known limitations.
- **Never merge a pull request without the owner's explicit permission.** Creating or updating a PR is authorized by the normal delivery workflow; merging it is a separate destructive/integrating action that always requires an unmistakable owner instruction.
- Never weaken quality, tests, security, privacy, or documentation simply to reach the PR stage. If external access, credentials, a product decision, or another genuine blocker prevents a complete PR, report the exact blocker and leave the work in the safest reviewable state possible.

## Current Program Stage

- The project is currently in product and technical specification, not implementation. Do not begin rebuilding the application until the owner explicitly authorizes implementation.
- The immediate deliverables are a coherent application specification and a reviewable issue backlog organized into **MVP**, **Phase 1**, and **Phase 2**.
- Define user outcomes, scope boundaries, terminology, requirements, constraints, architecture, data contracts, security/privacy expectations, acceptance criteria, dependencies, risks, and explicit non-goals before translating work into issues.
- Each issue should be independently understandable and actionable, identify its target phase, state dependencies and acceptance criteria, and remain small enough to review without fragmenting work into meaningless tasks.
- Do not let the proof of concept dictate the roadmap. Use it as evidence about explored capabilities while evaluating the appropriate product experience and technical foundation from first principles.
- Do not prematurely assign undecided capabilities to MVP, Phase 1, or Phase 2. Phase boundaries must be justified by user value, risk reduction, dependencies, and the smallest coherent release—not by the current codebase.

## Current State

- This is a small CommonJS Electron application using vanilla HTML, CSS, and JavaScript.
- `src/main.js` owns Electron lifecycle, file selection, filesystem watching, parsing IPC, folder opening, and optional HTTP JSON enrichment.
- `src/preload.js` exposes a narrow `window.astradock` bridge to the renderer.
- `src/logParser.js` discovers common Windows/Linux `game.log` paths, reads the whole file, heuristically parses shard sightings, identifies `<Join PU>` sessions, and filters user-related lines by handle/user ID.
- `src/renderer/` renders the dashboard, session/action tables, raw context, local settings, monitoring controls, and enrichment results.
- `test/logParser.test.js` currently covers only basic shard parsing and deduplication.
- Packaging targets Windows NSIS/portable and Linux AppImage/deb. Star Citizen is primarily a Windows workload, while Linux paths support Wine/Proton/LUG installations.

The existing watcher rescans the entire file after `fs.watch` notifications. It is suitable as a prototype, but it is not yet a robust streaming telemetry pipeline.

Everything in this section describes the current proof of concept only. It is useful evidence of explored behavior, not a mandate to retain its stack, structure, APIs, or UX.

## Direction and Architectural Boundaries

- Keep collection local-first. Raw logs and extracted game assets remain local unless the user knowingly configures synchronization.
- Treat runtime log observations and mined game definitions as separate sources with separate schemas, lifecycles, and upload policies. They may be correlated in the UI, but should not be conflated.
- Normalize parser output into versioned event/data contracts before persistence, display, rule evaluation, or upload. Preserve source timestamp, ingestion timestamp, game channel/build, source location, parser/rule version, and enough raw context for diagnosis.
- Prefer an incremental tailer that handles app startup, append-only reads, truncation, log rotation/replacement, duplicate notifications, partial lines, and backpressure. Parsing and rule evaluation should not depend on renderer state.
- Keep pattern recognition deterministic and testable. Assertions/rules should consume normalized events and produce explicit derived events or actions with traceable reasons.
- Put outbound Station synchronization behind a durable queue with authentication, batching, retry/backoff, idempotency/deduplication, offline behavior, and visible sync status. Never embed secrets in renderer code or logs.
- Make expensive asset mining an explicit, cancellable background job. Detect the game channel/build and cache results by source fingerprint so `Data.p4k` is not repeatedly reprocessed.
- Preserve provenance. Clearly distinguish values observed in logs, extracted from official installed data, inferred by AstraDock rules, and enriched by third-party services.
- Expose filesystem and network capabilities only through narrow, validated main-process IPC handlers; keep the renderer isolated from Node.js and secrets.
- Assume Star Citizen formats change between builds. Prefer fixtures from sanitized real logs, tolerant parsers, parser versioning, and graceful unknown-event capture over silent data loss.
- Avoid uploading raw log lines by default because they may contain account identifiers, IP addresses, paths, or other sensitive data. Redact/minimize at the boundary and make upload scope inspectable.
- External extraction tools are integrations, not application truth. Wrap their invocation and output parsing behind adapters so StarBreaker, unp4k, or a future native implementation can be changed independently.

## External Tool Notes

- **StarBreaker** (`https://github.com/diogotr7/StarBreaker`) is the broad, actively developed Rust toolkit to evaluate first. It can read/extract P4k archives, parse/query/export DataCore, decode CryXML and DDS, handle CryEngine geometry/characters and Wwise audio, and auto-detect common Windows and Linux Star Citizen installs. Its CLI is a good initial process boundary; its crates may support tighter integration later.
- **unp4k** (`https://github.com/dolkensp/unp4k`) is the established .NET utility suite for opening, decrypting, and extracting `.p4k` data. It also includes a read-only Dokan-based virtual filesystem. Keep it as a compatibility/reference option, especially on Windows, but hide its platform and runtime requirements behind the same mining adapter boundary.
- Check each tool's current license, release packaging, command contract, and redistribution implications before bundling binaries. Prefer user-configurable executable paths until a bundling decision is explicit.

## Near-Term Priorities

1. Capture sanitized representative log fixtures and expand parser/session tests, especially actual join/leave and identity lines.
2. Define the normalized telemetry event envelope and the first useful event types.
3. Replace whole-file rescans with a resilient incremental log tailer and stream events to the UI.
4. Add local persistence/replay so telemetry survives restarts and can be debugged.
5. Specify the Station API/auth/sync contract and implement a consent-driven outbound queue.
6. Prototype a StarBreaker CLI adapter for installation discovery, version/build detection, and a narrowly scoped DataCore export before attempting broad extraction.
7. Add user-authored pattern/assertion support only after event contracts and provenance are stable.

## Open Decisions

- Station API endpoints, authentication, tenant/device identity, event schema, retention, and conflict/idempotency rules are not yet defined in this repository.
- The first runtime telemetry events beyond shard/session activity need prioritization from real log samples.
- The first official datasets to mine and publish need explicit scope; do not default to extracting or uploading the entire game database.
- Tool distribution strategy (bring-your-own executable, managed download, or bundled binary) and update/version compatibility remain undecided.

## Development Guardrails

- Preserve user changes in the worktree. At the time this memory was added, `package-lock.json` already contained unrelated dependency-resolution changes.
- Use `npm test` for the current test suite. Add focused fixtures and unit tests with every parser change.
- Do not commit real user logs, credentials, account IDs, IP addresses, or extracted copyrighted game assets. Use small sanitized fixtures.
- Keep README user-facing; update this file when the mission, architecture, or settled decisions change.
