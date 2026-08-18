import { describe, expect, it } from 'vitest';

import { formatCompactDuration } from '../src/renderer/src/runtime-monitor-model';

describe('PU session duration formatting', () => {
  it('uses MM:SS below one hour', () => {
    expect(formatCompactDuration(0)).toBe('00:00');
    expect(formatCompactDuration(125)).toBe('02:05');
  });

  it('uses HH:MM:SS at one hour and above', () => {
    expect(formatCompactDuration(3900)).toBe('01:05:00');
  });

  it('clamps negative and fractional input safely', () => {
    expect(formatCompactDuration(-5)).toBe('00:00');
    expect(formatCompactDuration(61.9)).toBe('01:01');
  });
});
