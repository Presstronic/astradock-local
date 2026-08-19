const PROFILE_SCHEMA_VERSION = 1;
const SC_49_PROFILE_VERSION = 'draft-2026-08-19.2';

const SC_49_FIELD_ALIASES = Object.freeze({
  accountId: ['accountId', 'account_id', 'citizenId'],
  branch: ['Branch'],
  cause: ['cause'],
  changelist: ['Changelist'],
  characterGeid: ['geid', 'characterGEID'],
  config: ['Config'],
  dataCoreVersion: ['dataCore'],
  endpoint: ['address', 'remoteAddr'],
  environmentName: ['Environment'],
  exitCode: ['exitCode'],
  fileVersion: ['FileVersion'],
  gamerules: ['gamerules', 'rules'],
  handle: ['handle', 'nickname'],
  locationId: ['locationId'],
  matchmakingStatus: ['status'],
  loginSessionId: ['LoginSessionId'],
  message: ['Message'],
  observedNodeId: ['node_id'],
  notificationId: ['NotificationId'],
  nodeId: ['node_id'],
  partyId: ['partyId'],
  playerGeid: ['playerGEID'],
  port: ['port'],
  productVersion: ['ProductVersion'],
  reason: ['reason', 'RequestFrontEndReason'],
  releaseChannel: ['Tag', 'releaseChannel', 'environment'],
  shard: ['shard'],
  sourceLocation: ['SourcePath'],
  uptimeSeconds: ['uptime_secs']
});

const SC_49_EXTRACTORS = Object.freeze([
  {
    id: 'build.file-version',
    kind: 'rememberBuildField',
    field: 'fileVersion',
    literals: ['FileVersion:'],
    evidenceMarkers: ['FileVersion:']
  },
  {
    id: 'build.product-version',
    kind: 'rememberBuildField',
    field: 'productVersion',
    literals: ['ProductVersion:'],
    evidenceMarkers: ['ProductVersion:']
  },
  {
    id: 'build.branch',
    kind: 'rememberBuildField',
    field: 'branch',
    literals: ['Branch:'],
    evidenceMarkers: ['Branch:']
  },
  {
    id: 'build.changelist',
    kind: 'clientBuildObserved',
    eventType: 'ClientBuildObserved',
    literals: ['Changelist:'],
    requiredFields: ['fileVersion', 'productVersion', 'branch', 'changelist'],
    confidence: 'high',
    sensitivity: 'local',
    evidenceMarkers: ['FileVersion:', 'ProductVersion:', 'Branch:', 'Changelist:'],
    dedupeFields: ['fileVersion', 'productVersion', 'branch', 'changelist']
  },
  {
    id: 'environment.init',
    kind: 'releaseEnvironmentObserved',
    eventType: 'ReleaseEnvironmentObserved',
    literals: ['<Init>', 'Environment[', 'Tag['],
    requiredFields: ['releaseChannel', 'environmentName', 'config', 'sourceLocation'],
    confidence: 'high',
    sensitivity: 'local',
    evidenceMarkers: ['<Init>', 'Environment[', 'Tag['],
    dedupeFields: ['releaseChannel', 'environmentName', 'config', 'sourceLocation']
  },
  {
    id: 'environment.game-version',
    kind: 'rememberGameVersion',
    literals: ['<Game Version>'],
    evidenceMarkers: ['<Game Version>']
  },
  {
    id: 'environment.database-version',
    kind: 'gameDataVersionObserved',
    eventType: 'GameDataVersionObserved',
    literals: ['<SetDatabaseVersion>'],
    requiredFields: ['gameVersion', 'dataCoreVersion', 'archetypeVersion', 'componentVersion'],
    confidence: 'high',
    sensitivity: 'local',
    evidenceMarkers: ['<Game Version>', '<SetDatabaseVersion>'],
    dedupeFields: ['gameVersion', 'dataCoreVersion', 'archetypeVersion', 'componentVersion']
  },
  {
    id: 'identity.login-started',
    kind: 'loginStarted',
    eventType: 'LoginStarted',
    literals: ['<InitiateLogin>'],
    requiredFields: ['loginSessionId', 'releaseChannel'],
    confidence: 'high',
    sensitivity: 'personal',
    evidenceMarkers: ['<InitiateLogin>'],
    dedupeFields: ['loginSessionId']
  },
  {
    id: 'identity.account-authenticated',
    kind: 'accountAuthenticated',
    eventType: 'AccountAuthenticated',
    literals: ['<Legacy login response>'],
    requiredFields: ['handle', 'accountId'],
    confidence: 'high',
    sensitivity: 'personal',
    evidenceMarkers: ['<Legacy login response>'],
    dedupeFields: ['handle', 'accountId']
  },
  {
    id: 'identity.character-fragment',
    kind: 'rememberCharacterIdentity',
    literals: ['<AccountLoginCharacterStatus_Character>'],
    evidenceMarkers: ['<AccountLoginCharacterStatus_Character>']
  },
  {
    id: 'identity.incoming-connection',
    kind: 'identityObserved',
    eventType: 'IdentityObserved',
    literals: ['<Expect Incoming Connection>'],
    requiredFields: ['characterName', 'accountId', 'characterGeid', 'playerGeid', 'nodeId', 'clientSession'],
    confidence: 'high',
    sensitivity: 'personal',
    evidenceMarkers: ['<AccountLoginCharacterStatus_Character>', '<Expect Incoming Connection>'],
    dedupeFields: ['accountId', 'characterGeid', 'playerGeid', 'clientSession']
  },
  {
    id: 'pu.matchmaking-request',
    kind: 'matchmakingStatusObserved',
    eventType: 'MatchmakingStatusObserved',
    literals: ['{Join PU}'],
    requiredFields: ['matchmakingRequestId', 'matchmakingStatus', 'port'],
    confidence: 'high',
    sensitivity: 'local',
    evidenceMarkers: ['{Join PU}']
  },
  {
    id: 'pu.join-requested',
    kind: 'puJoinRequested',
    eventType: 'PuJoinRequested',
    literals: ['<Join PU>'],
    requiredFields: ['matchmakingRequestId', 'shard', 'endpoint', 'port', 'locationId'],
    confidence: 'high',
    sensitivity: 'local',
    evidenceMarkers: ['{Join PU}', '<Join PU>'],
    dedupeFields: ['matchmakingRequestId', 'shard', 'endpoint', 'port', 'locationId']
  },
  {
    id: 'connection.channel-created',
    kind: 'rememberChannelCreated',
    literals: ['<Channel Created>'],
    evidenceMarkers: ['<Channel Created>']
  },
  {
    id: 'connection.complete',
    kind: 'puReplicationConnectionEstablished',
    eventType: 'PuReplicationConnectionEstablished',
    literals: ['<Channel Connection Complete>', 'hostType="Replicant"'],
    requiredFields: ['endpoint', 'port', 'observedNodeId', 'playerGeid', 'gamerules', 'hostType'],
    confidence: 'high',
    sensitivity: 'local',
    evidenceMarkers: ['<Channel Created>', '<Channel Connection Complete>'],
    dedupeFields: ['endpoint', 'port', 'observedNodeId', 'playerGeid', 'gamerules', 'hostType']
  },
  {
    id: 'mesh.universe-hierarchy-start',
    kind: 'rememberUniverseHierarchyStart',
    literals: ['<RegisterUniverseHierarchy_Begin>'],
    evidenceMarkers: ['<RegisterUniverseHierarchy_Begin>']
  },
  {
    id: 'mesh.universe-hierarchy-complete',
    kind: 'universeHierarchyRegistered',
    eventType: 'UniverseHierarchyRegistered',
    literals: ['<RegisterUniverseHierarchy_End>'],
    requiredFields: ['receivedFromNetwork', 'nodeCount', 'durationMs'],
    confidence: 'high',
    sensitivity: 'local',
    evidenceMarkers: ['<RegisterUniverseHierarchy_Begin>', '<RegisterUniverseHierarchy_End>'],
    dedupeFields: ['receivedFromNetwork', 'nodeCount']
  },
  {
    id: 'mesh.pu-territory-setup-complete',
    kind: 'puTerritorySetupCompleted',
    eventType: 'PuTerritorySetupCompleted',
    literals: ['<ContextEstablisherTaskFinished>', 'taskname="SetupTerritories"', 'gamerules="SC_Default"', 'status="Finished"'],
    requiredFields: ['gamerules', 'status', 'runningTimeSeconds'],
    confidence: 'high',
    sensitivity: 'local',
    evidenceMarkers: ['SetupTerritories', 'SC_Default', 'Finished'],
    dedupeFields: ['gamerules', 'status']
  },
  {
    id: 'pu.entered',
    kind: 'puEntered',
    eventType: 'PuEntered',
    literals: ['OnClientEnteredGame', 'eCVS_InGame', 'Finished'],
    requiredFields: ['gamerules', 'loadDurationSeconds'],
    confidence: 'high',
    sensitivity: 'local',
    evidenceMarkers: ['OnClientEnteredGame', 'eCVS_InGame', 'Finished'],
    dedupeFields: ['gamerules', 'loadDurationSeconds']
  },
  {
    id: 'pu.game-mode-created',
    kind: 'rememberPuGameModeCreated',
    literals: ['GameRulesActionEvent_GameModeCreated', 'Game mode created'],
    evidenceMarkers: ['GameRulesActionEvent_GameModeCreated', 'Game mode created']
  },
  {
    id: 'pu.entered-local-telemetry',
    kind: 'puEnteredFromLocalTelemetry',
    eventType: 'PuEntered',
    literals: ['<Initializing Game Telemetry>', 'local player'],
    requiredFields: ['gamerules', 'loadDurationSeconds'],
    confidence: 'high',
    sensitivity: 'local',
    evidenceMarkers: ['SetupTerritories', 'GameModeCreated', 'Initializing Game Telemetry', 'local player'],
    dedupeFields: ['gamerules', 'loadDurationSeconds']
  },
  {
    id: 'disconnect.channel',
    kind: 'puDisconnected',
    eventType: 'PuDisconnected',
    literals: ['<Channel Disconnected>'],
    requiredFields: ['cause', 'reason', 'isRemote', 'endpoint', 'uptimeSeconds'],
    confidence: 'high',
    sensitivity: 'local',
    evidenceMarkers: ['<Channel Disconnected>'],
    dedupeFields: ['endpoint', 'cause', 'reason']
  },
  {
    id: 'frontend.reason',
    kind: 'rememberFrontendReason',
    literals: ['RequestFrontEndReason'],
    evidenceMarkers: ['RequestFrontEndReason']
  },
  {
    id: 'frontend.returned',
    kind: 'returnedToFrontend',
    eventType: 'ReturnedToFrontend',
    literals: ['<Channel Created>', 'frontend'],
    requiredFields: ['reason'],
    confidence: 'high',
    sensitivity: 'local',
    evidenceMarkers: ['RequestFrontEndReason', '<Channel Created>'],
    dedupeFields: ['reason']
  },
  {
    id: 'application.system-quit',
    kind: 'applicationExited',
    eventType: 'ApplicationExited',
    literals: ['<SystemQuit>'],
    requiredFields: ['cause', 'reason', 'exitCode', 'clean'],
    confidence: 'high',
    sensitivity: 'local',
    evidenceMarkers: ['<SystemQuit>'],
    dedupeFields: ['cause', 'reason', 'exitCode']
  },
  {
    id: 'party.created',
    kind: 'partyCreated',
    eventType: 'PartyCreated',
    literals: ['PartyCreated'],
    requiredFields: ['partyId', 'leaderHandle'],
    confidence: 'medium',
    sensitivity: 'social',
    evidenceMarkers: ['PartyCreated'],
    dedupeFields: ['partyId']
  },
  {
    id: 'party.notification-launch',
    kind: 'partyLaunchInitiated',
    eventType: 'PartyLaunchInitiated',
    literals: ['<SHUDEvent_OnNotification>', 'Party launch initiated.'],
    requiredFields: ['notificationId', 'message'],
    confidence: 'medium',
    sensitivity: 'social',
    evidenceMarkers: ['<SHUDEvent_OnNotification>', 'Party launch initiated.'],
    dedupeFields: ['notificationId', 'message']
  },
  {
    id: 'party.notification-member-connected',
    kind: 'partyMemberConnected',
    eventType: 'PartyMemberConnected',
    literals: ['<SHUDEvent_OnNotification>', ' connected.'],
    requiredFields: ['notificationId', 'memberHandle'],
    confidence: 'medium',
    sensitivity: 'social',
    evidenceMarkers: ['<SHUDEvent_OnNotification>', 'connected.'],
    dedupeFields: ['notificationId', 'memberHandle']
  },
  {
    id: 'party.left-local',
    kind: 'partyLeft',
    eventType: 'PartyLeft',
    literals: ['<Leave group>', 'Client ', ' leave group '],
    requiredFields: ['partyId', 'playerGeid', 'reason'],
    confidence: 'high',
    sensitivity: 'social',
    evidenceMarkers: ['<Leave group>'],
    dedupeFields: ['partyId', 'playerGeid', 'reason']
  },
  {
    id: 'zone.jurisdiction-entered',
    kind: 'jurisdictionEntered',
    eventType: 'JurisdictionEntered',
    literals: ['<SHUDEvent_OnNotification>', 'Entered ', ' Jurisdiction'],
    requiredFields: ['notificationId', 'jurisdiction'],
    confidence: 'high',
    sensitivity: 'local',
    evidenceMarkers: ['Entered', 'Jurisdiction'],
    dedupeFields: ['notificationId', 'jurisdiction']
  },
  {
    id: 'zone.monitored-entered',
    kind: 'monitoredSpaceEntered',
    eventType: 'MonitoredSpaceEntered',
    literals: ['<SHUDEvent_OnNotification>', 'Entered Monitored Space'],
    requiredFields: ['notificationId', 'state'],
    confidence: 'high',
    sensitivity: 'local',
    evidenceMarkers: ['Entered Monitored Space'],
    dedupeFields: ['notificationId', 'state']
  },
  {
    id: 'zone.monitored-exited',
    kind: 'monitoredSpaceExited',
    eventType: 'MonitoredSpaceExited',
    literals: ['<SHUDEvent_OnNotification>', 'Exited Monitored Space'],
    requiredFields: ['notificationId', 'state'],
    confidence: 'high',
    sensitivity: 'local',
    evidenceMarkers: ['Exited Monitored Space'],
    dedupeFields: ['notificationId', 'state']
  },
  {
    id: 'zone.armistice-entered',
    kind: 'armisticeStateChanged',
    eventType: 'ArmisticeStateChanged',
    state: 'entered',
    literals: ['<SHUDEvent_OnNotification>', 'Entering Armistice Zone'],
    requiredFields: ['notificationId', 'state'],
    confidence: 'high',
    sensitivity: 'local',
    evidenceMarkers: ['Entering Armistice Zone'],
    dedupeFields: ['notificationId', 'state']
  },
  {
    id: 'zone.armistice-left',
    kind: 'armisticeStateChanged',
    eventType: 'ArmisticeStateChanged',
    state: 'left',
    literals: ['<SHUDEvent_OnNotification>', 'Leaving Armistice Zone'],
    requiredFields: ['notificationId', 'state'],
    confidence: 'high',
    sensitivity: 'local',
    evidenceMarkers: ['Leaving Armistice Zone'],
    dedupeFields: ['notificationId', 'state']
  }
]);

const BUILT_IN_RUNTIME_LOG_PROFILES = Object.freeze([
  {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    id: 'sc-4.9-live',
    version: SC_49_PROFILE_VERSION,
    priority: 100,
    compatibility: {
      releaseChannels: ['LIVE'],
      gameBuildPrefixes: ['4.9.0-LIVE.', '4.9.188.', 'UNKNOWN_BUILD']
    },
    parserVersion: 'runtime-log-parser/0.1.0',
    fieldAliases: SC_49_FIELD_ALIASES,
    knownLimitations: [
      'Supports only fixture-promoted runtime-event/v1 patterns.',
      'Executable-version compatibility is limited to reviewed 4.9.0-LIVE and 4.9.188 LIVE families.',
      'Does not infer mission, destination, travel, or deferred party lifecycle events.'
    ],
    extractors: SC_49_EXTRACTORS
  },
  {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    id: 'sc-4.9-cross-env',
    version: SC_49_PROFILE_VERSION,
    priority: 90,
    compatibility: {
      releaseChannels: ['LIVE', 'PTU', 'EPTU', 'HOTFIX'],
      gameBuildPrefixes: ['4.9.0-']
    },
    parserVersion: 'runtime-log-parser/0.1.0',
    fieldAliases: SC_49_FIELD_ALIASES,
    knownLimitations: [
      'Intended for fixture isolation and compatibility diagnostics across multiple release channels.',
      'Supports the same promoted event families as sc-4.9-live.'
    ],
    extractors: SC_49_EXTRACTORS
  }
]);

module.exports = {
  BUILT_IN_RUNTIME_LOG_PROFILES,
  PROFILE_SCHEMA_VERSION
};
