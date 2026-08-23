import { describe, expect, it } from 'vitest';

import {
  classifyActivity,
  classifySourceHealth,
  classifyWorkspaceState,
  createRuntimeMonitorViewModel,
  formatCompactDuration,
  formatSourceHealth
} from '../src/renderer/src/runtime-monitor-model';

describe('separated monitor health and activity clocks', () => {
  const source = { validation: { isValid: true }, channelConfidence: 'confirmed' } as never;
  const tailer = {
    status: 'monitoring', available: true, generation: 1, sequence: 2, offset: 100,
    fileSize: 100, backlogBytes: 0, pendingCheck: false, deliveryInFlight: false,
    paused: false, pauseReason: null, lastErrorCode: null, sourceIdentity: 'redacted',
    lastObservedAt: '2026-08-18T11:50:00.000Z', lastDeliveredAt: '2026-08-18T11:50:00.000Z'
  };
  const snapshot = { monitor: { active: true, tailer } } as never;

  it('classifies a quiet healthy source without creating a stale workspace warning', () => {
    const now = new Date('2026-08-18T12:00:00.000Z');
    expect(classifyActivity(tailer.lastObservedAt, now)).toBe('quiet');
    expect(classifySourceHealth(snapshot, source)).toBe('healthy');
    expect(classifyWorkspaceState({ loading: false, fatalError: null, sources: [], activeSource: source, snapshot, scan: null, now })).toBe('ready');
  });

  it('keeps pause, source loss, backlog, and parser drift in separate dimensions', () => {
    expect(classifySourceHealth({ monitor: { active: true, tailer: { ...tailer, paused: true, status: 'paused' } } } as never, source)).toBe('paused');
    expect(classifySourceHealth({ monitor: { active: true, tailer: { ...tailer, available: false, status: 'waiting_for_source' } } } as never, source)).toBe('missing');
    expect(classifySourceHealth({ monitor: { active: true, tailer: { ...tailer, backlogBytes: 512 } } } as never, source)).toBe('degraded');
    expect(classifyWorkspaceState({
      loading: false, fatalError: null, sources: [], activeSource: source,
      snapshot: { monitor: { active: true, tailer: { ...tailer, backlogBytes: 512 } } } as never,
      scan: null, now: new Date('2026-08-18T12:00:00.000Z')
    })).toBe('degraded');

    const state = classifyWorkspaceState({
      loading: false, fatalError: null, sources: [], activeSource: source, snapshot,
      scan: { parserCompatibility: { status: 'suspected_drift' } } as never,
      now: new Date('2026-08-18T12:00:00.000Z')
    });
    expect(state).toBe('ready');
  });

  it('surfaces an unverified build without treating it as source failure', () => {
    const now = new Date('2026-08-18T12:00:00.000Z');
    const scan = {
      parserCompatibility: { status: 'unverified_build' },
      promotedRuntimeEvents: [], entries: [], userActivity: { actions: [], sessions: [] },
      environmentDiagnostics: [], rendererLifecycle: null, partySnapshot: null,
      locationSnapshot: null, destinationSnapshot: null
    } as never;
    expect(classifyWorkspaceState({ loading: false, fatalError: null, sources: [], activeSource: source, snapshot, scan, now })).toBe('unverified-build');
    const model = createRuntimeMonitorViewModel({ loading: false, fatalError: null, sources: [], activeSource: source, snapshot, scan, now });
    expect(model.sourceHealth).toBe('healthy');
    expect(model.alerts).toContainEqual(expect.objectContaining({ id: 'unverified-build' }));
  });
});

describe('PU session duration formatting', () => {
  it('uses MM:SS below one hour', () => {
    expect(formatCompactDuration(0)).toBe('00:00');
    expect(formatCompactDuration(125)).toBe('02:05');
  });

  it('uses HH:MM:SS at one hour and above', () => {
    expect(formatCompactDuration(3900)).toBe('01:05:00');
  });

  it('clamps negative and fractional input safely', () => {
    expect(formatCompactDuration(-5)).toBe('00:00');
    expect(formatCompactDuration(61.9)).toBe('01:01');
  });
});

describe('promoted header telemetry', () => {
  it('keeps shard/session telemetry in header order and removes it from the rail', () => {
    const model = createRuntimeMonitorViewModel({
      loading: false,
      fatalError: null,
      sources: [],
      activeSource: { validation: { isValid: true } } as never,
      snapshot: null,
      scan: {
        parserCompatibility: { status: 'compatible' },
        entries: [{ id: 'shard-1', shardId: '210', shardName: 'Stanton-US', region: 'US', evidenceAvailable: true }],
        userActivity: { actions: [], sessions: [] },
        promotedRuntimeEvents: [],
        environmentDiagnostics: [],
        rendererLifecycle: null,
        partySnapshot: null,
        locationSnapshot: null,
        destinationSnapshot: null
      } as never,
      now: new Date('2026-08-21T12:00:00.000Z')
    });

    expect(model.headerTelemetry.map((instrument) => instrument.id)).toEqual([
      'shard', 'server', 'pu-duration', 'application-duration'
    ]);
    expect(model.instruments.map((instrument) => instrument.id)).not.toEqual(expect.arrayContaining([
      'shard', 'server', 'pu-duration', 'application-duration'
    ]));
    expect(model.headerTelemetry.find((instrument) => instrument.id === 'shard')).toMatchObject({
      label: 'Shard and region', value: '210'
    });
    expect(model.headerTelemetry.find((instrument) => instrument.id === 'application-duration')).toMatchObject({
      value: 'Unknown', state: 'unknown'
    });
  });
});

describe('vehicle live telemetry', () => {
  it('labels the controlled vehicle without claiming aboard state or ownership', () => {
    const environmentKey = 'LIVE::PU::4.9.188.23497::UNKNOWN::SOURCE';
    const scan = {
      parserCompatibility: { status: 'compatible' },
      promotedRuntimeEvents: [{
        id: 'vehicle_acquired', eventType: 'VehicleControlAcquired', eventCategory: 'vehicle',
        summary: 'Controlling RSI Meteor', vehicleDisplayName: 'RSI Meteor',
        vehicleRelationship: 'controlled', vehicleOutcome: 'acquired',
        timestamp: '2026-08-19T07:02:00.000Z', confidence: 'high', evidenceAvailable: true
      }],
      entries: [], userActivity: { actions: [], sessions: [] }, environmentDiagnostics: [],
      rendererLifecycle: null, partySnapshot: null, locationSnapshot: null, destinationSnapshot: null,
      vehicleSnapshot: {
        version: 1, activeEnvironmentKey: environmentKey, environments: {
          [environmentKey]: {
            version: 1, environmentKey, environment: {}, hangarVehicle: null,
            controlledVehicle: {
              state: 'known', relationship: 'controlled', outcome: 'acquired',
              vehicleClassName: 'RSI_Meteor_SYNTH', vehicleDisplayName: 'RSI Meteor',
              vehicleEntityId: 'SY...AL', observedAt: '2026-08-19T07:02:00.000Z',
              confidence: 'high', provenance: 'inferred', evidenceEventId: 'vehicle_acquired', puSessionId: null
            },
            aboardVehicle: { state: 'unsupported', reason: 'No boarding evidence.' },
            ownership: { state: 'not_determined' }, lastChangedAt: '2026-08-19T07:02:00.000Z'
          }
        }
      }
    } as never;
    const model = createRuntimeMonitorViewModel({
      loading: false, fatalError: null, sources: [], activeSource: { validation: { isValid: true } } as never,
      snapshot: null, scan, now: new Date('2026-08-19T07:02:05.000Z')
    });
    expect(model.instruments).toContainEqual(expect.objectContaining({
      id: 'vehicle', label: 'Controlled vehicle', value: 'RSI Meteor', state: 'known'
    }));
    expect(model.streamEvents[0]).toEqual(expect.objectContaining({ kind: 'vehicle', summary: 'Controlling RSI Meteor' }));
    expect(model.instruments.find((instrument) => instrument.id === 'vehicle')?.drilldown).toContain('ownership: not determined');
  });
});

describe('canonical storage health', () => {
  it('surfaces encrypted durability and fail-closed storage errors independently from source health', () => {
    const source = { validation: { isValid: true }, channelConfidence: 'confirmed' } as never;
    const base = {
      loading: false, fatalError: null, sources: [], activeSource: source, scan: null,
      now: new Date('2026-08-19T12:00:00.000Z')
    };
    const ready = createRuntimeMonitorViewModel({
      ...base,
      snapshot: { monitor: { active: false, tailer: null, storage: { status: 'ready', errorCode: null, encrypted: true, eventCount: 42 } } } as never
    });
    expect(ready.storageLabel).toBe('42 events · Encrypted');
    expect(ready.alerts.find((alert) => alert.id === 'storage-error')).toBeUndefined();

    const failed = createRuntimeMonitorViewModel({
      ...base,
      snapshot: { monitor: { active: false, tailer: null, storage: { status: 'error', errorCode: 'secure_storage_unprotected', recoverable: false } } } as never
    });
    expect(failed.storageLabel).toBe('Unavailable');
    expect(failed.alerts).toContainEqual(expect.objectContaining({ id: 'storage-error', severity: 'critical' }));
  });
});

describe('Runtime Monitor action errors', () => {
  it('shows source command failures without classifying the workspace as fatal', () => {
    const viewModel = createRuntimeMonitorViewModel({
      loading: false,
      fatalError: null,
      actionError: 'Selected file is not a validated Star Citizen game.log.',
      sources: [],
      activeSource: null,
      snapshot: null,
      scan: null,
      now: new Date('2026-08-18T12:00:00.000Z')
    });

    expect(viewModel.workspaceState).toBe('no-source');
    expect(viewModel.alerts).toContainEqual(expect.objectContaining({
      id: 'action-error',
      severity: 'warning',
      title: 'Action could not complete',
      message: 'Selected file is not a validated Star Citizen game.log.',
      lifetime: 'transient'
    }));
  });
});

describe('issue 42 source and lifecycle surface', () => {
  it('exposes canonical health, backlog, lifecycle state, and transition freshness', () => {
    const now = new Date('2026-08-22T12:00:10.000Z');
    const scan = {
      environment: { releaseChannel: 'LIVE', environmentName: 'PU', buildVersion: '4.9.1' },
      rendererLifecycle: {
        activeEnvironmentKey: 'env',
        environments: { env: {
          environment: { releaseChannel: 'LIVE' },
          build: { productVersion: '4.9.1' },
          shard: { state: 'unknown', shardLabel: null, region: { friendlyRegion: 'UNKNOWN' } },
          replicationConnection: { state: 'unknown' },
          puSession: { state: 'unknown' },
          lifecycle: { state: 'in_game', reason: 'Entered the persistent universe.', lastChangedAt: '2026-08-22T12:00:00.000Z' }
        } }
      },
      parserCompatibility: { status: 'compatible' },
      promotedRuntimeEvents: [], entries: [], userActivity: { actions: [], sessions: [] }, environmentDiagnostics: []
    } as never;
    const model = createRuntimeMonitorViewModel({
      loading: false, fatalError: null, sources: [], activeSource: { validation: { isValid: true } } as never,
      snapshot: { monitor: { active: true, tailer: { status: 'monitoring', available: true, backlogBytes: 2048, deliveryInFlight: true, lastObservedAt: '2026-08-22T12:00:05.000Z' } } } as never,
      scan, now
    });

    expect(formatSourceHealth('degraded')).toBe('Degraded');
    expect(model.sourceHealthLabel).toBe('Degraded');
    expect(model.backlogLabel).toBe('2048 B');
    expect(model.backlogDetail).toContain('Event count unavailable');
    expect(model.lifecycleLabel).toBe('In game');
    expect(model.lifecycleDetail).toBe('Entered the persistent universe.');
    expect(model.lifecycleLastChangedAt).toBe('2026-08-22T12:00:00.000Z');
  });

  it('keeps missing and stopped source states distinguishable', () => {
    const source = { validation: { isValid: true } } as never;
    expect(formatSourceHealth('missing')).toBe('Source missing');
    expect(formatSourceHealth('stale')).toBe('Stale');
    expect(createRuntimeMonitorViewModel({ loading: false, fatalError: null, sources: [], activeSource: source,
      snapshot: { monitor: { active: true, tailer: { status: 'waiting_for_source', available: false } } } as never,
      scan: null, now: new Date() }).sourceHealth).toBe('missing');
    expect(createRuntimeMonitorViewModel({ loading: false, fatalError: null, sources: [], activeSource: source,
      snapshot: { monitor: { active: false, tailer: { status: 'stopped', available: false } } } as never,
      scan: null, now: new Date() }).sourceHealth).toBe('stopped');
  });
});

describe('Runtime Monitor party and zone projections', () => {
  it('uses projected party and location snapshots for current state and promoted stream rows', () => {
    const scan = {
      scannedAt: '2026-08-18T12:00:00.000Z',
      modifiedAt: null,
      environment: null,
      environmentKey: 'LIVE::PU::BUILD::BRANCH::SOURCE',
      environmentPartitions: [],
      environmentSwitches: [],
      environmentDiagnostics: [],
      parserCompatibility: {
        status: 'compatible',
        reason: 'profile_compatible',
        profileId: 'sc-4.9-live',
        profileVersion: 'draft-2026-08-12'
      },
      rendererLifecycle: null,
      partySnapshot: {
        version: 1,
        activeEnvironmentKey: 'LIVE::PU::BUILD::BRANCH::SOURCE',
        environments: {
          'LIVE::PU::BUILD::BRANCH::SOURCE': {
            version: 1,
            environmentKey: 'LIVE::PU::BUILD::BRANCH::SOURCE',
            environment: {},
            state: 'in_party',
            freshness: 'current',
            partyId: 'SY...TY',
            leader: {
              status: 'known',
              handle: 'SYNTH_HANDLE_LOCAL',
              isLocalPlayer: true,
              observedAt: '2026-08-18T11:59:00.000Z',
              confidence: 'medium',
              evidenceEventId: 'event_party'
            },
            members: [],
            confirmedMemberCount: 1,
            possibleMemberCount: 1,
            recentTransitions: [],
            lastChangedAt: '2026-08-18T11:59:00.000Z',
            limitation: 'Only promoted evidence.'
          }
        }
      },
      locationSnapshot: {
        version: 1,
        activeEnvironmentKey: 'LIVE::PU::BUILD::BRANCH::SOURCE',
        environments: {
          'LIVE::PU::BUILD::BRANCH::SOURCE': {
            version: 1,
            environmentKey: 'LIVE::PU::BUILD::BRANCH::SOURCE',
            environment: {},
            state: 'known',
            freshness: 'current',
            jurisdiction: {
              state: 'last_confirmed',
              value: 'SYNTH_JURISDICTION_A',
              observedAt: '2026-08-18T11:59:20.000Z',
              confidence: 'high',
              provenance: 'observed',
              evidenceEventId: 'event_zone'
            },
            monitoredSpace: {
              state: 'entered',
              value: true,
              observedAt: '2026-08-18T11:59:21.000Z',
              confidence: 'high',
              provenance: 'observed',
              evidenceEventId: 'event_monitored'
            },
            armistice: {
              state: 'left',
              value: false,
              observedAt: '2026-08-18T11:59:22.000Z',
              confidence: 'high',
              provenance: 'observed',
              evidenceEventId: 'event_armistice'
            },
            exactLocation: {
              state: 'unsupported',
              value: null,
              reason: 'No exact location.'
            },
            lastChangedAt: '2026-08-18T11:59:22.000Z'
          }
        }
      },
      destinationSnapshot: {
        version: 1,
        activeEnvironmentKey: 'LIVE::PU::BUILD::BRANCH::SOURCE',
        environments: {
          'LIVE::PU::BUILD::BRANCH::SOURCE': {
            version: 1,
            environmentKey: 'LIVE::PU::BUILD::BRANCH::SOURCE',
            environment: {},
            state: 'target_selected',
            freshness: 'current',
            currentTarget: {
              targetObservedId: 'SYNTH_TARGET_ORISON',
              vehicleClassName: 'RSI_Meteor_SYNTH',
              vehicleEntityId: 'SY...AL',
              observedAt: '2026-08-18T11:59:23.000Z',
              confidence: 'high',
              provenance: 'observed',
              evidenceEventId: 'event_quantum'
            },
            lastArrival: null,
            lastChangedAt: '2026-08-18T11:59:23.000Z',
            limitation: 'Only locally correlated quantum evidence.'
          }
        }
      },
      promotedRuntimeEvents: [
        {
          id: 'event_party',
          eventType: 'PartyCreated',
          eventCategory: 'party',
          summary: 'Party created by SYNTH_HANDLE_LOCAL',
          timestamp: '2026-08-18T11:59:00.000Z',
          confidence: 'medium',
          evidenceAvailable: true
        },
        {
          id: 'event_zone',
          eventType: 'JurisdictionEntered',
          eventCategory: 'zone',
          summary: 'Entered SYNTH_JURISDICTION_A',
          timestamp: '2026-08-18T11:59:20.000Z',
          confidence: 'high',
          evidenceAvailable: true
        },
        {
          id: 'event_quantum',
          eventType: 'QuantumTargetSelected',
          eventCategory: 'navigation',
          summary: 'Selected quantum target SYNTH_TARGET_ORISON',
          timestamp: '2026-08-18T11:59:23.000Z',
          confidence: 'high',
          evidenceAvailable: true
        }
      ],
      entries: [],
      userActivity: {
        actions: [],
        sessions: []
      },
      source: null
    };

    const viewModel = createRuntimeMonitorViewModel({
      loading: false,
      fatalError: null,
      actionError: null,
      sources: [],
      activeSource: null,
      snapshot: null,
      scan: scan as never,
      now: new Date('2026-08-18T12:00:00.000Z')
    });

    expect(viewModel.party).toMatchObject({
      state: 'ready',
      label: 'In party'
    });
    expect(viewModel.instruments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'jurisdiction', value: 'SYNTH_JURISDICTION_A' }),
      expect.objectContaining({ id: 'monitored-space', value: 'Yes' }),
      expect.objectContaining({ id: 'armistice', value: 'No' }),
      expect.objectContaining({ id: 'destination', value: 'SYNTH_TARGET_ORISON', state: 'known' })
    ]));
    expect(viewModel.mission).toMatchObject({ title: 'Destination', label: 'SYNTH_TARGET_ORISON' });
    expect(viewModel.streamEvents.map((event) => event.kind)).toEqual(['navigation', 'zone', 'party']);
  });
});

describe('issue 41 live instrument cluster contracts', () => {
  it('exposes critical warning count, age, and supporting evidence IDs', () => {
    const now = new Date('2026-08-22T12:01:00.000Z');
    const scan = {
      scannedAt: '2026-08-22T12:00:00.000Z',
      environmentKey: 'LIVE::PU::BUILD::BRANCH::SOURCE',
      parserCompatibility: { status: 'compatible' },
      promotedRuntimeEvents: [{
        id: 'critical-event', eventType: 'SourceFailure', eventCategory: 'runtime',
        summary: 'Source disconnected', timestamp: '2026-08-22T12:00:00.000Z', evidenceAvailable: true
      }],
      entries: [], userActivity: { actions: [], sessions: [] }, environmentDiagnostics: [],
      rendererLifecycle: null, partySnapshot: null, locationSnapshot: null, destinationSnapshot: null,
      source: { validation: { isValid: false, message: 'Source moved' } }
    } as never;
    const model = createRuntimeMonitorViewModel({
      loading: false, fatalError: null, sources: [], activeSource: scan.source,
      snapshot: null, scan, now
    });

    expect(model.instruments).toContainEqual(expect.objectContaining({
      id: 'critical-warnings', value: '1', state: 'known', supportingEventIds: ['critical-event']
    }));
    expect(model.alerts).toContainEqual(expect.objectContaining({
      id: 'source', severity: 'critical', occurredAt: '2026-08-22T12:00:00.000Z'
    }));
    expect(model.warningCount).toBeGreaterThan(0);
  });

  it('keeps unsupported and unknown warning states honest', () => {
    const unsupported = createRuntimeMonitorViewModel({
      loading: false, fatalError: null, sources: [], activeSource: { validation: { isValid: true } } as never,
      snapshot: null,
      scan: { parserCompatibility: { status: 'unsupported_profile' }, promotedRuntimeEvents: [], entries: [], userActivity: { actions: [], sessions: [] }, environmentDiagnostics: [] } as never,
      now: new Date('2026-08-22T12:00:00.000Z')
    });
    expect(unsupported.instruments).toContainEqual(expect.objectContaining({ id: 'critical-warnings', value: 'Unsupported', state: 'unsupported' }));

    const unknown = createRuntimeMonitorViewModel({ loading: false, fatalError: null, sources: [], activeSource: null, snapshot: null, scan: null, now: new Date() });
    expect(unknown.instruments).toContainEqual(expect.objectContaining({ id: 'critical-warnings', value: 'Unknown', state: 'unknown' }));
  });
});
