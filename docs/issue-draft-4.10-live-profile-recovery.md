# Issue draft: restore LIVE 4.10 profile selection and build identity

## Target phase

MVP — release-blocking compatibility recovery.

## Context and problem statement

The LIVE 4.10 log identifies itself with `Branch: sc-alpha-4.10.0-hotfix`, `Changelist: 12545750`, and service/database versions such as `sc-alpha-4.10.0-12519617`. The current automatic profile is limited to reviewed 4.9 LIVE families. It also promotes the executable/file version (`1.0.191.28374`) as the game build when the newer game-version evidence is absent. The application therefore shows `LIVE / UNKNOWN`, `unsupported profile`, and suppresses all canonical runtime events even though the log contains usable evidence.

## User story

As a LIVE player, I want AstraDock to identify my 4.10 build and select an evidence-backed profile, so that supported telemetry is displayed instead of being globally classified as unsupported.

## Intended outcome

A 4.10 LIVE session has a truthful channel, universe, branch, changelist/build identity, compatibility result, and selected profile. File version remains a separate diagnostic field and is never substituted for the game build without an explicit provenance label.

## In scope

- Define the 4.10 LIVE profile family and immutable profile revision metadata.
- Detect branch, changelist, service/database version, channel, and universe from the 4.10 vocabulary.
- Establish precedence and provenance for game build versus executable/file version.
- Select the profile by major/minor family, channel, universe, branch, and exact approved build evidence.
- Preserve bounded diagnostics for unverified or drifted builds.
- Update parser-health and source/environment projections consumed by the monitor.

## Explicit non-goals

- Treating every future 4.10 patch as fully supported without fixtures.
- Reusing the 4.9 profile across the minor-version boundary.
- Changing unrelated UI styling or adding Station synchronization.

## Dependencies and blockers

- Sanitized LIVE 4.10 captures with exact build/channel/branch metadata.
- The versioned runtime-profile catalog and lifecycle contract.
- The normalized record and event-family work in the companion parser ticket.
- Owner approval of the initial 4.10 exact-build allowlist.

The observed 4.10.x backups identify builds `12519617`, `12545750`, and `12572603`; these exact builds must be recognized by the profile. Blueprint extraction may legitimately return zero records for a recognized file when no blueprint notification occurred. Any separately verified 4.10.1 build such as `12625701` must be added independently.

## Assumptions, constraints, and risks

- The branch may contain `hotfix` while the installed source remains the LIVE directory; directory name and branch must not be conflated.
- Service/database versions may identify the game build but must retain their source field and confidence.
- Unknown or contradictory build evidence must remain visible as unverified/unsupported rather than silently falling back.

## User acceptance criteria

- For the captured LIVE 4.10 log, the header reports `LIVE`, `PU`, `sc-alpha-4.10.0-hotfix`, and the approved game build/changelist with provenance.
- The monitor selects the approved 4.10 LIVE profile and no longer reports global `unsupported profile`.
- An unapproved 4.10 patch reports `unverified_build` or `unsupported_profile` according to policy and does not use the 4.9 profile.
- File version `1.0.191.28374` is not presented as the game build unless explicitly labeled as executable version.

## Definition of Done

- Profile metadata and selection behavior are documented.
- Sanitized positive, negative, contradictory, and missing-evidence fixtures are added.
- Unit and integration tests cover profile selection, provenance, partitioning, and replay stability.
- Parser-health, privacy, performance, and accessibility implications are reviewed.
- `npm test`, parser benchmark, and relevant Windows validation pass.

## Verification guidance

Happy path:

1. Parse the captured LIVE 4.10 log.
2. Confirm channel, universe, branch, changelist, game build, selected profile, and compatibility status.
3. Confirm canonical events are eligible for family-level extraction.

Unhappy path:

1. Remove branch, database version, or changelist evidence and verify a truthful degraded state.
2. Substitute a PTU/HOTFIX channel or an unapproved patch and verify no LIVE 4.9 fallback.
3. Present conflicting file/game/service versions and verify provenance plus a diagnostic instead of guessing.

## Technical elaboration

The main-process parser should assemble build facts before semantic promotion, keep executable file version separate from game/service version, and pass a normalized environment context into profile selection. The selected profile and compatibility reason must be retained on emitted events and replayed deterministically. The renderer should display the compatibility state, exact build label, and a concise explanation while keeping full paths and sensitive raw evidence behind the existing detail affordance.

## Technology and libraries

None expected. Use the existing profile schema, parser engine, fixture harness, and test infrastructure.
