import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EnvironmentSelect, RuntimeMonitorApp } from '../src/renderer/src/runtime-monitor-app';
import { CompatibilityPanel } from '../src/renderer/src/compatibility-panel';
import { FALLBACK_SETTINGS, type PublicRuntimeSource, type RuntimeMonitorClient, type RendererScanResult } from '../src/renderer/src/astradock-api';
import type { BuildCompatibilityCatalog, MonitorChangeEnvelope } from '../src/contracts/rendererApi';

function source(channel: string, valid = true): PublicRuntimeSource {
  return { sourceId: `src_${channel}`, sourceKind: 'game_log', channelHint: channel, channelConfidence: 'observed',
    displayLabel: `${channel} log`, displayPath: `/private/install/${channel}`, discoveryMethods: ['automatic'],
    buildVersion: null, environmentName: 'PUB', platformHint: 'win32', installationKind: 'rsi_launcher',
    validation: { status: valid ? 'valid' : 'environment_mismatch', isValid: valid, checkedAt: '2026-11-02T12:00:00Z', message: 'Synthetic validation', evidenceMarkers: [] } };
}
const live = source('LIVE');
const ptu = source('PTU');
function scan(source: PublicRuntimeSource): RendererScanResult {
  return { source, environmentKey: `${source.channelHint}::SYNTH`, environment: { releaseChannel: source.channelHint },
    scannedAt: '2026-11-02T12:00:00Z', entries: [], userActivity: { actions: [], sessions: [] },
    promotedRuntimeEvents: [{ id: `${source.channelHint}-event`, eventType: 'RuntimeLogSignalObserved', eventCategory: 'action',
      summary: `${source.channelHint} isolated event`, timestamp: '2026-11-02T12:00:00Z', environmentKey: `${source.channelHint}::SYNTH`, evidenceAvailable: true }],
    environmentDiagnostics: [], parserCompatibility: { status: 'compatible' } } as unknown as RendererScanResult;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal('CSS', { escape: (value: string) => value });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('environment selection', () => {
  it('offers all environments, disables conflicting logs and reveals no private paths', () => {
    render(<EnvironmentSelect sources={[live, ptu, source('HOTFIX'), source('TECH-PREVIEW'), source('EPTU', false)]} source={live} onSelect={vi.fn()} />);
    const picker = screen.getByRole('combobox', { name: 'Environment' });
    expect(within(picker).getByRole('option', { name: 'TECH-PREVIEW' })).toBeEnabled();
    expect(within(picker).getByRole('option', { name: /EPTU/ })).toBeDisabled();
    expect(picker).not.toHaveTextContent('/private');
  });

  it('clears LIVE rows, browsing and evidence when switching to preview, including a failed preview scan and late LIVE messages', async () => {
    let selected = live;
    let listener: ((message: MonitorChangeEnvelope) => void) | undefined;
    let finishEvidence: ((value: unknown) => void) | undefined;
    const monitor = { active: false, sourceId: null, storage: { status: 'ready' }, tailer: null, checkpoint: null };
    const client = {
      version: 1,
      source: {
        discover: vi.fn(async () => ({ sources: [live, ptu], activeSource: live })),
        select: vi.fn(async () => { selected = ptu; return { source: ptu, selected: true }; })
      },
      monitor: {
        getSnapshot: vi.fn(async () => ({ source: selected, scan: selected === live ? scan(live) : null, monitor, subscriptions: {} })),
        scan: vi.fn(async () => { throw new Error('Synthetic preview read failure'); }),
        subscribe: vi.fn((callback: (message: MonitorChangeEnvelope) => void) => { listener = callback; return () => {}; })
      },
      settings: { get: vi.fn(async () => ({ settings: FALLBACK_SETTINGS, storage: { status: 'ready' } })) },
      events: { getEvidenceDetail: vi.fn(() => new Promise(resolve => { finishEvidence = resolve; })) },
      compatibility: { getCatalog: vi.fn(async () => ({ version: 1, builds: [] })) }
    } as unknown as RuntimeMonitorClient;
    render(<RuntimeMonitorApp client={client} clock={() => new Date('2026-11-02T12:00:00Z')} />);
    await screen.findByText('LIVE isolated event');
    fireEvent.click(screen.getByText('LIVE isolated event'));
    expect(screen.getByRole('button', { name: 'Close detail' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Environment' }), { target: { value: ptu.sourceId } });
    await waitFor(() => expect(screen.queryByText('LIVE isolated event')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Close detail' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Environment' })).toHaveValue(ptu.sourceId));
    await act(async () => listener?.({ changes: [{ change: { type: 'monitor.scan', scan: scan(live), monitor: { ...monitor, active: true, sourceId: live.sourceId } } }] } as unknown as MonitorChangeEnvelope));
    await act(async () => finishEvidence?.({ eventId: 'LIVE-event' }));
    expect(screen.queryByText('LIVE isolated event')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Environment' })).toHaveValue(ptu.sourceId);
    expect(screen.getByRole('note')).toHaveTextContent('PTU');
    expect(screen.getByRole('button', { name: 'Start follow' })).toBeEnabled();
  });
});

it('keeps newest-first build ordering through a family filter', () => {
  const entry = (build: string, family: string) => ({ build, family, source: 'synthetic-test', observedFileCount: 1, capabilities: { blueprint: { status: 'not_evaluated' as const, profileId: null, detail: 'Synthetic coverage' } } });
  const catalog = { version: 1, builds: [entry('12572603', '4.10'), entry('12535871', '4.10'), entry('12344265', '4.9')] } as BuildCompatibilityCatalog;
  render(<CompatibilityPanel catalog={catalog} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Family' }), { target: { value: '4.10' } });
  expect(screen.getAllByRole('button', { name: /Inspect build/ }).map(button => button.textContent)).toEqual(['12572603', '12535871']);
});
