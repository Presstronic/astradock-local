# AstraDock Local Project Handoff

## Purpose of This Document

This document preserves the product context and decisions established during the initial Codex project-orientation session. It is intended to let the owner or another Codex installation continue the work from a different computer without relying on access to the original conversation.

For standing agent instructions, also read the repository-root [`AGENTS.md`](../AGENTS.md). That file is authoritative for how work in this repository must be performed. This document supplies the broader conversational and product context behind those instructions.

## Product Vision

AstraDock Local is a trusted desktop companion for the Star Citizen installation on the user's machine. Its intended responsibilities are to:

- Observe Star Citizen's `game.log` in or near real time.
- Recognize known log patterns and evaluate user-defined patterns or assertions.
- Convert observations into useful, normalized telemetry.
- Display log telemetry locally in the AstraDock application.
- Mine selected official game data from the locally installed game files.
- Correlate runtime observations with relevant mined game definitions where useful.
- Selectively and securely synchronize approved telemetry and datasets to the user's AstraDock Station SaaS installation.

The desired product outcome is a local application where live Star Citizen activity—and potentially selected mined game data—can be viewed as coherent real-time telemetry. AstraDock Station is the remote SaaS counterpart. AstraDock Local owns local discovery, collection, extraction, parsing, rule evaluation, and controlled synchronization.

## Data Domains

The product has two distinct data planes that must retain separate schemas, provenance, lifecycles, and upload policies.

### Runtime telemetry

Runtime telemetry is observed from `game.log`. The future system should incrementally tail the active log, interpret recognized records, preserve unknown records for diagnosis where appropriate, create normalized events, evaluate rules, persist useful history, stream updates to the interface, and queue explicitly approved remote synchronization.

Runtime data is observational. It may include sensitive information such as account identifiers, network addresses, filesystem paths, or raw player activity. Raw log lines should not be uploaded by default.

### Official installed game data

Official game data is mined from locally installed Star Citizen assets such as `Data.p4k`, DataCore (`.dcb`), CryXML, textures, geometry, audio metadata, and related formats. Mining should be an explicit, cancellable background operation scoped to named datasets. Results should be cached by source build or fingerprint so large archives are not repeatedly processed.

Extracted game definitions are not runtime observations. The UI may correlate these domains, but storage and event contracts must preserve their different origins.

## Current Repository State

The repository currently contains a quickly assembled proof of concept:

- A CommonJS Electron application using vanilla HTML, CSS, and JavaScript.
- `src/main.js` for Electron lifecycle, filesystem watching, parsing IPC, file selection, folder opening, and optional HTTP JSON enrichment.
- `src/preload.js` for the renderer's `window.astradock` bridge.
- `src/logParser.js` for common Windows/Linux log-path discovery, whole-file reads, heuristic shard parsing, `<Join PU>` session recognition, and username/user-ID filtering.
- `src/renderer/` for the current dashboard and controls.
- `test/logParser.test.js` for a small set of shard parsing/deduplication tests.
- Electron Builder targets for Windows NSIS/portable and Linux AppImage/deb.

The current watcher responds to `fs.watch` events by reading and reparsing the entire log. It is a useful capability experiment, not a production streaming architecture.

No part of the existing architecture must be retained merely because it exists. The owner expects that most or all of the implementation may be overhauled.

## UI and Design Direction

The existing UI/UX will be replaced entirely. The owner is building a full design system that will define the future product interface. Current markup, CSS, navigation, layout, visual language, and interactions are not design requirements.

Until the design system is available, avoid investing in visual refinement or expanding the prototype interface unless the owner explicitly requests it. Accessibility, interaction semantics, and frontend architecture remain quality requirements when the replacement UI is implemented.

## Non-Negotiable Engineering Standard

All future work must adhere as strictly as practical to best practices for:

- Code ergonomics and readability.
- Clean, cohesive architecture and explicit boundaries.
- Maintainability and useful documentation.
- Correctness, deterministic behavior, and testability.
- Performance and resource efficiency.
- Security, privacy, least privilege, and safe defaults.
- Accessibility where applicable.
- Operational robustness, observability, and actionable errors.

Prototype shortcuts are not a reason to preserve weak design. Prefer deliberate contracts and focused modules even when replacement produces a larger diff.

## Delivery and Pull Request Policy

Unless the owner explicitly specifies a narrower stopping point, work should be carried through a production-ready handoff:

1. Inspect relevant repository and product context.
2. Implement the complete scoped change.
3. Add or update proportionate automated tests.
4. Update relevant developer and user documentation.
5. Run the appropriate verification suite.
6. Review the complete diff for quality, security, performance, and unintended changes.
7. Create intentional commits on a dedicated branch.
8. Push the branch and create a robust, well-documented pull request.

Pull requests should explain motivation, scope, implementation, verification, security/privacy/performance considerations where relevant, compatibility or migration impact, visual evidence where practical, and known limitations or follow-ups.

Codex must never merge a pull request unless the owner gives explicit, unmistakable permission. The owner will merge the initial project-context PR created from this handoff.

## Current Program Stage

The project is not currently entering implementation. The next body of work is product and technical specification.

The planned deliverables are:

- A coherent application specification.
- A reviewable, actionable issue backlog.
- Explicit delivery groupings for **MVP**, **Phase 1**, and **Phase 2**.

Before issues are created, the specification should establish:

- Target users and their primary outcomes.
- Product terminology and core workflows.
- Functional and non-functional requirements.
- Scope and explicit non-goals for each phase.
- Technical constraints and supported platforms.
- Proposed architecture and subsystem boundaries.
- Runtime event and mined-data contracts.
- Local persistence and replay expectations.
- Station API, authentication, device identity, and synchronization expectations.
- Security, privacy, consent, and redaction requirements.
- Performance and reliability objectives.
- Dependencies, risks, unknowns, and research spikes.
- Acceptance criteria that make delivery verifiable.

Issues should be independently understandable and actionable, declare their phase and dependencies, include acceptance criteria, and remain small enough to review without being fragmented into meaningless chores.

Do not assign features to a phase merely because the prototype already contains them. Phase boundaries should follow user value, risk reduction, dependency order, and the smallest coherent release.

## Initial Architectural Direction

These are informed starting principles, not a finalized technical specification:

- Keep collection local-first and make synchronization opt-in and inspectable.
- Introduce versioned normalized contracts before persistence, rule evaluation, display, or upload.
- Preserve source timestamp, ingestion timestamp, game channel/build, source location, parser/rule version, provenance, and diagnostic context.
- Build a resilient incremental tailer that handles startup position, append-only reads, partial lines, truncation, rotation/replacement, duplicate filesystem notifications, backpressure, and clean shutdown.
- Keep parsing and rule evaluation independent of renderer state.
- Make pattern recognition deterministic and fixture-driven.
- Let assertions consume normalized events and emit traceable derived events or actions.
- Add local persistence and replay for restart recovery and diagnosis.
- Put Station synchronization behind a durable queue with authentication, batching, retry/backoff, idempotency, deduplication, offline behavior, and visible status.
- Keep secrets and privileged filesystem/network operations out of renderer code.
- Validate narrow IPC contracts and maintain renderer isolation.
- Treat game formats as version-dependent and tolerate unknowns without silent data loss.
- Redact or minimize sensitive information at the upload boundary.
- Hide external extraction tools behind adapters so tool choice can change independently of the application domain.

## External Game-Data Tool Research

### StarBreaker

Repository: <https://github.com/diogotr7/StarBreaker>

StarBreaker is the strongest initial candidate for a mining integration. It is an actively developed Rust toolkit with a CLI, library crates, and a Tauri application. Its documented capabilities include:

- Reading and extracting P4k archives.
- Parsing, querying, and exporting DataCore records to JSON/XML.
- Decoding CryEngine binary XML.
- Reading CryEngine geometry and character formats.
- Exporting meshes and assembled entities to glTF/GLB.
- Reading and converting DDS textures.
- Inspecting Wwise soundbanks and decoding WEM audio.
- Discovering common Windows and Linux/Wine/Proton Star Citizen installations.

An initial integration should likely use its CLI as a process boundary. A narrower library integration can be evaluated later if it offers material deployment or performance benefits.

### unp4k

Repository: <https://github.com/dolkensp/unp4k>

unp4k is an established .NET utility suite for opening, decrypting, and extracting Star Citizen `.p4k` files. It also includes a read-only Dokan-based virtual filesystem for Windows. It remains valuable as a compatibility option and format reference, particularly on Windows, but its platform/runtime needs should remain hidden behind the same application adapter boundary.

Before distributing either tool, confirm its current license, release packaging, redistribution implications, invocation contract, update model, and compatibility with supported Star Citizen builds. A user-configurable executable path is safer than bundling until these questions are deliberately resolved.

## Known Open Decisions

- Supported operating systems and the priority order between native Windows and Linux/Wine/Proton workflows.
- The initial user personas and highest-value live telemetry workflows.
- The first event types beyond the prototype's shard/session observations.
- The rule/assertion authoring model and its trust/sandbox boundaries.
- Local database choice, retention, export, and deletion controls.
- Station endpoints, authentication, tenant/device identity, event schemas, batching, retention, and idempotency rules.
- The first official game datasets worth mining and synchronizing.
- Whether extraction tools are user-supplied, managed downloads, or bundled binaries.
- Update/version compatibility behavior across Star Citizen channels and builds.
- The future application stack and packaging architecture.

## Repository and Data Safety

- Never commit real player logs, credentials, account identifiers, IP addresses, private filesystem paths, or extracted copyrighted game assets.
- Use small, sanitized, representative fixtures for parser tests.
- Preserve unrelated owner changes in the worktree.
- Treat destructive actions, publishing, and merging as separate decisions with clear scope.
- Keep the root `README.md` user-facing and keep `AGENTS.md` updated when settled project directives change.

## How to Run the Existing Prototype

From the repository root:

```bash
npm install
npm start
```

Run its current tests with:

```bash
npm test
```

The app checks common Star Citizen log locations. If auto-detection fails, select the channel's `game.log` manually, for example:

```text
C:\Program Files\Roberts Space Industries\StarCitizen\LIVE\game.log
```

or a typical Linux Wine/LUG path:

```text
~/Games/star-citizen/drive_c/Program Files/Roberts Space Industries/StarCitizen/LIVE/game.log
```

## Recommended Resume Point

Begin the next session by reading `AGENTS.md` and this document, then work with the owner to design the specification before creating the phased issue backlog. Do not begin application implementation.

A productive first specification conversation should establish the target user, the single indispensable MVP workflow, what information Station already owns, what must function offline, supported platforms, and the owner's initial telemetry examples. Use those answers to draft the product scope before locking technical architecture or issue boundaries.
