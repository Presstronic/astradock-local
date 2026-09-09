# Exporter / Blueprint Data issue backlog

Status: specification backlog only. These tickets do not authorize implementation until the owner explicitly moves the project into implementation.

## Scope and evidence boundary

The first Exporter release is a narrow local workflow: add an `Exporter` tab following the settled Log tab rules; on demand scan the selected environment's current `Game.log` and matching `logbackups/Game Build(*) [DAY] [MONTH] [YEAR] (*).log` files; initially enable only `Blueprint Data`, `LIVE`, and `JSON`; show approved future choices such as `Inventory`, `Fleet`, and `Reputation` as disabled; produce unique Station-shaped records using `docs/samples/blueprints/`; open a native save dialog; and provide a separate Exporter-only focused build. The normal app retains Log.

The copied logs contain no direct blueprint, schematic, recipe, crafting, manufacturing, unlock, or learned-record vocabulary. Inventory initialization and attachment events are not sufficient blueprint evidence. A public community extractor identifies a likely signal of the form `SHUDEvent_OnNotification` / `Added notification "Received Blueprint: <name>: " [<notification id>] to queue`, with repeated follow-up notification lines that must not be counted again. This is community evidence, not an official CIG contract, so it must be validated against owner-provided captures before becoming production behavior. Blueprint recognition is therefore an explicit evidence spike, and the parser must support a truthful no-match result.

---

## EXP-001 — Capture and approve blueprint log evidence

**Phase:** MVP prerequisite / owner evidence spike
**Type:** Evidence spike / decision record
**Dependencies and blockers:** Owner supplies additional sanitized logs or confirms an intentionally empty first parser.

### Context, story, and intended outcome

The current clean-install corpus has no reliable blueprint-acquisition or ownership pattern: it contains zero `Received Blueprint` matches. Implementing from generic inventory lines could export ordinary items as blueprints. Public community implementations report a likely notification signal: `SHUDEvent_OnNotification` with `Added notification "Received Blueprint: <name>: " [<id>] to queue`, followed by repeated queue/update echoes. As product owner, I need representative sanitized logs showing that signal in the relevant build and language so the extractor recognizes only supported evidence. The outcome is an approved evidence note defining accepted shapes, fields, builds, confidence, and false positives—or an explicit no-pattern decision.

### In scope

- Capture logs around a blueprint being earned, granted, learned, or persisted, preferably across fresh and later sessions.
- Include duplicate/replay cases where possible.
- Capture the complete candidate notification line and nearby follow-up lines. Validate that only the initial `Added notification` event is counted; later queue echoes and `UpdateNotificationItem` follow-ups may repeat the same blueprint.
- Record whether the notification label is localized. Prefer reading the installed localization value for `crafting_hud_notification_received_blueprint`; do not assume English is universal.
- Sanitize handles, account/entity/session IDs, IPs, paths, and secrets while preserving delimiters, fields, timestamps, and needed item identifiers.
- Map evidence to Station fields `name`, `type`, and `shared`; identify direct, derived, and unavailable values.
- Document non-matches for `AttachmentReceived`, inventory queries, reward-room asset paths, and unrelated items.

### Non-goals, assumptions, and risks

No parser implementation, raw-log upload, Data.p4k/DataCore extraction, or assumption that item attachment equals blueprint ownership. The game may not log ownership; patterns may vary by build/backend; sanitization may remove structure.

### Acceptance criteria

- Owner-reviewed evidence identifies candidate event shapes, fields, confidence, build/environment, and false positives.
- The candidate notification pattern is either confirmed for the target build/language or explicitly rejected as insufficient evidence.
- Duplicate follow-up behavior and localization behavior are documented.
- `shared` is explicitly observed, derived, or unavailable.
- If no pattern exists, safe empty/unsupported-result behavior is defined.

### Verification

Happy path: review a sanitized confirmed capture, map each field, and verify one initial notification plus repeated follow-ups produces one observation. Unhappy path: review the current clean-install corpus, which has no `Received Blueprint` matches, plus generic inventory lines and confirm they cannot be promoted.

### Definition of Done

Evidence is privacy-safe, owner-reviewed, linked from implementation tickets, and contains accepted, rejected, and unknown examples.

### Technology and libraries

None. This is an evidence and decision spike.

### Evidence references

- [Basetool SC Extractor blueprint parser](https://github.com/krt-profit/basetool-sc-extractor/blob/main/src/main/kotlin/com/basetool/bpextractor/BlueprintParser.kt): community implementation documenting the `SHUDEvent_OnNotification` / `Added notification` signal, repeated follow-ups, localization key, and name terminator.
- [Community extraction script](https://www.reddit.com/r/starcitizen/comments/1sb1h9x/heres_a_python_code_to_extract_all_of_your/): independently reports matching `Received Blueprint` across `Game.log` and `logbackups`, then deduplicating names.
- These sources are leads rather than official CIG contract documentation and require owner-corpus confirmation.

---

## EXP-002 — Add the Exporter workspace and focused build target

**Phase:** MVP
**Type:** User Story + Technical Story
**Dependencies:** Existing Log/design-system contracts; EXP-001 for final blueprint-state wording.

### Context, stories, and intended outcome

Players need a native export workflow without disrupting Log. As a player, I want an Exporter tab that feels like AstraDock. As a maintainer, I want a separate Exporter-only build while unfinished workspaces are hidden. Normal navigation adds Exporter; the focused artifact starts in Exporter and exposes no unfinished tabs.

### In scope

- Add Exporter navigation while leaving Log functional.
- Reuse Log's settled interaction, keyboard, focus, density, state, Terminal/Table, and shared-drilldown rules.
- Define configuration, source summary, progress/status, results, and diagnostics regions.
- Enable exactly `Blueprint Data`, `LIVE`, and `JSON`.
- Show only approved future options such as Inventory, Fleet, and Reputation as disabled, explained, and non-submittable.
- Add a documented Exporter-only command/artifact without changing normal packaging.

### UI contract

Show export type, uppercase environment, output format, source readiness, file count, phase, measurable or indeterminate progress, unique records, duplicates suppressed, warnings, and output path only after success. Distinguish idle, validating, scanning, parsing, deduplicating, save-pending, writing, completed, cancelled, no-match, partial, unsupported, missing, stale, disconnected, and error states. Do not rely on color alone or expose full paths by default.

### Non-goals, assumptions, and risks

No future dataset implementation, CSV, non-LIVE environment, Station upload/authentication, or Log redesign. Design-system documents remain authoritative; the focused artifact is not a supported release.

### Acceptance criteria

- Normal navigation includes Exporter and Log still works.
- Exactly three MVP selections are enabled.
- Disabled choices cannot submit work and explain their status.
- Focused build exposes only Exporter and is documented.
- States are accessible, keyboard-safe, and responsive.

### Verification

Happy path: navigate both tabs, launch focused build, verify defaults, keyboard/focus, and narrow-window behavior. Unhappy path: activate disabled choices, start with no source, resize narrowly, and simulate process errors.

### Definition of Done

Behavior is documented against design decisions; model/UI tests, accessibility checks, focused-build verification, and privacy review pass.

### Technology and libraries

None expected. Reuse the existing Electron, vanilla renderer, build, and test foundation.

---

## EXP-003 — Discover, validate, and scan the active log source set

**Phase:** MVP
**Type:** Technical Story
**Dependencies:** Existing source discovery/IPC boundary; EXP-002; EXP-001 environment semantics.

### Technical story and intended outcome

As the local collection boundary, I need a validated installation root and deterministic source-set scan so Exporter reads the intended current log and historical backups without cross-environment mixing or broad filesystem access.

### In scope

- Reuse automatic discovery and allow a validated user override.
- Resolve sibling `logbackups` relative to the selected environment's `game.log`.
- Match `Game Build(...) date (time).log` case-insensitively while tolerating harmless variation.
- Exclude unrelated files, directories, temporary files, and other environments.
- Include current log and each backup once, in deterministic order with stable tie-breakers.
- Process incrementally with bounded memory/concurrency; report included, skipped, missing, malformed, and inaccessible inputs.
- Handle deletion, replacement, locks, empty/partial files, and changes during scan.
- Keep filesystem access in main-process IPC; renderer submits validated source IDs, not arbitrary paths.

### Non-goals, assumptions, and risks

No whole-disk search, non-LIVE scan, live-monitor subscription, or raw-line upload. Filename metadata may not prove line environment; multiple installations and changing files are expected.

### Acceptance criteria

- Automatic discovery and validated override work on supported platforms.
- Source summary identifies current log, valid backups, and skipped inputs.
- Invalid renderer paths are rejected and full paths are absent from default status.
- A safe source identity/fingerprint is available for diagnostics.

### Verification

Happy path: scan the supplied LIVE corpus and verify deterministic unique selection. Unhappy path: remove current log/backup directory, add malformed/unreadable/duplicate files, change a file during scan, and submit invalid IPC; confirm safe retryable outcomes.

### Definition of Done

Contract, platform/source tests, IPC tests, permission/rotation tests, deterministic-order tests, resource measurements, and privacy review are complete.

### Technology and libraries

None expected. Reuse Node.js filesystem APIs and existing source-discovery/IPC boundaries.

---

## EXP-004 — Define blueprint recognition, normalization, and deduplication

**Phase:** MVP, contingent on EXP-001
**Type:** Technical Story
**Dependencies:** EXP-001, EXP-003, and `docs/samples/blueprints/`.

### Technical story and intended outcome

As the data-contract boundary, I need a versioned deterministic extractor so Exporter emits Station-compatible unique records without false positives or invented values.

### In scope

- Define a versioned extraction profile with build/environment compatibility.
- Parse only patterns approved by EXP-001; unknown evidence may be bounded local diagnostics only.
- Use the approved notification anchor (`Added notification`) and the localized blueprint label/value rather than counting every occurrence of `Received Blueprint`.
- Normalize `name`, `type`, and `shared` using the template's string/empty/null semantics.
- Define canonical identity, initially name plus any stable identifier proven by evidence.
- Deduplicate current/backups, repeated sessions, repeated lines, and duplicate files.
- Preserve local provenance, timestamp, build, parser version, confidence, and suppressed-observation count without adding unapproved fields to Station payload.
- Keep observed, inferred, and unknown values distinct.
- Return explicit no-match, unsupported, malformed, partial, and ambiguous-identity outcomes.

### Non-goals, assumptions, and risks

No all-inventory extraction, DataCore/P4k lookup, fuzzy merging, or Station sync. Identity may initially be name-only; build drift can invalidate profiles; conflicting duplicates need deterministic merge rules.

### Acceptance criteria

- Every output record matches the approved Station shape.
- Repeated logical blueprints produce exactly one record.
- Duplicate/suppressed counts are reported.
- Unsupported, ambiguous, malformed, and generic inventory evidence is excluded and explained.
- Empty results distinguish no matches from scan failure.

### Verification

Happy path: accepted notification events repeated across files and echoed within one file yield one stable record. Unhappy path: test missing fields, malformed lines, localized labels, repeated queue/update echoes, conflicting duplicates, generic attachments, unsupported builds, and unknown patterns; confirm no guesses.

### Definition of Done

Contract/identity rules are versioned; fixtures cover accepted, duplicate, malformed, unsupported, conflict, and false-positive cases; deterministic, privacy, and Station-shape tests pass.

### Technology and libraries

None expected. Reuse the existing dependency-light parsing and contract-validation approach.

---

## EXP-005 — Export JSON through a native save workflow

**Phase:** MVP
**Type:** User Story + Technical Story
**Dependencies:** EXP-002, EXP-003, EXP-004.

### Story and intended outcome

As a player, I want to choose where unique blueprint JSON is saved so I can import it into Station knowingly. The job must remain responsive, cancellable, recoverable, and explicit about results.

### In scope

- Validate selections, run one job at a time, and report validating/scanning/parsing/deduplicating/save-pending/writing/completed/cancelled/no-match/partial/error phases.
- Report measurable progress, or explicitly mark it indeterminate, plus files, records, duplicates, and warnings.
- Open a native Save dialog with JSON filter, sensible filename, and overwrite confirmation.
- Allow cancellation before final commit and define final-write behavior.
- Write UTF-8 JSON in the approved array shape with stable ordering, preferably via temporary file then atomic rename.
- Retry recoverable source/dialog/write failures and reveal the containing folder after success.
- Keep raw evidence out of the payload.

### Non-goals, assumptions, and risks

No Station upload, CSV, continuous export, or silent overwrite. Some work cannot provide a percentage; cancellation during final commit may not be reversible.

### Acceptance criteria

- Unsupported selections cannot run; save dialog precedes commit.
- Successful JSON validates and contains no duplicate identity.
- Empty, cancelled, partial, permission, missing-source, and write-failure outcomes are distinct.
- Existing files require confirmation and the UI remains responsive.

### Verification

Happy path: export after accepted fixtures are available, choose a destination, validate JSON, and repeat for deterministic content. Unhappy path: cancel at each phase, decline overwrite, use a bad destination, remove source, produce zero matches, inject malformed input, and interrupt final write; no corrupt completion is claimed.

### Definition of Done

Job/state contract, unit/integration tests, cancellation/atomic-output tests, accessibility/responsiveness checks, and Station-shape validation are complete.

### Technology and libraries

None expected. Use existing Electron native dialog, IPC, Node.js filesystem, and renderer state mechanisms.

---

## EXP-006 — Harden privacy, diagnostics, and Station handoff

**Phase:** MVP
**Type:** Technical Story
**Dependencies:** EXP-001 through EXP-005; authoritative Station validation when available.

### Technical story and intended outcome

As a privacy-conscious player, I need Exporter to minimize local log data so only approved blueprint records leave the parser boundary. As the Station integration owner, I need compatibility and limitations documented before relying on the file.

### In scope

- Keep raw logs local; never upload through Exporter.
- Redact/omit handles, account IDs, IPs, ports, session/entity IDs, full paths, tokens, and unrelated raw context from UI, diagnostics, and JSON.
- Use source IDs/bounded summaries over IPC; reject arbitrary renderer file reads/writes.
- Define cleanup for temporary/failed files and privacy-safe structured errors.
- Validate required keys, types, null/empty semantics, array shape, stable ordering, and duplicate identity against samples and, when available, Station's validator/import flow.
- Document whether Station compatibility is verified or pending, plus the owner's future evidence-collection action.

### Non-goals, assumptions, and risks

No Station API, authentication, automatic upload, or collection of other players' data. A schema-valid export can remain semantically incomplete when logs lack blueprint evidence.

### Acceptance criteria

- JSON contains only approved blueprint fields.
- Default UI/diagnostics do not reveal full paths or unrelated sensitive values.
- Invalid IPC is rejected; temporary files are cleaned according to documented rules.
- Local validation rejects malformed, wrong-type, and duplicate output before handoff.
- Handoff requests sanitized acquisition, persistence, replay/duplicate, and build/environment examples.

### Verification

Happy path: inspect output and diagnostics from sensitive-looking fixtures. Unhappy path: include handles, paths, IPs, tokens, malformed input, invalid IPC, and interrupted exports; confirm redaction, cleanup, and safe errors.

### Definition of Done

Threat/privacy review, IPC/output/logging/cleanup tests, local output validation, compatibility documentation, and owner handoff are complete. No real credentials or raw private logs are committed.

### Technology and libraries

None expected. Reuse the existing hardened Electron boundary, diagnostic logger, and privacy minimization utilities.

---

## Recommended implementation order

1. EXP-001 — owner supplies/approves blueprint evidence.
2. EXP-002 — Exporter shell and focused build target.
3. EXP-003 — validated source-set discovery and scan.
4. EXP-004 — recognition, normalization, and deduplication.
5. EXP-005 — save/export job UX and writing.
6. EXP-006 — privacy, diagnostics, and Station handoff.

The current corpus should remain a negative regression corpus: it must continue to produce no blueprint records unless a future evidence review proves a specific line family is a blueprint signal.
