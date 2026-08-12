const state = {
  entries: [],
  userActivity: { userIds: [], actions: [], sessions: [] },
  selectedLogPath: '',
  apiTemplate: localStorage.getItem('astradock.apiTemplate') || '',
  username: localStorage.getItem('astradock.username') || '',
  userId: localStorage.getItem('astradock.userId') || '',
  theme: localStorage.getItem('astradock.theme') || 'dark',
  monitorActive: false,
  environment: null,
  eventFilter: 'all',
  sessionFilter: 'all',
  search: ''
};

const elements = {
  themeToggle: document.querySelector('#themeToggle'),
  searchInput: document.querySelector('#searchInput'),
  logPath: document.querySelector('#logPath'),
  username: document.querySelector('#username'),
  userId: document.querySelector('#userId'),
  chooseLog: document.querySelector('#chooseLog'),
  scanLog: document.querySelector('#scanLog'),
  startMonitor: document.querySelector('#startMonitor'),
  stopMonitor: document.querySelector('#stopMonitor'),
  refreshInline: document.querySelector('#refreshInline'),
  openFolder: document.querySelector('#openFolder'),
  apiTemplate: document.querySelector('#apiTemplate'),
  saveApi: document.querySelector('#saveApi'),
  candidateList: document.querySelector('#candidateList'),
  summary: document.querySelector('#summary'),
  status: document.querySelector('#status'),
  logStatusMetric: document.querySelector('#logStatusMetric'),
  pathCount: document.querySelector('#pathCount'),
  apiStatus: document.querySelector('#apiStatus'),
  monitorStatus: document.querySelector('#monitorStatus'),
  environmentStatus: document.querySelector('#environmentStatus'),
  environmentDetail: document.querySelector('#environmentDetail'),
  userIdentity: document.querySelector('#userIdentity'),
  tableSubtitle: document.querySelector('#tableSubtitle'),
  sideStatusTitle: document.querySelector('#sideStatusTitle'),
  sideStatusText: document.querySelector('#sideStatusText'),
  shardRows: document.querySelector('#shardRows'),
  emptyState: document.querySelector('#emptyState'),
  details: document.querySelector('#details'),
  detailsTitle: document.querySelector('#detailsTitle'),
  closeDetails: document.querySelector('#closeDetails'),
  apiResult: document.querySelector('#apiResult'),
  rawContext: document.querySelector('#rawContext'),
  eventFilter: document.querySelector('#eventFilter'),
  sessionFilter: document.querySelector('#sessionFilter'),
  actionRows: document.querySelector('#actionRows'),
  actionEmpty: document.querySelector('#actionEmpty'),
  actionSubtitle: document.querySelector('#actionSubtitle'),
  actionCount: document.querySelector('#actionCount'),
  sessionRows: document.querySelector('#sessionRows'),
  sessionEmpty: document.querySelector('#sessionEmpty'),
  sessionCount: document.querySelector('#sessionCount'),
  quickScan: document.querySelector('#quickScan'),
  quickChoose: document.querySelector('#quickChoose'),
  quickMonitor: document.querySelector('#quickMonitor'),
  quickStop: document.querySelector('#quickStop'),
  quickFolder: document.querySelector('#quickFolder'),
  quickTheme: document.querySelector('#quickTheme')
};

async function boot() {
  document.body.dataset.theme = state.theme;
  elements.apiTemplate.value = state.apiTemplate;
  elements.username.value = state.username;
  elements.userId.value = state.userId;
  elements.apiStatus.textContent = state.apiTemplate ? 'On' : 'Off';
  updateMonitorUi();
  setStatus('Detecting logs...');

  const defaults = await window.astradock.getDefaultLogs();
  renderCandidates(defaults.candidates, defaults.detectedPath);
  elements.pathCount.textContent = defaults.candidates.length;

  if (defaults.detectedPath) {
    state.selectedLogPath = defaults.detectedPath;
    elements.logPath.value = defaults.detectedPath;
    await scanSelectedLog();
  } else {
    setStatus('Choose a log file');
  }

  window.astradock.onLogChanged((result) => {
    applyScanResult(result);
    setStatus('Monitoring live');
  });

  window.astradock.onLogError((message) => setStatus(message, true));
}

function renderCandidates(candidates, detectedPath) {
  elements.candidateList.innerHTML = '';
  for (const candidate of candidates) {
    const item = document.createElement('li');
    item.textContent = candidate;
    if (candidate === detectedPath) item.classList.add('found');
    elements.candidateList.append(item);
  }
}

async function scanSelectedLog() {
  const logPath = elements.logPath.value.trim();
  if (!logPath) {
    setStatus('Choose a log file first', true);
    return;
  }

  state.selectedLogPath = logPath;
  saveUserFilter();
  setStatus('Scanning...');

  try {
    const result = await window.astradock.scanLog(logPath, getMonitorOptions());
    applyScanResult(result);
    setStatus(`Scanned ${formatDateTime(result.scannedAt)}`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function startMonitor() {
  const logPath = elements.logPath.value.trim();
  saveUserFilter();

  if (!logPath) {
    setStatus('Choose a log file first', true);
    return;
  }

  if (!state.username && !state.userId) {
    setStatus('Enter username or user ID first', true);
    return;
  }

  state.selectedLogPath = logPath;
  setStatus('Starting monitor...');

  try {
    const result = await window.astradock.scanLog(logPath, getMonitorOptions());
    applyScanResult(result);
    await window.astradock.watchLog(logPath, getMonitorOptions());
    state.monitorActive = true;
    updateMonitorUi();
    setStatus('Monitoring live');
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function stopMonitor() {
  await window.astradock.unwatchLog();
  state.monitorActive = false;
  updateMonitorUi();
  setStatus('Monitor stopped');
}

function getMonitorOptions() {
  return {
    username: state.username,
    userId: state.userId
  };
}

function saveUserFilter() {
  state.username = elements.username.value.trim();
  state.userId = elements.userId.value.trim();
  localStorage.setItem('astradock.username', state.username);
  localStorage.setItem('astradock.userId', state.userId);
  updateMonitorUi();
}

function applyScanResult(result) {
  state.entries = result.entries || [];
  state.userActivity = result.userActivity || { userIds: [], actions: [], sessions: [] };
  state.environment = result.environment || null;
  if (!state.userId && state.userActivity.userIds?.length) {
    state.userId = state.userActivity.userIds[0];
    elements.userId.value = state.userId;
    localStorage.setItem('astradock.userId', state.userId);
  }
  elements.summary.textContent = String(state.entries.length);
  elements.tableSubtitle.textContent = `${state.entries.length} unique shard${state.entries.length === 1 ? '' : 's'} found`;
  elements.sideStatusTitle.textContent = 'Log monitor';
  elements.sideStatusText.textContent = result.environmentDiagnostics?.length
    ? 'Environment diagnostic requires review'
    : state.entries.length ? 'Shard data available' : 'No shard entries found';
  renderEnvironmentStatus(result);
  renderRows();
  renderSessionOptions();
  renderActions();
  renderSessions();
  updateMonitorUi();
}

function renderRows() {
  elements.shardRows.innerHTML = '';
  const visibleEntries = filterEntries();
  elements.emptyState.hidden = visibleEntries.length > 0;

  visibleEntries.forEach((entry) => {
    const index = state.entries.indexOf(entry);
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <div class="shard-title">
          <span class="tower">⌁</span>
          <div>
            <strong>${escapeHtml(entry.shardId || 'Unknown')}</strong>
            <small>${escapeHtml(entry.shardName || 'Unknown shard')}</small>
          </div>
        </div>
      </td>
      <td><span class="badge">${escapeHtml(formatEnvironmentLabel(entry.environment))}</span></td>
      <td><span class="badge">${escapeHtml(entry.region || 'Local')}</span></td>
      <td>${escapeHtml(entry.build || '-')}</td>
      <td>${escapeHtml(formatDateTime(entry.lastSeen) || '-')}</td>
      <td>${entry.lineNumber}</td>
      <td><button data-index="${index}" class="small">Inspect</button></td>
    `;
    elements.shardRows.append(row);
  });
}

function renderActions() {
  const actions = filterActions();
  elements.actionRows.innerHTML = '';
  elements.actionEmpty.hidden = actions.length > 0;
  elements.actionCount.textContent = String(actions.length);
  elements.actionSubtitle.textContent = state.username || state.userId
    ? `Showing log entries matching ${state.username || state.userId}`
    : 'Set a username or user ID to filter log actions';

  actions.forEach((action) => {
    const row = document.createElement('tr');
    if (action.eventType === 'server_join') row.classList.add('server-join-row');
    row.innerHTML = `
      <td>${escapeHtml(formatDateTime(action.timestamp) || '-')}</td>
      <td><span class="badge">${escapeHtml(formatEnvironmentLabel(action.environment))}</span></td>
      <td><span class="event-pill ${action.eventType === 'server_join' ? 'join' : ''}">${escapeHtml(action.eventLabel || 'User Action')}</span></td>
      <td>${escapeHtml(action.shardId || '-')}</td>
      <td>${escapeHtml(action.username || '-')}</td>
      <td>${escapeHtml(action.userId || '-')}</td>
      <td>${escapeHtml(action.action || action.rawLine || '-')}</td>
      <td>${action.lineNumber}</td>
    `;
    elements.actionRows.append(row);
  });
}

function filterActions() {
  return (state.userActivity.actions || []).filter((action) => {
    const matchesEvent = state.eventFilter === 'all' || action.eventType === state.eventFilter;
    const matchesSession = state.sessionFilter === 'all' || action.sessionId === state.sessionFilter;
    return matchesEvent && matchesSession;
  });
}

function renderSessionOptions() {
  const selected = state.sessionFilter;
  elements.sessionFilter.innerHTML = '<option value="all">All sessions</option>';
  for (const session of state.userActivity.sessions || []) {
    const option = document.createElement('option');
    option.value = session.id;
    option.textContent = `${session.shardId || 'Unknown shard'} / ${formatDateTime(session.startedAt) || 'unknown time'}`;
    elements.sessionFilter.append(option);
  }
  elements.sessionFilter.value = Array.from(elements.sessionFilter.options).some((option) => option.value === selected)
    ? selected
    : 'all';
  state.sessionFilter = elements.sessionFilter.value;
}

function renderSessions() {
  const sessions = state.userActivity.sessions || [];
  elements.sessionRows.innerHTML = '';
  elements.sessionEmpty.hidden = sessions.length > 0;
  elements.sessionCount.textContent = String(sessions.length);

  sessions.forEach((session) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(formatDateTime(session.startedAt) || '-')}</td>
      <td><span class="badge">${escapeHtml(formatEnvironmentLabel(session.environment))}</span></td>
      <td><strong>${escapeHtml(session.shardId || 'Unknown')}</strong></td>
      <td>${escapeHtml([session.address, session.port].filter(Boolean).join(':') || '-')}</td>
      <td>${escapeHtml(session.locationId || '-')}</td>
      <td>${session.actionCount}</td>
      <td><button data-session-id="${escapeHtml(session.id)}" class="small">View</button></td>
    `;
    elements.sessionRows.append(row);
  });
}

function updateMonitorUi() {
  elements.monitorStatus.textContent = state.monitorActive ? 'Live' : 'Off';
  elements.userIdentity.textContent = state.userId
    ? `${state.username || 'User'} / ${state.userId}`
    : state.username || 'No username set';
  elements.startMonitor.disabled = state.monitorActive;
  elements.stopMonitor.disabled = !state.monitorActive;
  elements.quickMonitor.disabled = state.monitorActive;
  elements.quickStop.disabled = !state.monitorActive;
}

function renderEnvironmentStatus(result = {}) {
  const environment = result.environment || state.environment;
  const partitionCount = result.environmentPartitions?.length || 0;
  const diagnosticCount = result.environmentDiagnostics?.length || 0;
  if (!environment) {
    elements.environmentStatus.textContent = 'UNKNOWN';
    elements.environmentDetail.textContent = 'No environment evidence';
    return;
  }

  elements.environmentStatus.textContent = environment.releaseChannel || 'UNKNOWN';
  elements.environmentDetail.textContent = [
    environment.environmentName,
    environment.buildVersion,
    partitionCount > 1 ? `${partitionCount} partitions` : null,
    diagnosticCount ? `${diagnosticCount} diagnostic${diagnosticCount === 1 ? '' : 's'}` : null
  ].filter(Boolean).join(' / ') || 'Unknown build';
}

function filterEntries() {
  const term = state.search.trim().toLowerCase();
  if (!term) return state.entries;
  return state.entries.filter((entry) =>
    [entry.shardId, entry.shardName, entry.region, entry.build, entry.gameChannel, entry.environmentKey, entry.rawLine]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term))
  );
}

function formatEnvironmentLabel(environment) {
  if (!environment) return 'UNKNOWN';
  return [
    environment.releaseChannel || 'UNKNOWN',
    environment.buildVersion && environment.buildVersion !== 'UNKNOWN_BUILD' ? environment.buildVersion : null
  ].filter(Boolean).join(' / ');
}

async function inspectEntry(index) {
  const entry = state.entries[index];
  elements.details.hidden = false;
  elements.detailsTitle.textContent = entry.shardId
    ? `Shard ${entry.shardId}`
    : entry.shardName || 'Shard details';
  elements.rawContext.textContent = entry.rawContext.join('\n');
  elements.apiResult.textContent = 'No API URL configured.';

  if (!state.apiTemplate || !entry.shardId) return;

  const url = state.apiTemplate.replaceAll('{shardId}', encodeURIComponent(entry.shardId));
  elements.apiResult.textContent = `Fetching ${url}...`;

  try {
    const result = await window.astradock.fetchJson(url);
    elements.apiResult.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    elements.apiResult.textContent = error.message;
  }
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.logStatusMetric.textContent = isError ? 'Error' : message.split(' ')[0] || 'Idle';
  elements.status.classList.toggle('error', isError);
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

elements.chooseLog.addEventListener('click', async () => {
  const logPath = await window.astradock.chooseLog();
  if (!logPath) return;
  elements.logPath.value = logPath;
  await scanSelectedLog();
});

elements.scanLog.addEventListener('click', scanSelectedLog);
elements.startMonitor.addEventListener('click', startMonitor);
elements.stopMonitor.addEventListener('click', stopMonitor);
elements.refreshInline.addEventListener('click', scanSelectedLog);
elements.openFolder.addEventListener('click', () => window.astradock.openLogFolder(elements.logPath.value.trim()));
elements.saveApi.addEventListener('click', () => {
  state.apiTemplate = elements.apiTemplate.value.trim();
  localStorage.setItem('astradock.apiTemplate', state.apiTemplate);
  elements.apiStatus.textContent = state.apiTemplate ? 'On' : 'Off';
  setStatus('API URL saved');
});
elements.searchInput.addEventListener('input', () => {
  state.search = elements.searchInput.value;
  renderRows();
});
elements.eventFilter.addEventListener('change', () => {
  state.eventFilter = elements.eventFilter.value;
  renderActions();
});
elements.sessionFilter.addEventListener('change', () => {
  state.sessionFilter = elements.sessionFilter.value;
  renderActions();
});
elements.username.addEventListener('change', saveUserFilter);
elements.userId.addEventListener('change', saveUserFilter);
elements.themeToggle.addEventListener('click', toggleTheme);
elements.quickTheme.addEventListener('click', toggleTheme);
elements.quickScan.addEventListener('click', scanSelectedLog);
elements.quickChoose.addEventListener('click', () => elements.chooseLog.click());
elements.quickMonitor.addEventListener('click', startMonitor);
elements.quickStop.addEventListener('click', stopMonitor);
elements.quickFolder.addEventListener('click', () => window.astradock.openLogFolder(elements.logPath.value.trim()));
elements.shardRows.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-index]');
  if (button) inspectEntry(Number(button.dataset.index));
});
elements.sessionRows.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-session-id]');
  if (!button) return;
  state.sessionFilter = button.dataset.sessionId;
  elements.sessionFilter.value = state.sessionFilter;
  renderActions();
});
elements.closeDetails.addEventListener('click', () => {
  elements.apiResult.textContent = 'Inspect a shard to fetch configured API data.';
  elements.rawContext.textContent = 'Raw log context will appear here.';
});

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.body.dataset.theme = state.theme;
  localStorage.setItem('astradock.theme', state.theme);
}

boot();
