const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createStationTransport } = require('../src/station/transport');
const { createAuthorizationTransaction } = require('../src/station/oauth');
const { StationRepository } = require('../src/station/repository');

test('transport bounds bodies, pins origins, prevents redirects and does not leak failures', async () => {
  const calls = [];
  const request = createStationTransport({ origin: 'https://station.example.org', fetchImpl: async (...args) => { calls.push(args); return new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } }); } });
  assert.deepEqual(await request({ path: '/approved-path', credential: 'SYNTHETIC' }), { ok: true });
  assert.equal(calls[0][1].redirect, 'error');
  assert.equal(calls[0][1].headers.Authorization, 'Bearer SYNTHETIC');
  await assert.rejects(request({ path: 'https://other.example.org/private', credential: 'SYNTHETIC' }), /unapproved/);
  assert.equal(calls.length, 1);
  const huge = createStationTransport({ origin: 'https://station.example.org', maxBytes: 32, fetchImpl: async () => new Response('x'.repeat(33), { headers: { 'content-type': 'application/json' } }) });
  await assert.rejects(huge({ path: '/' }), /exceeds/);
  const fail = createStationTransport({ origin: 'https://station.example.org', fetchImpl: async () => { throw new Error('SYNTHETIC_PRIVATE_TOKEN'); } });
  await assert.rejects(fail({ path: '/' }), error => !error.message.includes('SYNTHETIC_PRIVATE_TOKEN'));
});

test('transport classifies denial, conflict, throttling, cancellation and malformed data', async () => {
  for (const [status, code] of [[401, 'station_auth_required'], [403, 'station_denied'], [409, 'station_conflict'], [429, 'station_rate_limited'], [503, 'station_offline']]) {
    const request = createStationTransport({ origin: 'https://station.example.org', fetchImpl: async () => new Response('{}', { status, headers: { 'retry-after': '9999999' } }) });
    await assert.rejects(request({ path: '/' }), error => error.code === code && (!error.retryAfterMs || error.retryAfterMs <= 300000));
  }
  let called = false;
  const controller = new AbortController(); controller.abort();
  const request = createStationTransport({ origin: 'https://station.example.org', fetchImpl: async () => { called = true; } });
  await assert.rejects(request({ path: '/', signal: controller.signal }), /cancelled/); assert.equal(called, false);
  const malformed = createStationTransport({ origin: 'https://station.example.org', fetchImpl: async () => new Response('{bad', { headers: { 'content-type': 'application/json' } }) });
  await assert.rejects(malformed({ path: '/' }));
});

test('native authorization binds S256, state, exact callback, expiry, cancellation and one-use exchange', () => {
  let clock = 0;
  const options = { authorizationEndpoint: 'https://station.example.org/registered-authorize', clientId: 'synthetic-public-client', redirectUri: 'http://127.0.0.1:54321/registered-callback', scopes: ['synthetic'], now: () => clock };
  const transaction = createAuthorizationTransaction(options);
  const url = new URL(transaction.authorizationUrl);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const callback = options.redirectUri+'?state='+url.searchParams.get('state')+'&code=synthetic-code';
  assert.throws(() => transaction.acceptCallback(callback.replace('54321','54322')));
  assert.throws(() => transaction.acceptCallback(callback.replace('state=', 'wrong=')));
  const exchange = transaction.acceptCallback(callback);
  assert.equal(crypto.createHash('sha256').update(exchange.verifier).digest('base64url'), url.searchParams.get('code_challenge'));
  assert.throws(() => transaction.acceptCallback(callback));
  const cancelled = createAuthorizationTransaction(options); cancelled.cancel(); assert.throws(() => cancelled.acceptCallback(callback));
  const expired = createAuthorizationTransaction(options); clock = 120001; assert.throws(() => expired.acceptCallback(callback));
});

test('Station repository encrypts private state and fails closed for an incorrect key', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'astradock-station-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'station.db');
  const key = crypto.randomBytes(32);
  let repository = new StationRepository({ filePath, key });
  repository.save({ privateValue: 'SYNTHETIC_NEVER_PLAINTEXT' }); repository.close();
  assert.equal(fs.readFileSync(filePath).includes(Buffer.from('SYNTHETIC_NEVER_PLAINTEXT')), false);
  assert.throws(() => new StationRepository({ filePath, key: crypto.randomBytes(32) }), /could not be opened/);
  repository = new StationRepository({ filePath, key });
  assert.equal(repository.load().privateValue, 'SYNTHETIC_NEVER_PLAINTEXT'); repository.close();
});
