const ABSOLUTE_INSTANT_PATTERN = /^(?<date>\d{4}-\d{2}-\d{2})T(?<time>\d{2}:\d{2}:\d{2})(?<fraction>\.\d{1,9})?(?<offset>Z|[+-]\d{2}:\d{2})$/;
const GAME_LOG_TIMESTAMP_PATTERN = /<(?<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})?)>/;

function parseAbsoluteInstant(value) {
  if (typeof value !== 'string' || !value.trim()) return failure('timestamp_missing');
  const original = value.trim();
  const match = original.match(ABSOLUTE_INSTANT_PATTERN);
  if (!match?.groups) return failure(hasOffsetSuffix(original) ? 'timestamp_malformed' : 'timestamp_ambiguous');
  if (!hasValidCalendarFields(match.groups)) return failure('timestamp_malformed');
  const epochMs = Date.parse(original);
  if (!Number.isFinite(epochMs)) return failure('timestamp_malformed');
  return {
    ok: true,
    instant: new Date(epochMs).toISOString(),
    epochMs,
    original,
    offset: match.groups.offset,
    assumedTimeZone: null
  };
}

function parseGameLogTimestamp(text, options = {}) {
  const match = String(text || '').match(GAME_LOG_TIMESTAMP_PATTERN);
  if (!match?.groups?.timestamp) return failure('timestamp_missing');
  const original = match.groups.timestamp;
  if (hasOffsetSuffix(original)) return parseAbsoluteInstant(original);
  if (options.offsetlessBasis !== 'UTC') return failure('timestamp_ambiguous');
  const parsed = parseAbsoluteInstant(`${original}Z`);
  if (!parsed.ok) return parsed;
  return { ...parsed, original, assumedTimeZone: 'UTC' };
}

function normalizeAbsoluteInstant(value) {
  if (value instanceof Date) return Number.isNaN(value.valueOf()) ? null : value.toISOString();
  const parsed = parseAbsoluteInstant(value);
  return parsed.ok ? parsed.instant : null;
}

function toEpochMilliseconds(value) {
  if (value instanceof Date) return Number.isNaN(value.valueOf()) ? null : value.valueOf();
  const parsed = parseAbsoluteInstant(value);
  return parsed.ok ? parsed.epochMs : null;
}

function compareAbsoluteInstants(left, right, options = {}) {
  const missingValue = Number.isFinite(options.missingValue) ? options.missingValue : 0;
  return (toEpochMilliseconds(left) ?? missingValue) - (toEpochMilliseconds(right) ?? missingValue);
}

function elapsedMilliseconds(earlier, later) {
  const earlierMs = toEpochMilliseconds(earlier);
  const laterMs = toEpochMilliseconds(later);
  return earlierMs === null || laterMs === null ? null : laterMs - earlierMs;
}

function laterInstant(left, right) {
  if (!left) return right || null;
  if (!right) return left;
  return compareAbsoluteInstants(right, left) >= 0 ? right : left;
}

function earlierInstant(left, right) {
  if (!left) return right || null;
  if (!right) return left;
  return compareAbsoluteInstants(left, right) <= 0 ? left : right;
}

function failure(code) {
  return { ok: false, code, instant: null, epochMs: null, original: null, offset: null, assumedTimeZone: null };
}

function hasOffsetSuffix(value) {
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
}

function hasValidCalendarFields(groups) {
  const [year, month, day] = groups.date.split('-').map(Number);
  const [hour, minute, second] = groups.time.split(':').map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return false;
  if (groups.offset !== 'Z') {
    const [offsetHour, offsetMinute] = groups.offset.slice(1).split(':').map(Number);
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }
  return true;
}

module.exports = {
  ABSOLUTE_INSTANT_PATTERN,
  GAME_LOG_TIMESTAMP_PATTERN,
  compareAbsoluteInstants,
  earlierInstant,
  elapsedMilliseconds,
  laterInstant,
  normalizeAbsoluteInstant,
  parseAbsoluteInstant,
  parseGameLogTimestamp,
  toEpochMilliseconds
};
