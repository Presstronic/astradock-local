const crypto = require('node:crypto');
const { StationError, text } = require('./contracts');

/** Public native-client transaction, for use by a reviewed Station adapter only.
 * The adapter owns token exchange and issuer/audience/signature validation.
 * Neither the browser URL nor the exchange material crosses renderer IPC.
 */
function createAuthorizationTransaction({ authorizationEndpoint, clientId, redirectUri, scopes, now = () => Date.now(), lifetimeMs = 120000 }) {
  const endpoint = new URL(authorizationEndpoint);
  const redirect = new URL(redirectUri);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash
    || redirect.protocol !== 'http:' || redirect.hostname !== '127.0.0.1' || !redirect.port || redirect.username || redirect.password || redirect.search || redirect.hash
    || !Array.isArray(scopes) || scopes.length > 16 || scopes.some(scope => !/^[\w:.-]{1,100}$/.test(scope))) throw new StationError('station_contract_invalid', 'The native authorization registration is unsupported.');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const state = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const expires = now() + Math.min(120000, Math.max(1000, lifetimeMs));
  let active = true;
  for (const [key, value] of Object.entries({ response_type: 'code', client_id: text(clientId), redirect_uri: redirect.href, code_challenge: challenge, code_challenge_method: 'S256', state, scope: scopes.join(' ') })) endpoint.searchParams.set(key, value);
  return {
    authorizationUrl: endpoint.href,
    cancel() { active = false; },
    acceptCallback(value) {
      let callback;
      try { callback = new URL(value); } catch { throw new StationError('station_auth_invalid', 'Station sign-in callback is invalid.'); }
      if (!active || now() >= expires || callback.origin !== redirect.origin || callback.pathname !== redirect.pathname || callback.hash || callback.username || callback.password
        || callback.searchParams.getAll('state').length !== 1 || callback.searchParams.get('state') !== state || callback.searchParams.getAll('code').length !== 1
        || callback.searchParams.has('error')) throw new StationError('station_auth_invalid', 'Station sign-in expired, was cancelled, or did not match the current transaction.');
      const code = text(callback.searchParams.get('code'), 2048);
      active = false;
      return { code, verifier, redirectUri: redirect.href };
    }
  };
}
module.exports = { createAuthorizationTransaction };
