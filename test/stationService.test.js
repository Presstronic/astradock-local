const test = require('node:test');
const assert = require('node:assert/strict');
const { StationService } = require('../src/station/service');
const { StationError, validateCommand } = require('../src/station/contracts');

function fixture() {
  let saved = null;
  let clock = Date.parse('2026-10-30T12:00:00.000Z');
  const repository = { load: () => structuredClone(saved), save: state => { saved = structuredClone(state); }, close() {} };
  const account = { subject: 'synthetic-station-user', displayName: 'Synthetic player', roles: ['member'], permissions: ['test-own-inventory'], capabilities: { catalogRead: true, inventoryRead: true, inventoryWrite: true }, expiresAt: '2026-10-30T13:00:00.000Z', authorizationRevision: 'auth-1', gameBinding: 'synthetic-game-binding' };
  let revision = 'revision-1';
  let quantity = 5;
  let mutationCount = 0;
  const applied = new Set();
  const adapter = {
    available: true, status: null, idempotencyWindowMs: 86400000,
    authenticate: async () => ({ session: structuredClone(account), credentials: { access: 'SYNTHETIC_TEST_CREDENTIAL' } }),
    refreshAccess: async () => structuredClone(account),
    readInventory: async () => ({ revision, environmentKey: 'LIVE-synthetic', epoch: 'epoch-1', complete: true, nextCursor: null, items: [{ id: 'row-1', itemId: 'item-1', name: 'Synthetic bottle', quantity, unit: 'items', location: null }] }),
    applyOperation: async ({ operation }) => {
      if (applied.has(operation.id)) return { operationId: operation.id, status: 'duplicate', revision };
      if (operation.expectedRevision !== revision) return { operationId: operation.id, status: 'conflict', revision };
      quantity -= operation.quantity; mutationCount++; applied.add(operation.id); revision = 'revision-'+(mutationCount+1);
      return { operationId: operation.id, status: 'applied', revision };
    },
    resolveItems: async ({ ids }) => ids.map(gameId => ({ gameId, itemId: 'item-1', name: 'Synthetic bottle', status: 'exact', revision: 'catalog-1', expiresAt: '2026-10-30T13:00:00.000Z' }))
  };
  const options = { repository, adapter, now: () => new Date(clock), random: () => 0.5 };
  const service = new StationService(options);
  const change = { eventId: 'synthetic-qualified-drop', ruleVersion: 'synthetic-rule-v1', kind: 'drop', itemId: 'item-1', quantity: 2, unit: 'items', environmentKey: 'LIVE-synthetic', epoch: 'epoch-1', sourceTimestamp: '2026-10-30T11:59:00.000Z', ingestedAt: '2026-10-30T12:00:00.000Z', gameBuild: 'synthetic-build', provenance: 'observed', confidence: 'confirmed' };
  return { service, adapter, account, repository, options, change, advance: ms => { clock += ms; }, mutations: () => mutationCount, saved: () => saved };
}
async function connect(f) {
  f.service.configure({ label: 'Synthetic Station', apiBaseUrl: 'https://station.example.org', clientId: 'synthetic-public-client' });
  await f.service.signIn();
  assert.equal(f.service.snapshot().consent.inventoryWrite, false);
  f.service.setConsent({ catalogRead: true, inventoryRead: true, inventoryWrite: true, paused: false });
  await f.service.refreshInventory();
}
function approve(f) {
  const id = f.service.offerQualifiedChange(f.change);
  const review = f.service.review(id).review;
  const first = f.service.confirm(id, review.challenge);
  return f.service.confirm(id, first.review.challenge);
}

test('Station writes require review and two distinct nonreplayable confirmations; drop decrements once', async () => {
  const f = fixture(); await connect(f);
  const id = f.service.offerQualifiedChange(f.change);
  assert.throws(() => f.service.confirm(id, 'forged'), /Review the change again/);
  const review = f.service.review(id).review;
  assert.equal(review.before, 5); assert.equal(review.after, 3);
  assert.equal(f.service.snapshot().operations.length, 0);
  const first = f.service.confirm(id, review.challenge).review;
  assert.equal(first.stage, 2); assert.notEqual(first.challenge, review.challenge);
  assert.equal(f.service.snapshot().operations.length, 0);
  const queued = f.service.confirm(id, first.challenge);
  assert.equal(queued.operations[0].status, 'queued');
  assert.throws(() => f.service.confirm(id, first.challenge));
  await f.service.dispatch(); await f.service.dispatch();
  assert.equal(f.mutations(), 1); assert.equal(f.service.snapshot().inventory.items[0].quantity, 3);
  assert.equal(f.service.offerQualifiedChange(f.change), id);
  assert.equal(f.service.offerQualifiedChange(Object.fromEntries(Object.entries(f.change).reverse())), id);
  assert.equal(f.service.snapshot().proposals.length, 1);
  assert.doesNotMatch(JSON.stringify(f.service.snapshot()), /SYNTHETIC_TEST_CREDENTIAL|synthetic-station-user|synthetic-game-binding/);
});

test('cancellation, expiry, refresh and authorization changes invalidate confirmation state', async () => {
  const f = fixture(); await connect(f);
  const id = f.service.offerQualifiedChange(f.change);
  let review = f.service.review(id).review;
  f.service.cancel(id);
  assert.throws(() => f.service.confirm(id, review.challenge));
  review = f.service.review(id).review;
  f.advance(300001);
  assert.throws(() => f.service.confirm(id, review.challenge));
  review = f.service.review(id).review;
  await f.service.refreshInventory();
  assert.throws(() => f.service.confirm(id, review.challenge));
  review = f.service.review(id).review;
  f.service.setConsent({ inventoryWrite: false });
  assert.throws(() => f.service.confirm(id, review.challenge), /consent/);
  assert.equal(f.service.snapshot().operations.length, 0); assert.equal(f.mutations(), 0);
});

test('an incomplete or changed snapshot preserves complete data and its exact freshness', async () => {
  const f = fixture(); await connect(f);
  const baseline = f.service.snapshot().inventory;
  f.advance(60000);
  f.adapter.readInventory = async ({ cursor }) => cursor ? { revision: 'changed', environmentKey: 'LIVE-synthetic', epoch: 'epoch-1', complete: true, nextCursor: null, items: [] }
    : { revision: 'first-page', environmentKey: 'LIVE-synthetic', epoch: 'epoch-1', complete: false, nextCursor: 'page2', items: [] };
  await assert.rejects(f.service.refreshInventory(), /changed during pagination/);
  assert.deepEqual(f.service.snapshot().inventory, baseline);
  f.adapter.readInventory = async () => ({ revision: 'empty', environmentKey: 'LIVE-synthetic', epoch: 'epoch-1', complete: true, nextCursor: null, items: [] });
  await f.service.refreshInventory();
  assert.deepEqual(f.service.snapshot().inventory.items, []);
  assert.notEqual(f.service.snapshot().inventory.lastUpdatedAt, baseline.lastUpdatedAt);
});

test('offline inventory remains readable after credential expiry, while remote work and other accounts cannot use it', async () => {
  const f = fixture(); await connect(f);
  const before = f.service.snapshot().inventory;
  f.advance(3600001);
  f.adapter.refreshAccess = async () => { throw new StationError('station_offline', 'Station is offline.'); };
  await assert.rejects(f.service.refreshInventory());
  assert.deepEqual(f.service.snapshot().inventory, before);
  assert.throws(() => f.service.review(f.service.offerQualifiedChange(f.change)), /Sign in|Refresh/);
  const restarted = new StationService(f.options);
  assert.deepEqual(restarted.snapshot().inventory, before);
  restarted.signOut();
  assert.equal(restarted.snapshot().inventory, null);
  f.account.subject = 'synthetic-other-user';
  f.account.expiresAt = '2026-10-30T15:00:00.000Z';
  await restarted.signIn();
  assert.equal(restarted.snapshot().inventory, null);
  assert.equal(restarted.snapshot().consent.inventoryWrite, false);
});

test('loss of response after commit retries the identical operation under idempotency and never subtracts twice', async () => {
  const f = fixture(); await connect(f); approve(f);
  const apply = f.adapter.applyOperation;
  let loseResponse = true;
  const sentIds = [];
  f.adapter.applyOperation = async context => { sentIds.push(context.operation.id); const result = await apply(context); if (loseResponse) { loseResponse = false; throw new StationError('station_offline', 'Response lost.'); } return result; };
  await f.service.dispatch();
  assert.equal(f.mutations(), 1); assert.equal(f.service.snapshot().operations[0].status, 'retry');
  f.advance(60000);
  const restarted = new StationService(f.options);
  await restarted.dispatch();
  assert.equal(f.mutations(), 1); assert.equal(new Set(sentIds).size, 1);
  assert.equal(restarted.snapshot().operations[0].status, 'applied');
  assert.equal(restarted.snapshot().inventory.items[0].quantity, 3);
});

test('revocation, pause and unsupported retry guarantees prevent further dispatch', async () => {
  const f = fixture(); await connect(f); approve(f);
  f.service.setConsent({ paused: true }); await f.service.dispatch(); assert.equal(f.mutations(), 0);
  f.service.setConsent({ paused: false });
  f.adapter.idempotencyWindowMs = 0;
  f.adapter.applyOperation = async () => { throw new StationError('station_offline', 'Offline.'); };
  await f.service.dispatch();
  assert.equal(f.service.snapshot().operations[0].status, 'unknown');
  await f.service.dispatch(); assert.equal(f.service.snapshot().operations[0].attempts, 1);
  f.adapter.refreshAccess = async () => ({ ...f.account, capabilities: { catalogRead: false, inventoryRead: false, inventoryWrite: false } });
  await f.service.refreshAccess();
  assert.equal(f.service.snapshot().inventory, null);
  await assert.rejects(f.service.dispatch(), /does not permit/);
});

test('permission change or sign-out during a request cannot restore another scope or falsely acknowledge a write', async () => {
  const f = fixture(); await connect(f);
  let resolvePage;
  f.adapter.readInventory = () => new Promise(resolve => { resolvePage = resolve; });
  const request = f.service.refreshInventory();
  await new Promise(resolve => setImmediate(resolve));
  f.service.signOut();
  resolvePage({ revision: 'late', environmentKey: 'LIVE-synthetic', epoch: 'epoch-1', complete: true, nextCursor: null, items: [] });
  await assert.rejects(request, /changed|cancelled/);
  assert.equal(f.service.snapshot().inventory, null);
});

test('reset retains minimal deduplication digests and refuses unresolved remote operations', async () => {
  const f = fixture(); await connect(f); approve(f);
  assert.throws(() => f.service.reset(), /Reconcile pending/);
  await f.service.dispatch();
  f.service.reset();
  assert.equal(f.service.snapshot().profile, null);
  await connect(f);
  f.service.offerQualifiedChange(f.change);
  assert.equal(f.service.snapshot().proposals.length, 0);
  assert.equal(f.mutations(), 1);
});

test('catalog validation refuses guessed/ambiguous IDs and arbitrary IPC authority', async () => {
  const f = fixture(); await connect(f);
  const mapped = await f.service.resolveItems(['exact-class']); assert.equal(mapped[0].status, 'exact');
  f.adapter.resolveItems = async () => [{ gameId: 'not-requested', status: 'exact' }];
  await assert.rejects(f.service.resolveItems(['exact-class']));
  assert.throws(() => validateCommand('offerQualifiedChange', f.change));
  assert.throws(() => validateCommand('consent', { permissions: ['admin'] }));
  for (const address of ['http://station.example.org', 'https://user:secret@station.example.org', 'https://127.0.0.1', 'https://localhost', 'https://station.example.org/?token=secret']) assert.throws(() => f.service.configure({ label: 'Bad', apiBaseUrl: address, clientId: '' }));
});

test('new acquisitions require a unique exact catalog mapping and incompatible units remain blocked', async () => {
  const f = fixture(); await connect(f);
  const acquisition = { ...f.change, eventId: 'synthetic-acquisition', kind: 'acquire', itemId: 'new-item', quantity: 1 };
  const id = f.service.offerQualifiedChange(acquisition);
  assert.throws(() => f.service.review(id), /unambiguous/);
  f.adapter.resolveItems = async ({ ids }) => [{ gameId: ids[0], itemId: 'new-item', name: 'Synthetic new item', status: 'exact', revision: 'catalog-1', expiresAt: '2026-10-30T13:00:00.000Z' }];
  await f.service.resolveItems(['synthetic-class']);
  const review = f.service.review(id).review;
  assert.equal(review.before, 0); assert.equal(review.after, 1);
  assert.throws(() => f.service.offerQualifiedChange({ ...acquisition, unit: 'litres' }), /discrete/);
  assert.throws(() => f.service.offerQualifiedChange({ ...acquisition, quantity: Number.MAX_SAFE_INTEGER + 1 }));
  assert.throws(() => f.service.offerQualifiedChange({ ...acquisition, confidence: 'unknown' }), /not qualified/);
});

test('authorization refresh persists rotated credentials without invalidating an unchanged grant review', async () => {
  const f = fixture(); await connect(f);
  const id = f.service.offerQualifiedChange(f.change);
  const review = f.service.review(id).review;
  f.adapter.refreshAccess = async () => ({ session: f.account, credentials: { access: 'SYNTHETIC_ROTATED_CREDENTIAL' } });
  await f.service.refreshAccess();
  assert.equal(f.service.confirm(id, review.challenge).review.stage, 2);
  assert.equal(f.saved().credentials.access, 'SYNTHETIC_ROTATED_CREDENTIAL');
  assert.doesNotMatch(JSON.stringify(f.service.snapshot()), /SYNTHETIC_ROTATED_CREDENTIAL/);
});
