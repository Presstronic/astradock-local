const { compareRuntimeEventOrder } = require('./contracts/runtimeEvents');

const MAX_CACHE_BYTES = 256 * 1024;
const MAX_RECORD_BYTES = 64 * 1024;
const MAX_RECORDS = 160;

/** Ephemeral original records. Never attach this cache to canonical events. */
function collectRuntimeEvidence(text, events, sourceByteOffset = 0) {
  const bytes = Buffer.from(text, 'utf8');
  const cache = new Map();
  let retainedBytes = 0;
  for (const event of [...events].sort((left, right) => compareRuntimeEventOrder(right, left))) {
    if (cache.size >= MAX_RECORDS) break;
    const offset = event.evidenceReference?.sourceByteOffset ?? event.ordering?.sourceByteOffset;
    const start = offset - sourceByteOffset;
    if (!Number.isSafeInteger(start) || start < 0 || start >= bytes.length || (start > 0 && bytes[start - 1] !== 10)) continue;
    let end = bytes.indexOf(10, start);
    end = end < 0 ? bytes.length : end + 1;
    while (end < bytes.length && !/^<\d{4}-\d{2}-\d{2}T[^>\r\n]{1,40}>/.test(bytes.subarray(end, end + 64).toString('utf8'))
      && end - start <= MAX_RECORD_BYTES) {
      const next = bytes.indexOf(10, end);
      end = next < 0 ? bytes.length : next + 1;
    }
    const size = end - start;
    if (size > MAX_RECORD_BYTES || retainedBytes + size > MAX_CACHE_BYTES) continue;
    const original = bytes.subarray(start, end).toString('utf8');
    if (original.includes('\ufffd')) continue;
    cache.set(event.eventId, original);
    retainedBytes += size;
  }
  return cache;
}

module.exports = { collectRuntimeEvidence, MAX_CACHE_BYTES, MAX_RECORD_BYTES, MAX_RECORDS };
