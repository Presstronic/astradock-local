# Issue 128: Separate destination travel and attribute party comms transitions

## Context and problem

The current-state rail combines Mission and Destination / travel into one panel even though they are separate telemetry domains. In addition, `Missions/Comms` Add/Remove records can contain a party member's handle but were being classified by the legacy fallback as `Server Disconnect (Unattributed)`. These records describe party communication range and do not prove a Star Citizen server disconnect.

## User story

As a Runtime Monitor user, I want Mission and Destination / travel presented as separate sections and party comms range transitions attributed to the affected member, so that current-state information is easier to scan and disconnect rows do not overstate what the raw evidence proves.

## In scope

- Render Mission as its own current-state section.
- Render Destination / travel as its own section immediately below Mission.
- Detect the observed `Missions/Comms` Add/Remove transition shape, retain the member handle, and label connected/disconnected comms-range actions accordingly.
- Keep those actions in the existing Table/Terminal stream and raw evidence drilldown.
- Document that comms-range transitions are not server connectivity transitions.

## Non-goals

- Promoting party comms range to a canonical party disconnect/reconnect event.
- Inferring a player's physical distance, server identity, or authoritative server connection state.
- Changing the PU `Channel Disconnected` parser or lifecycle projection.

## Acceptance criteria

1. Mission and Destination / travel appear as separate sections, with Destination / travel below Mission.
2. Destination transition evidence remains selectable and opens the existing evidence detail.
3. A matching `Missions/Comms` Remove line renders as `Party Comms Disconnected (HANDLE)` and includes the handle in the row data.
4. A matching Add line renders as `Party Comms Connected (HANDLE)`.
5. Matching comms-range lines do not create `Server Disconnect (Unattributed)` rows.
6. Existing authoritative server disconnect behavior remains unchanged.

## Definition of Done

- Renderer, legacy parser, tests, and documentation are updated.
- `npm test` and `git diff --check` pass.
- No raw logs, real identifiers, paths, endpoints, or credentials are committed.
- The change is reviewed for semantic accuracy, privacy, accessibility, and compatibility.

## Verification guidance

Happy path: render a scan containing Mission and Destination evidence and verify section order; replay sanitized Add/Remove Comms lines and verify attributed labels and actions.

Unhappy path: replay an ambiguous authoritative `Channel Disconnected` line and verify it retains existing unattributed server semantics; replay malformed or unrelated Add/Remove lines and verify no comms transition is created.

## Technology and libraries

None. The change uses the existing React renderer, CommonJS parser, IPC-safe DTOs, and test tooling.
