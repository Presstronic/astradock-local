import type { EnvironmentContext } from './runtimeEvents';

export type RendererApiVersion = 1;

export interface PublicSourceValidation {
  status: string;
  isValid: boolean;
  checkedAt: string;
  message: string;
  evidenceMarkers: readonly string[];
}

export interface PublicRuntimeSource {
  sourceId: string;
  sourceKind: 'game_log';
  discoveryMethods: readonly string[];
  displayLabel: string;
  displayPath: string;
  channelHint: string;
  channelConfidence: string;
  rawChannel?: string;
  buildVersion: string | null;
  environmentName: string | null;
  installationKind: string;
  platformHint: string;
  validation: PublicSourceValidation;
}

export interface SourceDiscoveryResult {
  sources: readonly PublicRuntimeSource[];
  activeSource: PublicRuntimeSource | null;
  summary: {
    checkedAt: string;
    candidateCount: number;
    validCount: number;
    ambiguous: boolean;
    selectionReason: string;
  };
}

export interface SourceSelectionResult {
  source: PublicRuntimeSource;
  saved?: boolean;
  selected?: boolean;
}

export interface MonitorOptions {
  username?: string;
  userId?: string;
  startMode?: 'from_current_end' | 'from_checkpoint' | 'from_beginning';
  checkpoint?: TailerCheckpoint | null;
}

export interface MonitorCommand {
  sourceId?: string | null;
  options?: MonitorOptions;
}

export interface MonitorState {
  active: boolean;
  sourceId: string | null;
  sequence: number;
  pendingScan: boolean;
  tailer: TailerHealth | null;
  checkpoint: TailerCheckpoint | null;
}

export interface TailerCheckpoint {
  version: 1;
  sourceIdentity: string;
  offset: number;
  generation: number;
  observedAt?: string | null;
}

export interface TailerHealth {
  status: 'idle' | 'waiting_for_source' | 'monitoring' | 'paused' | 'stopped';
  available: boolean;
  generation: number;
  sequence: number;
  offset: number;
  fileSize: number;
  backlogBytes: number;
  pendingCheck: boolean;
  deliveryInFlight: boolean;
  paused: boolean;
  pauseReason: string | null;
  lastErrorCode: string | null;
  sourceIdentity: string | null;
  lastObservedAt: string | null;
  lastDeliveredAt: string | null;
}

export interface TailerChunkMetadata {
  sourceId: string;
  generation: number;
  sequence: number;
  sourceIdentity: string;
  offsetStart: number;
  offsetEnd: number;
  byteLength: number;
  observedAt: string;
  ingestedAt: string;
  fileSize: number;
}

export interface TailerLifecycleRecord {
  type: string;
  sequence: number;
  emittedAt: string;
  sourceId: string;
  sourceIdentity: string | null;
  previousIdentity: string | null;
  generation?: number;
  offset?: number;
  size?: number;
  status?: string;
  reason?: string;
  recoverable?: boolean;
  retryable?: boolean;
  [key: string]: unknown;
}

export interface RendererScanResult {
  scannedAt: string;
  modifiedAt: string | null;
  environment: EnvironmentContext | null;
  environmentKey: string;
  environmentPartitions: readonly EnvironmentContext[];
  environmentSwitches: readonly unknown[];
  environmentDiagnostics: readonly unknown[];
  parserCompatibility: {
    status: 'compatible' | 'unsupported_profile' | 'suspected_drift';
    reason: string;
    profileId: string | null;
    profileVersion: string | null;
  };
  rendererLifecycle: RendererLifecycleProjection;
  partySnapshot: RendererPartySnapshot;
  locationSnapshot: RendererLocationSnapshot;
  promotedRuntimeEvents: readonly RendererEvidenceRow[];
  entries: readonly RendererEvidenceRow[];
  userActivity: {
    username?: string;
    userIds?: readonly string[];
    userIdsByEnvironment?: Readonly<Record<string, readonly string[]>>;
    actions?: readonly RendererEvidenceRow[];
    sessions?: readonly RendererEvidenceRow[];
  };
  source: PublicRuntimeSource;
}

export interface RendererLifecycleProjection {
  version: 2;
  activeEnvironmentKey: string | null;
  environments: Readonly<Record<string, RendererEnvironmentLifecycle>>;
}

export interface RendererEnvironmentLifecycle {
  version: 2;
  environmentKey: string;
  environment: {
    releaseChannel: string;
    rawReleaseChannel: string;
    environmentName: string;
    branch: string;
    buildVersion: string;
    confidence: string;
    status: 'known' | 'unknown';
  };
  build: {
    status: 'known' | 'unknown';
    fileVersion: string | null;
    productVersion: string | null;
    branch: string | null;
    changelist: string | null;
    gameVersion: string | null;
    dataCoreVersion: string | null;
    archetypeVersion: string | null;
    componentVersion: string | null;
    config: string | null;
  };
  identity: Readonly<Record<string, {
    status: 'known' | 'unknown' | 'conflicting';
    value: string | null;
    observedAt: string | null;
    confidence: string;
    conflictingClaimCount: number;
  }>>;
  shard: {
    state: 'unknown' | 'transitioning' | 'connected' | 'disconnected' | 'stale';
    shardLabel: string | null;
    locationId: string | null;
    region: {
      friendlyRegion: 'US' | 'EU' | 'AUS' | 'ASIA' | 'UNKNOWN';
      rawSegment: string | null;
      confidence: 'medium' | 'unknown';
      basis: 'naming_convention' | 'unmapped';
      mappingVersion: string;
    };
    observedAt: string | null;
    confidence: string;
  };
  replicationConnection: {
    state: 'unknown' | 'transitioning' | 'connected' | 'disconnected' | 'stale';
    endpoint: string | null;
    port: number | null;
    observedNodeId: string | null;
    hostType: 'Replicant' | null;
    gamerules: string | null;
    connectedAt: string | null;
    disconnectedAt: string | null;
    lastEndpoint: string | null;
    disconnect: {
      cause: string;
      reason: string;
      origin: 'local' | 'remote';
      observedAt: string;
    } | null;
    confidence: string;
  };
  puSession: {
    state: 'unknown' | 'connecting' | 'in_game' | 'disconnected';
    matchmakingRequestId: string | null;
    matchmakingStatus: string | null;
    requestedAt: string | null;
    enteredAt: string | null;
    endedAt: string | null;
    durationSeconds: number | null;
    durationSource: 'observed_connection_uptime' | null;
    elapsedSeconds: number | null;
  };
  lifecycle: {
    state: 'unknown' | 'authenticating' | 'authenticated' | 'frontend' | 'loading' | 'in_game' | 'disconnected' | 'exited';
    status: 'known' | 'unknown' | 'failure';
    lastChangedAt: string | null;
    durationStartedAt: string | null;
    reason: string;
    cleanExit: boolean | null;
  };
  lastChangedAt: string | null;
  freshness: 'current' | 'stale' | 'unknown';
}

export interface RendererEvidenceRow {
  id: string;
  environmentKey?: string;
  environment?: EnvironmentContext;
  gameChannel?: string;
  gameBuild?: string;
  lineNumber?: number;
  startLineNumber?: number;
  evidenceAvailable: boolean;
  [key: string]: unknown;
}

export interface RendererPartySnapshot {
  version: 1;
  activeEnvironmentKey: string | null;
  environments: Readonly<Record<string, RendererPartyEnvironment>>;
}

export interface RendererPartyEnvironment {
  version: 1;
  environmentKey: string;
  environment: EnvironmentContext;
  state: 'unknown' | 'in_party' | 'not_in_party' | 'stale' | 'unsupported';
  freshness: 'current' | 'stale' | 'unknown';
  partyId: string | null;
  leader: {
    status: 'known' | 'unknown' | 'stale';
    handle: string | null;
    isLocalPlayer: boolean | null;
    observedAt: string | null;
    confidence: string;
    evidenceEventId: string | null;
  };
  members: readonly RendererPartyMember[];
  confirmedMemberCount: number;
  possibleMemberCount: number;
  recentTransitions: readonly RendererPartyTransition[];
  lastChangedAt: string | null;
  limitation: string;
}

export interface RendererPartyMember {
  handle: string;
  membershipState: 'unknown' | 'possible' | 'confirmed' | 'stale' | 'not_member';
  connectionState: 'unknown' | 'connected' | 'disconnected' | 'stale';
  isLeader: boolean;
  isLocalPlayer: boolean;
  latestTransition: string | null;
  observedAt: string | null;
  confidence: string;
  evidenceEventId: string | null;
}

export interface RendererPartyTransition {
  eventType: string;
  label: string;
  subjectHandle: string | null;
  observedAt: string;
  confidence: string;
  evidenceEventId: string;
}

export interface RendererLocationSnapshot {
  version: 1;
  activeEnvironmentKey: string | null;
  environments: Readonly<Record<string, RendererLocationEnvironment>>;
}

export interface RendererLocationEnvironment {
  version: 1;
  environmentKey: string;
  environment: EnvironmentContext;
  state: 'unknown' | 'known' | 'stale' | 'unsupported';
  freshness: 'current' | 'stale' | 'unknown';
  jurisdiction: RendererLocationFact<string>;
  monitoredSpace: RendererLocationFact<boolean>;
  armistice: RendererLocationFact<boolean>;
  exactLocation: {
    state: 'unsupported';
    value: null;
    reason: string;
  };
  lastChangedAt: string | null;
}

export interface RendererLocationFact<TValue> {
  state: 'unknown' | 'last_confirmed' | 'entered' | 'left' | 'stale';
  value: TValue | null;
  observedAt: string | null;
  confidence: string;
  provenance: string;
  evidenceEventId: string | null;
}

export interface MonitorSnapshot {
  monitor: MonitorState;
  source: PublicRuntimeSource | null;
  scan: RendererScanResult | null;
  subscriptions: {
    sequence: number;
    subscriberCount: number;
  };
}

export interface MonitorStartResult {
  monitor: MonitorState;
  scan: RendererScanResult;
}

export type EventQueryKind = 'all' | 'shards' | 'actions' | 'sessions';

export interface EventQuery {
  kind?: EventQueryKind;
  cursor?: number;
  limit?: number;
}

export interface EventPage {
  cursor: number;
  nextCursor: number | null;
  totalCount: number;
  items: readonly {
    kind: 'shard' | 'action' | 'session';
    item: RendererEvidenceRow;
  }[];
}

export interface EvidenceDetailRequest {
  kind: 'shard' | 'action' | 'session' | 'runtime';
  id: string;
}

export interface EvidenceDetail {
  kind: 'shard' | 'action' | 'session' | 'runtime';
  id: string;
  sensitivity: 'local';
  evidence: {
    rawContext: readonly string[];
    lineNumber: number | null;
    environmentKey: string | null;
  };
}

export interface RendererSettings {
  version: 1;
  theme: 'dark';
  username: string;
  userId: string;
  savedAt: string | null;
}

export type RendererSettingsPatch = Partial<Pick<RendererSettings, 'theme' | 'username' | 'userId'>>;

export interface DiagnosticsHealth {
  status: 'monitoring' | 'idle';
  checkedAt: string;
  monitor: MonitorState;
  activeSourceId: string | null;
  sourceRegistryCount: number;
  tailer: TailerHealth | null;
  lastScan: {
    scannedAt: string;
    modifiedAt: string | null;
    entryCount: number;
    actionCount: number;
    sessionCount: number;
    diagnosticCount: number;
  } | null;
}

export interface MonitorChangeEnvelope {
  subscriptionId: string;
  version: 1;
  dropped: number;
  changes: readonly {
    sequence: number;
    emittedAt: string;
    change: MonitorChange;
  }[];
  error?: {
    code: string;
    message: string;
  };
}

export type MonitorChange =
  | { type: 'monitor.started'; monitor: MonitorState }
  | { type: 'monitor.stopped'; reason: string; monitor: MonitorState }
  | { type: 'monitor.scan'; monitor: MonitorState; scan: RendererScanResult }
  | { type: 'monitor.bytes'; monitor: MonitorState; chunk: TailerChunkMetadata }
  | { type: 'monitor.lifecycle'; monitor: MonitorState; lifecycle: TailerLifecycleRecord }
  | { type: 'monitor.error'; monitor: MonitorState; error: { code: string; message: string; retryable: boolean } };

export type Unsubscribe = () => void;

export interface AstraDockApi {
  readonly version: RendererApiVersion;
  readonly source: {
    discover(): Promise<SourceDiscoveryResult>;
    choose(): Promise<SourceSelectionResult | null>;
    select(sourceId: string): Promise<SourceSelectionResult>;
    openFolder(sourceId: string): Promise<{ opened: true }>;
  };
  readonly monitor: {
    getSnapshot(): Promise<MonitorSnapshot>;
    scan(command?: MonitorCommand): Promise<RendererScanResult>;
    start(command?: MonitorCommand): Promise<MonitorStartResult>;
    stop(): Promise<MonitorState>;
    subscribe(listener: (message: MonitorChangeEnvelope) => void, options?: { resumeAfter?: number }): Unsubscribe;
  };
  readonly events: {
    query(query?: EventQuery): Promise<EventPage>;
    getEvidenceDetail(request: EvidenceDetailRequest): Promise<EvidenceDetail>;
  };
  readonly settings: {
    get(): Promise<RendererSettings>;
    update(patch: RendererSettingsPatch): Promise<RendererSettings>;
  };
  readonly diagnostics: {
    getHealth(): Promise<DiagnosticsHealth>;
  };
}

declare global {
  interface Window {
    astradock: AstraDockApi;
  }
}
