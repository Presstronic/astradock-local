import type { StreamEvent, StreamView, WorkspaceState } from './runtime-monitor-model';

export type StreamMode = 'live' | 'browsing' | 'paused' | 'stale' | 'disconnected' | 'replay';

export interface StreamQuery {
  environmentKey: string | null;
  sessionId: string | null;
  search: string;
  kinds: readonly StreamEvent['kind'][];
  shard: string | null;
  server: string | null;
  party: 'any' | 'involved' | 'not-involved';
  provenance: string | null;
  confidence: string | null;
  diagnostics: 'show' | 'hide' | 'only';
  since: string | null;
}

export interface StreamAnchor {
  eventId: string;
  offset: number;
}

export interface SharedEventStreamState {
  query: StreamQuery;
  view: StreamView;
  mode: StreamMode;
  sourceEvents: readonly StreamEvent[];
  events: readonly StreamEvent[];
  selectedEventId: string | null;
  selectionUnavailable: boolean;
  anchor: StreamAnchor | null;
  unseenCount: number;
  windowStart: number;
  windowSize: number;
  totalCount: number;
  revision: number;
}

const DEFAULT_WINDOW_SIZE = 80;
const MAX_WINDOW_SIZE = 200;

export function createSharedEventStreamState(options: {
  view?: StreamView;
  windowSize?: number;
  query?: Partial<StreamQuery>;
} = {}): SharedEventStreamState {
  return {
    query: { environmentKey: null, sessionId: null, search: '', kinds: [], shard: null, server: null, party: 'any', provenance: null, confidence: null, diagnostics: 'show', since: null, ...options.query },
    view: options.view || 'terminal',
    mode: 'replay',
    sourceEvents: [],
    events: [],
    selectedEventId: null,
    selectionUnavailable: false,
    anchor: null,
    unseenCount: 0,
    windowStart: 0,
    windowSize: clampWindowSize(options.windowSize),
    totalCount: 0,
    revision: 0
  };
}

export function reconcileStreamEvents(
  state: SharedEventStreamState,
  incoming: readonly StreamEvent[],
  workspaceState: WorkspaceState,
  monitoring: boolean
): SharedEventStreamState {
  const previousIds = new Set(state.sourceEvents.map((event) => event.id));
  const events = filterAndOrder(incoming, state.query);
  const nextIds = new Set(events.map((event) => event.id));
  const appended = events.reduce((count, event) => count + (previousIds.has(event.id) ? 0 : 1), 0);
  const selectedRemoved = Boolean(state.selectedEventId && !nextIds.has(state.selectedEventId));
  const mode = healthMode(workspaceState, monitoring, state.mode);
  const following = mode === 'live' || (state.mode === 'replay' && monitoring);
  const anchorIndex = state.anchor ? events.findIndex((event) => event.id === state.anchor?.eventId) : -1;
  const windowStart = following
    ? 0
    : anchorIndex >= 0
      ? Math.min(anchorIndex, Math.max(0, events.length - state.windowSize))
      : Math.min(state.windowStart, Math.max(0, events.length - state.windowSize));

  return {
    ...state,
    sourceEvents: deduplicateAndOrder(incoming),
    events,
    mode: following && mode === 'replay' ? 'live' : mode,
    selectionUnavailable: selectedRemoved || (state.selectionUnavailable && Boolean(state.selectedEventId)),
    unseenCount: following ? 0 : state.unseenCount + appended,
    windowStart,
    totalCount: events.length,
    revision: state.revision + 1
  };
}

export function browseFrom(
  state: SharedEventStreamState,
  eventId: string,
  offset = 0
): SharedEventStreamState {
  const index = state.events.findIndex((event) => event.id === eventId);
  if (index < 0) return state;
  return {
    ...state,
    mode: 'browsing',
    anchor: { eventId, offset },
    windowStart: Math.min(index, Math.max(0, state.events.length - state.windowSize))
  };
}

export function returnToLive(state: SharedEventStreamState): SharedEventStreamState {
  return { ...state, mode: 'live', anchor: null, unseenCount: 0, windowStart: 0 };
}

export function pageStreamWindow(state: SharedEventStreamState, direction: 'older' | 'newer'): SharedEventStreamState {
  const delta = direction === 'older' ? state.windowSize : -state.windowSize;
  const windowStart = Math.max(0, Math.min(state.windowStart + delta, Math.max(0, state.events.length - state.windowSize)));
  const anchor = state.events[windowStart];
  return {
    ...state,
    mode: windowStart === 0 && direction === 'newer' ? 'live' : 'browsing',
    windowStart,
    anchor: anchor ? { eventId: anchor.id, offset: 0 } : state.anchor,
    unseenCount: windowStart === 0 && direction === 'newer' ? 0 : state.unseenCount
  };
}

export function selectStreamEvent(state: SharedEventStreamState, eventId: string | null): SharedEventStreamState {
  return {
    ...state,
    selectedEventId: eventId,
    selectionUnavailable: Boolean(eventId && !state.events.some((event) => event.id === eventId))
  };
}

export function switchStreamView(state: SharedEventStreamState, view: StreamView): SharedEventStreamState {
  return { ...state, view };
}

export function updateStreamQuery(state: SharedEventStreamState, patch: Partial<StreamQuery>): SharedEventStreamState {
  const query = { ...state.query, ...patch };
  const events = filterAndOrder(state.sourceEvents, query);
  return {
    ...state,
    query,
    events,
    totalCount: events.length,
    windowStart: 0,
    anchor: events[0] ? { eventId: events[0].id, offset: 0 } : null,
    mode: state.mode === 'live' ? 'live' : 'browsing',
    selectionUnavailable: Boolean(state.selectedEventId && !events.some((event) => event.id === state.selectedEventId)),
    revision: state.revision + 1
  };
}

export function getStreamWindow(state: SharedEventStreamState): readonly StreamEvent[] {
  return state.events.slice(state.windowStart, state.windowStart + state.windowSize);
}

function filterAndOrder(events: readonly StreamEvent[], query: StreamQuery): StreamEvent[] {
  const term = query.search.trim().slice(0, MAX_SEARCH_LENGTH).toLowerCase();
  return deduplicateAndOrder(events.filter((event) => {
    if (query.environmentKey && event.row.environmentKey !== query.environmentKey) return false;
    const sessionId = typeof event.row.sessionId === 'string' ? event.row.sessionId : null;
    if (query.sessionId && sessionId !== query.sessionId) return false;
    if (query.kinds.length && !query.kinds.includes(event.kind)) return false;
    if (query.shard && !matchesField(event.row, query.shard, ['shardId', 'shardName', 'region'])) return false;
    if (query.server && !matchesField(event.row, query.server, ['server', 'serverId', 'endpoint', 'host', 'address'])) return false;
    const partyEvent = event.kind === 'party' || event.row.eventCategory === 'party' || Boolean(event.row.partyId);
    if (query.party === 'involved' && !partyEvent) return false;
    if (query.party === 'not-involved' && partyEvent) return false;
    if (query.provenance && String(event.row.provenance || '').toLowerCase() !== query.provenance.toLowerCase()) return false;
    if (query.confidence && event.confidence.toLowerCase() !== query.confidence.toLowerCase()) return false;
    if (query.diagnostics === 'only' && event.kind !== 'diagnostic') return false;
    if (query.diagnostics === 'hide' && event.kind === 'diagnostic') return false;
    if (query.since && (!event.timestamp || event.timestamp < query.since)) return false;
    if (term && ![event.kind, event.summary, event.context, event.environment, event.confidence]
      .some((value) => value.toLowerCase().includes(term))) return false;
    return true;
  }));
}

export const MAX_SEARCH_LENGTH = 160;

function matchesField(row: StreamEvent['row'], expected: string, fields: readonly string[]): boolean {
  const wanted = expected.toLowerCase();
  return fields.some((field) => String(row[field] ?? '').toLowerCase() === wanted);
}

export function getStreamFilterCounts(state: SharedEventStreamState): {
  kinds: Record<string, number>;
  shards: Record<string, number>;
  servers: Record<string, number>;
} {
  const counts = { kinds: {} as Record<string, number>, shards: {} as Record<string, number>, servers: {} as Record<string, number> };
  for (const event of state.sourceEvents) {
    counts.kinds[event.kind] = (counts.kinds[event.kind] || 0) + 1;
    for (const field of ['shardId', 'shardName', 'region']) {
      const value = String(event.row[field] ?? '');
      if (value) counts.shards[value] = (counts.shards[value] || 0) + 1;
    }
    for (const field of ['server', 'serverId', 'endpoint', 'host', 'address']) {
      const value = String(event.row[field] ?? '');
      if (value) counts.servers[value] = (counts.servers[value] || 0) + 1;
    }
  }
  return counts;
}

function deduplicateAndOrder(events: readonly StreamEvent[]): StreamEvent[] {
  const unique = new Map(events.map((event) => [event.id, event]));
  return [...unique.values()].sort((left, right) => {
    const timestamp = (right.timestamp || '').localeCompare(left.timestamp || '');
    return timestamp || (right.sourceLine ?? -1) - (left.sourceLine ?? -1) || left.id.localeCompare(right.id);
  });
}

function healthMode(workspaceState: WorkspaceState, monitoring: boolean, current: StreamMode): StreamMode {
  if (workspaceState === 'paused') return 'paused';
  if (workspaceState === 'stale') return 'stale';
  if (workspaceState === 'disconnected' || workspaceState === 'fatal') return 'disconnected';
  if (!monitoring) return 'replay';
  return current === 'browsing' ? 'browsing' : 'live';
}

function clampWindowSize(value?: number): number {
  if (!Number.isInteger(value) || Number(value) <= 0) return DEFAULT_WINDOW_SIZE;
  return Math.min(Number(value), MAX_WINDOW_SIZE);
}
