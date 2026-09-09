const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  backupLogInfo,
  collectBlueprintLogFiles,
  deriveBlueprintType,
  parseBlueprintNotification,
  scanBlueprintLogs,
  writeBlueprintJson
} = require('../src/exporter/blueprintExporter');

const blueprintLine = (name, id = 3) => `<2026-09-03T10:20:30.000Z> [Notice] <SHUDEvent_OnNotification> Added notification "Received Blueprint: ${name}: " [${id}] to queue. New queue size: 1, MissionId: [00000000-0000-0000-0000-000000000000], ObjectiveId: []`;

test('parses blueprint notifications with quoted names and ignores non-notification lines', () => {
  const parsed = parseBlueprintNotification(blueprintLine('Yubarev "Mirage" Pistol', 19));
  assert.equal(parsed.name, 'Yubarev "Mirage" Pistol');
  assert.equal(parsed.notificationId, 19);
  assert.equal(parseBlueprintNotification('Received Blueprint: false positive'), null);
});

test('supports localized blueprint labels without accepting arbitrary notifications', () => {
  const line = '<2026-09-03T10:20:30.000Z> [Notice] <SHUDEvent_OnNotification> Added notification "Bauplan erhalten: ADP-mk4 Core Woodland: " [4] to queue. New queue size: 1,';
  assert.equal(parseBlueprintNotification(line).name, 'ADP-mk4 Core Woodland');
  assert.equal(parseBlueprintNotification(line, { labels: ['Other label'] }), null);
});

test('validates backup filename shape and derives conservative categories', () => {
  assert.equal(backupLogInfo('Game Build(12545750) 31 Aug 26 (23 44 28).log').build, '12545750');
  assert.equal(backupLogInfo('Game Build(11518367) 26 Mar 26 (18 10 33).Tentonaxe.log').build, '11518367');
  assert.equal(backupLogInfo('Game Build(12545750) malformed.log'), null);
  assert.equal(deriveBlueprintType('AMRS Laser Cannon'), 'Weapon Gun');
  assert.equal(deriveBlueprintType('unknown blueprint'), '');
});

test('scans current and backup logs, deduplicates repeated observations, and writes JSON atomically', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'astradock-exporter-'));
  const backupDir = path.join(root, 'logbackups');
  await fs.mkdir(backupDir);
  const current = path.join(root, 'game.log');
  await fs.writeFile(current, 'BackupNameAttachment=" Build(12545750) 03 Sep 26 (10 20 30)"\n' + blueprintLine('AMRS Laser Cannon') + '\n');
  await fs.writeFile(path.join(backupDir, 'Game Build(12545750) 03 Sep 26 (10 20 30).log'), `${blueprintLine('AMRS Laser Cannon')}\n${blueprintLine('Medical Gun', 4)}\n`);
  await fs.writeFile(path.join(backupDir, 'not-a-game-log.log'), blueprintLine('Should Not Match'));

  const result = await scanBlueprintLogs(current);
  assert.equal(result.filesTotal, 2);
  assert.equal(result.records.length, 2);
  assert.equal(result.duplicatesSuppressed, 1);
  assert.deepEqual(result.records.map((record) => record.name), ['AMRS Laser Cannon', 'Medical Gun']);
  assert.equal(result.records[0].shared, null);
  assert.ok(result.observations.some((entry) => entry.duplicateObservations === 1));

  const output = await writeBlueprintJson(path.join(root, 'out', 'blueprints.json'), result.records);
  assert.deepEqual(JSON.parse(await fs.readFile(output, 'utf8')), result.records);
  await fs.rm(root, { recursive: true, force: true });
});

test('reports a missing logbackups directory without failing current-log export', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'astradock-exporter-'));
  const current = path.join(root, 'game.log');
  await fs.writeFile(current, `${blueprintLine('Mining Tool')}\n`);
  const sourceSet = await collectBlueprintLogFiles(current);
  assert.equal(sourceSet.files.length, 1);
  const result = await scanBlueprintLogs(current);
  assert.equal(result.records.length, 1);
  await fs.rm(root, { recursive: true, force: true });
});
