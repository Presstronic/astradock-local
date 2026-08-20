import { describe, expect, it } from 'vitest';

import { createStreamEvents } from '../src/renderer/src/runtime-monitor-model';
import {
  compareInstants,
  formatInstantContext,
  formatLocalClock,
  instantMilliseconds
} from '../src/renderer/src/time';

describe('renderer time boundary', () => {
  it('formats one UTC instant consistently in explicit local timezones', () => {
    const instant = '2026-08-19T23:10:50.145Z';
    expect(formatLocalClock(instant, 'America/New_York')).toBe('19:10:50');
    expect(formatLocalClock(instant, 'Asia/Kolkata')).toBe('04:40:50');
    expect(formatInstantContext(instant, 'America/New_York')).toContain('GMT-4');
    expect(formatInstantContext(instant, 'America/New_York')).toContain(`UTC ${instant}`);
  });

  it('distinguishes repeated fall-back clock values by offset and absolute order', () => {
    const daylight = '2026-11-01T01:30:00-04:00';
    const standard = '2026-11-01T01:30:00-05:00';
    expect(formatLocalClock(daylight, 'America/New_York')).toBe('01:30:00');
    expect(formatLocalClock(standard, 'America/New_York')).toBe('01:30:00');
    expect(formatInstantContext(daylight, 'America/New_York')).toContain('GMT-4');
    expect(formatInstantContext(standard, 'America/New_York')).toContain('GMT-5');
    expect(compareInstants(daylight, standard)).toBe(-3_600_000);
  });

  it('fails safely for invalid and offset-less display values', () => {
    expect(instantMilliseconds('2026-08-19T23:10:50')).toBeNull();
    expect(formatLocalClock('2026-02-30T00:00:00Z')).toBe('UNKNOWN');
    expect(formatInstantContext('not-a-time')).toBe('Unknown event time');
  });
});

describe('combined telemetry ordering', () => {
  it('orders canonical and legacy event families by normalized instant with deterministic ties', () => {
    const scan = {
      promotedRuntimeEvents: [
        row('zone', '2026-08-19T23:10:50.145Z', 20, 'zone'),
        row('navigation', '2026-08-19T23:10:50.150Z', 21, 'navigation'),
        row('vehicle', '2026-08-19T23:10:50.160Z', 22, 'vehicle')
      ],
      entries: [row('shard', '2026-08-19T23:10:50.100Z', 18, 'shard')],
      userActivity: {
        actions: [row('server-action', '2026-08-19T23:10:50.145Z', 19, 'action')],
        sessions: []
      }
    } as never;

    expect(createStreamEvents(scan, new Date('2026-08-19T23:11:00Z')).map((event) => event.id)).toEqual([
      'vehicle', 'navigation', 'zone', 'server-action', 'shard'
    ]);
  });
});

function row(id: string, timestamp: string, lineNumber: number, eventCategory: string) {
  return {
    id,
    eventId: id,
    timestamp,
    sourceTimestamp: timestamp,
    lineNumber,
    eventCategory,
    eventType: id,
    eventLabel: id,
    summary: id,
    confidence: 'high',
    evidenceAvailable: true
  };
}
