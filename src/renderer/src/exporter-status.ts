import type { BlueprintExportResult } from '../../contracts/rendererApi';

export type ExportOperation = 'export' | 'test';

export function getExporterStatusLabel(
  phase: string,
  operation: ExportOperation,
  outputFormat: BlueprintExportResult['outputFormat'] | 'json' | 'csv'
): string {
  const subject = operation === 'test' ? 'Test export' : 'Export';
  switch (phase) {
    case 'validating': return operation === 'test' ? 'Validating test export' : 'Validating source';
    case 'scanning': return operation === 'test' ? 'Scanning logs for test export' : 'Scanning logs';
    case 'deduplicating': return 'Removing duplicates';
    case 'awaiting_save': return 'Choose save location';
    case 'writing': return `Writing ${outputFormat.toUpperCase()} output`;
    case 'completed': return `${subject} completed without warnings`;
    case 'no_matches': return operation === 'test' ? 'Test export found no blueprint matches' : 'No blueprint matches';
    case 'partial': return `${subject} completed with warnings`;
    case 'cancelled': return `${subject} cancelled`;
    default: return 'Ready to export';
  }
}

export function summarizeExporterWarnings(result: BlueprintExportResult) {
  const unsupportedProfileCount = result.errors.filter((error) => error.code === 'unsupported_profile').length;
  return {
    unsupportedProfileCount,
    otherWarningCount: result.errors.length - unsupportedProfileCount
  };
}
