'use strict';

const PROJECTION_CONTRACT_VERSION = 1;
const STATE_VALUES = Object.freeze([
  'known', 'unknown', 'transitioning', 'stale', 'disconnected', 'unsupported', 'error'
]);
const DEFAULT_CLOCK = () => Date.now();

/**
 * A small, deterministic current-state projection engine.
 *
 * Definitions are deliberately pure: reducers receive state, an event, and a
 * context, and must return a new domain state. The engine owns ordering,
 * idempotency, environment partitioning, clock/expiry handling, and delivery.
 */
class ProjectionRegistry {
  constructor(options = {}) {
    this.clock = normalizeClock(options.clock || options.now || DEFAULT_CLOCK);
    this.lateEventPolicy = options.lateEventPolicy || 'ignore';
    if (!['ignore', 'accept'].includes(this.lateEventPolicy)) throw new TypeError('lateEventPolicy must be ignore or accept.');
    this.definitions = new Map();
    this.environments = new Map();
    this.subscribers = new Map();
    this.nextSubscriptionId = 1;
    this.sequence = 0;
  }

  register(definition) {
    const definitionCopy = validateDefinition(definition);
    const existing = this.definitions.get(definitionCopy.id);
    if (existing && existing.version !== definitionCopy.version) {
      throw new Error(`Projection ${definitionCopy.id} is already registered at version ${existing.version}.`);
    }
    this.definitions.set(definitionCopy.id, definitionCopy);
    return this;
  }

  unregister(id) { this.definitions.delete(id); }

  apply(event, options = {}) {
    validateEvent(event);
    const environment = this.environments.get(event.environmentKey) || createEnvironment(event.environmentKey);
    this.environments.set(event.environmentKey, environment);
    if (environment.eventIds.has(event.eventId)) return this._result('duplicate', event, []);
    const eventTime = eventTimeMs(event);
    const previousEventTime = environment.lastEventTime;
    if (this.lateEventPolicy === 'ignore' && previousEventTime !== null && eventTime !== null && eventTime < previousEventTime) {
      environment.eventIds.add(event.eventId);
      return this._result('late_ignored', event, []);
    }

    const changed = [];
    const ids = options.projectionIds || Array.from(this.definitions.keys());
    for (const id of ids) {
      const definition = this.definitions.get(id);
      if (!definition || (definition.eventTypes && !definition.eventTypes.includes(event.eventType))) continue;
      const current = environment.projections.get(id) || createProjection(definition, event.environmentKey, this.clock());
      const nextDomainState = definition.reduce(clone(current.domainState), clone(event), reducerContext(this, current, event));
      if (nextDomainState === undefined) throw new TypeError(`Projection ${id} reducer must return state.`);
      const next = {
        ...current,
        domainState: clone(nextDomainState),
        lastEventId: event.eventId,
        lastEventTime: eventTime,
        lastUpdatedAt: this.clock(),
        revision: current.revision + 1,
        sequence: ++this.sequence,
        appliedEventIds: [...current.appliedEventIds, event.eventId].slice(-definition.maxEventIds)
      };
      environment.projections.set(id, next);
      changed.push(this.snapshot(id, event.environmentKey));
    }
    environment.eventIds.add(event.eventId);
    if (eventTime !== null) environment.lastEventTime = Math.max(environment.lastEventTime ?? eventTime, eventTime);
    environment.lastEventId = event.eventId;
    this.environments.set(event.environmentKey, environment);
    const result = this._result('applied', event, changed);
    this._publish(result);
    return result;
  }

  replay(events, options = {}) {
    const ordered = [...(events || [])].sort(compareEvents);
    const results = ordered.map((event) => this.apply(event, options));
    return { count: results.length, applied: results.filter((result) => result.status === 'applied').length, results };
  }

  advance(now = this.clock()) {
    const at = normalizeNow(now);
    const changes = [];
    for (const [environmentKey, environment] of this.environments) {
      for (const id of environment.projections.keys()) {
        const before = this.snapshot(id, environmentKey, at);
        if (before.freshness !== 'current') {
          const after = { ...before, sequence: ++this.sequence };
          changes.push(after);
        }
      }
    }
    if (changes.length) this._publish({ status: 'expired', event: null, changes });
    return changes;
  }

  snapshot(projectionId, environmentKey, now = this.clock()) {
    const definition = this.definitions.get(projectionId);
    const environment = this.environments.get(environmentKey);
    const current = environment?.projections.get(projectionId);
    if (!definition || !current) return null;
    return freezeSnapshot(toSnapshot(definition, current, environmentKey, normalizeNow(now)));
  }

  query(options = {}) {
    const projectionIds = options.projectionId ? [options.projectionId] : Array.from(this.definitions.keys());
    const environmentKeys = options.environmentKey ? [options.environmentKey] : Array.from(this.environments.keys());
    return freezeSnapshot({
      version: PROJECTION_CONTRACT_VERSION,
      activeEnvironmentKey: options.activeEnvironmentKey || environmentKeys.at(-1) || null,
      snapshots: environmentKeys.flatMap((environmentKey) => projectionIds
        .map((id) => this.snapshot(id, environmentKey, options.now)).filter(Boolean))
    });
  }

  subscribe(listener, options = {}) {
    if (typeof listener !== 'function') throw new TypeError('Projection subscriber must be a function.');
    const id = `projection-sub-${this.nextSubscriptionId++}`;
    this.subscribers.set(id, { listener, projectionId: options.projectionId, environmentKey: options.environmentKey });
    return { subscriptionId: id, unsubscribe: () => this.subscribers.delete(id) };
  }

  checkpoint() {
    return freezeSnapshot({
      version: PROJECTION_CONTRACT_VERSION,
      sequence: this.sequence,
      environments: Array.from(this.environments, ([environmentKey, environment]) => ({
        environmentKey,
        lastEventId: environment.lastEventId,
        lastEventTime: environment.lastEventTime,
        eventIds: Array.from(environment.eventIds),
        projections: Array.from(environment.projections, ([projectionId, state]) => ({ projectionId, state: clone(state) }))
      }))
    });
  }

  restore(checkpoint) {
    validateCheckpoint(checkpoint);
    this.environments.clear();
    this.sequence = checkpoint.sequence;
    for (const saved of checkpoint.environments) {
      const environment = createEnvironment(saved.environmentKey);
      environment.lastEventId = saved.lastEventId;
      environment.lastEventTime = saved.lastEventTime;
      environment.eventIds = new Set(saved.eventIds);
      for (const savedProjection of saved.projections) {
        const definition = this.definitions.get(savedProjection.projectionId);
        if (!definition || definition.version !== savedProjection.state.projectionVersion) {
          throw new Error(`Unsupported checkpoint projection ${savedProjection.projectionId}.`);
        }
        environment.projections.set(savedProjection.projectionId, clone(savedProjection.state));
      }
      this.environments.set(saved.environmentKey, environment);
    }
    return this.query();
  }

  reset(environmentKey) {
    if (environmentKey === undefined) this.environments.clear();
    else this.environments.delete(environmentKey);
  }

  _result(status, event, changes) {
    return { version: PROJECTION_CONTRACT_VERSION, status, eventId: event?.eventId || null, changes: changes.map(freezeSnapshot) };
  }

  _publish(result) {
    for (const subscriber of this.subscribers.values()) {
      if (result.changes.some((change) => (!subscriber.projectionId || subscriber.projectionId === change.projectionId)
        && (!subscriber.environmentKey || subscriber.environmentKey === change.environmentKey))) subscriber.listener(result);
    }
  }
}

function createEnvironment(environmentKey) {
  return { environmentKey, projections: new Map(), eventIds: new Set(), lastEventId: null, lastEventTime: null };
}

function createProjection(definition, environmentKey, now) {
  const initial = definition.initialState({ environmentKey, now });
  if (initial === undefined) throw new TypeError(`Projection ${definition.id} initialState must return state.`);
  return { projectionId: definition.id, projectionVersion: definition.version, environmentKey, domainState: clone(initial), lastEventId: null, lastEventTime: null, lastUpdatedAt: now, revision: 0, sequence: 0, appliedEventIds: [] };
}

function toSnapshot(definition, current, environmentKey, now) {
  const fields = normalizeFields(current.domainState.fields, definition.fieldExpiry, now);
  const freshness = Object.values(fields).some((field) => field.state === 'stale') ? 'stale'
    : Object.values(fields).some((field) => field.state === 'unknown') ? 'unknown' : 'current';
  return {
    version: PROJECTION_CONTRACT_VERSION,
    projectionId: definition.id,
    projectionVersion: definition.version,
    environmentKey,
    state: current.domainState.state || inferState(fields),
    freshness,
    value: current.domainState.value === undefined ? null : clone(current.domainState.value),
    fields,
    lastEventId: current.lastEventId,
    lastEventAt: current.lastEventTime === null ? null : new Date(current.lastEventTime).toISOString(),
    updatedAt: new Date(current.lastUpdatedAt).toISOString(),
    revision: current.revision,
    sequence: current.sequence
  };
}

function normalizeFields(fields = {}, expiry, now) {
  return Object.fromEntries(Object.entries(fields).map(([name, raw]) => {
    const field = typeof raw === 'object' && raw !== null && !Array.isArray(raw) && 'state' in raw ? raw : { value: raw, state: raw === undefined ? 'unknown' : 'known' };
    const normalized = { state: field.state || 'unknown', value: field.value === undefined ? null : clone(field.value), observedAt: field.observedAt || null, provenance: field.provenance || 'observed', confidence: field.confidence || 'unknown', supportingEventIds: [...(field.supportingEventIds || (field.evidenceEventId ? [field.evidenceEventId] : []))] };
    const expiryMs = expiry?.[name];
    const observedMs = normalizeNow(normalized.observedAt);
    if (Number.isFinite(expiryMs) && observedMs !== null && now - observedMs >= expiryMs && !['unsupported', 'error'].includes(normalized.state)) normalized.state = 'stale';
    return [name, normalized];
  }));
}

function inferState(fields) {
  const states = Object.values(fields).map((field) => field.state);
  return states.length && states.every((state) => state === 'unknown') ? 'unknown' : 'known';
}

function reducerContext(engine, current, event) {
  return { now: engine.clock(), environmentKey: event.environmentKey, previousEventId: current.lastEventId, previousEventAt: current.lastEventTime === null ? null : new Date(current.lastEventTime).toISOString() };
}

function validateDefinition(definition) {
  if (!definition || typeof definition !== 'object' || typeof definition.id !== 'string' || !definition.id.trim()) throw new TypeError('Projection definition id is required.');
  if (!Number.isSafeInteger(definition.version) || definition.version < 1) throw new TypeError('Projection definition version must be a positive integer.');
  if (typeof definition.initialState !== 'function' || typeof definition.reduce !== 'function') throw new TypeError('Projection definition requires initialState and reduce functions.');
  return { ...definition, id: definition.id.trim(), maxEventIds: Number.isSafeInteger(definition.maxEventIds) && definition.maxEventIds > 0 ? definition.maxEventIds : 1000, fieldExpiry: { ...(definition.fieldExpiry || {}) }, eventTypes: definition.eventTypes ? [...definition.eventTypes] : null };
}

function validateEvent(event) {
  if (!event || typeof event !== 'object' || typeof event.eventId !== 'string' || !event.eventId || typeof event.environmentKey !== 'string' || !event.environmentKey) throw new TypeError('Projection events require eventId and environmentKey.');
}

function validateCheckpoint(checkpoint) {
  if (!checkpoint || checkpoint.version !== PROJECTION_CONTRACT_VERSION || !Array.isArray(checkpoint.environments)) throw new TypeError('Unsupported projection checkpoint.');
}

function eventTimeMs(event) { return normalizeNow(event.sourceTimestamp || event.timestamp || event.observedAt); }
function normalizeClock(clock) { return () => normalizeNow(clock()) ?? Date.now(); }
function normalizeNow(value) { if (value instanceof Date) return Number.isFinite(value.valueOf()) ? value.valueOf() : null; if (typeof value === 'number') return Number.isFinite(value) ? value : null; const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : null; }
function compareEvents(left, right) { return (eventTimeMs(left) ?? 0) - (eventTimeMs(right) ?? 0) || String(left.eventId).localeCompare(String(right.eventId)); }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function freezeSnapshot(value) { if (!value || typeof value !== 'object') return value; Object.freeze(value); for (const child of Object.values(value)) if (child && typeof child === 'object' && !Object.isFrozen(child)) freezeSnapshot(child); return value; }

module.exports = { PROJECTION_CONTRACT_VERSION, STATE_VALUES, ProjectionRegistry, compareEvents, normalizeFields };
