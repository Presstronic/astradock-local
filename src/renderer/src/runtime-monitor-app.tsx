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
  const [now, setNow] = useState<Date>(() => clock());
  const [search, setSearch] = useState('');
  const [eventStream, setEventStream] = useState(() => createSharedEventStreamState({ view: preferences.streamView }));
  const [selected, setSelected] = useState<StreamEvent | null>(null);
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
  const lastPartyTransitionId = useRef<string | null>(null);
  const lastDestinationTransitionId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    async function boot() {
      setLoading(true);
      try {
        const [discovery, nextSnapshot] = await Promise.all([
          client.source.discover(),
          client.monitor.getSnapshot()
        ]);
        if (!active) return;
        setSources([...discovery.sources]);
        setActiveSource(discovery.activeSource || nextSnapshot.source || null);
        setSnapshot(nextSnapshot);
        setScan(nextSnapshot.scan);
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
    setEventStream((current) => updateStreamQuery(current, { search }));
  }, [search]);

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
    setSelected(event);
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
      const evidence = await client.events.getEvidenceDetail({ kind: toEvidenceKind(event.kind), id: event.id });
      setDetail({
        status: 'ready',
        selected: event,
        detail: evidence,
        message: 'Permitted local evidence detail loaded.'
      });
    } catch (error) {
      setDetail({
        status: 'not-found',
        selected: event,
        detail: null,
        message: error instanceof Error ? error.message : 'Evidence detail is no longer retained.'
      });
    }
  }

  function closeDetail() {
    setSelected(null);
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
    setPreferences((current) => ({ ...current, ...patch }));
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
        <button type="button">Settings</button>
      </nav>

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
                <input value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="literal match" />
              </label>
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

          <RuntimeNotificationStack alerts={viewModel.alerts} />

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
          </div>

          {preferences.streamView === 'terminal' ? (
            <TerminalStream events={visibleEvents} emptyReason={search ? 'no-matches' : 'no-telemetry'} selectedId={selected?.id || null} onSelect={openEvidence} />
          ) : (
            <TableStream events={visibleEvents} emptyReason={search ? 'no-matches' : 'no-telemetry'} selectedId={selected?.id || null} onSelect={openEvidence} />
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
    setSelected(null);
    setEventStream((current) => selectStreamEvent(current, null));
    setDetail({
      status: 'retention-removed',
      selected: null,
      detail: null,
      message
    });
    window.requestAnimationFrame(() => detailHeadingRef.current?.focus());
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
  if (events.length === 0) return <EmptyStream reason={emptyReason} />;
  return (
    <div className="terminal-stream" role="listbox" aria-label="Terminal runtime events">
      {events.map((event) => (
        <button
          type="button"
          role="option"
          aria-selected={event.id === selectedId}
          className="terminal-row"
          data-kind={event.kind}
          data-urgency={event.urgency}
          key={event.id}
          onClick={(domEvent) => void onSelect(event, domEvent.currentTarget)}
        >
          <span className="mono time" title={formatInstantContext(event.timestamp)} aria-label={formatInstantContext(event.timestamp)}>{formatLocalClock(event.timestamp)}</span>
          <span className="kind-tag">{event.kind}</span>
          <span className="urgency-mark" aria-label={`Urgency ${event.urgency}`}>{event.urgency === 'normal' ? '·' : event.urgency === 'warning' ? '▲' : '■'}</span>
          <strong>{event.summary}</strong>
          <span>{event.context}</span>
          <span className="confidence">{event.confidence}</span>
        </button>
      ))}
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
  return (
    <div className="table-stream" role="grid" aria-label="Table runtime events">
      <div className="table-head" role="row"><span>Kind</span><span>Severity</span><span>Summary</span><span>Attributes</span><span>Shard</span><span>Age</span></div>
      {events.map((event) => (
        <button type="button" role="row" className="table-row" key={event.id} aria-selected={event.id === selectedId} data-kind={event.kind} data-urgency={event.urgency} onClick={(domEvent) => void onSelect(event, domEvent.currentTarget)}>
          <span><i className="kind-dot" data-kind={event.kind} /><b className="kind-tag">{event.kind}</b></span>
          <span><b className="severity-chip">{event.urgency === 'normal' ? '· Routine' : event.urgency === 'warning' ? '▲ Notice' : `■ ${event.urgency}`}</b></span>
          <span>{event.summary}</span>
          <span><b className="attribute-chip">Conf {event.confidence}</b></span>
          <span>{event.context}</span>
          <span title={formatInstantContext(event.timestamp)} aria-label={`${event.ageLabel}; ${formatInstantContext(event.timestamp)}`}>{event.ageLabel}</span>
        </button>
      ))}
    </div>
  );
}

function DetailDock({
  detail,
  placement,
  storedPlacement,
  headingRef,
  onClose
}: {
  detail: DetailState;
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
        <pre className="evidence-block">{detail.detail.evidence.rawContext.join('\n') || 'No retained raw context for this event.'}</pre>
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

function toEvidenceKind(kind: StreamEvent['kind']): 'shard' | 'action' | 'session' | 'runtime' {
  if (kind === 'action' || kind === 'session') return kind;
  if (kind === 'party' || kind === 'zone' || kind === 'vehicle' || kind === 'navigation' || kind === 'runtime') return 'runtime';
  return 'shard';
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
