# Issue draft: restore 4.10 party lifecycle and member identity telemetry

## Target phase

MVP — core user-visible recovery.

## Context and problem statement

Raw LIVE 4.10 evidence contains party lifecycle and identity information, but in forms not recognized by the current party extractor. Confirmed records include `Leave group`, `Accept invitation`, multiline `Party Invite Received: Accept Invitation?:` notifications containing `Majpisano`, `You have joined party:`, and `CPartyMarkerComponent` records with tracked entity IDs. The current monitor reports Party `Unsupported` and its canonical party projection is empty.

## User story

As a player, I want AstraDock to show party invites, joins, leaves, and visible members from 4.10 logs, so that my party state remains useful during live play.

## Intended outcome

The party projection represents observed lifecycle state and member evidence with clear provenance and confidence, while distinguishing a known handle from an anonymous entity marker.

## In scope

- Parse 4.10 party invite notification continuations and social events.
- Support accept, join, leave, create, and member-marker lifecycle evidence.
- Correlate handles and entity IDs only when the log provides a traceable relationship.
- Expose party state, member label, member ID, event time, freshness, and provenance to the existing monitor.
- Preserve privacy treatment for handles and identifiers; keep raw evidence local.

## Explicit non-goals

- Guessing a member name from an entity ID.
- Treating party marker streaming as proof of invite acceptance without corroborating lifecycle evidence.
- Adding network APIs, contact-service scraping, or Station upload of raw party records.

## Dependencies and blockers

- 4.10 profile and record-normalization tickets.
- Owner approval of the first-party privacy treatment for handles and party identifiers.

## Assumptions, constraints, and risks

- Notification content is multiline and may omit the party name or member name.
- Entity IDs are sensitive local identifiers and may be reused or change across sessions.
- Social service connection logs are not equivalent to a party membership event.

## User acceptance criteria

- The captured join sequence produces an invite-received event containing `Majpisano`, an invitation-accepted event, and a party-joined event.
- The leave/create sequence produces party-left and party-created events.
- Marker records show observed member entities without inventing handles.
- The Party instrument reports supported/observed state when evidence exists and distinguishes stale, empty, anonymous, and unsupported states.
- Event detail identifies source evidence and confidence and does not expose unrelated raw log content by default.

## Definition of Done

- Party event types, correlation rules, and provenance are documented.
- Sanitized fixtures cover invite, accept, join, leave, create, marker-only, duplicate, and ambiguous sequences.
- Tests cover multiline assembly, capitalization normalization, duplicate markers, session partitioning, privacy redaction, and replay.
- Existing party UI tests and accessibility checks are updated.
- `npm test` passes.

## Verification guidance

Happy path:

1. Replay invite → accept → join and verify the handle, lifecycle order, timestamps, and member marker.
2. Replay leave → create and verify the new party state.

Unhappy path:

1. Provide marker-only evidence and verify an anonymous member, not a guessed name.
2. Omit notification continuation lines and verify an incomplete notification diagnostic.
3. Repeat markers, replay the same chunk, or switch environments and verify deduplication and isolation.
4. Provide a stale or disconnected source and verify the party instrument does not claim current membership.

## Technical elaboration

Model party lifecycle as normalized events separate from social-service transport events. The record assembler must associate continuation lines with the preceding HUD notification while retaining line boundaries. A member identity may contain a handle, account/player ID, character/entity ID, or only an observed marker; projections must preserve which one was observed. Correlation must be scoped to the environment and session and must never borrow the newest unrelated member.

## UI information architecture and behavior

The Party instrument should display overall state, freshness, member count, member labels, observed IDs when useful, lifecycle event, exact timestamp in detail, provenance (`observed` versus inferred), and confidence. It must support empty, invite pending, joined, left, marker-only/anonymous, stale, disconnected, unsupported, loading, and error states. Controls remain keyboard reachable and status changes are announced without relying on color. The design agent should define composition and styling using the existing semantic tokens.

## Technology and libraries

None expected. Use the existing parser, canonical event contracts, party projection, and renderer test infrastructure.
