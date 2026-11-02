const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { auditLocationInventoryCapture, MAX_AUDIT_BYTES } = require('../src/locationInventoryAudit');
const { parseArguments, runAudit, stable } = require('../scripts/auditLocationInventory');

const since = '2026-11-02T17:00:00Z';
const options = { since, releaseChannel: 'LIVE', gameBuild: '4.10.197.2878' };
const fixture = (channel, name = 'inventory-directions.observed') => path.join(__dirname,
  `fixtures/runtime-log/${channel.toLowerCase()}/4.10-pub/sc-4.10-${channel.toLowerCase()}/captured/${name}.log`);
const inspect = (text, extra) => auditLocationInventoryCapture({ ...options, text, ...extra });

test('location-side candidates preserve direction and quantity without an ownership balance or private identities', async () => {
  const text = await fs.readFile(fixture('LIVE'), 'utf8');
  const report = inspect(text);
  assert.equal(report.observations.primaryResultRecords, 3);
  assert.equal(report.observations.parsedPrimaryResults, 3);
  assert.equal(report.observations.resultsByStatus.location_change_reported, 3);
  assert.deepEqual(report.results.map(row => row.candidateLocationEffects), [
    [{ endpoint: 'source', quantityDelta: -1 }], [{ endpoint: 'source', quantityDelta: -10 }],
    [{ endpoint: 'destination', quantityDelta: 1 }]
  ]);
  assert.ok(report.results.every(row => row.namedLocation === null));
  assert.doesNotMatch(JSON.stringify(report), /SYNTH_PLAYER|SYNTH_ID|local-inventory-audit|SourceInventory|account|rawText/);
  assert.equal(inspect(text, { sourceByteOffset: 123 }).results[0].sourceByteOffset, report.results[0].sourceByteOffset + 123);
});

test('PTU Store zero quantity and Interaction unknown destinations stay unresolved', async () => {
  const text = await fs.readFile(fixture('PTU'), 'utf8');
  const report = inspect(text, { releaseChannel: 'PTU', gameBuild: '4.10.199.13454', branch: 'sc-alpha-4.10.2' });
  assert.deepEqual(report.results.map(row => row.status), ['quantity_unknown', 'route_unresolved']);
  assert.ok(report.results.every(row => row.candidateLocationEffects.length === 0));
  assert.equal(report.results[0].requestedSourceQuantity, null);
  assert.equal(report.observations.zeroSourceQueueQuantities, 1);
});

test('observed bulk, Split, Store metadata and failed StackAll are visible without fabricated deltas', async () => {
  const text = await fs.readFile(fixture('LIVE', 'inventory-coverage.observed'), 'utf8');
  const report = inspect(text);
  assert.deepEqual({ ...report.observations.requestsByOperation }, { Store: 1, Move: 1, Split: 1, StackAll: 1 });
  assert.equal(report.observations.bulkItemRequests, 1);
  assert.equal(report.observations.markers.StoreItem, 1);
  assert.equal(report.observations.markers.InventoryManagement, 1);
  assert.equal(report.observations.resultsByStatus.reported_failure, 1);
  assert.equal(report.observations.resultsByStatus.item_or_request_context_unresolved, 3);
  assert.ok(report.results.every(row => row.candidateLocationEffects.length === 0));
  assert.ok(report.results.every(row => row.requestedSourceQuantity === null), 'ItemsCount[122] is not the moved quantity');
  assert.ok([...text.matchAll(/'([^']+)'/g)].every(match => match[1].startsWith('SYNTH_')), 'all quoted instance/player names are synthetic');
});

test('unreviewed builds retain diagnostic counts and explicitly expose parser suppression', async () => {
  const text = await fs.readFile(fixture('LIVE'), 'utf8');
  const report = inspect(text, { gameBuild: '4.10.197.9999' });
  assert.equal(report.observations.primaryResultRecords, 3);
  assert.equal(report.observations.parsedPrimaryResults, 0);
  assert.equal(report.observations.unparsedPrimaryResultRecords, 3);
  assert.equal(report.results.length, 0);
  assert.notEqual(report.scope.parserStatus, 'compatible');
  assert.throws(() => inspect(text + '<2026-11-02T20:30:00Z> <Init> Tag[PTU]\n'), /environment evidence conflicts/);
});

test('partial tails, missing/expired/foreign or conflicting context never become a reported change', async () => {
  const lines = (await fs.readFile(fixture('LIVE'), 'utf8')).split(/(?<=\n)/).slice(0, 3);
  const cases = [lines[2], lines[0].replace('SYNTH_PLAYER', 'SYNTH_OTHER') + lines[1] + lines[2],
    lines[0] + lines[0] + lines[1] + lines[2], lines.join('').replace('20:01:40.318', '20:02:40.318'),
    lines[0] + lines[1].replace('Target Inventory[INVALID]', 'Target Inventory[SYNTH_OTHER:Location:0]') + lines[2]];
  for (const text of cases) assert.ok(inspect(text).results.every(row => row.candidateLocationEffects.length === 0));
  const partial = inspect(lines.join('').trimEnd());
  assert.equal(partial.capture.trailingPartialRecord, true);
  assert.equal(partial.results.length, 0);
  const cutoff = inspect(lines.join(''), { since: '2026-11-02T20:01:40Z' });
  assert.equal(cutoff.results[0].status, 'item_or_request_context_unresolved', 'do not borrow a request before capture began');
});

test('unknown/malformed markers, oversize records and report caps are explicit and bounded', async () => {
  const text = await fs.readFile(fixture('LIVE'), 'utf8');
  const extra = '<2026-11-02T20:02:00Z> [Notice] <Private future marker SYNTH_ACCOUNT> Secret[SYNTH_PRIVATE] [Team_CoreGameplayFeatures][Inventory]\n';
  const malformed = '<invalid-time> [Notice] <StoreItem> Secret[SYNTH_PRIVATE]\n';
  const report = inspect(text + extra + malformed + 'x'.repeat(65537) + '\n', { truncated: true });
  assert.equal(report.observations.unknownInventoryMarkers, 1);
  assert.equal(report.capture.invalidInventoryRecords, 1);
  assert.equal(report.capture.oversizedRecords, 1);
  assert.equal(report.capture.truncated, true);
  assert.doesNotMatch(JSON.stringify(report), /SYNTH_PRIVATE|SYNTH_ACCOUNT|Private future/);
  const capped = inspect(text.repeat(60));
  assert.equal(capped.results.length, 160);
  assert.equal(capped.capture.omittedParsedResults, 20);
  assert.throws(() => inspect('x'.repeat(MAX_AUDIT_BYTES + 1)), RangeError);
  assert.throws(() => inspect(text, { since: 'ambiguous-time' }), TypeError);
});

test('CLI validates arguments and refuses source changes/replacement using lossless filesystem identity', () => {
  for (const args of [[], ['--log', 'Game.log'], ['--log', 'Game.log', '--since', 'bad'],
    ['--log', 'Game.log', '--since', since, '--output', 'Game.log'],
    ['--log', 'Game.log', '--since', since, '--log', 'other.log'], ['--unknown', 'value']]) {
    assert.throws(() => parseArguments(args), TypeError);
  }
  assert.equal(parseArguments(['--log', 'Game.log', '--since', since]).since, since);
  const stat = { dev: 1n, ino: 9007199254740993n, size: 20n, mtimeNs: 4n, ctimeNs: 5n };
  assert.equal(stable(stat, { ...stat }), true);
  for (const field of Object.keys(stat)) assert.equal(stable(stat, { ...stat, [field]: stat[field] + 1n }), false, field);
});

test('CLI reads the original preview source, writes only a new report and rejects copied headers', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'astradock-inventory-audit-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const log = path.join(root, 'PTU', 'Game.log');
  const reportFile = path.join(root, 'report.json');
  await fs.mkdir(path.dirname(log));
  const original = '<2026-11-02T16:59:00Z> FileVersion: 4.10.199.13454\nBranch: sc-alpha-4.10.2\n'
    + '<2026-11-02T16:59:00Z> <Init> Environment[PUB] Tag[PTU]\n' + await fs.readFile(fixture('PTU'), 'utf8');
  await fs.writeFile(log, original);
  const report = await runAudit({ log, since, output: reportFile });
  assert.equal(report.scope.channel, 'PTU');
  assert.equal(report.results.length, 2);
  assert.deepEqual(JSON.parse(await fs.readFile(reportFile, 'utf8')), JSON.parse(JSON.stringify(report)));
  assert.equal(await fs.readFile(log, 'utf8'), original);
  await assert.rejects(runAudit({ log, since, output: reportFile }), { code: 'EEXIST' });
  const executable = path.resolve(__dirname, '../scripts/auditLocationInventory.js');
  const stdout = execFileSync(process.execPath, [executable, '--log', log, '--since', since], { encoding: 'utf8', windowsHide: true });
  assert.equal(JSON.parse(stdout).results.length, 2);
  assert.doesNotMatch(stdout, /SYNTH_PLAYER|SYNTH_ID/);
  const copied = path.join(root, 'LIVE', 'Game.log');
  await fs.mkdir(path.dirname(copied));
  await fs.writeFile(copied, original); // Synthetic negative fixture only; never a real preview log.
  await assert.rejects(runAudit({ log: copied, since }), /environment evidence conflicts/);
});
