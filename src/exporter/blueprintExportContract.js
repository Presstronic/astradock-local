const BLUEPRINT_EXPORT_CONTRACT_VERSION = 1;
const BLUEPRINT_EXPORT_FIELDS = Object.freeze(['name', 'type', 'shared']);

class BlueprintExportContractError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'BlueprintExportContractError';
    this.code = 'invalid_blueprint_export';
    this.details = details;
  }
}

/**
 * Validate the narrow, Station-shaped blueprint payload before it crosses the
 * file boundary. This is a local provisional contract until Station provides
 * an authoritative validator or schema.
 */
function validateBlueprintRecords(records) {
  if (!Array.isArray(records)) {
    throw new BlueprintExportContractError('Blueprint export must be an array.', { reason: 'not_an_array' });
  }

  const identities = new Set();
  let previousIdentity = null;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!isPlainObject(record)) {
      throw invalidRecord(index, 'record_not_an_object');
    }
    const keys = Object.keys(record);
    if (keys.length !== BLUEPRINT_EXPORT_FIELDS.length || keys.some((key, keyIndex) => key !== BLUEPRINT_EXPORT_FIELDS[keyIndex])) {
      throw invalidRecord(index, 'unexpected_or_unordered_fields');
    }
    if (typeof record.name !== 'string' || !record.name.trim() || record.name.length > 512) {
      throw invalidRecord(index, 'invalid_name');
    }
    if (typeof record.type !== 'string' || record.type.length > 256) {
      throw invalidRecord(index, 'invalid_type');
    }
    if (record.shared !== null && typeof record.shared !== 'boolean') {
      throw invalidRecord(index, 'invalid_shared');
    }

    const identity = record.name.normalize('NFKC').toLocaleLowerCase('en-US');
    if (identities.has(identity)) throw invalidRecord(index, 'duplicate_name');
    identities.add(identity);
    if (previousIdentity !== null && identity.localeCompare(previousIdentity, 'en') < 0) {
      throw invalidRecord(index, 'unstable_order');
    }
    previousIdentity = identity;
  }
  return records;
}

function createPublicBlueprintExportResult(result, overrides = {}) {
  return {
    status: overrides.status || 'no_matches',
    outputPath: null,
    outputFileName: safeOutputFileName(overrides.outputFileName),
    outputFormat: overrides.outputFormat || 'json',
    testOnly: Boolean(overrides.testOnly),
    records: overrides.records || result.records,
    files: result.files,
    filesScanned: result.filesScanned,
    filesTotal: result.filesTotal,
    linesRead: result.linesRead,
    duplicatesSuppressed: result.duplicatesSuppressed,
    skippedFiles: result.skippedFiles,
    sourceFingerprint: result.sourceFingerprint,
    diagnostics: result.diagnostics,
    errors: result.errors,
    extraction: result.extraction
  };
}

function safeOutputFileName(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const fileName = value.split(/[\\/]/).pop() || '';
  return fileName.length <= 255 && fileName !== '.' && fileName !== '..' ? fileName : null;
}

function invalidRecord(index, reason) {
  return new BlueprintExportContractError('Blueprint export contains an invalid record.', { index, reason });
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

module.exports = {
  BLUEPRINT_EXPORT_CONTRACT_VERSION,
  BLUEPRINT_EXPORT_FIELDS,
  BlueprintExportContractError,
  createPublicBlueprintExportResult,
  validateBlueprintRecords
};
