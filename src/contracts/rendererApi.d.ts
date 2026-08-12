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
  kind: 'shard' | 'action' | 'session';
  id: string;
}

export interface EvidenceDetail {
  kind: 'shard' | 'action' | 'session';
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
  theme: 'dark' | 'light';
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
