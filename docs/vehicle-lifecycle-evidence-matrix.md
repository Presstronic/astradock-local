# Vehicle lifecycle evidence matrix

## Status and purpose

| Field | Value |
| --- | --- |
| Status | Implemented evidence boundary; implementation issue [#89](https://github.com/Presstronic/astradock-local/issues/89) |
| Applies to | `sc-4.9-live@2026-08-19.5` profile family |
| Evidence ledger | [`runtime-capture-findings-2026-08-19.md`](runtime-capture-findings-2026-08-19.md) |

This matrix defines the minimum honest vehicle model for the Runtime Monitor. It deliberately separates the vehicle retrieved into a hangar, the vehicle the local player is aboard, the vehicle the local player controls, and vehicle ownership. Those facts can differ and must not collapse into a single `currentShip` field.

## Promotion decisions

| Action or state | Candidate event/projection | Decision | Evidence boundary |
| --- | --- | --- | --- |
| Vehicle retrieved into hangar | `VehicleRetrieved` / `hangarVehicle` | Promoted | ASOP spawning information and a named entity are correlated to the later direct local action |
| Local control acquired | `VehicleControlAcquired` / `controlledVehicle` | Promoted as inferred | No acquisition record exists; the first direct local quantum action on the retrieved entity establishes control with explicit inferred provenance |
| Local control released | `VehicleControlReleased` | Promoted as observed | Direct local-client control-token release names the same vehicle |
| Vehicle stored | `VehicleStored`; terminalize matching hangar/control state | Promoted as inferred | Same-session release plus the owner-annotated ASOP Store/elevator/entity-removal sequence |
| Local player boarded | `VehicleBoarded` / `aboardVehicle` | Defer | No direct boarding record was isolated |
| Local player exited | `VehicleExited` | Defer | No direct exit record was isolated |
| Vehicle requested at terminal | `VehicleRetrievalRequested` | Defer | Current sequence proves a result, not a distinct request event and outcome contract |
| Vehicle storage requested | `VehicleStorageRequested` | Defer | Current sequence proves Store outcome only through annotated correlation |
| Vehicle owned by local player | ownership projection | Separate evidence effort | Retrieval, use, or storage does not prove account ownership, rental, loan, party access, or entitlement |
| Refuel started/completed | service events | Defer | No attributable transaction/outcome sequence was isolated |

## Required identity and state model

Vehicle observations retain separate raw and display fields:

```text
vehicleEntityId
vehicleClassName
vehicleDisplayName
manufacturer
state                 // known, unknown, transitioning, stale, disconnected, unsupported
relationship          // hangar, aboard, controlled; never implicitly owned
sourceTimestamp
environmentKey
puSessionId
provenance
confidence
evidenceReference
```

`vehicleDisplayName` may use a versioned, local installed-data mapping when available. The raw class name remains diagnostic. Entity IDs are sensitive and hidden/redacted in the default UI and any shareable export.

The projection keeps at least these independent slots:

- `hangarVehicle`: the last vehicle directly proven retrieved/present or stored through a local terminal/hangar sequence;
- `aboardVehicle`: the vehicle containing the local player when direct evidence exists; and
- `controlledVehicle`: the vehicle for which the local client holds a proven control role.

Unknown is not empty. Starting monitoring mid-session, missing terminal evidence, or a profile gap yields `unknown`, not “no ship.” Disconnect or a PU-session replacement ends current-session assertions but may retain a clearly labeled last-confirmed value for history.

## UI information architecture

The Runtime Monitor must expose vehicle facts in both live telemetry and the shared event stream:

- The live instrument shows the strongest current relationship as an explicit label such as **Controlled vehicle**, **Aboard vehicle**, or **Hangar vehicle**, followed by display name and state.
- If more than one relationship is known, drilldown lists each independently instead of choosing a misleading single value.
- Terminal and Table modes include vehicle display name, relationship/action, source time, confidence, and lifecycle outcome. Table identifiers remain optional diagnostic columns.
- Drilldown shows raw class name, redacted entity ID, PU session, provenance, evidence age, parser/profile version, and contributing observations for inferred correlations.
- `unknown`, `transitioning`, `stale`, `disconnected`, `unsupported`, and conflicting-identity states use explicit text, not color alone.
- Ownership is omitted or labeled **Not determined**; the word **owned** must not appear from these events.
- Responsive layouts retain vehicle name and relationship before diagnostic identifiers. Screen readers receive a stable accessible name and material changes are announced politely without repeating freshness ticks.

## Correlation and false-positive guards

Promotion requires a bounded chain within one environment and PU session. A ship class mention, nearby entity, object-container load, quantum record for an unknown entity, party member vehicle, or ASOP catalog result cannot set the local vehicle alone. Correlation must use the same vehicle entity/class across a local terminal outcome, local control record, or another fixture-approved local-player anchor.

The accepted fixture is `vehicle/vehicle-retrieve-control-store.observed`. Storage requires a known local hangar vehicle, an explicit control release, and correlated entity removal within fifteen minutes. The negative fixture `vehicle/uncorrelated-vehicle-removal.non-event` proves that remote or unanchored release and removal traffic cannot change local state. The current evidence has no direct control-acquisition signature; `VehicleControlAcquired` is therefore high-confidence inferred evidence derived from the first fixture-approved direct local action and carries its contributing event reference.

Conflicting candidates produce `unknown` or a conflict diagnostic; recency alone does not select a vehicle. Entity identifiers never correlate across environment or PU-session boundaries.

## Verification guidance

Happy path:

1. Replay a sanitized retrieve → control → travel → release → store sequence and emit one semantic event per proven transition.
2. Verify the live instrument advances through the supported relationships and clears only the matching current state on storage/session end.
3. Verify Terminal/Table rows and drilldown expose the specified labels, provenance, confidence, and redacted diagnostics.

Unhappy path:

1. Replay unrelated ship names, streamed entities, another player's vehicle, duplicate ASOP/notification lifecycle records, partial records, and an incomplete store sequence; emit no local vehicle transition.
2. Start mid-session and report `unknown` until a supported local anchor appears.
3. Interleave identical entity IDs across LIVE/PTU or PU sessions and confirm no cross-partition correlation.
4. Verify malformed/conflicting evidence creates a bounded diagnostic without crashing or guessing.
5. Verify raw identifiers and source text do not enter renderer DTOs or shareable output.

## Technology and libraries

None expected. Implementation should use the existing normalized-event, projection, profile, fixture, and renderer boundaries. A future installed-data display-name resolver is a separate dependency decision.
