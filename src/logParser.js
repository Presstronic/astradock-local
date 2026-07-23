const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const LOG_FILE_NAME = 'game.log';
const CONTEXT_RADIUS = 6;

function expandHome(value) {
  if (!value || !value.startsWith('~')) return value;
  return path.join(os.homedir(), value.slice(1));
}

function getDefaultLogCandidates() {
  const home = os.homedir();
  const candidates = [];

  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    candidates.push(
      path.join(programFiles, 'Roberts Space Industries', 'StarCitizen', 'LIVE', LOG_FILE_NAME),
      path.join(programFiles, 'Roberts Space Industries', 'StarCitizen', 'PTU', LOG_FILE_NAME),
      path.join(programFiles, 'Roberts Space Industries', 'StarCitizen', 'EPTU', LOG_FILE_NAME),
      path.join(programFiles, 'Roberts Space Industries', 'StarCitizen', 'TECH-PREVIEW', LOG_FILE_NAME),
      path.join(programFilesX86, 'Steam', 'steamapps', 'common', 'Star Citizen', 'LIVE', LOG_FILE_NAME)
    );
  } else {
    candidates.push(
      path.join(home, 'Games', 'star-citizen', 'drive_c', 'Program Files', 'Roberts Space Industries', 'StarCitizen', 'LIVE', LOG_FILE_NAME),
      path.join(home, '.local', 'share', 'Steam', 'steamapps', 'common', 'Star Citizen', 'LIVE', LOG_FILE_NAME),
      path.join(home, '.steam', 'steam', 'steamapps', 'common', 'Star Citizen', 'LIVE', LOG_FILE_NAME),
      path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam', 'steamapps', 'common', 'Star Citizen', 'LIVE', LOG_FILE_NAME)
    );
  }

  return candidates.map(expandHome);
}

async function findExistingLogPath() {
  const candidates = getDefaultLogCandidates();
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      // Keep checking other common install locations.
    }
  }
  return null;
}

function parseLogTimestamp(line) {
  const iso = line.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:[.,]\d+)?/);
  if (iso) return `${iso[1]} ${iso[2]}`;

  const bracket = line.match(/<(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)>/);
  if (bracket) return bracket[1];

  return null;
}

function pickValue(line, patterns) {
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match?.groups?.value) return cleanValue(match.groups.value);
  }
  return null;
}

function cleanValue(value) {
  return String(value)
    .trim()
    .replace(/^[=:>"'\s]+/, '')
    .replace(/[<,"')\]}]+$/, '')
    .trim();
}

function extractShardInfoFromLine(line) {
  const shardId = pickValue(line, [
    /\bShardID\b\s*[:=]\s*(?<value>[A-Za-z0-9_.:-]+)/i,
    /\bShardId\b\s*[:=]\s*(?<value>[A-Za-z0-9_.:-]+)/i,
    /\bshard_id\b["'\s:=]+(?<value>[A-Za-z0-9_.:-]+)/i,
    /\bshardId\b["'\s:=]+(?<value>[A-Za-z0-9_.:-]+)/i,
    /\bshard\b\s*[:=]\s*(?<value>[A-Za-z0-9_.:-]+)/i
  ]);

  const shardName = pickValue(line, [
    /\bShardName\b\s*[:=]\s*(?<value>[^,;\]\)<]+?)(?=\s+\b[A-Za-z_]+(?:\s*[:=]|["'\s:=])|$)/i,
    /\bshard_name\b["'\s:=]+(?<value>[^,;\]\)<]+)/i,
    /\bshardName\b["'\s:=]+(?<value>[^,;\]\)<]+)/i,
    /\bServerName\b\s*[:=]\s*(?<value>[^,;\]\)<]+?)(?=\s+\b[A-Za-z_]+(?:\s*[:=]|["'\s:=])|$)/i,
    /\bserver_name\b["'\s:=]+(?<value>[^,;\]\)<]+)/i
  ]);

  const region = pickValue(line, [
    /\bRegion\b\s*[:=]\s*(?<value>[A-Za-z0-9_.:-]+)/i,
    /\bregion\b["'\s:=]+(?<value>[A-Za-z0-9_.:-]+)/i
  ]);

  const build = pickValue(line, [
    /\bBuild\b\s*[:=]\s*(?<value>[A-Za-z0-9_.:-]+)/i,
    /\bbuild_version\b["'\s:=]+(?<value>[A-Za-z0-9_.:-]+)/i
  ]);

  if (!shardId && !shardName) return null;
  return { shardId, shardName, region, build };
}

function mergeContext(lines, centerIndex) {
  const start = Math.max(0, centerIndex - CONTEXT_RADIUS);
  const end = Math.min(lines.length - 1, centerIndex + CONTEXT_RADIUS);
  const contextLines = lines.slice(start, end + 1);
  const info = {};

  for (const contextLine of contextLines) {
    Object.assign(info, compactObject(extractShardInfoFromLine(contextLine) || {}));
  }

  return {
    ...info,
    rawContext: contextLines
  };
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry));
}

function parseShardEntries(logText) {
  const lines = logText.split(/\r?\n/);
  const entries = [];
  let lastTimestamp = null;

  lines.forEach((line, index) => {
    const timestamp = parseLogTimestamp(line);
    if (timestamp) lastTimestamp = timestamp;

    if (!/shard/i.test(line) && !/\bserver[_ ]?name\b/i.test(line)) return;

    const directInfo = extractShardInfoFromLine(line);
    if (!directInfo) return;

    const contextInfo = mergeContext(lines, index);
    entries.push({
      id: `${index}-${directInfo.shardId || directInfo.shardName}`,
      lineNumber: index + 1,
      firstSeen: timestamp || lastTimestamp,
      lastSeen: timestamp || lastTimestamp,
      shardId: directInfo.shardId || contextInfo.shardId || null,
      shardName: directInfo.shardName || contextInfo.shardName || null,
      region: directInfo.region || contextInfo.region || null,
      build: directInfo.build || contextInfo.build || null,
      rawLine: line.trim(),
      rawContext: contextInfo.rawContext.map((contextLine) => contextLine.trim()).filter(Boolean)
    });
  });

  return dedupeEntries(entries);
}

function dedupeEntries(entries) {
  const byShard = new Map();

  for (const entry of entries) {
    const key = `${entry.shardId || 'unknown'}::${entry.shardName || 'unknown'}`;
    const existing = byShard.get(key);
    if (!existing) {
      byShard.set(key, entry);
      continue;
    }

    byShard.set(key, {
      ...existing,
      ...compactObject({
        lastSeen: entry.lastSeen || existing.lastSeen,
        region: existing.region || entry.region,
        build: existing.build || entry.build,
        shardId: existing.shardId || entry.shardId,
        shardName: existing.shardName || entry.shardName
      }),
      rawContext: Array.from(new Set([...existing.rawContext, ...entry.rawContext])).slice(-20)
    });
  }

  return Array.from(byShard.values()).sort((left, right) => {
    const leftTime = Date.parse(left.lastSeen || '') || 0;
    const rightTime = Date.parse(right.lastSeen || '') || 0;
    return rightTime - leftTime || right.lineNumber - left.lineNumber;
  });
}

async function parseLogFile(logPath) {
  const text = await fs.readFile(logPath, 'utf8');
  const stat = await fs.stat(logPath);
  return {
    logPath,
    scannedAt: new Date().toISOString(),
    modifiedAt: stat.mtime.toISOString(),
    entries: parseShardEntries(text)
  };
}

module.exports = {
  findExistingLogPath,
  getDefaultLogCandidates,
  parseLogFile,
  parseShardEntries
};
