const state = {
  entries: [],
  selectedLogPath: '',
  apiTemplate: localStorage.getItem('astradock.apiTemplate') || '',
  theme: localStorage.getItem('astradock.theme') || 'dark',
  search: ''
};

const elements = {
  themeToggle: document.querySelector('#themeToggle'),
  searchInput: document.querySelector('#searchInput'),
  logPath: document.querySelector('#logPath'),
  chooseLog: document.querySelector('#chooseLog'),
  scanLog: document.querySelector('#scanLog'),
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
  quickScan: document.querySelector('#quickScan'),
  quickChoose: document.querySelector('#quickChoose'),
  quickFolder: document.querySelector('#quickFolder'),
  quickTheme: document.querySelector('#quickTheme')
};

async function boot() {
  document.body.dataset.theme = state.theme;
  elements.apiTemplate.value = state.apiTemplate;
  elements.apiStatus.textContent = state.apiTemplate ? 'On' : 'Off';
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
    setStatus('Updated from log change');
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
  setStatus('Scanning...');

  try {
    const result = await window.astradock.scanLog(logPath);
    applyScanResult(result);
    await window.astradock.watchLog(logPath);
    setStatus(`Scanned ${formatDateTime(result.scannedAt)}`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function applyScanResult(result) {
  state.entries = result.entries || [];
  elements.summary.textContent = String(state.entries.length);
  elements.tableSubtitle.textContent = `${state.entries.length} unique shard${state.entries.length === 1 ? '' : 's'} found`;
  elements.sideStatusTitle.textContent = 'Log monitor';
  elements.sideStatusText.textContent = state.entries.length ? 'Shard data available' : 'No shard entries found';
  renderRows();
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
      <td><span class="badge">${escapeHtml(entry.region || 'Local')}</span></td>
      <td>${escapeHtml(entry.build || '-')}</td>
      <td>${escapeHtml(formatDateTime(entry.lastSeen) || '-')}</td>
      <td>${entry.lineNumber}</td>
      <td><button data-index="${index}" class="small">Inspect</button></td>
    `;
    elements.shardRows.append(row);
  });
}

function filterEntries() {
  const term = state.search.trim().toLowerCase();
  if (!term) return state.entries;
  return state.entries.filter((entry) =>
    [entry.shardId, entry.shardName, entry.region, entry.build, entry.rawLine]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term))
  );
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
elements.themeToggle.addEventListener('click', toggleTheme);
elements.quickTheme.addEventListener('click', toggleTheme);
elements.quickScan.addEventListener('click', scanSelectedLog);
elements.quickChoose.addEventListener('click', () => elements.chooseLog.click());
elements.quickFolder.addEventListener('click', () => window.astradock.openLogFolder(elements.logPath.value.trim()));
elements.shardRows.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-index]');
  if (button) inspectEntry(Number(button.dataset.index));
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
