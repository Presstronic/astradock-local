const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const BACKUP_NAME_PATTERN = /^Game Build\((?<build>\d+)\) (?<date>\d{1,2} [A-Za-z]{3} \d{2}) \((?<time>\d{2} \d{2} \d{2})\)\.log$/i;
const DEFAULT_BLUEPRINT_LABELS = Object.freeze([
  'Received Blueprint',
  'Bauplan erhalten',
  'Bauplan überchoo'
]);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLabel(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
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
      rawLine: line
    };
  }
  return null;
}

function deriveBlueprintType(name) {
  const value = String(name || '').toLowerCase();
  if (/\b(pistol|rifle|shotgun|cannon|repeater|launcher|sniper|smg|gun)\b/.test(value)) return 'Weapon Gun';
  if (/\b(helmet|helm|armor|armour|undersuit|arms|legs|core|backpack)\b/.test(value)) return 'Armor';
  if (/\b(mining|tractor|multi-tool|multitool|salvage)\b/.test(value)) return 'Mining';
  if (/\b(mag|magazine|ammo|ammunition|battery)\b/.test(value)) return 'Ammo';
  if (/\b(med|medical|medpen|medgun)\b/.test(value)) return 'Medical';
  return '';
}

function normalizeBlueprint(record) {
  return {
    name: record.name,
    type: deriveBlueprintType(record.name),
    shared: null
  };
}

function backupLogInfo(fileName) {
  const match = BACKUP_NAME_PATTERN.exec(fileName);
  return match ? { build: match.groups.build, fileName } : null;
}

async function collectBlueprintLogFiles(sourcePath, options = {}) {
  const currentPath = path.resolve(sourcePath);
  const backupDirectory = path.join(path.dirname(currentPath), 'logbackups');
  const files = [{ path: currentPath, kind: 'current', build: null }];
  let skipped = 0;
  try {
    const entries = await fsp.readdir(backupDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) { skipped += 1; continue; }
      const info = backupLogInfo(entry.name);
      if (!info) { skipped += 1; continue; }
      files.push({ path: path.join(backupDirectory, entry.name), kind: 'backup', build: info.build, fileName: entry.name });
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    skipped += 1;
  }
  files.sort((left, right) => left.kind.localeCompare(right.kind) || left.path.localeCompare(right.path));
  return { files, backupDirectory, skipped };
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
  const patterns = compileBlueprintPatterns(options.labels);
  const observations = [];
  const errors = [];
  let linesRead = 0;
  let filesScanned = 0;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

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
    try {
      if (!build) build = buildFromHeader(await readFirstLine(file.path));
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
            if (parsed) observations.push({ ...parsed, sourceFile: file.fileName || path.basename(file.path), sourceKind: file.kind, gameBuild: build });
          }
        });
        input.on('end', () => {
          if (remainder) {
            linesRead += 1;
            const parsed = parseBlueprintNotification(remainder, { patterns });
            if (parsed) observations.push({ ...parsed, sourceFile: file.fileName || path.basename(file.path), sourceKind: file.kind, gameBuild: build });
          }
          resolve();
        });
        input.on('error', reject);
      });
      filesScanned += 1;
    } catch (error) {
      errors.push({ file: file.fileName || path.basename(file.path), code: error.code || 'read_failed', message: 'The log could not be read.' });
    }
  }

  onProgress({ phase: 'deduplicating', filesProcessed: filesScanned, filesTotal: sourceSet.files.length });
  const unique = new Map();
  for (const observation of observations) {
    const record = normalizeBlueprint(observation);
    const key = record.name.trim().toLocaleLowerCase();
    if (!unique.has(key)) unique.set(key, { record, observation, observations: 1 });
    else unique.get(key).observations += 1;
  }
  const records = [...unique.values()]
    .sort((left, right) => left.record.name.localeCompare(right.record.name))
    .map((entry) => entry.record);
  return {
    records,
    observations: [...unique.values()].map((entry) => ({ ...entry.observation, duplicateObservations: entry.observations - 1 })),
    files: sourceSet.files.map((file) => ({ file: file.fileName || path.basename(file.path), kind: file.kind, build: file.build })),
    filesScanned,
    filesTotal: sourceSet.files.length,
    linesRead,
    duplicatesSuppressed: Math.max(0, observations.length - records.length),
    skippedFiles: sourceSet.skipped,
    errors,
    matched: observations.length > 0
  };
}

async function writeBlueprintJson(filePath, records) {
  const destination = path.resolve(filePath);
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    await fsp.writeFile(temporary, `${JSON.stringify(records, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await fsp.rename(temporary, destination);
  } catch (error) {
    try { await fsp.unlink(temporary); } catch (cleanupError) { if (cleanupError.code !== 'ENOENT') error.cleanupError = cleanupError; }
    throw error;
  }
  return destination;
}

module.exports = {
  BACKUP_NAME_PATTERN,
  DEFAULT_BLUEPRINT_LABELS,
  backupLogInfo,
  collectBlueprintLogFiles,
  compileBlueprintPatterns,
  deriveBlueprintType,
  normalizeBlueprint,
  parseBlueprintNotification,
  scanBlueprintLogs,
  writeBlueprintJson
};
