const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  LOG_FILE_NAME,
  VALIDATION_STATUSES,
  discoverRuntimeSources,
  getCandidateLogPaths,
  loadSourcePreference,
  saveSourcePreference,
  toPublicSource,
  validateLogSource
} = require('../src/sourceDiscovery');

const NOW = '2026-08-11T12:00:00.000Z';

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'astradock-source-discovery-'));
}

async function writeGameLog(filePath, channel = 'LIVE', build = `4.9.0-${channel}.9000000-SYNTH`) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, [
    `<2026-08-09T19:00:00.000Z> <Init> Environment[PUB] Tag[${channel}] Config[Shipping] SourcePath[%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/${channel}/game.log]`,
    `<2026-08-09T19:00:01.000Z> <Game Version> version[${build}] environment[${channel}]`,
    '<2026-08-09T19:00:02.000Z> <Join PU> address[server.example.invalid] port[64090] shard[SYNTH_SHARD_A] locationId[SYNTH_LOCATION_A]'
  ].join('\n'));
}

test('discovers and validates supported Windows launcher and Steam-style candidates without exposing private paths', async () => {
  const root = await makeTempDir();
  const programFiles = path.join(root, 'Program Files');
  const programFilesX86 = path.join(root, 'Program Files (x86)');
  const liveLog = path.join(programFiles, 'Roberts Space Industries', 'StarCitizen', 'LIVE', LOG_FILE_NAME);
  const ptuLog = path.join(programFilesX86, 'Steam', 'steamapps', 'common', 'Star Citizen', 'PTU', LOG_FILE_NAME);
  await writeGameLog(liveLog, 'LIVE');
  await writeGameLog(ptuLog, 'PTU');

  const discovery = await discoverRuntimeSources({
    platform: 'win32',
    env: {
      ProgramFiles: programFiles,
      'ProgramFiles(x86)': programFilesX86,
      ProgramW6432: ''
    },
    home: path.join(root, 'home'),
    now: NOW
  });

  assert.equal(discovery.summary.validCount, 2);
  assert.equal(discovery.summary.ambiguous, true);
  assert.equal(discovery.activeSource.channelHint, 'LIVE');
  assert.equal(discovery.activeSource.validation.isValid, true);
  assert.equal(JSON.stringify(discovery).includes(root), false, 'public discovery DTO must not expose private temp paths');
  assert.ok(discovery.sources.every((source) => !source.private), 'public DTO must omit privileged path material');
  assert.ok(discovery.sources.some((source) => source.installationKind === 'steam'));
  assert.ok(discovery.sources.some((source) => source.installationKind === 'rsi_launcher'));
});

test('discovers supported Linux LUG and Steam layouts and keeps channels distinct', async () => {
  const home = await makeTempDir();
  const lugLog = path.join(home, 'Games', 'star-citizen', 'drive_c', 'Program Files', 'Roberts Space Industries', 'StarCitizen', 'EPTU', LOG_FILE_NAME);
  const steamLog = path.join(home, '.local', 'share', 'Steam', 'steamapps', 'common', 'Star Citizen', 'HOTFIX', LOG_FILE_NAME);
  await writeGameLog(lugLog, 'EPTU');
  await writeGameLog(steamLog, 'HOTFIX');

  const discovery = await discoverRuntimeSources({
    platform: 'linux',
    home,
    now: NOW
  });

  const validChannels = discovery.sources
    .filter((source) => source.validation.isValid)
    .map((source) => source.channelHint)
    .sort();

  assert.deepEqual(validChannels, ['EPTU', 'HOTFIX']);
  assert.ok(discovery.sources.some((source) => source.installationKind === 'lug_wine'));
  assert.ok(discovery.sources.some((source) => source.installationKind === 'steam'));
});

test('supports non-default roots and restored preferences with revalidation-safe local persistence', async () => {
  const root = await makeTempDir();
  const customRoot = path.join(root, 'SecondaryDrive', 'RSI', 'StarCitizen');
  const hotfixLog = path.join(customRoot, 'HOTFIX', LOG_FILE_NAME);
  const preferencePath = path.join(root, 'settings', 'source-preference.json');
  await writeGameLog(hotfixLog, 'HOTFIX');

  const source = await validateLogSource(hotfixLog, {
    discoveryMethods: ['user_selected'],
    now: NOW
  });
  assert.equal(source.validation.isValid, true);
  await saveSourcePreference(preferencePath, source, { now: NOW });

  const preference = await loadSourcePreference(preferencePath);
  const discovery = await discoverRuntimeSources({
    platform: 'linux',
    home: path.join(root, 'home'),
    extraRoots: [customRoot],
    restoredSourcePath: preference.selectedSourcePath,
    now: NOW
  });

  assert.equal(discovery.activeSource.sourceId, source.sourceId);
  assert.equal(discovery.summary.selectionReason, 'restored_valid_preference');
  assert.equal(discovery.activeSource.channelHint, 'HOTFIX');
  assert.equal(JSON.stringify(discovery).includes('SecondaryDrive'), false, 'restored public DTO must remain privacy-safe');
});

test('revalidates moved restored preferences as missing instead of keeping approval', async () => {
  const root = await makeTempDir();
  const customRoot = path.join(root, 'ExternalLibrary', 'StarCitizen');
  const liveLog = path.join(customRoot, 'LIVE', LOG_FILE_NAME);
  const preferencePath = path.join(root, 'settings', 'source-preference.json');
  await writeGameLog(liveLog, 'LIVE');

  const source = await validateLogSource(liveLog, {
    discoveryMethods: ['user_selected'],
    now: NOW
  });
  await saveSourcePreference(preferencePath, source, { now: NOW });
  await fs.rename(liveLog, `${liveLog}.moved`);

  const preference = await loadSourcePreference(preferencePath);
  const discovery = await discoverRuntimeSources({
    platform: 'linux',
    home: path.join(root, 'home'),
    extraRoots: [customRoot],
    restoredSourcePath: preference.selectedSourcePath,
    now: NOW
  });
  const restored = discovery.sources.find((candidate) => candidate.discoveryMethods.includes('restored_setting'));

  assert.equal(discovery.activeSource, null);
  assert.equal(discovery.summary.selectionReason, 'no_valid_source');
  assert.equal(restored.validation.status, VALIDATION_STATUSES.MISSING);
  assert.equal(restored.validation.message.includes(root), false);
});

test('returns actionable validation states for missing, directory, malformed, and unsupported sources', async () => {
  const root = await makeTempDir();
  const missingSource = await validateLogSource(path.join(root, 'StarCitizen', 'LIVE', LOG_FILE_NAME), { now: NOW });
  assert.equal(missingSource.validation.status, VALIDATION_STATUSES.MISSING);

  const directoryPath = path.join(root, 'StarCitizen', 'PTU', LOG_FILE_NAME);
  await fs.mkdir(directoryPath, { recursive: true });
  const directorySource = await validateLogSource(directoryPath, { now: NOW });
  assert.equal(directorySource.validation.status, VALIDATION_STATUSES.NOT_FILE);

  const malformedPath = path.join(root, 'StarCitizen', 'EPTU', LOG_FILE_NAME);
  await fs.mkdir(path.dirname(malformedPath), { recursive: true });
  await fs.writeFile(malformedPath, 'this is a text file, not Star Citizen runtime log evidence');
  const malformedSource = await validateLogSource(malformedPath, { now: NOW });
  assert.equal(malformedSource.validation.status, VALIDATION_STATUSES.INVALID_LOG);

  const unsupportedPath = path.join(root, 'StarCitizen', 'TECH-PREVIEW', LOG_FILE_NAME);
  await writeGameLog(unsupportedPath, 'TECH-PREVIEW', '4.9.0-TECH-PREVIEW.9000000-SYNTH');
  const unsupportedSource = await validateLogSource(unsupportedPath, { now: NOW });
  assert.equal(unsupportedSource.validation.status, VALIDATION_STATUSES.UNSUPPORTED_CHANNEL);
  assert.equal(unsupportedSource.channelHint, 'UNKNOWN');
  assert.equal(unsupportedSource.rawChannel, 'TECH-PREVIEW');
});

test('returns a permission-denied validation state for unreadable game.log files', {
  skip: process.platform === 'win32' ? 'Windows runners do not make chmod(000) unreadable for the current user.' : false
}, async () => {
  const root = await makeTempDir();
  const unreadablePath = path.join(root, 'StarCitizen', 'LIVE', LOG_FILE_NAME);
  await writeGameLog(unreadablePath, 'LIVE');
  await fs.chmod(unreadablePath, 0o000);

  try {
    const source = await validateLogSource(unreadablePath, { now: NOW });
    assert.equal(source.validation.status, VALIDATION_STATUSES.PERMISSION_DENIED);
    assert.equal(source.validation.message.includes(root), false);
  } finally {
    await fs.chmod(unreadablePath, 0o600);
  }
});

test('does not recurse arbitrary filesystem roots while generating candidate paths', async () => {
  const root = await makeTempDir();
  const nestedLog = path.join(root, 'deep', 'nested', 'StarCitizen', 'LIVE', LOG_FILE_NAME);
  await writeGameLog(nestedLog, 'LIVE');

  const candidates = getCandidateLogPaths({ roots: [root] });

  assert.deepEqual(candidates.sort(), [
    path.join(root, 'EPTU', LOG_FILE_NAME),
    path.join(root, 'HOTFIX', LOG_FILE_NAME),
    path.join(root, 'LIVE', LOG_FILE_NAME),
    path.join(root, 'PTU', LOG_FILE_NAME)
  ].sort());
  assert.equal(candidates.includes(nestedLog), false);
});

test('public source DTOs and validation messages do not reveal private source paths', async () => {
  const root = await makeTempDir();
  const privateLog = path.join(root, 'Users', 'PRIVATE_PLAYER', 'SecretInstall', 'LIVE', LOG_FILE_NAME);
  await writeGameLog(privateLog, 'LIVE');

  const source = await validateLogSource(privateLog, {
    discoveryMethods: ['user_selected'],
    now: NOW
  });
  const publicSource = toPublicSource(source);
  const publicText = JSON.stringify(publicSource);

  assert.equal(source.validation.isValid, true);
  assert.equal(publicText.includes(root), false);
  assert.equal(publicText.includes('PRIVATE_PLAYER'), false);
  assert.equal(publicText.includes('SecretInstall'), false);
  assert.equal(source.validation.message.includes(root), false);
  assert.equal(source.validation.message.includes('PRIVATE_PLAYER'), false);
});

test('labels a persisted directory-selected source without exposing its filesystem path', async () => {
  const root = await makeTempDir();
  const selectedLog = path.join(root, 'StarCitizen', 'LIVE', LOG_FILE_NAME);
  await writeGameLog(selectedLog, 'LIVE');

  const source = await validateLogSource(selectedLog, {
    discoveryMethods: ['user_selected', 'directory_selected'],
    now: NOW
  });

  assert.equal(source.validation.isValid, true);
  assert.equal(source.displayLabel, 'LIVE install directory selected by user');
  assert.equal(toPublicSource(source).displayLabel.includes(root), false);
});

test('canonicalizes symlinked game.log selections before deriving source identity', {
  skip: process.platform === 'win32' ? 'Windows symlink identity behavior depends on runner privileges and filesystem policy.' : false
}, async () => {
  const root = await makeTempDir();
  const targetLog = path.join(root, 'StarCitizen', 'LIVE', LOG_FILE_NAME);
  const linkedRoot = path.join(root, 'SelectedLink');
  const linkedLog = path.join(linkedRoot, LOG_FILE_NAME);
  await writeGameLog(targetLog, 'LIVE');
  await fs.mkdir(linkedRoot, { recursive: true });
  await fs.symlink(targetLog, linkedLog);

  const targetSource = await validateLogSource(targetLog, { now: NOW });
  const linkedSource = await validateLogSource(linkedLog, { now: NOW });

  assert.equal(linkedSource.validation.isValid, true);
  assert.equal(linkedSource.sourceId, targetSource.sourceId);
  assert.ok(linkedSource.validation.evidenceMarkers.includes('canonicalized_symlink'));
});
