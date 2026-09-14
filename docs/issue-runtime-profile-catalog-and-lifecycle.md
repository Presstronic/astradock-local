# Technical Story: Star Citizen runtime-profile catalog and lifecycle

## Target phase

MVP — foundational compatibility contract for all known Star Citizen runtime-log releases.

## Context and problem statement

Star Citizen `game.log` vocabulary and semantics change between game versions, builds, channels, branches, and universes. AstraDock needs a profile catalog that covers every known Star Citizen version in scope, including the active `Game.log` and that version's backup `Game.log` files. It must not assume that similar version numbers have compatible log semantics. The existing compatibility policy defines profile selection, but the backlog does not yet define the complete known-version catalog as a versioned product artifact.

AstraDock may encounter a log from any known Star Citizen version, either as the active file or as a backup, as well as a newer/unreviewed release. A user-selected AstraDock environment identifies the source context, but does not establish one parser profile for the entire source set: each file must be identified and dispatched independently. Without an explicit lifecycle contract, a profile could be selected merely because its version number is nearby, a backup could be skipped, or a changed Star Citizen format could be interpreted as if it were an older format.

## Technical story

As the telemetry platform, I need an immutable runtime-profile catalog covering every known Star Citizen version and its active and backup log files, so that telemetry remains truthful and isolated by the actual log evidence.

## Intended outcome

Each runtime observation records the exact Star Citizen game-build identity, selected profile identifier and immutable revision, parser/schema versions, and compatibility result. Profile selection is deterministic and never crosses an unapproved minor version, channel, universe, or branch. A profile revision is never mutated after approval; changed Star Citizen semantics require a new revision.

## In-scope work

- Define the runtime-profile catalog format and immutable profile identity/revision rules.
- Define the Star Citizen version/build identity used for compatibility; AstraDock app version is not a compatibility dimension.
- Define profile selection precedence using major/minor family, release channel, universe, branch, exact build evidence, explicit exclusions, and drift state.
- Inventory every known Star Citizen version in scope and define its active-log and backup-log filename/build evidence.
- Define the minimum profile set required to parse every known version's active and backup logs.
- Define behavior for exact compatible builds, retained older builds, matching but unverified patches, unknown minor/channel/branch, unavailable historical revisions, and contradictory build evidence.
- Select the parser profile per file, using that file's detected Star Citizen version/build while retaining the user-selected environment as source context.
- Permit one source-set operation, such as blueprint export, to process files from multiple supported Star Citizen versions (for example, 4.9.x and 4.10.x) without applying the active file's profile to every backup.
- Ensure replay uses the profile revision stored with each event rather than a profile for another Star Citizen release.
- Define profile catalog diagnostics showing detected build, profile, revision, compatibility status, and reason.
- Link 4.10 fixture, profile-selection, and record-normalization work to this contract.

## Explicit non-goals

- Automatically downloading or trusting community-created profiles.
- Treating a parser profile as permission to upload raw logs or game assets.
- Claiming support for an untested patch because its numeric version is nearby.
- Rewriting historical canonical events after an app update.
- Defining Station synchronization or remote profile distribution.
- Automatically supporting an unknown future Star Citizen release before its log evidence is captured and reviewed.

## Dependencies and blockers

- [`runtime-profile-compatibility-policy.md`](runtime-profile-compatibility-policy.md).
- [`runtime-event-contracts.md`](runtime-event-contracts.md) and canonical event persistence.
- [`issue-32-replay-and-restart-recovery.md`](issue-32-replay-and-restart-recovery.md).
- Sanitized, annotated fixtures for each approved profile/build.
- Owner approval of the initial retained profile set and 4.10 LIVE evidence.

## Assumptions, constraints, and risks

- A profile revision is immutable once it has emitted persisted events.
- The game build is the primary compatibility identity; executable/file, service, and database versions remain separately named evidence with provenance.
- AstraDock app version is not part of Star Citizen profile identity. Each app release documents the Star Citizen profile families it bundles.
- Profile files must be validated before use and rejected on malformed schema, duplicate identifiers, incompatible contract versions, or ambiguous selection.
- Profile retention increases test and maintenance cost; deprecation must not break the supported local retention window.
- Missing or contradictory build evidence must remain uncertain rather than guessing from directory names or executable versions.

## User acceptance criteria

- Every known Star Citizen version in scope has an explicit profile entry and fixture coverage for its active `Game.log` and applicable backup `Game.log` files.
- A supported log exposes its exact game build, channel/environment, profile identifier, profile revision, and `compatible` status regardless of whether it is the active log or a backup.
- A source-set operation correctly processes supported files from multiple Star Citizen versions, with each file using its own detected build and matching profile.
- When a supported historical Star Citizen build is opened, replay uses that build's stored compatible profile revision and does not substitute a profile from another release.
- When a profile revision is unavailable during replay, the app reports `profile_unavailable`, preserves canonical event and diagnostic metadata, and does not reinterpret the event.
- Conflicting build evidence exposes the conflicting fields and provenance and suppresses only affected semantic promotion.
- A profile revision cannot be edited in place after persisted events reference it; a behavior change creates a new revision.
- Profile selection remains partitioned across LIVE, PTU, EPTU, HOTFIX, TECH-PREVIEW, universes, branches, and minor versions.

## Definition of Done

- Catalog schema, identity, revision, compatibility, and Star Citizen release-support rules are documented.
- Profile loading validates schema, uniqueness, compatibility metadata, extractor contracts, and event-contract compatibility before activation.
- Tests cover exact compatibility, retained historical replay, unavailable profiles, future-build behavior, explicit exclusions, contradictory evidence, and cross-channel isolation.
- Persisted event and checkpoint compatibility behavior is verified without rewriting historical events.
- Diagnostics and renderer-safe status expose build/profile state without raw paths, identifiers, or log lines.
- Privacy, security, performance, migration, and release-package implications are reviewed.
- README or release documentation explains that Star Citizen game-build support is profile-backed and varies by AstraDock release.
- `npm test`, parser benchmarks, replay tests, backup-log tests, and packaged-artifact validation pass.

## Verification guidance

Happy path:

1. Ingest active and backup-log fixtures for each known Star Citizen release using its respective profile revision `R1`, `R2`, and so on.
2. Process a source set containing 4.9.x and 4.10.x files and verify each file uses its own detected build and matching profile.
3. Replay retained events and verify each event uses the profile revision recorded when it was emitted.
4. Open a supported historical release and verify compatible monitoring without selecting a profile from another release.

Unhappy path:

1. Open a future minor version in an app release that does not bundle its profile and verify no nearest-profile fallback, no fabricated semantic events, and bounded diagnostic capture.
2. Remove the required historical profile revision and verify `profile_unavailable`, preserved event metadata, and no reinterpretation.
3. Present conflicting game, service, branch, and executable versions and verify a visible compatibility diagnostic with provenance.
4. Attempt to load a malformed, duplicate, tampered, or incompatible profile and verify activation is rejected safely.
5. Replay mixed LIVE/PTU records and verify profile selection and projections remain environment-partitioned.
6. Remove a Star Citizen profile from the catalog and verify affected records are explicitly unavailable rather than reinterpreted with another release's profile.

## Technical elaboration

Treat the catalog as application-bundled, read-only compatibility data for MVP. A catalog entry should identify its Star Citizen version/build identities, active and backup-log evidence, schema version, profile ID, immutable revision, compatible event-contract versions, family constraints, explicit exclusions, extractor families, and known limitations. The loader should produce a deterministic catalog snapshot at startup and record that snapshot identity in parser diagnostics. Backup files must use the same version-specific semantic profile as the active log only when their evidence proves that relationship; filename similarity alone is insufficient.

The persisted event envelope should retain the game-build facts and profile revision that produced it. Replay should resolve that historical revision from the catalog or enter a profile-unavailable state; it should not rerun semantic extraction against the current profile. Checkpoints should include the profile/catalog compatibility identity and be discarded and rebuilt when their projection or profile dependencies are unavailable.

For live ingestion, build detection must happen before semantic promotion whenever possible. Missing or contradictory identity may still produce bounded unknown evidence and explicitly patch-tolerant diagnostics, but must not silently inherit a profile. Breaking semantic changes should use new event/profile contract versions. The UI needs a named compatibility status region with exact build/profile values, freshness, and an actionable explanation for unsupported, unverified, drifted, or unavailable states; styling remains governed by the design-system documents.

## Technology and libraries

None expected. Use the existing profile loader, canonical event store, replay coordinator, Node.js test runner, TypeScript contracts, and packaging validation. Future signed profile distribution or migration libraries require a separate dependency and security decision.
