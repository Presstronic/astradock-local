const test = require('node:test');
const assert = require('node:assert/strict');
const { ProjectionRegistry } = require('../src/stateProjection');

const clock = { value: Date.parse('2026-08-21T12:00:00.000Z') };
const now = () => clock.value;
const definition = {
  id: 'health', version: 1, eventTypes: ['HealthObserved'], fieldExpiry: { status: 1000 },
  initialState: () => ({ state: 'unknown', fields: { status: { state: 'unknown', value: null } } }),
  reduce: (state, event) => ({ state: 'known', fields: { status: { state: 'known', value: event.payload.status, observedAt: event.sourceTimestamp, provenance: 'observed', confidence: 'high', supportingEventIds: [event.eventId] } } })
};
function event(id, status, at, environmentKey = 'live') { return { eventId: id, eventType: 'HealthObserved', environmentKey, sourceTimestamp: at, payload: { status } }; }

test('applies pure reducers with shared field metadata and deterministic expiry', () => {
  const registry = new ProjectionRegistry({ now });
  registry.register(definition);
  const result = registry.apply(event('b', 'healthy', '2026-08-21T12:00:00.000Z'));
  assert.equal(result.status, 'applied');
  assert.equal(registry.snapshot('health', 'live').fields.status.value, 'healthy');
  clock.value += 1000;
  assert.equal(registry.snapshot('health', 'live').fields.status.state, 'stale');
});

test('is idempotent, rejects late events by policy, and isolates environments', () => {
  const registry = new ProjectionRegistry({ now });
  registry.register(definition);
  registry.apply(event('b', 'new', '2026-08-21T12:00:02.000Z'));
  assert.equal(registry.apply(event('b', 'different', '2026-08-21T12:00:02.000Z')).status, 'duplicate');
  assert.equal(registry.apply(event('a', 'late', '2026-08-21T12:00:01.000Z')).status, 'late_ignored');
  registry.apply(event('c', 'ptu', '2026-08-21T12:00:03.000Z', 'ptu'));
  assert.equal(registry.query({ environmentKey: 'live' }).snapshots.length, 1);
  assert.equal(registry.query({ environmentKey: 'ptu' }).snapshots[0].fields.status.value, 'ptu');
});

test('replay, subscriptions, and checkpoint restore preserve state', () => {
  const first = new ProjectionRegistry({ now });
  first.register(definition);
  const received = [];
  first.subscribe((change) => received.push(change), { projectionId: 'health' });
  first.replay([event('z', 'last', '2026-08-21T12:00:02.000Z'), event('y', 'first', '2026-08-21T12:00:01.000Z')]);
  assert.equal(received.length, 2);
  const checkpoint = first.checkpoint();
  const second = new ProjectionRegistry({ now });
  second.register(definition);
  second.restore(checkpoint);
  assert.deepEqual(second.query(), first.query());
  second.reset('live');
  assert.equal(second.query().snapshots.length, 0);
});
