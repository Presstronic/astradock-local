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
  source: PublicRuntimeSource | null;
  sources?: readonly PublicRuntimeSource[];
  installation?: { valid: boolean; reason?: string };
  saved?: boolean;
  selected?: boolean;
}

export interface MonitorOptions {
  username?: string;
  userId?: string;
  startMode?: 'from_current_end' | 'from_checkpoint' | 'from_beginning';
  bootstrapMode?: 'none' | 'current_state';
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
  storage: StorageHealth;
}

export interface StorageHealth {
  status: 'initializing' | 'ready' | 'error';
  errorCode: string | null;
  recoverable?: boolean;
  schemaVersion?: number;
  encrypted?: boolean;
  journalMode?: string;
  databaseSizeBytes?: number;
  eventCount?: number;
  environmentCount?: number;
  oldestEventAt?: string | null;
  newestEventAt?: string | null;
  lastAppend?: { attempted: number; inserted: number; duplicates: number };
}

export interface TailerCheckpoint {
  version: 1;
  sourceIdentity: string;
  offset: number;
  generation: number;
  observedAt?: string | null;
}

export interface TailerHealth {
  status: 'idle' | 'waiting_for_source' | 'monitoring' | 'paused' | 'stale' | 'stopped';
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
    status: 'compatible' | 'unverified_build' | 'unsupported_profile' | 'suspected_drift';
    reason: string;
    profileId: string | null;
    profileVersion: string | null;
    familyId: string | null;
    familyVersion: string | null;
    compatibilityBasis: string | null;
    testedBuild: string | null;
    exclusionReason: string | null;
    requiredAnchorCount: number;
    observedAnchorCount: number;
    missingAnchors: readonly { family: string; anchor: string }[];
    affectedEventFamilies: readonly string[];
    lastCompatibleObservationAt: string | null;
  };
  rendererLifecycle: RendererLifecycleProjection;
  partySnapshot: RendererPartySnapshot;
  locationSnapshot: RendererLocationSnapshot;
  destinationSnapshot: RendererDestinationSnapshot;
  vehicleSnapshot: RendererVehicleSnapshot;
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
  recovery: {
    mode: 'full_log_scan';
    qualification: 'last_confirmed';
    canonicalEventCount: number;
    observedAt: string;
    limitation: string;
  } | null;
}

export interface RendererLifecycleProjection {
  version: 3;
  activeEnvironmentKey: string | null;
  environments: Readonly<Record<string, RendererEnvironmentLifecycle>>;
}

export interface RendererEnvironmentLifecycle {
  version: 3;
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
    state: 'unknown' | 'transitioning' | 'connected' | 'disconnected';
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
    state: 'unknown' | 'transitioning' | 'connected' | 'disconnected';
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
  observation: {
    lastDomainEventAt: string | null;
    state: 'none' | 'observed';
  };
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

export interface RendererDestinationSnapshot {
  version: 1;
  activeEnvironmentKey: string | null;
  environments: Readonly<Record<string, RendererDestinationEnvironment>>;
}

export interface RendererDestinationEnvironment {
  version: 1;
  environmentKey: string;
  environment: EnvironmentContext;
  state: 'unknown' | 'target_selected' | 'arrived' | 'stale';
  freshness: 'current' | 'stale' | 'unknown';
  currentTarget: RendererDestinationFact | null;
  lastArrival: RendererDestinationFact | null;
  lastChangedAt: string | null;
  limitation: string;
}

export interface RendererDestinationFact {
  targetObservedId: string | null;
  vehicleClassName: string | null;
  vehicleEntityId: string;
  observedAt: string;
  confidence: string;
  provenance: string;
  evidenceEventId: string;
}

export interface RendererVehicleSnapshot {
  version: 1;
  activeEnvironmentKey: string | null;
  environments: Readonly<Record<string, RendererVehicleEnvironment>>;
}

export interface RendererVehicleEnvironment {
  version: 1;
  environmentKey: string;
  environment: EnvironmentContext;
  hangarVehicle: RendererVehicleFact | null;
  controlledVehicle: RendererVehicleFact | null;
  aboardVehicle: { state: 'unsupported'; reason: string };
  ownership: { state: 'not_determined' };
  lastChangedAt: string | null;
}

export interface RendererVehicleFact {
  state: 'known' | 'released' | 'stored' | 'disconnected';
  relationship: 'hangar' | 'controlled';
  outcome: 'retrieved' | 'acquired' | 'released' | 'stored';
  vehicleClassName: string | null;
  vehicleDisplayName: string | null;
  vehicleEntityId: string;
  observedAt: string;
  confidence: string;
  provenance: string;
  evidenceEventId: string;
  puSessionId: string | null;
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
  environmentKey: string;
  eventId: string;
}

export interface EvidenceDetail {
  kind: 'shard' | 'action' | 'session' | 'runtime';
  eventId: string;
  eventType: string;
  summary: string;
  sourceTimestamp: string | null;
  ingestedAt: string | null;
  environmentKey: string;
  gameChannel: string | null;
  gameBuild: string | null;
  sessionId: string | null;
  provenance: string;
  confidence: string;
  sensitivity: 'public' | 'local' | 'personal' | 'social' | 'secret';
  parserVersion: string | null;
  sourceProfileVersion: string | null;
  payload: Readonly<Record<string, unknown>>;
  correlations: Readonly<Record<string, string>>;
  retention: 'retained' | 'removed' | 'unknown';
  evidence: {
    availability: 'available' | 'redacted' | 'unsupported' | 'removed';
    rawContext: readonly string[];
    markers: readonly string[];
    lineNumber: number | null;
    environmentKey: string | null;
  };
  related: readonly {
    eventId: string;
    eventType: string;
    relationship: 'contributor' | 'correlated';
    sourceTimestamp: string | null;
  }[];
}

export interface RendererSettings {
  version: 2;
  theme: 'dark';
  username: string;
  userId: string;
  streamView: 'terminal' | 'table';
  terminalDensity: 'compact' | 'default' | 'relaxed';
  tableDensity: 'compact' | 'default' | 'relaxed';
  terminalDrawer: 'right' | 'bottom';
  tableDrawer: 'right' | 'bottom';
  retentionDays: number;
  savedAt: string | null;
}

export interface SettingsSnapshot {
  settings: RendererSettings;
  storage: StorageHealth;
  activeSourceId: string | null;
}

export type RendererSettingsPatch = Partial<Pick<RendererSettings, 'theme' | 'username' | 'userId' | 'streamView' | 'terminalDensity' | 'tableDensity' | 'terminalDrawer' | 'tableDrawer' | 'retentionDays'>>;

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
  | { type: 'monitor.error'; monitor: MonitorState; error: { code: string; message: string; retryable: boolean } }
  | { type: 'exporter.progress'; progress: { phase: string; filesProcessed: number; filesTotal: number; recordsFound: number; duplicatesSuppressed: number; outputFileName?: string } };

export interface BlueprintExportOptions {
  sourceId?: string | null;
  exportType: 'blueprint_data';
  environment: 'LIVE' | 'PTU' | 'EPTU' | 'HOTFIX' | 'TECH-PREVIEW';
  outputFormat: 'json' | 'csv';
  testOnly?: boolean;
}

export interface BlueprintExportResult {
  status: 'completed' | 'no_matches' | 'cancelled' | 'partial';
  /** Always null across the renderer boundary; the main process retains the private path. */
  outputPath: null;
  outputFileName: string | null;
  outputFormat: 'json' | 'csv';
  testOnly: boolean;
  records: readonly { name: string; type: string; shared: boolean | null }[];
  files: readonly { file: string; kind: string; build: string | null; status: string; fingerprint: string | null }[];
  filesScanned: number;
  filesTotal: number;
  linesRead: number;
  duplicatesSuppressed: number;
  skippedFiles: number;
  sourceFingerprint: string;
  diagnostics: readonly { file: string; kind: string; status: string; reason: string; code?: string }[];
  errors: readonly { file: string; code: string; message: string; build?: string | null }[];
  extraction: {
    status: 'approved' | 'unsupported';
    profileId: string | null;
    profileVersion: number | null;
    parserVersion: string;
    reason?: string;
    diagnostics?: readonly { code: string; message: string; count?: number }[];
  };
}

export type Unsubscribe = () => void;

export interface AstraDockApi {
  readonly version: RendererApiVersion;
  readonly source: {
    discover(): Promise<SourceDiscoveryResult>;
    choose(): Promise<SourceSelectionResult | null>;
    chooseDirectory(): Promise<SourceSelectionResult | null>;
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
  readonly exporter: {
    run(options: BlueprintExportOptions): Promise<BlueprintExportResult>;
    cancel(): Promise<{ cancelled: boolean }>;
  };
  readonly events: {
    query(query?: EventQuery): Promise<EventPage>;
    getEvidenceDetail(request: EvidenceDetailRequest): Promise<EvidenceDetail>;
  };
  readonly settings: {
    get(): Promise<SettingsSnapshot>;
    update(patch: RendererSettingsPatch): Promise<SettingsSnapshot>;
    applyRetention(environmentKey?: string | null): Promise<{ outcome: unknown; storage: StorageHealth }>;
    deleteTelemetry(mode: 'sensitive_evidence' | 'environment' | 'all_telemetry', environmentKey?: string | null): Promise<{ deleted: number; storage: StorageHealth }>;
    reset(): Promise<SettingsSnapshot>;
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
