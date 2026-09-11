# Blueprint Exporter Evidence Matrix

## Status and Purpose

| Field | Value |
| --- | --- |
| Status | Issue #132 evidence spike — **not approved; owner capture required** |
| Decision issue | [#132](https://github.com/Presstronic/astradock-local/issues/132) |
| Applies to | Any `Game.log`-based Blueprint Data recognition profile and Station-shaped export |
| Current fixture corpus | `test/fixtures/runtime-log/live/4.9-pub/sc-4.9-live/exporter/blueprint-acquisition.unavailable` |
| Fixture standard | [`runtime-log-fixture-corpus.md`](runtime-log-fixture-corpus.md) |

This is a decision record, not evidence that a blueprint was acquired. The reviewed clean-install LIVE corpus has no `Received Blueprint`, `SHUDEvent_OnNotification` blueprint, schematic, recipe, crafting, manufacturing, unlock, or learned-record match. It therefore cannot justify promoting a log pattern into an ownership claim or Station export record.

The community-reported `SHUDEvent_OnNotification` / `Added notification "Received Blueprint: <name>: " [<id>] to queue` shape is a capture lead only. It is neither an official CIG contract nor owner-reviewed evidence. A synthetically constructed line and a localized label hypothesis are useful parser tests, but do not approve a build, language, or semantic interpretation.

Until this decision record is approved, Blueprint Data must be represented as evidence-pending/unsupported in release decisions. A no-match result is the only truthful conclusion for the present reviewed corpus. No future parser profile may treat generic inventory initialization, `AttachmentReceived`, reward-room asset paths, an arbitrary notification, or a repeated notification lifecycle line as blueprint ownership.

## Current Evidence and Promotion Decision

| Candidate | Current result | Decision | Reason |
| --- | --- | --- | --- |
| Initial `Added notification` with an English received-blueprint label | No owner capture | Defer | The candidate shape is community evidence only; no reviewed source establishes the label, delimiter, build compatibility, or ownership meaning. |
| Queue/update/fade/replay follow-up for the same notification | No owner capture | Defer | No source proves identity, ordering, or whether the follow-up is a duplicate versus a separate acquisition. |
| Localized label/value | No owner capture or installed-localization evidence | Defer | English must not be treated as universal and guessed translations must not widen matching. |
| `name` | Unavailable | Defer | It may be a player-facing label, localized text, item identifier, or another display string; source semantics remain unproven. |
| `type` | Unavailable | Defer | It is not directly observable in the reported notification. Name-based categorization would be an unapproved inference. |
| `shared` | Unavailable | Defer | The candidate notification does not prove whether an acquisition is personal, party-shared, account-wide, or otherwise shareable. |
| Inventory/attachment/reward-room records | Reviewed negative evidence | Reject | Presence of an item or asset is not proof of a blueprint acquisition or ownership. |

No `BlueprintObserved` canonical event is created by this decision. The Station payload is an export contract rather than a runtime event, and it must remain unavailable until the evidence and its field semantics are approved.

## Required Owner Capture Package

Capture each case from a supported LIVE build with a short action ledger. Keep original logs private; commit only minimized sanitized excerpts that satisfy the fixture standard.

| Case | Required action and evidence | Why it matters |
| --- | --- | --- |
| Acquisition | Acquire, earn, grant, learn, or persist one known blueprint; capture before, during, and after the action. | Establishes whether there is a semantic anchor and what it means. |
| Duplicate/replay | Repeat the same scenario across a later session, backup replay, or notification lifecycle sequence. | Separates one logical acquisition from echoed physical lines. |
| Distinct acquisition | Acquire a second known blueprint. | Proves where one name ends and another begins, including punctuation/quotes. |
| Non-blueprint notification | Capture nearby normal HUD notifications. | Defines a narrow false-positive boundary. |
| Inventory/attachment guard | Capture inventory initialization, `AttachmentReceived`, and reward/asset activity near the scenario where available. | Prevents ordinary items from being exported as blueprints. |
| Localization | Record game language and the installed value for `crafting_hud_notification_received_blueprint`, or explicitly record that it is unavailable. | Prevents an English-only assumption and distinguishes label text from item data. |
| Share semantics | Capture a known shared/non-shared case if the game supports one; otherwise record the value as unavailable. | Determines whether `shared` can ever be exported rather than guessed. |

For every captured scenario, the ledger must state: release channel, exact game build, locale, action start/end time, expected blueprint display name, whether it was new or previously owned, intended `shared` semantics, current-versus-backup source, and whether the action was observed by the local player. Do not include a real handle, account/character/entity/session identifier, endpoint, path, token, screenshot, full log, or game asset.

Sanitize the smallest complete record sequence. Preserve timestamps, tags, quotes, delimiters, notification identifiers, queue/update verbs, and repeated correlation values using `SYNTH_` placeholders where they are sensitive. A capture that loses the initial/follow-up relationship is insufficient for approval.

## Approval Checklist and Field Contract

The owner must explicitly approve all applicable rows below in #132 (or a linked decision record) before an implementation ticket enables a recognition profile.

| Decision | Required proof | Approved value when proven | Safe value otherwise |
| --- | --- | --- | --- |
| Compatible source shape | A minimal observed fixture tied to channel, build, profile, and locale. | Exact profile-scoped anchor and parser version. | `unsupported` |
| Initial versus follow-up | At least one ordered sequence with initial and repeated lifecycle records. | One logical observation plus deterministic duplicate key/window. | Do not export. |
| `name` | Source field matched against the action ledger. | Direct observed name, with original display text preserved. | Omit record. |
| `type` | A direct source field or separately approved, versioned lookup contract. | Direct or explicitly derived with provenance. | Empty string only if the Station contract explicitly permits it; otherwise do not export. |
| `shared` | Direct source evidence or an owner-approved semantic mapping. | `true`, `false`, or `null`, with provenance. | `null` only if the Station contract permits unavailable; otherwise do not export. |
| Localization | Installed localization value plus at least one localized capture, or an explicit English-only product constraint approved by the owner. | Versioned label/value set scoped to build/locale. | `unsupported` |
| False positives | Negative fixtures for inventory, attachment, reward/asset, unrelated notification, malformed, and follow-up-only cases. | Parser rejects each guard. | Do not enable profile. |
| Station compatibility | Authoritative Station sample/validator or an explicitly versioned provisional contract. | Exact array shape, key order policy, null/empty semantics, and identity rule. | Local diagnostic only; no Station-compatible claim. |

Approval cannot be inferred from passing tests, a community implementation, a synthetic fixture, or an empty scan. Any incompatible build, locale, malformed candidate, truncated sequence, or ambiguous semantic must return an explicit unsupported/no-match result and retain only bounded local diagnostics permitted by the privacy boundary.

## Verification Guidance

Happy path after an owner capture is available:

1. Sanitize and add minimal observed fixtures plus a manifest for each confirmed action/build/locale.
2. Replay one initial notification and its follow-ups across current and backup logs; verify exactly one observation, stable identity, and provenance.
3. Verify `name`, `type`, and `shared` against the owner action ledger and the authoritative Station contract.
4. Run `npm test`, including fixture privacy scanning and the reviewed-corpus no-match guard; update the guard only as part of the same reviewed evidence decision.

Unhappy path:

1. Replay the current clean corpus and confirm it yields no approved observation.
2. Replay generic inventory, attachment, asset-path, unrelated notification, localized-but-unapproved, malformed, and follow-up-only records; confirm none produces an export record.
3. Remove required build, locale, action, or field evidence; confirm the result stays unsupported rather than inferring a value.
4. Run the fixture privacy scanner against the new manifest and snippet; reject identifiers, paths, IP addresses, credentials, URLs, and full-log excerpts.

## Privacy and Technology

Blueprint evidence can expose play activity, timestamps, local installation paths, account and entity identifiers, notification IDs, and potentially social context. Raw logs remain local. Repository fixtures use only minimal sanitized snippets and stable `SYNTH_` placeholders. No Station upload, authentication, raw evidence export, asset mining, or localization extraction is authorized by this spike.

Technology and libraries: None. This decision uses the existing fixture corpus, privacy scanner, Node.js test runner, and documentation conventions.

## Exit Condition

Issue #132 is ready to close only when an owner-reviewed capture package resolves the approval checklist, accepted and rejected fixtures are committed, and the decision is recorded per compatible build/locale. At present it is deliberately blocked by missing owner-supplied runtime evidence; this document makes that handoff precise without fabricating it.
