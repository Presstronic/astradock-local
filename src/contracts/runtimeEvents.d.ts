export const CONTRACT_VERSION: 'runtime-event/v1';

export type ReleaseChannel = 'LIVE' | 'PTU' | 'EPTU' | 'HOTFIX' | 'UNKNOWN';
export type Universe = 'PU' | 'UNKNOWN';
export type Provenance = 'observed' | 'extracted' | 'inferred' | 'enriched';
export type Confidence = 'confirmed' | 'high' | 'medium' | 'low' | 'unknown';
export type Sensitivity = 'public' | 'local' | 'personal' | 'social' | 'secret';
export type TemporalUtility = 'live' | 'near_real_time' | 'session_summary' | 'long_term_history';
export type PersistenceScope = 'ephemeral' | 'session' | 'durable';
export type StationSyncPolicy = 'never' | 'eligible_with_consent' | 'required_for_enabled_feature';
export type DiagnosticUtility = 'none' | 'operational' | 'parser_drift' | 'game_bug' | 'support_bundle';
export type SubjectScope =
  | 'local_player'
  | 'other_player'
  | 'party'
  | 'session'
  | 'shard'
  | 'server_connection'
  | 'installation'
  | 'game_build';
export type Lifecycle = 'event' | 'state' | 'snapshot' | 'metric' | 'definition';
export type VolumeCost = 'low' | 'moderate' | 'high' | 'bulk';
export type EvidenceKind = 'application' | 'fixture' | 'runtime_log' | 'diagnostic';

export interface RuntimeEventPayloadMap {
  RuntimeSourceDiscovered: {
    sourceLocation: string;
    sourceKind: 'game_log';
    discoveryMethod: 'automatic' | 'user_selected' | 'restored_setting';
    supported: boolean;
  };
  RuntimeSourceSelected: {
    sourceLocation: string;
    selectionMethod: 'automatic' | 'user_selected' | 'restored_setting';
  };
  RuntimeMonitorStarted: {
    sourceLocation: string;
    startMode: 'from_current_end' | 'from_checkpoint' | 'from_beginning';
  };
  RuntimeMonitorStopped: {
    sourceLocation: string;
    reason: 'user_requested' | 'source_changed' | 'application_shutdown' | 'runtime_error';
  };
  RuntimeSourceUnavailable: {
    sourceLocation: string;
    reason: 'missing' | 'permission_denied' | 'locked' | 'rotated' | 'unsupported';
    recoverable: boolean;
  };
  ParserCompatibilityStatusObserved: {
    status: 'compatible' | 'unsupported_profile' | 'suspected_drift';
    profileId: string;
    profileVersion: string;
    reason: string;
    recordsSeen: number;
    knownEventsEmitted: number;
    unknownRecords: number;
    unknownSampleCount: number;
    droppedUnknownSamples: number;
  };
  ParserDriftSuspected: {
    profileId: string;
    profileVersion: string;
    reason: string;
    recordsSeen: number;
    knownEventsEmitted: number;
    unknownRecords: number;
    unknownRatio: number;
  };
  ClientBuildObserved: {
    fileVersion: string;
    productVersion: string;
    branch: string;
    changelist: string;
  };
  ReleaseEnvironmentObserved: {
    releaseChannel: ReleaseChannel;
    environmentName: string;
    config: string;
    sourceLocation: string;
  };
  GameDataVersionObserved: {
    gameVersion: string;
    dataCoreVersion: string;
    archetypeVersion: string;
    componentVersion: string;
  };
  LoginStarted: {
    loginSessionId: string;
    releaseChannel: ReleaseChannel;
  };
  AccountAuthenticated: {
    handle: string;
    accountId: string;
  };
  IdentityObserved: {
    characterName: string;
    accountId: string;
    characterGeid: string;
    playerGeid: string;
    nodeId: string;
    clientSession: string;
  };
  MatchmakingStatusObserved: {
    matchmakingRequestId: string;
    matchmakingStatus: string;
    port: number;
  };
  PuJoinRequested: {
    matchmakingRequestId: string;
    shard: string;
    endpoint: string;
    port: number;
    locationId: string;
  };
  PuReplicationConnectionEstablished: {
    endpoint: string;
    port: number;
    observedNodeId: string;
    playerGeid: string;
    gamerules: string;
    hostType: 'Replicant';
  };
  UniverseHierarchyRegistered: {
    receivedFromNetwork: boolean;
    nodeCount: number;
    durationMs: number;
  };
  PuTerritorySetupCompleted: {
    gamerules: 'SC_Default';
    status: 'Finished';
    runningTimeSeconds: number;
  };
  PuEntered: {
    gamerules: string;
    loadDurationSeconds: number;
  };
  PuDisconnected: {
    cause: string;
    reason: string;
    isRemote: boolean;
    endpoint: string;
    uptimeSeconds: number;
  };
  ReturnedToFrontend: {
    reason: string;
  };
  ApplicationExited: {
    cause: string;
    reason: string;
    exitCode: number;
    clean: boolean;
  };
  PartyCreated: {
    partyId: string;
    leaderHandle: string;
  };
  PartyLaunchInitiated: {
    notificationId: string;
    message: string;
  };
  PartyMemberConnected: {
    notificationId: string;
    memberHandle: string;
  };
  PartyLeft: {
    partyId: string;
    playerGeid: string;
    reason: 'voluntary_leave';
  };
  JurisdictionEntered: {
    notificationId: string;
    jurisdiction: string;
  };
  MonitoredSpaceEntered: {
    notificationId: string;
    state: 'entered';
  };
  MonitoredSpaceExited: {
    notificationId: string;
    state: 'exited';
  };
  ArmisticeStateChanged: {
    notificationId: string;
    state: 'entered' | 'left';
  };
  QuantumTargetSelected: {
    vehicleEntityId: string;
    vehicleClassName: string;
    targetObservedId: string;
  };
  QuantumTargetChanged: {
    vehicleEntityId: string;
    vehicleClassName: string;
    previousTargetObservedId: string;
    targetObservedId: string;
  };
  QuantumTravelArrived: {
    vehicleEntityId: string;
    vehicleClassName: string;
    targetObservedId: string;
  };
}

export type RuntimeEventType = keyof RuntimeEventPayloadMap;

export interface RuntimeEventEnums {
  releaseChannel: readonly ReleaseChannel[];
  universe: readonly Universe[];
  provenance: readonly Provenance[];
  confidence: readonly Confidence[];
  sensitivity: readonly Sensitivity[];
  temporalUtility: readonly TemporalUtility[];
  persistenceScope: readonly PersistenceScope[];
  stationSyncPolicy: readonly StationSyncPolicy[];
  diagnosticUtility: readonly DiagnosticUtility[];
  subjectScope: readonly SubjectScope[];
  lifecycle: readonly Lifecycle[];
  volumeCost: readonly VolumeCost[];
  evidenceKind: readonly EvidenceKind[];
}

export const ENUMS: RuntimeEventEnums;

export interface EvidenceReference {
  kind: EvidenceKind;
  sourceId: string;
  sensitivity: Sensitivity;
  fixtureId?: string;
  evidenceMarkers?: readonly string[];
  lineRange?: {
    start: number;
    end: number;
  };
}

export interface EnvironmentContext {
  environmentKey: string;
  releaseChannel: ReleaseChannel;
  universe: Universe;
  environmentName: string;
  rawEnvironmentTag: string;
  branch: string;
  buildVersion: string;
  changelist?: string;
  databaseVersion?: string;
  sourceInstallationId: string;
  observedAt: string;
  confidence: Confidence;
  evidenceReference: EvidenceReference;
}

export interface RuntimeEventTraits {
  temporalUtility: TemporalUtility;
  persistence: {
    scope: PersistenceScope;
    retention: string;
  };
  stationSyncPolicy: StationSyncPolicy;
  diagnosticUtility: DiagnosticUtility;
  sensitivity: Sensitivity;
  subjectScopes: readonly SubjectScope[];
  lifecycle: Lifecycle;
  volumeCost: VolumeCost;
}

export interface RuntimeEventOrdering {
  ingestionSequence: number;
  sourceSequence?: number;
  sourceByteOffset?: number;
  sourceGeneration?: number;
  sourceChunkSequence?: number;
}

export interface RuntimeEventDerivation {
  reason: string;
  contributingEventIds: readonly string[];
}

export interface RuntimeEvent<TEventType extends RuntimeEventType = RuntimeEventType> {
  eventId: string;
  eventType: TEventType;
  contractVersion: typeof CONTRACT_VERSION;
  sourceTimestamp: string;
  ingestedAt: string;
  environmentKey: string;
  environment: EnvironmentContext;
  gameChannel: ReleaseChannel;
  gameBuild: string;
  sourceLocation: string;
  sourceProfileId: string;
  sourceProfileVersion: string;
  parserVersion: string;
  provenance: Provenance;
  confidence: Confidence;
  correlationIds: Readonly<Record<string, string>>;
  ordering: RuntimeEventOrdering;
  traits: RuntimeEventTraits;
  payload: RuntimeEventPayloadMap[TEventType];
  evidenceReference: EvidenceReference;
  derivation?: RuntimeEventDerivation;
  extensions?: Readonly<Record<string, unknown>>;
}

export type RuntimeEventInput<TEventType extends RuntimeEventType = RuntimeEventType> =
  Omit<RuntimeEvent<TEventType>, 'eventId' | 'contractVersion' | 'traits'> &
  Partial<Pick<RuntimeEvent<TEventType>, 'eventId' | 'contractVersion' | 'traits'>>;

export interface RuntimeEventDefinition<TEventType extends RuntimeEventType = RuntimeEventType> {
  owner: string;
  status: 'mvp';
  summary: string;
  traits: RuntimeEventTraits;
  fixtureId?: string;
  payload: Readonly<Record<keyof RuntimeEventPayloadMap[TEventType], RuntimeEventPayloadField>>;
  examplePayload: RuntimeEventPayloadMap[TEventType];
}

export interface RuntimeEventPayloadField {
  type: 'string' | 'boolean' | 'integer' | 'number';
  required: true;
  enum?: readonly unknown[];
  min?: number;
  max?: number;
}

export const EVENT_TYPE_REGISTRY: Readonly<{
  [TEventType in RuntimeEventType]: RuntimeEventDefinition<TEventType>;
}>;

export const RUNTIME_EVENT_EXAMPLES: Readonly<{
  [TEventType in RuntimeEventType]: RuntimeEvent<TEventType>;
}>;

export interface RuntimeEventValidationProblem {
  code: string;
  path: string;
  message: string;
}

export type RuntimeEventValidationResult<TEventType extends RuntimeEventType = RuntimeEventType> =
  | { ok: true; event: RuntimeEvent<TEventType> }
  | { ok: false; errors: readonly RuntimeEventValidationProblem[] };

export class RuntimeEventValidationError extends Error {
  readonly errors: readonly RuntimeEventValidationProblem[];
}

export interface RuntimeEventPersistenceRecord {
  eventId: string;
  eventType: RuntimeEventType;
  contractVersion: typeof CONTRACT_VERSION;
  environmentKey: string;
  sourceTimestamp: string;
  ingestedAt: string;
  sourceProfileId: string;
  sourceProfileVersion: string;
  parserVersion: string;
  provenance: Provenance;
  confidence: Confidence;
  sensitivity: Sensitivity;
  stationSyncPolicy: StationSyncPolicy;
  serializedEvent: string;
}

export function validateRuntimeEvent(input: unknown): RuntimeEventValidationResult;
export function assertValidRuntimeEvent<TEventType extends RuntimeEventType>(
  input: unknown
): RuntimeEvent<TEventType>;
export function createRuntimeEvent<TEventType extends RuntimeEventType>(
  input: RuntimeEventInput<TEventType>
): RuntimeEvent<TEventType>;
export function deriveEnvironmentContext(input?: {
  releaseChannel?: string;
  universe?: string;
  environmentName?: string;
  rawEnvironmentTag?: string;
  branch?: string;
  buildVersion?: string;
  gameBuild?: string;
  changelist?: string;
  databaseVersion?: string;
  sourceInstallationId?: string;
  sourceLocation?: string;
  observedAt?: string;
  confidence?: Confidence;
  evidenceReference?: EvidenceReference;
}): EnvironmentContext;
export function deriveEnvironmentKey(input?: {
  releaseChannel?: string;
  universe?: string;
  buildVersion?: string;
  gameBuild?: string;
  branch?: string;
  sourceInstallationId?: string;
}): string;
export function deriveSourceInstallationId(sourceLocation?: string): string;
export function createPartitionedIdentity(
  environmentKey: string,
  namespace: string,
  parts?: readonly unknown[]
): string;
export function assertSameEnvironment(
  leftEnvironmentKey: string,
  rightEnvironmentKey: string,
  message?: string
): string;
export function serializeRuntimeEvent(input: unknown): string;
export function deserializeRuntimeEvent(serialized: string): RuntimeEvent;
export function toPersistenceRecord(input: unknown): RuntimeEventPersistenceRecord;
export function deriveRuntimeEventId(input: Partial<RuntimeEvent>): string;
export function createRuntimeEventOrderKey(input: Partial<RuntimeEvent>): string;
export function compareRuntimeEventOrder(left: Partial<RuntimeEvent>, right: Partial<RuntimeEvent>): -1 | 0 | 1;
