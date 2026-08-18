import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRightToLine,
  Bell,
  CircleHelp,
  DatabaseZap,
  Gauge,
  ListFilter,
  MonitorDot,
  Pause,
  Play,
  RotateCcw,
  Rows3,
  Search,
  Settings,
  ShieldCheck,
  Square,
  Table2,
  TerminalSquare,
  X
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
  formatSourceState,
  type InstrumentState,
  type StreamEvent,
  type StreamView
} from './runtime-monitor-model';

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
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);
  const [scan, setScan] = useState<RendererScanResult | null>(null);
  const [preferences, setPreferences] = useState<LocalPreferences>(() => loadLocalPreferences());
  const [now, setNow] = useState<Date>(() => clock());
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<StreamEvent | null>(null);
  const [detail, setDetail] = useState<DetailState>({
    status: 'empty',
    selected: null,
    detail: null,
    message: 'Select an event, instrument, party member, mission, or alert to inspect local evidence.'
  });
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const lastSelectionTrigger = useRef<HTMLElement | null>(null);

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
    sources,
    activeSource,
    snapshot,
    scan,
    now
  }), [activeSource, fatalError, loading, now, scan, snapshot, sources]);

  const visibleEvents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return viewModel.streamEvents;
    return viewModel.streamEvents.filter((event) => [
      event.kind,
      event.summary,
      event.context,
      event.environment,
      event.confidence
    ].some((value) => value.toLowerCase().includes(term)));
  }, [search, viewModel.streamEvents]);

  const currentDensity = preferences.streamView === 'terminal' ? preferences.terminalDensity : preferences.tableDensity;
  const storedPlacement = preferences.streamView === 'terminal' ? preferences.terminalDrawer : preferences.tableDrawer;
  const effectivePlacement = storedPlacement;

  async function chooseSource() {
    try {
      setFatalError(null);
      const result = await client.source.choose();
      if (!result?.source) return;
      setActiveSource(result.saved ? result.source : null);
      setSources((current) => upsertSource(current, result.source));
      if (result.saved) {
        const nextScan = await client.monitor.scan({ sourceId: result.source.sourceId, options: {} });
        setScan(nextScan);
      } else {
        setFatalError(result.source.validation.message);
      }
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : 'Source selection failed.');
    }
  }

  async function scanSource() {
    if (!viewModel.source) {
      setFatalError('Choose a local game.log source first.');
      return;
    }
    try {
      setFatalError(null);
      const nextScan = await client.monitor.scan({ sourceId: viewModel.source.sourceId, options: {} });
      setScan(nextScan);
      setActiveSource(nextScan.source);
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : 'Source scan failed.');
    }
  }

  async function startMonitor() {
    if (!viewModel.source) {
      setFatalError('Choose a local game.log source first.');
      return;
    }
    try {
      setFatalError(null);
      const result = await client.monitor.start({ sourceId: viewModel.source.sourceId, options: { startMode: 'from_current_end' } });
      setSnapshot((current) => ({ ...(current || createEmptySnapshot()), monitor: result.monitor, scan: result.scan, source: result.scan.source }));
      setScan(result.scan);
      setActiveSource(result.scan.source);
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : 'Monitor start failed.');
    }
  }

  async function stopMonitor() {
    try {
      setFatalError(null);
      const monitor = await client.monitor.stop();
      if (isMonitorStatePayload(monitor)) {
        setSnapshot((current) => ({ ...(current || createEmptySnapshot()), monitor }));
      }
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : 'Monitor stop failed.');
    }
  }

  async function openEvidence(event: StreamEvent, trigger: HTMLElement | null) {
    setSelected(event);
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
    <div className="runtime-shell" data-density={currentDensity} data-detail-placement={effectivePlacement}>
      <a className="skip-link" href="#runtime-stream">Skip to stream</a>
      <a className="skip-link" href="#current-state">Skip to current state</a>

      <header className="runtime-header" aria-label="Runtime Monitor source and health">
        <div className="product-lockup" aria-label="AstraDock Local Runtime Monitor">
          <MonitorDot aria-hidden="true" />
          <div>
            <span className="product-name">AstraDock Local</span>
            <span className="workspace-name">Runtime Monitor</span>
          </div>
        </div>
        <nav className="workspace-tabs" aria-label="Workspaces">
          <a href="#runtime-main" aria-current="page">Runtime Monitor</a>
          <button type="button" aria-disabled="true" title="Post-MVP workspace">Data Operations</button>
          <button type="button" aria-disabled="true" title="Post-MVP workspace">History & Analytics</button>
        </nav>
        <section className="source-strip" aria-label="Source health">
          <StatusPill state={viewModel.workspaceState} label={viewModel.monitorLabel} />
          <Metric label="Environment" value={viewModel.environmentLabel.toUpperCase()} />
          <Metric label="Build" value={viewModel.buildLabel} />
          <Metric label="Freshness" value={viewModel.freshnessLabel} title={viewModel.exactFreshness || undefined} />
          {viewModel.warningCount > 0 ? <Metric label="Warnings" value={String(viewModel.warningCount)} /> : null}
        </section>
        <div className="global-actions" aria-label="Monitor actions">
          <button type="button" className="button secondary" onClick={() => void chooseSource()}>Choose source</button>
          <button type="button" className="button secondary" onClick={() => void scanSource()}>Scan</button>
          <button type="button" className="button primary" onClick={() => void startMonitor()} disabled={snapshot?.monitor.active === true}>
            <Play aria-hidden="true" /> Start
          </button>
          <button type="button" className="button danger" onClick={() => void stopMonitor()} disabled={snapshot?.monitor.active !== true}>
            <Pause aria-hidden="true" /> Stop
          </button>
        </div>
      </header>

      <main id="runtime-main" className="runtime-main" aria-label="Runtime Monitor">
        <aside id="current-state" className="current-state" aria-label="Current runtime state">
          <section className="source-card" aria-label="Active source">
            <h2>Source</h2>
            <p className="source-label">{viewModel.source?.displayLabel || 'No validated game.log selected'}</p>
            <p className="source-detail">{viewModel.source ? formatSourceState(viewModel.source) : 'Choose a local Star Citizen source to begin.'}</p>
          </section>

          <section className="instrument-list" aria-label="Current-state instruments">
            <h2>Instruments</h2>
            {viewModel.instruments.map((instrument) => (
              <button
                className="instrument"
                type="button"
                key={instrument.id}
                data-state={instrument.state}
                onClick={(event) => openSyntheticDetail(instrument, event.currentTarget)}
              >
                <span>{instrument.label}</span>
                <strong>{instrument.value}</strong>
                <small>{instrument.detail}</small>
                <em>{instrument.provenance}</em>
              </button>
            ))}
          </section>

          <SemanticPanel state={viewModel.party.state} title={viewModel.party.title} label={viewModel.party.label} detail={viewModel.party.detail} />
          <SemanticPanel state={viewModel.mission.state} title={viewModel.mission.title} label={viewModel.mission.label} detail={viewModel.mission.detail} />
        </aside>

        <section id="runtime-stream" className="stream-workspace" aria-label="Runtime event stream">
          <div className="stream-toolbar">
            <div>
              <h1>Runtime Monitor</h1>
              <p>Local-only telemetry from the approved renderer gateway.</p>
            </div>
            <div className="stream-controls" aria-label="Stream controls">
              <div className="segmented" role="group" aria-label="Stream view">
                <button type="button" aria-pressed={preferences.streamView === 'terminal'} onClick={() => updatePreference({ streamView: 'terminal' })}>
                  <TerminalSquare aria-hidden="true" /> Terminal
                </button>
                <button type="button" aria-pressed={preferences.streamView === 'table'} onClick={() => updatePreference({ streamView: 'table' })}>
                  <Table2 aria-hidden="true" /> Table
                </button>
              </div>
              <label className="select-control">
                <span>Density</span>
                <select
                  value={currentDensity}
                  onChange={(event) => updatePreference(preferences.streamView === 'terminal'
                    ? { terminalDensity: event.currentTarget.value as Density }
                    : { tableDensity: event.currentTarget.value as Density })}
                >
                  <option value="compact">Compact 22px</option>
                  <option value="default">Default 31px</option>
                  <option value="relaxed">Relaxed 38px</option>
                </select>
              </label>
              <div className="segmented icon-only" role="group" aria-label="Detail dock placement">
                <button
                  type="button"
                  title="Right detail dock"
                  aria-pressed={storedPlacement === 'right'}
                  onClick={() => updatePreference(preferences.streamView === 'terminal' ? { terminalDrawer: 'right' } : { tableDrawer: 'right' })}
                >
                  <ArrowRightToLine aria-hidden="true" />
                </button>
                <button
                  type="button"
                  title="Bottom detail dock"
                  aria-pressed={storedPlacement === 'bottom'}
                  onClick={() => updatePreference(preferences.streamView === 'terminal' ? { terminalDrawer: 'bottom' } : { tableDrawer: 'bottom' })}
                >
                  <ArrowDownToLine aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          <div className="filter-row" aria-label="Stream filters">
            <label className="search-control">
              <Search aria-hidden="true" />
              <span className="sr-only">Search runtime events</span>
              <input value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Search event kind, summary, context, confidence" />
            </label>
            <button type="button" className="button secondary" onClick={() => setSearch('')} disabled={!search}>
              <RotateCcw aria-hidden="true" /> Reset
            </button>
            <span className="result-count" aria-live="polite">{visibleEvents.length} shown / {viewModel.retainedCount} retained</span>
          </div>

          <section className="attention-region" aria-label="Attention and warnings" aria-live="polite">
            {viewModel.alerts.length ? viewModel.alerts.map((alert) => (
              <article className="alert" data-severity={alert.severity} key={alert.id}>
                <AlertTriangle aria-hidden="true" />
                <div>
                  <strong>{alert.title}</strong>
                  <p>{alert.message}</p>
                </div>
              </article>
            )) : (
              <article className="alert quiet">
                <ShieldCheck aria-hidden="true" />
                <div>
                  <strong>No active warnings</strong>
                  <p>Warning count is hidden until useful.</p>
                </div>
              </article>
            )}
          </section>

          {preferences.streamView === 'terminal' ? (
            <TerminalStream events={visibleEvents} selectedId={selected?.id || null} onSelect={openEvidence} />
          ) : (
            <TableStream events={visibleEvents} selectedId={selected?.id || null} onSelect={openEvidence} />
          )}
        </section>

        <DetailDock
          detail={detail}
          placement={effectivePlacement}
          storedPlacement={storedPlacement}
          headingRef={detailHeadingRef}
          onClose={closeDetail}
        />
      </main>

      <footer className="status-bar" aria-label="Runtime Monitor status">
        <span><Gauge aria-hidden="true" /> {viewModel.monitorLabel}</span>
        <span><DatabaseZap aria-hidden="true" /> Local only</span>
        <span><Rows3 aria-hidden="true" /> Bounded stream: 100 visible rows</span>
        <span><ListFilter aria-hidden="true" /> Search literal, local presentation state</span>
        <span><Bell aria-hidden="true" /> Alerts deduplicated by source state</span>
        <span><Settings aria-hidden="true" /> View preferences stored locally per view</span>
      </footer>
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
}

function TerminalStream({
  events,
  selectedId,
  onSelect
}: {
  events: readonly StreamEvent[];
  selectedId: string | null;
  onSelect: (event: StreamEvent, trigger: HTMLElement | null) => void;
}) {
  if (events.length === 0) return <EmptyStream />;
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
          <span className="mono time">{event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : 'UNKNOWN'}</span>
          <span className="kind-tag">{event.kind}</span>
          <span className="urgency-mark" aria-label={`Urgency ${event.urgency}`}><Square aria-hidden="true" /></span>
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
  selectedId,
  onSelect
}: {
  events: readonly StreamEvent[];
  selectedId: string | null;
  onSelect: (event: StreamEvent, trigger: HTMLElement | null) => void;
}) {
  if (events.length === 0) return <EmptyStream />;
  return (
    <div className="table-stream" role="region" aria-label="Table runtime events">
      <table>
        <thead>
          <tr>
            <th scope="col">Kind</th>
            <th scope="col">Severity</th>
            <th scope="col">Summary</th>
            <th scope="col">Environment</th>
            <th scope="col">Age</th>
            <th scope="col">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} aria-selected={event.id === selectedId}>
              <td><span className="kind-dot" data-kind={event.kind} />{event.kind}</td>
              <td>{event.urgency}</td>
              <td>
                <button type="button" className="row-link" onClick={(domEvent) => void onSelect(event, domEvent.currentTarget)}>
                  {event.summary}
                </button>
                <small>{event.context}</small>
              </td>
              <td>{event.environment}</td>
              <td>{event.ageLabel}</td>
              <td>{event.confidence}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
          <p className="dock-kicker">Shared drilldown</p>
          <h2 ref={headingRef} tabIndex={-1}>{detail.selected?.summary || 'Detail host'}</h2>
        </div>
        <button type="button" className="icon-button" title="Close detail" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </div>
      {placement !== storedPlacement ? <p className="placement-note">Temporary responsive placement. Stored preference is preserved.</p> : null}
      <StateMessage status={detail.status} message={detail.message} />
      {detail.selected ? (
        <dl className="detail-facts">
          <div><dt>Event ID</dt><dd>{detail.selected.id}</dd></div>
          <div><dt>Kind</dt><dd>{detail.selected.kind}</dd></div>
          <div><dt>Source line</dt><dd>{detail.selected.sourceLine ?? 'Unknown'}</dd></div>
          <div><dt>Evidence</dt><dd>{detail.selected.evidenceAvailable ? 'Available locally' : 'Redacted or absent'}</dd></div>
        </dl>
      ) : null}
      {detail.detail ? (
        <pre className="evidence-block">{detail.detail.evidence.rawContext.join('\n') || 'No retained raw context for this event.'}</pre>
      ) : null}
    </aside>
  );
}

function EmptyStream() {
  return (
    <section className="empty-state" aria-label="Empty runtime stream">
      <CircleHelp aria-hidden="true" />
      <h2>No telemetry in this scope</h2>
      <p>No events have been collected yet, or current filters exclude all retained events.</p>
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
      <h2>{title}</h2>
      <strong>{label}</strong>
      <p>{detail}</p>
    </section>
  );
}

function StatusPill({ state, label }: { state: string; label: string }) {
  return <span className="status-pill" data-state={state}>{label}</span>;
}

function Metric({ label, value, title }: { label: string; value: string; title?: string | undefined }) {
  return (
    <span className="header-metric" title={title}>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function toEvidenceKind(kind: StreamEvent['kind']): 'shard' | 'action' | 'session' {
  if (kind === 'action' || kind === 'session') return kind;
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
      checkpoint: null
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
