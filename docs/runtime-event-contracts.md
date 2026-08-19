# Runtime Event Contracts

## Status and Purpose

| Field | Value |
| --- | --- |
| Status | Initial MVP contract package |
| Decision issue | [#12](https://github.com/Presstronic/astradock-local/issues/12) |
| Contract version | `runtime-event/v1` |
| Runtime package | [`src/contracts/runtimeEvents.js`](../src/contracts/runtimeEvents.js) |
| Type declarations | [`src/contracts/runtimeEvents.d.ts`](../src/contracts/runtimeEvents.d.ts) |
| Contract tests | [`test/runtimeEvents.test.js`](../test/runtimeEvents.test.js) |

This document defines the canonical runtime-event envelope, typed payload registry, validation behavior, deterministic serialization, and versioning rules for AstraDock Local MVP telemetry. The package is framework-independent and has no Electron, renderer, parser-regex, or storage-engine dependency.

The current repository has not yet installed the strict TypeScript/Vitest production foundation selected by ADR-0001. Issue #12 therefore implements the contract as a dependency-free CommonJS module that the current proof-of-concept test runner can verify. When the foundation migration lands, this module should be migrated behind the selected TypeScript project boundary without changing `runtime-event/v1` semantics.

## Technology and Libraries

No new runtime or development dependency is introduced.

The contract package uses:

- Node.js built-in `crypto` for deterministic SHA-256 event IDs.
- Node.js built-in `node:test` coverage through the existing `npm test` command.
- Manual runtime validation so untrusted data can be checked at process, persistence, and future IPC boundaries before a schema library is selected and pinned by the application foundation work.
- TypeScript declaration output for the public CommonJS contract surface and named event payloads.

If a schema library is introduced later, the implementation issue must record the exact package, version, license, bundle/runtime cost, migration strategy, and compatibility behavior before replacing these validators.

## Envelope

Every `runtime-event/v1` event contains:

| Field | Meaning |
| --- | --- |
| `eventId` | Deterministic local event ID derived from event type, environment, source identity, parser/profile versions, source timestamp, correlation IDs, evidence reference, and payload. |
| `eventType` | Registry-owned canonical event type. |
| `contractVersion` | Exact event-envelope version. MVP uses `runtime-event/v1`. |
| `sourceTimestamp` | Timestamp from the source record or application observation, normalized as UTC ISO-8601 with milliseconds. |
| `ingestedAt` | UTC timestamp when AstraDock accepted the observation into the pipeline. |
| `environmentKey` | First-class environment/build/profile partition key. |
| `environment` | Full `EnvironmentContext`; its `environmentKey` must match the top-level value. |
| `gameChannel` | Observed release channel such as `LIVE` or `PTU`. |
| `gameBuild` | Observed game build/version string. |
| `sourceLocation` | Local source reference. This is sensitive and remains local by default. |
| `sourceProfileId` | Extraction profile identifier, for example `sc-4.9-live`. |
| `sourceProfileVersion` | Extraction profile version. |
| `parserVersion` | Parser/rule implementation version that produced the event. |
| `provenance` | One of `observed`, `extracted`, `inferred`, or `enriched`. MVP runtime-log events are `observed`. |
| `confidence` | One of `confirmed`, `high`, `medium`, `low`, or `unknown`. |
| `correlationIds` | Named lower-camel-case IDs for sessions, requests, notifications, parties, or other correlation domains. |
| `ordering` | Ingestion sequence and optional source sequence, source byte offset, source generation, and source chunk sequence. |
| `traits` | Registry-owned telemetry traits: temporal utility, persistence, Station sync policy, diagnostic utility, sensitivity, subject scope, lifecycle, and volume/cost. |
| `payload` | Event-type-specific payload validated by the registry. |
| `evidenceReference` | Bounded pointer to retained local evidence or fixture markers. Raw log text is forbidden in the event. |
| `extensions` | Optional object for explicitly reviewed forward-compatible metadata that does not participate in event identity. |

Inferred events additionally require `derivation.reason` and `derivation.contributingEventIds`.

`createRuntimeEventOrderKey(event)` and `compareRuntimeEventOrder(left, right)` define the shared total-order contract for persistence, replay, projections, and tests. The key orders by normalized source timestamp, ingestion sequence, source generation, source byte offset, and event ID. Source chunk sequence is retained as trace metadata, but it is deliberately not part of the stable order key because live tailer chunk boundaries may differ from replay chunk boundaries.

## Environment Context

`EnvironmentContext` preserves distinct values rather than flattening the game source into a display tag:

```text
environmentKey
releaseChannel
universe
environmentName
rawEnvironmentTag
branch
buildVersion
changelist
databaseVersion
sourceInstallationId
observedAt
confidence
evidenceReference
```

The environment key is included in event IDs and persistence records. LIVE and PTU events with identical player handles, shard labels, timestamps, or entity IDs must still produce distinct event IDs.

`deriveEnvironmentContext()` is the canonical helper for constructing `EnvironmentContext` values. `deriveEnvironmentKey()` derives the partition key from:

```text
releaseChannel :: universe :: buildVersion :: branch :: sourceInstallationId
```

The source installation identifier is a deterministic local hash derived from the source location when a stable installation ID is not already known. This keeps environment keys partitioned by installation without copying sensitive source paths into diagnostics or durable identifiers. Unknown or future release-channel vocabulary normalizes to `UNKNOWN` while preserving the raw value in `rawEnvironmentTag`; it must never be coerced to `LIVE`.

`validateRuntimeEvent()` rejects runtime events whose top-level `environmentKey` does not match the nested context or whose nested key is not derived from the canonical partition inputs. `createPartitionedIdentity()` is available for parser, projection, dedupe, and persistence code that needs deterministic IDs scoped to one environment partition.

The current proof-of-concept parser now returns `environment`, `environmentKey`, `environmentPartitions`, `environmentSwitches`, and redacted `environmentDiagnostics` on scan results. Legacy shard, action, and session DTOs also carry `environmentKey`, `environment`, `gameChannel`, and `gameBuild` so renderer-bound state cannot merge LIVE/PTU/EPTU/HOTFIX or UNKNOWN observations while the full persistence/replay implementation is still pending.

## MVP Registry Scope

The registry currently promotes only event families backed by the accepted fixture corpus and application lifecycle requirements:

- Source and monitor lifecycle: `RuntimeSourceDiscovered`, `RuntimeSourceSelected`, `RuntimeMonitorStarted`, `RuntimeMonitorStopped`, `RuntimeSourceUnavailable`.
- Build and environment: `ClientBuildObserved`, `ReleaseEnvironmentObserved`, `GameDataVersionObserved`.
- Identity and login: `LoginStarted`, `AccountAuthenticated`, `IdentityObserved`.
- PU, shard, and replication spine: `PuJoinRequested`, `PuReplicationConnectionEstablished`, `UniverseHierarchyRegistered`, `PuTerritorySetupCompleted`, `PuEntered`.
- Disconnect and frontend/quit: `PuDisconnected`, `ReturnedToFrontend`, `ApplicationExited`.
- Proven party events: `PartyCreated`, `PartyLaunchInitiated`, `PartyMemberConnected`, `PartyLeft`.
- Validated zone events: `JurisdictionEntered`, `MonitoredSpaceEntered`, `MonitoredSpaceExited`, `ArmisticeStateChanged`.
- Locally correlated quantum navigation: `QuantumTargetSelected`, `QuantumTargetChanged`, `QuantumTravelArrived`.

The 2026-08-19 annotated capture supports registered vehicle events `VehicleRetrieved`, `VehicleControlAcquired`, `VehicleControlReleased`, and `VehicleStored` behind a same-environment, same-session local-vehicle correlation. Retrieval, acquisition, and storage retain explicit inferred provenance where the source record is a correlated outcome rather than a direct transition; release is observed directly. Boarding, exiting, and ownership remain unsupported. Quantum target-selection/change and final-arrival events use the same narrow local vehicle anchor. See [`vehicle-lifecycle-evidence-matrix.md`](vehicle-lifecycle-evidence-matrix.md) and [`runtime-capture-findings-2026-08-19.md`](runtime-capture-findings-2026-08-19.md).

The registry intentionally does not promote mission, quantum start/cancel/failure, general destination, marker-only party membership, still-deferred party lifecycle, combat, trade, ship, population, chat, or analytics events. Those require separate evidence, fixtures, acceptance criteria, and a registry update.

## Validation Behavior

Use `validateRuntimeEvent(value)` at trust boundaries. It returns either:

- `{ ok: true, event }`
- `{ ok: false, errors }`

Validation errors contain stable `code`, `path`, and `message` fields only. They do not echo raw evidence values. `assertValidRuntimeEvent(value)` throws `RuntimeEventValidationError` with the same safe errors.

The validator rejects:

- Missing envelope or payload fields.
- Unknown envelope or payload fields outside the explicit `extensions` object.
- Unsupported `contractVersion`.
- Unknown `eventType`.
- Invalid or non-normalized timestamps.
- Environment-key mismatches between the envelope and `EnvironmentContext`.
- Unknown enum values.
- Invalid payload values such as out-of-range ports.
- Registry trait drift.
- Raw evidence copies such as `rawLine`, `rawLog`, `rawEvidence`, or `lineText`.
- Inferred events without derivation reason and contributing event IDs.

## Serialization and Persistence Shape

`serializeRuntimeEvent(event)` validates the event and emits deterministic JSON with sorted object keys. `deserializeRuntimeEvent(text)` parses and validates that representation.

`toPersistenceRecord(event)` returns the storage-boundary shape needed by ADR-0003 without depending on SQLite:

```text
eventId
eventType
contractVersion
environmentKey
sourceTimestamp
ingestedAt
sourceProfileId
sourceProfileVersion
parserVersion
provenance
confidence
sensitivity
stationSyncPolicy
serializedEvent
```

Persistence implementations may add indexed columns, migrations, and encryption, but must preserve the serialized event and contract version for replay.

Replay and projection queries should use the contract comparator rather than ad hoc `ORDER BY` logic. Storage implementations may map the comparator fields to indexed columns, but ties must still be broken by event ID to keep equal-timestamp and late-arrival cases deterministic.

## Versioning and Compatibility

`runtime-event/v1` is the compatibility unit for the envelope and current payload contracts.

Additive changes are compatible only when they do not alter the meaning of existing fields, event IDs, validation outcomes, or deterministic serialization for already-valid `v1` events. New event types may be added to the registry under `runtime-event/v1` when they have accepted evidence fixtures and tests. Optional forward-compatible metadata must use the explicit `extensions` object; unregistered top-level and payload fields are rejected so accidental schema drift is observable.

Breaking changes require a new contract version. Breaking changes include:

- Removing or renaming envelope or payload fields.
- Changing event ID identity inputs.
- Changing enum meaning.
- Changing required traits for an existing event type.
- Reinterpreting payload fields.
- Promoting unproven source vocabulary without fixtures.

Unknown versions and unknown event types fail validation. Future replay/import code may quarantine unsupported events, but it must not silently coerce them to a known version.

## Adding an Event Type

1. Add or update accepted evidence fixtures and negative guards under `test/fixtures/runtime-log/`.
2. Update the relevant evidence matrix or PRD section with promotion and non-goal decisions.
3. Add the event definition to `EVENT_TYPE_REGISTRY` with owner, summary, traits, fixture ID, payload schema, and example payload.
4. Add or update the matching `RuntimeEventPayloadMap` entry in `src/contracts/runtimeEvents.d.ts`.
5. Confirm `RUNTIME_EVENT_EXAMPLES` materializes a valid example.
6. Add or update contract tests for happy path, invalid payload, forward compatibility, serialization, environment isolation, and privacy handling.
7. Update this document if the event family changes registry scope, versioning rules, or technology assumptions.
8. Run `npm test`.

Do not encode extraction regexes, renderer DTOs, SQLite table details, or Station upload behavior in the contract definition.
