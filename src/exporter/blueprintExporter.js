const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const BACKUP_NAME_PATTERN = /^Game\s+Build\s*\(\s*(?<build>\d+)\s*\)\s+(?<date>\d{1,2}\s+[A-Za-z]{3}\s+\d{2})\s+\(\s*(?<time>\d{2}\s+\d{2}\s+\d{2})\s*\)(?:\.[^.]+)?\.log$/i;
const DEFAULT_BLUEPRINT_LABELS = Object.freeze([
  'Received Blueprint',
  'Bauplan erhalten',
  'Bauplan überchoo'
]);
const BLUEPRINT_EXTRACTION_CONTRACT_VERSION = 1;
const BLUEPRINT_PARSER_VERSION = 'blueprint-notification-v1';
const BLUEPRINT_CSV_COLUMNS = Object.freeze(['name', 'type', 'shared']);
const UNSUPPORTED_PROFILE = Object.freeze({
  status: 'unsupported',
  profileId: null,
  version: null,
  labels: Object.freeze([]),
  reason: 'No owner-approved blueprint evidence profile is available for this build or locale.'
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLabel(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function createBlueprintExtractionProfile(options = {}) {
  const profile = options.profile;
  if (!profile || profile.status !== 'approved' || !Array.isArray(profile.labels) || !profile.labels.length) {
    return UNSUPPORTED_PROFILE;
  }
  return Object.freeze({
    status: 'approved',
    profileId: String(profile.profileId || 'blueprint-notification'),
    version: Number(profile.version || BLUEPRINT_EXTRACTION_CONTRACT_VERSION),
    build: profile.build == null ? null : String(profile.build),
    builds: Object.freeze(Array.isArray(profile.builds) ? profile.builds.map(String) : profile.build == null ? [] : [String(profile.build)]),
    locale: profile.locale == null ? null : String(profile.locale),
    labels: Object.freeze([...new Set(profile.labels.map(normalizeLabel).filter(Boolean))]),
    reason: null
  });
}

function isProfileCompatible(profile, build) {
  return profile.status === 'approved' && profile.builds.length > 0 && build != null
    ? profile.builds.includes(String(build))
    : profile.status === 'approved' && profile.builds.length === 0;
}

function compileBlueprintPatterns(labels = DEFAULT_BLUEPRINT_LABELS) {
  return [...new Set(labels.map(normalizeLabel).filter(Boolean))].map((label) => ({
    label,
    regex: new RegExp(
      `Added notification "${escapeRegExp(label)}\\s*:\\s*([\\s\\S]*?):\\s*"\\s*\\[(\\d+)\\]\\s+to queue\\.`,
      'i'
    )
  }));
}

function parseBlueprintNotification(line, options = {}) {
  if (typeof line !== 'string' || !line.includes('Added notification')) return null;
  const patterns = options.patterns || compileBlueprintPatterns(options.labels);
  for (const pattern of patterns) {
    const match = pattern.regex.exec(line);
    if (!match) continue;
    const name = match[1].trim();
    if (!name) return null;
    const timestamp = /^<([^>]+)>/.exec(line)?.[1] || null;
    return {
      name,
      notificationId: Number(match[2]),
      label: pattern.label,
      timestamp,
      parserVersion: BLUEPRINT_PARSER_VERSION
    };
  }
  return null;
}

function normalizeBlueprint(record) {
  const name = normalizeLabel(record.name);
  if (!name) return null;
  return {
    name,
    type: typeof record.type === 'string' ? record.type.trim() : '',
    shared: typeof record.shared === 'boolean' ? record.shared : null
  };
}

function backupLogInfo(fileName) {
  const match = BACKUP_NAME_PATTERN.exec(fileName);
  return match ? {
    build: match.groups.build,
    date: match.groups.date.replace(/\s+/g, ' '),
    time: match.groups.time.replace(/\s+/g, ' '),
    fileName
  } : null;
}

async function collectBlueprintLogFiles(sourcePath, options = {}) {
  const currentPath = path.resolve(sourcePath);
  const backupDirectory = path.join(path.dirname(currentPath), 'logbackups');
  const diagnostics = [];
  const files = [];
  const current = await inspectSourceFile({ path: currentPath, kind: 'current', build: null, fileName: path.basename(currentPath) });
  if (current.status === 'ready' || current.status === 'missing' || current.status === 'inaccessible') files.push(current);
  else diagnostics.push(current);

  try {
    const entries = await fsp.readdir(backupDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        diagnostics.push({ file: entry.name, kind: entry.isDirectory() ? 'directory' : 'other', status: 'skipped', reason: 'not_a_file' });
        continue;
      }
      const info = backupLogInfo(entry.name);
      if (!info) {
        diagnostics.push({ file: entry.name, kind: 'backup', status: 'skipped', reason: 'malformed_backup_name' });
        continue;
      }
      const inspected = await inspectSourceFile({ path: path.join(backupDirectory, entry.name), kind: 'backup', build: info.build, fileName: entry.name, date: info.date, time: info.time });
      if (inspected.status === 'ready' || inspected.status === 'missing' || inspected.status === 'inaccessible') files.push(inspected);
      else diagnostics.push(inspected);
    }
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') diagnostics.push({ file: 'logbackups', kind: 'directory', status: 'missing', reason: 'backup_directory_missing' });
    else diagnostics.push({ file: 'logbackups', kind: 'directory', status: 'inaccessible', reason: 'backup_directory_unreadable', code: error.code || 'readdir_failed' });
  }
  files.sort(compareSourceFiles);
  const fingerprint = createSourceSetFingerprint(files);
  return { files, backupDirectory, diagnostics, skipped: diagnostics.length, fingerprint };
}

async function inspectSourceFile(file) {
  try {
    const stat = await fsp.stat(file.path);
    if (!stat.isFile()) return { ...file, status: 'skipped', reason: 'not_a_file' };
    return { ...file, status: 'ready', size: stat.size, modifiedAt: stat.mtimeMs, fingerprint: `${stat.size}:${stat.mtimeMs}` };
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return { ...file, status: 'missing', reason: 'file_missing', code: error.code };
    if (error.code === 'EACCES' || error.code === 'EPERM') return { ...file, status: 'inaccessible', reason: 'permission_denied', code: error.code };
    return { ...file, status: 'inaccessible', reason: 'stat_failed', code: error.code || 'stat_failed' };
  }
}

function compareSourceFiles(left, right) {
  const kindDelta = (left.kind === 'current' ? 0 : 1) - (right.kind === 'current' ? 0 : 1);
  return kindDelta || String(left.fileName).localeCompare(String(right.fileName), 'en', { numeric: true }) || String(left.path).localeCompare(String(right.path));
}

function createSourceSetFingerprint(files) {
  const crypto = require('node:crypto');
  return `set_${crypto.createHash('sha256').update(files.map((file) => `${file.kind}:${file.fileName}:${file.fingerprint || file.status}`).join('|')).digest('hex').slice(0, 24)}`;
}

async function readFirstLine(filePath) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const input = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 4096 });
    let buffer = '';
    const finish = (value, error) => {
      if (settled) return;
      settled = true;
      input.destroy();
      error ? reject(error) : resolve(value);
    };
    input.on('data', (chunk) => {
      buffer += chunk;
      const end = buffer.indexOf('\n');
      if (end >= 0) finish(buffer.slice(0, end).replace(/\r$/, ''));
      else if (buffer.length > 64 * 1024) finish(buffer.slice(0, 64 * 1024));
    });
    input.on('end', () => finish(buffer));
    input.on('error', (error) => finish(null, error));
  });
}

function buildFromHeader(line) {
  return /Build\((\d+)\)/i.exec(line || '')?.[1] || null;
}

async function scanBlueprintLogs(sourcePath, options = {}) {
  const sourceSet = await collectBlueprintLogFiles(sourcePath, options);
  const profile = createBlueprintExtractionProfile(options);
  const patterns = compileBlueprintPatterns(profile.labels);
  const observations = new Map();
  const errors = [];
  const extractionDiagnostics = [];
  let linesRead = 0;
  let filesScanned = 0;
  let compatibleFiles = 0;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const noteUnsupportedLine = () => {
    const existing = extractionDiagnostics.find((entry) => entry.code === 'unrecognized_notification');
    if (existing) existing.count += 1;
    else extractionDiagnostics.push({ code: 'unrecognized_notification', message: 'A blueprint-like notification did not match the approved profile shape.', count: 1 });
  };

  if (profile.status !== 'approved') {
    return {
      records: [], observations: [], files: sourceSet.files.map((file) => ({ file: file.fileName || path.basename(file.path), kind: file.kind, build: file.build, status: file.status, fingerprint: file.fingerprint || null })),
      filesScanned: 0, filesTotal: sourceSet.files.length, linesRead: 0, duplicatesSuppressed: 0,
      skippedFiles: sourceSet.skipped, sourceFingerprint: sourceSet.fingerprint, diagnostics: sourceSet.diagnostics,
      extraction: { status: 'unsupported', profileId: null, profileVersion: null, parserVersion: BLUEPRINT_PARSER_VERSION, reason: profile.reason },
      errors: [], matched: false
    };
  }

  for (let index = 0; index < sourceSet.files.length; index += 1) {
    if (options.shouldCancel?.()) {
      const error = new Error('Export cancelled.');
      error.code = 'export_cancelled';
      throw error;
    }
    const file = sourceSet.files[index];
    const progress = { phase: 'scanning', currentFile: file.fileName || path.basename(file.path), filesProcessed: index, filesTotal: sourceSet.files.length };
    onProgress(progress);
    let build = file.build;
    if (file.status !== 'ready') {
      errors.push({ file: file.fileName, code: file.code || file.status, message: file.status === 'missing' ? 'The log was not found during scanning.' : 'The log could not be accessed.' });
      continue;
    }
    try {
      if (!build) build = buildFromHeader(await readFirstLine(file.path));
      if (!isProfileCompatible(profile, build)) {
        extractionDiagnostics.push({ code: 'unsupported_profile', message: `No approved blueprint profile matches build ${build || 'unknown'}.` });
        errors.push({ file: file.fileName, code: 'unsupported_profile', message: 'The log build is not covered by the approved blueprint extraction profile.' });
        continue;
      }
      compatibleFiles += 1;
      await new Promise((resolve, reject) => {
        const input = fs.createReadStream(file.path, { encoding: 'utf8' });
        let remainder = '';
        input.on('data', (chunk) => {
          const lines = `${remainder}${chunk}`.split(/\r?\n/);
          remainder = lines.pop() || '';
          for (const line of lines) {
            if (options.shouldCancel?.()) {
              input.destroy(Object.assign(new Error('Export cancelled.'), { code: 'export_cancelled' }));
              return;
            }
            linesRead += 1;
            const parsed = parseBlueprintNotification(line, { patterns });
            if (parsed) addObservation(observations, { ...parsed, sourceFile: file.fileName || path.basename(file.path), sourceKind: file.kind, gameBuild: build, profile });
            else if (line.includes('Added notification')) noteUnsupportedLine();
          }
        });
        input.on('end', () => {
          if (remainder) {
            linesRead += 1;
            const parsed = parseBlueprintNotification(remainder, { patterns });
            if (parsed) addObservation(observations, { ...parsed, sourceFile: file.fileName || path.basename(file.path), sourceKind: file.kind, gameBuild: build, profile });
            else if (remainder.includes('Added notification')) noteUnsupportedLine();
          }
          resolve();
        });
        input.on('error', reject);
      });
      filesScanned += 1;
      const after = await inspectSourceFile(file);
      if (after.status !== 'ready' || after.fingerprint !== file.fingerprint) {
        errors.push({ file: file.fileName, code: 'source_changed', message: 'The log changed while it was being scanned; results may be partial.' });
      }
    } catch (error) {
      errors.push({ file: file.fileName || path.basename(file.path), code: error.code || 'read_failed', message: 'The log could not be read.' });
    }
  }

  onProgress({ phase: 'deduplicating', filesProcessed: filesScanned, filesTotal: sourceSet.files.length });
  const records = [...observations.values()]
    .sort((left, right) => left.record.name.localeCompare(right.record.name))
    .map((entry) => entry.record);
  return {
    records,
    observations: [...observations.values()].map((entry) => ({ ...entry.observation, duplicateObservations: entry.duplicateObservations })),
    files: sourceSet.files.map((file) => ({ file: file.fileName || path.basename(file.path), kind: file.kind, build: file.build, status: file.status, fingerprint: file.fingerprint || null })),
    filesScanned,
    filesTotal: sourceSet.files.length,
    linesRead,
    duplicatesSuppressed: [...observations.values()].reduce((total, entry) => total + entry.duplicateObservations, 0),
    skippedFiles: sourceSet.skipped,
    sourceFingerprint: sourceSet.fingerprint,
    diagnostics: sourceSet.diagnostics,
    errors,
    extraction: { status: compatibleFiles > 0 ? 'approved' : 'unsupported', profileId: compatibleFiles > 0 ? profile.profileId : null, profileVersion: compatibleFiles > 0 ? profile.version : null, parserVersion: BLUEPRINT_PARSER_VERSION, reason: compatibleFiles > 0 ? undefined : 'No scanned file matched the approved build profile.', diagnostics: extractionDiagnostics },
    matched: observations.size > 0
  };
}

function addObservation(observations, observation) {
  const record = normalizeBlueprint(observation);
  if (!record) return;
  const key = record.name.normalize('NFKC').toLocaleLowerCase('en-US');
  const existing = observations.get(key);
  if (existing) existing.duplicateObservations += 1;
  else observations.set(key, {
    record,
    observation: {
      sourceFile: observation.sourceFile,
      sourceKind: observation.sourceKind,
      timestamp: observation.timestamp,
      gameBuild: observation.gameBuild || null,
      parserVersion: BLUEPRINT_PARSER_VERSION,
      profileId: observation.profile.profileId,
      confidence: 'observed-name-only'
    },
    duplicateObservations: 0
  });
}

function serializeBlueprintCsv(records) {
  const escapeCell = (value) => {
    const text = value == null ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = [BLUEPRINT_CSV_COLUMNS.join(',')];
  for (const record of records || []) {
    rows.push([
      record?.name || '',
      record?.type || '',
      record?.shared == null ? '' : Boolean(record.shared) ? 'true' : 'false'
    ].map(escapeCell).join(','));
  }
  return `${rows.join('\r\n')}\r\n`;
}

async function writeAtomicText(filePath, text) {
  const destination = path.resolve(filePath);
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    await fsp.writeFile(temporary, text, { encoding: 'utf8', mode: 0o600 });
    await fsp.rename(temporary, destination);
  } catch (error) {
    try { await fsp.unlink(temporary); } catch (cleanupError) { if (cleanupError.code !== 'ENOENT') error.cleanupError = cleanupError; }
    throw error;
  }
  return destination;
}

async function writeBlueprintJson(filePath, records) {
  return writeAtomicText(filePath, `${JSON.stringify(records, null, 2)}\n`);
}

async function writeBlueprintCsv(filePath, records) {
  return writeAtomicText(filePath, serializeBlueprintCsv(records));
}

module.exports = {
  BACKUP_NAME_PATTERN,
  DEFAULT_BLUEPRINT_LABELS,
  BLUEPRINT_EXTRACTION_CONTRACT_VERSION,
  BLUEPRINT_PARSER_VERSION,
  BLUEPRINT_CSV_COLUMNS,
  createBlueprintExtractionProfile,
  backupLogInfo,
  collectBlueprintLogFiles,
  compileBlueprintPatterns,
  normalizeBlueprint,
  parseBlueprintNotification,
  scanBlueprintLogs,
  serializeBlueprintCsv,
  writeBlueprintCsv,
  writeBlueprintJson
};
