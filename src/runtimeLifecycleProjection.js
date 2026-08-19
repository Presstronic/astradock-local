const { compareRuntimeEventOrder } = require('./contracts/runtimeEvents');
const { mapShardRegion } = require('./runtimeRegionMappings');

const PROJECTION_VERSION = 2;
const DEFAULT_STALE_AFTER_MS = 15_000;
const IDENTITY_FIELDS = Object.freeze([
  'handle',
  'characterName',
  'accountId',
  'characterGeid',
  'playerGeid',
  'nodeId',
  'loginSessionId',
  'clientSession'
]);

const LIFECYCLE_TRANSITIONS = Object.freeze({
  LoginStarted: 'authenticating',
  AccountAuthenticated: 'authenticated',
  IdentityObserved: 'frontend',
  PuJoinRequested: 'loading',
  PuReplicationConnectionEstablished: 'loading',
  PuEntered: 'in_game',
  PuDisconnected: 'disconnected',
  ReturnedToFrontend: 'frontend',
  ApplicationExited: 'exited'
});

function projectRuntimeLifecycle(events, options = {}) {
  const projections = new Map();
  const orderedEvents = [...(events || [])].sort(compareRuntimeEventOrder);

  for (const event of orderedEvents) {
    if (!event?.environmentKey || !event.environment) continue;
    const projection = projections.get(event.environmentKey) || createProjection(event);
    applyEvent(projection, event);
    projections.set(event.environmentKey, projection);
  }

  const nowMs = toTime(options.now) ?? Date.now();
  const staleAfterMs = positiveInteger(options.staleAfterMs) || DEFAULT_STALE_AFTER_MS;
  for (const projection of projections.values()) {
    projection.freshness = classifyFreshness(projection.lastChangedAt, nowMs, staleAfterMs);
    if (projection.freshness === 'stale') {
      if (projection.shard.state === 'connected') projection.shard.state = 'stale';
      if (projection.replicationConnection.state === 'connected') projection.replicationConnection.state = 'stale';
    }
  }

  return {
    version: PROJECTION_VERSION,
    activeEnvironmentKey: options.activeEnvironmentKey || orderedEvents.at(-1)?.environmentKey || null,
    environments: Object.fromEntries(projections)
  };
}

function createProjection(event) {
  return {
    version: PROJECTION_VERSION,
    environmentKey: event.environmentKey,
    environment: {
      releaseChannel: event.environment.releaseChannel,
      rawReleaseChannel: event.environment.rawEnvironmentTag,
      environmentName: event.environment.environmentName,
      branch: event.environment.branch,
      buildVersion: event.environment.buildVersion,
      confidence: event.environment.confidence,
      status: event.environment.releaseChannel === 'UNKNOWN' ? 'unknown' : 'known'
    },
    build: {
      status: 'unknown',
      fileVersion: null,
      productVersion: null,
      branch: event.environment.branch || null,
      changelist: event.environment.changelist || null,
      gameVersion: event.environment.buildVersion || null,
      dataCoreVersion: event.environment.databaseVersion || null,
      archetypeVersion: null,
      componentVersion: null,
      config: null
    },
    identity: Object.fromEntries(IDENTITY_FIELDS.map((field) => [field, createIdentityField()])),
    shard: {
      state: 'unknown',
      shardLabel: null,
      locationId: null,
      region: mapShardRegion(null),
      observedAt: null,
      confidence: 'unknown'
    },
    replicationConnection: {
      state: 'unknown',
      endpoint: null,
      port: null,
      observedNodeId: null,
      hostType: null,
      gamerules: null,
      connectedAt: null,
      disconnectedAt: null,
      lastEndpoint: null,
      disconnect: null,
      confidence: 'unknown'
    },
    puSession: {
      state: 'unknown',
      matchmakingRequestId: null,
      matchmakingStatus: null,
      requestedAt: null,
      enteredAt: null,
      endedAt: null,
      durationSeconds: null,
      durationSource: null
    },
    lifecycle: {
      state: 'unknown',
      status: 'unknown',
      lastChangedAt: null,
      durationStartedAt: null,
      reason: 'No accepted lifecycle event has been observed.',
      cleanExit: null
    },
    lastChangedAt: null,
    freshness: 'unknown'
  };
}

function createIdentityField() {
  return { status: 'unknown', value: null, observedAt: null, confidence: 'unknown', evidenceEventId: null, claims: [] };
}

function applyEvent(projection, event) {
  projection.lastChangedAt = laterTimestamp(projection.lastChangedAt, event.sourceTimestamp);
  projection.environment = {
    releaseChannel: event.environment.releaseChannel,
    rawReleaseChannel: event.environment.rawEnvironmentTag,
    environmentName: event.environment.environmentName,
    branch: event.environment.branch,
    buildVersion: event.environment.buildVersion,
    confidence: event.environment.confidence,
    status: event.environment.releaseChannel === 'UNKNOWN' ? 'unknown' : 'known'
  };

  if (event.eventType === 'ClientBuildObserved') {
    Object.assign(projection.build, event.payload, { status: 'known' });
  } else if (event.eventType === 'ReleaseEnvironmentObserved') {
    projection.build.config = event.payload.config;
  } else if (event.eventType === 'GameDataVersionObserved') {
    Object.assign(projection.build, event.payload, { status: 'known' });
  }

  if (event.eventType === 'LoginStarted') {
    observeIdentity(projection, 'loginSessionId', event.payload.loginSessionId, event);
  } else if (event.eventType === 'AccountAuthenticated') {
    observeIdentity(projection, 'handle', event.payload.handle, event);
    observeIdentity(projection, 'accountId', event.payload.accountId, event);
  } else if (event.eventType === 'IdentityObserved') {
    for (const field of ['characterName', 'accountId', 'characterGeid', 'playerGeid', 'nodeId', 'clientSession']) {
      observeIdentity(projection, field, event.payload[field], event);
    }
  }

  applyPuSessionEvent(projection, event);

  const nextState = LIFECYCLE_TRANSITIONS[event.eventType];
  if (!nextState) return;
  projection.lifecycle = {
    state: nextState,
    status: event.eventType === 'ApplicationExited' && !event.payload.clean ? 'failure' : 'known',
    lastChangedAt: event.sourceTimestamp,
    durationStartedAt: nextState === 'loading' && projection.lifecycle.state !== 'loading'
      ? event.sourceTimestamp
      : nextState === 'loading'
        ? projection.lifecycle.durationStartedAt
        : null,
    reason: lifecycleReason(event),
    cleanExit: event.eventType === 'ApplicationExited' ? event.payload.clean : null
  };
}

function applyPuSessionEvent(projection, event) {
  if (event.eventType === 'MatchmakingStatusObserved') {
    projection.puSession = {
      state: 'connecting',
      matchmakingRequestId: event.payload.matchmakingRequestId,
      matchmakingStatus: event.payload.matchmakingStatus,
      requestedAt: event.sourceTimestamp,
      enteredAt: null,
      endedAt: null,
      durationSeconds: null,
      durationSource: null
    };
    return;
  }

  if (event.eventType === 'PuJoinRequested') {
    projection.shard = {
      state: 'transitioning',
      shardLabel: event.payload.shard,
      locationId: event.payload.locationId,
      region: mapShardRegion(event.payload.shard),
      observedAt: event.sourceTimestamp,
      confidence: event.confidence
    };
    projection.replicationConnection = {
      ...projection.replicationConnection,
      state: 'transitioning',
      endpoint: event.payload.endpoint,
      port: event.payload.port,
      connectedAt: null,
      disconnectedAt: null,
      disconnect: null,
      confidence: event.confidence
    };
    projection.puSession = {
      state: 'connecting',
      matchmakingRequestId: event.payload.matchmakingRequestId,
      matchmakingStatus: projection.puSession.matchmakingStatus,
      requestedAt: projection.puSession.requestedAt || event.sourceTimestamp,
      enteredAt: null,
      endedAt: null,
      durationSeconds: null,
      durationSource: null
    };
    return;
  }

  if (event.eventType === 'PuReplicationConnectionEstablished') {
    projection.replicationConnection = {
      ...projection.replicationConnection,
      state: 'connected',
      endpoint: event.payload.endpoint,
      port: event.payload.port,
      observedNodeId: event.payload.observedNodeId,
      hostType: event.payload.hostType,
      gamerules: event.payload.gamerules,
      connectedAt: event.sourceTimestamp,
      disconnectedAt: null,
      disconnect: null,
      confidence: event.confidence
    };
    return;
  }

  if (event.eventType === 'PuEntered') {
    projection.shard.state = projection.shard.shardLabel ? 'connected' : 'unknown';
    projection.puSession.state = 'in_game';
    projection.puSession.enteredAt = event.sourceTimestamp;
    return;
  }

  if (event.eventType === 'PuDisconnected') {
    if (
      projection.replicationConnection.endpoint &&
      event.payload.endpoint &&
      projection.replicationConnection.endpoint !== event.payload.endpoint
    ) {
      return;
    }
    const lastEndpoint = projection.replicationConnection.endpoint || event.payload.endpoint;
    projection.replicationConnection = {
      ...projection.replicationConnection,
      state: 'disconnected',
      endpoint: null,
      port: null,
      observedNodeId: null,
      hostType: null,
      connectedAt: null,
      disconnectedAt: event.sourceTimestamp,
      lastEndpoint,
      disconnect: {
        cause: event.payload.cause,
        reason: event.payload.reason,
        origin: event.payload.isRemote ? 'remote' : 'local',
        observedAt: event.sourceTimestamp
      },
      confidence: event.confidence
    };
    projection.shard.state = 'disconnected';
    projection.puSession.state = 'disconnected';
    projection.puSession.endedAt = event.sourceTimestamp;
    projection.puSession.durationSeconds = event.payload.uptimeSeconds;
    projection.puSession.durationSource = 'observed_connection_uptime';
  }
}

function observeIdentity(projection, field, value, event) {
  if (!IDENTITY_FIELDS.includes(field) || value === null || value === undefined || value === '') return;
  const current = projection.identity[field];
  const claim = {
    value: String(value),
    observedAt: event.sourceTimestamp,
    confidence: event.confidence,
    evidenceEventId: event.eventId
  };
  if (!current.claims.some((existing) => existing.value === claim.value)) current.claims.push(claim);
  current.value = claim.value;
  current.observedAt = claim.observedAt;
  current.confidence = claim.confidence;
  current.evidenceEventId = claim.evidenceEventId;
  current.status = current.claims.length > 1 ? 'conflicting' : 'known';
}

function toRendererLifecycleProjection(result, options = {}) {
  if (!result) return null;
  const environments = {};
  for (const [environmentKey, projection] of Object.entries(result.environments || {})) {
    environments[environmentKey] = {
      version: projection.version,
      environmentKey,
      environment: { ...projection.environment },
      build: { ...projection.build },
      identity: Object.fromEntries(IDENTITY_FIELDS.map((field) => {
        const fact = projection.identity[field];
        const isDisplayName = field === 'handle' || field === 'characterName';
        return [field, {
          status: fact.status,
          value: fact.value ? (isDisplayName ? fact.value : redactStableIdentifier(fact.value)) : null,
          observedAt: fact.observedAt,
          confidence: fact.confidence,
          conflictingClaimCount: fact.status === 'conflicting' ? fact.claims.length : 0
        }];
      })),
      shard: { ...projection.shard, region: { ...projection.shard.region } },
      replicationConnection: {
        ...projection.replicationConnection,
        endpoint: redactEndpoint(projection.replicationConnection.endpoint),
        lastEndpoint: redactEndpoint(projection.replicationConnection.lastEndpoint),
        disconnect: projection.replicationConnection.disconnect ? { ...projection.replicationConnection.disconnect } : null
      },
      puSession: {
        ...projection.puSession,
        matchmakingRequestId: projection.puSession.matchmakingRequestId
          ? redactStableIdentifier(projection.puSession.matchmakingRequestId)
          : null,
        elapsedSeconds: sessionElapsedSeconds(projection.puSession, options.now)
      },
      lifecycle: { ...projection.lifecycle },
      lastChangedAt: projection.lastChangedAt,
      freshness: projection.freshness
    };
  }
  return { version: PROJECTION_VERSION, activeEnvironmentKey: result.activeEnvironmentKey, environments };
}

function redactEndpoint(value) {
  if (!value) return null;
  const text = String(value);
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(text)) {
    const parts = text.split('.');
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  const labels = text.split('.');
  const host = labels.shift() || '';
  const redactedHost = host.length <= 4 ? '•'.repeat(host.length) : `${host.slice(0, 2)}…${host.slice(-2)}`;
  return [redactedHost, ...labels].join('.');
}

function sessionElapsedSeconds(session, now) {
  if (Number.isFinite(session.durationSeconds)) return session.durationSeconds;
  const started = toTime(session.enteredAt || session.requestedAt);
  const ended = toTime(session.endedAt) ?? toTime(now) ?? Date.now();
  if (started === null || ended < started) return null;
  return Math.floor((ended - started) / 1000);
}

function redactStableIdentifier(value) {
  const text = String(value);
  if (text.length <= 4) return '•'.repeat(text.length);
  return `${text.slice(0, 2)}…${text.slice(-2)}`;
}

function lifecycleReason(event) {
  if (event.eventType === 'PuDisconnected' || event.eventType === 'ReturnedToFrontend' || event.eventType === 'ApplicationExited') {
    return String(event.payload.reason || event.payload.cause || event.eventType);
  }
  return event.eventType;
}

function classifyFreshness(timestamp, nowMs, staleAfterMs) {
  const observedMs = toTime(timestamp);
  if (observedMs === null) return 'unknown';
  return nowMs - observedMs > staleAfterMs ? 'stale' : 'current';
}

function laterTimestamp(left, right) {
  if (!left) return right || null;
  if (!right) return left;
  return (toTime(right) ?? 0) >= (toTime(left) ?? 0) ? right : left;
}

function toTime(value) {
  if (value instanceof Date) return Number.isNaN(value.valueOf()) ? null : value.valueOf();
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

module.exports = {
  DEFAULT_STALE_AFTER_MS,
  IDENTITY_FIELDS,
  PROJECTION_VERSION,
  projectRuntimeLifecycle,
  redactStableIdentifier,
  redactEndpoint,
  toRendererLifecycleProjection
};
