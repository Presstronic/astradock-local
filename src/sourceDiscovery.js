const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const LOG_FILE_NAME = 'game.log';
const SOURCE_PREFERENCE_VERSION = 1;
const SUPPORTED_CHANNELS = Object.freeze(['LIVE', 'PTU', 'EPTU', 'HOTFIX']);
const CHANNEL_PRIORITY = Object.freeze(new Map(SUPPORTED_CHANNELS.map((channel, index) => [channel, index])));
const VALIDATION_STATUSES = Object.freeze({
  VALID: 'valid',
  MISSING: 'missing',
  INACCESSIBLE: 'inaccessible',
  PERMISSION_DENIED: 'permission_denied',
  NOT_FILE: 'not_file',
  INVALID_LOG: 'invalid_log',
  UNSUPPORTED_CHANNEL: 'unsupported_channel'
});

const SOURCE_KIND = 'game_log';

function expandHome(value, home = os.homedir()) {
  if (!value || !String(value).startsWith('~')) return value;
  if (value === '~') return home;
  if (String(value).startsWith(`~${path.sep}`)) return path.join(home, String(value).slice(2));
  return value;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseConfiguredRoots(env = process.env) {
  return String(env.ASTRADOCK_STAR_CITIZEN_ROOTS || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getDefaultInstallationRoots(options = {}) {
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const home = options.home || os.homedir();
  const configuredRoots = parseConfiguredRoots(env).concat(options.extraRoots || []);

  const roots = [];
  if (platform === 'win32') {
    const programFiles = env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const programW6432 = env.ProgramW6432 || '';
    roots.push(
      path.join(programFiles, 'Roberts Space Industries', 'StarCitizen'),
      path.join(programFilesX86, 'Roberts Space Industries', 'StarCitizen'),
      programW6432 ? path.join(programW6432, 'Roberts Space Industries', 'StarCitizen') : null,
      path.join(programFilesX86, 'Steam', 'steamapps', 'common', 'Star Citizen'),
      path.join(programFiles, 'Steam', 'steamapps', 'common', 'Star Citizen')
    );
  } else {
    roots.push(
      path.join(home, 'Games', 'star-citizen', 'drive_c', 'Program Files', 'Roberts Space Industries', 'StarCitizen'),
      path.join(home, 'Games', 'star-citizen', 'drive_c', 'Program Files (x86)', 'Roberts Space Industries', 'StarCitizen'),
      path.join(home, '.local', 'share', 'Steam', 'steamapps', 'common', 'Star Citizen'),
      path.join(home, '.steam', 'steam', 'steamapps', 'common', 'Star Citizen'),
      path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam', 'steamapps', 'common', 'Star Citizen')
    );
  }

  return unique(roots.concat(configuredRoots))
    .map((root) => expandHome(root, home))
    .filter(Boolean)
    .map((root) => path.resolve(root));
}

function getCandidateLogPaths(options = {}) {
  const roots = options.roots || getDefaultInstallationRoots(options);
  const channels = options.channels || SUPPORTED_CHANNELS;
  const candidates = [];

  for (const root of roots) {
    const resolvedRoot = path.resolve(expandHome(root, options.home || os.homedir()));
    const rootBase = path.basename(resolvedRoot).toUpperCase();
    if (rootBase === LOG_FILE_NAME.toUpperCase()) {
      candidates.push(resolvedRoot);
      continue;
    }
    if (channels.includes(rootBase)) {
      candidates.push(path.join(resolvedRoot, LOG_FILE_NAME));
      continue;
    }
    for (const channel of channels) {
      candidates.push(path.join(resolvedRoot, channel, LOG_FILE_NAME));
    }
  }

  return unique(candidates);
}

async function discoverRuntimeSources(options = {}) {
  const discoveredPaths = getCandidateLogPaths(options);
  const restoredPath = options.restoredSourcePath || null;
  const candidateInputs = discoveredPaths.map((sourcePath) => ({
    sourcePath,
    discoveryMethod: 'automatic'
  }));

  if (restoredPath) {
    candidateInputs.push({
      sourcePath: restoredPath,
      discoveryMethod: 'restored_setting'
    });
  }

  const sources = await validateCandidateInputs(candidateInputs, options);
  const activeSource = selectActiveSource(sources);
  const validCount = sources.filter((source) => source.validation.isValid).length;

  return {
    sources: sources.map((source) => options.includePrivate ? source : toPublicSource(source)),
    activeSource: activeSource ? (options.includePrivate ? activeSource : toPublicSource(activeSource)) : null,
    summary: {
      checkedAt: options.now || new Date().toISOString(),
      candidateCount: sources.length,
      validCount,
      ambiguous: validCount > 1,
      selectionReason: activeSource ? getSelectionReason(sources, activeSource) : 'no_valid_source'
    }
  };
}

async function validateCandidateInputs(candidateInputs, options = {}) {
  const byCanonicalCandidate = new Map();

  for (const input of candidateInputs) {
    const sourcePath = path.resolve(expandHome(input.sourcePath, options.home || os.homedir()));
    const key = normalizePathForIdentity(sourcePath);
    const existing = byCanonicalCandidate.get(key);
    if (existing) {
      existing.discoveryMethods = unique(existing.discoveryMethods.concat(input.discoveryMethod));
      continue;
    }
    byCanonicalCandidate.set(key, {
      sourcePath,
      discoveryMethods: [input.discoveryMethod]
    });
  }

  const sources = await Promise.all(Array.from(byCanonicalCandidate.values()).map((input) => (
    validateLogSource(input.sourcePath, {
      ...options,
      discoveryMethods: input.discoveryMethods
    })
  )));

  return sources.sort(compareSources);
}

async function validateLogSource(sourcePath, options = {}) {
  const checkedAt = options.now || new Date().toISOString();
  const requestedPath = path.resolve(expandHome(sourcePath, options.home || os.homedir()));
  const discoveryMethods = options.discoveryMethods || [options.discoveryMethod || 'user_selected'];
  const pathChannelHint = inferChannelFromPath(requestedPath);
  const sourceId = createSourceId(requestedPath);
  const base = {
    sourceId,
    sourceKind: SOURCE_KIND,
    discoveryMethods,
    displayLabel: formatDisplayLabel(pathChannelHint, discoveryMethods),
    displayPath: formatDisplayPath(pathChannelHint),
    channelHint: pathChannelHint || 'UNKNOWN',
    channelConfidence: pathChannelHint ? 'path_hint' : 'unknown',
    buildVersion: null,
    environmentName: null,
    installationKind: inferInstallationKind(requestedPath),
    platformHint: options.platform || process.platform,
    private: {
      sourcePath: requestedPath,
      canonicalPath: requestedPath
    }
  };

  let lstat;
  try {
    lstat = await fs.lstat(requestedPath);
  } catch (error) {
    return withValidation(base, {
      status: mapStatError(error),
      checkedAt,
      evidenceMarkers: [],
      message: formatValidationMessage(mapStatError(error), base)
    });
  }

  let canonicalPath = requestedPath;
  let stat = lstat;
  const evidenceMarkers = [];
  try {
    if (lstat.isSymbolicLink()) {
      canonicalPath = await fs.realpath(requestedPath);
      stat = await fs.stat(canonicalPath);
      evidenceMarkers.push('canonicalized_symlink');
    }
  } catch (error) {
    return withValidation({
      ...base,
      private: { sourcePath: requestedPath, canonicalPath }
    }, {
      status: mapStatError(error),
      checkedAt,
      evidenceMarkers,
      message: formatValidationMessage(mapStatError(error), base)
    });
  }

  const canonicalBase = {
    ...base,
    sourceId: createSourceId(canonicalPath),
    private: {
      sourcePath: requestedPath,
      canonicalPath
    }
  };

  if (!stat.isFile()) {
    return withValidation(canonicalBase, {
      status: VALIDATION_STATUSES.NOT_FILE,
      checkedAt,
      evidenceMarkers,
      message: formatValidationMessage(VALIDATION_STATUSES.NOT_FILE, canonicalBase)
    });
  }

  if (path.basename(canonicalPath).toLowerCase() !== LOG_FILE_NAME) {
    return withValidation(canonicalBase, {
      status: VALIDATION_STATUSES.INVALID_LOG,
      checkedAt,
      evidenceMarkers: evidenceMarkers.concat('unexpected_file_name'),
      message: formatValidationMessage(VALIDATION_STATUSES.INVALID_LOG, canonicalBase)
    });
  }

  let sample;
  try {
    sample = await readLogEvidenceSample(canonicalPath, stat.size);
  } catch (error) {
    return withValidation(canonicalBase, {
      status: mapReadError(error),
      checkedAt,
      evidenceMarkers,
      message: formatValidationMessage(mapReadError(error), canonicalBase)
    });
  }

  const evidence = extractGameLogEvidence(sample, canonicalPath);
  const rawChannel = evidence.rawChannel || pathChannelHint || 'UNKNOWN';
  const normalizedChannel = normalizeSupportedChannel(rawChannel);
  const hasExpectedEvidence = evidence.markers.length > 0;
  const status = !hasExpectedEvidence
    ? VALIDATION_STATUSES.INVALID_LOG
    : normalizedChannel === 'UNKNOWN' && rawChannel !== 'UNKNOWN'
      ? VALIDATION_STATUSES.UNSUPPORTED_CHANNEL
      : VALIDATION_STATUSES.VALID;

  const source = {
    ...canonicalBase,
    displayLabel: formatDisplayLabel(normalizedChannel, discoveryMethods),
    displayPath: formatDisplayPath(normalizedChannel),
    channelHint: normalizedChannel,
    channelConfidence: evidence.rawChannel ? 'observed' : pathChannelHint ? 'path_hint' : 'unknown',
    rawChannel,
    buildVersion: evidence.buildVersion || null,
    environmentName: evidence.environmentName || null
  };

  return withValidation(source, {
    status,
    checkedAt,
    evidenceMarkers: evidenceMarkers.concat(evidence.markers),
    message: formatValidationMessage(status, source)
  });
}

function withValidation(source, validation) {
  const isValid = validation.status === VALIDATION_STATUSES.VALID;
  return {
    ...source,
    validation: {
      status: validation.status,
      isValid,
      checkedAt: validation.checkedAt,
      message: validation.message,
      evidenceMarkers: validation.evidenceMarkers || []
    }
  };
}

async function readLogEvidenceSample(filePath, size) {
  const maxSingleRead = 1024 * 1024;
  if (size <= maxSingleRead) return fs.readFile(filePath, 'utf8');

  const handle = await fs.open(filePath, 'r');
  try {
    const headLength = 384 * 1024;
    const tailLength = 128 * 1024;
    const head = Buffer.alloc(headLength);
    const tail = Buffer.alloc(tailLength);
    const headRead = await handle.read(head, 0, headLength, 0);
    const tailRead = await handle.read(tail, 0, tailLength, Math.max(0, size - tailLength));
    return `${head.subarray(0, headRead.bytesRead).toString('utf8')}\n${tail.subarray(0, tailRead.bytesRead).toString('utf8')}`;
  } finally {
    await handle.close();
  }
}

function extractGameLogEvidence(sample, sourcePath = '') {
  const markers = [];
  if (/<Init>/i.test(sample)) markers.push('Init');
  if (/<Game Version>/i.test(sample)) markers.push('GameVersion');
  if (/<SetDatabaseVersion>/i.test(sample)) markers.push('SetDatabaseVersion');
  if (/<Join PU>/i.test(sample)) markers.push('JoinPU');
  if (/\bFileVersion\b/i.test(sample)) markers.push('FileVersion');
  if (/\bProductVersion\b/i.test(sample)) markers.push('ProductVersion');
  if (/\bBranch\b/i.test(sample)) markers.push('Branch');

  const rawChannel = pickFirst(sample, [
    /<Init>.*?\bTag\[([^\]]+)\]/is,
    /<Game Version>.*?\benvironment\[([^\]]+)\]/is,
    /\bEnvironment\[([^\]]+)\]/i,
    /\bversion\[[^\]]*?-(LIVE|PTU|EPTU|HOTFIX|TECH-PREVIEW)\b[^\]]*\]/i,
    /\b(?:FileVersion|ProductVersion)\b\s*[:=]\s*[A-Za-z0-9.]+-(LIVE|PTU|EPTU|HOTFIX|TECH-PREVIEW)\b/i
  ]) || inferChannelFromPath(sourcePath);

  const buildVersion = pickFirst(sample, [
    /<Game Version>.*?\bversion\[([^\]]+)\]/is,
    /\bFileVersion\b\s*[:=]\s*([A-Za-z0-9_.:-]+)/i,
    /\bProductVersion\b\s*[:=]\s*([A-Za-z0-9_.:-]+)/i
  ]);

  const environmentName = pickFirst(sample, [
    /<Init>.*?\bEnvironment\[([^\]]+)\]/is
  ]);

  return {
    markers: unique(markers),
    rawChannel: rawChannel ? String(rawChannel).trim().toUpperCase() : null,
    buildVersion: buildVersion ? String(buildVersion).trim() : null,
    environmentName: environmentName ? String(environmentName).trim() : null
  };
}

function pickFirst(value, patterns) {
  for (const pattern of patterns) {
    const match = String(value).match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function inferChannelFromPath(sourcePath) {
  const parts = String(sourcePath || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
  return parts.find((part) => SUPPORTED_CHANNELS.includes(part)) || null;
}

function normalizeSupportedChannel(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return SUPPORTED_CHANNELS.includes(normalized) ? normalized : 'UNKNOWN';
}

function inferInstallationKind(sourcePath) {
  const normalized = String(sourcePath || '').replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/steamapps/common/star citizen/')) return 'steam';
  if (normalized.includes('/games/star-citizen/drive_c/')) return 'lug_wine';
  if (normalized.includes('/drive_c/program files/')) return 'wine';
  if (normalized.includes('/roberts space industries/starcitizen/')) return 'rsi_launcher';
  return 'manual_or_unknown';
}

function formatDisplayLabel(channel, discoveryMethods = []) {
  const normalized = normalizeSupportedChannel(channel);
  const prefix = normalized === 'UNKNOWN' ? 'Unknown channel' : normalized;
  if (discoveryMethods.includes('user_selected')) return `${prefix} game.log selected by user`;
  if (discoveryMethods.includes('restored_setting')) return `${prefix} game.log from saved preference`;
  return `${prefix} game.log candidate`;
}

function formatDisplayPath(channel) {
  const normalized = normalizeSupportedChannel(channel);
  return normalized === 'UNKNOWN' ? 'game.log' : path.posix.join('StarCitizen', normalized, LOG_FILE_NAME);
}

function formatValidationMessage(status, source) {
  const label = source?.displayLabel || 'Selected source';
  switch (status) {
    case VALIDATION_STATUSES.VALID:
      return `${label} is readable and contains Star Citizen log evidence.`;
    case VALIDATION_STATUSES.MISSING:
      return `${label} was not found.`;
    case VALIDATION_STATUSES.PERMISSION_DENIED:
      return `${label} exists but AstraDock does not have permission to read it.`;
    case VALIDATION_STATUSES.NOT_FILE:
      return `${label} is not a file.`;
    case VALIDATION_STATUSES.UNSUPPORTED_CHANNEL:
      return `${label} appears to use an unsupported or future channel.`;
    case VALIDATION_STATUSES.INVALID_LOG:
      return `${label} is not a validated Star Citizen game.log.`;
    default:
      return `${label} could not be checked.`;
  }
}

function mapStatError(error) {
  if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return VALIDATION_STATUSES.MISSING;
  if (error?.code === 'EACCES' || error?.code === 'EPERM') return VALIDATION_STATUSES.PERMISSION_DENIED;
  return VALIDATION_STATUSES.INACCESSIBLE;
}

function mapReadError(error) {
  if (error?.code === 'EACCES' || error?.code === 'EPERM') return VALIDATION_STATUSES.PERMISSION_DENIED;
  if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return VALIDATION_STATUSES.MISSING;
  return VALIDATION_STATUSES.INACCESSIBLE;
}

function selectActiveSource(sources) {
  return sources.find((source) => source.validation.isValid) || null;
}

function getSelectionReason(sources, activeSource) {
  const validSources = sources.filter((source) => source.validation.isValid);
  if (activeSource.discoveryMethods.includes('restored_setting')) return 'restored_valid_preference';
  if (validSources.length > 1) return 'highest_priority_valid_source';
  return 'single_valid_source';
}

function compareSources(left, right) {
  const validDelta = Number(right.validation?.isValid || false) - Number(left.validation?.isValid || false);
  if (validDelta) return validDelta;

  const methodDelta = methodPriority(left) - methodPriority(right);
  if (methodDelta) return methodDelta;

  const channelDelta = channelPriority(left.channelHint) - channelPriority(right.channelHint);
  if (channelDelta) return channelDelta;

  return left.displayPath.localeCompare(right.displayPath) || left.sourceId.localeCompare(right.sourceId);
}

function methodPriority(source) {
  if (source.discoveryMethods.includes('restored_setting')) return 0;
  if (source.discoveryMethods.includes('user_selected')) return 1;
  return 2;
}

function channelPriority(channel) {
  return CHANNEL_PRIORITY.has(channel) ? CHANNEL_PRIORITY.get(channel) : 99;
}

function createSourceId(sourcePath) {
  return `src_${crypto.createHash('sha256').update(normalizePathForIdentity(sourcePath)).digest('hex').slice(0, 24)}`;
}

function normalizePathForIdentity(sourcePath) {
  return path.resolve(String(sourcePath || '')).replace(/\\/g, '/').toLowerCase();
}

function toPublicSource(source) {
  const {
    private: _private,
    ...publicSource
  } = source;
  return publicSource;
}

async function loadSourcePreference(preferencePath) {
  try {
    const text = await fs.readFile(preferencePath, 'utf8');
    const parsed = JSON.parse(text);
    if (parsed?.version !== SOURCE_PREFERENCE_VERSION) return null;
    if (typeof parsed.selectedSourcePath !== 'string' || !parsed.selectedSourcePath.trim()) return null;
    return {
      selectedSourcePath: parsed.selectedSourcePath,
      selectedSourceId: typeof parsed.selectedSourceId === 'string' ? parsed.selectedSourceId : null,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : null
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function saveSourcePreference(preferencePath, source, options = {}) {
  if (!source?.validation?.isValid) {
    throw new Error('Only validated readable game.log sources can be saved.');
  }
  const body = {
    version: SOURCE_PREFERENCE_VERSION,
    savedAt: options.now || new Date().toISOString(),
    selectedSourceId: source.sourceId,
    selectedSourcePath: source.private?.canonicalPath || source.private?.sourcePath
  };
  await fs.mkdir(path.dirname(preferencePath), { recursive: true });
  const tempPath = `${preferencePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tempPath, preferencePath);
  return body;
}

function assertSourceIsApproved(source) {
  if (!source?.private?.canonicalPath || !source?.validation?.isValid) {
    const error = new Error('The selected source is not approved for filesystem access.');
    error.code = 'source_not_approved';
    throw error;
  }
}

module.exports = {
  LOG_FILE_NAME,
  SOURCE_KIND,
  SUPPORTED_CHANNELS,
  VALIDATION_STATUSES,
  assertSourceIsApproved,
  createSourceId,
  discoverRuntimeSources,
  extractGameLogEvidence,
  getCandidateLogPaths,
  getDefaultInstallationRoots,
  loadSourcePreference,
  normalizeSupportedChannel,
  saveSourcePreference,
  toPublicSource,
  validateLogSource
};
