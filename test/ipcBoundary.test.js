const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CHANNELS,
  createBoundaryError,
  fail,
  validatePayload
} = require('../src/ipcBoundary');

test('IPC boundary accepts only bounded monitor command payloads', () => {
  assert.deepEqual(validatePayload(CHANNELS.monitorStart, {
    sourceId: 'src_0123456789abcdef01234567',
    options: {
      username: 'SYNTH_HANDLE',
      userId: 'SYNTH_ACCOUNT',
      startMode: 'from_checkpoint',
      checkpoint: {
        sourceIdentity: '123:456:789',
        offset: 42,
        generation: 2
      }
    }
  }), {
    sourceId: 'src_0123456789abcdef01234567',
    options: {
      username: 'SYNTH_HANDLE',
      userId: 'SYNTH_ACCOUNT',
      startMode: 'from_checkpoint',
      checkpoint: {
        version: 1,
        sourceIdentity: '123:456:789',
        offset: 42,
        generation: 2
      }
    }
  });

  assert.throws(
    () => validatePayload(CHANNELS.monitorStart, {
      sourceId: '../private/game.log',
      options: {}
    }),
    /invalid_payload|request payload/i
  );

  assert.throws(
    () => validatePayload(CHANNELS.monitorStart, {
      sourceId: 'src_0123456789abcdef01234567',
      options: { username: 'x'.repeat(65) }
    }),
    /invalid_payload|request payload/i
  );

  assert.throws(
    () => validatePayload(CHANNELS.monitorStart, {
      sourceId: 'src_0123456789abcdef01234567',
      options: { startMode: 'from_private_path' }
    }),
    /invalid_payload|request payload/i
  );
});

test('IPC boundary constrains event query pagination and environment-scoped evidence requests', () => {
  assert.deepEqual(validatePayload(CHANNELS.eventsQuery, {
    kind: 'actions',
    cursor: 10,
    limit: 25
  }), {
    kind: 'actions',
    cursor: 10,
    limit: 25
  });

  assert.throws(
    () => validatePayload(CHANNELS.eventsQuery, { kind: 'sql', limit: 10 }),
    /request payload/i
  );
  assert.throws(
    () => validatePayload(CHANNELS.eventsQuery, { kind: 'actions', limit: 201 }),
    /request payload/i
  );
  assert.throws(
    () => validatePayload(CHANNELS.evidenceGet, { environmentKey: 'LIVE:PU' }),
    /request payload/i
  );
  assert.deepEqual(validatePayload(CHANNELS.evidenceGet, {
    environmentKey: 'LIVE:PU',
    eventId: 'runtime-event-1'
  }), {
    environmentKey: 'LIVE:PU',
    eventId: 'runtime-event-1'
  });
  assert.throws(
    () => validatePayload(CHANNELS.evidenceGet, { environmentKey: 'PTU:PU', eventId: 'x\ninvalid' }),
    /request payload/i
  );
});

test('IPC errors are structured and do not echo paths or raw sensitive details', () => {
  const result = fail(createBoundaryError('invalid_payload', 'leaky', {
    details: {
      sourcePath: '/home/private/StarCitizen/LIVE/game.log',
      rawLine: 'SENSITIVE_RAW_LINE',
      reason: 'bounded failure'
    }
  }), 'corr_test');

  assert.equal(result.ok, false);
  assert.equal(result.correlationId, 'corr_test');
  assert.equal(result.error.code, 'invalid_payload');
  assert.equal(result.error.message.includes('/home/private'), false);
  assert.equal(JSON.stringify(result.error).includes('SENSITIVE_RAW_LINE'), false);
  assert.deepEqual(result.error.details, { reason: 'bounded failure' });
});

test('settings updates allow only supported local renderer preferences', () => {
  assert.deepEqual(validatePayload(CHANNELS.settingsUpdate, {
    theme: 'dark',
    username: ' Pilot ',
    userId: ''
  }), {
    theme: 'dark',
    username: 'Pilot',
    userId: ''
  });

  assert.throws(
    () => validatePayload(CHANNELS.settingsUpdate, { theme: 'light' }),
    /request payload/i
  );

  assert.throws(
    () => validatePayload(CHANNELS.settingsUpdate, { apiTemplate: 'https://example.invalid/{shardId}' }),
    /request payload/i
  );
});

test('settings deletion commands require an explicit bounded scope', () => {
  assert.deepEqual(validatePayload(CHANNELS.settingsDelete, { mode: 'environment', environmentKey: 'LIVE:4.9.188' }), {
    mode: 'environment', environmentKey: 'LIVE:4.9.188'
  });
  assert.deepEqual(validatePayload(CHANNELS.settingsDelete, { mode: 'all_telemetry' }), {
    mode: 'all_telemetry', environmentKey: null
  });
  assert.throws(() => validatePayload(CHANNELS.settingsDelete, { mode: 'environment' }), /request payload/i);
  assert.throws(() => validatePayload(CHANNELS.settingsDelete, { mode: 'all_telemetry', path: '/tmp/data' }), /request payload/i);
});
