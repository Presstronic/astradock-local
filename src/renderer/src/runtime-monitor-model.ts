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
  | 'paused'
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
  kind: 'shard' | 'action' | 'session' | 'party' | 'zone' | 'navigation' | 'runtime' | 'diagnostic';
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
  sourceHealth: SourceHealthState;
  activityState: ActivityState;
  compatibilityState: CompatibilityState;
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

export type SourceHealthState = 'unknown' | 'healthy' | 'recovering' | 'paused' | 'degraded' | 'missing' | 'stopped' | 'error';
export type ActivityState = 'none' | 'recent' | 'quiet';
export type CompatibilityState = 'unknown' | 'compatible' | 'unverified_build' | 'unsupported_profile' | 'suspected_drift';

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

const QUIET_AFTER_MS = 60_000;
const MAX_STREAM_ROWS = 100;

export function createRuntimeMonitorViewModel(input: {
  loading: boolean;
  fatalError: string | null;
  actionError?: string | null;
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
  const sourceHealth = classifySourceHealth(input.snapshot, source);
  const activityState = classifyActivity(lastObservedAt, input.now);
  const warningCount = countWarnings(state, scan);

  return {
    workspaceState: state,
    source,
    monitorLabel: formatMonitorLabel(state, monitor?.active ?? false, activityState),
    freshnessLabel: formatFreshness(lastObservedAt, input.now),
    exactFreshness: lastObservedAt,
    sourceHealth,
    activityState,
    compatibilityState: (scan?.parserCompatibility?.status || 'unknown') as CompatibilityState,
    environmentLabel: lifecycle?.environment.releaseChannel || formatEnvironment(scan),
    buildLabel: lifecycle?.build.productVersion || lifecycle?.build.fileVersion || (environment?.buildVersion && environment.buildVersion !== 'UNKNOWN_BUILD'
      ? environment.buildVersion
      : source?.buildVersion || 'Unknown'),
    warningCount,
    streamEvents,
    retainedCount: createAllEvents(scan).length,
    sourceCandidates: input.sources,
    instruments: createInstruments(scan, input.now),
    party: createPartyPanel(scan),
    mission: createMissionPanel(scan),
    alerts: createAlerts(state, scan, source, input.fatalError, input.actionError || null)
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
  if (input.scan?.parserCompatibility?.status === 'unsupported_profile') return 'unsupported-profile';

  const tailer = input.snapshot?.monitor.tailer;
  if (input.snapshot?.monitor.active && !tailer) return 'recovering';
  if (tailer?.status === 'stopped' || input.snapshot?.monitor.active === false) return 'ready';
  if (tailer?.status === 'paused' || tailer?.paused) return 'paused';
  if (tailer?.lastErrorCode) return 'degraded';
  if (tailer && !tailer.available) return 'disconnected';
  if (tailer && (tailer.backlogBytes > 0 || tailer.deliveryInFlight)) return 'degraded';

  return 'ready';
}

export function classifyActivity(observedAt: string | null, now: Date): ActivityState {
  if (!observedAt) return 'none';
  const observedMs = Date.parse(observedAt);
  if (Number.isNaN(observedMs)) return 'none';
  return now.getTime() - observedMs > QUIET_AFTER_MS ? 'quiet' : 'recent';
}

export function classifySourceHealth(
  snapshot: MonitorSnapshot | null,
  source: PublicRuntimeSource | null
): SourceHealthState {
  if (!source) return 'unknown';
  if (source.validation?.isValid === false) return 'error';
  const monitor = snapshot?.monitor;
  const tailer = monitor?.tailer;
  if (!tailer) return monitor?.active ? 'recovering' : 'stopped';
  if (tailer.status === 'stopped' || !monitor?.active) return 'stopped';
  if (tailer.status === 'paused' || tailer.paused) return 'paused';
  if (tailer.lastErrorCode) return 'degraded';
  if (!tailer.available || tailer.status === 'waiting_for_source') return 'missing';
  if (tailer.backlogBytes > 0 || tailer.deliveryInFlight) return 'degraded';
  return 'healthy';
}

export function createStreamEvents(scan: RendererScanResult | null, now: Date): StreamEvent[] {
  return createAllEvents(scan)
    .map(({ kind, row }) => toStreamEvent(kind, row, now))
    .sort((left, right) => compareNullableDate(right.timestamp, left.timestamp));
}

function createAllEvents(scan: RendererScanResult | null): Array<{ kind: StreamEvent['kind']; row: RendererEvidenceRow }> {
  if (!scan) return [];
  const runtime = (scan.promotedRuntimeEvents || []).map((row) => ({
    kind: runtimeEventKind(row),
    row
  }));
  const entries = (scan.entries || []).map((row) => ({ kind: 'shard' as const, row }));
  const actions = (scan.userActivity.actions || []).map((row) => ({ kind: 'action' as const, row }));
  const sessions = (scan.userActivity.sessions || []).map((row) => ({ kind: 'session' as const, row }));
  return [...runtime, ...entries, ...actions, ...sessions];
}

function toStreamEvent(kind: StreamEvent['kind'], row: RendererEvidenceRow, now: Date): StreamEvent {
  const timestamp = firstString(row.lastSeen, row.timestamp, row.startedAt, row.sourceTimestamp);
  const summary = firstString(row.summary, row.eventLabel, row.shardName, row.action, row.locationId, row.shardId) || 'Runtime observation';
  const context = [
    firstString(row.shardId),
    firstString(row.eventType),
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
  now: Date
): InstrumentState[] {
  const latestShard = scan?.entries?.[0];
  const latestSession = scan?.userActivity.sessions?.[0];
  const latestAction = scan?.userActivity.actions?.[0];
  const lifecycle = activeLifecycle(scan);
  const location = activeLocation(scan);
  const destination = activeDestination(scan);
  const unsupportedProfile = scan?.parserCompatibility?.status === 'unsupported_profile';
  const sessionDuration = currentSessionDuration(lifecycle?.puSession, now);

  return [
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
      label: 'PU replication connection',
      value: formatConnectionState(lifecycle?.replicationConnection.state),
      state: snapshotInstrumentState(lifecycle?.replicationConnection.state, Boolean(latestSession)),
      detail: lifecycle?.replicationConnection.disconnect
        ? `${lifecycle.replicationConnection.disconnect.origin} · ${lifecycle.replicationConnection.disconnect.reason}`
        : lifecycle?.replicationConnection.connectedAt
          ? formatFreshness(lifecycle.replicationConnection.connectedAt, now)
          : 'Monitor may have started mid-state',
      provenance: lifecycle && lifecycle.replicationConnection.state !== 'unknown' ? 'Observed canonical event' : 'Evidence absent',
      drilldown: lifecycle?.replicationConnection.endpoint
        ? `Replicant: ${lifecycle.replicationConnection.endpoint}:${lifecycle.replicationConnection.port}`
        : lifecycle?.replicationConnection.lastEndpoint
          ? `Last endpoint: ${lifecycle.replicationConnection.lastEndpoint}`
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
      id: 'application-duration',
      label: 'Application duration',
      value: 'Unknown',
      state: 'unknown',
      detail: 'Application-start evidence is not available',
      provenance: 'Evidence absent'
    },
    {
      id: 'jurisdiction',
      label: 'Jurisdiction',
      value: unsupportedProfile ? 'Unsupported' : firstString(location?.jurisdiction.value) || 'Unknown',
      state: unsupportedProfile ? 'unsupported' : locationFactState(location?.jurisdiction),
      detail: location?.jurisdiction.observedAt
        ? `${formatFreshness(location.jurisdiction.observedAt, now)} · Last confirmed`
        : unsupportedProfile ? 'Parser profile does not support jurisdiction evidence' : 'No validated jurisdiction evidence observed',
      provenance: location?.jurisdiction.evidenceEventId ? 'Observed HUD notification' : 'Evidence absent'
    },
    {
      id: 'monitored-space',
      label: 'Monitored space',
      value: unsupportedProfile ? 'Unsupported' : location?.monitoredSpace.value === true ? 'Entered' : 'Unknown',
      state: unsupportedProfile ? 'unsupported' : locationFactState(location?.monitoredSpace),
      detail: location?.monitoredSpace.observedAt
        ? `${formatFreshness(location.monitoredSpace.observedAt, now)} · No clear evidence promoted`
        : unsupportedProfile ? 'Parser profile does not support monitored-space evidence' : 'No validated monitored-space evidence observed',
      provenance: location?.monitoredSpace.evidenceEventId ? 'Observed HUD notification' : 'Evidence absent'
    },
    {
      id: 'destination',
      label: 'Quantum destination',
      value: unsupportedProfile
        ? 'Unsupported'
        : destination?.currentTarget?.targetObservedId || destination?.lastArrival?.targetObservedId || 'Unknown',
      state: unsupportedProfile ? 'unsupported'
        : destination?.state === 'target_selected' ? 'known'
          : destination?.state === 'arrived' ? 'last-confirmed'
            : destination?.state === 'stale' ? 'stale' : 'unknown',
      detail: destination?.currentTarget
        ? `Selected · ${destination.currentTarget.vehicleClassName || 'vehicle unknown'}`
        : destination?.lastArrival
          ? `Arrived · ${destination.lastArrival.vehicleClassName || 'vehicle unknown'}`
          : unsupportedProfile ? 'Parser profile does not support destination evidence' : 'No locally correlated quantum target observed',
      provenance: destination?.currentTarget?.evidenceEventId || destination?.lastArrival?.evidenceEventId
        ? 'Observed target with local vehicle correlation'
        : 'Evidence absent'
    },
    {
      id: 'armistice',
      label: 'Armistice',
      value: unsupportedProfile
        ? 'Unsupported'
        : location?.armistice.value === true
        ? 'Inside'
        : location?.armistice.value === false
          ? 'Outside'
          : 'Unknown',
      state: unsupportedProfile ? 'unsupported' : locationFactState(location?.armistice),
      detail: location?.armistice.observedAt
        ? `${formatFreshness(location.armistice.observedAt, now)} · ${location.armistice.state.replaceAll('_', ' ')}`
        : unsupportedProfile ? 'Parser profile does not support armistice evidence' : 'No validated armistice evidence observed',
      provenance: location?.armistice.evidenceEventId ? 'Observed HUD notification' : 'Evidence absent'
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

function activeParty(scan: RendererScanResult | null) {
  const party = scan?.partySnapshot;
  if (!party?.activeEnvironmentKey) return null;
  return party.environments[party.activeEnvironmentKey] || null;
}

function activeLocation(scan: RendererScanResult | null) {
  const location = scan?.locationSnapshot;
  if (!location?.activeEnvironmentKey) return null;
  return location.environments[location.activeEnvironmentKey] || null;
}

function activeDestination(scan: RendererScanResult | null) {
  const destination = scan?.destinationSnapshot;
  if (!destination?.activeEnvironmentKey) return null;
  return destination.environments[destination.activeEnvironmentKey] || null;
}

function runtimeEventKind(row: RendererEvidenceRow): StreamEvent['kind'] {
  if (row.eventCategory === 'party') return 'party';
  if (row.eventCategory === 'zone') return 'zone';
  if (row.eventCategory === 'navigation') return 'navigation';
  return 'runtime';
}

function locationFactState(fact: { state: string; value: unknown } | undefined): InstrumentState['state'] {
  if (!fact || fact.state === 'unknown') return 'unknown';
  if (fact.state === 'stale') return 'stale';
  return 'last-confirmed';
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
  const party = activeParty(scan);
  if (!scan) {
    return { title: 'Party', state: 'unknown', label: 'Unknown', detail: 'Telemetry has not been collected in this session.' };
  }
  if (scan.parserCompatibility?.status === 'unsupported_profile') {
    return { title: 'Party', state: 'unsupported', label: 'Unsupported', detail: 'Parser profile does not support party evidence.' };
  }
  if (!party || party.state === 'unknown') {
    return { title: 'Party', state: 'unknown', label: 'Unknown', detail: 'No supported party lifecycle evidence observed in this environment.' };
  }
  if (party.state === 'not_in_party') {
    return { title: 'Party', state: 'empty', label: 'Not in a party', detail: 'Terminal no-party evidence observed.' };
  }
  if (party.state === 'stale') {
    return {
      title: 'Party',
      state: 'unknown',
      label: 'Stale',
      detail: `Last evidence ${party.lastChangedAt || 'unknown'} · ${party.limitation}`
    };
  }
  return {
    title: 'Party',
    state: 'ready',
    label: 'In party',
    detail: [
      `${party.confirmedMemberCount} confirmed`,
      `${party.possibleMemberCount} possible`,
      party.leader.handle ? `leader ${party.leader.handle}` : null
    ].filter(Boolean).join(' · ')
  };
}

function createMissionPanel(scan: RendererScanResult | null): PanelState {
  const destination = activeDestination(scan);
  if (destination?.currentTarget) {
    return { title: 'Destination', state: 'ready', label: destination.currentTarget.targetObservedId || 'Selected', detail: `Quantum target selected · ${destination.currentTarget.vehicleClassName || 'vehicle unknown'}` };
  }
  if (destination?.lastArrival) {
    return { title: 'Destination', state: 'ready', label: destination.lastArrival.targetObservedId || 'Arrived', detail: `Final quantum arrival observed · ${destination.lastArrival.vehicleClassName || 'vehicle unknown'}` };
  }
  return {
    title: 'Mission / destination',
    state: 'unsupported',
    label: 'Unsupported',
    detail: 'Mission lifecycle evidence is not promoted into MVP current state yet.'
  };
}

function createAlerts(
  state: WorkspaceState,
  scan: RendererScanResult | null,
  source: PublicRuntimeSource | null,
  fatalError: string | null,
  actionError: string | null
): AlertState[] {
  const alerts: AlertState[] = [];
  if (state === 'fatal') {
    alerts.push({
      id: 'fatal',
      severity: 'critical',
      title: 'Runtime Monitor could not initialize',
      message: fatalError || 'Runtime Monitor could not initialize safely.'
    });
  }
  if (actionError && state !== 'fatal') {
    alerts.push({
      id: 'action-error',
      severity: 'warning',
      title: 'Action could not complete',
      message: actionError
    });
  }
  if (state === 'degraded' || state === 'recovering' || state === 'paused') {
    alerts.push({ id: 'degraded', severity: 'warning', title: 'Monitor recovering', message: 'Monitoring is active but health is degraded.' });
  }
  if (state === 'stale') {
    alerts.push({ id: 'stale', severity: 'warning', title: 'Monitor health stale', message: 'Expected monitor health signals exceeded the fault-visibility window.' });
  }
  if (source && source.validation?.isValid === false) {
    alerts.push({ id: 'source', severity: 'critical', title: 'Source disconnected', message: source.validation.message });
  }
  if (scan?.parserCompatibility?.status === 'suspected_drift') {
    alerts.push({
      id: 'parser-drift',
      severity: 'warning',
      title: 'Parser vocabulary drift suspected',
      message: 'The source remains available, but some current log vocabulary is not recognized by this profile.'
    });
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
  return (state === 'ready' || state === 'loading' ? 0 : 1)
    + (scan?.parserCompatibility?.status === 'suspected_drift' ? 1 : 0)
    + (scan?.environmentDiagnostics?.length || 0);
}

function formatMonitorLabel(state: WorkspaceState, active: boolean, activity: ActivityState): string {
  if (state === 'loading') return 'Loading';
  if (state === 'fatal') return 'Fatal';
  if (state === 'no-source') return 'Awaiting source';
  if (state === 'unsupported-profile') return 'Unsupported profile';
  if (state === 'disconnected') return 'Disconnected';
  if (state === 'recovering') return 'Recovering';
  if (state === 'paused') return 'Paused';
  if (state === 'degraded') return 'Degraded';
  if (state === 'stale') return 'Stale';
  return active ? (activity === 'quiet' ? 'Live · Quiet' : 'Live') : 'Ready';
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
