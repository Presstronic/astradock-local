const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  backupLogInfo,
  collectBlueprintLogFiles,
  createBlueprintExtractionProfile,
  getDefaultBlueprintExtractionProfile,
  normalizeBlueprint,
  parseBlueprintNotification,
  scanBlueprintLogs,
  serializeBlueprintCsv,
  writeBlueprintCsv,
  writeBlueprintJson
} = require('../src/exporter/blueprintExporter');

const APPROVED_TEST_PROFILE = {
  status: 'approved',
  profileId: 'test-owner-approved-blueprint-v1',
  version: 1,
  build: null,
  locale: 'en-US',
  labels: ['Received Blueprint']
};

const blueprintLine = (name, id = 3) => `<2026-09-03T10:20:30.000Z> [Notice] <SHUDEvent_OnNotification> Added notification "Received Blueprint: ${name}: " [${id}] to queue. New queue size: 1, MissionId: [00000000-0000-0000-0000-000000000000], ObjectiveId: []`;

function collectLogFiles(directory) {
  return fsSync.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectLogFiles(entryPath);
    return entry.name.endsWith('.log') ? [entryPath] : [];
  });
}

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

test('the reviewed LIVE fixture corpus has no approved blueprint notification evidence', () => {
  const corpusRoot = path.join(__dirname, 'fixtures', 'runtime-log', 'live', '4.9-pub', 'sc-4.9-live');
  const matches = collectLogFiles(corpusRoot).flatMap((filePath) => (
    fsSync.readFileSync(filePath, 'utf8').split(/\r?\n/).map(parseBlueprintNotification).filter(Boolean)
  ));

  assert.deepEqual(matches, []);
});

test('validates backup filename shape and preserves only explicit Station fields', () => {
  assert.equal(backupLogInfo('Game Build(12545750) 31 Aug 26 (23 44 28).log').build, '12545750');
  assert.equal(backupLogInfo('Game Build(11518367) 26 Mar 26 (18 10 33).Tentonaxe.log').build, '11518367');
  assert.equal(backupLogInfo('Game Build(12545750) malformed.log'), null);
  assert.deepEqual(normalizeBlueprint({ name: ' AMRS Laser Cannon ', type: 'Weapon Gun', shared: true }), { name: 'AMRS Laser Cannon', type: 'Weapon Gun', shared: true });
  assert.deepEqual(normalizeBlueprint({ name: 'unknown blueprint' }), { name: 'unknown blueprint', type: '', shared: null });
  assert.equal(normalizeBlueprint({ name: '  ' }), null);
});

test('serializes approved blueprint fields as deterministic escaped CSV', () => {
  assert.equal(serializeBlueprintCsv([
    { name: 'Laser, "Mk II"', type: 'Weapon', shared: true },
    { name: 'Unknown', type: '', shared: null }
  ]), 'name,type,shared\r\n"Laser, ""Mk II""","Weapon","true"\r\n"Unknown","",""\r\n');
});

test('writes CSV atomically with the same normalized records as JSON', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'astradock-exporter-'));
  const destination = await writeBlueprintCsv(path.join(root, 'out', 'blueprints.csv'), [
    { name: 'AMRS Laser Cannon', type: 'Weapon', shared: null }
  ]);
  assert.equal(path.basename(destination), 'blueprints.csv');
  assert.equal(await fs.readFile(destination, 'utf8'), 'name,type,shared\r\n"AMRS Laser Cannon","Weapon",""\r\n');
  await assert.rejects(fs.access(`${destination}.${process.pid}.tmp`));
  await fs.rm(root, { recursive: true, force: true });
});

test('does not enable an unapproved or incomplete extraction profile', () => {
  assert.equal(createBlueprintExtractionProfile().status, 'unsupported');
  assert.equal(createBlueprintExtractionProfile({ profile: { status: 'approved', labels: [] } }).status, 'unsupported');
  assert.equal(createBlueprintExtractionProfile({ profile: APPROVED_TEST_PROFILE }).profileId, 'test-owner-approved-blueprint-v1');
});

test('returns an explicit unsupported result without scanning or exporting unapproved evidence', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'astradock-exporter-'));
  const current = path.join(root, 'game.log');
  await fs.writeFile(current, `${blueprintLine('Unapproved Blueprint')}\n`);
  const result = await scanBlueprintLogs(current);
  assert.equal(result.records.length, 0);
  assert.equal(result.extraction.status, 'unsupported');
  assert.equal(result.extraction.profileId, null);
  assert.match(result.extraction.reason, /approved blueprint evidence profile/);
  await fs.rm(root, { recursive: true, force: true });
});

test('uses the owner-captured LIVE 4.7 profile for blueprint extraction', async () => {
  const fixture = path.join(__dirname, 'fixtures', 'exporter', 'live-4.7-blueprint-capture.log');
  const result = await scanBlueprintLogs(fixture, { profile: getDefaultBlueprintExtractionProfile() });
  assert.equal(result.extraction.status, 'approved');
  assert.equal(result.extraction.profileId, 'sc-4.7-live-11518367-blueprint-v1');
  assert.deepEqual(result.records, [
    { name: 'Antium Legs Moss Camo', type: '', shared: null },
    { name: 'Quartz "Black Op" Energy SMG', type: '', shared: null }
  ]);
  assert.equal(result.observations.length, 2);
});

test('rejects an approved profile when the scanned build is outside its version scope', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'astradock-exporter-'));
  const current = path.join(root, 'game.log');
  await fs.writeFile(current, 'BackupNameAttachment=" Build(99999999) 03 Sep 26 (10 20 30)"\n' + blueprintLine('Out of profile') + '\n');
  const result = await scanBlueprintLogs(current, { profile: { ...APPROVED_TEST_PROFILE, build: '12545750' } });
  assert.equal(result.records.length, 0);
  assert.equal(result.extraction.status, 'unsupported');
  assert.ok(result.errors.some((error) => error.code === 'unsupported_profile'));
  await fs.rm(root, { recursive: true, force: true });
});

test('scans current and backup logs, deduplicates repeated observations, and writes JSON atomically', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'astradock-exporter-'));
  const backupDir = path.join(root, 'logbackups');
  await fs.mkdir(backupDir);
  const current = path.join(root, 'game.log');
  await fs.writeFile(current, 'BackupNameAttachment=" Build(12545750) 03 Sep 26 (10 20 30)"\n' + blueprintLine('AMRS Laser Cannon') + '\n');
  await fs.writeFile(path.join(backupDir, 'Game Build(12545750) 03 Sep 26 (10 20 30).log'), `${blueprintLine('AMRS Laser Cannon')}\n${blueprintLine('Medical Gun', 4)}\n`);
  await fs.writeFile(path.join(backupDir, 'not-a-game-log.log'), blueprintLine('Should Not Match'));

  const result = await scanBlueprintLogs(current, { profile: APPROVED_TEST_PROFILE });
  assert.equal(result.filesTotal, 2);
  assert.equal(result.records.length, 2);
  assert.equal(result.files.filter((file) => file.status === 'ready').length, 2);
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
  const result = await scanBlueprintLogs(current, { profile: APPROVED_TEST_PROFILE });
  assert.equal(result.records.length, 1);
  await fs.rm(root, { recursive: true, force: true });
});

test('returns a deterministic source-set boundary and explains skipped or inaccessible inputs', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'astradock-exporter-'));
  const backupDir = path.join(root, 'logbackups');
  await fs.mkdir(backupDir);
  const current = path.join(root, 'game.log');
  await fs.writeFile(current, `${blueprintLine('Current Blueprint')}\n`);
  await fs.writeFile(path.join(backupDir, 'Game Build(2) 02 Sep 26 (10 00 00).log'), `${blueprintLine('Older Blueprint')}\n`);
  await fs.writeFile(path.join(backupDir, 'Game Build ( 1 ) 01 Sep 26 (09 00 00 ).LOG'), `${blueprintLine('First Blueprint')}\n`);
  await fs.writeFile(path.join(backupDir, 'Game Build(9) malformed.log'), 'ignored');
  await fs.mkdir(path.join(backupDir, 'Game Build(8) 08 Sep 26 (08 00 00).log'));

  const sourceSet = await collectBlueprintLogFiles(current);
  assert.deepEqual(sourceSet.files.map((file) => file.fileName), [
    'game.log',
    'Game Build ( 1 ) 01 Sep 26 (09 00 00 ).LOG',
    'Game Build(2) 02 Sep 26 (10 00 00).log'
  ]);
  assert.equal(sourceSet.skipped, 2);
  assert.ok(sourceSet.diagnostics.some((entry) => entry.reason === 'malformed_backup_name'));
  assert.ok(sourceSet.diagnostics.some((entry) => entry.reason === 'not_a_file'));
  assert.match(sourceSet.fingerprint, /^set_[a-f0-9]{24}$/);
  await fs.rm(root, { recursive: true, force: true });
});

test('reports a source changed during scan without discarding bounded results', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'astradock-exporter-'));
  const current = path.join(root, 'game.log');
  await fs.writeFile(current, `${blueprintLine('Stable Blueprint')}\n`);
  let changed = false;
  const result = await scanBlueprintLogs(current, { profile: APPROVED_TEST_PROFILE,
    onProgress(progress) {
      if (!changed && progress.phase === 'scanning') {
        changed = true;
        fsSync.appendFileSync(current, `${blueprintLine('Appended Blueprint')}\n`);
      }
    }
  });
  assert.equal(result.records.length, 2, 'the scan remains bounded while accepting bytes available to the opened stream');
  assert.ok(result.errors.some((error) => error.code === 'source_changed'));
  assert.match(result.sourceFingerprint, /^set_[a-f0-9]{24}$/);
  await fs.rm(root, { recursive: true, force: true });
});
