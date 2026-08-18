const fs = require('node:fs/promises');
const { parseRuntimeLogText } = require('./runtimeLogParserEngine');
const {
  projectRuntimeLifecycle,
  toRendererLifecycleProjection
} = require('./runtimeLifecycleProjection');
const {
  LOCATION_EVENT_TYPES,
  PARTY_EVENT_TYPES,
  projectRuntimeLocation,
  projectRuntimeParty,
  toRendererLocationSnapshot,
  toRendererPartySnapshot
} = require('./runtimeStateProjections');
const {
  createPartitionedIdentity,
  deriveEnvironmentContext,
  deriveSourceInstallationId
} = require('./contracts/runtimeEvents');

const CONTEXT_RADIUS = 6;
const UNKNOWN_SOURCE_LOCATION = 'UNKNOWN_SOURCE';

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

function pickBracketValue(line, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = line.match(new RegExp(`\\b${escapedKey}\\[([^\\]]+)\\]`, 'i'));
  return match ? cleanValue(match[1]) : null;
}

function pickLastBracketValue(line, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = Array.from(line.matchAll(new RegExp(`\\b${escapedKey}\\[([^\\]]+)\\]`, 'gi')));
  const match = matches.at(-1);
  return match ? cleanValue(match[1]) : null;
}

function cleanValue(value) {
  return String(value)
    .trim()
    .replace(/^[=:>"'\s]+/, '')
    .replace(/[<,"')\]}]+$/, '')
    .trim();
}

function normalizeIsoTimestamp(value) {
  if (!value) return new Date(0).toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return new Date(0).toISOString();
  return parsed.toISOString();
}

function normalizeReleaseChannel(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return ['LIVE', 'PTU', 'EPTU', 'HOTFIX'].includes(normalized) ? normalized : null;
}

function inferReleaseChannelFromSourceLocation(sourceLocation) {
  const normalized = String(sourceLocation || '').replace(/\\/g, '/');
  const parts = normalized.split('/').map((part) => part.trim().toUpperCase()).filter(Boolean);
  return parts.find((part) => ['LIVE', 'PTU', 'EPTU', 'HOTFIX'].includes(part)) || null;
}

function extractEnvironmentEvidenceFromLine(line) {
  const evidence = {};
  const markers = [];

  const fileVersion = pickValue(line, [/\bFileVersion\b\s*[:=]\s*(?<value>[A-Za-z0-9_.:-]+)/i]);
  if (fileVersion) {
    evidence.fileVersion = fileVersion;
    evidence.buildVersion = evidence.buildVersion || fileVersion;
    markers.push('FileVersion');
  }

  const productVersion = pickValue(line, [/\bProductVersion\b\s*[:=]\s*(?<value>[A-Za-z0-9_.:-]+)/i]);
  if (productVersion) {
    evidence.productVersion = productVersion;
    evidence.buildVersion = evidence.buildVersion || productVersion;
    markers.push('ProductVersion');
  }

  const branch = pickValue(line, [/\bBranch\b\s*[:=]\s*(?<value>[A-Za-z0-9_.:-]+)/i]);
  if (branch) {
    evidence.branch = branch;
    markers.push('Branch');
  }

  const changelist = pickValue(line, [/\bChangelist\b\s*[:=]\s*(?<value>[A-Za-z0-9_.:-]+)/i]);
  if (changelist) {
    evidence.changelist = changelist;
    markers.push('Changelist');
  }

  if (/<Init>/i.test(line)) {
    const environmentName = pickBracketValue(line, 'Environment');
    const rawEnvironmentTag = pickBracketValue(line, 'Tag');
    const config = pickBracketValue(line, 'Config');
    const sourceLocation = pickBracketValue(line, 'SourcePath');

    if (environmentName) {
      evidence.environmentName = environmentName;
      markers.push(`Environment[${environmentName}]`);
    }
    if (rawEnvironmentTag) {
      evidence.rawEnvironmentTag = rawEnvironmentTag;
      markers.push(`Tag[${rawEnvironmentTag}]`);
    }
    if (config) {
      evidence.config = config;
      markers.push('Config');
    }
    if (sourceLocation) {
      evidence.sourceLocation = sourceLocation;
      markers.push('SourcePath');
    }
  }

  if (/<Game Version>/i.test(line)) {
    const gameVersion = pickBracketValue(line, 'version');
    const gameEnvironment = pickLastBracketValue(line, 'environment');

    if (gameVersion) {
      evidence.buildVersion = gameVersion;
      markers.push('GameVersion');
    }
    if (gameEnvironment) {
      evidence.gameEnvironmentTag = gameEnvironment;
      evidence.rawEnvironmentTag = evidence.rawEnvironmentTag || gameEnvironment;
      markers.push(`environment[${gameEnvironment}]`);
    }
  }

  if (/<SetDatabaseVersion>/i.test(line)) {
    const dataCoreVersion = pickBracketValue(line, 'dataCore');
    const archetypeVersion = pickBracketValue(line, 'archetype');
    const componentVersion = pickBracketValue(line, 'component');
    if (dataCoreVersion) {
      evidence.databaseVersion = dataCoreVersion;
      markers.push('dataCore');
    }
    if (archetypeVersion) evidence.archetypeVersion = archetypeVersion;
    if (componentVersion) evidence.componentVersion = componentVersion;
  }

  return Object.keys(evidence).length ? { evidence, markers } : null;
}

function parseEnvironmentTimeline(lines, options = {}) {
  const sourceLocation = options.sourceLocation || options.logPath || UNKNOWN_SOURCE_LOCATION;
  const initialChannel = options.releaseChannel || inferReleaseChannelFromSourceLocation(sourceLocation);
  const facts = {
    sourceLocation,
    rawEnvironmentTag: initialChannel || 'UNKNOWN',
    environmentName: options.environmentName || 'UNKNOWN',
    universe: options.universe || 'PU',
    buildVersion: options.gameBuild || 'UNKNOWN_BUILD',
    branch: options.branch || 'UNKNOWN',
    changelist: options.changelist || undefined,
    databaseVersion: options.databaseVersion || undefined
  };
  const lineContexts = [];
  const diagnostics = [];
  const switches = [];
  const partitions = new Map();
  let activeContext = buildEnvironmentContext(facts, {
    observedAt: new Date(0).toISOString(),
    confidence: initialChannel ? 'medium' : 'unknown',
    markers: initialChannel ? ['sourceLocationChannel'] : ['unknownSource'],
    sourceSequence: 0
  });

  lines.forEach((line, index) => {
    const sourceTimestamp = normalizeIsoTimestamp(parseLogTimestamp(line));
    const extracted = extractEnvironmentEvidenceFromLine(line);

    if (!extracted) {
      lineContexts[index] = activeContext;
      if (line.trim()) partitions.set(activeContext.environmentKey, activeContext);
      return;
    }

    const conflict = getSameLineReleaseConflict(extracted.evidence);
    if (conflict) {
      diagnostics.push(createEnvironmentDiagnostic({
        code: 'conflicting_environment_evidence',
        severity: 'error',
        message: 'Conflicting release-channel evidence was quarantined for this line.',
        lineNumber: index + 1,
        sourceTimestamp,
        environmentKey: activeContext.environmentKey,
        evidenceMarkers: extracted.markers,
        details: {
          releaseChannels: conflict
        }
      }));
      lineContexts[index] = activeContext;
      if (line.trim()) partitions.set(activeContext.environmentKey, activeContext);
      return;
    }

    if (isEnvironmentBoundaryChange(facts, extracted.evidence)) {
      facts.buildVersion = options.gameBuild || 'UNKNOWN_BUILD';
      facts.branch = options.branch || 'UNKNOWN';
      delete facts.changelist;
      delete facts.databaseVersion;
    }

    Object.assign(facts, compactObject({
      sourceLocation: extracted.evidence.sourceLocation,
      rawEnvironmentTag: extracted.evidence.rawEnvironmentTag || extracted.evidence.gameEnvironmentTag,
      environmentName: extracted.evidence.environmentName,
      buildVersion: extracted.evidence.buildVersion,
      branch: extracted.evidence.branch,
      changelist: extracted.evidence.changelist,
      databaseVersion: extracted.evidence.databaseVersion
    }));

    const nextContext = buildEnvironmentContext(facts, {
      observedAt: sourceTimestamp,
      confidence: extracted.evidence.rawEnvironmentTag || extracted.evidence.gameEnvironmentTag ? 'high' : undefined,
      markers: extracted.markers,
      sourceSequence: index + 1
    });

    if (nextContext.environmentKey !== activeContext.environmentKey) {
      switches.push({
        lineNumber: index + 1,
        sourceTimestamp,
        previousEnvironmentKey: activeContext.environmentKey,
        nextEnvironmentKey: nextContext.environmentKey,
        reason: 'environment_context_changed'
      });
      activeContext = nextContext;
      partitions.set(activeContext.environmentKey, activeContext);
    } else {
      activeContext = nextContext;
      partitions.set(activeContext.environmentKey, activeContext);
    }

    lineContexts[index] = activeContext;
  });

  return {
    activeEnvironment: activeContext,
    environmentKey: activeContext.environmentKey,
    lineContexts,
    partitions: Array.from(partitions.values()),
    switches,
    diagnostics
  };
}

function buildEnvironmentContext(facts, options = {}) {
  const sourceLocation = facts.sourceLocation || UNKNOWN_SOURCE_LOCATION;
  const sourceInstallationId = deriveSourceInstallationId(sourceLocation);
  return deriveEnvironmentContext({
    releaseChannel: facts.rawEnvironmentTag || inferReleaseChannelFromSourceLocation(sourceLocation) || 'UNKNOWN',
    universe: facts.universe || 'PU',
    environmentName: facts.environmentName || 'UNKNOWN',
    rawEnvironmentTag: facts.rawEnvironmentTag || inferReleaseChannelFromSourceLocation(sourceLocation) || 'UNKNOWN',
    branch: facts.branch || 'UNKNOWN',
    buildVersion: facts.buildVersion || 'UNKNOWN_BUILD',
    changelist: facts.changelist,
    databaseVersion: facts.databaseVersion,
    sourceInstallationId,
    observedAt: options.observedAt || new Date(0).toISOString(),
    confidence: options.confidence,
    evidenceReference: {
      kind: 'runtime_log',
      sourceId: sourceInstallationId,
      sensitivity: 'local',
      evidenceMarkers: options.markers || ['environment-context'],
      lineRange: {
        start: options.sourceSequence || 0,
        end: options.sourceSequence || 0
      }
    }
  });
}

function getSameLineReleaseConflict(evidence) {
  const channels = [evidence.rawEnvironmentTag, evidence.gameEnvironmentTag]
    .map(normalizeReleaseChannel)
    .filter(Boolean);
  const unique = Array.from(new Set(channels));
  return unique.length > 1 ? unique : null;
}

function isEnvironmentBoundaryChange(currentFacts, evidence) {
  if (evidence.sourceLocation && evidence.sourceLocation !== currentFacts.sourceLocation) return true;

  const nextReleaseChannel = normalizeReleaseChannel(evidence.rawEnvironmentTag || evidence.gameEnvironmentTag);
  const currentReleaseChannel = normalizeReleaseChannel(currentFacts.rawEnvironmentTag);
  return Boolean(nextReleaseChannel && currentReleaseChannel && nextReleaseChannel !== currentReleaseChannel);
}

function createEnvironmentDiagnostic(input) {
  return {
    code: input.code,
    severity: input.severity,
    message: input.message,
    lineNumber: input.lineNumber,
    sourceTimestamp: input.sourceTimestamp,
    environmentKey: input.environmentKey,
    evidenceMarkers: input.evidenceMarkers,
    details: input.details || {}
  };
}

function extractShardInfoFromLine(line) {
  const shardId = pickValue(line, [
    /\bShardID\b\s*[:=]\s*(?<value>[A-Za-z0-9_.:-]+)/i,
    /\bShardId\b\s*[:=]\s*(?<value>[A-Za-z0-9_.:-]+)/i,
    /\bshard_id\b["'\s:=]+(?<value>[A-Za-z0-9_.:-]+)/i,
    /\bshardId\b["'\s:=]+(?<value>[A-Za-z0-9_.:-]+)/i,
    /\bshard\b\s*[:=]\s*(?<value>[A-Za-z0-9_.:-]+)/i,
    /\bshard\[(?<value>[A-Za-z0-9_.:-]+)\]/i
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

function extractServerJoinFromLine(line) {
  if (!/<Join PU>/i.test(line)) return null;

  return {
    eventType: 'server_join',
    eventLabel: 'Server Join',
    address: pickBracketValue(line, 'address'),
    port: pickBracketValue(line, 'port'),
    shardId: pickBracketValue(line, 'shard'),
    locationId: pickBracketValue(line, 'locationId')
  };
}

function isServerLeaveLine(line) {
  return /\b(disconnect|disconnected|connection lost|leaving server|leave pu|session ended|logout|quit)\b/i.test(line);
}

function extractServerLeaveFromLine(line) {
  if (!isServerLeaveLine(line)) return null;

  const cause = pickValue(line, [/\bcause\b\s*[=:]\s*(?<value>[A-Za-z0-9_.:-]+)/i]);
  const reason = pickValue(line, [
    /\breason\b\s*[=:]\s*"(?<value>[^"]+)"/i,
    /\breason\b\s*[=:]\s*(?<value>[A-Za-z0-9_.:-]+)/i
  ]);
  const remoteFlag = pickValue(line, [/\bisRemote\b\s*[=:]\s*(?<value>[01]|true|false)/i]);
  const endpoint = pickValue(line, [/\bremoteAddr\b\s*[=:]\s*(?<value>[A-Za-z0-9_.:-]+:\d+)/i]);

  return {
    eventType: 'server_leave',
    eventLabel: 'Server Leave',
    cause,
    reason,
    origin: remoteFlag === '1' || remoteFlag === 'true'
      ? 'remote'
      : remoteFlag === '0' || remoteFlag === 'false'
        ? 'local'
        : 'unknown',
    endpoint
  };
}

function extractUserInfoFromLine(line, targetUsername = '') {
  const username = pickValue(line, [
    /\b(?:username|user_name|accountName|account_name|displayName|display_name|nickname|handle|playerName|player_name)\b\s*[:=]\s*(?<value>[A-Za-z0-9_.-]+)/i,
    /"(?:(?:user|player|account)(?:name|Name)|handle)"\s*:\s*"(?<value>[^"]+)"/i
  ]);

  const userId = pickValue(line, [
    /\b(?<!shard)(?:userId|user_id|accountId|account_id|playerId|player_id|citizenId|citizen_id)\b\s*[:=]\s*(?<value>[A-Za-z0-9_.:-]+)/i,
    /\b(?<!shard)(?:userId|user_id|accountId|account_id|playerId|player_id|citizenId|citizen_id)\b\s+(?<value>[A-Za-z0-9_.:-]+)/i,
    /"(?:(?:user|account|player|citizen)(?:Id|ID)|(?:user|account|player|citizen)_id)"\s*:\s*"?(?<value>[A-Za-z0-9_.:-]+)/i
  ]);

  const normalizedTarget = targetUsername.trim().toLowerCase();
  const mentionsTarget = normalizedTarget
    ? line.toLowerCase().includes(normalizedTarget)
    : false;

  return {
    username: username || (mentionsTarget ? targetUsername.trim() : null),
    userId,
    mentionsTarget
  };
}

function summarizeAction(line) {
  const cleaned = line
    .replace(/^<[^>]+>\s*/, '')
    .replace(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\s*/, '')
    .trim();

  return cleaned.length > 140 ? `${cleaned.slice(0, 137)}...` : cleaned || 'Log entry';
}

function formatServerLeaveAction(session, serverLeave) {
  const target = session.shardId || session.address || 'current server';
  const reason = serverLeave.reason || serverLeave.cause;
  return reason
    ? `Left ${target}: ${reason}`
    : `Left ${target}`;
}

function parseUserActions(logText, options = {}) {
  const username = String(options.username || '').trim();
  const seedUserIds = new Set(
    []
      .concat(options.userId || [])
      .filter(Boolean)
      .map((value) => String(value).trim())
  );
  const lines = logText.split(/\r?\n/);
  const environmentTimeline = options.environmentTimeline || parseEnvironmentTimeline(lines, options);
  const knownUserIdsByEnvironment = new Map();
  const actions = [];
  const sessions = [];
  let currentSession = null;
  let lastTimestamp = null;

  function userIdsForEnvironment(environmentKey) {
    if (!knownUserIdsByEnvironment.has(environmentKey)) {
      knownUserIdsByEnvironment.set(environmentKey, new Set(seedUserIds));
    }
    return knownUserIdsByEnvironment.get(environmentKey);
  }

  lines.forEach((line, index) => {
    const timestamp = parseLogTimestamp(line);
    if (timestamp) lastTimestamp = timestamp;
    const environment = environmentTimeline.lineContexts[index] || environmentTimeline.activeEnvironment;
    const environmentKey = environment.environmentKey;
    const knownUserIds = userIdsForEnvironment(environmentKey);

    if (currentSession && currentSession.environmentKey !== environmentKey) {
      currentSession.endedAt = timestamp || lastTimestamp;
      currentSession.endLineNumber = index + 1;
      currentSession.staleReason = 'environment_changed';
      currentSession = null;
    }

    const serverJoin = extractServerJoinFromLine(line);
    if (serverJoin) {
      if (currentSession) {
        currentSession.endedAt = timestamp || lastTimestamp;
        currentSession.endLineNumber = index;
      }

      currentSession = {
        id: createPartitionedIdentity(environmentKey, 'session', [
          index + 1,
          serverJoin.shardId,
          serverJoin.address,
          serverJoin.port
        ]),
        eventType: 'server_join',
        environmentKey,
        environment,
        gameChannel: environment.releaseChannel,
        gameBuild: environment.buildVersion,
        shardId: serverJoin.shardId,
        address: serverJoin.address,
        port: serverJoin.port,
        locationId: serverJoin.locationId,
        startedAt: timestamp || lastTimestamp,
        startLineNumber: index + 1,
        endedAt: null,
        endLineNumber: null,
        actionCount: 0
      };
      sessions.push(currentSession);

      actions.push({
        id: createPartitionedIdentity(environmentKey, 'action', [index, 'server_join', serverJoin.shardId]),
        eventType: 'server_join',
        eventLabel: 'Server Join',
        sessionId: currentSession.id,
        environmentKey,
        environment,
        gameChannel: environment.releaseChannel,
        gameBuild: environment.buildVersion,
        lineNumber: index + 1,
        timestamp: timestamp || lastTimestamp,
        username: username || null,
        userId: knownUserIds.values().next().value || null,
        shardId: serverJoin.shardId,
        address: serverJoin.address,
        port: serverJoin.port,
        locationId: serverJoin.locationId,
        action: `Joined ${serverJoin.shardId || 'unknown shard'} at ${serverJoin.address || 'unknown address'}:${serverJoin.port || '?'}`,
        rawLine: line.trim()
      });
      return;
    }

    const serverLeave = currentSession ? extractServerLeaveFromLine(line) : null;
    if (currentSession && serverLeave) {
      currentSession.endedAt = timestamp || lastTimestamp;
      currentSession.endLineNumber = index + 1;
      currentSession.actionCount += 1;
      actions.push({
        id: createPartitionedIdentity(environmentKey, 'action', [index, 'server_leave', currentSession.id]),
        eventType: serverLeave.eventType,
        eventLabel: serverLeave.eventLabel,
        sessionId: currentSession.id,
        environmentKey,
        environment,
        gameChannel: environment.releaseChannel,
        gameBuild: environment.buildVersion,
        lineNumber: index + 1,
        timestamp: timestamp || lastTimestamp,
        username: username || null,
        userId: knownUserIds.values().next().value || null,
        shardId: currentSession.shardId,
        address: currentSession.address,
        port: currentSession.port,
        cause: serverLeave.cause,
        reason: serverLeave.reason,
        origin: serverLeave.origin,
        endpoint: serverLeave.endpoint,
        action: formatServerLeaveAction(currentSession, serverLeave),
        rawLine: line.trim()
      });
      currentSession = null;
    }

    const userInfo = extractUserInfoFromLine(line, username);
    if (userInfo.mentionsTarget && userInfo.userId) knownUserIds.add(userInfo.userId);

    const matchesUsername = username ? line.toLowerCase().includes(username.toLowerCase()) : false;
    const matchedUserId = Array.from(knownUserIds).find((userId) => line.includes(userId));
    const shouldInclude = matchesUsername || Boolean(matchedUserId);

    if (!shouldInclude) return;
    if (userInfo.userId) knownUserIds.add(userInfo.userId);

    actions.push({
      id: createPartitionedIdentity(environmentKey, 'action', [index, lastTimestamp || 'no-time', userInfo.userId || matchedUserId]),
      eventType: 'user_action',
      eventLabel: 'User Action',
      sessionId: currentSession?.id || null,
      environmentKey,
      environment,
      gameChannel: environment.releaseChannel,
      gameBuild: environment.buildVersion,
      lineNumber: index + 1,
      timestamp: timestamp || lastTimestamp,
      username: userInfo.username || username || null,
      userId: userInfo.userId || matchedUserId || null,
      shardId: currentSession?.shardId || null,
      action: summarizeAction(line),
      rawLine: line.trim()
    });

    if (currentSession) currentSession.actionCount += 1;
  });

  return {
    username,
    userIds: Array.from(new Set(Array.from(knownUserIdsByEnvironment.values()).flatMap((ids) => Array.from(ids)))),
    userIdsByEnvironment: Object.fromEntries(
      Array.from(knownUserIdsByEnvironment.entries()).map(([environmentKey, userIds]) => [environmentKey, Array.from(userIds)])
    ),
    actions: actions.slice(-500).reverse(),
    sessions: sessions.reverse()
  };
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

function parseShardEntries(logText, options = {}) {
  const lines = logText.split(/\r?\n/);
  const environmentTimeline = options.environmentTimeline || parseEnvironmentTimeline(lines, options);
  const entries = [];
  let lastTimestamp = null;

  lines.forEach((line, index) => {
    const timestamp = parseLogTimestamp(line);
    if (timestamp) lastTimestamp = timestamp;
    const environment = environmentTimeline.lineContexts[index] || environmentTimeline.activeEnvironment;

    if (!/shard/i.test(line) && !/\bserver[_ ]?name\b/i.test(line)) return;

    const directInfo = extractShardInfoFromLine(line);
    if (!directInfo) return;

    const contextInfo = mergeContext(lines, index);
    entries.push({
      id: createPartitionedIdentity(environment.environmentKey, 'shard', [
        index,
        directInfo.shardId || directInfo.shardName
      ]),
      environmentKey: environment.environmentKey,
      environment,
      gameChannel: environment.releaseChannel,
      gameBuild: environment.buildVersion,
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
    const key = `${entry.environmentKey}::${entry.shardId || 'unknown'}::${entry.shardName || 'unknown'}`;
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

async function parseLogFile(logPath, options = {}) {
  const { signal, ...parseOptions } = options;
  const text = await fs.readFile(logPath, { encoding: 'utf8', signal });
  const stat = await fs.stat(logPath);
  const parsed = parseLogText(text, {
    ...parseOptions,
    logPath,
    sourceLocation: logPath,
    scannedAt: new Date().toISOString(),
    modifiedAt: stat.mtime.toISOString()
  });
  const canonical = parseRuntimeLogText(text, {
    sourceLocation: logPath,
    releaseChannel: parsed.environment?.releaseChannel,
    gameBuild: parsed.environment?.buildVersion,
    environmentName: parsed.environment?.environmentName,
    branch: parsed.environment?.branch,
    ingestedAt: parsed.scannedAt
  });
  const lifecycleProjection = projectRuntimeLifecycle(canonical.events, {
    activeEnvironmentKey: parsed.environmentKey,
    now: parsed.scannedAt
  });
  const partyProjection = projectRuntimeParty(canonical.events, {
    activeEnvironmentKey: parsed.environmentKey,
    now: parsed.scannedAt,
    staleAfterMs: options.snapshotStaleAfterMs
  });
  const locationProjection = projectRuntimeLocation(canonical.events, {
    activeEnvironmentKey: parsed.environmentKey,
    now: parsed.scannedAt,
    staleAfterMs: options.snapshotStaleAfterMs
  });
  return {
    ...parsed,
    runtimeEvents: canonical.events,
    promotedRuntimeEvents: canonical.events.filter((event) => (
      PARTY_EVENT_TYPES.includes(event.eventType) || LOCATION_EVENT_TYPES.includes(event.eventType)
    )),
    parserCompatibility: canonical.parserHealth,
    lifecycleProjection,
    partyProjection,
    locationProjection,
    rendererLifecycle: toRendererLifecycleProjection(lifecycleProjection),
    partySnapshot: toRendererPartySnapshot(partyProjection),
    locationSnapshot: toRendererLocationSnapshot(locationProjection)
  };
}

function parseLogText(logText, options = {}) {
  const lines = logText.split(/\r?\n/);
  const environmentTimeline = parseEnvironmentTimeline(lines, options);
  const userActivity = parseUserActions(logText, { ...options, environmentTimeline });
  return {
    logPath: options.logPath || options.sourceLocation || null,
    scannedAt: options.scannedAt || new Date().toISOString(),
    modifiedAt: options.modifiedAt || null,
    environment: environmentTimeline.activeEnvironment,
    environmentKey: environmentTimeline.environmentKey,
    environmentPartitions: environmentTimeline.partitions,
    environmentSwitches: environmentTimeline.switches,
    environmentDiagnostics: environmentTimeline.diagnostics,
    entries: parseShardEntries(logText, { ...options, environmentTimeline }),
    userActivity
  };
}

module.exports = {
  parseEnvironmentTimeline,
  parseLogFile,
  parseLogText,
  parseShardEntries,
  parseUserActions
};
