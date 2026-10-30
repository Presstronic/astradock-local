import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const app = readFileSync(resolve(process.cwd(), 'src/renderer/src/runtime-monitor-app.tsx'), 'utf8');
const css = readFileSync(resolve(process.cwd(), 'src/renderer/src/styles.css'), 'utf8');
const entry = readFileSync(resolve(process.cwd(), 'src/renderer/src/main.tsx'), 'utf8');
const html = readFileSync(resolve(process.cwd(), 'src/renderer/index.html'), 'utf8');

describe('Runtime Monitor accessibility release contract', () => {
  it('keeps named shell landmarks and skip navigation', () => {
    expect(app).toContain('href="#runtime-stream"');
    expect(app).toContain('href="#current-state"');
    expect(app).toContain('aria-label="Runtime Monitor source and health"');
    expect(app).toContain('aria-label="Runtime Monitor"');
    expect(app).toContain('aria-label="Runtime Monitor status"');
  });

  it('keeps keyboard-operable stream semantics and selection identity', () => {
    expect(app).toContain('role="listbox"');
    expect(app).toContain('role="option"');
    expect(app).toContain('role="grid"');
    expect(app).toContain('aria-rowcount={events.length}');
    expect(app).toContain("keyboardEvent.key === 'ArrowDown'");
    expect(app).toContain("keyboardEvent.key === 'ArrowUp'");
    expect(app).toContain("keyboardEvent.key === 'Home'");
    expect(app).toContain("keyboardEvent.key === 'End'");
    expect(app).toContain("keyboardEvent.key === 'Enter' || keyboardEvent.key === ' '");
    expect(app).toContain('selectStreamEvent(current, event.id)');
    expect(app).toContain('lastSelectionTrigger.current?.focus()');
  });

  it('keeps named detail focus targets and an accessible close action', () => {
    expect(app).toContain('aria-labelledby="detail-dock-heading"');
    expect(app).toContain('id="detail-dock-heading"');
    expect(app).toContain('aria-label="Close detail"');
    expect(app).toContain('detailHeadingRef.current?.focus()');
  });

  it('bounds live stream announcements instead of announcing every visual update', () => {
    expect(app).toContain('setTimeout(() =>');
    expect(app).toContain('750');
    expect(app).toContain('aria-live="polite" aria-atomic="true"');
    expect(app).not.toMatch(/<div className="stream-mode" aria-live=/);
  });

  it('requires text and structure for state and motion alternatives', () => {
    expect(app).toContain('Urgency ${line.urgency}');
    expect(app).toContain("status.replaceAll('-', ' ')");
    expect(css).toContain('min-width: 24px;');
    expect(css).toContain('min-height: 24px;');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation: none;');
  });

  it('keeps the offline asset and viewport constraints explicit', () => {
    expect(entry).toContain("@fontsource/space-grotesk/700.css");
    expect(entry).toContain("@fontsource/hanken-grotesk/400.css");
    expect(entry).toContain("@fontsource/jetbrains-mono/400.css");
    expect(app).toContain("from 'lucide-react'");
    expect(html).toContain("font-src 'self'");
    expect(css).toContain('min-width: 1024px;');
  });
});
