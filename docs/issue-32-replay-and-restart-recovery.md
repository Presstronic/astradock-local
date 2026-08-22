# Issue 32: Deterministic replay, checkpoints, and restart recovery

## MVP implementation contract

`ReplayCoordinator` is the boundary between the encrypted canonical event store and current-state projection registries. It requires an explicit `environmentKey`, creates a fresh registry for that partition, restores only a compatible checkpoint, replays canonical events in the store's stable cursor order, and persists a versioned projection checkpoint after a successful recovery. Checkpoints are disposable optimizations; an invalid, corrupt, incompatible, or projection-version-mismatched checkpoint is ignored and rebuilt from canonical events.

Replay is paged and bounded. Progress reports phase, mode, processed count, total count, and cursor. An abort signal is checked before and after each page and during live handoff. Cancellation never commits a replacement checkpoint, leaving the last known-good checkpoint available for the next attempt. Projection registries remain responsible for event idempotency, ordering, environment partitioning, and field freshness.

## Live handoff and qualification

The caller captures a bounded live-ingestion buffer before recovery begins and supplies it to the coordinator. The coordinator applies replay first, then applies buffered events in canonical order. Duplicate events are safe because the registry owns immutable event-ID idempotency. A successful buffered handoff returns `recoveryState: live`; a replay without live evidence returns `last-confirmed`, never an invented live connection. Projection snapshots continue to expose `current`, `stale`, `unknown`, `disconnected`, and `unsupported` qualifications.

Source context is optional metadata and is minimized to source ID, build version, and channel. It is not a filesystem path, credential, raw log line, or network destination. The active source/environment selection remains a caller concern and must be revalidated before live monitoring starts.

## Failure behavior

| Condition | Behavior |
| --- | --- |
| Missing checkpoint | Full deterministic rebuild |
| Corrupt/incompatible checkpoint | Bounded fallback rebuild with visible `checkpointIssue` |
| Duplicate or late event | Projection registry policy applies; no double application |
| Cancellation/interruption | Abort without new checkpoint; retain prior checkpoint |
| Environment mismatch | Reject checkpoint/event from the active recovery partition |
| Projection version mismatch | Reject checkpoint and rebuild using current definitions |

## Design-agent display contract

Recovery states must be represented as text plus a shape cue: Recovering, Last confirmed, Live, Stale, Disconnected, Unsupported, or Error. A recovered value must retain its provenance and observed time. “Live” requires a successful handoff with new evidence; elapsed time alone cannot upgrade a last-confirmed value. Progress may be announced politely and must not flood assistive technology.

The Runtime Monitor filter selects introduced alongside this work use the authoritative AstraDock design contract: Hanken Grotesk for body/UI, JetBrains Mono for compact data and micro-labels, tokenized surfaces/borders, zero-radius controls, and the 22/31/38px density system. Select controls are compact stream chrome and use the mono micro-label scale rather than browser/body-sized typography.

## Technology and libraries

None. The coordinator uses the existing canonical event store, `ProjectionRegistry`, and built-in AbortSignal/cursor APIs.

## Verification guidance

Happy path: recover from no checkpoint, persist a checkpoint, restart with the same definitions, restore and catch up from the cursor, apply a captured live buffer, and compare the snapshot with clean full replay.

Unhappy path: corrupt or version-mismatch the checkpoint, cancel between pages, provide duplicate/late events, mix LIVE and PTU partitions, change the source context, and interrupt before checkpoint commit. Confirm deterministic fallback, no cross-environment state, no duplicate application, honest recovery qualification, and preserved last-good checkpoint.
