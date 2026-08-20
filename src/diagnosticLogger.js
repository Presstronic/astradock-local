const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_FILES = 3;

/**
 * Small, local-only diagnostic logger for maintainer builds and field debugging.
 * Values are serialized as bounded, privacy-safe JSON; callers must still avoid
 * passing raw log lines, credentials, or source paths.
 */
class DiagnosticLogger {
  constructor(options = {}) {
    this.directory = requireDirectory(options.directory);
    this.fileName = options.fileName || 'astradock.log';
    this.filePath = path.join(this.directory, this.fileName);
    this.maxBytes = positiveInteger(options.maxBytes, DEFAULT_MAX_BYTES);
    this.maxFiles = positiveInteger(options.maxFiles, DEFAULT_MAX_FILES);
    this.now = typeof options.now === 'function' ? options.now : () => new Date();
    this.closed = false;
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    restrictPermissions(this.directory);
  }

  getLogPath() {
    return this.filePath;
  }

  info(event, details) { this.write('info', event, details); }
  warn(event, details) { this.write('warn', event, details); }
  error(event, details) { this.write('error', event, details); }

  write(level, event, details) {
    if (this.closed) return false;
    const record = {
      at: new Date(this.now()).toISOString(),
      level,
      event: boundedText(event, 120),
      ...(details === undefined ? {} : { details: sanitize(details) })
    };
    const line = `${JSON.stringify(record)}\n`;
    try {
      this.rotateIfNeeded(Buffer.byteLength(line));
      fs.appendFileSync(this.filePath, line, { encoding: 'utf8', mode: 0o600 });
      restrictPermissions(this.filePath);
      return true;
    } catch (_error) {
      // Diagnostics must never take down monitoring or the application.
      return false;
    }
  }

  rotateIfNeeded(nextBytes) {
    let size = 0;
    try { size = fs.statSync(this.filePath).size; } catch (error) {
      if (error.code !== 'ENOENT') return;
    }
    if (size + nextBytes <= this.maxBytes) return;
    for (let index = this.maxFiles - 1; index >= 1; index -= 1) {
      const older = `${this.filePath}.${index}`;
      const newer = `${this.filePath}.${index + 1}`;
      try { fs.rmSync(newer, { force: true }); } catch (_error) {}
      try { fs.renameSync(older, newer); } catch (error) {
        if (error.code !== 'ENOENT') return;
      }
    }
    try { fs.renameSync(this.filePath, `${this.filePath}.1`); } catch (error) {
      if (error.code !== 'ENOENT') return;
    }
  }

  close() {
    this.closed = true;
  }
}

function createDiagnosticLogger(options) {
  return new DiagnosticLogger(options);
}

function sanitize(value, depth = 0) {
  if (depth > 3) return '[truncated]';
  if (value instanceof Error) return { name: value.name, code: value.code || null, message: sanitize(value.message, depth + 1) };
  if (typeof value === 'string') return boundedText(value, 500).replace(/(?:[A-Za-z]:\\|\\\\|\/home\/|\/Users\/|\/tmp\/)[^\s"']+/gi, '[path]');
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => sanitize(entry, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, entry]) => [
      boundedText(key, 80),
      /token|secret|password|credential|authorization|cookie|account.?id|user.?id/i.test(key) ? '[redacted]' : sanitize(entry, depth + 1)
    ]));
  }
  return String(value);
}

function boundedText(value, max) {
  return String(value ?? '').slice(0, max);
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function requireDirectory(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new TypeError('Diagnostic log directory must be absolute.');
  return value;
}

function restrictPermissions(target) {
  try { fs.chmodSync(target, target.endsWith('.log') ? 0o600 : 0o700); } catch (_error) {}
}

module.exports = { DiagnosticLogger, createDiagnosticLogger, sanitize };
