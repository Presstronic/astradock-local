import { useEffect, useState } from 'react';
import type { PublicRuntimeSource, RuntimeMonitorClient } from './astradock-api';
import type { BlueprintExportOptions, BlueprintExportResult, MonitorChangeEnvelope } from '../../contracts/rendererApi';
import { getExporterStatusLabel, summarizeExporterWarnings, type ExportOperation } from './exporter-status';

interface ExporterPanelProps {
  client: RuntimeMonitorClient;
  source: PublicRuntimeSource | null;
  sources: readonly PublicRuntimeSource[];
  onChooseDirectory: () => Promise<void>;
  onSelectSource: (sourceId: string) => Promise<void>;
}

export function ExporterPanel({ client, source, sources, onChooseDirectory, onSelectSource }: ExporterPanelProps) {
  const [exportType, setExportType] = useState<BlueprintExportOptions['exportType']>('blueprint_data');
  const [outputFormat, setOutputFormat] = useState<BlueprintExportOptions['outputFormat']>('json');
  const [operation, setOperation] = useState<ExportOperation>('export');
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [progress, setProgress] = useState({ filesProcessed: 0, filesTotal: 0, recordsFound: 0, duplicatesSuppressed: 0 });
  const [result, setResult] = useState<BlueprintExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => client.monitor.subscribe((message: MonitorChangeEnvelope) => {
    for (const change of message.changes || []) {
      if (change.change.type !== 'exporter.progress') continue;
      const next = change.change.progress;
      setPhase(next.phase);
      setProgress({ filesProcessed: next.filesProcessed, filesTotal: next.filesTotal, recordsFound: next.recordsFound, duplicatesSuppressed: next.duplicatesSuppressed });
    }
  }), [client]);

  async function runExport(testOnly = false) {
    if (!source) {
      setError('Choose a validated game.log source first.');
      return;
    }
    setRunning(true);
    setOperation(testOnly ? 'test' : 'export');
    setError(null);
    setResult(null);
    setPhase('validating');
    try {
      const next = await client.exporter.run({ sourceId: source.sourceId, exportType, environment: source.channelHint as 'LIVE' | 'PTU' | 'EPTU' | 'HOTFIX' | 'TECH-PREVIEW', outputFormat, testOnly });
      setResult(next);
      setPhase(next.status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${testOnly ? 'Test export' : 'Blueprint export'} failed.`);
      setPhase('error');
    } finally {
      setRunning(false);
    }
  }

  async function cancelExport() {
    try { await client.exporter.cancel(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Export cancellation failed.'); }
  }

  const progressLabel = progress.filesTotal ? `${progress.filesProcessed} of ${progress.filesTotal} files` : 'Preparing source scan';
  const progressPercent = progress.filesTotal ? Math.min(100, Math.round((progress.filesProcessed / progress.filesTotal) * 100)) : 0;
  const availableSources = sources.filter((candidate, index, all) => (
    candidate.validation.isValid
    && all.findIndex((other) => other.channelHint === candidate.channelHint) === index
  ));
  const warningSummary = result ? summarizeExporterWarnings(result) : null;
  const readyFileCount = result?.files.filter((file) => file.status === 'ready').length || 0;
  const unsupportedFiles = result?.files.filter((file) => file.status === 'unsupported') || [];
  const isTestExport = result?.testOnly === true;

  return (
    <main id="exporter-main" className="exporter-workspace" aria-label="Exporter">
      <header className="exporter-header">
        <div>
          <p className="eyebrow">Data export</p>
          <h1>Exporter</h1>
          <p className="exporter-intro">Scan the selected environment and retained log backups for Station-compatible blueprint records.</p>
          <p className="community-disclosure" role="note">AstraDock Local is an unofficial, community-made Star Citizen tool. It is not affiliated with, endorsed by, sponsored by, or licensed by Cloud Imperium Games or Roberts Space Industries. <span>Official site: robertsspaceindustries.com</span></p>
        </div>
        <div className="exporter-actions">
          <button type="button" className="button secondary" onClick={() => void onChooseDirectory()}>Choose install directory</button>
          {running ? <button type="button" className="button secondary" onClick={() => void cancelExport()}>Cancel export</button> : null}
        </div>
      </header>

      <section className="exporter-grid" aria-label="Export configuration and status">
        <section className="exporter-card" aria-labelledby="export-config-heading">
          <h2 id="export-config-heading">Export configuration</h2>
          <label className="exporter-field"><span>Export type</span><select value={exportType} onChange={(event) => setExportType(event.target.value as BlueprintExportOptions['exportType'])} disabled={running}><option value="blueprint_data">Blueprint Data</option><option disabled value="inventory">Inventory — future</option><option disabled value="fleet">Fleet — future</option><option disabled value="reputation">Reputation — future</option></select></label>
          <label className="exporter-field"><span>Environment</span><select value={source?.sourceId || ''} onChange={(event) => void onSelectSource(event.target.value)} disabled={!availableSources.length || running}><option value="" disabled>Select environment</option>{availableSources.map((candidate) => <option key={candidate.sourceId} value={candidate.sourceId}>{candidate.channelHint}</option>)}</select><span className="exporter-environment-status" data-found={source?.validation.isValid ? 'true' : 'false'}>{source?.validation.isValid ? source.channelHint : 'Not detected'}</span></label>
          <label className="exporter-field"><span>Output format</span><select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as BlueprintExportOptions['outputFormat'])} disabled={running}><option value="json">JSON</option><option value="csv">CSV</option></select></label>
          <div className="exporter-export-actions" aria-label="Export actions">
            <button type="button" className="button secondary" onClick={() => void runExport(true)} disabled={running || !source?.validation.isValid}>Test export</button>
            <button type="button" className="button primary" onClick={() => void runExport(false)} disabled={running || !source?.validation.isValid}>Export {outputFormat.toUpperCase()}</button>
          </div>
          <div className="exporter-source-summary">
            <span className="eyebrow">Source</span>
            <strong title={source?.displayPath || undefined} className="exporter-path">{source?.displayPath || 'Choose Roberts Space Industries directory'}</strong>
            <span>{source?.validation?.isValid ? 'Using Game.log and its logbackups directory' : 'Choose a validated environment'}</span>
          </div>
        </section>

        <section className="exporter-card" aria-labelledby="export-status-heading" aria-live="polite">
          <h2 id="export-status-heading">Export status</h2>
          <div className="exporter-status-line"><span data-state={phase}>{getExporterStatusLabel(phase, operation, outputFormat)}</span><strong>{progressLabel}</strong></div>
          <div className="export-progress" role="progressbar" aria-label="Log scan progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}><span style={{ width: `${progressPercent}%` }} /></div>
          <dl className="exporter-facts">
            <div><dt>Records found</dt><dd>{progress.recordsFound}</dd></div>
            <div><dt>Duplicates suppressed</dt><dd>{progress.duplicatesSuppressed}</dd></div>
            <div><dt>Output</dt><dd>{result?.outputFileName || 'Not saved'}</dd></div>
          </dl>
          {error ? <p className="exporter-error" role="alert">{error}</p> : null}
          {result?.extraction.status === 'unsupported' ? <p className="exporter-warning" role="status">Blueprint extraction is unavailable for this source. No evidence-approved build and locale profile is enabled, so no records were exported.</p> : null}
          {result?.status === 'no_matches' && result.extraction.status === 'approved' ? <p className="exporter-empty">No qualifying blueprint notifications were found. The logs may predate blueprint activity or contain no blueprint acquisition events.</p> : null}
          {result ? <ul className="exporter-explanation-list" aria-label="Export result explanations">
            <li><strong>{readyFileCount} ready</strong><span>Files that were found and readable by AstraDock.</span></li>
            <li><strong>{result.filesScanned} scanned</strong><span>Files whose detected build matched an approved blueprint extraction profile.</span></li>
            <li><strong>{warningSummary?.unsupportedProfileCount || 0} outside approved profile</strong><span>Readable files from builds that are not approved yet, so they were not parsed and cannot contribute records.</span></li>
            <li><strong>{result.skippedFiles} skipped or unavailable</strong><span>Files or directories that were missing, malformed, inaccessible, or otherwise excluded from the source set.</span></li>
            {isTestExport ? <li><strong>Test export</strong><span>This previews the result only; no output file is written.</span></li> : null}
          </ul> : null}
          {unsupportedFiles.length ? <details className="exporter-diagnostics"><summary>See affected files and builds</summary><p>These files were readable, but blueprint extraction is disabled for their detected build. Capture and approve evidence for that build before relying on its results.</p><ul>{unsupportedFiles.map((file) => <li key={`${file.kind}:${file.file}`}><code>{file.file}</code> — build {file.build || 'unknown'}</li>)}</ul></details> : null}
          {warningSummary?.otherWarningCount ? <p className="exporter-warning" role="status">{warningSummary.otherWarningCount} additional source warning{warningSummary.otherWarningCount === 1 ? '' : 's'} require review; the export may be partial.</p> : null}
          {result ? <p className="exporter-source-note" role="status">Source set fingerprint: {result.sourceFingerprint}.</p> : null}
        </section>
      </section>

      <section className="exporter-card exporter-results" aria-labelledby="export-results-heading">
        <div className="exporter-results-heading"><div><p className="eyebrow">Station import payload</p><h2 id="export-results-heading">Blueprint records</h2></div><span>{result ? `${result.records.length} unique` : 'No export yet'}</span></div>
        {result?.records.length ? <>
          <div className="exporter-table-wrap"><table><thead><tr><th scope="col" className="exporter-row-number-heading">#</th><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Shared</th></tr></thead><tbody>{result.records.map((record, index) => <tr key={record.name}><td className="exporter-row-number" aria-label={`Record ${index + 1}`}>{index + 1}</td><td>{record.name}</td><td>{record.type || 'Unknown'}</td><td>{record.shared === null ? 'Unknown' : record.shared ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div>
          {result.records.every((record) => !record.type && record.shared === null) ? <p className="exporter-metadata-note" role="note">Type and Shared are unknown for these records because the approved Game.log blueprint notification contains the blueprint name only. Those fields require trusted Station or extracted game-data metadata; they are left blank in the exported file rather than inferred.</p> : null}
        </> : <p className="exporter-empty">Run an export to inspect normalized records before importing them into Station.</p>}
      </section>
    </main>
  );
}
