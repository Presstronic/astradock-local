const crypto = require('node:crypto');

const CONTRACT_VERSION = 'runtime-event/v1';
const UNKNOWN_ENVIRONMENT_VALUE = 'UNKNOWN';

const ENUMS = Object.freeze({
  releaseChannel: ['LIVE', 'PTU', 'EPTU', 'HOTFIX', 'UNKNOWN'],
  universe: ['PU', 'UNKNOWN'],
  provenance: ['observed', 'extracted', 'inferred', 'enriched'],
  confidence: ['confirmed', 'high', 'medium', 'low', 'unknown'],
  sensitivity: ['public', 'local', 'personal', 'social', 'secret'],
  temporalUtility: ['live', 'near_real_time', 'session_summary', 'long_term_history'],
  persistenceScope: ['ephemeral', 'session', 'durable'],
  stationSyncPolicy: ['never', 'eligible_with_consent', 'required_for_enabled_feature'],
  diagnosticUtility: ['none', 'operational', 'parser_drift', 'game_bug', 'support_bundle'],
  subjectScope: [
    'local_player',
    'other_player',
    'party',
    'session',
    'shard',
    'server_connection',
    'installation',
    'game_build'
  ],
  lifecycle: ['event', 'state', 'snapshot', 'metric', 'definition'],
  volumeCost: ['low', 'moderate', 'high', 'bulk'],
  evidenceKind: ['application', 'fixture', 'runtime_log', 'diagnostic']
});

function traits(overrides = {}) {
  return Object.freeze({
    temporalUtility: 'near_real_time',
    persistence: Object.freeze({ scope: 'durable', retention: '30d' }),
    stationSyncPolicy: 'never',
    diagnosticUtility: 'operational',
    sensitivity: 'local',
    subjectScopes: Object.freeze(['session']),
    lifecycle: 'event',
    volumeCost: 'low',
    ...overrides
  });
}

function field(type, options = {}) {
  return Object.freeze({ type, required: true, ...options });
}

const STRING = 'string';
const BOOLEAN = 'boolean';
const INTEGER = 'integer';
const NUMBER = 'number';

const RUNTIME_EVENT_ENVELOPE_FIELDS = Object.freeze([
  'contractVersion',
  'correlationIds',
  'confidence',
  'derivation',
  'environment',
  'environmentKey',
  'eventId',
  'eventType',
  'evidenceReference',
  'extensions',
  'gameBuild',
  'gameChannel',
  'ingestedAt',
  'ordering',
  'parserVersion',
  'payload',
  'provenance',
  'sourceLocation',
  'sourceProfileId',
  'sourceProfileVersion',
  'sourceTimestamp',
  'traits'
]);

const EVENT_TYPE_REGISTRY = deepFreeze({
  RuntimeSourceDiscovered: {
    owner: 'runtime-telemetry',
    status: 'mvp',
    summary: 'A supported or candidate runtime log source was discovered.',
    traits: traits({ subjectScopes: ['installation'], diagnosticUtility: 'operational' }),
    payload: {
      sourceLocation: field(STRING),
      sourceKind: field(STRING, { enum: ['game_log'] }),
      discoveryMethod: field(STRING, { enum: ['automatic', 'user_selected', 'restored_setting'] }),
      supported: field(BOOLEAN)
    },
    examplePayload: {
      sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log',
      sourceKind: 'game_log',
      discoveryMethod: 'automatic',
      supported: true
    }
  },
  RuntimeSourceSelected: {
    owner: 'runtime-telemetry',
    status: 'mvp',
    summary: 'The active runtime log source was selected.',
    traits: traits({ subjectScopes: ['installation'], diagnosticUtility: 'operational' }),
    payload: {
      sourceLocation: field(STRING),
      selectionMethod: field(STRING, { enum: ['automatic', 'user_selected', 'restored_setting'] })
    },
    examplePayload: {
      sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log',
      selectionMethod: 'user_selected'
    }
  },
  RuntimeMonitorStarted: {
    owner: 'runtime-telemetry',
    status: 'mvp',
    summary: 'The runtime monitor started observing an approved source.',
    traits: traits({ subjectScopes: ['installation', 'session'], diagnosticUtility: 'operational' }),
    payload: {
      sourceLocation: field(STRING),
      startMode: field(STRING, { enum: ['from_current_end', 'from_checkpoint', 'from_beginning'] })
    },
    examplePayload: {
      sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log',
      startMode: 'from_checkpoint'
    }
  },
  RuntimeMonitorStopped: {
    owner: 'runtime-telemetry',
    status: 'mvp',
    summary: 'The runtime monitor stopped observing the active source.',
    traits: traits({ subjectScopes: ['installation', 'session'], diagnosticUtility: 'operational' }),
    payload: {
      sourceLocation: field(STRING),
      reason: field(STRING, { enum: ['user_requested', 'source_changed', 'application_shutdown', 'runtime_error'] })
    },
    examplePayload: {
      sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log',
      reason: 'application_shutdown'
    }
  },
  RuntimeSourceUnavailable: {
    owner: 'runtime-telemetry',
    status: 'mvp',
    summary: 'The approved runtime source could not be read or no longer exists.',
    traits: traits({
      subjectScopes: ['installation', 'session'],
      diagnosticUtility: 'operational'
    }),
    payload: {
      sourceLocation: field(STRING),
      reason: field(STRING, { enum: ['missing', 'permission_denied', 'locked', 'rotated', 'unsupported'] }),
      recoverable: field(BOOLEAN)
    },
    examplePayload: {
      sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log',
      reason: 'rotated',
      recoverable: true
    }
  },
  ParserCompatibilityStatusObserved: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'Parser/profile compatibility status was evaluated for the active runtime source.',
    traits: traits({
      temporalUtility: 'near_real_time',
      persistence: { scope: 'durable', retention: '30d' },
      diagnosticUtility: 'parser_drift',
      sensitivity: 'local',
      subjectScopes: ['installation', 'game_build', 'session'],
      lifecycle: 'state',
      volumeCost: 'low'
    }),
    payload: {
      status: field(STRING, { enum: ['compatible', 'unsupported_profile', 'suspected_drift'] }),
      profileId: field(STRING),
      profileVersion: field(STRING),
      reason: field(STRING),
      recordsSeen: field(INTEGER, { min: 0 }),
      knownEventsEmitted: field(INTEGER, { min: 0 }),
      unknownRecords: field(INTEGER, { min: 0 }),
      unknownSampleCount: field(INTEGER, { min: 0 }),
      droppedUnknownSamples: field(INTEGER, { min: 0 })
    },
    examplePayload: {
      status: 'compatible',
      profileId: 'sc-4.9-live',
      profileVersion: 'draft-2026-08-11',
      reason: 'profile_compatible',
      recordsSeen: 42,
      knownEventsEmitted: 7,
      unknownRecords: 4,
      unknownSampleCount: 2,
      droppedUnknownSamples: 0
    }
  },
  ParserDriftSuspected: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'The parser observed enough unmatched evidence to suspect profile drift.',
    traits: traits({
      temporalUtility: 'near_real_time',
      persistence: { scope: 'durable', retention: '30d' },
      diagnosticUtility: 'parser_drift',
      sensitivity: 'local',
      subjectScopes: ['installation', 'game_build', 'session'],
      lifecycle: 'event',
      volumeCost: 'low'
    }),
    payload: {
      profileId: field(STRING),
      profileVersion: field(STRING),
      reason: field(STRING),
      recordsSeen: field(INTEGER, { min: 0 }),
      knownEventsEmitted: field(INTEGER, { min: 0 }),
      unknownRecords: field(INTEGER, { min: 0 }),
      unknownRatio: field(NUMBER, { min: 0, max: 1 })
    },
    examplePayload: {
      profileId: 'sc-4.9-live',
      profileVersion: 'draft-2026-08-11',
      reason: 'high_unknown_ratio',
      recordsSeen: 50,
      knownEventsEmitted: 0,
      unknownRecords: 48,
      unknownRatio: 0.96
    }
  },
  ClientBuildObserved: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'The game client build and branch were observed.',
    traits: traits({
      temporalUtility: 'session_summary',
      sensitivity: 'local',
      subjectScopes: ['game_build', 'installation']
    }),
    fixtureId: 'live/4.9-pub/sc-4.9-live/spine/client-build-environment.observed',
    payload: {
      fileVersion: field(STRING),
      productVersion: field(STRING),
      branch: field(STRING),
      changelist: field(STRING)
    },
    examplePayload: {
      fileVersion: '4.9.0-LIVE.9000000-SYNTH',
      productVersion: '4.9.0-LIVE.9000000-SYNTH',
      branch: 'sc-alpha-4.9-live-synth',
      changelist: 'SYNTH_CHANGE_9000000'
    }
  },
  ReleaseEnvironmentObserved: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'The release channel, deployment environment, and runtime config were observed.',
    traits: traits({
      temporalUtility: 'session_summary',
      sensitivity: 'local',
      subjectScopes: ['game_build', 'installation']
    }),
    fixtureId: 'live/4.9-pub/sc-4.9-live/spine/client-build-environment.observed',
    payload: {
      releaseChannel: field(STRING, { enum: ENUMS.releaseChannel }),
      environmentName: field(STRING),
      config: field(STRING),
      sourceLocation: field(STRING)
    },
    examplePayload: {
      releaseChannel: 'LIVE',
      environmentName: 'PUB',
      config: 'Shipping',
      sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log'
    }
  },
  GameDataVersionObserved: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'Runtime game-data version fingerprints were observed.',
    traits: traits({
      temporalUtility: 'session_summary',
      sensitivity: 'local',
      subjectScopes: ['game_build', 'installation']
    }),
    fixtureId: 'live/4.9-pub/sc-4.9-live/spine/client-build-environment.observed',
    payload: {
      gameVersion: field(STRING),
      dataCoreVersion: field(STRING),
      archetypeVersion: field(STRING),
      componentVersion: field(STRING)
    },
    examplePayload: {
      gameVersion: '4.9.0-LIVE.9000000-SYNTH',
      dataCoreVersion: 'SYNTH_DATACORE_4_9',
      archetypeVersion: 'SYNTH_ARCHETYPE_4_9',
      componentVersion: 'SYNTH_COMPONENT_4_9'
    }
  },
  LoginStarted: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'A local player login attempt started.',
    traits: traits({ subjectScopes: ['local_player', 'session'], sensitivity: 'personal' }),
    fixtureId: 'live/4.9-pub/sc-4.9-live/spine/local-identity-login.observed',
    payload: {
      loginSessionId: field(STRING),
      releaseChannel: field(STRING, { enum: ENUMS.releaseChannel })
    },
    examplePayload: {
      loginSessionId: 'SYNTH_LOGIN_SESSION_LOCAL',
      releaseChannel: 'LIVE'
    }
  },
  AccountAuthenticated: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'The local account identity authenticated.',
    traits: traits({ subjectScopes: ['local_player'], sensitivity: 'personal' }),
    fixtureId: 'live/4.9-pub/sc-4.9-live/spine/local-identity-login.observed',
    payload: {
      handle: field(STRING),
      accountId: field(STRING)
    },
    examplePayload: {
      handle: 'SYNTH_HANDLE_LOCAL',
      accountId: 'SYNTH_ACCOUNT_LOCAL'
    }
  },
  IdentityObserved: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'Local player identity identifiers were observed without collapsing them.',
    traits: traits({ subjectScopes: ['local_player'], sensitivity: 'personal' }),
    fixtureId: 'live/4.9-pub/sc-4.9-live/spine/local-identity-login.observed',
    payload: {
      characterName: field(STRING),
      accountId: field(STRING),
      characterGeid: field(STRING),
      playerGeid: field(STRING),
      nodeId: field(STRING),
      clientSession: field(STRING)
    },
    examplePayload: {
      characterName: 'SYNTH_HANDLE_LOCAL',
      accountId: 'SYNTH_ACCOUNT_LOCAL',
      characterGeid: 'SYNTH_CHARACTER_GEID_LOCAL',
      playerGeid: 'SYNTH_PLAYER_GEID_LOCAL',
      nodeId: 'SYNTH_NODE_FRONTEND',
      clientSession: 'SYNTH_CLIENT_SESSION_A'
    }
  },
  MatchmakingStatusObserved: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'A PU matchmaking request status was observed.',
    traits: traits({ subjectScopes: ['local_player', 'session'] }),
    fixtureId: 'live/4.9-pub/sc-4.9-live/spine/pu-join-shard-server.observed',
    payload: {
      matchmakingRequestId: field(STRING),
      matchmakingStatus: field(STRING),
      port: field(INTEGER, { min: 1, max: 65535 })
    },
    examplePayload: {
      matchmakingRequestId: 'SYNTH_MATCHMAKING_REQUEST_A',
      matchmakingStatus: 'Queued',
      port: 64090
    }
  },
  PuJoinRequested: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'A PU join and matchmaking result were observed.',
    traits: traits({ subjectScopes: ['local_player', 'session', 'shard', 'server_connection'] }),
    fixtureId: 'live/4.9-pub/sc-4.9-live/spine/pu-join-shard-server.observed',
    payload: {
      matchmakingRequestId: field(STRING),
      shard: field(STRING),
      endpoint: field(STRING),
      port: field(INTEGER, { min: 1, max: 65535 }),
      locationId: field(STRING)
    },
    examplePayload: {
      matchmakingRequestId: 'SYNTH_MATCHMAKING_REQUEST_A',
      shard: 'SYNTH_SHARD_STANTON_US_EAST_A',
      endpoint: 'game-server-alpha.example.invalid',
      port: 64090,
      locationId: 'SYNTH_LOCATION_STANTON_A'
    }
  },
  PuReplicationConnectionEstablished: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'A PU Replicant transport connection was established.',
    traits: traits({ subjectScopes: ['local_player', 'session', 'server_connection'] }),
    fixtureId: 'live/4.9-pub/sc-4.9-live/spine/pu-join-shard-server.observed',
    payload: {
      endpoint: field(STRING),
      port: field(INTEGER, { min: 1, max: 65535 }),
      observedNodeId: field(STRING),
      playerGeid: field(STRING),
      gamerules: field(STRING),
      hostType: field(STRING, { enum: ['Replicant'] })
    },
    examplePayload: {
      endpoint: 'replicant-alpha.example.invalid',
      port: 64090,
      observedNodeId: 'SYNTH_OBSERVED_GATEWAY_NODE_PU',
      playerGeid: 'SYNTH_PLAYER_GEID_LOCAL',
      gamerules: 'SC_Default',
      hostType: 'Replicant'
    }
  },
  UniverseHierarchyRegistered: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'The client completed registration of a universe hierarchy received from the network.',
    traits: traits({ subjectScopes: ['session', 'shard'], persistence: { scope: 'session', retention: '30d' } }),
    fixtureId: 'live/4.9-pub/sc-4.9-live/mesh/pu-replicant-hierarchy-territory.observed',
    payload: {
      receivedFromNetwork: field(BOOLEAN),
      nodeCount: field(INTEGER, { min: 1 }),
      durationMs: field(INTEGER, { min: 0 })
    },
    examplePayload: {
      receivedFromNetwork: true,
      nodeCount: 197018,
      durationMs: 9175
    }
  },
  PuTerritorySetupCompleted: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'The PU replication context completed territory setup.',
    traits: traits({ subjectScopes: ['session', 'shard'], persistence: { scope: 'session', retention: '30d' } }),
    fixtureId: 'live/4.9-pub/sc-4.9-live/mesh/pu-replicant-hierarchy-territory.observed',
    payload: {
      gamerules: field(STRING, { enum: ['SC_Default'] }),
      status: field(STRING, { enum: ['Finished'] }),
      runningTimeSeconds: field(NUMBER, { min: 0 })
    },
    examplePayload: {
      gamerules: 'SC_Default',
      status: 'Finished',
      runningTimeSeconds: 0.000013
    }
  },
  PuEntered: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'The local player entered the PU after loading.',
    traits: traits({ subjectScopes: ['local_player', 'session'] }),
    fixtureId: 'live/4.9-pub/sc-4.9-live/spine/pu-join-shard-server.observed',
    payload: {
      gamerules: field(STRING),
      loadDurationSeconds: field(NUMBER, { min: 0 })
    },
    examplePayload: {
      gamerules: 'SC_Default',
      loadDurationSeconds: 12
    }
  },
  PuDisconnected: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'The PU/server connection disconnected.',
    traits: traits({ subjectScopes: ['local_player', 'session', 'server_connection'] }),
    fixtureId: 'live/4.9-pub/sc-4.9-live/spine/disconnect-frontend-clean-exit.observed',
    payload: {
      cause: field(STRING),
      reason: field(STRING),
      isRemote: field(BOOLEAN),
      endpoint: field(STRING),
      uptimeSeconds: field(NUMBER, { min: 0 })
    },
    examplePayload: {
      cause: 'SYNTH_CAUSE_REMOTE_IDLE',
      reason: 'SYNTH_REASON_REMOTE_TIMEOUT',
      isRemote: true,
      endpoint: 'game-server-alpha.example.invalid',
      uptimeSeconds: 3900
    }
  },
  ReturnedToFrontend: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'The client returned to the frontend after a PU session.',
    traits: traits({ subjectScopes: ['local_player', 'session'] }),
    fixtureId: 'live/4.9-pub/sc-4.9-live/spine/disconnect-frontend-clean-exit.observed',
    payload: {
      reason: field(STRING)
    },
    examplePayload: {
      reason: 'OnLobbyPostGameUnload'
    }
  },
  ApplicationExited: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'The game application exited.',
    traits: traits({ temporalUtility: 'session_summary', subjectScopes: ['session', 'installation'] }),
    fixtureId: 'live/4.9-pub/sc-4.9-live/spine/disconnect-frontend-clean-exit.observed',
    payload: {
      cause: field(STRING),
      reason: field(STRING),
      exitCode: field(INTEGER),
      clean: field(BOOLEAN)
    },
    examplePayload: {
      cause: 'SYNTH_CAUSE_USER_EXIT',
      reason: 'SYNTH_REASON_NORMAL_QUIT',
      exitCode: 0,
      clean: true
    }
  },
  PartyCreated: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'Direct evidence shows the local player created a party.',
    traits: traits({ subjectScopes: ['local_player', 'party'], sensitivity: 'social' }),
    fixtureId: 'live/4.9-pub/sc-4.9-live/party/party-create-launch-member-connected.observed',
    payload: {
      partyId: field(STRING),
      leaderHandle: field(STRING)
    },
    examplePayload: {
      partyId: 'SYNTH_PARTY_A',
      leaderHandle: 'SYNTH_HANDLE_LOCAL'
    }
  },
  PartyLaunchInitiated: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'Direct party-launch notification evidence was observed.',
    traits: traits({ subjectScopes: ['local_player', 'party'], sensitivity: 'social' }),
    fixtureId: 'live/4.9-pub/sc-4.9-live/party/party-create-launch-member-connected.observed',
    payload: {
      notificationId: field(STRING),
      message: field(STRING)
    },
    examplePayload: {
      notificationId: 'SYNTH_NOTIFICATION_PARTY_LAUNCH',
      message: 'Party launch initiated.'
    }
  },
  PartyMemberConnected: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'Direct evidence shows a named party member connected.',
    traits: traits({ subjectScopes: ['party', 'other_player'], sensitivity: 'social' }),
    fixtureId: 'live/4.9-pub/sc-4.9-live/party/party-create-launch-member-connected.observed',
    payload: {
      notificationId: field(STRING),
      memberHandle: field(STRING)
    },
    examplePayload: {
      notificationId: 'SYNTH_NOTIFICATION_PARTY_MEMBER',
      memberHandle: 'SYNTH_HANDLE_PARTY_MEMBER'
    }
  },
  PartyLeft: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'Direct evidence shows the local player voluntarily left a party.',
    traits: traits({ subjectScopes: ['local_player', 'party'], sensitivity: 'social' }),
    fixtureId: 'live/4.9-pub/sc-4.9-live/party/party-explicit-leave.observed',
    payload: {
      partyId: field(STRING),
      playerGeid: field(STRING),
      reason: field(STRING, { enum: ['voluntary_leave'] })
    },
    examplePayload: {
      partyId: 'SYNTH_PARTY_A',
      playerGeid: 'SYNTH_PLAYER_GEID_LOCAL',
      reason: 'voluntary_leave'
    }
  },
  JurisdictionEntered: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'The local player entered an observed jurisdiction.',
    traits: traits({ subjectScopes: ['local_player', 'session'], sensitivity: 'local' }),
    fixtureId: 'live/4.9-pub/sc-4.9-live/zone/jurisdiction-monitored-armistice.observed',
    payload: {
      notificationId: field(STRING),
      jurisdiction: field(STRING)
    },
    examplePayload: {
      notificationId: 'SYNTH_NOTIFICATION_ZONE_A',
      jurisdiction: 'SYNTH_JURISDICTION_A'
    }
  },
  MonitoredSpaceEntered: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'The local player entered monitored space.',
    traits: traits({ subjectScopes: ['local_player', 'session'], sensitivity: 'local' }),
    fixtureId: 'live/4.9-pub/sc-4.9-live/zone/jurisdiction-monitored-armistice.observed',
    payload: {
      notificationId: field(STRING),
      state: field(STRING, { enum: ['entered'] })
    },
    examplePayload: {
      notificationId: 'SYNTH_NOTIFICATION_MONITORED_A',
      state: 'entered'
    }
  },
  ArmisticeStateChanged: {
    owner: 'runtime-contracts',
    status: 'mvp',
    summary: 'The local player entered or left armistice protection.',
    traits: traits({ subjectScopes: ['local_player', 'session'], sensitivity: 'local' }),
    fixtureId: 'live/4.9-pub/sc-4.9-live/zone/jurisdiction-monitored-armistice.observed',
    payload: {
      notificationId: field(STRING),
      state: field(STRING, { enum: ['entered', 'left'] })
    },
    examplePayload: {
      notificationId: 'SYNTH_NOTIFICATION_ARMISTICE_A',
      state: 'entered'
    }
  }
});

class RuntimeEventValidationError extends Error {
  constructor(errors) {
    super(`Runtime event validation failed: ${errors.map((error) => error.code).join(', ')}`);
    this.name = 'RuntimeEventValidationError';
    this.errors = errors;
  }
}

function validateRuntimeEvent(input) {
  const errors = [];

  if (!isPlainObject(input)) {
    return fail('invalid_type', '$', 'Runtime event must be an object');
  }

  const event = input;
  validateEnvelopeFields(event, '$', errors);

  if (containsForbiddenEvidenceKey(event)) {
    errors.push(error('raw_evidence_forbidden', '$', 'Runtime events must not copy raw evidence'));
  }

  validateRequiredString(event, 'eventId', '$.eventId', errors);
  validateRequiredString(event, 'eventType', '$.eventType', errors);
  validateRequiredString(event, 'contractVersion', '$.contractVersion', errors);

  if (event.contractVersion !== CONTRACT_VERSION) {
    errors.push(error('unsupported_contract_version', '$.contractVersion', 'Unsupported contract version'));
  }

  const definition = EVENT_TYPE_REGISTRY[event.eventType];
  if (!definition) {
    errors.push(error('unknown_event_type', '$.eventType', 'Unknown runtime event type'));
  }

  validateTimestamp(event.sourceTimestamp, '$.sourceTimestamp', errors);
  validateTimestamp(event.ingestedAt, '$.ingestedAt', errors);
  validateRequiredString(event, 'environmentKey', '$.environmentKey', errors);
  validateRequiredString(event, 'gameChannel', '$.gameChannel', errors);
  validateRequiredString(event, 'gameBuild', '$.gameBuild', errors);
  validateRequiredString(event, 'sourceLocation', '$.sourceLocation', errors);
  validateRequiredString(event, 'sourceProfileId', '$.sourceProfileId', errors);
  validateRequiredString(event, 'sourceProfileVersion', '$.sourceProfileVersion', errors);
  validateRequiredString(event, 'parserVersion', '$.parserVersion', errors);
  validateEnum(event.provenance, ENUMS.provenance, '$.provenance', errors);
  validateEnum(event.confidence, ENUMS.confidence, '$.confidence', errors);
  validateStringMap(event.correlationIds, '$.correlationIds', errors);
  validateEnvironmentContext(event.environment, event.environmentKey, '$.environment', errors);
  validateOrdering(event.ordering, '$.ordering', errors);
  validateTraits(event.traits, definition && definition.traits, '$.traits', errors);
  validateEvidenceReference(event.evidenceReference, '$.evidenceReference', errors);

  if (definition) {
    validatePayload(event.payload, definition.payload, '$.payload', errors);
  }

  if (event.provenance === 'inferred') {
    validateDerivation(event.derivation, '$.derivation', errors);
  }

  if (Object.hasOwn(event, 'extensions') && !isPlainObject(event.extensions)) {
    errors.push(error('invalid_extensions', '$.extensions', 'Extensions must be an object'));
  }

  if (typeof event.eventId === 'string' && definition && event.contractVersion === CONTRACT_VERSION) {
    const expectedEventId = deriveRuntimeEventId(event);
    if (event.eventId !== expectedEventId) {
      errors.push(error('invalid_event_id', '$.eventId', 'Event ID does not match canonical identity fields'));
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, event };

  function fail(code, path, message) {
    return { ok: false, errors: [error(code, path, message)] };
  }
}

function assertValidRuntimeEvent(input) {
  const result = validateRuntimeEvent(input);
  if (!result.ok) {
    throw new RuntimeEventValidationError(result.errors);
  }
  return result.event;
}

function createRuntimeEvent(input) {
  if (!isPlainObject(input)) {
    throw new RuntimeEventValidationError([error('invalid_type', '$', 'Runtime event must be an object')]);
  }

  const definition = EVENT_TYPE_REGISTRY[input.eventType];
  const event = {
    contractVersion: CONTRACT_VERSION,
    traits: definition && definition.traits,
    ...input
  };
  event.eventId = deriveRuntimeEventId(event);
  return assertValidRuntimeEvent(event);
}

function deriveEnvironmentContext(input = {}) {
  const releaseChannel = normalizeReleaseChannel(input.releaseChannel || input.rawEnvironmentTag);
  const universe = normalizeUniverse(input.universe);
  const environmentName = normalizeEnvironmentText(input.environmentName);
  const rawEnvironmentTag = normalizeEnvironmentText(input.rawEnvironmentTag || input.releaseChannel);
  const branch = normalizeEnvironmentText(input.branch);
  const buildVersion = normalizeEnvironmentText(input.buildVersion || input.gameBuild, 'UNKNOWN_BUILD');
  const sourceInstallationId = normalizeEnvironmentText(
    input.sourceInstallationId || deriveSourceInstallationId(input.sourceLocation),
    'UNKNOWN_INSTALLATION'
  );
  const observedAt = input.observedAt || new Date(0).toISOString();
  const confidence = input.confidence || deriveEnvironmentConfidence({
    releaseChannel,
    environmentName,
    branch,
    buildVersion
  });
  const evidenceReference = input.evidenceReference || {
    kind: 'application',
    sourceId: 'environment-context',
    sensitivity: 'local',
    evidenceMarkers: ['environment-context:derived']
  };
  const context = {
    environmentKey: deriveEnvironmentKey({
      releaseChannel,
      universe,
      buildVersion,
      branch,
      sourceInstallationId
    }),
    releaseChannel,
    universe,
    environmentName,
    rawEnvironmentTag,
    branch,
    buildVersion,
    sourceInstallationId,
    observedAt,
    confidence,
    evidenceReference
  };

  if (input.changelist) context.changelist = normalizeEnvironmentText(input.changelist);
  if (input.databaseVersion) context.databaseVersion = normalizeEnvironmentText(input.databaseVersion);

  return deepFreeze(context);
}

function deriveEnvironmentKey(input = {}) {
  const parts = [
    normalizeReleaseChannel(input.releaseChannel),
    normalizeUniverse(input.universe),
    normalizeEnvironmentText(input.buildVersion || input.gameBuild, 'UNKNOWN_BUILD'),
    normalizeEnvironmentText(input.branch, UNKNOWN_ENVIRONMENT_VALUE),
    normalizeEnvironmentText(input.sourceInstallationId, 'UNKNOWN_INSTALLATION')
  ];

  return parts.map(encodeEnvironmentKeyPart).join('::');
}

function deriveSourceInstallationId(sourceLocation = '') {
  const normalized = String(sourceLocation || '').trim().replace(/\\/g, '/').toLowerCase();
  if (!normalized) return 'UNKNOWN_INSTALLATION';

  const hash = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  return `src_${hash}`;
}

function createPartitionedIdentity(environmentKey, namespace, parts = []) {
  if (typeof environmentKey !== 'string' || environmentKey.trim() === '') {
    throw new Error('environmentKey is required for partitioned identity');
  }
  if (typeof namespace !== 'string' || !/^[a-z][a-z0-9_]*$/i.test(namespace)) {
    throw new Error('namespace must be an alphanumeric identifier');
  }

  const identity = {
    environmentKey,
    namespace,
    parts: [].concat(parts).map((part) => String(part ?? UNKNOWN_ENVIRONMENT_VALUE))
  };
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(sortForStableSerialization(identity)))
    .digest('hex')
    .slice(0, 24);

  return `${namespace}_${hash}`;
}

function assertSameEnvironment(leftEnvironmentKey, rightEnvironmentKey, message = 'Environment partition mismatch') {
  if (
    typeof leftEnvironmentKey !== 'string' ||
    typeof rightEnvironmentKey !== 'string' ||
    leftEnvironmentKey.trim() === '' ||
    rightEnvironmentKey.trim() === '' ||
    leftEnvironmentKey !== rightEnvironmentKey
  ) {
    throw new Error(message);
  }
  return leftEnvironmentKey;
}

function normalizeReleaseChannel(value) {
  const normalized = normalizeEnvironmentText(value).toUpperCase();
  if (ENUMS.releaseChannel.includes(normalized)) return normalized;
  return UNKNOWN_ENVIRONMENT_VALUE;
}

function normalizeUniverse(value) {
  const normalized = normalizeEnvironmentText(value).toUpperCase();
  if (ENUMS.universe.includes(normalized)) return normalized;
  return UNKNOWN_ENVIRONMENT_VALUE;
}

function serializeRuntimeEvent(input) {
  const event = assertValidRuntimeEvent(input);
  return JSON.stringify(sortForStableSerialization(event));
}

function deserializeRuntimeEvent(serialized) {
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch (_error) {
    throw new RuntimeEventValidationError([error('invalid_json', '$', 'Serialized runtime event must be JSON')]);
  }
  return assertValidRuntimeEvent(parsed);
}

function toPersistenceRecord(input) {
  const event = assertValidRuntimeEvent(input);
  return deepFreeze({
    eventId: event.eventId,
    eventType: event.eventType,
    contractVersion: event.contractVersion,
    environmentKey: event.environmentKey,
    sourceTimestamp: event.sourceTimestamp,
    ingestedAt: event.ingestedAt,
    sourceProfileId: event.sourceProfileId,
    sourceProfileVersion: event.sourceProfileVersion,
    parserVersion: event.parserVersion,
    provenance: event.provenance,
    confidence: event.confidence,
    sensitivity: event.traits.sensitivity,
    stationSyncPolicy: event.traits.stationSyncPolicy,
    serializedEvent: serializeRuntimeEvent(event)
  });
}

function createRuntimeEventOrderKey(input) {
  const sourceTimestampMs = timestampToMillis(input.sourceTimestamp);
  const ordering = isPlainObject(input.ordering) ? input.ordering : {};
  return [
    padOrderNumber(sourceTimestampMs),
    padOrderNumber(ordering.ingestionSequence),
    padOrderNumber(ordering.sourceGeneration),
    padOrderNumber(ordering.sourceByteOffset),
    String(input.eventId || '')
  ].join('::');
}

function compareRuntimeEventOrder(left, right) {
  const leftKey = createRuntimeEventOrderKey(left);
  const rightKey = createRuntimeEventOrderKey(right);
  if (leftKey < rightKey) return -1;
  if (leftKey > rightKey) return 1;
  return 0;
}

function deriveRuntimeEventId(input) {
  const identity = {
    contractVersion: input.contractVersion || CONTRACT_VERSION,
    eventType: input.eventType,
    environmentKey: input.environmentKey,
    gameChannel: input.gameChannel,
    gameBuild: input.gameBuild,
    sourceLocation: input.sourceLocation,
    sourceProfileId: input.sourceProfileId,
    sourceProfileVersion: input.sourceProfileVersion,
    parserVersion: input.parserVersion,
    sourceTimestamp: input.sourceTimestamp,
    correlationIds: input.correlationIds,
    evidenceReference: input.evidenceReference,
    payload: input.payload
  };

  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(sortForStableSerialization(identity)))
    .digest('hex')
    .slice(0, 32);

  return `rte_v1_${hash}`;
}

function buildExampleEvent(eventType, index, overrides = {}) {
  const definition = EVENT_TYPE_REGISTRY[eventType];
  if (!definition) throw new Error(`Unknown event type ${eventType}`);

  const sourceTimestamp = `2026-08-09T12:${String(index).padStart(2, '0')}:00.000Z`;
  const ingestedAt = `2026-08-09T12:${String(index).padStart(2, '0')}:00.250Z`;
  const fixtureId = definition.fixtureId || 'contract-examples/runtime-monitor-lifecycle';
  const evidenceReference = {
    kind: definition.fixtureId ? 'fixture' : 'application',
    sourceId: 'runtime-contract-examples',
    fixtureId,
    sensitivity: definition.traits.sensitivity,
    evidenceMarkers: [`${eventType}:contract-example`]
  };
  const environment = deriveEnvironmentContext({
    releaseChannel: 'LIVE',
    universe: 'PU',
    environmentName: 'PUB',
    rawEnvironmentTag: 'LIVE',
    branch: 'sc-alpha-4.9-live-synth',
    buildVersion: '4.9.0-LIVE.9000000-SYNTH',
    changelist: 'SYNTH_CHANGE_9000000',
    databaseVersion: 'SYNTH_DATACORE_4_9',
    sourceInstallationId: 'SYNTH_INSTALLATION_LIVE',
    observedAt: sourceTimestamp,
    confidence: 'confirmed',
    evidenceReference
  });

  return createRuntimeEvent({
    eventType,
    sourceTimestamp,
    ingestedAt,
    environmentKey: environment.environmentKey,
    environment,
    gameChannel: 'LIVE',
    gameBuild: '4.9.0-LIVE.9000000-SYNTH',
    sourceLocation: '%ASTRADOCK_FIXTURE_ROOT%/StarCitizen/LIVE/game.log',
    sourceProfileId: 'sc-4.9-live',
    sourceProfileVersion: '1.0.0',
    parserVersion: 'runtime-parser/0.1.0',
    provenance: 'observed',
    confidence: eventType.startsWith('Runtime') ? 'confirmed' : 'medium',
    correlationIds: {
      environmentSessionId: 'SYNTH_ENV_SESSION_LIVE_A',
      clientSession: 'SYNTH_CLIENT_SESSION_A'
    },
    ordering: {
      sourceSequence: index,
      ingestionSequence: index,
      sourceByteOffset: index * 1000
    },
    payload: definition.examplePayload,
    evidenceReference,
    ...overrides
  });
}

function buildRuntimeEventExamples() {
  return Object.freeze(Object.fromEntries(Object.keys(EVENT_TYPE_REGISTRY).map((eventType, index) => [
    eventType,
    buildExampleEvent(eventType, index + 1)
  ])));
}

function validateRequiredString(object, key, path, errors) {
  if (!isPlainObject(object) || typeof object[key] !== 'string' || object[key].trim() === '') {
    errors.push(error('required_string', path, 'Required string is missing or empty'));
  }
}

function validateEnvelopeFields(event, path, errors) {
  for (const key of Object.keys(event)) {
    if (!RUNTIME_EVENT_ENVELOPE_FIELDS.includes(key)) {
      errors.push(error('unknown_envelope_field', `${path}.${key}`, 'Envelope field is not defined by the event contract'));
    }
  }
}

function validateTimestamp(value, path, errors) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    errors.push(error('invalid_timestamp', path, 'Timestamp must be a valid ISO-8601 string'));
    return;
  }

  if (new Date(value).toISOString() !== value) {
    errors.push(error('nondeterministic_timestamp', path, 'Timestamp must be normalized UTC ISO-8601 with milliseconds'));
  }
}

function validateEnvironmentContext(value, environmentKey, path, errors) {
  if (!isPlainObject(value)) {
    errors.push(error('invalid_environment', path, 'Environment context is required'));
    return;
  }

  validateRequiredString(value, 'environmentKey', `${path}.environmentKey`, errors);
  validateEnum(value.releaseChannel, ENUMS.releaseChannel, `${path}.releaseChannel`, errors);
  validateEnum(value.universe, ENUMS.universe, `${path}.universe`, errors);
  validateRequiredString(value, 'environmentName', `${path}.environmentName`, errors);
  validateRequiredString(value, 'rawEnvironmentTag', `${path}.rawEnvironmentTag`, errors);
  validateRequiredString(value, 'branch', `${path}.branch`, errors);
  validateRequiredString(value, 'buildVersion', `${path}.buildVersion`, errors);
  validateRequiredString(value, 'sourceInstallationId', `${path}.sourceInstallationId`, errors);
  validateTimestamp(value.observedAt, `${path}.observedAt`, errors);
  validateEnum(value.confidence, ENUMS.confidence, `${path}.confidence`, errors);
  validateEvidenceReference(value.evidenceReference, `${path}.evidenceReference`, errors);

  if (value.environmentKey !== environmentKey) {
    errors.push(error('environment_key_mismatch', `${path}.environmentKey`, 'Environment context must match event environment key'));
  }

  const expectedEnvironmentKey = deriveEnvironmentKey(value);
  if (value.environmentKey !== expectedEnvironmentKey) {
    errors.push(error('invalid_environment_key', `${path}.environmentKey`, 'Environment key must match canonical partition inputs'));
  }
}

function validateOrdering(value, path, errors) {
  if (!isPlainObject(value)) {
    errors.push(error('invalid_ordering', path, 'Ordering metadata is required'));
    return;
  }

  if (!isNonNegativeInteger(value.ingestionSequence)) {
    errors.push(error('invalid_ingestion_sequence', `${path}.ingestionSequence`, 'Ingestion sequence must be a non-negative integer'));
  }

  for (const optionalKey of ['sourceSequence', 'sourceByteOffset', 'sourceGeneration', 'sourceChunkSequence']) {
    if (Object.hasOwn(value, optionalKey) && !isNonNegativeInteger(value[optionalKey])) {
      errors.push(error('invalid_ordering_number', `${path}.${optionalKey}`, 'Ordering number must be a non-negative integer'));
    }
  }
}

function validateTraits(value, expectedTraits, path, errors) {
  if (!isPlainObject(value)) {
    errors.push(error('invalid_traits', path, 'Telemetry traits are required'));
    return;
  }

  validateEnum(value.temporalUtility, ENUMS.temporalUtility, `${path}.temporalUtility`, errors);
  validateEnum(value.stationSyncPolicy, ENUMS.stationSyncPolicy, `${path}.stationSyncPolicy`, errors);
  validateEnum(value.diagnosticUtility, ENUMS.diagnosticUtility, `${path}.diagnosticUtility`, errors);
  validateEnum(value.sensitivity, ENUMS.sensitivity, `${path}.sensitivity`, errors);
  validateEnum(value.lifecycle, ENUMS.lifecycle, `${path}.lifecycle`, errors);
  validateEnum(value.volumeCost, ENUMS.volumeCost, `${path}.volumeCost`, errors);

  if (!isPlainObject(value.persistence)) {
    errors.push(error('invalid_persistence', `${path}.persistence`, 'Persistence policy is required'));
  } else {
    validateEnum(value.persistence.scope, ENUMS.persistenceScope, `${path}.persistence.scope`, errors);
    validateRequiredString(value.persistence, 'retention', `${path}.persistence.retention`, errors);
  }

  if (!Array.isArray(value.subjectScopes) || value.subjectScopes.length === 0) {
    errors.push(error('invalid_subject_scopes', `${path}.subjectScopes`, 'Subject scopes must be a non-empty array'));
  } else {
    for (const [index, subjectScope] of value.subjectScopes.entries()) {
      validateEnum(subjectScope, ENUMS.subjectScope, `${path}.subjectScopes[${index}]`, errors);
    }
  }

  if (expectedTraits && JSON.stringify(sortForStableSerialization(value)) !== JSON.stringify(sortForStableSerialization(expectedTraits))) {
    errors.push(error('traits_mismatch', path, 'Event traits must match the registry definition'));
  }
}

function validateEvidenceReference(value, path, errors) {
  if (!isPlainObject(value)) {
    errors.push(error('invalid_evidence_reference', path, 'Evidence reference is required'));
    return;
  }

  validateEnum(value.kind, ENUMS.evidenceKind, `${path}.kind`, errors);
  validateRequiredString(value, 'sourceId', `${path}.sourceId`, errors);
  validateEnum(value.sensitivity, ENUMS.sensitivity, `${path}.sensitivity`, errors);

  if (containsForbiddenEvidenceKey(value)) {
    errors.push(error('raw_evidence_forbidden', path, 'Evidence reference must not copy raw evidence'));
  }

  if (Object.hasOwn(value, 'evidenceMarkers') && !isStringArray(value.evidenceMarkers)) {
    errors.push(error('invalid_evidence_markers', `${path}.evidenceMarkers`, 'Evidence markers must be strings'));
  }

  if (Object.hasOwn(value, 'lineRange')) {
    if (
      !isPlainObject(value.lineRange) ||
      !isNonNegativeInteger(value.lineRange.start) ||
      !isNonNegativeInteger(value.lineRange.end) ||
      value.lineRange.end < value.lineRange.start
    ) {
      errors.push(error('invalid_line_range', `${path}.lineRange`, 'Line range must be ordered non-negative integers'));
    }
  }
}

function validateStringMap(value, path, errors) {
  if (!isPlainObject(value)) {
    errors.push(error('invalid_correlation_ids', path, 'Correlation IDs must be an object'));
    return;
  }

  if (Object.keys(value).length === 0) {
    errors.push(error('empty_correlation_ids', path, 'At least one correlation ID is required'));
  }

  for (const [key, mapValue] of Object.entries(value)) {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(key)) {
      errors.push(error('invalid_correlation_key', `${path}.${key}`, 'Correlation key must be lower camel case'));
    }
    if (typeof mapValue !== 'string' || mapValue.trim() === '') {
      errors.push(error('invalid_correlation_value', `${path}.${key}`, 'Correlation value must be a non-empty string'));
    }
  }
}

function validatePayload(payload, schema, path, errors) {
  if (!isPlainObject(payload)) {
    errors.push(error('invalid_payload', path, 'Payload must be an object'));
    return;
  }

  for (const [key, spec] of Object.entries(schema)) {
    const value = payload[key];
    const fieldPath = `${path}.${key}`;

    if (!Object.hasOwn(payload, key)) {
      errors.push(error('missing_payload_field', fieldPath, 'Required payload field is missing'));
      continue;
    }

    validateFieldValue(value, spec, fieldPath, errors);
  }

  for (const key of Object.keys(payload)) {
    if (!Object.hasOwn(schema, key)) {
      errors.push(error('unknown_payload_field', `${path}.${key}`, 'Payload field is not defined by the event contract'));
    }
  }
}

function validateFieldValue(value, spec, path, errors) {
  if (spec.type === STRING) {
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(error('invalid_payload_string', path, 'Payload field must be a non-empty string'));
      return;
    }
  } else if (spec.type === BOOLEAN) {
    if (typeof value !== 'boolean') {
      errors.push(error('invalid_payload_boolean', path, 'Payload field must be a boolean'));
      return;
    }
  } else if (spec.type === INTEGER) {
    if (!Number.isInteger(value)) {
      errors.push(error('invalid_payload_integer', path, 'Payload field must be an integer'));
      return;
    }
  } else if (spec.type === NUMBER) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(error('invalid_payload_number', path, 'Payload field must be a finite number'));
      return;
    }
  }

  if (spec.enum && !spec.enum.includes(value)) {
    errors.push(error('invalid_payload_enum', path, 'Payload field contains an unknown enum value'));
  }

  if (typeof value === 'number') {
    if (Number.isFinite(spec.min) && value < spec.min) {
      errors.push(error('payload_number_too_small', path, 'Payload number is below minimum'));
    }
    if (Number.isFinite(spec.max) && value > spec.max) {
      errors.push(error('payload_number_too_large', path, 'Payload number is above maximum'));
    }
  }
}

function validateDerivation(value, path, errors) {
  if (!isPlainObject(value)) {
    errors.push(error('missing_derivation', path, 'Inferred events require derivation metadata'));
    return;
  }

  validateRequiredString(value, 'reason', `${path}.reason`, errors);
  if (!isStringArray(value.contributingEventIds) || value.contributingEventIds.length === 0) {
    errors.push(error('missing_contributors', `${path}.contributingEventIds`, 'Inferred events require contributing event IDs'));
  }
}

function containsForbiddenEvidenceKey(value) {
  if (!isPlainObject(value) && !Array.isArray(value)) return false;
  const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
  for (const [key, nestedValue] of entries) {
    if (typeof key === 'string' && ['rawLine', 'rawEvidence', 'rawLog', 'lineText'].includes(key)) {
      return true;
    }
    if (containsForbiddenEvidenceKey(nestedValue)) return true;
  }
  return false;
}

function error(code, path, message) {
  return Object.freeze({ code, path, message });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim() !== '');
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function validateEnum(value, validValues, path, errors) {
  if (!validValues.includes(value)) {
    errors.push(error('invalid_enum', path, 'Value is not in the allowed contract vocabulary'));
  }
}

function normalizeEnvironmentText(value, fallback = UNKNOWN_ENVIRONMENT_VALUE) {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function encodeEnvironmentKeyPart(value) {
  return encodeURIComponent(normalizeEnvironmentText(value))
    .replaceAll('%', '~')
    .replace(/[^\w.~:-]/g, '_');
}

function deriveEnvironmentConfidence(value) {
  const hasChannel = value.releaseChannel && value.releaseChannel !== UNKNOWN_ENVIRONMENT_VALUE;
  const hasBuild = value.buildVersion && value.buildVersion !== 'UNKNOWN_BUILD';
  const hasBranch = value.branch && value.branch !== UNKNOWN_ENVIRONMENT_VALUE;
  const hasEnvironmentName = value.environmentName && value.environmentName !== UNKNOWN_ENVIRONMENT_VALUE;

  if (hasChannel && hasBuild && hasBranch) return 'confirmed';
  if (hasChannel && (hasBuild || hasEnvironmentName)) return 'high';
  if (hasChannel || hasBuild || hasBranch || hasEnvironmentName) return 'medium';
  return 'unknown';
}

function timestampToMillis(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function padOrderNumber(value) {
  const normalized = Number.isSafeInteger(value) && value >= 0 ? value : 0;
  return String(normalized).padStart(16, '0');
}

function sortForStableSerialization(value) {
  if (Array.isArray(value)) {
    return value.map(sortForStableSerialization);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  return Object.fromEntries(Object.keys(value)
    .sort()
    .filter((key) => value[key] !== undefined)
    .map((key) => [key, sortForStableSerialization(value[key])]));
}

function deepFreeze(value) {
  if (!isPlainObject(value) && !Array.isArray(value)) return value;
  Object.freeze(value);
  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }
  return value;
}

const RUNTIME_EVENT_EXAMPLES = buildRuntimeEventExamples();

module.exports = {
  CONTRACT_VERSION,
  ENUMS,
  EVENT_TYPE_REGISTRY,
  RUNTIME_EVENT_EXAMPLES,
  RuntimeEventValidationError,
  assertSameEnvironment,
  assertValidRuntimeEvent,
  compareRuntimeEventOrder,
  createPartitionedIdentity,
  createRuntimeEvent,
  createRuntimeEventOrderKey,
  deserializeRuntimeEvent,
  deriveEnvironmentContext,
  deriveEnvironmentKey,
  deriveRuntimeEventId,
  deriveSourceInstallationId,
  serializeRuntimeEvent,
  toPersistenceRecord,
  validateRuntimeEvent
};
