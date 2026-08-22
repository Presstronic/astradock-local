import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  CircleHelp,
  Table2,
  TerminalSquare
} from 'lucide-react';
import type {
  EvidenceDetail,
  MonitorSnapshot,
  PublicRuntimeSource,
  RendererScanResult,
  RuntimeMonitorClient
} from './astradock-api';
import type { SettingsSnapshot } from '../../contracts/rendererApi';
import {
  createRuntimeMonitorViewModel,
  type Density,
  type DetailState,
  type DrawerPlacement,
  type InstrumentState,
  type MissionDestinationViewState,
  type PartyMemberViewState,
  type PartyTransitionViewState,
  type PartyViewState,
  type StreamEvent,
  type StreamView
} from './runtime-monitor-model';
import { RuntimeNotificationStack } from './runtime-notification-stack';
import {
  browseFrom,
  createSharedEventStreamState,
  getStreamWindow,
  pageStreamWindow,
  reconcileStreamEvents,
  returnToLive,
  selectStreamEvent,
  switchStreamView,
  updateStreamQuery
} from './shared-event-stream-model';
import { formatInstantContext, formatLocalClock } from './time';
import { formatTerminalEvent } from './terminal-event-format';
import { formatTableEvent } from './table-event-format';

interface RuntimeMonitorAppProps {
  client: RuntimeMonitorClient;
  clock?: () => Date;
}

interface LocalPreferences {
  streamView: StreamView;
  terminalDensity: Density;
  tableDensity: Density;
  terminalDrawer: DrawerPlacement;
  tableDrawer: DrawerPlacement;
}

const DEFAULT_PREFERENCES: LocalPreferences = {
  streamView: 'terminal',
  terminalDensity: 'compact',
  tableDensity: 'default',
  terminalDrawer: 'right',
  tableDrawer: 'bottom'
};

const preferenceKey = 'astradock.runtimeMonitor.preferences.v1';
const systemClock = () => new Date();

export function RuntimeMonitorApp({ client, clock = systemClock }: RuntimeMonitorAppProps) {
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [sources, setSources] = useState<PublicRuntimeSource[]>([]);
  const [activeSource, setActiveSource] = useState<PublicRuntimeSource | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);
  const [scan, setScan] = useState<RendererScanResult | null>(null);
  const [preferences, setPreferences] = useState<LocalPreferences>(() => loadLocalPreferences());
  const [settingsSnapshot, setSettingsSnapshot] = useState<SettingsSnapshot | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [now, setNow] = useState<Date>(() => clock());
  const [search, setSearch] = useState('');
  const [streamFilters, setStreamFilters] = useState<{
    kind: StreamEvent['kind'] | 'all';
    party: 'any' | 'involved' | 'not-involved';
    provenance: string;
    confidence: string;
    diagnostics: 'show' | 'hide' | 'only';
    sessionId: string;
    shard: string;
    server: string;
  }>({ kind: 'all', party: 'any', provenance: 'all', confidence: 'all', diagnostics: 'show', sessionId: 'all', shard: 'all', server: 'all' });
  const [eventStream, setEventStream] = useState(() => createSharedEventStreamState({ view: preferences.streamView }));
  const [partyAnnouncement, setPartyAnnouncement] = useState('');
  const [destinationAnnouncement, setDestinationAnnouncement] = useState('');
  const [detail, setDetail] = useState<DetailState>({
    status: 'empty',
    selected: null,
    detail: null,
    message: 'Select an event, instrument, party member, mission, or alert to inspect local evidence.'
  });
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const lastSelectionTrigger = useRef<HTMLElement | null>(null);
  const detailRequest = useRef(0);
  const lastPartyTransitionId = useRef<string | null>(null);
  const lastDestinationTransitionId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    async function boot() {
      setLoading(true);
      try {
        const [discovery, nextSnapshot, nextSettings] = await Promise.all([
          client.source.discover(),
          client.monitor.getSnapshot(),
          client.settings.get()
        ]);
        if (!active) return;
        setSources([...discovery.sources]);
        setActiveSource(discovery.activeSource || nextSnapshot.source || null);
        setSnapshot(nextSnapshot);
        setScan(nextSnapshot.scan);
        setSettingsSnapshot(nextSettings);
        setPreferences((current) => ({
          ...current,
          streamView: nextSettings.settings.streamView,
          terminalDensity: nextSettings.settings.terminalDensity,
          tableDensity: nextSettings.settings.tableDensity,
          terminalDrawer: nextSettings.settings.terminalDrawer,
          tableDrawer: nextSettings.settings.tableDrawer
        }));
        unsubscribe = client.monitor.subscribe((message) => {
          if (message.error) {
            setFatalError(message.error.message);
            return;
          }
          for (const envelope of message.changes || []) {
            const change = envelope.change;
            if ('monitor' in change) setSnapshot((current) => ({ ...(current || nextSnapshot), monitor: change.monitor }));
            if (change.type === 'monitor.scan') {
              setScan(change.scan);
              setActiveSource(change.scan.source);
              setActionError(null);
            }
            if (change.type === 'monitor.error') {
              setActionError(change.error.message);
            }
          }
        });
        setFatalError(null);
      } catch (error) {
        setFatalError(error instanceof Error ? error.message : 'Runtime Monitor could not initialize safely.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void boot();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [client]);

  useEffect(() => {
    window.localStorage.setItem(preferenceKey, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(clock()), 1_000);
    return () => window.clearInterval(timer);
  }, [clock]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && detail.status !== 'empty') {
        event.preventDefault();
        closeDetail();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detail.status]);

  const viewModel = useMemo(() => createRuntimeMonitorViewModel({
    loading,
    fatalError,
    actionError,
    sources,
    activeSource,
    snapshot,
    scan,
    now
  }), [actionError, activeSource, fatalError, loading, now, scan, snapshot, sources]);

  useEffect(() => {
    setEventStream((current) => reconcileStreamEvents(current, viewModel.streamEvents, viewModel.workspaceState, Boolean(snapshot?.monitor.active)));
  }, [snapshot?.monitor.active, viewModel.streamEvents, viewModel.workspaceState]);

  useEffect(() => {
    setEventStream((current) => updateStreamQuery(current, {
      search,
      kinds: streamFilters.kind === 'all' ? [] : [streamFilters.kind],
      party: streamFilters.party,
      provenance: streamFilters.provenance === 'all' ? null : streamFilters.provenance,
      confidence: streamFilters.confidence === 'all' ? null : streamFilters.confidence,
      diagnostics: streamFilters.diagnostics,
      sessionId: streamFilters.sessionId === 'all' ? null : streamFilters.sessionId,
      shard: streamFilters.shard === 'all' ? null : streamFilters.shard,
      server: streamFilters.server === 'all' ? null : streamFilters.server
    }));
  }, [search, streamFilters]);

  useEffect(() => {
    const latest = viewModel.party.transitions[0];
    if (!latest) return;
    if (lastPartyTransitionId.current === null) {
      lastPartyTransitionId.current = latest.id;
      return;
    }
    if (latest.id !== lastPartyTransitionId.current) {
      lastPartyTransitionId.current = latest.id;
      setPartyAnnouncement(`Party update: ${latest.label}${latest.subjectLabel ? `, ${latest.subjectLabel}` : ''}.`);
    }
  }, [viewModel.party.transitions]);

  useEffect(() => {
    const latest = viewModel.mission.transition;
    if (!latest) return;
    if (lastDestinationTransitionId.current === null) {
      lastDestinationTransitionId.current = latest.id;
      return;
    }
    if (latest.id !== lastDestinationTransitionId.current) {
      lastDestinationTransitionId.current = latest.id;
      setDestinationAnnouncement(`Destination update: ${latest.label}, ${latest.destinationLabel}.`);
    }
  }, [viewModel.mission.transition]);

  const visibleEvents = useMemo(() => getStreamWindow(eventStream), [eventStream]);
  const filterValues = useMemo(() => {
    const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort();
    return {
      sessions: unique(eventStream.sourceEvents.map((event) => typeof event.row.sessionId === 'string' ? event.row.sessionId : '')),
      shards: unique(eventStream.sourceEvents.flatMap((event) => ['shardId', 'shardName', 'region'].map((field) => String(event.row[field] ?? '')))),
      servers: unique(eventStream.sourceEvents.flatMap((event) => ['server', 'serverId', 'endpoint', 'host', 'address'].map((field) => String(event.row[field] ?? '')))),
      provenances: unique(eventStream.sourceEvents.map((event) => String(event.row.provenance ?? '')))
    };
  }, [eventStream.sourceEvents]);

  const currentDensity = preferences.streamView === 'terminal' ? preferences.terminalDensity : preferences.tableDensity;
  const storedPlacement = preferences.streamView === 'terminal' ? preferences.terminalDrawer : preferences.tableDrawer;
  const effectivePlacement = storedPlacement;

  async function chooseSource() {
    try {
      setActionError(null);
      const result = await client.source.choose();
      if (!result?.source) return;
      setActiveSource(result.saved ? result.source : null);
      setSources((current) => upsertSource(current, result.source));
      if (result.saved) {
        const nextScan = await client.monitor.scan({ sourceId: result.source.sourceId, options: {} });
        setScan(nextScan);
      } else {
        setActionError(result.source.validation.message);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Source selection failed.');
    }
  }

  async function scanSource() {
    if (!viewModel.source) {
      setActionError('Choose a local game.log source first.');
      return;
    }
    try {
      setActionError(null);
      const nextScan = await client.monitor.scan({ sourceId: viewModel.source.sourceId, options: {} });
      setScan(nextScan);
      setActiveSource(nextScan.source);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Source scan failed.');
    }
  }

  async function startMonitor() {
    if (!viewModel.source) {
      setActionError('Choose a local game.log source first.');
      return;
    }
    try {
      setActionError(null);
      const result = await client.monitor.start({ sourceId: viewModel.source.sourceId, options: { startMode: 'from_current_end' } });
      setSnapshot((current) => ({ ...(current || createEmptySnapshot()), monitor: result.monitor, scan: result.scan, source: result.scan.source }));
      setScan(result.scan);
      setActiveSource(result.scan.source);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Monitor start failed.');
    }
  }

  async function stopMonitor() {
    try {
      setActionError(null);
      const monitor = await client.monitor.stop();
      if (isMonitorStatePayload(monitor)) {
        setSnapshot((current) => ({ ...(current || createEmptySnapshot()), monitor }));
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Monitor stop failed.');
    }
  }

  async function openEvidence(event: StreamEvent, trigger: HTMLElement | null) {
    const requestNumber = ++detailRequest.current;
    setEventStream((current) => selectStreamEvent(current, event.id));
    lastSelectionTrigger.current = trigger;
    setDetail({
      status: event.evidenceAvailable ? 'loading' : 'redacted',
      selected: event,
      detail: null,
      message: event.evidenceAvailable
        ? 'Loading permitted local evidence detail.'
        : 'Evidence exists only behind a permitted local detail request or is redacted by default.'
    });
    window.requestAnimationFrame(() => detailHeadingRef.current?.focus());
    if (!event.evidenceAvailable) return;

    try {
      const evidence = await client.events.getEvidenceDetail({
        environmentKey: String(event.row.environmentKey || snapshot?.scan?.environmentKey || ''),
        eventId: event.id
      });
      if (requestNumber !== detailRequest.current) return;
      setDetail({
        status: 'ready',
        selected: event,
        detail: evidence,
        message: 'Permitted local evidence detail loaded.'
      });
    } catch (error) {
      if (requestNumber !== detailRequest.current) return;
      setDetail({
        status: error && typeof error === 'object' && 'code' in error && error.code === 'evidence_not_found' ? 'retention-removed' : 'error',
        selected: event,
        detail: null,
        message: error instanceof Error ? error.message : 'Evidence detail is no longer retained.'
      });
    }
  }

  function closeDetail() {
    detailRequest.current += 1;
    setEventStream((current) => selectStreamEvent(current, null));
    setDetail({
      status: 'empty',
      selected: null,
      detail: null,
      message: 'Select an event, instrument, party member, mission, or alert to inspect local evidence.'
    });
    lastSelectionTrigger.current?.focus();
  }

  function updatePreference(patch: Partial<LocalPreferences>) {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    void client.settings.update(patch).then(setSettingsSnapshot).catch(() => {});
  }

  async function deleteTelemetry(mode: 'sensitive_evidence' | 'environment' | 'all_telemetry') {
    const environmentKey = mode === 'environment' ? (snapshot?.scan?.environmentKey || null) : null;
    const label = mode === 'environment' ? `the current ${environmentKey || 'environment'} telemetry` : mode === 'all_telemetry' ? 'all local telemetry' : 'sensitive local evidence';
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    try {
      const result = await client.settings.deleteTelemetry(mode, environmentKey);
      setSettingsSnapshot((current) => current ? { ...current, storage: result.storage } : current);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Deletion failed.');
    }
  }

  return (
    <div className="runtime-shell" data-density={currentDensity} data-detail-placement={effectivePlacement} data-has-detail={detail.status !== 'empty'}>
      <a className="skip-link" href="#runtime-stream">Skip to stream</a>
      <a className="skip-link" href="#current-state">Skip to current state</a>

      <header className="runtime-header" aria-label="Runtime Monitor source and health">
        <div className="product-lockup" aria-label="AstraDock Local Runtime Monitor">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <span className="product-name">AstraDock</span>
            <span className="workspace-name">Local</span>
          </div>
        </div>
        <section className="source-strip" aria-label="Source health">
          <Metric label="Environment" value={viewModel.environmentLabel.toUpperCase()} />
          <Metric label="Build" value={viewModel.buildLabel} />
          <StatusPill state={viewModel.workspaceState} label={viewModel.monitorLabel} />
          <Metric label="Source health" value={viewModel.sourceHealth} />
          <Metric label="Last activity" value={viewModel.freshnessLabel} title={viewModel.exactFreshness || undefined} />
          <Metric label="Parser" value={viewModel.compatibilityState.replaceAll('_', ' ')} />
          <Metric label="Source" value={viewModel.source?.displayLabel || 'Awaiting source'} />
          {viewModel.headerTelemetry.map((instrument) => (
            <HeaderTelemetryMetric
              key={instrument.id}
              instrument={instrument}
              onSelect={openSyntheticDetail}
            />
          ))}
          {viewModel.warningCount > 0 ? <Metric label="Warnings" value={String(viewModel.warningCount)} /> : null}
        </section>
        <div className="global-actions" aria-label="Monitor actions">
          <button type="button" className="button secondary" onClick={() => void (viewModel.source ? scanSource() : chooseSource())}>
            {viewModel.source ? 'Re-scan source' : 'Choose source'}
          </button>
          {snapshot?.monitor.active ? (
            <button type="button" className="button secondary follow-active" onClick={() => void stopMonitor()}>Pause follow</button>
          ) : (
            <button type="button" className="button secondary" onClick={() => void startMonitor()} disabled={!viewModel.source}>Start follow</button>
          )}
        </div>
      </header>

      <nav className="workspace-tabs" aria-label="Workspaces">
        <a href="#runtime-main" aria-current="page">Runtime Monitor</a>
        <button type="button" disabled title="Post-MVP workspace">Data Operations <span>Post-MVP</span></button>
        <button type="button" disabled title="Post-MVP workspace">History &amp; Analytics <span>Post-MVP</span></button>
        <button type="button" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}>Settings</button>
      </nav>

      {settingsOpen ? <SettingsPanel
        snapshot={settingsSnapshot}
        preferences={preferences}
        onPreferenceChange={updatePreference}
        onRetentionChange={async (retentionDays) => {
          try { setSettingsSnapshot(await client.settings.update({ retentionDays })); } catch (error) { setActionError(error instanceof Error ? error.message : 'Retention update failed.'); }
        }}
        onDelete={deleteTelemetry}
        onReset={async () => {
          if (!window.confirm('Reset preferences and delete all local app data? This cannot be undone.')) return;
          try { setSettingsSnapshot(await client.settings.reset()); setPreferences(DEFAULT_PREFERENCES); setActiveSource(null); } catch (error) { setActionError(error instanceof Error ? error.message : 'Reset failed.'); }
        }}
      /> : null}

      <main id="runtime-main" className="runtime-main" aria-label="Runtime Monitor">
        <aside id="current-state" className="current-state" aria-label="Current runtime state">
          <section className="instrument-list" aria-label="Current-state instruments">
            <h2><span>Instruments</span><small>{viewModel.freshnessLabel}</small></h2>
            {viewModel.instruments.map((instrument) => (
              <button
                className="instrument"
                type="button"
                key={instrument.id}
                data-state={instrument.state}
                onClick={(event) => openSyntheticDetail(instrument, event.currentTarget)}
              >
                <span className="instrument-heading"><span>{instrument.label}</span><em>{formatInstrumentState(instrument.state)}</em></span>
                <strong>{instrument.value}</strong>
                <small>{instrument.detail}</small>
              </button>
            ))}
          </section>

          <PartySection
            party={viewModel.party}
            onSelect={(evidenceEventId, trigger, fallback) => {
              const event = viewModel.streamEvents.find((candidate) => candidate.id === evidenceEventId);
              if (event) {
                void openEvidence(event, trigger);
                return;
              }
              openPartyFallback(fallback, trigger);
            }}
          />
          <MissionDestinationSection
            value={viewModel.mission}
            onSelect={(evidenceEventId, trigger, fallback) => {
              const event = viewModel.streamEvents.find((candidate) => candidate.id === evidenceEventId);
              if (event) {
                void openEvidence(event, trigger);
                return;
              }
              openPartyFallback(fallback, trigger);
            }}
          />
          <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{partyAnnouncement}</p>
          <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{destinationAnnouncement}</p>
        </aside>

        <section id="runtime-stream" className="stream-workspace" aria-label="Runtime event stream">
          <div className="stream-toolbar">
            <div className="stream-controls" aria-label="Stream controls">
              <div className="segmented" role="group" aria-label="Stream view">
                <button type="button" aria-pressed={preferences.streamView === 'terminal'} onClick={() => { updatePreference({ streamView: 'terminal' }); setEventStream((current) => switchStreamView(current, 'terminal')); }}>
                  <TerminalSquare aria-hidden="true" /> Terminal
                </button>
                <button type="button" aria-pressed={preferences.streamView === 'table'} onClick={() => { updatePreference({ streamView: 'table' }); setEventStream((current) => switchStreamView(current, 'table')); }}>
                  <Table2 aria-hidden="true" /> Table
                </button>
              </div>
              <label className="search-control">
                <span>Search</span>
                <input value={search} maxLength={160} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="literal match" aria-describedby="stream-filter-status" />
              </label>
              <label className="search-control"><span>Kind</span><select value={streamFilters.kind} onChange={(event) => setStreamFilters((current) => ({ ...current, kind: event.currentTarget.value as typeof current.kind }))}>
                <option value="all">All event kinds</option>
                {(['shard', 'action', 'session', 'party', 'zone', 'vehicle', 'navigation', 'runtime', 'diagnostic'] as const).map((kind) => <option key={kind} value={kind}>{kind}</option>)}
              </select></label>
              <label className="search-control"><span>Party</span><select value={streamFilters.party} onChange={(event) => setStreamFilters((current) => ({ ...current, party: event.currentTarget.value as typeof current.party }))}>
                <option value="any">Any party context</option><option value="involved">Party involved</option><option value="not-involved">No party context</option>
              </select></label>
              <label className="search-control"><span>Confidence</span><select value={streamFilters.confidence} onChange={(event) => setStreamFilters((current) => ({ ...current, confidence: event.currentTarget.value }))}>
                <option value="all">Any confidence</option>{['confirmed', 'high', 'medium', 'low', 'unknown'].map((value) => <option key={value} value={value}>{value}</option>)}
              </select></label>
              <label className="search-control"><span>Diagnostics</span><select value={streamFilters.diagnostics} onChange={(event) => setStreamFilters((current) => ({ ...current, diagnostics: event.currentTarget.value as typeof current.diagnostics }))}>
                <option value="show">Include diagnostics</option><option value="hide">Hide diagnostics</option><option value="only">Diagnostics only</option>
              </select></label>
              <label className="search-control"><span>Session</span><select value={streamFilters.sessionId} onChange={(event) => setStreamFilters((current) => ({ ...current, sessionId: event.currentTarget.value }))}><option value="all">All sessions</option>{filterValues.sessions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label className="search-control"><span>Shard</span><select value={streamFilters.shard} onChange={(event) => setStreamFilters((current) => ({ ...current, shard: event.currentTarget.value }))}><option value="all">All shards</option>{filterValues.shards.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label className="search-control"><span>Server</span><select value={streamFilters.server} onChange={(event) => setStreamFilters((current) => ({ ...current, server: event.currentTarget.value }))}><option value="all">All servers</option>{filterValues.servers.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label className="search-control"><span>Provenance</span><select value={streamFilters.provenance} onChange={(event) => setStreamFilters((current) => ({ ...current, provenance: event.currentTarget.value }))}><option value="all">All provenance</option>{filterValues.provenances.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <span className="toolbar-spacer" />
              <div className="control-cluster"><span>Rows</span><div className="segmented" role="group" aria-label="Row density">
                {(['compact', 'default', 'relaxed'] as const).map((density) => (
                  <button key={density} type="button" aria-pressed={currentDensity === density} onClick={() => updatePreference(preferences.streamView === 'terminal'
                    ? { terminalDensity: density }
                    : { tableDensity: density })}>{density === 'compact' ? '22' : density === 'default' ? '31' : '38'}</button>
                ))}
              </div></div>
              <div className="control-cluster"><span>Dock</span><div className="segmented" role="group" aria-label="Detail dock placement">
                <button
                  type="button"
                  aria-pressed={storedPlacement === 'right'}
                  onClick={() => updatePreference(preferences.streamView === 'terminal' ? { terminalDrawer: 'right' } : { tableDrawer: 'right' })}
                >
                  Right
                </button>
                <button
                  type="button"
                  aria-pressed={storedPlacement === 'bottom'}
                  onClick={() => updatePreference(preferences.streamView === 'terminal' ? { terminalDrawer: 'bottom' } : { tableDrawer: 'bottom' })}
                >
                  Bottom
                </button>
              </div></div>
            </div>
          </div>

          <RuntimeNotificationStack
            alerts={viewModel.alerts}
            onEvidence={(eventId) => {
              const event = viewModel.streamEvents.find((candidate) => candidate.id === eventId);
              if (event) void openEvidence(event, null);
            }}
          />

          <div className="stream-mode" aria-live="polite">
            <span><i data-state={viewModel.workspaceState} />{formatStreamMode(eventStream.mode)}</span>
            <span>{visibleEvents.length} shown · {eventStream.totalCount} matching{eventStream.unseenCount ? ` · ${eventStream.unseenCount} unseen` : ''}</span>
            {eventStream.mode === 'browsing' ? <button type="button" className="button secondary" onClick={() => setEventStream(returnToLive)}>Return to live</button> : null}
            {eventStream.mode === 'browsing' && eventStream.windowStart > 0 ? <button type="button" className="button secondary" onClick={() => setEventStream((current) => pageStreamWindow(current, 'newer'))}>Newer events</button> : null}
            {eventStream.mode === 'browsing' && eventStream.windowStart + eventStream.windowSize < eventStream.events.length ? <button type="button" className="button secondary" onClick={() => setEventStream((current) => pageStreamWindow(current, 'older'))}>Older events</button> : null}
            {eventStream.events.length > eventStream.windowSize && eventStream.mode !== 'browsing' ? (
              <button type="button" className="button secondary" onClick={() => {
                const anchor = visibleEvents.at(-1);
                if (anchor) setEventStream((current) => browseFrom(current, anchor.id));
              }}>Browse older</button>
            ) : null}
            <span id="stream-filter-status" role="status">{eventStream.totalCount} matching events in the active environment</span>
          </div>

          {preferences.streamView === 'terminal' ? (
            <TerminalStream
              events={visibleEvents}
              emptyReason={eventStream.sourceEvents.length === 0 ? 'no-telemetry' : 'no-matches'}
              selectedId={eventStream.selectedEventId}
              onSelect={openEvidence}
            />
          ) : (
            <TableStream
              events={visibleEvents}
              emptyReason={eventStream.sourceEvents.length === 0 ? 'no-telemetry' : 'no-matches'}
              selectedId={eventStream.selectedEventId}
              onSelect={openEvidence}
            />
          )}

          <footer className="status-bar" aria-label="Runtime Monitor status">
            <span>{viewModel.monitorLabel}</span>
            <span>{viewModel.environmentLabel.toUpperCase()}</span>
            <span>Local only</span>
            <span>Retention 30 days</span>
            <span><b>Storage</b> {viewModel.storageLabel}</span>
            <i />
            <span><b>Backlog</b> 0</span>
            <span title={[
              scan?.parserCompatibility?.compatibilityBasis,
              scan?.parserCompatibility?.testedBuild,
              scan?.parserCompatibility?.exclusionReason,
              scan?.parserCompatibility?.affectedEventFamilies?.length
                ? `Affected: ${scan.parserCompatibility.affectedEventFamilies.join(', ')}`
                : null
            ].filter(Boolean).join(' · ') || undefined}>
              <b>Parser</b> {scan?.parserCompatibility?.familyId || scan?.parserCompatibility?.profileId || 'Unknown'}
              {scan?.parserCompatibility?.familyVersion ? ` @ ${scan.parserCompatibility.familyVersion}` : ''}
            </span>
          </footer>
        </section>

        {eventStream.selectionUnavailable && detail.status !== 'empty' ? <p className="visually-hidden" role="status">Selected event is no longer available because it was removed by retention or the current filter.</p> : null}
        {detail.status !== 'empty' ? <DetailDock
          detail={detail}
          eventsSinceSelection={eventStream.eventsSinceSelection}
          onRelated={(eventId) => void openRelatedEvidence(eventId)}
          placement={effectivePlacement}
          storedPlacement={storedPlacement}
          headingRef={detailHeadingRef}
          onClose={closeDetail}
        /> : null}
      </main>
    </div>
  );

  function openSyntheticDetail(instrument: InstrumentState, trigger: HTMLElement) {
    lastSelectionTrigger.current = trigger;
    setDetail({
      status: instrument.value === 'Unsupported' ? 'unsupported' : 'ready',
      selected: null,
      detail: null,
      message: [
        `${instrument.label}: ${instrument.value}`,
        instrument.detail,
        instrument.provenance,
        instrument.drilldown
      ].filter(Boolean).join(' · ')
    });
    window.requestAnimationFrame(() => detailHeadingRef.current?.focus());
  }

  function openPartyFallback(message: string, trigger: HTMLElement) {
    lastSelectionTrigger.current = trigger;
    setEventStream((current) => selectStreamEvent(current, null));
    setDetail({
      status: 'retention-removed',
      selected: null,
      detail: null,
      message
    });
    window.requestAnimationFrame(() => detailHeadingRef.current?.focus());
  }

  async function openRelatedEvidence(eventId: string) {
    const environmentKey = detail.detail?.environmentKey || snapshot?.scan?.environmentKey || '';
    if (!environmentKey) return;
    try {
      const related = await client.events.getEvidenceDetail({ environmentKey, eventId });
      await openEvidence({
        id: related.eventId,
        kind: related.kind === 'shard' || related.kind === 'action' || related.kind === 'session' ? related.kind : 'runtime',
        urgency: 'normal',
        summary: related.summary,
        context: related.eventType,
        environment: related.environmentKey,
        timestamp: related.sourceTimestamp,
        ageLabel: 'selected',
        confidence: related.confidence,
        evidenceAvailable: related.evidence.availability === 'available',
        sourceLine: related.evidence.lineNumber,
        row: { id: related.eventId, eventId: related.eventId, environmentKey: related.environmentKey, evidenceAvailable: related.evidence.availability === 'available' }
      }, null);
    } catch (error) {
      setDetail((current) => ({ ...current, status: 'error', message: error instanceof Error ? error.message : 'Related event detail could not be loaded.' }));
    }
  }
}

function formatStreamMode(mode: import('./shared-event-stream-model').StreamMode): string {
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function TerminalStream({
  events,
  emptyReason,
  selectedId,
  onSelect
}: {
  events: readonly StreamEvent[];
  emptyReason: 'no-matches' | 'no-telemetry';
  selectedId: string | null;
  onSelect: (event: StreamEvent, trigger: HTMLElement | null) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  if (events.length === 0) return <EmptyStream reason={emptyReason} />;
  const activeIndex = Math.max(0, selectedId ? events.findIndex((event) => event.id === selectedId) : 0);
  const activeEventId = events[activeIndex]?.id;

  function moveSelection(index: number) {
    const event = events[Math.max(0, Math.min(index, events.length - 1))];
    if (!event) return;
    onSelect(event, null);
    window.requestAnimationFrame(() => document.getElementById(`terminal-event-${CSS.escape(event.id)}`)?.focus());
  }

  return (
    <div
      ref={listRef}
      className="terminal-stream"
      role="listbox"
      aria-label="Terminal runtime events"
      aria-activedescendant={activeEventId ? `terminal-event-${CSS.escape(activeEventId)}` : undefined}
      tabIndex={0}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key === 'ArrowDown') { keyboardEvent.preventDefault(); moveSelection(activeIndex + 1); }
        if (keyboardEvent.key === 'ArrowUp') { keyboardEvent.preventDefault(); moveSelection(activeIndex - 1); }
        if (keyboardEvent.key === 'Home') { keyboardEvent.preventDefault(); moveSelection(0); }
        if (keyboardEvent.key === 'End') { keyboardEvent.preventDefault(); moveSelection(events.length - 1); }
        if ((keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') && events[activeIndex]) {
          keyboardEvent.preventDefault(); onSelect(events[activeIndex], listRef.current);
        }
      }}
    >
      {events.map((event) => {
        const line = formatTerminalEvent(event);
        return (
        <button
          type="button"
          role="option"
          id={`terminal-event-${CSS.escape(event.id)}`}
          tabIndex={-1}
          aria-selected={event.id === selectedId}
          aria-label={line.accessibleLabel}
          className="terminal-row"
          data-kind={event.kind}
          data-urgency={event.urgency}
          key={event.id}
          onClick={(domEvent) => void onSelect(event, domEvent.currentTarget)}
        >
          <span className="mono time" title={line.timeLabel}>{line.time}</span>
          <span className="kind-tag">{line.kind}</span>
          <span className="urgency-mark" aria-label={`Urgency ${line.urgency}`}>{event.urgency === 'normal' ? '·' : event.urgency === 'warning' ? '▲' : '■'} <span className="visually-hidden">{line.urgency}</span></span>
          <strong title={line.summary}>{line.summary}</strong>
          <span title={line.context}>{line.context}</span>
          <span className="confidence" title={line.qualification}>{line.qualification}</span>
        </button>
        );
      })}
    </div>
  );
}

function TableStream({
  events,
  emptyReason,
  selectedId,
  onSelect
}: {
  events: readonly StreamEvent[];
  emptyReason: 'no-matches' | 'no-telemetry';
  selectedId: string | null;
  onSelect: (event: StreamEvent, trigger: HTMLElement | null) => void;
}) {
  if (events.length === 0) return <EmptyStream reason={emptyReason} />;

  const activeIndex = Math.max(0, selectedId ? events.findIndex((event) => event.id === selectedId) : 0);
  const activeEventId = events[activeIndex]?.id;

  function moveSelection(index: number) {
    const event = events[Math.max(0, Math.min(index, events.length - 1))];
    if (!event) return;
    onSelect(event, null);
    window.requestAnimationFrame(() => document.getElementById(tableEventId(event.id))?.focus());
  }

  return (
    <div
      className="table-stream"
      role="grid"
      aria-label="Table runtime events"
      aria-rowcount={events.length}
      aria-activedescendant={activeEventId ? tableEventId(activeEventId) : undefined}
      tabIndex={0}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key === 'ArrowDown') { keyboardEvent.preventDefault(); moveSelection(activeIndex + 1); }
        if (keyboardEvent.key === 'ArrowUp') { keyboardEvent.preventDefault(); moveSelection(activeIndex - 1); }
        if (keyboardEvent.key === 'Home') { keyboardEvent.preventDefault(); moveSelection(0); }
        if (keyboardEvent.key === 'End') { keyboardEvent.preventDefault(); moveSelection(events.length - 1); }
        if ((keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') && events[activeIndex]) {
          keyboardEvent.preventDefault(); onSelect(events[activeIndex], null);
        }
      }}
    >
      <table>
        <caption className="visually-hidden">Live runtime events. Rows are ordered newest first.</caption>
        <thead><tr role="row">
          <th scope="col">Kind</th><th scope="col">Severity</th><th scope="col">Summary</th>
          <th scope="col" className="column-attributes">Attributes</th><th scope="col" className="column-shard">Shard</th><th scope="col">Age</th>
        </tr></thead>
        <tbody>
          {events.map((event, index) => {
            const row = formatTableEvent(event);
            return (
              <tr
                id={tableEventId(event.id)}
                role="row"
                tabIndex={index === activeIndex ? 0 : -1}
                aria-selected={event.id === selectedId}
                aria-label={row.accessibleLabel}
                data-kind={event.kind}
                data-urgency={event.urgency}
                key={event.id}
                onClick={(domEvent) => void onSelect(event, domEvent.currentTarget)}
                onKeyDown={(keyboardEvent) => {
                  if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
                    keyboardEvent.preventDefault(); onSelect(event, keyboardEvent.currentTarget);
                  }
                  if (keyboardEvent.key === 'ArrowDown') { keyboardEvent.preventDefault(); moveSelection(index + 1); }
                  if (keyboardEvent.key === 'ArrowUp') { keyboardEvent.preventDefault(); moveSelection(index - 1); }
                }}
              >
                <td><span className="kind-cell"><i className="kind-dot" data-kind={event.kind} /><b className="kind-tag">{row.kind}</b></span></td>
                <td><b className="severity-chip">{event.urgency === 'normal' ? '· ' : event.urgency === 'warning' ? '▲ ' : '■ '}{row.severity}</b></td>
                <td title={row.summary}>{row.summary}</td>
                <td className="column-attributes" title={row.attributes}><span className="attribute-chip">{row.attributes}</span></td>
                <td className="column-shard" title={row.shard}>{row.shard}</td>
                <td title={row.ageLabel} aria-label={row.ageLabel}>{row.age}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function tableEventId(eventId: string): string {
  return `table-event-${encodeURIComponent(eventId)}`;
}

function DetailDock({
  detail,
  eventsSinceSelection,
  onRelated,
  placement,
  storedPlacement,
  headingRef,
  onClose
}: {
  detail: DetailState;
  eventsSinceSelection: number;
  onRelated: (eventId: string) => void;
  placement: DrawerPlacement;
  storedPlacement: DrawerPlacement;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
}) {
  return (
    <aside className="detail-dock" data-placement={placement} aria-label="Shared drilldown detail">
      <div className="dock-heading">
        <div>
          <p className="dock-kicker">Event detail</p>
          <h2 ref={headingRef} tabIndex={-1}>{detail.selected?.summary || 'Detail host'}</h2>
        </div>
        <button type="button" className="icon-button" title="Close detail" onClick={onClose}>
          ESC
        </button>
      </div>
      {placement !== storedPlacement ? <p className="placement-note">Temporary responsive placement. Stored preference is preserved.</p> : null}
      <StateMessage status={detail.status} message={detail.message} />
      {detail.status !== 'empty' && detail.selected ? <p className="selection-age" role="status">{eventsSinceSelection} events since selection</p> : null}
      {detail.selected ? (
        <dl className="detail-facts">
          <div><dt>Event ID</dt><dd>{detail.selected.id}</dd></div>
          <div><dt>Kind</dt><dd>{detail.selected.kind}</dd></div>
          <div><dt>Source line</dt><dd>{detail.selected.sourceLine ?? 'Unknown'}</dd></div>
          <div><dt>Event time</dt><dd>{formatInstantContext(detail.selected.timestamp)}</dd></div>
          <div><dt>Evidence</dt><dd>{detail.selected.evidenceAvailable ? 'Available locally' : 'Redacted or absent'}</dd></div>
        </dl>
      ) : null}
      {detail.detail ? (
        <>
          <dl className="detail-facts">
            <div><dt>Source</dt><dd>{detail.detail.provenance} · {detail.detail.confidence}</dd></div>
            <div><dt>Build</dt><dd>{detail.detail.gameBuild || 'Unknown'} · {detail.detail.gameChannel || 'Unknown'}</dd></div>
            <div><dt>Payload</dt><dd><code>{JSON.stringify(detail.detail.payload)}</code></dd></div>
            <div><dt>Correlations</dt><dd>{Object.entries(detail.detail.correlations).map(([key, value]) => `${key}: ${value}`).join(' · ') || 'None'}</dd></div>
          </dl>
          <h3>Evidence · {detail.detail.evidence.availability}</h3>
          <pre className="evidence-block">{detail.detail.evidence.rawContext.join('\n') || 'No retained raw context for this event.'}</pre>
          {detail.detail.related.length ? <div className="related-events"><h3>Related events</h3>{detail.detail.related.map((related) => <button type="button" key={related.eventId} onClick={() => onRelated(related.eventId)}>{related.relationship}: {related.eventType} · {related.eventId}</button>)}</div> : null}
        </>
      ) : null}
    </aside>
  );
}

function EmptyStream({ reason }: { reason: 'no-matches' | 'no-telemetry' }) {
  const noMatches = reason === 'no-matches';
  return (
    <section className="empty-state" aria-label="Empty runtime stream">
      <CircleHelp aria-hidden="true" />
      <h2>{noMatches ? 'No matching telemetry' : 'No telemetry in this scope'}</h2>
      <p>{noMatches
        ? 'The current literal search excludes all retained events. Reset search to restore the full stream.'
        : 'No events have been collected for the active source and environment yet.'}</p>
    </section>
  );
}

function StateMessage({ status, message }: { status: DetailState['status']; message: string }) {
  return (
    <p className="state-message" data-status={status} aria-live={status === 'loading' ? 'polite' : undefined}>
      {status.replaceAll('-', ' ')}: {message}
    </p>
  );
}

function SemanticPanel({ title, state, label, detail }: { title: string; state: string; label: string; detail: string }) {
  return (
    <section className="semantic-panel" data-state={state} aria-label={title}>
      <h2><span>{title}</span></h2>
      <div className="semantic-empty"><strong>{label}</strong><p>{detail}</p></div>
    </section>
  );
}

function PartySection({
  party,
  onSelect
}: {
  party: PartyViewState;
  onSelect: (evidenceEventId: string, trigger: HTMLElement, fallback: string) => void;
}) {
  const countLabel = party.confirmedCount === null
    ? party.overallLabel
    : `${party.confirmedCount} confirmed${party.possibleCount ? ` · ${party.possibleCount} possible` : ''}`;

  return (
    <section className="semantic-panel party-panel" data-state={party.state} aria-labelledby="party-heading">
      <h2 id="party-heading">
        <span>Party</span>
        <small>{countLabel}</small>
      </h2>
      <div className="party-summary">
        <div><span>Overall</span><strong>{party.overallLabel}</strong></div>
        <div><span>Freshness</span><strong title={formatInstantContext(party.exactFreshness)}>{party.freshnessLabel}</strong></div>
      </div>
      {party.members.length ? (
        <div className="party-members" role="list" aria-label="Known party members">
          {party.members.map((member) => <PartyMember key={member.id} member={member} onSelect={onSelect} />)}
        </div>
      ) : (
        <div className="semantic-empty"><strong>{party.label}</strong><p>{party.detail}</p></div>
      )}
      {party.transitions.length ? (
        <div className="party-transitions" aria-label="Recent party alerts">
          <h3>Recent changes</h3>
          <div role="list">
            {party.transitions.map((transition) => <PartyTransition key={transition.id} transition={transition} onSelect={onSelect} />)}
          </div>
        </div>
      ) : null}
      <p className="party-limitation">{party.limitation} Social telemetry stays on this device.</p>
    </section>
  );
}

function PartyMember({ member, onSelect }: {
  member: PartyMemberViewState;
  onSelect: (evidenceEventId: string, trigger: HTMLElement, fallback: string) => void;
}) {
  const fallback = `${member.handle}: ${member.membershipLabel} membership; ${member.connectionLabel} connection; ${member.transitionLabel}; ${member.freshnessLabel}; confidence ${member.confidence}. The referenced evidence is no longer in the retained stream.`;
  return (
    <button
      type="button"
      role="listitem"
      className="party-member"
      data-leader={member.isLeader || undefined}
      data-membership={member.membershipState}
      onClick={(event) => onSelect(member.evidenceEventId || member.id, event.currentTarget, fallback)}
      aria-label={`${member.handle}, ${member.isLeader ? 'leader, ' : ''}${member.membershipLabel} membership, ${member.connectionLabel} connection, ${member.freshnessLabel}`}
    >
      <span className="party-member-heading"><strong title={member.handle}>{member.handle}</strong>{member.isLeader ? <em>Leader</em> : null}{member.isLocalPlayer ? <em>You</em> : null}</span>
      <span className="party-member-facts"><span>{member.membershipLabel}</span><span data-state={member.connectionState}>{member.connectionLabel}</span><time title={formatInstantContext(member.observedAt)}>{member.freshnessLabel}</time></span>
      <small>{member.transitionLabel} · Observed · Confidence {member.confidence}</small>
    </button>
  );
}

function PartyTransition({ transition, onSelect }: {
  transition: PartyTransitionViewState;
  onSelect: (evidenceEventId: string, trigger: HTMLElement, fallback: string) => void;
}) {
  const fallback = `${transition.label}${transition.subjectLabel ? `: ${transition.subjectLabel}` : ''}; ${transition.freshnessLabel}; confidence ${transition.confidence}. The referenced evidence is no longer in the retained stream.`;
  return (
    <button type="button" role="listitem" className="party-transition" onClick={(event) => onSelect(transition.evidenceEventId, event.currentTarget, fallback)}>
      <span><strong>{transition.label}</strong>{transition.subjectLabel ? <small>{transition.subjectLabel}</small> : null}</span>
      <time title={formatInstantContext(transition.observedAt)}>{transition.freshnessLabel}</time>
    </button>
  );
}

function MissionDestinationSection({ value, onSelect }: {
  value: MissionDestinationViewState;
  onSelect: (evidenceEventId: string, trigger: HTMLElement, fallback: string) => void;
}) {
  const transition = value.transition;
  const fallback = transition
    ? `${transition.label}: ${transition.destinationLabel}; ${transition.freshnessLabel}; confidence ${transition.confidence}. The referenced evidence is no longer in the retained stream.`
    : '';
  return (
    <section className="semantic-panel mission-destination-panel" data-state={value.state} aria-labelledby="mission-destination-heading">
      <h2 id="mission-destination-heading"><span>Mission / destination</span><small title={formatInstantContext(value.exactFreshness)}>{value.freshnessLabel}</small></h2>
      <div className="mission-destination-domains">
        <section aria-labelledby="mission-capability-heading" data-state={value.missionState}>
          <h3 id="mission-capability-heading">Mission</h3>
          <strong>{value.missionLabel}</strong>
          <p>{value.missionDetail}</p>
        </section>
        <section aria-labelledby="destination-capability-heading" data-state={value.destinationState}>
          <h3 id="destination-capability-heading">Destination / travel</h3>
          <strong title={value.destinationLabel}>{value.destinationLabel}</strong>
          <p>{value.destinationDetail}</p>
        </section>
      </div>
      {transition ? (
        <button type="button" className="destination-transition" onClick={(event) => onSelect(transition.evidenceEventId, event.currentTarget, fallback)}>
          <span><strong>{transition.label}</strong><small title={transition.destinationLabel}>{transition.destinationLabel}</small></span>
          <span><time title={formatInstantContext(transition.observedAt)}>{transition.freshnessLabel}</time><small>Observed · Confidence {transition.confidence}</small></span>
        </button>
      ) : null}
      <p className="party-limitation">{value.limitation} Raw telemetry stays on this device.</p>
    </section>
  );
}

function formatInstrumentState(state: InstrumentState['state']): string {
  return state.replace('-', ' ');
}

function StatusPill({ state, label }: { state: string; label: string }) {
  return <span className="status-pill" data-state={state}><i aria-hidden="true" /><span><small>Monitor</small><strong>{label}</strong></span></span>;
}

function Metric({ label, value, title }: { label: string; value: string; title?: string | undefined }) {
  return (
    <span className="header-metric" title={title}>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function SettingsPanel({ snapshot, preferences, onPreferenceChange, onRetentionChange, onDelete, onReset }: {
  snapshot: SettingsSnapshot | null;
  preferences: LocalPreferences;
  onPreferenceChange: (patch: Partial<LocalPreferences>) => void;
  onRetentionChange: (days: number) => Promise<void>;
  onDelete: (mode: 'sensitive_evidence' | 'environment' | 'all_telemetry') => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const storage = snapshot?.storage;
  return <section className="settings-panel" aria-label="Local settings and privacy">
    <h2>Local settings &amp; privacy</h2>
    <p>These controls affect this device only. Preferences and raw evidence are not synchronized.</p>
    <label>Stream view <select value={preferences.streamView} onChange={(event) => onPreferenceChange({ streamView: event.target.value as LocalPreferences['streamView'] })}>
      <option value="terminal">Terminal</option><option value="table">Table</option>
    </select></label>
    <label>Retain telemetry (days) <input type="number" min="1" max="365" value={snapshot?.settings.retentionDays ?? 30} onChange={(event) => void onRetentionChange(Number(event.target.value))} /></label>
    <dl>
      <div><dt>Stored events</dt><dd>{storage?.eventCount ?? 'Calculating'}</dd></div>
      <div><dt>Storage</dt><dd>{storage?.databaseSizeBytes == null ? 'Calculating' : formatBytes(storage.databaseSizeBytes)}</dd></div>
      <div><dt>Oldest event</dt><dd>{storage?.oldestEventAt ? new Date(storage.oldestEventAt).toLocaleString() : 'None'}</dd></div>
      <div><dt>Newest event</dt><dd>{storage?.newestEventAt ? new Date(storage.newestEventAt).toLocaleString() : 'None'}</dd></div>
    </dl>
    <div className="settings-actions" aria-label="Destructive local data actions">
      <button type="button" onClick={() => void onDelete('sensitive_evidence')}>Delete sensitive evidence</button>
      <button type="button" onClick={() => void onDelete('environment')}>Delete current environment</button>
      <button type="button" onClick={() => void onDelete('all_telemetry')}>Delete all telemetry</button>
      <button type="button" onClick={() => void onReset()}>Reset app data</button>
    </div>
  </section>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function HeaderTelemetryMetric({
  instrument,
  onSelect
}: {
  instrument: InstrumentState;
  onSelect: (instrument: InstrumentState, trigger: HTMLElement) => void;
}) {
  const accessibleValue = [instrument.value, instrument.detail].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      className="header-metric header-telemetry-metric"
      data-state={instrument.state}
      title={accessibleValue}
      aria-label={`${instrument.label}: ${accessibleValue}`}
      onClick={(event) => onSelect(instrument, event.currentTarget)}
    >
      <small>{instrument.label}</small>
      <strong>{instrument.value}</strong>
      <span className="header-metric-detail">{instrument.detail}</span>
    </button>
  );
}

function upsertSource(current: PublicRuntimeSource[], source: PublicRuntimeSource): PublicRuntimeSource[] {
  const index = current.findIndex((candidate) => candidate.sourceId === source.sourceId);
  if (index === -1) return [source, ...current];
  return current.map((candidate, candidateIndex) => candidateIndex === index ? source : candidate);
}

function loadLocalPreferences(): LocalPreferences {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(preferenceKey) || 'null') as Partial<LocalPreferences> | null;
    return {
      streamView: parsed?.streamView === 'table' ? 'table' : DEFAULT_PREFERENCES.streamView,
      terminalDensity: parseDensity(parsed?.terminalDensity, DEFAULT_PREFERENCES.terminalDensity),
      tableDensity: parseDensity(parsed?.tableDensity, DEFAULT_PREFERENCES.tableDensity),
      terminalDrawer: parseDrawer(parsed?.terminalDrawer, DEFAULT_PREFERENCES.terminalDrawer),
      tableDrawer: parseDrawer(parsed?.tableDrawer, DEFAULT_PREFERENCES.tableDrawer)
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function parseDensity(value: unknown, fallback: Density): Density {
  return value === 'compact' || value === 'default' || value === 'relaxed' ? value : fallback;
}

function parseDrawer(value: unknown, fallback: DrawerPlacement): DrawerPlacement {
  return value === 'right' || value === 'bottom' ? value : fallback;
}

function createEmptySnapshot(): MonitorSnapshot {
  return {
    monitor: {
      active: false,
      sourceId: null,
      sequence: 0,
      pendingScan: false,
      tailer: null,
      checkpoint: null,
      storage: { status: 'initializing', errorCode: null, recoverable: true }
    },
    source: null,
    scan: null,
    subscriptions: {
      sequence: 0,
      subscriberCount: 0
    }
  };
}

function isMonitorStatePayload(value: unknown): value is MonitorSnapshot['monitor'] {
  return Boolean(value && typeof value === 'object' && 'active' in value && 'sequence' in value);
}
