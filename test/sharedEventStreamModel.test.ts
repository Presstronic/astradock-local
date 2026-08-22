import { describe, expect, it } from 'vitest';
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
} from '../src/renderer/src/shared-event-stream-model';
import type { StreamEvent } from '../src/renderer/src/runtime-monitor-model';

function event(id: string, second: number, environmentKey = 'LIVE:PU', sessionId = 'session-a'): StreamEvent {
  return {
    id,
    kind: 'runtime',
    urgency: 'normal',
    summary: `Event ${id}`,
    context: 'Local runtime evidence',
    environment: environmentKey,
    timestamp: `2026-08-20T12:00:${String(second).padStart(2, '0')}.000Z`,
    ageLabel: 'now',
    confidence: 'high',
    evidenceAvailable: true,
    sourceLine: second,
    row: { id, environmentKey, sessionId }
  };
}

describe('shared event stream model', () => {
  it('deduplicates and deterministically orders a bounded live window', () => {
    let state = createSharedEventStreamState({ windowSize: 2 });
    state = reconcileStreamEvents(state, [event('a', 1), event('c', 3), event('b', 2), event('b', 2)], 'ready', true);
    expect(state.events.map(({ id }) => id)).toEqual(['c', 'b', 'a']);
    expect(getStreamWindow(state).map(({ id }) => id)).toEqual(['c', 'b']);
    expect(state.mode).toBe('live');
    expect(state.unseenCount).toBe(0);
  });

  it('preserves a browse anchor and counts unseen immutable IDs', () => {
    let state = reconcileStreamEvents(createSharedEventStreamState({ windowSize: 2 }), [event('b', 2), event('a', 1)], 'ready', true);
    state = browseFrom(state, 'a', 14);
    state = reconcileStreamEvents(state, [event('c', 3), event('b', 2), event('a', 1)], 'ready', true);
    expect(state.mode).toBe('browsing');
    expect(state.anchor).toEqual({ eventId: 'a', offset: 14 });
    expect(state.unseenCount).toBe(1);
    expect(returnToLive(state)).toMatchObject({ mode: 'live', unseenCount: 0, anchor: null, windowStart: 0 });
  });

  it('shares selection, query, and anchor across view switches', () => {
    let state = reconcileStreamEvents(createSharedEventStreamState(), [event('b', 2), event('a', 1)], 'ready', true);
    state = selectStreamEvent(browseFrom(state, 'a'), 'a');
    const switched = switchStreamView(state, 'table');
    expect(switched).toMatchObject({ view: 'table', selectedEventId: 'a', anchor: { eventId: 'a' } });
    const filtered = updateStreamQuery(switched, { search: 'event a' });
    expect(filtered.events.map(({ id }) => id)).toEqual(['a']);
    expect(updateStreamQuery(filtered, { search: 'event b' }).events.map(({ id }) => id)).toEqual(['b']);
  });

  it('marks a retained selection unavailable and distinguishes health modes', () => {
    let state = reconcileStreamEvents(createSharedEventStreamState(), [event('a', 1)], 'ready', true);
    state = selectStreamEvent(state, 'a');
    state = reconcileStreamEvents(state, [], 'ready', true);
    expect(state.selectionUnavailable).toBe(true);
    expect(reconcileStreamEvents(state, [], 'stale', true).mode).toBe('stale');
    expect(reconcileStreamEvents(state, [], 'disconnected', true).mode).toBe('disconnected');
    expect(reconcileStreamEvents(state, [], 'ready', false).mode).toBe('replay');
  });

  it('scopes one logical query by environment and session and clamps window size', () => {
    let state = createSharedEventStreamState({ windowSize: 10_000 });
    state = reconcileStreamEvents(state, [event('a', 1), event('b', 2, 'PTU:PU'), event('c', 3, 'LIVE:PU', 'session-b')], 'ready', true);
    state = updateStreamQuery(state, { environmentKey: 'LIVE:PU', sessionId: 'session-a' });
    expect(state.events.map(({ id }) => id)).toEqual(['a']);
    expect(state.windowSize).toBe(200);
  });

  it('pages with bounded cursors and safely clamps either boundary', () => {
    let state = reconcileStreamEvents(createSharedEventStreamState({ windowSize: 2 }), [event('d', 4), event('c', 3), event('b', 2), event('a', 1)], 'ready', true);
    state = pageStreamWindow(state, 'older');
    expect(getStreamWindow(state).map(({ id }) => id)).toEqual(['b', 'a']);
    expect(pageStreamWindow(state, 'older').windowStart).toBe(2);
    state = pageStreamWindow(state, 'newer');
    expect(state).toMatchObject({ mode: 'live', windowStart: 0 });
  });

  it('applies literal operational filters to the shared query', () => {
    const party = event('party', 4);
    party.kind = 'party';
    party.row = { ...party.row, shardId: 'S1', endpoint: 'server-a', provenance: 'observed', eventCategory: 'party' };
    const diagnostic = event('diagnostic', 3);
    diagnostic.kind = 'diagnostic';
    diagnostic.confidence = 'low';
    diagnostic.row = { ...diagnostic.row, shardId: 'S1', endpoint: 'server-b', provenance: 'inferred' };
    let state = reconcileStreamEvents(createSharedEventStreamState(), [party, diagnostic], 'ready', true);
    state = updateStreamQuery(state, {
      shard: 'S1', server: 'server-a', party: 'involved', provenance: 'observed', confidence: 'high', diagnostics: 'hide', search: 'PARTY'
    });
    expect(state.events.map(({ id }) => id)).toEqual(['party']);
    expect(updateStreamQuery(state, { search: '.*' }).events).toEqual([]);
  });

  it('does not execute regex and bounds pathological search work', () => {
    let state = reconcileStreamEvents(createSharedEventStreamState(), [event('a', 1)], 'ready', true);
    state = updateStreamQuery(state, { search: 'a'.repeat(10_000) });
    expect(state.events).toEqual([]);
  });
});
