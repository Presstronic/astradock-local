const crypto = require('node:crypto');
const { earlierInstant, laterInstant, normalizeAbsoluteInstant, toEpochMilliseconds } = require('./time');

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_UNKNOWN_EVIDENCE_POLICY = Object.freeze({
  retentionMs: THIRTY_DAYS_MS,
  maxSamples: 250,
  maxSampleBytes: 320,
  maxTotalSampleBytes: 96 * 1024,
  maxSamplesPerBucket: 4,
  maxBuckets: 1_000,
  usefulNoiseSampleEvery: 25,
  retentionCheckIntervalMs: 60 * 1000
});

const SENSITIVITY_ORDER = Object.freeze({
  public: 0,
  local: 1,
  personal: 2,
  social: 3,
  secret: 4
});

const UNKNOWN_CATEGORIES = Object.freeze({
  unsupported_profile: 'compatibility.unsupported_profile',
  no_profile_match: 'parser.unmatched_record',
  matched_missing_required_fields: 'parser.incomplete_match',
  match_conflict: 'parser.conflicting_match',
  low_value_noise: 'noise.low_value'
});

class UnknownEvidenceStore {
  constructor(options = {}) {
    this.policy = normalizePolicy(options.policy);
    this.now = options.now || (() => new Date().toISOString());
    this.buckets = new Map();
    this.bucketOrder = [];
    this.totalSamples = 0;
    this.totalSampleBytes = 0;
    this.sequence = 0;
    this.lastRetentionCheckMs = 0;
  }

  capture(input) {
    const observedAt = normalizeTimestamp(input.observedAt || input.sourceTimestamp) || this.now();
    this.applyRetention(observedAt, { lazy: true });

    const environmentKey = requiredText(input.environmentKey, 'UNKNOWN_ENVIRONMENT');
    const gameBuild = requiredText(input.gameBuild, 'UNKNOWN_BUILD');
    const reason = normalizeReason(input.reason);
    const classification = classifyUnknownEvidence(input.text, reason);
    const fingerprintSeed = classification.lowValue ? '' : null;
    const preFingerprint = fingerprintEvidence({
      environmentKey,
      gameBuild,
      category: classification.category,
      reason,
      snippet: fingerprintSeed || '',
      markers: input.evidenceMarkers || classification.evidenceMarkers
    });
    const preKey = [environmentKey, gameBuild, classification.category, preFingerprint].join('|');
    const existingLowValue = classification.lowValue ? this.buckets.get(preKey) : null;
    const needsLowValueSample = !classification.lowValue ||
      !existingLowValue ||
      existingLowValue.count === 0 ||
      (existingLowValue.count + 1) % this.policy.usefulNoiseSampleEvery === 0;
    const minimized = needsLowValueSample
      ? minimizeUnknownEvidence(input.text, {
        maxSampleBytes: this.policy.maxSampleBytes,
        baseSensitivity: input.sensitivity || classification.sensitivity
      })
      : {
        snippet: '',
        originalByteLength: normalizedByteLength(input.text),
        byteLength: 0,
        sensitivity: input.sensitivity || classification.sensitivity,
        redactionApplied: false,
        redactedKinds: []
      };
    const sensitivity = maxSensitivity(classification.sensitivity, minimized.sensitivity);
    const category = classification.category;
    const fingerprint = classification.lowValue ? preFingerprint : fingerprintEvidence({
      environmentKey,
      gameBuild,
      category,
      reason,
      snippet: minimized.snippet,
      markers: input.evidenceMarkers || classification.evidenceMarkers
    });
    const key = [environmentKey, gameBuild, category, fingerprint].join('|');
    const existing = this.buckets.get(key);
    const bucket = existing || this.createBucket({
      key,
      environmentKey,
      releaseChannel: input.releaseChannel || null,
      gameBuild,
      reason,
      category,
      fingerprint,
      sourceProfileId: input.sourceProfileId || null,
      sourceProfileVersion: input.sourceProfileVersion || null,
      parserVersion: input.parserVersion || null,
      sourceTimestamp: input.sourceTimestamp || null,
      firstObservedAt: observedAt,
      sensitivity,
      evidenceMarkers: input.evidenceMarkers || classification.evidenceMarkers
    });

    bucket.count += 1;
    bucket.byteCount += normalizedByteLength(input.text);
    bucket.lastObservedAt = observedAt;
    bucket.sourceTimestamp = input.sourceTimestamp || bucket.sourceTimestamp;
    bucket.sensitivity = maxSensitivity(bucket.sensitivity, sensitivity);
    bucket.redactionApplied = bucket.redactionApplied || minimized.redactionApplied;
    bucket.lowValue = classification.lowValue;

    if (this.shouldStoreSample(bucket, minimized)) {
      const sample = {
        sampleId: `unk_${hashStable([key, this.sequence += 1]).slice(0, 24)}`,
        observedAt,
        sourceTimestamp: input.sourceTimestamp || null,
        lineRange: normalizeLineRange(input.lineRange),
        sourceByteOffset: Number.isSafeInteger(input.sourceByteOffset) ? input.sourceByteOffset : null,
        snippet: minimized.snippet,
        byteLength: minimized.byteLength,
        originalByteLength: minimized.originalByteLength,
        sensitivity,
        redactionApplied: minimized.redactionApplied,
        redactedKinds: minimized.redactedKinds
      };
      bucket.samples.push(sample);
      bucket.sampleCount += 1;
      bucket.sampleByteCount += sample.byteLength;
      this.totalSamples += 1;
      this.totalSampleBytes += sample.byteLength;
    } else {
      bucket.droppedSampleCount += 1;
    }

    this.pruneCapacity();
    return this.toBucketSummary(bucket, { includeSamples: false });
  }

  query(query = {}) {
    this.applyRetention(query.now);
    const cursor = normalizeInteger(query.cursor, 0, Number.MAX_SAFE_INTEGER, 0);
    const limit = normalizeInteger(query.limit, 1, 500, 100);
    const includeSamples = query.includeSamples === true;
    const rows = this.filteredBuckets(query)
      .sort(compareBuckets)
      .map((bucket) => this.toBucketSummary(bucket, { includeSamples }));
    const items = rows.slice(cursor, cursor + limit);
    return {
      cursor,
      nextCursor: cursor + items.length < rows.length ? cursor + items.length : null,
      totalCount: rows.length,
      items,
      summary: this.getSummary(query)
    };
  }

  delete(scope = {}) {
    this.applyRetention(scope.now);
    const before = this.getSummary({ includeCategories: false });
    let matchedKeys;

    if (scope.mode === 'reset' || scope.all === true) {
      matchedKeys = Array.from(this.buckets.keys());
    } else {
      matchedKeys = this.filteredBuckets(scope)
        .filter((bucket) => {
          if (scope.sensitiveOnly === true || scope.mode === 'sensitive_evidence') {
            return SENSITIVITY_ORDER[bucket.sensitivity] >= SENSITIVITY_ORDER.personal;
          }
          return true;
        })
        .map((bucket) => bucket.key);
    }

    for (const key of matchedKeys) {
      const bucket = this.buckets.get(key);
      if (!bucket) continue;
      this.totalSamples -= bucket.sampleCount;
      this.totalSampleBytes -= bucket.sampleByteCount;
      this.buckets.delete(key);
    }
    this.bucketOrder = this.bucketOrder.filter((key) => this.buckets.has(key));

    const after = this.getSummary({ includeCategories: false });
    return {
      deletedBuckets: before.bucketCount - after.bucketCount,
      deletedRecords: before.recordCount - after.recordCount,
      deletedSamples: before.sampleCount - after.sampleCount,
      remaining: after
    };
  }

  reset() {
    return this.delete({ mode: 'reset' });
  }

  getSummary(query = {}) {
    this.applyRetention(query.now);
    const buckets = this.filteredBuckets(query);
    const summary = {
      retentionMs: this.policy.retentionMs,
      maxSamples: this.policy.maxSamples,
      maxTotalSampleBytes: this.policy.maxTotalSampleBytes,
      bucketCount: buckets.length,
      recordCount: 0,
      sampleCount: 0,
      droppedSampleCount: 0,
      byteCount: 0,
      sampleByteCount: 0,
      oldestObservedAt: null,
      newestObservedAt: null,
      byEnvironment: {},
      byCategory: {}
    };

    for (const bucket of buckets) {
      summary.recordCount += bucket.count;
      summary.sampleCount += bucket.sampleCount;
      summary.droppedSampleCount += bucket.droppedSampleCount;
      summary.byteCount += bucket.byteCount;
      summary.sampleByteCount += bucket.sampleByteCount;
      summary.oldestObservedAt = minTimestamp(summary.oldestObservedAt, bucket.firstObservedAt);
      summary.newestObservedAt = maxTimestamp(summary.newestObservedAt, bucket.lastObservedAt);

      const environment = summary.byEnvironment[bucket.environmentKey] || {
        recordCount: 0,
        sampleCount: 0,
        droppedSampleCount: 0,
        gameBuilds: {}
      };
      environment.recordCount += bucket.count;
      environment.sampleCount += bucket.sampleCount;
      environment.droppedSampleCount += bucket.droppedSampleCount;
      environment.gameBuilds[bucket.gameBuild] = (environment.gameBuilds[bucket.gameBuild] || 0) + bucket.count;
      summary.byEnvironment[bucket.environmentKey] = environment;

      const category = summary.byCategory[bucket.category] || {
        recordCount: 0,
        sampleCount: 0,
        droppedSampleCount: 0
      };
      category.recordCount += bucket.count;
      category.sampleCount += bucket.sampleCount;
      category.droppedSampleCount += bucket.droppedSampleCount;
      summary.byCategory[bucket.category] = category;
    }

    return summary;
  }

  createBucket(input) {
    if (this.buckets.size >= this.policy.maxBuckets) {
      const oldestKey = this.bucketOrder.shift();
      const oldest = this.buckets.get(oldestKey);
      if (oldest) {
        this.totalSamples -= oldest.sampleCount;
        this.totalSampleBytes -= oldest.sampleByteCount;
        this.buckets.delete(oldestKey);
      }
    }

    const bucket = {
      key: input.key,
      bucketId: `unk_bucket_${hashStable([input.key]).slice(0, 24)}`,
      environmentKey: input.environmentKey,
      releaseChannel: input.releaseChannel,
      gameBuild: input.gameBuild,
      reason: input.reason,
      category: input.category,
      fingerprint: input.fingerprint,
      sourceProfileId: input.sourceProfileId,
      sourceProfileVersion: input.sourceProfileVersion,
      parserVersion: input.parserVersion,
      sourceTimestamp: input.sourceTimestamp,
      firstObservedAt: input.firstObservedAt,
      lastObservedAt: input.firstObservedAt,
      count: 0,
      byteCount: 0,
      sampleCount: 0,
      droppedSampleCount: 0,
      sampleByteCount: 0,
      sensitivity: input.sensitivity,
      redactionApplied: false,
      lowValue: false,
      evidenceMarkers: input.evidenceMarkers,
      samples: []
    };
    this.buckets.set(input.key, bucket);
    this.bucketOrder.push(input.key);
    return bucket;
  }

  shouldStoreSample(bucket, minimized) {
    if (!minimized.snippet) return false;
    if (bucket.lowValue && bucket.count > 1 && bucket.count % this.policy.usefulNoiseSampleEvery !== 0) return false;
    if (bucket.samples.length >= this.policy.maxSamplesPerBucket) return false;
    if (this.totalSamples >= this.policy.maxSamples) return false;
    if (this.totalSampleBytes + minimized.byteLength > this.policy.maxTotalSampleBytes) return false;
    return true;
  }

  pruneCapacity() {
    while (this.totalSamples > this.policy.maxSamples || this.totalSampleBytes > this.policy.maxTotalSampleBytes) {
      const bucket = this.oldestBucketWithSamples();
      if (!bucket) break;
      const sample = bucket.samples.shift();
      bucket.sampleCount -= 1;
      bucket.sampleByteCount -= sample.byteLength;
      bucket.droppedSampleCount += 1;
      this.totalSamples -= 1;
      this.totalSampleBytes -= sample.byteLength;
    }
  }

  oldestBucketWithSamples() {
    return this.bucketOrder
      .map((key) => this.buckets.get(key))
      .filter((bucket) => bucket?.samples.length)
      .sort((left, right) => timestampMs(left.samples[0].observedAt) - timestampMs(right.samples[0].observedAt))[0] || null;
  }

  applyRetention(nowInput, options = {}) {
    const now = normalizeTimestamp(nowInput) || this.now();
    const nowMs = timestampMs(now);
    if (options.lazy && nowMs - this.lastRetentionCheckMs < this.policy.retentionCheckIntervalMs) return;
    this.lastRetentionCheckMs = nowMs;
    const cutoff = timestampMs(now) - this.policy.retentionMs;
    if (!Number.isFinite(cutoff)) return;

    for (const [key, bucket] of this.buckets.entries()) {
      if (timestampMs(bucket.lastObservedAt) >= cutoff) continue;
      this.totalSamples -= bucket.sampleCount;
      this.totalSampleBytes -= bucket.sampleByteCount;
      this.buckets.delete(key);
    }
    this.bucketOrder = this.bucketOrder.filter((key) => this.buckets.has(key));
  }

  filteredBuckets(query = {}) {
    return Array.from(this.buckets.values()).filter((bucket) => {
      if (query.environmentKey && bucket.environmentKey !== query.environmentKey) return false;
      if (query.gameBuild && bucket.gameBuild !== query.gameBuild) return false;
      if (query.category && bucket.category !== query.category) return false;
      if (query.reason && bucket.reason !== query.reason) return false;
      if (query.bucketId && bucket.bucketId !== query.bucketId) return false;
      return true;
    });
  }

  toBucketSummary(bucket, options = {}) {
    const summary = {
      bucketId: bucket.bucketId,
      environmentKey: bucket.environmentKey,
      releaseChannel: bucket.releaseChannel,
      gameBuild: bucket.gameBuild,
      reason: bucket.reason,
      category: bucket.category,
      sourceProfileId: bucket.sourceProfileId,
      sourceProfileVersion: bucket.sourceProfileVersion,
      parserVersion: bucket.parserVersion,
      sourceTimestamp: bucket.sourceTimestamp,
      firstObservedAt: bucket.firstObservedAt,
      lastObservedAt: bucket.lastObservedAt,
      count: bucket.count,
      byteCount: bucket.byteCount,
      sampleCount: bucket.sampleCount,
      droppedSampleCount: bucket.droppedSampleCount,
      sampleByteCount: bucket.sampleByteCount,
      sensitivity: bucket.sensitivity,
      redactionApplied: bucket.redactionApplied,
      lowValue: bucket.lowValue,
      evidenceMarkers: bucket.evidenceMarkers
    };
    if (options.includeSamples) {
      summary.samples = bucket.samples.map((sample) => ({ ...sample }));
    }
    return summary;
  }
}

function classifyUnknownEvidence(text, reason) {
  const normalized = String(text || '');
  const markers = extractEvidenceMarkers(normalized);
  const lowValue = markers.length === 0 ||
    /^\s*(?:\[[^\]]+\]\s*)?(?:debug|trace|verbose)\b/i.test(normalized) ||
    /<[^>]*(?:noise|debug|trace|verbose)[^>]*>/i.test(normalized);
  const category = lowValue && reason === 'no_profile_match'
    ? UNKNOWN_CATEGORIES.low_value_noise
    : UNKNOWN_CATEGORIES[reason] || `parser.${reason}`;
  return {
    category,
    evidenceMarkers: markers.length ? markers : ['unclassified-record'],
    sensitivity: inferSensitivity(normalized),
    lowValue
  };
}

function minimizeUnknownEvidence(text, options = {}) {
  const original = String(text || '');
  let snippet = original.replace(/\s*\n\s*/g, ' ').trim();
  const redactedKinds = new Set();
  let sensitivity = options.baseSensitivity || 'local';

  const replace = (pattern, replacement, kind, replacementSensitivity) => {
    snippet = snippet.replace(pattern, (...args) => {
      redactedKinds.add(kind);
      sensitivity = maxSensitivity(sensitivity, replacementSensitivity);
      const match = args[0];
      return typeof replacement === 'function' ? replacement(match) : replacement;
    });
  };

  replace(/\b(authorization|auth|token|secret|password|apikey|apiKey)\b\s*[:=\[]\s*("[^"]+"|[^\s,\]]+)/gi, '$1=[REDACTED_SECRET]', 'secret', 'secret');
  replace(/\b(loginSessionId|session|sessionId)\b\s*[:=\[]\s*("[^"]+"|[^\s,\]]+)/gi, '$1=[REDACTED_SESSION]', 'session', 'secret');
  replace(/\b(accountId|playerGEID|characterGEID|geid|node_id)\b\s*[:=\[]\s*("[^"]+"|[^\s,\]]+)/gi, '$1=[REDACTED_ID]', 'identifier', 'personal');
  replace(/\b(handle|nickname|leader|member)\b\s*[:=\[]\s*("[^"]+"|[^\s,\]]+)/gi, '$1=[REDACTED_HANDLE]', 'handle', 'social');
  replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g, '[REDACTED_ENDPOINT]', 'endpoint', 'local');
  replace(/\b(?:[a-z0-9-]+\.)+(?:invalid|local|lan|test|example|com|net|org)(?::\d{1,5})?\b/gi, '[REDACTED_ENDPOINT]', 'endpoint', 'local');
  replace(/\b[A-Za-z]:\\[^\s\]]+/g, '[REDACTED_PATH]', 'path', 'local');
  replace(/(^|[\s\[])(\/(?:home|Users|mnt|media|tmp|var|opt)\/[^\s\]]+)/g, (match) => `${match[0] === '[' ? '[' : match.startsWith(' ') ? ' ' : ''}[REDACTED_PATH]`, 'path', 'local');

  const maxBytes = options.maxSampleBytes || DEFAULT_UNKNOWN_EVIDENCE_POLICY.maxSampleBytes;
  snippet = truncateUtf8(snippet, maxBytes);

  return {
    snippet,
    originalByteLength: normalizedByteLength(original),
    byteLength: normalizedByteLength(snippet),
    sensitivity,
    redactionApplied: redactedKinds.size > 0 || snippet !== original.replace(/\s*\n\s*/g, ' ').trim(),
    redactedKinds: Array.from(redactedKinds).sort()
  };
}

function extractEvidenceMarkers(text) {
  const markers = [];
  const normalized = String(text);
  const angleTags = normalized.match(/<[^>]+>/g) || [];
  const keyedBrackets = Array.from(normalized.matchAll(/\b(?<key>[A-Za-z][A-Za-z0-9_]*)\[[^\]]+\]/g))
    .map((match) => `${match.groups.key}[]`);

  for (const marker of angleTags.concat(keyedBrackets).slice(0, 5)) {
    markers.push(minimizeMarker(marker));
  }
  return Array.from(new Set(markers));
}

function minimizeMarker(marker) {
  return String(marker)
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g, '[REDACTED_ENDPOINT]')
    .replace(/\b[A-Za-z]:\\[^\]\s]+/g, '[REDACTED_PATH]')
    .replace(/\/(?:home|Users|mnt|media|tmp|var|opt)\/[^\]\s]+/g, '[REDACTED_PATH]')
    .slice(0, 96);
}

function inferSensitivity(text) {
  if (/\b(authorization|auth|token|secret|password|apikey|apiKey)\b/i.test(text)) return 'secret';
  if (/\b(handle|nickname|leader|member)\b\s*[:=\[]/i.test(text)) return 'social';
  if (/\b(accountId|playerGEID|characterGEID|geid|node_id|session|sessionId|loginSessionId)\b\s*[:=\[]/i.test(text)) return 'personal';
  return 'local';
}

function normalizePolicy(input = {}) {
  return {
    retentionMs: normalizeInteger(input.retentionMs, 1, Number.MAX_SAFE_INTEGER, DEFAULT_UNKNOWN_EVIDENCE_POLICY.retentionMs),
    maxSamples: normalizeInteger(input.maxSamples, 0, Number.MAX_SAFE_INTEGER, DEFAULT_UNKNOWN_EVIDENCE_POLICY.maxSamples),
    maxSampleBytes: normalizeInteger(input.maxSampleBytes, 80, 4_096, DEFAULT_UNKNOWN_EVIDENCE_POLICY.maxSampleBytes),
    maxTotalSampleBytes: normalizeInteger(input.maxTotalSampleBytes, 0, Number.MAX_SAFE_INTEGER, DEFAULT_UNKNOWN_EVIDENCE_POLICY.maxTotalSampleBytes),
    maxSamplesPerBucket: normalizeInteger(input.maxSamplesPerBucket, 0, Number.MAX_SAFE_INTEGER, DEFAULT_UNKNOWN_EVIDENCE_POLICY.maxSamplesPerBucket),
    maxBuckets: normalizeInteger(input.maxBuckets, 1, Number.MAX_SAFE_INTEGER, DEFAULT_UNKNOWN_EVIDENCE_POLICY.maxBuckets),
    usefulNoiseSampleEvery: normalizeInteger(input.usefulNoiseSampleEvery, 1, Number.MAX_SAFE_INTEGER, DEFAULT_UNKNOWN_EVIDENCE_POLICY.usefulNoiseSampleEvery),
    retentionCheckIntervalMs: normalizeInteger(input.retentionCheckIntervalMs, 1, Number.MAX_SAFE_INTEGER, DEFAULT_UNKNOWN_EVIDENCE_POLICY.retentionCheckIntervalMs)
  };
}

function compareBuckets(left, right) {
  const newest = timestampMs(right.lastObservedAt) - timestampMs(left.lastObservedAt);
  if (newest !== 0) return newest;
  return left.bucketId.localeCompare(right.bucketId);
}

function fingerprintEvidence(input) {
  return hashStable([
    input.environmentKey,
    input.gameBuild,
    input.category,
    input.reason,
    input.snippet,
    ...(input.markers || [])
  ]).slice(0, 32);
}

function hashStable(parts) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(parts));
  return hash.digest('hex');
}

function normalizeReason(reason) {
  return /^[a-z][a-z0-9_]{1,80}$/.test(String(reason || '')) ? String(reason) : 'no_profile_match';
}

function normalizeLineRange(value) {
  if (!value || typeof value !== 'object') return null;
  const start = Number.isSafeInteger(value.start) && value.start >= 0 ? value.start : null;
  const end = Number.isSafeInteger(value.end) && value.end >= start ? value.end : null;
  return start === null || end === null ? null : { start, end };
}

function normalizeTimestamp(value) {
  return normalizeAbsoluteInstant(value);
}

function timestampMs(value) {
  return toEpochMilliseconds(value) ?? 0;
}

function minTimestamp(left, right) {
  return earlierInstant(left, right);
}

function maxTimestamp(left, right) {
  return laterInstant(left, right);
}

function truncateUtf8(value, maxBytes) {
  const buffer = Buffer.from(String(value), 'utf8');
  if (buffer.length <= maxBytes) return String(value);
  return `${buffer.subarray(0, Math.max(0, maxBytes - 3)).toString('utf8').replace(/\uFFFD+$/g, '')}...`;
}

function normalizedByteLength(value) {
  return Buffer.byteLength(String(value || ''), 'utf8');
}

function maxSensitivity(left, right) {
  const normalizedLeft = SENSITIVITY_ORDER[left] === undefined ? 'local' : left;
  const normalizedRight = SENSITIVITY_ORDER[right] === undefined ? 'local' : right;
  return SENSITIVITY_ORDER[normalizedLeft] >= SENSITIVITY_ORDER[normalizedRight]
    ? normalizedLeft
    : normalizedRight;
}

function normalizeInteger(value, min, max, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function requiredText(value, fallback) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

module.exports = {
  DEFAULT_UNKNOWN_EVIDENCE_POLICY,
  UNKNOWN_CATEGORIES,
  UnknownEvidenceStore,
  classifyUnknownEvidence,
  minimizeUnknownEvidence
};
