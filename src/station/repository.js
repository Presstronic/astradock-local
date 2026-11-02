const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3-multiple-ciphers');
const { StationError } = require('./contracts');

/** Isolated encrypted state, independent of telemetry retention and raw evidence. */
class StationRepository {
  constructor({ filePath, key }) {
    if (!path.isAbsolute(filePath) || !Buffer.isBuffer(key) || key.length !== 32) throw new StationError('station_storage_unavailable', 'Protected Station storage is unavailable.');
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    try {
      this.db = new Database(filePath, { timeout: 5000 });
      this.db.key(key);
      const version = this.db.pragma('user_version', { simple: true });
      if (version !== 0 && version !== 1) throw new Error('unsupported');
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = FULL');
      this.db.exec('CREATE TABLE IF NOT EXISTS station_state (id INTEGER PRIMARY KEY CHECK(id = 1), value TEXT NOT NULL); PRAGMA user_version = 1;');
      fs.chmodSync(filePath, 0o600);
    } catch { this.db?.close(); throw new StationError('station_storage_unavailable', 'Protected Station storage could not be opened. Existing data was retained.'); }
  }
  load() {
    try { const row = this.db.prepare('SELECT value FROM station_state WHERE id = 1').get(); return row ? JSON.parse(row.value) : null; }
    catch { throw new StationError('station_storage_unavailable', 'Protected Station data could not be read.'); }
  }
  save(state) {
    const json = JSON.stringify(state);
    if (Buffer.byteLength(json) > 8 * 1024 * 1024) throw new StationError('station_capacity', 'Station cache capacity reached. Resolve outstanding changes before continuing.');
    try { this.db.transaction(() => this.db.prepare('INSERT INTO station_state(id, value) VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value').run(json))(); }
    catch { throw new StationError('station_storage_unavailable', 'Station changes could not be saved safely. No new operation was sent.'); }
  }
  close() { this.db.close(); }
}
module.exports = { StationRepository };
