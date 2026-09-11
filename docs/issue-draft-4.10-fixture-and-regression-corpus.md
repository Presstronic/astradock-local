# Issue draft: establish a 4.10 LIVE regression corpus and compatibility gate

## Target phase

MVP — enables and gates the recovery tickets.

## Context and problem statement

The current 4.9 profile was built from fixture-promoted patterns, while the captured 4.10 log exposes changed branch, build, record, notification, and party vocabulary. Without sanitized annotated fixtures, profile approval will be anecdotal and future patches can silently regress the recovered monitor.

## Technical story

As a maintainer, I want a privacy-safe 4.10 LIVE regression corpus and compatibility gate, so that parser changes are evidence-backed, reviewable, and repeatable across supported builds.

## Intended outcome

A small corpus proves the exact supported build and event families, records known limitations, and blocks accidental fallback or silent data loss on future builds.

## In scope

- Capture sanitized excerpts for startup, in-game, party invite/join/leave/create, server join/disconnect, vehicle, quantum, zone, mission, and shutdown.
- Record exact source build, branch, channel, universe, timestamp relationship, and expected events.
- Add positive, negative, malformed, partial-line, duplicate, and cross-environment fixtures.
- Add parser-health assertions for supported, unverified, unsupported, and suspected-drift states.
- Document privacy redaction and fixture provenance.

## Explicit non-goals

- Committing the full user log, credentials, real endpoints, account IDs, or game assets.
- Claiming coverage for events not represented by evidence.
- Automating acceptance of future builds without review.

## Dependencies and blockers

- Annotated LIVE 4.10 capture from the owner.
- The profile, normalization, party, and gameplay tickets.

## Assumptions, constraints, and risks

- Sanitization must preserve syntax and field shape while replacing sensitive values consistently.
- Fixtures must remain small enough for unit tests and large enough to preserve multiline/context behavior.
- Real logs may be copyrighted or contain personal data; repository review must enforce minimization.

## User acceptance criteria

- A developer can run the fixture suite and see which 4.10 event families are approved, unsupported, or drifting.
- The captured party sequence proves the expected name/lifecycle behavior without storing the real account or endpoint identifiers.
- A future vocabulary change fails a targeted compatibility assertion instead of silently reducing the monitor to three fallback rows.

## Definition of Done

- Fixture manifests identify source, redactions, expected evidence, and approved event families.
- Tests cover all required happy and unhappy paths.
- README or runtime fixture documentation explains how to add sanitized captures.
- Security/privacy review confirms no sensitive data or copyrighted assets are committed.
- CI runs the corpus and compatibility checks.

## Verification guidance

Happy path:

1. Replay each annotated 4.10 fixture.
2. Compare emitted events, projections, health, and unknown counts to the manifest.

Unhappy path:

1. Change a required field name, remove a continuation line, alter branch/channel, or inject a duplicate.
2. Verify the expected family-level diagnostic, no cross-environment correlation, and no fabricated event.

## Technical elaboration

Use deterministic placeholders for handles, IDs, endpoints, paths, and timestamps where possible. Keep raw excerpts separate from expected canonical output and include line/record boundaries. Fixture manifests should declare redacted fields and event-family expectations so tests fail clearly when parser behavior changes.

## Technology and libraries

None expected. Use the existing fixture manifest format, Node.js test runner, and CI workflow.
