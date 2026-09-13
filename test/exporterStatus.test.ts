import { describe, expect, it } from 'vitest';
import type { BlueprintExportResult } from '../src/contracts/rendererApi';
import { getExporterStatusLabel, summarizeExporterWarnings } from '../src/renderer/src/exporter-status';

describe('exporter status presentation', () => {
  it('distinguishes a successful test export from a saved export', () => {
    expect(getExporterStatusLabel('completed', 'test', 'json')).toBe('Test export completed without warnings');
    expect(getExporterStatusLabel('partial', 'test', 'csv')).toBe('Test export completed with warnings');
    expect(getExporterStatusLabel('completed', 'export', 'json')).toBe('Export completed without warnings');
  });

  it('explains profile exclusions separately from other file warnings', () => {
    const result = {
      errors: [
        { file: 'one.log', code: 'unsupported_profile', message: 'unsupported' },
        { file: 'two.log', code: 'unsupported_profile', message: 'unsupported' },
        { file: 'three.log', code: 'read_failed', message: 'failed' }
      ]
    } as BlueprintExportResult;
    expect(summarizeExporterWarnings(result)).toEqual({ unsupportedProfileCount: 2, otherWarningCount: 1 });
  });
});
