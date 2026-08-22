# Current-state projection framework

Issue #31 provides `src/stateProjection.js` as the shared reducer boundary for current-state read models. It is intentionally independent of Electron, the renderer, storage, and domain-specific parsers.

## Contract

Register a definition with a stable `id`, positive `version`, pure `initialState(context)`, and pure `reduce(state, event, context)`. A reducer returns a new domain state. Domain fields should use the common shape `{ state, value, observedAt, provenance, confidence, supportingEventIds }`; valid lifecycle states are `known`, `unknown`, `transitioning`, `stale`, `disconnected`, `unsupported`, and `error`.

```js
registry.register({
  id: 'monitor-health',
  version: 1,
  fieldExpiry: { status: 15_000 },
  initialState: () => ({ state: 'unknown', fields: { status: { state: 'unknown', value: null } } }),
  reduce: (state, event) => state
});
```

`ProjectionRegistry` partitions all state by `environmentKey`, orders replay by source timestamp and event ID, ignores duplicate IDs, and ignores late live events by default. The reducer never reads a file, network, or wall clock; the injected clock is supplied through its context. `snapshot`, `query`, and subscription payloads are immutable DTOs. Expiry is evaluated on read or with `advance(now)` and never requires a real-time sleep.

Checkpoints include the registry contract version, event watermark IDs/times, bounded idempotency IDs, and reducer state. Restore validates the checkpoint version and registered projection versions. A projection version change requires an explicit migration at the caller boundary; unknown projections are rejected rather than silently reset.

Unsupported event types are ignored by a definition's `eventTypes` filter. A reducer should represent missing evidence as `unknown`, not `false`; use `unsupported` for a capability that the source cannot provide and `error` for an explicit processing failure. Domain reducers remain responsible for deciding when a fact is disconnected or transitioning.

## Verification

`test/stateProjection.test.js` covers shared metadata, deterministic expiry, duplicate and late-event policy, environment isolation, replay ordering, subscriptions, checkpoints, restore, and reset. Use the existing canonical event store for durable event/checkpoint persistence; this module does not own SQLite or renderer IPC.
