import { describe, expect, it } from 'vitest';

import {
  createRuntimeMonitorViewModel,
  formatCompactDuration
} from '../src/renderer/src/runtime-monitor-model';

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
    expect(viewModel.alerts).toContainEqual({
      id: 'action-error',
      severity: 'warning',
      title: 'Action could not complete',
      message: 'Selected file is not a validated Star Citizen game.log.'
    });
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
      expect.objectContaining({ id: 'monitored-space', value: 'Entered' }),
      expect.objectContaining({ id: 'armistice', value: 'Outside' })
    ]));
    expect(viewModel.streamEvents.map((event) => event.kind)).toEqual(['zone', 'party']);
  });
});
