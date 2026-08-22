import { describe, expect, it } from 'vitest';
import { formatTerminalEvent, safeDisplayText } from '../src/renderer/src/terminal-event-format';
import type { StreamEvent } from '../src/renderer/src/runtime-monitor-model';

const baseEvent: StreamEvent = {
  id: 'event-1', kind: 'session', urgency: 'warning', summary: 'Joined Stanton',
  context: 'Shard 42 · server-a', environment: 'LIVE', timestamp: '2026-08-22T12:00:01.000Z',
  ageLabel: 'now', confidence: 'high', evidenceAvailable: true, sourceLine: 12,
  row: { id: 'event-1' }
};

describe('terminal event formatting', () => {
  it('uses human-readable semantic labels and an accessible complete line', () => {
    const line = formatTerminalEvent(baseEvent);
    expect(line).toMatchObject({ kind: 'Session', urgency: 'Warning', summary: 'Joined Stanton', qualification: 'Confidence high' });
    expect(line.accessibleLabel).toContain('Session; Warning; Joined Stanton');
  });

  it('bounds and sanitizes untrusted display text without interpreting markup', () => {
    const line = formatTerminalEvent({ ...baseEvent, summary: '<img src=x>\n' + 'x'.repeat(400) });
    expect(line.summary).not.toContain('\n');
    expect(line.summary.length).toBeLessThanOrEqual(240);
    expect(line.summary).toContain('<img src=x>');
    expect(safeDisplayText(null, 'Fallback')).toBe('Fallback');
  });

  it('keeps unknown timestamps explicit', () => {
    expect(formatTerminalEvent({ ...baseEvent, timestamp: null }).time).toBe('UNKNOWN');
    expect(formatTerminalEvent({ ...baseEvent, timestamp: null }).timeLabel).toBe('Unknown event time');
  });
});
