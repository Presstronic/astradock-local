const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const BUNDLE_VERSION = 1;
const DEFAULT_MAX_LOG_BYTES = 512 * 1024;
const DEFAULT_MAX_RECORDS = 200;

class DiagnosticsSupportService {
  constructor(options = {}) {
    if (typeof options.getHealth !== 'function') throw new TypeError('Diagnostics health provider is required.');
    this.getHealth = options.getHealth;
    this.logDirectory = requireAbsoluteDirectory(options.logDirectory);
    this.now = typeof options.now === 'function' ? options.now : () => new Date();
    this.maxLogBytes = positiveInteger(options.maxLogBytes, DEFAULT_MAX_LOG_BYTES);
    this.maxRecords = positiveInteger(options.maxRecords, DEFAULT_MAX_RECORDS);
    this.metadata = sanitizeMetadata(options.metadata || {});
  }

  preview() {
    const bundle = this.buildBundle();
    return {
      version: BUNDLE_VERSION,
      generatedAt: bundle.generatedAt,
      files: bundle.files.map(({ name, bytes, category }) => ({ name, bytes, category })),
      estimatedBytes: Buffer.byteLength(JSON.stringify(bundle)),
      redaction: bundle.redaction,
      scope: 'health, bounded counters/timings, compatibility state, recent sanitized errors, and rotated application diagnostics; raw game logs are excluded.',
      automaticUpload: false
    };
  }

  export(destinationPath, options = {}) {
    if (typeof destinationPath !== 'string' || !path.isAbsolute(destinationPath)) throw codeError('invalid_destination', 'A validated absolute destination is required.');
    const bundle = this.buildBundle(options);
    const serialized = JSON.stringify(bundle, null, 2) + '\n';
    const temporaryPath = `${destinationPath}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
    try {
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.writeFileSync(temporaryPath, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      fs.renameSync(temporaryPath, destinationPath);
      try { fs.chmodSync(destinationPath, 0o600); } catch (_error) {}
      return {
        status: 'completed',
        outputFileName: path.basename(destinationPath),
        bytes: Buffer.byteLength(serialized),
        manifest: bundle.manifest,
        redaction: bundle.redaction
      };
    } catch (error) {
      try { fs.rmSync(temporaryPath, { force: true }); } catch (_cleanupError) {}
      if (error?.code === 'ENOSPC') throw codeError('disk_full', 'There is not enough local disk space to write diagnostics.');
      if (error?.code === 'EACCES' || error?.code === 'EPERM') throw codeError('destination_denied', 'The selected diagnostics destination is not writable.');
      throw codeError('export_failed', 'The diagnostics export could not be written.');
    }
  }

  deleteLocalDiagnostics() {
    let deletedFiles = 0;
    for (const file of listLogFiles(this.logDirectory)) {
      try { fs.rmSync(file, { force: true }); deletedFiles += 1; } catch (error) {
        if (error.code !== 'ENOENT') throw codeError('delete_failed', 'Local diagnostics could not be deleted.');
      }
    }
    return { deletedFiles };
  }

  buildBundle(options = {}) {
    const generatedAt = new Date(this.now()).toISOString();
    const health = sanitizeValue(this.getHealth(), new Set());
    const logRecords = readLogRecords(this.logDirectory, this.maxLogBytes, this.maxRecords);
    const redaction = { categories: {}, total: 0 };
    const addRedactions = (countByCategory) => Object.entries(countByCategory).forEach(([category, count]) => {
      redaction.categories[category] = (redaction.categories[category] || 0) + count;
      redaction.total += count;
    });
    const diagnostics = sanitizeValue(logRecords.records, new Set(), addRedactions);
    const files = [
      { name: 'health.json', category: 'health', content: health },
      { name: 'diagnostics.json', category: 'application-diagnostics', content: diagnostics },
      { name: 'README.txt', category: 'documentation', content: 'AstraDock Local diagnostics bundle. Raw Game.log files, automatic upload, exact paths, network addresses, account identifiers, and stable identifiers are excluded by default.\n' }
    ];
    if (options.cancelled) throw codeError('export_cancelled', 'Diagnostics export was cancelled.');
    const manifest = Object.fromEntries(files.map((file) => [file.name, {
      category: file.category,
      bytes: Buffer.byteLength(serializeContent(file.content)),
      sha256: sha256(serializeContent(file.content))
    }]));
    return {
      bundleVersion: BUNDLE_VERSION,
      generatedAt,
      scope: 'sanitized_local_diagnostics',
      metadata: this.metadata,
      files: files.map((file) => ({ ...file, bytes: Buffer.byteLength(serializeContent(file.content)) })),
      manifest: { algorithm: 'sha256', files: manifest },
      redaction,
      logWindow: { filesRead: logRecords.filesRead, recordsRead: logRecords.recordsRead, truncated: logRecords.truncated }
    };
  }
}

function createDiagnosticsSupportService(options) { return new DiagnosticsSupportService(options); }

function serializeContent(content) { return typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n'; }

function readLogRecords(directory, maxBytes, maxRecords) {
  const records = [];
  let bytes = 0;
  let truncated = false;
  const files = listLogFiles(directory);
  for (const file of files) {
    let content;
    try { content = fs.readFileSync(file, 'utf8'); } catch (_error) { continue; }
    if (Buffer.byteLength(content) > maxBytes) { content = content.slice(-maxBytes); truncated = true; }
    for (const line of content.split(/\r?\n/).filter(Boolean).slice(-maxRecords)) {
      try { records.push(JSON.parse(line)); } catch (_error) { records.push({ level: 'warn', event: 'malformed_local_diagnostic_record' }); }
      bytes += Buffer.byteLength(line);
      if (records.length >= maxRecords) { truncated = true; break; }
    }
    if (records.length >= maxRecords) break;
  }
  return { records, filesRead: files.length, recordsRead: records.length, truncated: truncated || bytes > maxBytes };
}

function listLogFiles(directory) {
  try {
    return fs.readdirSync(directory).filter((name) => /^astradock\.log(?:\.\d+)?$/.test(name)).sort().map((name) => path.join(directory, name));
  } catch (_error) { return []; }
}

function sanitizeValue(value, redacted = new Set(), onRedaction = () => {}) {
  if (typeof value === 'string') return value
    .replace(/(?:[A-Za-z]:\\|\\\\|\/home\/|\/Users\/|\/tmp\/)[^\s"']+/gi, () => redact(redacted, onRedaction, 'path'))
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, () => redact(redacted, onRedaction, 'network_address'));
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((entry) => sanitizeValue(entry, redacted, onRedaction)).slice(0, 200);
  if (typeof value !== 'object') return '[unsupported]';
  return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, entry]) => {
    if (/account|user.?id|stable.?id|event.?id|source.?id|session.?id|identifier|endpoint|address|token|secret|password|credential|handle|path/i.test(key)) {
      return [key, redact(redacted, onRedaction, categoryForKey(key))];
    }
    return [key, sanitizeValue(entry, redacted, onRedaction)];
  }));
}

function redact(_set, onRedaction, category) { onRedaction({ [category]: 1 }); return '[redacted]'; }
function categoryForKey(key) { return /path/i.test(key) ? 'path' : /endpoint|address/i.test(key) ? 'network_address' : /token|secret|password|credential/i.test(key) ? 'credential' : 'stable_identifier'; }
function sanitizeMetadata(metadata) { return { appVersion: String(metadata.appVersion || 'unknown'), build: String(metadata.build || 'unknown'), platform: String(metadata.platform || process.platform), arch: String(metadata.arch || process.arch), packaged: Boolean(metadata.packaged) }; }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function positiveInteger(value, fallback) { return Number.isInteger(value) && value > 0 ? value : fallback; }
function requireAbsoluteDirectory(value) { if (typeof value !== 'string' || !path.isAbsolute(value)) throw new TypeError('Diagnostics log directory must be absolute.'); return value; }
function codeError(code, message) { const error = new Error(message); error.code = code; return error; }

module.exports = { BUNDLE_VERSION, DiagnosticsSupportService, createDiagnosticsSupportService, listLogFiles, sanitizeValue };
