const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLogText } = require('../src/logParser');
const { parseRuntimeLogText } = require('../src/runtimeLogParserEngine');
const {
  compareAbsoluteInstants,
  elapsedMilliseconds,
  parseAbsoluteInstant,
  parseGameLogTimestamp
} = require('../src/time');

test('normalizes offset-bearing source instants without host-timezone assumptions', () => {
  assert.deepEqual(
    parseGameLogTimestamp('<2026-08-19T23:10:50.145Z> zone evidence'),
    {
      ok: true,
      instant: '2026-08-19T23:10:50.145Z',
      epochMs: 1787181050145,
      original: '2026-08-19T23:10:50.145Z',
      offset: 'Z',
      assumedTimeZone: null
    }
  );
  assert.equal(parseAbsoluteInstant('2026-08-20T04:40:50.145+05:30').instant, '2026-08-19T23:10:50.145Z');
  assert.equal(parseAbsoluteInstant('2026-08-19T19:10:50.145-04:00').instant, '2026-08-19T23:10:50.145Z');
  assert.equal(parseAbsoluteInstant('2026-08-19T23:10:50.145987Z').instant, '2026-08-19T23:10:50.145Z');
});

test('rejects missing, malformed, impossible, and ambiguous source times without epoch coercion', () => {
  assert.equal(parseGameLogTimestamp('no timestamp').code, 'timestamp_missing');
  assert.equal(parseGameLogTimestamp('<2026-08-19T23:10:50.145>').code, 'timestamp_ambiguous');
  assert.equal(parseAbsoluteInstant('2026-02-30T10:00:00Z').code, 'timestamp_malformed');
  assert.equal(parseAbsoluteInstant('2026-08-19 23:10:50Z').code, 'timestamp_malformed');
  assert.equal(parseAbsoluteInstant('2026-08-19T25:10:50Z').code, 'timestamp_malformed');
});

test('allows an offset-less clock only through an explicit source policy', () => {
  const parsed = parseGameLogTimestamp('<2026-08-19T23:10:50.145>', { offsetlessBasis: 'UTC' });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.instant, '2026-08-19T23:10:50.145Z');
  assert.equal(parsed.assumedTimeZone, 'UTC');
});

test('compares instants and durations independently of their written offsets', () => {
  assert.equal(compareAbsoluteInstants('2026-11-01T01:30:00-04:00', '2026-11-01T01:30:00-05:00'), -3_600_000);
  assert.equal(elapsedMilliseconds('2026-03-08T01:59:59-05:00', '2026-03-08T03:00:00-04:00'), 1_000);
  assert.equal(elapsedMilliseconds('ambiguous', '2026-08-19T23:10:50Z'), null);
});

test('legacy and canonical parser paths normalize identically in different process timezones', () => {
  const text = [
    '<2026-08-19T23:10:50.100Z> <Join PU> address[example.invalid] port[64090] shard[pub_test] locationId[test]',
    '<2026-08-19T23:10:50.145Z> [Notice] <SHUDEvent_OnNotification> Added notification "Entered Monitored Space: " [0] to queue. New queue size: 1, MissionId: [00000000-0000-0000-0000-000000000000], ObjectiveId: []'
  ].join('\n') + '\n';
  const options = { sourceLocation: 'C:/StarCitizen/LIVE/Game.log', gameBuild: '4.9.188.23497' };
  const originalTimezone = process.env.TZ;
  let outputs;
  try {
    outputs = ['UTC', 'America/New_York', 'Asia/Kolkata'].map((timezone) => {
      process.env.TZ = timezone;
      const result = parseLogText(text, options);
      const canonical = parseRuntimeLogText(text, options);
      return {
        legacy: result.userActivity.actions[0].timestamp,
        canonical: canonical.events.find((event) => event.eventType === 'MonitoredSpaceEntered').sourceTimestamp
      };
    });
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
  assert.equal(new Set(outputs.map(JSON.stringify)).size, 1);
  assert.deepEqual(outputs[0], {
    legacy: '2026-08-19T23:10:50.100Z',
    canonical: '2026-08-19T23:10:50.145Z'
  });
});
