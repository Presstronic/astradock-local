import type {
  EvidenceDetail,
  MonitorSnapshot,
  PublicRuntimeSource,
  RendererEvidenceRow,
  RendererScanResult
} from './astradock-api';

export type WorkspaceState =
  | 'loading'
  | 'no-source'
  | 'recovering'
  | 'ready'
  | 'stale'
  | 'disconnected'
  | 'unsupported-profile'
  | 'degraded'
  | 'fatal';

export type StreamView = 'terminal' | 'table';
export type Density = 'compact' | 'default' | 'relaxed';
export type DrawerPlacement = 'right' | 'bottom';

export interface StreamEvent {
  id: string;
  kind: 'shard' | 'action' | 'session' | 'diagnostic';
  urgency: 'normal' | 'warning' | 'urgent' | 'critical';
  summary: string;
  context: string;
  environment: string;
  timestamp: string | null;
  ageLabel: string;
  confidence: string;
  evidenceAvailable: boolean;
  sourceLine: number | null;
  row: RendererEvidenceRow;
}

export interface RuntimeMonitorViewModel {
  workspaceState: WorkspaceState;
  source: PublicRuntimeSource | null;
  monitorLabel: string;
  freshnessLabel: string;
  exactFreshness: string | null;
  environmentLabel: string;
  buildLabel: string;
  warningCount: number;
  streamEvents: StreamEvent[];
  retainedCount: number;
  sourceCandidates: readonly PublicRuntimeSource[];
  instruments: readonly InstrumentState[];
  party: PanelState;
  mission: PanelState;
  alerts: readonly AlertState[];
}

export interface InstrumentState {
  id: string;
  label: string;
  value: string;
  state: 'known' | 'last-confirmed' | 'unknown' | 'transitioning' | 'stale' | 'disconnected' | 'unsupported';
  detail: string;
  provenance: string;
  drilldown?: string | undefined;
}

export interface PanelState {
  title: string;
  state: 'empty' | 'unknown' | 'unsupported' | 'ready';
  label: string;
  detail: string;
}

export interface AlertState {
  id: string;
  severity: 'warning' | 'critical';
  title: string;
  message: string;
}

export interface DetailState {
  status: 'empty' | 'loading' | 'ready' | 'not-found' | 'retention-removed' | 'redacted' | 'unsupported' | 'error';
  selected: StreamEvent | null;
  detail: EvidenceDetail | null;
  message: string;
}

const STALE_AFTER_MS = 60_000;
const MAX_STREAM_ROWS = 100;

export function createRuntimeMonitorViewModel(input: {
  loading: boolean;
  fatalError: string | null;
  sources: readonly PublicRuntimeSource[];
  activeSource: PublicRuntimeSource | null;
  snapshot: MonitorSnapshot | null;
  scan: RendererScanResult | null;
  now: Date;
}): RuntimeMonitorViewModel {
  const state = classifyWorkspaceState(input);
  const scan = input.scan;
  const source = input.activeSource || input.snapshot?.source || scan?.source || null;
  const streamEvents = createStreamEvents(scan, input.now).slice(0, MAX_STREAM_ROWS);
  const environment = scan?.environment;
  const lifecycle = activeLifecycle(scan);
  const monitor = input.snapshot?.monitor ?? null;
  const lastObservedAt = monitor?.tailer?.lastObservedAt || scan?.scannedAt || null;
  const warningCount = countWarnings(state, scan);

  return {
    workspaceState: state,
    source,
    monitorLabel: formatMonitorLabel(state, monitor?.active ?? false),
    freshnessLabel: formatFreshness(lastObservedAt, input.now),
    exactFreshness: lastObservedAt,
    environmentLabel: lifecycle?.environment.releaseChannel || formatEnvironment(scan),
    buildLabel: lifecycle?.build.productVersion || lifecycle?.build.fileVersion || (environment?.buildVersion && environment.buildVersion !== 'UNKNOWN_BUILD'
      ? environment.buildVersion
      : source?.buildVersion || 'Unknown'),
    warningCount,
    streamEvents,
    retainedCount: createAllEvents(scan).length,
    sourceCandidates: input.sources,
    instruments: createInstruments(scan, source, state, input.now),
    party: createPartyPanel(scan),
    mission: createMissionPanel(),
    alerts: createAlerts(state, scan, source)
  };
}

export function classifyWorkspaceState(input: {
  loading: boolean;
  fatalError: string | null;
  sources: readonly PublicRuntimeSource[];
  activeSource: PublicRuntimeSource | null;
  snapshot: MonitorSnapshot | null;
  scan: RendererScanResult | null;
  now: Date;
}): WorkspaceState {
  if (input.fatalError) return 'fatal';
  if (input.loading) return 'loading';

  const source = input.activeSource || input.snapshot?.source || input.scan?.source || null;
  if (!source) return 'no-source';
  if (source.validation?.isValid === false) return 'disconnected';
  if (source.channelConfidence === 'unsupported' || source.validation?.status === 'unsupported_profile') {
    return 'unsupported-profile';
  }

  const tailer = input.snapshot?.monitor.tailer;
  if (tailer?.status === 'paused' || tailer?.paused) return 'recovering';
  if (tailer?.lastErrorCode) return 'degraded';
  if (tailer && !tailer.available) return 'disconnected';

  const observedAt = tailer?.lastObservedAt || input.scan?.scannedAt || null;
  if (observedAt && input.now.getTime() - new Date(observedAt).getTime() > STALE_AFTER_MS) return 'stale';
  return 'ready';
}

export function createStreamEvents(scan: RendererScanResult | null, now: Date): StreamEvent[] {
  return createAllEvents(scan)
    .map(({ kind, row }) => toStreamEvent(kind, row, now))
    .sort((left, right) => compareNullableDate(right.timestamp, left.timestamp));
}

function createAllEvents(scan: RendererScanResult | null): Array<{ kind: StreamEvent['kind']; row: RendererEvidenceRow }> {
  if (!scan) return [];
  const entries = (scan.entries || []).map((row) => ({ kind: 'shard' as const, row }));
  const actions = (scan.userActivity.actions || []).map((row) => ({ kind: 'action' as const, row }));
  const sessions = (scan.userActivity.sessions || []).map((row) => ({ kind: 'session' as const, row }));
  return [...entries, ...actions, ...sessions];
}

function toStreamEvent(kind: StreamEvent['kind'], row: RendererEvidenceRow, now: Date): StreamEvent {
  const timestamp = firstString(row.lastSeen, row.timestamp, row.startedAt, row.sourceTimestamp);
  const summary = firstString(row.eventLabel, row.shardName, row.action, row.locationId, row.shardId) || 'Runtime observation';
  const context = [
    firstString(row.shardId),
    firstString(row.region),
    row.lineNumber ? `line ${row.lineNumber}` : null
  ].filter(Boolean).join(' / ') || 'Local runtime evidence';

  return {
    id: row.id,
    kind,
    urgency: kind === 'diagnostic' ? 'warning' : 'normal',
    summary,
    context,
    environment: formatRowEnvironment(row),
    timestamp,
    ageLabel: formatFreshness(timestamp, now),
    confidence: firstString(row.environment?.confidence, row.confidence) || 'unknown',
    evidenceAvailable: Boolean(row.evidenceAvailable),
    sourceLine: typeof row.lineNumber === 'number' ? row.lineNumber : typeof row.startLineNumber === 'number' ? row.startLineNumber : null,
    row
  };
}

function createInstruments(
  scan: RendererScanResult | null,
  source: PublicRuntimeSource | null,
  state: WorkspaceState,
  now: Date
): InstrumentState[] {
  const latestShard = scan?.entries?.[0];
  const latestSession = scan?.userActivity.sessions?.[0];
  const latestAction = scan?.userActivity.actions?.[0];
  const lifecycle = activeLifecycle(scan);
  const sessionDuration = currentSessionDuration(lifecycle?.puSession, now);

  return [
    {
      id: 'game-lifecycle',
      label: 'Game lifecycle',
      value: formatLifecycleState(lifecycle?.lifecycle.state),
      state: lifecycle?.lifecycle.status === 'failure'
        ? 'disconnected'
        : lifecycle?.freshness === 'stale'
          ? 'stale'
          : lifecycle?.lifecycle.status === 'known'
            ? 'known'
            : 'unknown',
      detail: lifecycle?.lifecycle.lastChangedAt
        ? `${formatFreshness(lifecycle.lifecycle.lastChangedAt, now)} · ${lifecycle.lifecycle.reason}`
        : 'Monitor may have started mid-state',
      provenance: lifecycle?.lifecycle.status === 'known' ? 'Observed canonical event' : 'Evidence absent'
    },
    {
      id: 'source-health',
      label: 'Source health',
      value: source ? formatSourceState(source) : 'No source',
      state: state === 'no-source' ? 'unknown' : state === 'stale' ? 'stale' : state === 'disconnected' ? 'disconnected' : 'known',
      detail: source?.displayLabel || 'Choose a local game.log source',
      provenance: 'Observed locally'
    },
    {
      id: 'shard',
      label: 'Shard and region',
      value: lifecycle?.shard.shardLabel || firstString(latestShard?.shardId, latestShard?.shardName) || 'Unknown',
      state: snapshotInstrumentState(lifecycle?.shard.state, Boolean(latestShard)),
      detail: lifecycle?.shard.region.friendlyRegion !== 'UNKNOWN'
        ? lifecycle?.shard.region.friendlyRegion || 'Unknown'
        : firstString(latestShard?.region, latestShard?.gameBuild) || 'Region mapping unknown',
      provenance: lifecycle?.shard.shardLabel ? 'Observed shard; versioned region mapping' : latestShard ? 'Observed log evidence' : 'Evidence absent',
      drilldown: lifecycle?.shard.shardLabel
        ? `Raw region segment: ${lifecycle.shard.region.rawSegment || 'Unknown'}; confidence: ${lifecycle.shard.region.confidence}; mapping: ${lifecycle.shard.region.mappingVersion}`
        : undefined
    },
    {
      id: 'server',
      label: 'Server connection',
      value: formatConnectionState(lifecycle?.serverConnection.state),
      state: snapshotInstrumentState(lifecycle?.serverConnection.state, Boolean(latestSession)),
      detail: lifecycle?.serverConnection.disconnect
        ? `${lifecycle.serverConnection.disconnect.origin} · ${lifecycle.serverConnection.disconnect.reason}`
        : lifecycle?.serverConnection.connectedAt
          ? formatFreshness(lifecycle.serverConnection.connectedAt, now)
          : 'Monitor may have started mid-state',
      provenance: lifecycle && lifecycle.serverConnection.state !== 'unknown' ? 'Observed canonical event' : 'Evidence absent',
      drilldown: lifecycle?.serverConnection.endpoint
        ? `Endpoint: ${lifecycle.serverConnection.endpoint}:${lifecycle.serverConnection.port}`
        : lifecycle?.serverConnection.lastEndpoint
          ? `Last endpoint: ${lifecycle.serverConnection.lastEndpoint}`
          : undefined
    },
    {
      id: 'pu-duration',
      label: 'PU duration',
      value: sessionDuration !== null
        ? formatCompactDuration(sessionDuration)
        : latestSession ? formatDurationSince(firstString(latestSession.startedAt), now) : 'Unknown',
      state: lifecycle?.puSession.state === 'in_game' ? 'known' : lifecycle?.puSession.state === 'connecting' ? 'transitioning' : latestSession ? 'last-confirmed' : 'unknown',
      detail: lifecycle?.puSession.durationSource === 'observed_connection_uptime'
        ? 'Observed connection uptime'
        : lifecycle?.puSession.matchmakingStatus || 'Join evidence has not been observed',
      provenance: lifecycle && lifecycle.puSession.state !== 'unknown' ? 'PU session projection' : 'Evidence absent'
    },
    {
      id: 'jurisdiction',
      label: 'Jurisdiction',
      value: firstString(latestAction?.jurisdiction, latestAction?.locationId) || 'Unknown',
      state: latestAction ? 'last-confirmed' : 'unknown',
      detail: 'Displayed only when current-state evidence supports it',
      provenance: latestAction ? 'Observed log evidence' : 'Evidence absent'
    },
    {
      id: 'armistice',
      label: 'Armistice',
      value: firstString(latestAction?.armisticeState) || 'Unsupported',
      state: latestAction?.armisticeState ? 'last-confirmed' : 'unsupported',
      detail: 'Requires accepted zone evidence',
      provenance: latestAction?.armisticeState ? 'Observed log evidence' : 'Evidence gate closed'
    }
  ];
}

function snapshotInstrumentState(
  state: string | undefined,
  hasFallback: boolean
): InstrumentState['state'] {
  if (state === 'transitioning') return 'transitioning';
  if (state === 'connected') return 'known';
  if (state === 'stale') return 'stale';
  if (state === 'disconnected') return 'disconnected';
  return hasFallback ? 'last-confirmed' : 'unknown';
}

function formatConnectionState(state: string | undefined): string {
  return ({
    transitioning: 'Connecting',
    connected: 'Connected',
    disconnected: 'Disconnected',
    stale: 'Stale',
    unknown: 'Unknown'
  } as Record<string, string>)[state || 'unknown'] || 'Unknown';
}

export function formatCompactDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function currentSessionDuration(
  session: { durationSeconds: number | null; enteredAt: string | null; requestedAt: string | null; endedAt: string | null } | undefined,
  now: Date
): number | null {
  if (!session) return null;
  if (session.durationSeconds !== null) return session.durationSeconds;
  const startedAt = session.enteredAt || session.requestedAt;
  if (!startedAt) return null;
  const startedMs = Date.parse(startedAt);
  const endedMs = session.endedAt ? Date.parse(session.endedAt) : now.getTime();
  if (Number.isNaN(startedMs) || Number.isNaN(endedMs) || endedMs < startedMs) return null;
  return Math.floor((endedMs - startedMs) / 1_000);
}

function activeLifecycle(scan: RendererScanResult | null) {
  const lifecycle = scan?.rendererLifecycle;
  if (!lifecycle?.activeEnvironmentKey) return null;
  return lifecycle.environments[lifecycle.activeEnvironmentKey] || null;
}

function formatLifecycleState(state: string | undefined): string {
  return ({
    authenticating: 'Authenticating',
    authenticated: 'Authenticated',
    frontend: 'Frontend',
    loading: 'Loading',
    in_game: 'In game',
    disconnected: 'Disconnected',
    exited: 'Exited',
    unknown: 'Unknown'
  } as Record<string, string>)[state || 'unknown'] || 'Unknown';
}

function createPartyPanel(scan: RendererScanResult | null): PanelState {
  const userIds = scan?.userActivity.userIds || [];
  if (!scan) {
    return { title: 'Party', state: 'unknown', label: 'Unknown', detail: 'Telemetry has not been collected in this session.' };
  }
  if (userIds.length === 0) {
    return { title: 'Party', state: 'empty', label: 'Not in a party', detail: 'No supported party roster evidence is present.' };
  }
  return {
    title: 'Party',
    state: 'ready',
    label: `${userIds.length} local identity marker${userIds.length === 1 ? '' : 's'}`,
    detail: 'Sensitive identifiers are hidden by default.'
  };
}

function createMissionPanel(): PanelState {
  return {
    title: 'Mission',
    state: 'unsupported',
    label: 'Unsupported',
    detail: 'Mission lifecycle evidence is not promoted into MVP current state yet.'
  };
}

function createAlerts(state: WorkspaceState, scan: RendererScanResult | null, source: PublicRuntimeSource | null): AlertState[] {
  const alerts: AlertState[] = [];
  if (state === 'fatal') {
    alerts.push({ id: 'fatal', severity: 'critical', title: 'Fatal renderer state', message: 'Runtime Monitor could not initialize safely.' });
  }
  if (state === 'degraded' || state === 'recovering') {
    alerts.push({ id: 'degraded', severity: 'warning', title: 'Monitor recovering', message: 'Monitoring is active but health is degraded.' });
  }
  if (state === 'stale') {
    alerts.push({ id: 'stale', severity: 'warning', title: 'Telemetry stale', message: 'Last observation exceeded the freshness threshold.' });
  }
  if (source && source.validation?.isValid === false) {
    alerts.push({ id: 'source', severity: 'critical', title: 'Source disconnected', message: source.validation.message });
  }
  for (const diagnostic of scan?.environmentDiagnostics || []) {
    alerts.push({
      id: `diagnostic-${alerts.length}`,
      severity: 'warning',
      title: 'Environment diagnostic',
      message: typeof diagnostic === 'string' ? diagnostic : 'Environment evidence requires review.'
    });
  }
  return alerts;
}

function countWarnings(state: WorkspaceState, scan: RendererScanResult | null): number {
  return (state === 'ready' || state === 'loading' ? 0 : 1) + (scan?.environmentDiagnostics?.length || 0);
}

function formatMonitorLabel(state: WorkspaceState, active: boolean): string {
  if (state === 'loading') return 'Loading';
  if (state === 'fatal') return 'Fatal';
  if (state === 'no-source') return 'Awaiting source';
  if (state === 'unsupported-profile') return 'Unsupported profile';
  if (state === 'disconnected') return 'Disconnected';
  if (state === 'recovering') return 'Recovering';
  if (state === 'degraded') return 'Degraded';
  if (state === 'stale') return 'Stale';
  return active ? 'Live' : 'Ready';
}

function formatEnvironment(scan: RendererScanResult | null): string {
  const environment = scan?.environment;
  return [
    environment?.releaseChannel || 'UNKNOWN',
    environment?.environmentName || null
  ].filter(Boolean).join(' / ');
}

function formatRowEnvironment(row: RendererEvidenceRow): string {
  return [
    row.environment?.releaseChannel || firstString(row.gameChannel) || 'UNKNOWN',
    row.environment?.buildVersion && row.environment.buildVersion !== 'UNKNOWN_BUILD' ? row.environment.buildVersion : null
  ].filter(Boolean).join(' / ');
}

export function formatSourceState(source: PublicRuntimeSource): string {
  const channel = source.channelHint || 'UNKNOWN';
  const status = source.validation?.isValid ? 'Validated' : source.validation?.message || source.validation?.status || 'Unknown';
  return [channel, source.buildVersion && source.buildVersion !== 'UNKNOWN_BUILD' ? source.buildVersion : null, status]
    .filter(Boolean)
    .join(' / ');
}

export function formatFreshness(value: string | null | undefined, now: Date): string {
  if (!value) return 'Unknown';
  const then = new Date(value);
  if (Number.isNaN(then.valueOf())) return 'Unknown';
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  if (elapsedSeconds < 5) return 'Now';
  if (elapsedSeconds < 60) return `${elapsedSeconds}s`;
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  return `${elapsedHours}h`;
}

function formatDurationSince(value: string | null | undefined, now: Date): string {
  if (!value) return 'Unknown';
  const then = new Date(value);
  if (Number.isNaN(then.valueOf())) return 'Unknown';
  const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 60000));
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function compareNullableDate(left: string | null, right: string | null): number {
  const leftTime = left ? new Date(left).getTime() : 0;
  const rightTime = right ? new Date(right).getTime() : 0;
  return (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0);
}
