import { useEffect, useState } from 'react';
import type { PublicRuntimeSource, RuntimeMonitorClient } from './astradock-api';
import type { BlueprintExportResult, MonitorChangeEnvelope } from '../../contracts/rendererApi';

interface ExporterPanelProps {
  client: RuntimeMonitorClient;
  source: PublicRuntimeSource | null;
  onChooseDirectory: () => Promise<void>;
  onChooseSource: () => Promise<void>;
}

const phaseLabels: Record<string, string> = {
  validating: 'Validating source',
  scanning: 'Scanning logs',
  deduplicating: 'Removing duplicates',
  awaiting_save: 'Choose save location',
  writing: 'Writing JSON',
  completed: 'Export complete',
  no_matches: 'No blueprint matches',
  partial: 'Export completed with warnings',
  cancelled: 'Export cancelled'
};

export function ExporterPanel({ client, source, onChooseDirectory, onChooseSource }: ExporterPanelProps) {
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

  async function runExport() {
    if (!source) {
      setError('Choose a validated LIVE game.log source first.');
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    setPhase('validating');
    try {
      const next = await client.exporter.run({ sourceId: source.sourceId, exportType: 'blueprint_data', environment: 'LIVE', outputFormat: 'json' });
      setResult(next);
      setPhase(next.status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Blueprint export failed.');
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

  return (
    <main id="exporter-main" className="exporter-workspace" aria-label="Exporter">
      <header className="exporter-header">
        <div>
          <p className="eyebrow">Data export</p>
          <h1>Exporter</h1>
          <p className="exporter-intro">Scan the active LIVE session and retained log backups for Station-compatible blueprint records.</p>
        </div>
        <div className="exporter-actions">
          <button type="button" className="button secondary" onClick={() => void onChooseDirectory()}>Choose install directory</button>
          <button type="button" className="button secondary" onClick={() => void onChooseSource()}>Override source file</button>
          {running ? <button type="button" className="button secondary" onClick={() => void cancelExport()}>Cancel export</button> : <button type="button" className="button primary" onClick={() => void runExport()}>Export JSON</button>}
        </div>
      </header>

      <section className="exporter-grid" aria-label="Export configuration and status">
        <section className="exporter-card" aria-labelledby="export-config-heading">
          <h2 id="export-config-heading">Export configuration</h2>
          <label className="exporter-field"><span>Export type</span><select value="blueprint_data" disabled><option value="blueprint_data">Blueprint Data</option><option disabled>Inventory — future</option><option disabled>Fleet — future</option><option disabled>Reputation — future</option></select></label>
          <label className="exporter-field"><span>Environment</span><select value="LIVE" disabled><option value="LIVE">LIVE</option></select></label>
          <label className="exporter-field"><span>Output format</span><select value="json" disabled><option value="json">JSON</option></select></label>
          <div className="exporter-source-summary">
            <span className="eyebrow">Source</span>
            <strong>{source?.displayLabel || 'Awaiting source'}</strong>
            <span>{source?.validation?.isValid ? 'Using Game.log and its logbackups directory' : 'Choose a Star Citizen channel directory'}</span>
          </div>
        </section>

        <section className="exporter-card" aria-labelledby="export-status-heading" aria-live="polite">
          <h2 id="export-status-heading">Export status</h2>
          <div className="exporter-status-line"><span data-state={phase}>{phaseLabels[phase] || 'Ready to export'}</span><strong>{progressLabel}</strong></div>
          <div className="export-progress" role="progressbar" aria-label="Log scan progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}><span style={{ width: `${progressPercent}%` }} /></div>
          <dl className="exporter-facts">
            <div><dt>Records found</dt><dd>{progress.recordsFound}</dd></div>
            <div><dt>Duplicates suppressed</dt><dd>{progress.duplicatesSuppressed}</dd></div>
            <div><dt>Output</dt><dd>{result?.outputFileName || 'Not saved'}</dd></div>
          </dl>
          {error ? <p className="exporter-error" role="alert">{error}</p> : null}
          {result?.extraction.status === 'unsupported' ? <p className="exporter-warning" role="status">Blueprint extraction is unavailable for this source. No evidence-approved build and locale profile is enabled, so no records were exported.</p> : null}
          {result?.status === 'no_matches' && result.extraction.status === 'approved' ? <p className="exporter-empty">No qualifying blueprint notifications were found. The logs may predate blueprint activity or contain no blueprint acquisition events.</p> : null}
          {result?.errors.length ? <p className="exporter-warning" role="status">{result.errors.length} log file warning{result.errors.length === 1 ? '' : 's'}; the export may be partial.</p> : null}
          {result ? <p className="exporter-source-note" role="status">Source set: {result.files.filter((file) => file.status === 'ready').length} included, {result.skippedFiles} skipped or unavailable; fingerprint {result.sourceFingerprint}.</p> : null}
        </section>
      </section>

      <section className="exporter-card exporter-results" aria-labelledby="export-results-heading">
        <div className="exporter-results-heading"><div><p className="eyebrow">Station import payload</p><h2 id="export-results-heading">Blueprint records</h2></div><span>{result ? `${result.records.length} unique` : 'No export yet'}</span></div>
        {result?.records.length ? <div className="exporter-table-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>Shared</th></tr></thead><tbody>{result.records.map((record) => <tr key={record.name}><td>{record.name}</td><td>{record.type || 'Unknown'}</td><td>{record.shared === null ? 'Unknown' : record.shared ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div> : <p className="exporter-empty">Run an export to inspect normalized records before importing them into Station.</p>}
      </section>
    </main>
  );
}
