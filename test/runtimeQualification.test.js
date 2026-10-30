const test = require('node:test');
const assert = require('node:assert/strict');
const { qualify } = require('../scripts/qualifyRuntime');

test('runtime qualification passes deterministic load, recovery, persistence, and renderer-bound checks', async () => {
  const report = await qualify({ durationMs: 200 });
  assert.equal(report.status, 'pass', JSON.stringify(report, null, 2));
  assert.ok(report.results.length >= 5);
  assert.ok(report.results.every((result) => result.status === 'pass'));
});
