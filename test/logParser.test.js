const test = require('node:test');
const assert = require('node:assert/strict');
const { parseShardEntries } = require('../src/logParser');

test('parses shard id and name on one line', () => {
  const entries = parseShardEntries(`
<2026-07-23T19:12:10Z> Connected ShardID: 210 ShardName: Stanton-US Region: us Build: 4.2.1
`);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].shardId, '210');
  assert.equal(entries[0].shardName, 'Stanton-US');
  assert.equal(entries[0].region, 'us');
  assert.equal(entries[0].build, '4.2.1');
});

test('dedupes repeated shard sightings', () => {
  const entries = parseShardEntries(`
2026-07-23 19:12:10 ShardID=210 ShardName=Stanton-US
2026-07-23 20:12:10 ShardID=210 ShardName=Stanton-US
`);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].lastSeen, '2026-07-23 20:12:10');
});

test('parses json-like shard lines', () => {
  const entries = parseShardEntries(`
2026-07-23 19:12:10 {"shardId":"mesh-987","shardName":"Stanton EU","region":"eu"}
`);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].shardId, 'mesh-987');
  assert.equal(entries[0].shardName, 'Stanton EU');
  assert.equal(entries[0].region, 'eu');
});
