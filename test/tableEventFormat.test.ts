import { describe, expect, it } from 'vitest';
import { formatTableEvent } from '../src/renderer/src/table-event-format';
import type { StreamEvent } from '../src/renderer/src/runtime-monitor-model';

const baseEvent: StreamEvent = {
  id: 'event-1', kind: 'session', urgency: 'warning', summary: 'Joined Stanton',
  context: 'Fallback context', environment: 'LIVE', timestamp: '2026-08-22T12:00:01.000Z',
  ageLabel: '2m ago', confidence: 'high', evidenceAvailable: true, sourceLine: 12,
  row: { id: 'event-1', shardName: 'Synthetic Shard', provenance: 'observed' }
};

describe('table event formatting', () => {
  it('formats the approved columns with semantic labels and event-time context', () => {
    expect(formatTableEvent(baseEvent)).toMatchObject({
      kind: 'Session', severity: 'Notice', summary: 'Joined Stanton',
      attributes: 'observed · Confidence high', shard: 'Synthetic Shard', age: '2m ago'
    });
    expect(formatTableEvent(baseEvent).ageLabel).toContain('2026-08-22');
  });

  it('uses explicit fallbacks and bounds untrusted values', () => {
    const row = formatTableEvent({ ...baseEvent, summary: '\u0000' + 'x'.repeat(400), timestamp: null, ageLabel: '', row: { id: 'event-1' } });
    expect(row.summary).toHaveLength(240);
    expect(row.summary).not.toContain('\u0000');
    expect(row.attributes).toContain('Confidence high');
    expect(row.shard).toBe('Fallback context');
    expect(row.age).toBe('Unknown age');
    expect(row.ageLabel).toContain('event time unknown');
  });
});
