const { compareRuntimeEventOrder } = require('./contracts/runtimeEvents');
const { redactStableIdentifier } = require('./runtimeLifecycleProjection');

const SNAPSHOT_VERSION = 1;
const DEFAULT_SNAPSHOT_STALE_AFTER_MS = 15_000;
const PARTY_EVENT_TYPES = Object.freeze(['PartyCreated', 'PartyLaunchInitiated', 'PartyMemberConnected', 'PartyLeft']);
const LOCATION_EVENT_TYPES = Object.freeze(['JurisdictionEntered', 'MonitoredSpaceEntered', 'MonitoredSpaceExited', 'ArmisticeStateChanged']);
const SESSION_BOUNDARY_EVENT_TYPES = Object.freeze(['PuDisconnected', 'ReturnedToFrontend', 'ApplicationExited']);

function projectRuntimeParty(events, options = {}) {
  const projections = new Map();
  const orderedEvents = [...(events || [])].sort(compareRuntimeEventOrder);

  for (const event of orderedEvents) {
    if (!event?.environmentKey || !event.environment) continue;
    const projection = getOrCreateProjection(projections, event, createPartyProjection);

    if (event.eventType === 'PartyCreated') {
      applyPartyCreated(projection, event);
    } else if (event.eventType === 'PartyLaunchInitiated') {
      applyPartyLaunchInitiated(projection, event);
    } else if (event.eventType === 'PartyMemberConnected') {
      applyPartyMemberConnected(projection, event);
    } else if (event.eventType === 'PartyLeft') {
      applyPartyLeft(projection, event);
    } else if (SESSION_BOUNDARY_EVENT_TYPES.includes(event.eventType)) {
      stalePartyProjection(projection, event);
    }
  }

  finalizePartyProjections(projections, options);
  return toProjectionCollection(projections, options.activeEnvironmentKey, orderedEvents);
}

function projectRuntimeLocation(events, options = {}) {
  const projections = new Map();
  const orderedEvents = [...(events || [])].sort(compareRuntimeEventOrder);

  for (const event of orderedEvents) {
    if (!event?.environmentKey || !event.environment) continue;
    const projection = getOrCreateProjection(projections, event, createLocationProjection);

    if (event.eventType === 'JurisdictionEntered') {
      projection.jurisdiction = fact({
        state: 'last_confirmed',
        value: sanitizeDisplayText(event.payload.jurisdiction),
        event
      });
      projection.lastChangedAt = laterTimestamp(projection.lastChangedAt, event.sourceTimestamp);
    } else if (event.eventType === 'MonitoredSpaceEntered') {
      projection.monitoredSpace = fact({
        state: 'entered',
        value: true,
        event
      });
      projection.lastChangedAt = laterTimestamp(projection.lastChangedAt, event.sourceTimestamp);
    } else if (event.eventType === 'MonitoredSpaceExited') {
      projection.monitoredSpace = fact({
        state: 'exited',
        value: false,
        event
      });
      projection.lastChangedAt = laterTimestamp(projection.lastChangedAt, event.sourceTimestamp);
    } else if (event.eventType === 'ArmisticeStateChanged') {
      const entered = event.payload.state === 'entered';
      projection.armistice = fact({
        state: entered ? 'entered' : 'left',
        value: entered,
        event
      });
      projection.lastChangedAt = laterTimestamp(projection.lastChangedAt, event.sourceTimestamp);
    } else if (SESSION_BOUNDARY_EVENT_TYPES.includes(event.eventType)) {
      staleLocationProjection(projection, event);
    }
  }

  finalizeLocationProjections(projections, options);
  return toProjectionCollection(projections, options.activeEnvironmentKey, orderedEvents);
}

function getOrCreateProjection(projections, event, factory) {
  if (!projections.has(event.environmentKey)) projections.set(event.environmentKey, factory(event));
  return projections.get(event.environmentKey);
}

function createPartyProjection(event) {
  return {
    version: SNAPSHOT_VERSION,
    environmentKey: event.environmentKey,
    environment: event.environment,
    state: 'unknown',
    freshness: 'unknown',
    partyId: null,
    leader: {
      status: 'unknown',
      handle: null,
      isLocalPlayer: null,
      observedAt: null,
      confidence: 'unknown',
      evidenceEventId: null
    },
    membersByHandle: new Map(),
    confirmedMemberCount: 0,
    possibleMemberCount: 0,
    recentTransitions: [],
    lastChangedAt: null,
    limitation: 'Only explicit local creation/leave, launch, and named connection evidence are promoted for this profile.'
  };
}

function applyPartyCreated(projection, event) {
  const leaderHandle = sanitizeDisplayText(event.payload.leaderHandle);
  projection.state = 'in_party';
  projection.partyId = event.payload.partyId || projection.partyId;
  projection.leader = {
    status: 'known',
    handle: leaderHandle,
    isLocalPlayer: true,
    observedAt: event.sourceTimestamp,
    confidence: event.confidence,
    evidenceEventId: event.eventId
  };
  upsertPartyMember(projection, leaderHandle, {
    membershipState: 'confirmed',
    connectionState: 'unknown',
    isLeader: true,
    isLocalPlayer: true,
    latestTransition: 'Party created',
    observedAt: event.sourceTimestamp,
    confidence: event.confidence,
    evidenceEventId: event.eventId
  });
  addTransition(projection, event, 'Party created', leaderHandle);
}

function applyPartyLaunchInitiated(projection, event) {
  addTransition(projection, event, 'Party launch initiated', null);
}

function applyPartyMemberConnected(projection, event) {
  const memberHandle = sanitizeDisplayText(event.payload.memberHandle);
  upsertPartyMember(projection, memberHandle, {
    membershipState: 'possible',
    connectionState: 'connected',
    isLeader: projection.leader.handle === memberHandle,
    isLocalPlayer: false,
    latestTransition: 'Member connected',
    observedAt: event.sourceTimestamp,
    confidence: event.confidence,
    evidenceEventId: event.eventId
  });
  addTransition(projection, event, 'Member connected', memberHandle);
}

function applyPartyLeft(projection, event) {
  projection.state = 'not_in_party';
  projection.partyId = null;
  projection.leader = {
    status: 'unknown',
    handle: null,
    isLocalPlayer: null,
    observedAt: event.sourceTimestamp,
    confidence: event.confidence,
    evidenceEventId: event.eventId
  };
  projection.membersByHandle.clear();
  addTransition(projection, event, 'Left party', null);
}

function stalePartyProjection(projection, event) {
  if (!projection.lastChangedAt) return;
  if (projection.state === 'in_party') projection.state = 'stale';
  if (projection.leader.status === 'known') projection.leader.status = 'stale';
  for (const member of projection.membersByHandle.values()) {
    if (member.connectionState === 'connected') member.connectionState = 'stale';
    if (member.membershipState === 'confirmed' || member.membershipState === 'possible') {
      member.membershipState = 'stale';
    }
  }
  projection.lastChangedAt = laterTimestamp(projection.lastChangedAt, event.sourceTimestamp);
}

function upsertPartyMember(projection, handle, patch) {
  if (!handle) return;
  const current = projection.membersByHandle.get(handle) || {
    handle,
    membershipState: 'unknown',
    connectionState: 'unknown',
    isLeader: false,
    isLocalPlayer: false,
    latestTransition: null,
    observedAt: null,
    confidence: 'unknown',
    evidenceEventId: null
  };
  projection.membersByHandle.set(handle, { ...current, ...patch, handle });
}

function addTransition(projection, event, label, subjectHandle) {
  projection.lastChangedAt = laterTimestamp(projection.lastChangedAt, event.sourceTimestamp);
  projection.recentTransitions.unshift({
    eventType: event.eventType,
    label,
    subjectHandle,
    observedAt: event.sourceTimestamp,
    confidence: event.confidence,
    evidenceEventId: event.eventId
  });
  projection.recentTransitions = projection.recentTransitions.slice(0, 10);
}

function finalizePartyProjections(projections, options) {
  const nowMs = toTime(options.now) ?? Date.now();
  const staleAfterMs = positiveInteger(options.staleAfterMs) || DEFAULT_SNAPSHOT_STALE_AFTER_MS;

  for (const projection of projections.values()) {
    projection.freshness = classifyFreshness(projection.lastChangedAt, nowMs, staleAfterMs);
    if (projection.freshness === 'stale' && projection.state === 'in_party') {
      projection.state = 'stale';
    }
    for (const member of projection.membersByHandle.values()) {
      if (member.observedAt && nowMs - toTime(member.observedAt) > staleAfterMs) {
        if (member.connectionState === 'connected') member.connectionState = 'stale';
        if (member.membershipState === 'confirmed' || member.membershipState === 'possible') {
          member.membershipState = 'stale';
        }
      }
    }
    const members = Array.from(projection.membersByHandle.values());
    projection.confirmedMemberCount = members.filter((member) => member.membershipState === 'confirmed').length;
    projection.possibleMemberCount = members.filter((member) => member.membershipState === 'possible').length;
  }
}

function createLocationProjection(event) {
  return {
    version: SNAPSHOT_VERSION,
    environmentKey: event.environmentKey,
    environment: event.environment,
    state: 'unknown',
    freshness: 'unknown',
    jurisdiction: emptyFact(),
    monitoredSpace: emptyFact(),
    armistice: emptyFact(),
    exactLocation: {
      state: 'unsupported',
      value: null,
      reason: 'No exact-location, destination, or travel source is promoted for this profile.'
    },
    lastChangedAt: null
  };
}

function staleLocationProjection(projection, event) {
  if (!projection.lastChangedAt) return;
  for (const key of ['jurisdiction', 'monitoredSpace', 'armistice']) {
    if (projection[key].state !== 'unknown') projection[key].state = 'stale';
  }
  projection.lastChangedAt = laterTimestamp(projection.lastChangedAt, event.sourceTimestamp);
}

function finalizeLocationProjections(projections, options) {
  const nowMs = toTime(options.now) ?? Date.now();
  const staleAfterMs = positiveInteger(options.staleAfterMs) || DEFAULT_SNAPSHOT_STALE_AFTER_MS;

  for (const projection of projections.values()) {
    for (const key of ['jurisdiction', 'monitoredSpace', 'armistice']) {
      const observedMs = toTime(projection[key].observedAt);
      if (observedMs !== null && nowMs - observedMs > staleAfterMs) projection[key].state = 'stale';
    }
    projection.freshness = classifyFreshness(projection.lastChangedAt, nowMs, staleAfterMs);
    projection.state = locationState(projection);
  }
}

function locationState(projection) {
  const states = [projection.jurisdiction.state, projection.monitoredSpace.state, projection.armistice.state];
  if (states.some((state) => state !== 'unknown' && state !== 'stale')) return 'known';
  if (states.some((state) => state === 'stale')) return 'stale';
  return 'unknown';
}

function fact({ state, value, event }) {
  return {
    state,
    value,
    observedAt: event.sourceTimestamp,
    confidence: event.confidence,
    provenance: event.provenance,
    evidenceEventId: event.eventId
  };
}

function emptyFact() {
  return {
    state: 'unknown',
    value: null,
    observedAt: null,
    confidence: 'unknown',
    provenance: 'observed',
    evidenceEventId: null
  };
}

function toProjectionCollection(projections, activeEnvironmentKey, orderedEvents) {
  return {
    version: SNAPSHOT_VERSION,
    activeEnvironmentKey: activeEnvironmentKey || orderedEvents.at(-1)?.environmentKey || null,
    environments: Object.fromEntries(projections)
  };
}

function toRendererPartySnapshot(result) {
  if (!result) return null;
  const environments = {};
  for (const [environmentKey, projection] of Object.entries(result.environments || {})) {
    environments[environmentKey] = {
      version: projection.version,
      environmentKey,
      environment: { ...projection.environment },
      state: projection.state,
      freshness: projection.freshness,
      partyId: projection.partyId ? redactStableIdentifier(projection.partyId) : null,
      leader: { ...projection.leader },
      members: Array.from(projection.membersByHandle.values())
        .map((member) => ({ ...member }))
        .sort(compareMembers),
      confirmedMemberCount: projection.confirmedMemberCount,
      possibleMemberCount: projection.possibleMemberCount,
      recentTransitions: projection.recentTransitions.map((transition) => ({ ...transition })),
      lastChangedAt: projection.lastChangedAt,
      limitation: projection.limitation
    };
  }
  return { version: SNAPSHOT_VERSION, activeEnvironmentKey: result.activeEnvironmentKey, environments };
}

function toRendererLocationSnapshot(result) {
  if (!result) return null;
  const environments = {};
  for (const [environmentKey, projection] of Object.entries(result.environments || {})) {
    environments[environmentKey] = {
      version: projection.version,
      environmentKey,
      environment: { ...projection.environment },
      state: projection.state,
      freshness: projection.freshness,
      jurisdiction: { ...projection.jurisdiction },
      monitoredSpace: { ...projection.monitoredSpace },
      armistice: { ...projection.armistice },
      exactLocation: { ...projection.exactLocation },
      lastChangedAt: projection.lastChangedAt
    };
  }
  return { version: SNAPSHOT_VERSION, activeEnvironmentKey: result.activeEnvironmentKey, environments };
}

function compareMembers(left, right) {
  return Number(right.isLeader) - Number(left.isLeader)
    || Number(right.isLocalPlayer) - Number(left.isLocalPlayer)
    || String(left.handle).localeCompare(String(right.handle));
}

function sanitizeDisplayText(value, maxLength = 80) {
  const text = String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
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
  DEFAULT_SNAPSHOT_STALE_AFTER_MS,
  LOCATION_EVENT_TYPES,
  PARTY_EVENT_TYPES,
  SNAPSHOT_VERSION,
  projectRuntimeLocation,
  projectRuntimeParty,
  toRendererLocationSnapshot,
  toRendererPartySnapshot
};
