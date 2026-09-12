import { describe, expect, it } from 'vitest';
import { getWorkspaceMode } from '../src/renderer/src/workspace-mode';

describe('workspace build mode', () => {
  it('keeps normal navigation in the default renderer mode', () => {
    expect(getWorkspaceMode('development')).toBe('normal');
    expect(getWorkspaceMode('production')).toBe('normal');
  });

  it('selects the isolated Exporter workspace only for the exporter build mode', () => {
    expect(getWorkspaceMode('exporter')).toBe('exporter');
    expect(getWorkspaceMode('exporter-preview')).toBe('normal');
  });
});
