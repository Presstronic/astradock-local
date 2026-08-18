import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/renderer/src/styles.css'), 'utf8');

describe('Runtime Monitor design-system conformance', () => {
  it.each([
    ['--background', 'hsl(220 30% 4%)'],
    ['--surface-hover', 'hsl(218 26% 11%)'],
    ['--foreground', 'hsl(214 47% 97%)'],
    ['--text-ghost', 'hsl(219 13% 54%)'],
    ['--primary', 'hsl(202 100% 61%)'],
    ['--danger', 'hsl(356 100% 60%)'],
    ['--danger-solid', 'hsl(355 81% 42%)'],
    ['--warning', 'hsl(38 100% 56%)'],
    ['--success', 'hsl(142 69% 58%)']
  ])('keeps the authoritative %s token', (name, value) => {
    expect(css).toContain(`${name}: ${value};`);
  });

  it.each([
    ['--row-compact', '22px'],
    ['--row-default', '31px'],
    ['--row-relaxed', '38px'],
    ['--strip-height', '24px'],
    ['--header-height', '46px'],
    ['--tabs-height', '34px'],
    ['--toolbar-height', '38px'],
    ['--statusbar-height', '24px'],
    ['--radius', '0'],
    ['--tick-length', '11px']
  ])('keeps the authoritative %s geometry', (name, value) => {
    expect(css).toMatch(new RegExp(`${name}:\\s*${value.replace('px', '\\px')};`));
  });

  it('preserves blue selection precedence over red harm rails', () => {
    expect(css).toMatch(/\.terminal-row\[aria-selected="true"\][^{]*\{[^}]*inset 3px 0 0 var\(--primary\)/s);
    expect(css).toMatch(/data-urgency="urgent"\][^{]*:not\(\[aria-selected="true"\]\)[^{]*\{[^}]*inset 3px 0 0 var\(--danger\)/s);
  });

  it('implements the bracketed 6a panel chrome', () => {
    expect(css).toContain('height: var(--strip-height);');
    expect(css).toContain('width: var(--tick-length);');
    expect(css).toContain('border-bottom: 1px dotted var(--nontext-200);');
  });
});
