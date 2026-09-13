const crypto = require('node:crypto');

const API_VERSION = 1;
const MAX_SOURCE_ID_LENGTH = 32;
const MAX_TEXT_LENGTH = 128;
const MAX_CHECKPOINT_ID_LENGTH = 192;
const MAX_EVENT_LIMIT = 200;
const MAX_CURSOR = 100000;
const MONITOR_START_MODES = Object.freeze(['from_current_end', 'from_checkpoint', 'from_beginning']);

const CHANNELS = Object.freeze({
  sourceDiscover: 'astradock:v1:source:discover',
  sourceChoose: 'astradock:v1:source:choose',
  sourceChooseDirectory: 'astradock:v1:source:choose-directory',
  sourceSelect: 'astradock:v1:source:select',
  sourceOpenFolder: 'astradock:v1:source:open-folder',
  monitorSnapshot: 'astradock:v1:monitor:snapshot',
  monitorScan: 'astradock:v1:monitor:scan',
  monitorStart: 'astradock:v1:monitor:start',
  monitorStop: 'astradock:v1:monitor:stop',
  exporterRun: 'astradock:v1:exporter:run',
  exporterCancel: 'astradock:v1:exporter:cancel',
  eventsQuery: 'astradock:v1:events:query',
  evidenceGet: 'astradock:v1:evidence:get',
  settingsGet: 'astradock:v1:settings:get',
  settingsUpdate: 'astradock:v1:settings:update',
  settingsRetention: 'astradock:v1:settings:retention',
  settingsDelete: 'astradock:v1:settings:delete',
  settingsReset: 'astradock:v1:settings:reset',
  diagnosticsHealth: 'astradock:v1:diagnostics:health',
  subscriptionSubscribe: 'astradock:v1:subscription:subscribe',
  subscriptionUnsubscribe: 'astradock:v1:subscription:unsubscribe',
  subscriptionEvent: 'astradock:v1:subscription:event'
});

const SAFE_ERROR_MESSAGES = Object.freeze({
  internal_error: 'The request could not be completed.',
  invalid_payload: 'The request payload is invalid.',
  invalid_sender: 'The request did not come from an approved renderer.',
  source_not_found: 'That log source is no longer available. Refresh source discovery and try again.',
  source_not_approved: 'The selected source is not approved for this operation.',
  evidence_not_found: 'That evidence detail is not available in the current local snapshot.',
  unsupported_query: 'That query is not supported by this renderer API version.',
  subscription_not_found: 'That subscription is no longer active.'
});

class BoundaryError extends Error {
  constructor(code, message, options = {}) {
    super(message || SAFE_ERROR_MESSAGES[code] || SAFE_ERROR_MESSAGES.internal_error);
    this.name = 'BoundaryError';
    this.code = code || 'internal_error';
    this.retryable = Boolean(options.retryable);
    this.details = options.details || undefined;
  }
}

function createBoundaryError(code, message, options) {
  return new BoundaryError(code, message, options);
}

function ok(data, correlationId = createCorrelationId()) {
  return {
    ok: true,
    version: API_VERSION,
    correlationId,
    data
  };
}

function fail(error, correlationId = createCorrelationId()) {
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = SAFE_ERROR_MESSAGES[code] || safeMessage(error?.message);
  return {
    ok: false,
    version: API_VERSION,
    correlationId,
    error: {
      code,
      message,
      retryable: Boolean(error?.retryable),
      details: sanitizeDetails(error?.details)
    }
  };
}

function createCorrelationId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `corr_${crypto.randomBytes(16).toString('hex')}`;
}

function safeMessage(message) {
  if (!message || typeof message !== 'string') return SAFE_ERROR_MESSAGES.internal_error;
  return message.length > 160 ? SAFE_ERROR_MESSAGES.internal_error : message;
}

function sanitizeDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return undefined;
  return Object.fromEntries(
    Object.entries(details)
      .filter(([key, value]) => isSafeDetailKey(key) && isSafeDetailValue(value))
      .slice(0, 8)
  );
}

function isSafeDetailKey(key) {
  return /^[a-z][a-zA-Z0-9]{0,40}$/.test(key) && !/path|raw|secret|token|password/i.test(key);
}

function isSafeDetailValue(value) {
  return value === null
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
    || (typeof value === 'string' && value.length <= 120 && !looksLikePath(value));
}

function looksLikePath(value) {
  return /(^[A-Za-z]:\\|^\/|\\Users\\|\/home\/|\/tmp\/|\.log\b)/i.test(String(value));
}

function validatePayload(channel, payload) {
  switch (channel) {
    case CHANNELS.sourceDiscover:
    case CHANNELS.sourceChoose:
    case CHANNELS.sourceChooseDirectory:
    case CHANNELS.monitorSnapshot:
    case CHANNELS.monitorStop:
    case CHANNELS.exporterCancel:
    case CHANNELS.settingsGet:
    case CHANNELS.diagnosticsHealth:
      return assertNoPayload(payload);
    case CHANNELS.settingsRetention:
      return { environmentKey: optionalBoundedText(payload?.environmentKey, 'environmentKey', 64) };
    case CHANNELS.settingsDelete:
      assertPlainObject(payload, 'deletion');
      if (Object.keys(payload).some((key) => !['mode', 'environmentKey'].includes(key))) {
        throw invalidPayload('Unsupported deletion field.');
      }
      if (!['sensitive_evidence', 'environment', 'all_telemetry'].includes(payload.mode)) {
        throw invalidPayload('Unsupported deletion mode.');
      }
      if (payload.mode === 'environment' && !optionalBoundedText(payload.environmentKey, 'environmentKey', 64)) {
        throw invalidPayload('An environment is required for scoped deletion.');
      }
      return { mode: payload.mode, environmentKey: optionalBoundedText(payload.environmentKey, 'environmentKey', 64) };
    case CHANNELS.settingsReset:
      return assertNoPayload(payload);
    case CHANNELS.sourceSelect:
    case CHANNELS.sourceOpenFolder:
      return { sourceId: requireSourceId(payload?.sourceId) };
    case CHANNELS.monitorScan:
    case CHANNELS.monitorStart:
      return {
        sourceId: optionalSourceId(payload?.sourceId),
        options: validateMonitorOptions(payload?.options)
      };
    case CHANNELS.exporterRun:
      assertPlainObject(payload, 'export');
      if (Object.keys(payload).some((key) => !['sourceId', 'exportType', 'environment', 'outputFormat', 'testOnly'].includes(key))) {
        throw invalidPayload('Unsupported export field.');
      }
      return {
        sourceId: optionalSourceId(payload.sourceId),
        exportType: payload.exportType === 'blueprint_data' ? 'blueprint_data' : invalidPayload('Unsupported export type.'),
        environment: ['LIVE', 'PTU', 'EPTU', 'HOTFIX', 'TECH-PREVIEW'].includes(payload.environment) ? payload.environment : invalidPayload('Unsupported export environment.'),
        outputFormat: ['json', 'csv'].includes(payload.outputFormat) ? payload.outputFormat : invalidPayload('Unsupported export format.'),
        testOnly: payload.testOnly === true
      };
    case CHANNELS.eventsQuery:
      return validateEventQuery(payload);
    case CHANNELS.evidenceGet:
      return validateEvidenceRequest(payload);
    case CHANNELS.settingsUpdate:
      return validateSettingsUpdate(payload);
    case CHANNELS.subscriptionSubscribe:
      return validateSubscriptionRequest(payload);
    case CHANNELS.subscriptionUnsubscribe:
      return { subscriptionId: requireSubscriptionId(payload?.subscriptionId) };
    default:
      throw createBoundaryError('unsupported_query', SAFE_ERROR_MESSAGES.unsupported_query);
  }
}

function assertNoPayload(payload) {
  if (payload === undefined || payload === null) return {};
  if (typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload).length === 0) return {};
  throw invalidPayload('Expected an empty payload.');
}

function validateMonitorOptions(value = {}) {
  assertPlainObject(value, 'options');
  return compactObject({
    username: optionalBoundedText(value.username, 'username', 64),
    userId: optionalBoundedText(value.userId, 'userId', MAX_TEXT_LENGTH),
    startMode: optionalStartMode(value.startMode),
    bootstrapMode: optionalBootstrapMode(value.bootstrapMode),
    checkpoint: validateCheckpoint(value.checkpoint)
  });
}

function optionalBootstrapMode(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !['none', 'current_state'].includes(value)) {
    throw invalidPayload('Unsupported monitor bootstrap mode.');
  }
  return value;
}

function optionalStartMode(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !MONITOR_START_MODES.includes(value)) {
    throw invalidPayload('Unsupported monitor start mode.');
  }
  return value;
}

function validateCheckpoint(value) {
  if (value === undefined || value === null) return null;
  assertPlainObject(value, 'checkpoint');
  const sourceIdentity = optionalBoundedText(value.sourceIdentity, 'sourceIdentity', MAX_CHECKPOINT_ID_LENGTH);
  if (!sourceIdentity) throw invalidPayload('Checkpoint source identity is required.');
  const offset = optionalBoundedInteger(value.offset, 'offset', 0, Number.MAX_SAFE_INTEGER);
  if (offset === null) throw invalidPayload('Checkpoint offset is required.');
  return {
    version: 1,
    sourceIdentity,
    offset,
    generation: optionalBoundedInteger(value.generation, 'generation', 0, Number.MAX_SAFE_INTEGER) || 0
  };
}

function validateEventQuery(value = {}) {
  assertPlainObject(value, 'query');
  const kind = value.kind || 'all';
  if (!['all', 'shards', 'actions', 'sessions'].includes(kind)) {
    throw invalidPayload('Unsupported event query kind.');
  }
  return {
    kind,
    cursor: optionalBoundedInteger(value.cursor, 'cursor', 0, MAX_CURSOR) || 0,
    limit: optionalBoundedInteger(value.limit, 'limit', 1, MAX_EVENT_LIMIT) || 100
  };
}

function validateEvidenceRequest(value = {}) {
  assertPlainObject(value, 'request');
  const environmentKey = optionalBoundedText(value.environmentKey, 'environmentKey', 160);
  if (!environmentKey) throw invalidPayload('Evidence environment is required.');
  const eventId = optionalBoundedText(value.eventId, 'eventId', 160);
  if (!eventId) throw invalidPayload('Evidence event ID is required.');
  return {
    environmentKey,
    eventId
  };
}

function validateSettingsUpdate(value = {}) {
  assertPlainObject(value, 'settings');
  const patch = {};
  if (Object.hasOwn(value, 'theme')) {
    if (value.theme !== 'dark') throw invalidPayload('Unsupported theme.');
    patch.theme = 'dark';
  }
  if (Object.hasOwn(value, 'username')) {
    patch.username = optionalBoundedText(value.username, 'username', 64) || '';
  }
  if (Object.hasOwn(value, 'userId')) {
    patch.userId = optionalBoundedText(value.userId, 'userId', MAX_TEXT_LENGTH) || '';
  }
  for (const [field, choices] of Object.entries({
    streamView: ['terminal', 'table'],
    terminalDensity: ['compact', 'default', 'relaxed'],
    tableDensity: ['compact', 'default', 'relaxed'],
    terminalDrawer: ['right', 'bottom'],
    tableDrawer: ['right', 'bottom']
  })) {
    if (Object.hasOwn(value, field)) {
      if (!choices.includes(value[field])) throw invalidPayload(`Unsupported ${field}.`);
      patch[field] = value[field];
    }
  }
  if (Object.hasOwn(value, 'retentionDays')) {
    patch.retentionDays = optionalBoundedInteger(value.retentionDays, 'retentionDays', 1, 365);
    if (patch.retentionDays === null) throw invalidPayload('Retention days are required.');
  }
  if (!Object.keys(patch).length) throw invalidPayload('No supported setting was provided.');
  return patch;
}

function validateSubscriptionRequest(value = {}) {
  assertPlainObject(value, 'subscription');
  return {
    resumeAfter: optionalBoundedInteger(value.resumeAfter, 'resumeAfter', 0, Number.MAX_SAFE_INTEGER) || 0
  };
}

function requireSourceId(value) {
  const sourceId = optionalSourceId(value);
  if (!sourceId) throw invalidPayload('Source ID is required.');
  return sourceId;
}

function optionalSourceId(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw invalidPayload('Source ID must be a string.');
  if (value.length > MAX_SOURCE_ID_LENGTH || !/^src_[a-f0-9]{24}$/.test(value)) {
    throw invalidPayload('Source ID is not recognized.');
  }
  return value;
}

function requireSubscriptionId(value) {
  if (typeof value !== 'string' || !/^sub_[a-f0-9]{24}$/.test(value)) {
    throw invalidPayload('Subscription ID is not recognized.');
  }
  return value;
}

function optionalBoundedText(value, fieldName, maxLength) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw invalidPayload(`${fieldName} must be a string.`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw invalidPayload(`${fieldName} is outside the supported limits.`);
  }
  return trimmed;
}

function optionalBoundedInteger(value, fieldName, min, max) {
  if (value === undefined || value === null || value === '') return null;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw invalidPayload(`${fieldName} is outside the supported limits.`);
  }
  return value;
}

function assertPlainObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidPayload(`${fieldName} must be an object.`);
  }
}

function invalidPayload(message) {
  throw createBoundaryError('invalid_payload', SAFE_ERROR_MESSAGES.invalid_payload, {
    details: { reason: message }
  });
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined));
}

module.exports = {
  API_VERSION,
  CHANNELS,
  SAFE_ERROR_MESSAGES,
  BoundaryError,
  createBoundaryError,
  fail,
  ok,
  validatePayload
};
