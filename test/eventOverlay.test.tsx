import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventOverlay } from '../src/renderer/src/event-overlay';
import type { OverlayFeed } from '../src/contracts/rendererApi';
import { orderOverlayFeed } from '../src/renderer/src/event-overlay-model';

const close = vi.fn();
const updatePreferences = vi.fn();
const unsubscribe = vi.fn();
let receiveFeed: (feed: OverlayFeed) => void;

beforeEach(() => {
  close.mockReset().mockResolvedValue({ hidden: true });
  updatePreferences.mockReset().mockResolvedValue({ alwaysOnTop: true, opacity: 1 });
  unsubscribe.mockReset();
  vi.stubGlobal('astradock', {
    overlay: {
      close,
      updatePreferences,
      getPreferences: vi.fn().mockResolvedValue({ alwaysOnTop: true, opacity: 0.82 }),
      subscribeFeed: vi.fn((listener: (feed: OverlayFeed) => void) => {
        receiveFeed = listener;
        listener({ state: 'monitoring', environment: 'LIVE test environment', events: [{
          id: 'event-1', kind: 'action', summary: 'Test inventory action', timestamp: null,
          confidence: 'high', provenance: 'Observed locally'
        }] });
        return unsubscribe;
      })
    }
  });
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('event overlay dismissal', () => {
  it('shows unsupported-build diagnostics instead of claiming to wait for gameplay', async () => {
    render(<EventOverlay />);
    act(() => receiveFeed({ state: 'unsupported_profile', environment: 'PTU', events: [],
      statusMessage: 'Following PTU log, but build 4.10.199.13455 has no supported parser profile. Gameplay events are unavailable for this build.' }));
    expect(await screen.findByText(/Following PTU log.*4.10.199.13455/)).toBeVisible();
    expect(screen.getByText('Unsupported build')).toBeVisible();
    expect(screen.queryByText('Waiting for gameplay events since AstraDock started.')).not.toBeInTheDocument();
    expect(updatePreferences).not.toHaveBeenCalled();
  });
  it('inserts new events at the top, pushes older events down, and follows the newest event', async () => {
    render(<EventOverlay />);
    await screen.findByText('Test inventory action');
    const stream = screen.getByRole('region', { name: 'Selected event kinds' });
    stream.scrollTop = 200;
    const event = (id: string, timestamp: string) => ({ id, timestamp, kind: 'action', summary: id, confidence: 'high', provenance: 'observed' });
    act(() => receiveFeed({ state: 'monitoring', environment: 'LIVE', events: [
      event('old', '2026-10-29T17:01:43.133Z'), event('new', '2026-10-29T17:01:46.342Z')
    ] }));
    expect(screen.getAllByRole('article').map(article => article.textContent)).toEqual([
      expect.stringContaining('new'), expect.stringContaining('old')
    ]);
    expect(stream.scrollTop).toBe(0);
    expect(close).not.toHaveBeenCalled();
  });

  it('bounds and deduplicates the feed while keeping unknown timestamps last', () => {
    const event = { id: 'known', timestamp: '2026-10-29T17:01:43.133Z', kind: 'action', summary: 'Observed', confidence: 'high', provenance: 'observed' };
    const ordered = orderOverlayFeed({ state: 'monitoring', environment: 'LIVE', events: [
      { ...event, id: 'unknown', timestamp: null }, event, event
    ] });
    expect(ordered.events.map(row => row.id)).toEqual(['known', 'unknown']);
    expect(orderOverlayFeed({ ...ordered, events: Array.from({ length: 100 }, (_, index) => ({ ...event, id: String(index) })) }).events).toHaveLength(80);
  });
  it('follows new arrivals even when the first event ID has not changed', async () => {
    render(<EventOverlay />);
    await screen.findByText('Test inventory action');
    const event = (id: string, timestamp: string) => ({ id, timestamp, kind: 'action', summary: id, confidence: 'high', provenance: 'observed' });
    const top = event('top', '2026-10-29T17:02:00Z');
    act(() => receiveFeed({ state: 'monitoring', environment: 'LIVE', events: [top] }));
    const stream = screen.getByRole('region', { name: 'Selected event kinds' });
    stream.scrollTop = 200;
    act(() => receiveFeed({ state: 'monitoring', environment: 'LIVE', events: [top, event('arrived', '2026-10-29T17:01:59Z')] }));
    expect(stream.scrollTop).toBe(0);
    expect(close).not.toHaveBeenCalled();
  });
  it('shows a passive waiting state when capture is not running', async () => {
    render(<EventOverlay />);
    act(() => receiveFeed({ state: 'waiting', environment: 'LIVE', events: [] }));
    expect(await screen.findByText(/Waiting for capture in the main application.*Start follow or Open event overlay/)).toBeVisible();
    expect(close).not.toHaveBeenCalled();
    expect(updatePreferences).not.toHaveBeenCalled();
  });
  it('switches Friendly/Raw beside opacity and renders source text as plain text', async () => {
    render(<EventOverlay />);
    await screen.findByText('Test inventory action');
    fireEvent.click(screen.getByRole('switch', { name: 'Show raw log messages' }));
    await waitFor(() => expect(updatePreferences).toHaveBeenCalledWith({ displayMode: 'raw' }));
    const original = '<2026-10-29T17:02:00Z> [Notice] <SYNTH_MARKER>  <img src=x onerror=alert(1)>\r\n';
    act(() => receiveFeed({ state: 'monitoring', environment: 'LIVE', displayMode: 'raw', events: [{
      id: 'purchase', kind: 'action', summary: '5\u00d7 MedPens purchased', timestamp: '2026-10-29T17:02:00Z',
      confidence: 'high', provenance: 'inferred', rawEvidence: { status: 'available', messages: [original] }
    }] }));
    const raw = screen.getByRole('article').querySelector('pre');
    expect(raw?.textContent).toBe(original);
    expect(raw?.querySelector('img')).toBeNull();
    expect(screen.queryByText('5\u00d7 MedPens purchased')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Show raw log messages' }));
    await waitFor(() => expect(updatePreferences).toHaveBeenCalledWith({ displayMode: 'friendly' }));
    expect(close).not.toHaveBeenCalled();
  });
  it('keeps ordinary content clicks, focus changes, Escape, and opacity changes separate from close', async () => {
    render(<EventOverlay />);
    await screen.findByText('Test inventory action');
    for (const text of ['LIVE test environment', 'Always on top', 'Test inventory action', 'Observed locally']) {
      fireEvent.click(screen.getByText(text, { exact: false }));
    }
    fireEvent.blur(window);
    fireEvent.focus(window);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.change(screen.getByRole('slider', { name: 'Overlay opacity' }), { target: { value: '100' } });
    await waitFor(() => expect(updatePreferences).toHaveBeenCalledWith({ opacity: 1 }));
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole('main')).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: 'Always on top' })).not.toBeInTheDocument();
  });

  it('closes only through the explicitly labeled button', async () => {
    render(<EventOverlay />);
    await screen.findByText('Test inventory action');
    fireEvent.click(screen.getByRole('button', { name: 'Close event overlay' }));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it('reports a rejected close request without an unhandled rejection', async () => {
    close.mockRejectedValueOnce(new Error('IPC unavailable'));
    render(<EventOverlay />);
    fireEvent.click(screen.getByRole('button', { name: 'Close event overlay' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be closed');
    expect(screen.getByRole('main')).toBeVisible();
  });
});
