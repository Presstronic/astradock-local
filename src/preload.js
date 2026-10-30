const { contextBridge, ipcRenderer } = require('electron');

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
  compatibilityCatalog: 'astradock:v1:compatibility:catalog',
  eventsQuery: 'astradock:v1:events:query',
  evidenceGet: 'astradock:v1:evidence:get',
  settingsGet: 'astradock:v1:settings:get',
  station: 'astradock:v1:station',
  settingsUpdate: 'astradock:v1:settings:update',
  settingsRetention: 'astradock:v1:settings:retention',
  settingsDelete: 'astradock:v1:settings:delete',
  settingsReset: 'astradock:v1:settings:reset',
  diagnosticsHealth: 'astradock:v1:diagnostics:health',
  diagnosticsPreview: 'astradock:v1:diagnostics:preview',
  diagnosticsExport: 'astradock:v1:diagnostics:export',
  diagnosticsDelete: 'astradock:v1:diagnostics:delete',
  subscriptionSubscribe: 'astradock:v1:subscription:subscribe',
  subscriptionUnsubscribe: 'astradock:v1:subscription:unsubscribe',
  subscriptionEvent: 'astradock:v1:subscription:event'
});

function createCorrelationId() {
  return `renderer_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`;
}

async function invoke(channel, data) {
  const result = await ipcRenderer.invoke(channel, {
    correlationId: createCorrelationId(),
    data
  });
  if (result?.ok) return result.data;

  const error = new Error(result?.error?.message || 'The request could not be completed.');
  error.code = result?.error?.code || 'internal_error';
  error.retryable = Boolean(result?.error?.retryable);
  error.correlationId = result?.correlationId || null;
  throw error;
}

function subscribe(listener, options = {}) {
  if (typeof listener !== 'function') throw new TypeError('Subscription listener is required.');
  let active = true;
  let subscriptionId = null;

  const ipcListener = (_event, message) => {
    if (!active || message.subscriptionId !== subscriptionId) return;
    listener(Object.freeze(message));
  };

  ipcRenderer.on(CHANNELS.subscriptionEvent, ipcListener);
  invoke(CHANNELS.subscriptionSubscribe, options)
    .then((subscription) => {
      if (!active) {
        invoke(CHANNELS.subscriptionUnsubscribe, { subscriptionId: subscription.subscriptionId }).catch(() => {});
        return;
      }
      subscriptionId = subscription.subscriptionId;
    })
    .catch((error) => {
      if (active) listener(Object.freeze({ error: serializeError(error), changes: [], dropped: 0 }));
    });

  return () => {
    active = false;
    ipcRenderer.removeListener(CHANNELS.subscriptionEvent, ipcListener);
    if (subscriptionId) {
      invoke(CHANNELS.subscriptionUnsubscribe, { subscriptionId }).catch(() => {});
    }
  };
}

function serializeError(error) {
  return {
    code: error?.code || 'internal_error',
    message: error?.message || 'The request could not be completed.'
  };
}

const api = Object.freeze({
  version: 1,
  station: Object.freeze({
    getSnapshot: () => invoke(CHANNELS.station, { command: 'snapshot' }),
    configure: (data) => invoke(CHANNELS.station, { command: 'configure', data }),
    signIn: () => invoke(CHANNELS.station, { command: 'signIn' }),
    cancelSignIn: () => invoke(CHANNELS.station, { command: 'cancelSignIn' }),
    signOut: () => invoke(CHANNELS.station, { command: 'signOut' }),
    refreshAccess: () => invoke(CHANNELS.station, { command: 'refreshAccess' }),
    refreshInventory: () => invoke(CHANNELS.station, { command: 'refreshInventory' }),
    updateConsent: (data) => invoke(CHANNELS.station, { command: 'consent', data }),
    review: (proposalId) => invoke(CHANNELS.station, { command: 'review', data: { proposalId } }),
    confirm: (proposalId, challenge) => invoke(CHANNELS.station, { command: 'confirm', data: { proposalId, challenge } }),
    cancel: (proposalId) => invoke(CHANNELS.station, { command: 'cancel', data: { proposalId } }),
    reject: (proposalId) => invoke(CHANNELS.station, { command: 'reject', data: { proposalId } }),
    retry: () => invoke(CHANNELS.station, { command: 'retry' }),
    resolveItems: (ids) => invoke(CHANNELS.station, { command: 'resolveItems', data: { ids } })
  }),
  source: Object.freeze({
    discover: () => invoke(CHANNELS.sourceDiscover),
    choose: () => invoke(CHANNELS.sourceChoose),
    chooseDirectory: () => invoke(CHANNELS.sourceChooseDirectory),
    select: (sourceId) => invoke(CHANNELS.sourceSelect, { sourceId }),
    openFolder: (sourceId) => invoke(CHANNELS.sourceOpenFolder, { sourceId })
  }),
  monitor: Object.freeze({
    getSnapshot: () => invoke(CHANNELS.monitorSnapshot),
    scan: (command = {}) => invoke(CHANNELS.monitorScan, command),
    start: (command = {}) => invoke(CHANNELS.monitorStart, command),
    stop: () => invoke(CHANNELS.monitorStop),
    subscribe
  }),
  exporter: Object.freeze({
    run: (options) => invoke(CHANNELS.exporterRun, options),
    cancel: () => invoke(CHANNELS.exporterCancel)
  }),
  compatibility: Object.freeze({
    getCatalog: () => invoke(CHANNELS.compatibilityCatalog)
  }),
  events: Object.freeze({
    query: (query = {}) => invoke(CHANNELS.eventsQuery, query),
    getEvidenceDetail: (request) => invoke(CHANNELS.evidenceGet, request)
  }),
  settings: Object.freeze({
    get: () => invoke(CHANNELS.settingsGet),
    update: (patch) => invoke(CHANNELS.settingsUpdate, patch),
    applyRetention: (environmentKey) => invoke(CHANNELS.settingsRetention, { environmentKey }),
    deleteTelemetry: (mode, environmentKey) => invoke(CHANNELS.settingsDelete, { mode, environmentKey }),
    reset: () => invoke(CHANNELS.settingsReset)
  }),
  diagnostics: Object.freeze({
    getHealth: () => invoke(CHANNELS.diagnosticsHealth),
    preview: () => invoke(CHANNELS.diagnosticsPreview),
    export: () => invoke(CHANNELS.diagnosticsExport),
    deleteLocal: () => invoke(CHANNELS.diagnosticsDelete)
  }),
  overlay: Object.freeze({
    open: () => ipcRenderer.invoke('astradock:v1:overlay:open'),
    close: () => ipcRenderer.invoke('astradock:v1:overlay:close'),
    getPreferences: () => ipcRenderer.invoke('astradock:v1:overlay:get-preferences'),
    updatePreferences: (patch) => ipcRenderer.invoke('astradock:v1:overlay:preferences', patch),
    subscribeFeed: (listener) => {
      if (typeof listener !== 'function') throw new TypeError('Overlay feed listener is required.');
      const onFeed = (_event, feed) => listener(Object.freeze(feed));
      ipcRenderer.on('astradock:v1:overlay:feed', onFeed);
      ipcRenderer.invoke('astradock:v1:overlay:feed-subscribe').then((feed) => listener(Object.freeze(feed))).catch(() => {});
      return () => ipcRenderer.removeListener('astradock:v1:overlay:feed', onFeed);
    }
  })
});

const overlayApi = Object.freeze({ version: api.version, overlay: Object.freeze({
  close: api.overlay.close,
  getPreferences: api.overlay.getPreferences,
  updatePreferences: api.overlay.updatePreferences,
  subscribeFeed: api.overlay.subscribeFeed
}) });
contextBridge.exposeInMainWorld('astradock', process.argv.includes('--astradock-overlay') ? overlayApi : api);
