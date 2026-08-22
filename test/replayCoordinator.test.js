const test = require('node:test');
const assert = require('node:assert/strict');
const { ProjectionRegistry } = require('../src/stateProjection');
const {
  ReplayCancelledError,
  ReplayCoordinator,
  REPLAY_CHECKPOINT_VERSION
} = require('../src/persistence/replayCoordinator');

function event(id, at, environmentKey = 'live') {
  return { eventId: id, eventType: 'HealthObserved', environmentKey, sourceTimestamp: at, ordering: { ingestionSequence: Number(id.slice(1)) }, payload: { status: id } };
}

function registryFactory() {
  const registry = new ProjectionRegistry({ now: () => Date.parse('2026-08-21T12:00:00.000Z') });
  registry.register({
    id: 'health', version: 1, eventTypes: ['HealthObserved'],
    initialState: () => ({ state: 'unknown', fields: { status: { state: 'unknown', value: null } } }),
    reduce: (state, current) => ({ state: 'known', fields: { status: { state: 'known', value: current.payload.status, observedAt: current.sourceTimestamp } } })
  });
  return registry;
}

function createStore(events) {
  let checkpoint = null;
  return {
    getCheckpoint: () => checkpoint,
    putCheckpoint: (value) => { checkpoint = value; },
    query: ({ cursor, limit }) => {
      const start = cursor ? JSON.parse(Buffer.from(cursor, 'base64url').toString()).eventId === '' ? 0 : events.findIndex((item) => item.eventId === JSON.parse(Buffer.from(cursor, 'base64url').toString()).eventId) + 1 : 0;
      const items = events.slice(start, start + limit);
      const last = items.at(-1);
      return { items, totalCount: events.length, nextCursor: start + items.length < events.length && last ? require('../src/persistence/canonicalEventStore').encodeCursor(require('../src/contracts/runtimeEvents').createRuntimeEventOrderKey(last), last.eventId) : null };
    }
  };
}

test('replays deterministically, checkpoints, restores, and hands off buffered live events', async () => {
  const events = [event('e1', '2026-08-21T12:00:01.000Z'), event('e2', '2026-08-21T12:00:02.000Z')];
  const store = createStore(events);
  const coordinator = new ReplayCoordinator({ store, createRegistry: registryFactory, pageSize: 1 });
  const first = await coordinator.recover('live');
  assert.equal(first.mode, 'full_rebuild');
  assert.equal(first.snapshot.snapshots[0].fields.status.value, 'e2');
  assert.equal(store.getCheckpoint('live', 'runtime-projections').version, REPLAY_CHECKPOINT_VERSION);

  events.push(event('e3', '2026-08-21T12:00:03.000Z'));
  const restored = await coordinator.recover('live', { liveEvents: [events[2]] });
  assert.equal(restored.mode, 'live');
  assert.equal(restored.applied, 1);
  assert.equal(restored.snapshot.snapshots[0].fields.status.value, 'e3');
});

test('falls back from an incompatible checkpoint without crossing environments', async () => {
  const events = [event('e1', '2026-08-21T12:00:01.000Z', 'live'), event('p1', '2026-08-21T12:00:02.000Z', 'ptu')];
  const store = createStore(events.filter((item) => item.environmentKey === 'live'));
  store.putCheckpoint({ environmentKey: 'live', name: 'runtime-projections', version: 99, orderCursor: 'bad', value: {} });
  const result = await new ReplayCoordinator({ store, createRegistry: registryFactory }).recover('live');
  assert.equal(result.mode, 'full_rebuild');
  assert.equal(result.checkpointIssue.code, 'checkpoint_incompatible');
  assert.equal(result.snapshot.snapshots[0].environmentKey, 'live');
});

test('cancellation stops before committing a new checkpoint', async () => {
  const store = createStore([event('e1', '2026-08-21T12:00:01.000Z')]);
  const controller = new AbortController();
  const coordinator = new ReplayCoordinator({ store, createRegistry: registryFactory });
  await assert.rejects(() => coordinator.recover('live', { signal: controller.signal, onProgress: () => controller.abort() }), (error) => error instanceof ReplayCancelledError);
  assert.equal(store.getCheckpoint('live', 'runtime-projections'), null);
});
