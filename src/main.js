const { app, BrowserWindow, dialog, ipcMain, safeStorage, session, shell } = require('electron');
const path = require('node:path');
const { parseLogFile } = require('./logParser');
const {
  CHANNELS,
  createBoundaryError,
  fail,
  ok,
  validatePayload
} = require('./ipcBoundary');
const {
  configureChromiumRuntimeFlags,
  createBrowserWindowOptions,
  getRendererUrl,
  installAppSecurityPolicy,
  isAllowedRendererUrl
} = require('./electronSecurity');
const { SubscriptionHub } = require('./subscriptionHub');
const {
  loadRendererSettings,
  updateRendererSettings
} = require('./settingsStore');
const {
  assertSourceIsApproved,
  discoverInstallationEnvironments,
  discoverRuntimeSources,
  getPreferredInstallationDirectory,
  loadSourcePreference,
  saveSourcePreference,
  toPublicSource,
  validateLogSource
} = require('./sourceDiscovery');
const { RuntimeLogTailer } = require('./runtimeLogTailer');
const { redactStableIdentifier } = require('./runtimeLifecycleProjection');
const { CanonicalEventStore } = require('./persistence/canonicalEventStore');
const { createElectronStorageKeyProvider } = require('./persistence/storageKeyProvider');
const { createDiagnosticLogger } = require('./diagnosticLogger');
const { createDiagnosticsSupportService } = require('./diagnosticsSupport');
const { DEFAULT_SETTINGS } = require('./settingsStore');
const {
  scanBlueprintLogs,
  getDefaultBlueprintExtractionProfiles,
  writeBlueprintCsv,
  writeBlueprintJson,
  writeBlueprintXml
} = require('./exporter/blueprintExporter');
const { createPublicBlueprintExportResult } = require('./exporter/blueprintExportContract');
const { getBuildCompatibilityCatalog } = require('./buildCompatibilityCatalog');

const rendererIndexPath = path.join(__dirname, '..', 'dist', 'renderer', 'index.html');
const rendererUrl = getRendererUrl(rendererIndexPath);

configureChromiumRuntimeFlags({ app });

let mainWindow;
let watchedLogPath = null;
let watchedSourceId = null;
let activeTailer = null;
let selectedInstallationRoot = null;
let watchOptions = {};
let monitorGeneration = 0;
let shuttingDown = false;
let lastScan = null;
let lastScanSource = null;
let lastTailerCheckpoint = null;
let lastTailerHealth = null;
let liveScanTimer = null;
let liveScanInFlight = false;
let liveScanQueued = false;
let liveScanSourceId = null;
let liveScanOptions = {};
const sourceRegistry = new Map();
let activeSourceId = null;
let eventStore = null;
let eventStoreHealth = { status: 'initializing', errorCode: null, recoverable: true };
let diagnosticLogger = null;
let diagnosticsSupport = null;
let exporterCancelRequested = false;
let exporterRunning = false;
const subscriptions = new SubscriptionHub({ channel: CHANNELS.subscriptionEvent, maxSubscribers: 8 });

installAppSecurityPolicy({ app, session, rendererUrl });

function createWindow() {
  mainWindow = new BrowserWindow(createBrowserWindowOptions(path.join(__dirname, 'preload.js'), {
    isPackaged: app.isPackaged
  }));

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isAllowedRendererUrl(navigationUrl, rendererUrl)) event.preventDefault();
  });
  const webContentsId = mainWindow.webContents.id;
  mainWindow.webContents.on('destroyed', () => {
    subscriptions.removeForWebContents(webContentsId);
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(rendererIndexPath);
}

app.whenReady().then(async () => {
  try {
    diagnosticLogger = createDiagnosticLogger({ directory: path.join(app.getPath('userData'), 'logs') });
    diagnosticLogger.info('application_ready', { packaged: app.isPackaged, platform: process.platform, arch: process.arch });
  } catch (error) {
    // Diagnostics are best effort and must not prevent the app from starting.
    console.error('AstraDock diagnostic logger could not start.', error?.message || error);
  }
  diagnosticsSupport = createDiagnosticsSupportService({
    logDirectory: path.join(app.getPath('userData'), 'logs'),
    getHealth: () => getDiagnosticsHealth(),
    metadata: { appVersion: app.getVersion(), build: app.isPackaged ? 'packaged' : 'development', platform: process.platform, arch: process.arch, packaged: app.isPackaged }
  });
  await initializeEventStore();
  createWindow();
}).catch((error) => {
  diagnosticLogger?.error('application_start_failed', error);
  throw error;
});

process.on('uncaughtException', (error) => {
  diagnosticLogger?.error('uncaught_exception', error);
});

process.on('unhandledRejection', (reason) => {
  diagnosticLogger?.error('unhandled_rejection', reason instanceof Error ? reason : { reason });
});

app.on('window-all-closed', async () => {
  await stopMonitor('application_shutdown');
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  shuttingDown = true;
  diagnosticLogger?.info('application_shutdown');
  await stopMonitor('application_shutdown');
  eventStore?.close();
  eventStore = null;
  diagnosticLogger?.close();
  diagnosticsSupport = null;
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

register(CHANNELS.sourceDiscover, async () => {
  const discovery = await discoverAndRegisterSources();
  return {
    ...discovery,
    sources: discovery.sources.map(toPublicSource),
    activeSource: discovery.activeSource ? toPublicSource(discovery.activeSource) : null
  };
});

register(CHANNELS.sourceChoose, async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Star Citizen game.log',
    properties: ['openFile'],
    filters: [
      { name: 'Log files', extensions: ['log', 'txt'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });

  if (result.canceled) return null;
  const source = await validateLogSource(result.filePaths[0], {
    discoveryMethods: ['user_selected']
  });
  rememberSource(source);

  if (source.validation.isValid) {
    activeSourceId = source.sourceId;
    await saveSourcePreference(getSourcePreferencePath(), source, { installationRoot: selectedInstallationRoot });
  }

  return {
    source: toPublicSource(source),
    saved: source.validation.isValid
  };
});

register(CHANNELS.sourceChooseDirectory, async () => {
  const preference = await loadSourcePreference(getSourcePreferencePath());
  const defaultPath = await getPreferredInstallationDirectory({
    savedInstallationRoot: selectedInstallationRoot || preference?.selectedInstallationRoot || null
  });
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Roberts Space Industries directory',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: defaultPath || undefined
  });

  if (result.canceled) return null;
  const installationRoot = result.filePaths[0];
  const installation = await discoverInstallationEnvironments(installationRoot);
  if (!installation.valid || !installation.environments.length) {
    const directSource = await validateLogSource(path.join(installationRoot, 'Game.log'), {
      discoveryMethods: ['user_selected', 'directory_selected']
    });
    if (!directSource.validation.isValid) {
      return {
        source: null,
        sources: [],
        saved: false,
        installation: {
          valid: installation.valid,
          reason: installation.reason || directSource.validation.message || 'No uppercase Star Citizen environment with Game.log was found.'
        }
      };
    }
    selectedInstallationRoot = null;
    sourceRegistry.clear();
    rememberSource(directSource);
    activeSourceId = directSource.sourceId;
    await saveSourcePreference(getSourcePreferencePath(), directSource);
    return { source: toPublicSource(directSource), sources: [toPublicSource(directSource)], saved: true, installation: { valid: true } };
  }
  const discovered = await Promise.all(installation.environments.map((logPath) => validateLogSource(logPath, {
    discoveryMethods: ['automatic', 'directory_selected']
  })));
  selectedInstallationRoot = installationRoot;
  sourceRegistry.clear();
  discovered.forEach(rememberSource);
  const source = selectPreferredSource(discovered);
  const saved = Boolean(source?.validation.isValid);
  activeSourceId = saved ? source.sourceId : null;
  if (saved) await saveSourcePreference(getSourcePreferencePath(), source, { installationRoot });
  return { source: source ? toPublicSource(source) : null, sources: discovered.map(toPublicSource), saved, installation: { valid: true } };
});

register(CHANNELS.sourceSelect, async ({ sourceId }) => {
  const source = await revalidateRegisteredSource(sourceId);
  if (!source.validation.isValid) {
    return {
      source: toPublicSource(source),
      selected: false
    };
  }

  activeSourceId = source.sourceId;
  await saveSourcePreference(getSourcePreferencePath(), source, { installationRoot: selectedInstallationRoot });
  return {
    source: toPublicSource(source),
    selected: true
  };
});

register(CHANNELS.sourceOpenFolder, async ({ sourceId }) => {
  const source = await revalidateRegisteredSource(sourceId || activeSourceId);
  if (!source.validation.isValid) {
    throw createBoundaryError(source.validation.status, source.validation.message);
  }
  await shell.openPath(path.dirname(source.private.canonicalPath));
  return { opened: true };
});

register(CHANNELS.monitorSnapshot, async () => getMonitorSnapshot());

register(CHANNELS.monitorScan, async ({ sourceId, options }) => {
  const source = await getApprovedSource(sourceId || activeSourceId);
  const scan = await scanSource(source, options);
  publishMonitorChange({
    type: 'monitor.scan',
    monitor: getMonitorState(),
    scan
  });
  return scan;
});

register(CHANNELS.monitorStart, async ({ sourceId, options }) => {
  const source = await getApprovedSource(sourceId || activeSourceId);
  const monitorOptions = { bootstrapMode: 'current_state', ...options };
  await startMonitor(source, monitorOptions);
  let scan;
  try {
    scan = await scanSource(source, monitorOptions);
  } catch (error) {
    await stopMonitor('runtime_error');
    throw error;
  }
  return {
    monitor: getMonitorState(),
    scan
  };
});

register(CHANNELS.monitorStop, async () => {
  await stopMonitor('user_requested');
  return getMonitorState();
});

register(CHANNELS.exporterCancel, async () => {
  exporterCancelRequested = true;
  return { cancelled: true };
});

register(CHANNELS.compatibilityCatalog, async () => getBuildCompatibilityCatalog());

register(CHANNELS.exporterRun, async ({ sourceId, exportType, environment, outputFormat, testOnly }) => {
  if (exportType !== 'blueprint_data') {
    throw createBoundaryError('invalid_payload', 'Only Blueprint Data export is currently supported.');
  }
  const source = await getApprovedSource(sourceId || activeSourceId);
  if (source.channelHint !== environment) {
    throw createBoundaryError('source_not_approved', `Select the ${environment} game.log source for this export.`);
  }
  if (exporterRunning) {
    throw createBoundaryError('invalid_payload', 'An export is already running.');
  }
  exporterRunning = true;
  exporterCancelRequested = false;
  const publishProgress = (progress) => publishMonitorChange({ type: 'exporter.progress', progress });
  publishProgress({ phase: 'validating', filesProcessed: 0, filesTotal: 0, recordsFound: 0, duplicatesSuppressed: 0 });
  try {
    const result = await scanBlueprintLogs(source.private.canonicalPath, {
      profiles: getDefaultBlueprintExtractionProfiles(),
      shouldCancel: () => exporterCancelRequested,
      onProgress: (progress) => publishProgress({
        ...progress,
        recordsFound: progress.recordsFound ?? 0,
        duplicatesSuppressed: progress.duplicatesSuppressed ?? 0
      })
    });
    if (result.extraction.status !== 'approved') {
      publishProgress({ phase: 'no_matches', filesProcessed: result.filesScanned, filesTotal: result.filesTotal, recordsFound: 0, duplicatesSuppressed: 0 });
      return createPublicBlueprintExportResult(result, { status: 'no_matches', outputFormat, testOnly });
    }
    if (exporterCancelRequested) {
      publishProgress({ phase: 'cancelled', filesProcessed: result.filesScanned, filesTotal: result.filesTotal, recordsFound: result.records.length, duplicatesSuppressed: result.duplicatesSuppressed });
      return createPublicBlueprintExportResult(result, { status: 'cancelled', outputFormat, testOnly, records: [] });
    }
    const status = result.errors.length ? 'partial' : result.records.length ? 'completed' : 'no_matches';
    if (testOnly) {
      publishProgress({ phase: status, filesProcessed: result.filesScanned, filesTotal: result.filesTotal, recordsFound: result.records.length, duplicatesSuppressed: result.duplicatesSuppressed });
      return createPublicBlueprintExportResult(result, { status, outputFormat, testOnly });
    }
    publishProgress({ phase: 'save_pending', filesProcessed: result.filesScanned, filesTotal: result.filesTotal, recordsFound: result.records.length, duplicatesSuppressed: result.duplicatesSuppressed });
    const extension = outputFormat === 'csv' ? 'csv' : outputFormat === 'xml' ? 'xml' : 'json';
    const saveResult = await retryExporterOperation(() => dialog.showSaveDialog(mainWindow, {
      title: 'Export Blueprint Data',
      defaultPath: path.join(app.getPath('documents'), `astradock-blueprints.${extension}`),
      filters: [{ name: `${outputFormat.toUpperCase()} files`, extensions: [extension] }],
      properties: ['showOverwriteConfirmation']
    }), 'The save dialog could not be opened.');
    if (saveResult.canceled || !saveResult.filePath) {
      publishProgress({ phase: 'cancelled', filesProcessed: result.filesScanned, filesTotal: result.filesTotal, recordsFound: result.records.length, duplicatesSuppressed: result.duplicatesSuppressed });
      return createExporterResult(result, { status: 'cancelled', outputFormat, testOnly, records: [] });
    }
    publishProgress({ phase: 'writing', filesProcessed: result.filesScanned, filesTotal: result.filesTotal, recordsFound: result.records.length, duplicatesSuppressed: result.duplicatesSuppressed });
    const outputPath = await retryExporterOperation(() => outputFormat === 'csv'
      ? writeBlueprintCsv(saveResult.filePath, result.records, { shouldCancel: () => exporterCancelRequested })
      : outputFormat === 'xml'
        ? writeBlueprintXml(saveResult.filePath, result.records, { shouldCancel: () => exporterCancelRequested })
        : writeBlueprintJson(saveResult.filePath, result.records, { shouldCancel: () => exporterCancelRequested }), 'The export file could not be written.');
    shell.showItemInFolder(outputPath);
    publishProgress({ phase: status, filesProcessed: result.filesScanned, filesTotal: result.filesTotal, recordsFound: result.records.length, duplicatesSuppressed: result.duplicatesSuppressed, outputFileName: path.basename(outputPath) });
    return createPublicBlueprintExportResult(result, { status, outputFileName: path.basename(outputPath), outputFormat, testOnly });
  } catch (error) {
    if (error?.code === 'export_cancelled') {
      publishProgress({ phase: 'cancelled', filesProcessed: 0, filesTotal: 0, recordsFound: 0, duplicatesSuppressed: 0 });
      return { status: 'cancelled', outputPath: null, outputFileName: null, outputFormat, testOnly, records: [], files: [], filesScanned: 0, filesTotal: 0, linesRead: 0, duplicatesSuppressed: 0, skippedFiles: 0, sourceFingerprint: '', diagnostics: [], errors: [], extraction: { status: 'unsupported', profileId: null, profileVersion: null, parserVersion: 'blueprint-notification-v1', reason: 'Export cancelled before extraction completed.' } };
    }
    throw error;
  } finally {
    exporterCancelRequested = false;
    exporterRunning = false;
  }
});

async function retryExporterOperation(operation, message) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (error?.code === 'export_cancelled') throw error;
      if (attempt === 1) break;
    }
  }
  throw createBoundaryError('internal_error', message, { retryable: true, details: { operation: 'export' } });
}

register(CHANNELS.eventsQuery, async (query) => queryEvents(query));

register(CHANNELS.evidenceGet, async (request) => getEvidenceDetail(request));

register(CHANNELS.settingsGet, async () => ({
  settings: await loadRendererSettings(getSettingsPath()),
  storage: eventStore ? eventStore.getStorageSummary() : eventStoreHealth,
  activeSourceId
}));

register(CHANNELS.settingsUpdate, async (patch) => {
  const settings = await updateRendererSettings(getSettingsPath(), patch);
  if (eventStore && patch.retentionDays) eventStore.applyRetention({ retentionDays: settings.retentionDays });
  return { settings, storage: eventStore ? eventStore.getStorageSummary() : eventStoreHealth, activeSourceId };
});

register(CHANNELS.settingsRetention, async ({ environmentKey }) => {
  if (!eventStore) throw createBoundaryError('internal_error', 'Local storage is not ready.');
  const settings = await loadRendererSettings(getSettingsPath());
  const outcome = eventStore.applyRetention({ retentionDays: settings.retentionDays, environmentKey });
  return { outcome, storage: eventStore.getStorageSummary() };
});

register(CHANNELS.settingsDelete, async ({ mode, environmentKey }) => {
  if (!eventStore) throw createBoundaryError('internal_error', 'Local storage is not ready.');
  if (mode === 'environment' && activeTailer) await stopMonitor('telemetry_deleted');
  let deleted;
  if (mode === 'sensitive_evidence') deleted = eventStore.deleteSensitiveEvidence();
  else if (mode === 'environment') deleted = eventStore.deleteEnvironment(environmentKey);
  else deleted = eventStore.deleteAllTelemetry();
  eventStoreHealth = eventStore.getStorageSummary();
  return { mode, environmentKey: environmentKey || null, deleted, storage: eventStoreHealth };
});

register(CHANNELS.settingsReset, async () => {
  if (activeTailer) await stopMonitor('app_data_reset');
  if (eventStore) {
    eventStore.deleteAllTelemetry();
    eventStoreHealth = eventStore.getStorageSummary();
  }
  diagnosticsSupport?.deleteLocalDiagnostics();
  await Promise.all([
    fsUnlinkIfPresent(getSettingsPath()),
    fsUnlinkIfPresent(getSourcePreferencePath())
  ]);
  activeSourceId = null;
  sourceRegistry.clear();
  return { settings: { ...DEFAULT_SETTINGS }, storage: eventStore ? eventStore.getStorageSummary() : eventStoreHealth, activeSourceId };
});

register(CHANNELS.diagnosticsHealth, async () => getDiagnosticsHealth());

register(CHANNELS.diagnosticsPreview, async () => {
  if (!diagnosticsSupport) throw createBoundaryError('internal_error', 'Diagnostics are not ready.');
  return diagnosticsSupport.preview();
});

register(CHANNELS.diagnosticsExport, async () => {
  if (!diagnosticsSupport) throw createBoundaryError('internal_error', 'Diagnostics are not ready.');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export sanitized AstraDock diagnostics',
    defaultPath: path.join(app.getPath('documents'), 'astradock-diagnostics.json'),
    filters: [{ name: 'Diagnostics bundle', extensions: ['json'] }],
    properties: ['showOverwriteConfirmation']
  });
  if (result.canceled || !result.filePath) return { status: 'cancelled', outputFileName: null };
  const exported = diagnosticsSupport.export(result.filePath);
  diagnosticLogger?.info('diagnostics_exported', { outputFileName: exported.outputFileName, bytes: exported.bytes });
  return exported;
});

register(CHANNELS.diagnosticsDelete, async () => {
  if (!diagnosticsSupport) throw createBoundaryError('internal_error', 'Diagnostics are not ready.');
  const deleted = diagnosticsSupport.deleteLocalDiagnostics();
  return { ...deleted, health: getDiagnosticsHealth() };
});

register(CHANNELS.subscriptionSubscribe, async (payload, event) => {
  const subscription = subscriptions.add(event.sender, payload);
  return subscription;
});

register(CHANNELS.subscriptionUnsubscribe, async ({ subscriptionId }) => {
  const removed = subscriptions.remove(subscriptionId);
  if (!removed) {
    throw createBoundaryError('subscription_not_found', 'That subscription is no longer active.');
  }
  return { subscriptionId, removed };
});

function register(channel, handler) {
  ipcMain.handle(channel, async (event, payload) => {
    const correlationId = payload?.correlationId;
    try {
      assertTrustedSender(event);
      const validatedPayload = validatePayload(channel, payload?.data);
      const data = await handler(validatedPayload, event);
      return ok(data, correlationId);
    } catch (error) {
      diagnosticLogger?.error('ipc_request_failed', { channel, code: error?.code || 'internal_error', message: error?.message });
      return fail(error, correlationId);
    }
  });
}

function assertTrustedSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw createBoundaryError('invalid_sender', 'The request did not come from an approved renderer.');
  }
  if (event.sender.isDestroyed()) {
    throw createBoundaryError('invalid_sender', 'The request did not come from an approved renderer.');
  }
  const senderUrl = event.senderFrame?.url || event.sender.getURL();
  if (!isAllowedRendererUrl(senderUrl, rendererUrl)) {
    throw createBoundaryError('invalid_sender', 'The request did not come from an approved renderer.');
  }
}

function getSourcePreferencePath() {
  return path.join(app.getPath('userData'), 'source-preference.json');
}

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'renderer-settings.json');
}

async function fsUnlinkIfPresent(filePath) {
  const fs = require('node:fs/promises');
  try { await fs.unlink(filePath); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

async function discoverAndRegisterSources() {
  const preference = await loadSourcePreference(getSourcePreferencePath());
  selectedInstallationRoot = preference?.selectedInstallationRoot || null;
  const discovery = await discoverRuntimeSources({
    installationRoots: selectedInstallationRoot ? [selectedInstallationRoot] : undefined,
    restoredSourcePath: preference?.selectedSourcePath || null,
    includePrivate: true
  });

  sourceRegistry.clear();
  for (const source of discovery.sources) rememberSource(source);
  activeSourceId = discovery.activeSource?.sourceId || null;
  return discovery;
}

function rememberSource(source) {
  sourceRegistry.set(source.sourceId, source);
}

function selectPreferredSource(sources) {
  return sources.find((source) => source.channelHint === 'LIVE' && source.validation.isValid)
    || sources.find((source) => source.validation.isValid)
    || sources[0]
    || null;
}

async function revalidateRegisteredSource(sourceId) {
  const source = sourceRegistry.get(sourceId);
  if (!source?.private?.canonicalPath) {
    throw createBoundaryError('source_not_found');
  }

  const refreshed = await validateLogSource(source.private.canonicalPath, {
    discoveryMethods: source.discoveryMethods
  });
  if (refreshed.sourceId !== source.sourceId) sourceRegistry.delete(source.sourceId);
  rememberSource(refreshed);
  return refreshed;
}

async function getApprovedSource(sourceId) {
  const source = await revalidateRegisteredSource(sourceId);
  if (!source.validation.isValid) {
    throw createBoundaryError('source_not_approved', source.validation.message);
  }
  assertSourceIsApproved(source);
  activeSourceId = source.sourceId;
  return source;
}

async function scanSource(source, options = {}) {
  const result = await parseLogFile(source.private.canonicalPath, options);
  persistCanonicalEvents(result.runtimeEvents || []);
  lastScan = result;
  lastScanSource = source;
  return toRendererScanResult(result, source, options);
}

async function startMonitor(source, options = {}) {
  if (activeTailer) await stopMonitor('source_changed');
  monitorGeneration += 1;
  const generation = monitorGeneration;
  const logPath = source.private.canonicalPath;
  watchedLogPath = logPath;
  watchedSourceId = source.sourceId;
  watchOptions = options;
  lastTailerCheckpoint = null;

  activeTailer = new RuntimeLogTailer(logPath, {
    startMode: options.startMode || 'from_current_end',
    checkpoint: options.checkpoint || null,
    onChunk: async (chunk) => {
      if (generation !== monitorGeneration || watchedSourceId !== source.sourceId) return;
      lastTailerCheckpoint = {
        version: 1,
        sourceIdentity: chunk.sourceIdentity,
        offset: chunk.offsetEnd,
        generation: chunk.generation,
        observedAt: chunk.observedAt
      };
      lastTailerHealth = activeTailer?.getHealth() || lastTailerHealth;
      publishMonitorChange({
        type: 'monitor.bytes',
        monitor: getMonitorState(),
        chunk: toRendererTailerChunk(chunk, source)
      });
      requestLiveScan(source, watchOptions);
    },
    onLifecycle: (record) => {
      if (generation !== monitorGeneration || watchedSourceId !== source.sourceId) return;
      lastTailerCheckpoint = activeTailer?.getCheckpoint() || lastTailerCheckpoint;
      lastTailerHealth = activeTailer?.getHealth() || lastTailerHealth;
      publishMonitorChange({
        type: 'monitor.lifecycle',
        monitor: getMonitorState(),
        lifecycle: toRendererLifecycle(record, source)
      });
    }
  });
  await activeTailer.start();
  lastTailerHealth = activeTailer.getHealth();
  lastTailerCheckpoint = activeTailer.getCheckpoint();

  publishMonitorChange({
    type: 'monitor.started',
    monitor: getMonitorState()
  });
}

async function stopMonitor(reason) {
  monitorGeneration += 1;
  const tailer = activeTailer;
  const wasActive = Boolean(tailer || watchedSourceId);
  activeTailer = null;
  if (tailer) {
    await tailer.stop(reason);
    lastTailerHealth = tailer.getHealth();
    lastTailerCheckpoint = tailer.getCheckpoint() || lastTailerCheckpoint;
  }
  watchedLogPath = null;
  watchedSourceId = null;
  watchOptions = {};
  clearLiveScanState();

  if (wasActive && !shuttingDown) {
    publishMonitorChange({
      type: 'monitor.stopped',
      reason,
      monitor: getMonitorState()
    });
  }
}

function publishMonitorChange(change) {
  subscriptions.publish(change);
}

function getMonitorSnapshot() {
  return {
    monitor: getMonitorState(),
    source: lastScanSource ? toPublicSource(lastScanSource) : null,
    scan: lastScan && lastScanSource ? toRendererScanResult(lastScan, lastScanSource) : null,
    subscriptions: subscriptions.getStats()
  };
}

function getMonitorState() {
  const tailerHealth = activeTailer?.getHealth() || lastTailerHealth;
  return {
    active: Boolean(activeTailer && watchedSourceId),
    sourceId: watchedSourceId,
    sequence: subscriptions.getStats().sequence,
    pendingScan: Boolean(liveScanTimer || liveScanInFlight || liveScanQueued),
    tailer: tailerHealth ? sanitizeTailerHealth(tailerHealth) : null,
    checkpoint: lastTailerCheckpoint,
    storage: eventStoreHealth
  };
}

async function initializeEventStore() {
  const storageDirectory = path.join(app.getPath('userData'), 'telemetry');
  try {
    const keyProvider = createElectronStorageKeyProvider({
      safeStorage,
      keyFilePath: path.join(storageDirectory, 'database-key.json')
    });
    const encryptionKey = await keyProvider.getOrCreateKey();
    try {
      eventStore = new CanonicalEventStore({
        filePath: path.join(storageDirectory, 'canonical-events.db'),
        encryptionKey
      });
    } finally {
      encryptionKey.fill(0);
    }
    eventStore.applyRetention();
    eventStoreHealth = eventStore.getHealth();
  } catch (error) {
    eventStore = null;
    eventStoreHealth = {
      status: 'error',
      errorCode: error?.code || 'storage_initialization_failed',
      recoverable: error?.recoverable !== false
    };
  }
}

function persistCanonicalEvents(events) {
  if (!eventStore) return;
  try {
    const append = eventStore.append(events);
    eventStoreHealth = { ...eventStore.getHealth(), lastAppend: append };
  } catch (error) {
    eventStoreHealth = {
      ...eventStoreHealth,
      status: 'error',
      errorCode: error?.code || 'storage_append_failed',
      recoverable: error?.recoverable !== false
    };
  }
}

function requestLiveScan(source, options = {}) {
  if (!source?.sourceId || watchedSourceId !== source.sourceId) return;

  liveScanSourceId = source.sourceId;
  liveScanOptions = options;
  liveScanQueued = true;
  if (liveScanTimer || liveScanInFlight) return;

  liveScanTimer = setTimeout(() => {
    liveScanTimer = null;
    runQueuedLiveScan().catch(() => {});
  }, 150);
  liveScanTimer.unref?.();
}

async function runQueuedLiveScan() {
  if (liveScanInFlight || !liveScanQueued) return;

  const sourceId = liveScanSourceId;
  const options = liveScanOptions;
  liveScanQueued = false;
  liveScanInFlight = true;

  try {
    if (!activeTailer || watchedSourceId !== sourceId) return;
    const source = await revalidateRegisteredSource(sourceId);
    if (!source.validation.isValid) {
      throw createBoundaryError('source_not_approved', source.validation.message);
    }
    const scan = await scanSource(source, options);
    publishMonitorChange({
      type: 'monitor.scan',
      monitor: getMonitorState(),
      scan
    });
  } catch (error) {
    publishMonitorChange({
      type: 'monitor.error',
      monitor: getMonitorState(),
      error: {
        code: error?.code || 'internal_error',
        message: error?.message || 'Live scan failed.',
        retryable: error?.retryable !== false
      }
    });
  } finally {
    liveScanInFlight = false;
    if (liveScanQueued && activeTailer && watchedSourceId === sourceId) {
      requestLiveScan(sourceRegistry.get(sourceId), liveScanOptions);
    }
  }
}

function clearLiveScanState() {
  if (liveScanTimer) clearTimeout(liveScanTimer);
  liveScanTimer = null;
  liveScanInFlight = false;
  liveScanQueued = false;
  liveScanSourceId = null;
  liveScanOptions = {};
}

function queryEvents(query) {
  const collections = {
    shards: lastScan?.entries || [],
    actions: lastScan?.userActivity?.actions || [],
    sessions: lastScan?.userActivity?.sessions || []
  };
  const all = collections.shards
    .map((item) => ({ kind: 'shard', item: sanitizeEvidenceCarrier(item) }))
    .concat(collections.actions.map((item) => ({ kind: 'action', item: sanitizeEvidenceCarrier(item) })))
    .concat(collections.sessions.map((item) => ({ kind: 'session', item: sanitizeEvidenceCarrier(item) })));
  const rows = query.kind === 'all'
    ? all
    : collections[query.kind].map((item) => ({ kind: toSingularEventKind(query.kind), item: sanitizeEvidenceCarrier(item) }));
  const page = rows.slice(query.cursor, query.cursor + query.limit);
  return {
    cursor: query.cursor,
    nextCursor: query.cursor + page.length < rows.length ? query.cursor + page.length : null,
    totalCount: rows.length,
    items: page
  };
}

function getEvidenceDetail(request) {
  const canonical = eventStore?.getById(request.eventId, request.environmentKey);
  if (canonical) return toCanonicalEvidenceDetail(canonical);

  // Legacy scan carriers are kept as a compatibility path for records that were
  // parsed before canonical persistence was available. They are still scoped by
  // environment and never satisfy a request from another environment.
  const candidates = [
    ...(lastScan?.promotedRuntimeEvents || []).map((item) => ({ kind: 'runtime', item })),
    ...(lastScan?.entries || []).map((item) => ({ kind: 'shard', item })),
    ...(lastScan?.userActivity?.actions || []).map((item) => ({ kind: 'action', item })),
    ...(lastScan?.userActivity?.sessions || []).map((item) => ({ kind: 'session', item }))
  ];
  const match = candidates.find(({ item }) => (item.id || item.eventId) === request.eventId
    && (!item.environmentKey || item.environmentKey === request.environmentKey));
  if (!match) throw createBoundaryError('evidence_not_found');
  return toLegacyEvidenceDetail(match.kind, match.item, request.environmentKey);
}

function toCanonicalEvidenceDetail(event) {
  const markers = event.evidenceReference?.evidenceMarkers || [];
  const sensitive = ['personal', 'social', 'secret'].includes(event.traits?.sensitivity);
  const payload = sensitive ? { redacted: true } : sanitizeDetailPayload(event.payload);
  const contributors = new Set(event.derivation?.contributingEventIds || []);
  const related = eventStore?.getRelated(event, { limit: 20 }) || [];
  return {
    kind: 'runtime',
    eventId: event.eventId,
    eventType: event.eventType,
    summary: formatRuntimeEventLabel(event),
    sourceTimestamp: event.sourceTimestamp || null,
    ingestedAt: event.ingestedAt || null,
    environmentKey: event.environmentKey,
    gameChannel: event.gameChannel || null,
    gameBuild: event.gameBuild || null,
    sessionId: event.correlationIds?.puSessionId || event.correlationIds?.sessionId || null,
    provenance: event.provenance,
    confidence: event.confidence,
    sensitivity: event.traits?.sensitivity || 'local',
    parserVersion: event.parserVersion || null,
    sourceProfileVersion: event.sourceProfileVersion || null,
    payload,
    correlations: sanitizeCorrelations(event.correlationIds),
    retention: 'retained',
    evidence: {
      availability: sensitive ? 'redacted' : markers.length || event.evidenceReference ? 'available' : 'unsupported',
      rawContext: boundTextList([
        `${event.eventType} at ${event.sourceTimestamp}`,
        `Confidence: ${event.confidence}`,
        `Evidence markers: ${markers.join(', ')}`,
        sensitive ? 'Payload: redacted by sensitivity policy.' : `Payload: ${JSON.stringify(payload)}`
      ]),
      markers: boundTextList(markers),
      lineNumber: event.evidenceReference?.lineRange?.start || null,
      environmentKey: event.environmentKey
    },
    related: related.map((item) => ({
      eventId: item.eventId,
      eventType: item.eventType,
      relationship: contributors.has(item.eventId) ? 'contributor' : 'correlated',
      sourceTimestamp: item.sourceTimestamp || null
    }))
  };
}

function toLegacyEvidenceDetail(kind, item, environmentKey) {
  const eventId = item.id || item.eventId;
  const rawContext = boundTextList(item.rawContext || (item.rawLine ? [item.rawLine] : []));
  return {
    kind,
    eventId,
    eventType: item.eventType || kind,
    summary: item.summary || item.eventLabel || kind,
    sourceTimestamp: item.sourceTimestamp || item.timestamp || null,
    ingestedAt: item.ingestedAt || null,
    environmentKey,
    gameChannel: item.gameChannel || null,
    gameBuild: item.gameBuild || null,
    sessionId: item.sessionId || null,
    provenance: item.provenance || 'observed',
    confidence: item.confidence || 'unknown',
    sensitivity: 'local',
    parserVersion: item.parserVersion || null,
    sourceProfileVersion: item.sourceProfileVersion || null,
    payload: sanitizeDetailPayload(item.payload || {}),
    correlations: sanitizeCorrelations(item.correlationIds || {}),
    retention: 'retained',
    evidence: {
      availability: rawContext.length ? 'available' : 'redacted',
      rawContext,
      markers: boundTextList(item.evidenceReference?.evidenceMarkers || []),
      lineNumber: item.lineNumber || item.startLineNumber || null,
      environmentKey
    },
    related: []
  };
}

function sanitizeDetailPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  return Object.fromEntries(Object.entries(payload).slice(0, 50).map(([key, value]) => [key, sanitizeDetailValue(value)]));
}

function sanitizeDetailValue(value, depth = 0) {
  if (depth > 3) return '[truncated]';
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => sanitizeDetailValue(entry, depth + 1));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, entry]) => [key, sanitizeDetailValue(entry, depth + 1)]));
  return '[unsupported]';
}

function sanitizeCorrelations(correlations) {
  if (!correlations || typeof correlations !== 'object') return {};
  return Object.fromEntries(Object.entries(correlations).filter(([key, value]) => /^[a-zA-Z0-9_.-]{1,64}$/.test(key) && typeof value === 'string').slice(0, 20));
}

function getDiagnosticsHealth() {
  const tailerHealth = activeTailer?.getHealth() || lastTailerHealth;
  return {
    status: activeTailer ? 'monitoring' : 'idle',
    checkedAt: new Date().toISOString(),
    application: { version: app.getVersion(), build: app.isPackaged ? 'packaged' : 'development', platform: process.platform, arch: process.arch },
    source: lastScanSource ? {
      label: lastScanSource.displayLabel,
      channel: lastScanSource.channelHint,
      build: lastScanSource.buildVersion,
      environment: lastScan?.environment?.environment || lastScan?.environmentKey || null
    } : null,
    subsystems: {
      tailer: tailerHealth ? tailerHealth.status : 'idle',
      parser: lastScan?.parserCompatibility?.status || 'unknown',
      store: eventStoreHealth.status,
      projection: lastScan ? 'available' : 'idle',
      renderer: mainWindow && !mainWindow.isDestroyed() ? 'available' : 'unavailable'
    },
    monitor: getMonitorState(),
    activeSourceId,
    sourceRegistryCount: sourceRegistry.size,
    tailer: tailerHealth ? sanitizeTailerHealth(tailerHealth) : null,
    lastScan: lastScan ? {
      scannedAt: lastScan.scannedAt,
      modifiedAt: lastScan.modifiedAt,
      entryCount: lastScan.entries?.length || 0,
      actionCount: lastScan.userActivity?.actions?.length || 0,
      sessionCount: lastScan.userActivity?.sessions?.length || 0,
      diagnosticCount: lastScan.environmentDiagnostics?.length || 0
    } : null
  };
}

function toRendererTailerChunk(chunk, source) {
  return {
    sourceId: source.sourceId,
    generation: chunk.generation,
    sequence: chunk.sequence,
    sourceIdentity: chunk.sourceIdentity,
    offsetStart: chunk.offsetStart,
    offsetEnd: chunk.offsetEnd,
    byteLength: chunk.byteLength,
    observedAt: chunk.observedAt,
    ingestedAt: chunk.ingestedAt,
    fileSize: chunk.fileSize
  };
}

function toRendererLifecycle(record, source) {
  const {
    previousIdentity,
    ...safeRecord
  } = record;
  return {
    ...safeRecord,
    sourceId: source.sourceId,
    sourceIdentity: record.sourceIdentity || null,
    previousIdentity: previousIdentity || null
  };
}

function sanitizeTailerHealth(health) {
  return {
    status: health.status,
    available: health.available,
    generation: health.generation,
    sequence: health.sequence,
    offset: health.offset,
    fileSize: health.fileSize,
    backlogBytes: health.backlogBytes,
    pendingCheck: health.pendingCheck,
    deliveryInFlight: health.deliveryInFlight,
    paused: health.paused,
    pauseReason: health.pauseReason,
    lastErrorCode: health.lastErrorCode,
    sourceIdentity: health.sourceIdentity,
    lastObservedAt: health.lastObservedAt,
    lastDeliveredAt: health.lastDeliveredAt
  };
}

function toRendererScanResult(result, source, options = {}) {
  const {
    logPath: _logPath,
    runtimeEvents: _runtimeEvents,
    promotedRuntimeEvents = [],
    lifecycleProjection: _lifecycleProjection,
    partyProjection: _partyProjection,
    locationProjection: _locationProjection,
    destinationProjection: _destinationProjection,
    vehicleProjection: _vehicleProjection,
    entries = [],
    userActivity = {},
    ...safeResult
  } = result;
  return {
    ...safeResult,
    promotedRuntimeEvents: promotedRuntimeEvents.map(toRendererRuntimeEventRow),
    entries: entries.map(sanitizeEvidenceCarrier),
    userActivity: {
      ...userActivity,
      actions: (userActivity.actions || []).map(sanitizeEvidenceCarrier),
      sessions: (userActivity.sessions || []).map(sanitizeEvidenceCarrier)
    },
    source: toPublicSource(source),
    recovery: options.bootstrapMode === 'current_state'
      ? {
          mode: 'full_log_scan',
          qualification: 'last_confirmed',
          canonicalEventCount: result.runtimeEvents?.length || 0,
          observedAt: result.scannedAt,
          limitation: 'State is reconstructed from retained game.log evidence. It is not proof that the game is still connected until new live log evidence arrives.'
        }
      : null
  };
}

function toRendererRuntimeEventRow(event) {
  return {
    id: event.eventId,
    eventId: event.eventId,
    eventType: event.eventType,
    eventLabel: formatRuntimeEventLabel(event),
    environmentKey: event.environmentKey,
    environment: event.environment,
    gameChannel: event.gameChannel,
    gameBuild: event.gameBuild,
    lineNumber: event.evidenceReference?.lineRange?.start || event.ordering?.sourceSequence || null,
    timestamp: event.sourceTimestamp,
    sourceTimestamp: event.sourceTimestamp,
    confidence: event.confidence,
    provenance: event.provenance,
    sensitivity: event.evidenceReference?.sensitivity || event.traits?.sensitivity || 'local',
    eventCategory: runtimeEventCategory(event.eventType),
    summary: formatRuntimeEventSummary(event),
    targetObservedId: event.payload?.targetObservedId || null,
    previousTargetObservedId: event.payload?.previousTargetObservedId || null,
    vehicleClassName: event.payload?.vehicleClassName || null,
    vehicleDisplayName: event.payload?.vehicleDisplayName || null,
    vehicleEntityId: event.payload?.vehicleEntityId ? redactStableIdentifier(event.payload.vehicleEntityId) : null,
    vehicleRelationship: event.payload?.relationship || null,
    vehicleOutcome: event.payload?.outcome || null,
    evidenceAvailable: true
  };
}

function runtimeEventCategory(eventType) {
  if (String(eventType).startsWith('Party')) return 'party';
  if (['JurisdictionEntered', 'MonitoredSpaceEntered', 'MonitoredSpaceExited', 'ArmisticeStateChanged'].includes(eventType)) return 'zone';
  if (String(eventType).startsWith('Quantum')) return 'navigation';
  if (String(eventType).startsWith('Vehicle')) return 'vehicle';
  return 'runtime';
}

function formatRuntimeEventLabel(event) {
  return ({
    PartyCreated: 'Party Created',
    PartyLaunchInitiated: 'Party Launch',
    PartyMemberConnected: 'Party Member Connected',
    PartyMemberJoined: 'Party Member Joined',
    PartyLeft: 'Party Left',
    MissionAccepted: 'Contract Accepted',
    JurisdictionEntered: 'Jurisdiction Entered',
    MonitoredSpaceEntered: 'Monitored Space',
    MonitoredSpaceExited: 'Monitored Space',
    ArmisticeStateChanged: 'Armistice',
    VehicleRetrieved: 'Vehicle Retrieved',
    VehicleControlAcquired: 'Vehicle Control Acquired',
    VehicleControlReleased: 'Vehicle Control Released',
    VehicleStored: 'Vehicle Stored',
    QuantumTargetSelected: 'Quantum Target Selected',
    QuantumTargetChanged: 'Quantum Target Changed',
    QuantumTravelArrived: 'Quantum Travel Arrived'
  })[event.eventType] || event.eventType;
}

function formatRuntimeEventSummary(event) {
  switch (event.eventType) {
    case 'PartyCreated':
      return `Party created by ${event.payload.leaderHandle}`;
    case 'PartyLaunchInitiated':
      return event.payload.message;
    case 'PartyMemberConnected':
      return `${event.payload.memberHandle} connected`;
    case 'PartyMemberJoined':
      return `${event.payload.memberHandle} joined the party`;
    case 'PartyLeft':
      return 'Left party';
    case 'MissionAccepted':
      return `${event.payload.contractName} accepted`;
    case 'JurisdictionEntered':
      return `Entered ${event.payload.jurisdiction}`;
    case 'MonitoredSpaceEntered':
      return 'Entered monitored space';
    case 'MonitoredSpaceExited':
      return 'Exited monitored space';
    case 'ArmisticeStateChanged':
      return event.payload.state === 'entered' ? 'Entered armistice zone' : 'Left armistice zone';
    case 'VehicleRetrieved':
      return `Retrieved ${event.payload.vehicleDisplayName}`;
    case 'VehicleControlAcquired':
      return `Controlling ${event.payload.vehicleDisplayName}`;
    case 'VehicleControlReleased':
      return `Released control of ${event.payload.vehicleDisplayName}`;
    case 'VehicleStored':
      return `Stored ${event.payload.vehicleDisplayName}`;
    case 'QuantumTargetSelected':
      return `Selected quantum target ${event.payload.targetObservedId}`;
    case 'QuantumTargetChanged':
      return `Changed quantum target to ${event.payload.targetObservedId}`;
    case 'QuantumTravelArrived':
      return `Arrived at ${event.payload.targetObservedId}`;
    default:
      return event.eventType;
  }
}

function sanitizeEvidenceCarrier(item) {
  if (!item || typeof item !== 'object') return item;
  const {
    rawLine: _rawLine,
    rawContext: _rawContext,
    ...safeItem
  } = item;
  return {
    ...safeItem,
    evidenceAvailable: Boolean(_rawLine || _rawContext?.length)
  };
}

function boundTextList(lines) {
  return lines
    .filter((line) => typeof line === 'string' && line.trim())
    .slice(0, 20)
    .map((line) => line.length > 500 ? `${line.slice(0, 497)}...` : line);
}

function toSingularEventKind(kind) {
  return {
    shards: 'shard',
    actions: 'action',
    sessions: 'session'
  }[kind];
}
