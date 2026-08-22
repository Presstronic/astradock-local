# Issue #37: Shared immutable event drilldown

The Runtime Monitor uses one detail contract for Terminal, Table, current-state instruments, Party, Mission, and alerts. A selection is identified by the canonical `eventId` plus its `environmentKey`; row position, viewport position, and presentation placement are never identity.

## Detail contract

The renderer requests `events.getEvidenceDetail({ environmentKey, eventId })` through the preload boundary. The main process validates both fields, reads the encrypted canonical event store, and verifies the environment before returning a renderer-safe DTO containing:

- event type/summary, source and ingestion timestamps, environment, game channel/build, session, provenance, confidence, parser/profile versions, and bounded structured payload;
- sanitized correlations and bounded evidence markers/context with an explicit availability state;
- retained/removed status and related events, including contributor relationships from event derivation.

Raw log content is not included in scan rows and is never accepted from the renderer. Sensitive values remain redacted by the existing event sensitivity policy. A missing or retention-deleted event is an anchored tombstone; the UI does not redirect to another event.

## Selection and live updates

`SharedEventStreamState.selectedEventId` is the sole stream selection identity. The selected row snapshot remains in the detail host when filtering, reordering, virtualization, view switching, or live ingestion changes the visible window. Newly ingested immutable IDs increment the detail's “events since selection” count. Closing or changing selection resets that count. Async detail responses are ignored when they no longer match the latest selection.

## Placement, focus, and states

Terminal defaults to the right push dock and Table to the bottom push dock. The per-view placement preference is persisted locally, resettable through the existing settings reset, and is never synchronized. Responsive fallback may temporarily change placement while preserving the stored value and announces the temporary placement. Escape and Close dismiss the dock and restore focus to the initiating control. The dock exposes loading, ready, not-found, retention-removed, redacted, unsupported, and error states with named status text.

## Verification

- Boundary tests reject missing or cross-shaped evidence requests and accept only bounded environment/event identity.
- Shared stream tests verify immutable selection across view changes and count only newly ingested IDs.
- Canonical store tests verify related events are limited to the selected environment and correlation set.
- `npm test` is the required repository verification command.

Technology and libraries: None. The feature uses the existing React renderer, preload contract, encrypted canonical store, and settings store.
