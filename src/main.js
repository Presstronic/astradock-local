const { app, BrowserWindow, dialog, ipcMain, session, shell } = require('electron');
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
  discoverRuntimeSources,
  loadSourcePreference,
  saveSourcePreference,
  toPublicSource,
  validateLogSource
} = require('./sourceDiscovery');
const { RuntimeLogTailer } = require('./runtimeLogTailer');

const rendererIndexPath = path.join(__dirname, '..', 'dist', 'renderer', 'index.html');
const rendererUrl = getRendererUrl(rendererIndexPath);

configureChromiumRuntimeFlags({ app });

let mainWindow;
let watchedLogPath = null;
let watchedSourceId = null;
let activeTailer = null;
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

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
  await stopMonitor('application_shutdown');
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  shuttingDown = true;
  await stopMonitor('application_shutdown');
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
    await saveSourcePreference(getSourcePreferencePath(), source);
  }

  return {
    source: toPublicSource(source),
    saved: source.validation.isValid
  };
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
  await saveSourcePreference(getSourcePreferencePath(), source);
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
  await startMonitor(source, options);
  let scan;
  try {
    scan = await scanSource(source, options);
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

register(CHANNELS.eventsQuery, async (query) => queryEvents(query));

register(CHANNELS.evidenceGet, async (request) => getEvidenceDetail(request));

register(CHANNELS.settingsGet, async () => loadRendererSettings(getSettingsPath()));

register(CHANNELS.settingsUpdate, async (patch) => updateRendererSettings(getSettingsPath(), patch));

register(CHANNELS.diagnosticsHealth, async () => getDiagnosticsHealth());

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

async function discoverAndRegisterSources() {
  const preference = await loadSourcePreference(getSourcePreferencePath());
  const discovery = await discoverRuntimeSources({
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
  lastScan = result;
  lastScanSource = source;
  return toRendererScanResult(result, source);
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
    checkpoint: lastTailerCheckpoint
  };
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
  const collection = request.kind === 'runtime'
    ? lastScan?.promotedRuntimeEvents || []
    : request.kind === 'shard'
    ? lastScan?.entries || []
    : request.kind === 'action'
      ? lastScan?.userActivity?.actions || []
      : lastScan?.userActivity?.sessions || [];
  const item = collection.find((candidate) => (candidate.id || candidate.eventId) === request.id);
  if (!item) throw createBoundaryError('evidence_not_found');
  if (request.kind === 'runtime') {
    return {
      kind: request.kind,
      id: request.id,
      sensitivity: 'local',
      evidence: {
        rawContext: boundTextList([
          `${item.eventType} at ${item.sourceTimestamp}`,
          `Confidence: ${item.confidence}`,
          `Evidence markers: ${(item.evidenceReference?.evidenceMarkers || []).join(', ')}`,
          `Payload: ${JSON.stringify(item.payload)}`
        ]),
        lineNumber: item.evidenceReference?.lineRange?.start || null,
        environmentKey: item.environmentKey || null
      }
    };
  }
  return {
    kind: request.kind,
    id: request.id,
    sensitivity: 'local',
    evidence: {
      rawContext: boundTextList(item.rawContext || (item.rawLine ? [item.rawLine] : [])),
      lineNumber: item.lineNumber || item.startLineNumber || null,
      environmentKey: item.environmentKey || null
    }
  };
}

function getDiagnosticsHealth() {
  const tailerHealth = activeTailer?.getHealth() || lastTailerHealth;
  return {
    status: activeTailer ? 'monitoring' : 'idle',
    checkedAt: new Date().toISOString(),
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

function toRendererScanResult(result, source) {
  const {
    logPath: _logPath,
    runtimeEvents: _runtimeEvents,
    promotedRuntimeEvents = [],
    lifecycleProjection: _lifecycleProjection,
    partyProjection: _partyProjection,
    locationProjection: _locationProjection,
    destinationProjection: _destinationProjection,
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
    source: toPublicSource(source)
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
    evidenceAvailable: true
  };
}

function runtimeEventCategory(eventType) {
  if (String(eventType).startsWith('Party')) return 'party';
  if (['JurisdictionEntered', 'MonitoredSpaceEntered', 'MonitoredSpaceExited', 'ArmisticeStateChanged'].includes(eventType)) return 'zone';
  if (String(eventType).startsWith('Quantum')) return 'navigation';
  return 'runtime';
}

function formatRuntimeEventLabel(event) {
  return ({
    PartyCreated: 'Party Created',
    PartyLaunchInitiated: 'Party Launch',
    PartyMemberConnected: 'Party Member Connected',
    PartyLeft: 'Party Left',
    JurisdictionEntered: 'Jurisdiction Entered',
    MonitoredSpaceEntered: 'Monitored Space',
    MonitoredSpaceExited: 'Monitored Space',
    ArmisticeStateChanged: 'Armistice',
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
    case 'PartyLeft':
      return 'Left party';
    case 'JurisdictionEntered':
      return `Entered ${event.payload.jurisdiction}`;
    case 'MonitoredSpaceEntered':
      return 'Entered monitored space';
    case 'MonitoredSpaceExited':
      return 'Exited monitored space';
    case 'ArmisticeStateChanged':
      return event.payload.state === 'entered' ? 'Entered armistice zone' : 'Left armistice zone';
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
