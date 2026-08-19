const {
  createPartitionedIdentity,
  createRuntimeEvent,
  createRuntimeEventOrderKey
} = require('./contracts/runtimeEvents');

const DEFAULT_DEDUPE_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_CORRELATION_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_DEDUPE_ENTRIES = 5_000;
const DEFAULT_MAX_DECISIONS = 500;

const EVENT_FAMILY_POLICY_OVERRIDES = Object.freeze({
  ClientBuildObserved: { dedupeWindowMs: 24 * 60 * 60 * 1000, correlationWindowMs: 24 * 60 * 60 * 1000 },
  ReleaseEnvironmentObserved: { dedupeWindowMs: 24 * 60 * 60 * 1000, correlationWindowMs: 24 * 60 * 60 * 1000 },
  GameDataVersionObserved: { dedupeWindowMs: 24 * 60 * 60 * 1000, correlationWindowMs: 24 * 60 * 60 * 1000 },
  LoginStarted: { dedupeWindowMs: 30 * 60 * 1000 },
  AccountAuthenticated: { dedupeWindowMs: 30 * 60 * 1000 },
  IdentityObserved: { dedupeWindowMs: 30 * 60 * 1000 },
  PuJoinRequested: { dedupeWindowMs: 30 * 60 * 1000 },
  PuReplicationConnectionEstablished: { dedupeWindowMs: 30 * 60 * 1000 },
  UniverseHierarchyRegistered: { dedupeWindowMs: 30 * 60 * 1000 },
  PuTerritorySetupCompleted: { dedupeWindowMs: 30 * 60 * 1000 },
  PuEntered: { dedupeWindowMs: 30 * 60 * 1000 },
  PuDisconnected: { dedupeWindowMs: 30 * 60 * 1000 },
  ReturnedToFrontend: { dedupeWindowMs: 30 * 60 * 1000 },
  ApplicationExited: { dedupeWindowMs: 30 * 60 * 1000 },
  PartyLeft: { dedupeWindowMs: 30 * 60 * 1000 }
});

class RuntimeEventOrchestrator {
  constructor(options = {}) {
    this.maxDedupeEntries = positiveInteger(options.maxDedupeEntries, DEFAULT_MAX_DEDUPE_ENTRIES);
    this.maxDecisions = positiveInteger(options.maxDecisions, DEFAULT_MAX_DECISIONS);
    this.defaultDedupeWindowMs = positiveInteger(options.dedupeWindowMs, DEFAULT_DEDUPE_WINDOW_MS);
    this.defaultCorrelationWindowMs = positiveInteger(options.correlationWindowMs, DEFAULT_CORRELATION_WINDOW_MS);
    this.ingestionSequence = nonNegativeInteger(options.ingestionSequence, 0);
    this.sourceGeneration = nonNegativeInteger(options.sourceGeneration, 0);
    this.dedupeEntries = new Map();
    this.decisions = [];
    this.stats = {
      emitted: 0,
      duplicateSuppressed: 0,
      conflicts: 0,
      dedupeEvictions: 0,
      sourceScopeResets: 0
    };
  }

  resetSourceScope(scope = {}) {
    this.sourceGeneration = nonNegativeInteger(scope.sourceGeneration, this.sourceGeneration + 1);
    this.dedupeEntries.clear();
    this.stats.sourceScopeResets += 1;
    this.recordDecision({
      decision: 'source_scope_reset',
      reason: 'source_generation_changed',
      sourceGeneration: this.sourceGeneration
    });
  }

  processRecord(input) {
    const record = input.record || {};
    const candidates = Array.isArray(input.candidates) ? input.candidates : [];
    const diagnostics = [];
    const unknownEvidence = [];
    const emitted = [];
    const byEventType = groupByEventType(candidates);

    for (const [eventType, eventCandidates] of byEventType.entries()) {
      const distinctPayloads = new Set(eventCandidates.map((candidate) => stableStringify(candidate.event.payload)));
      if (distinctPayloads.size > 1) {
        this.stats.conflicts += 1;
        diagnostics.push({
          code: 'match_conflict',
          severity: 'error',
          message: 'Conflicting extractor matches were quarantined for this record.',
          lineNumber: record.startLineNumber,
          sourceByteOffset: record.sourceByteOffset,
          details: {
            eventType,
            extractorIds: eventCandidates.map((candidate) => candidate.extractorId).sort()
          }
        });
        unknownEvidence.push({
          reason: 'match_conflict',
          evidenceMarkers: eventCandidates.flatMap((candidate) => candidate.event.evidenceReference.evidenceMarkers || []),
          sensitivity: 'local'
        });
        this.recordDecision({
          decision: 'quarantined_conflict',
          reason: 'conflicting_payloads',
          eventType,
          extractorIds: eventCandidates.map((candidate) => candidate.extractorId).sort()
        });
        continue;
      }

      const candidate = eventCandidates.slice().sort(compareCandidate)[0];
      const policy = candidate.policy || getRuntimeEventFamilyPolicy(eventType, candidate.extractor || {});
      this.evictExpired(candidate.event, policy);
      const duplicate = this.findDuplicate(candidate, policy);
      if (duplicate) {
        this.stats.duplicateSuppressed += 1;
        this.recordDecision({
          decision: 'suppressed_duplicate',
          reason: duplicate.reason,
          eventType,
          dedupeKey: candidate.dedupeKey,
          retainedEventId: duplicate.entry.eventId,
          candidateEventId: candidate.event.eventId,
          policyId: policy.policyId
        });
        continue;
      }

      const event = this.prepareEmittedEvent(candidate, policy, record);
      this.rememberDedupe(candidate.dedupeKey, event, policy);
      this.stats.emitted += 1;
      emitted.push(event);
      this.recordDecision({
        decision: 'emitted',
        reason: 'unique_within_bounded_window',
        eventType,
        eventId: event.eventId,
        dedupeKey: candidate.dedupeKey,
        policyId: policy.policyId,
        orderKey: createRuntimeEventOrderKey(event)
      });
    }

    return { emitted, diagnostics, unknownEvidence, decisions: this.getRecentDecisions() };
  }

  prepareEmittedEvent(candidate, policy, record) {
    const ordering = {
      ...candidate.event.ordering,
      ingestionSequence: ++this.ingestionSequence
    };
    if (Number.isSafeInteger(record.sourceGeneration)) ordering.sourceGeneration = record.sourceGeneration;
    if (Number.isSafeInteger(record.sourceChunkSequence)) ordering.sourceChunkSequence = record.sourceChunkSequence;

    const extensions = {
      ...(candidate.event.extensions || {}),
      orchestration: {
        policyId: policy.policyId,
        decision: 'emitted',
        reason: 'unique_within_bounded_window',
        dedupeWindowMs: policy.dedupeWindowMs,
        correlationWindowMs: policy.correlationWindowMs,
        orderKey: createRuntimeEventOrderKey({ ...candidate.event, ordering }),
        extractorIds: [candidate.extractorId]
      }
    };

    return createRuntimeEvent({
      ...candidate.event,
      ordering,
      extensions
    });
  }

  findDuplicate(candidate, policy) {
    const entry = this.dedupeEntries.get(candidate.dedupeKey);
    if (!entry) return null;

    const sourceGeneration = candidate.event.ordering.sourceGeneration;
    const sourceByteOffset = candidate.event.ordering.sourceByteOffset;
    if (
      Number.isSafeInteger(sourceGeneration) &&
      Number.isSafeInteger(sourceByteOffset) &&
      entry.sourceGeneration === sourceGeneration &&
      entry.sourceByteOffset === sourceByteOffset
    ) {
      return { entry, reason: 'same_source_location' };
    }

    const candidateTime = timestampMs(candidate.event.sourceTimestamp);
    if (Math.abs(candidateTime - entry.sourceTimeMs) <= policy.dedupeWindowMs) {
      return { entry, reason: 'same_family_identity_within_window' };
    }

    return null;
  }

  rememberDedupe(dedupeKey, event, policy) {
    const sourceTimeMs = timestampMs(event.sourceTimestamp);
    this.dedupeEntries.set(dedupeKey, {
      dedupeKey,
      eventId: event.eventId,
      eventType: event.eventType,
      environmentKey: event.environmentKey,
      sourceTimeMs,
      expiresAtMs: sourceTimeMs + policy.dedupeWindowMs,
      sourceGeneration: event.ordering.sourceGeneration,
      sourceByteOffset: event.ordering.sourceByteOffset
    });
    this.evictOverflow();
  }

  evictExpired(event, policy) {
    const nowMs = timestampMs(event.sourceTimestamp);
    for (const [key, entry] of this.dedupeEntries.entries()) {
      if (entry.expiresAtMs < nowMs) {
        this.dedupeEntries.delete(key);
        this.stats.dedupeEvictions += 1;
      }
    }
  }

  evictOverflow() {
    while (this.dedupeEntries.size > this.maxDedupeEntries) {
      const firstKey = this.dedupeEntries.keys().next().value;
      this.dedupeEntries.delete(firstKey);
      this.stats.dedupeEvictions += 1;
    }
  }

  recordDecision(decision) {
    this.decisions.push({
      decidedAtSequence: this.ingestionSequence,
      ...decision
    });
    while (this.decisions.length > this.maxDecisions) this.decisions.shift();
  }

  getRecentDecisions() {
    return this.decisions.slice();
  }

  getStats() {
    return {
      ...this.stats,
      dedupeEntries: this.dedupeEntries.size,
      ingestionSequence: this.ingestionSequence
    };
  }
}

function getRuntimeEventFamilyPolicy(eventType, extractor = {}, options = {}) {
  const override = EVENT_FAMILY_POLICY_OVERRIDES[eventType] || {};
  const dedupeFields = Array.isArray(extractor.dedupeFields) && extractor.dedupeFields.length > 0
    ? extractor.dedupeFields.slice()
    : [];
  return Object.freeze({
    policyId: `runtime-event-orchestration/${eventType}/v1`,
    eventType,
    dedupeFields: Object.freeze(dedupeFields),
    dedupeWindowMs: positiveInteger(options.dedupeWindowMs || override.dedupeWindowMs, DEFAULT_DEDUPE_WINDOW_MS),
    correlationWindowMs: positiveInteger(options.correlationWindowMs || override.correlationWindowMs, DEFAULT_CORRELATION_WINDOW_MS),
    reason: 'fixture_promoted_event_family_policy'
  });
}

function buildDedupeKey(environmentKey, eventType, payload, fields = []) {
  return createPartitionedIdentity(environmentKey, 'dedupe', [
    eventType,
    ...fields.map((field) => payload[field])
  ]);
}

function groupByEventType(candidates) {
  const byEventType = new Map();
  for (const candidate of candidates) {
    const eventType = candidate.event.eventType;
    if (!byEventType.has(eventType)) byEventType.set(eventType, []);
    byEventType.get(eventType).push(candidate);
  }
  return byEventType;
}

function compareCandidate(left, right) {
  return String(left.extractorId).localeCompare(String(right.extractorId));
}

function timestampMs(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function nonNegativeInteger(value, fallback) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function stableStringify(value) {
  return JSON.stringify(sortForStableSerialization(value));
}

function sortForStableSerialization(value) {
  if (Array.isArray(value)) return value.map(sortForStableSerialization);
  if (!value || typeof value !== 'object' || value.constructor !== Object) return value;
  return Object.fromEntries(Object.keys(value)
    .sort()
    .filter((key) => value[key] !== undefined)
    .map((key) => [key, sortForStableSerialization(value[key])]));
}

module.exports = {
  DEFAULT_CORRELATION_WINDOW_MS,
  DEFAULT_DEDUPE_WINDOW_MS,
  RuntimeEventOrchestrator,
  buildDedupeKey,
  getRuntimeEventFamilyPolicy
};
