const { StationError } = require('./contracts');

// Reviewed portal endpoints and wire mappings belong in this adapter. No route,
// permission string, issuer or production payload is guessed by the desktop UI.
const unavailableAdapter = Object.freeze({
  available: false,
  status: 'Station sign-in and synchronization are not available in this build yet.',
  async authenticate() { throw new StationError('station_not_supported', 'Station sign-in is awaiting the developer-portal contract. Local monitoring remains available.'); }
});
module.exports = { unavailableAdapter };
