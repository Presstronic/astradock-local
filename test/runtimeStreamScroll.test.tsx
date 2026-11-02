import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TableStream, TerminalStream } from '../src/renderer/src/runtime-monitor-app';
import type { StreamEvent } from '../src/renderer/src/runtime-monitor-model';

function event(id: string): StreamEvent {
  return { id, kind: 'action', urgency: 'normal', summary: id, context: 'Gameplay event',
    environment: 'LIVE', timestamp: '2026-10-29T17:02:00.000Z', ageLabel: 'now',
    confidence: 'high', evidenceAvailable: true, sourceLine: 1, row: { id, evidenceAvailable: true } };
}

beforeEach(() => vi.stubGlobal('CSS', { escape: (value: string) => value }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe.each([
  { name: 'Terminal', Component: TerminalStream, role: 'listbox' },
  { name: 'Table', Component: TableStream, role: 'grid' }
])('$name live scroll', ({ Component, role }) => {
  it('shows prepended arrivals at the top without changing horizontal position', () => {
    const props = { emptyReason: 'no-matches' as const, selectedId: null, onSelect: vi.fn() };
    const { rerender } = render(<Component {...props} following events={[event('older')]} />);
    const viewport = screen.getByRole(role);
    viewport.scrollTop = 250;
    viewport.scrollLeft = 40;
    rerender(<Component {...props} following events={[event('newest'), event('older')]} />);
    expect(viewport.scrollTop).toBe(0);
    expect(viewport.scrollLeft).toBe(40);
    expect(viewport.textContent?.indexOf('newest')).toBeLessThan(viewport.textContent?.indexOf('older') ?? 0);
  });

  it('preserves history browsing, then scrolls to the top on Return to live', () => {
    const props = { emptyReason: 'no-matches' as const, selectedId: null, onSelect: vi.fn() };
    const { rerender } = render(<Component {...props} following={false} events={[event('older')]} />);
    const viewport = screen.getByRole(role);
    viewport.scrollTop = 250;
    rerender(<Component {...props} following={false} events={[event('newest'), event('older')]} />);
    expect(viewport.scrollTop).toBe(250);
    rerender(<Component {...props} following events={[event('newest'), event('older')]} />);
    expect(viewport.scrollTop).toBe(0);
    viewport.scrollTop = 150;
    rerender(<Component {...props} following events={[event('newest'), event('older')]} />);
    expect(viewport.scrollTop).toBe(150);
  });
});
