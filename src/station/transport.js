const { StationError } = require('./contracts');

/** Bounded HTTPS transport for a reviewed adapter; renderer never supplies routes. */
function createStationTransport({ origin, fetchImpl = fetch, timeoutMs = 15000, maxBytes = 1024 * 1024 }) {
  const trusted = new URL(origin);
  if (trusted.protocol !== 'https:' || trusted.username || trusted.password || trusted.search || trusted.hash) throw new StationError('station_contract_invalid', 'Station transport requires a trusted HTTPS origin.');
  let active = 0;
  return async function request({ path, method = 'GET', credential, body, signal }) {
    const target = new URL(path, trusted);
    if (target.origin !== trusted.origin || target.username || target.password || !['GET', 'POST'].includes(method)) throw new StationError('station_contract_invalid', 'Station adapter requested an unapproved destination.');
    if (active >= 4) throw new StationError('station_busy', 'Station is busy. Try again shortly.');
    active++;
    let response;
    const combinedSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    try {
      combinedSignal.throwIfAborted();
      const serialized = body === undefined ? undefined : JSON.stringify(body);
      if (serialized && Buffer.byteLength(serialized) > maxBytes) throw new StationError('station_contract_invalid', 'Station request exceeds the supported size.');
      response = await fetchImpl(target, { method, redirect: 'error', signal: combinedSignal, credentials: 'omit', headers: {
        Accept: 'application/json', ...(serialized ? { 'Content-Type': 'application/json' } : {}), ...(credential ? { Authorization: `Bearer ${credential}` } : {})
      }, ...(serialized ? { body: serialized } : {}) });
      if (response.status === 401) throw new StationError('station_auth_required', 'Sign in to Station again.');
      if (response.status === 403) throw new StationError('station_denied', 'Station no longer permits this operation. Refresh your access.');
      if (response.status === 409 || response.status === 412) throw new StationError('station_conflict', 'Station inventory changed. Refresh and review the proposed change again.');
      if (response.status === 429) { const error = new StationError('station_rate_limited', 'Station rate limit reached. Retry later.'); const seconds = Number(response.headers.get('retry-after')); error.retryAfterMs = Number.isFinite(seconds) ? Math.min(300000, Math.max(1000, seconds * 1000)) : 30000; throw error; }
      if (!response.ok) throw new StationError('station_offline', 'Station could not complete the request. Cached inventory is unchanged.');
      if (!/^application\/(?:[\w.+-]+\+)?json\b/i.test(response.headers.get('content-type') || '')) throw new StationError('station_contract_invalid', 'Station did not return a supported JSON response.');
      if (Number(response.headers.get('content-length')) > maxBytes) throw new StationError('station_contract_invalid', 'Station response exceeds the supported size.');
      if (!response.body) throw new StationError('station_contract_invalid', 'Station returned no response body.');
      const reader = response.body.getReader();
      const chunks = [];
      let bytes = 0;
      try {
        while (true) {
          combinedSignal.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > maxBytes) throw new StationError('station_contract_invalid', 'Station response exceeds the supported size.');
          chunks.push(Buffer.from(value));
        }
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      } finally { await reader.cancel().catch(() => {}); }
    } catch (error) {
      if (error instanceof StationError) throw error;
      throw new StationError(combinedSignal.aborted ? 'station_cancelled' : 'station_offline', combinedSignal.aborted ? 'Station request was cancelled or timed out.' : 'Station is unavailable or returned an invalid response.');
    } finally { await response?.body?.cancel().catch(() => {}); active--; }
  };
}
module.exports = { createStationTransport };
