import { useMemo, useState } from 'react';
import type { BuildCompatibilityCatalog, BuildCompatibilityEntry } from '../../contracts/rendererApi';

export function CompatibilityPanel({ catalog }: { catalog: BuildCompatibilityCatalog | null }) {
  const [selectedBuild, setSelectedBuild] = useState<string | null>(null);
  const [family, setFamily] = useState('all');
  const builds = catalog?.builds || [];
  const families = useMemo(() => [...new Set(builds.map((entry) => entry.family))], [builds]);
  const filtered = builds.filter((entry) => family === 'all' || entry.family === family);
  const selected = builds.find((entry) => entry.build === selectedBuild) || filtered[0] || null;

  if (!catalog) return <main className="compatibility-page" aria-label="Compatibility catalog"><p>Loading compatibility catalog…</p></main>;

  return <main className="compatibility-page" aria-label="Compatibility catalog">
    <header className="page-heading">
      <div><p className="eyebrow">LOCAL KNOWLEDGE BASE</p><h1>Compatibility catalog</h1><p>Known Star Citizen builds are registered separately from the parser capabilities proven for each build.</p></div>
      <div className="compatibility-summary" aria-label="Catalog summary"><strong>{builds.length}</strong><span>observed builds</span><strong>{builds.filter((entry) => entry.capabilities.blueprint.status === 'supported').length}</strong><span>blueprint-capable</span></div>
    </header>
    <div className="compatibility-layout">
      <section className="compatibility-table-card" aria-labelledby="build-list-heading">
        <div className="panel-heading"><div><h2 id="build-list-heading">Registered builds</h2><p>Evidence source: owner log archive · {builds.reduce((sum, entry) => sum + entry.observedFileCount, 0)} files</p></div><label>Family<select value={family} onChange={(event) => setFamily(event.target.value)}><option value="all">All families</option>{families.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div>
        <div className="compatibility-table-wrap"><table className="compatibility-table"><thead><tr><th scope="col">Build</th><th scope="col">Family</th><th scope="col">Blueprints</th><th scope="col">Evidence</th></tr></thead><tbody>{filtered.map((entry) => <tr key={entry.build} className={entry.build === selected?.build ? 'is-selected' : undefined}><td><button type="button" className="table-link" onClick={() => setSelectedBuild(entry.build)} aria-label={`Inspect build ${entry.build}`}>{entry.build}</button></td><td>{entry.family}</td><td><StatusPill status={entry.capabilities.blueprint.status} /></td><td>{entry.observedFileCount} logs</td></tr>)}</tbody></table></div>
      </section>
      <CompatibilityDetail entry={selected} />
    </div>
  </main>;
}

function CompatibilityDetail({ entry }: { entry: BuildCompatibilityEntry | null }) {
  if (!entry) return <aside className="compatibility-detail"><p>Select a registered build to inspect its capability coverage.</p></aside>;
  const blueprint = entry.capabilities.blueprint;
  return <aside className="compatibility-detail" aria-live="polite"><p className="eyebrow">BUILD DETAIL</p><h2>{entry.build}</h2><dl className="compatibility-facts"><div><dt>Family</dt><dd>{entry.family}</dd></div><div><dt>Observed files</dt><dd>{entry.observedFileCount}</dd></div><div><dt>Blueprint capture</dt><dd><StatusPill status={blueprint.status} /></dd></div><div><dt>Profile</dt><dd>{blueprint.profileId || 'None'}</dd></div></dl><p className="compatibility-note">{blueprint.detail}</p><details><summary>Future capability slots</summary><p>Additional log event families will appear here as evidence is reviewed. A registered build may remain known while individual capabilities are unevaluated.</p></details></aside>;
}

function StatusPill({ status }: { status: 'supported' | 'not_evaluated' }) {
  return <span className={`status-pill status-${status}`}>{status === 'supported' ? 'Supported' : 'Not evaluated'}</span>;
}
