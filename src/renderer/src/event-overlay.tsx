import { useEffect, useState } from 'react';
import type { OverlayFeed } from '../../contracts/rendererApi';
import { orderOverlayFeed } from './event-overlay-model';
import { useNewestFirstScroll } from './use-newest-first-scroll';
import { CATEGORIES, ACTIONS, ITEM_TYPES, normalizeOverlayFilters, type OverlayFilters } from './overlay-filter-options';

const EMPTY_FEED: OverlayFeed = { state: 'loading', environment: 'Waiting for Runtime Monitor', events: [] };

export function EventOverlay() {
  const [feed, setFeed] = useState<OverlayFeed>(EMPTY_FEED);
  const [opacity, setOpacity] = useState(0.82);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<OverlayFilters>(() => normalizeOverlayFilters());
  const [savingFilters, setSavingFilters] = useState(false);
  const streamRef = useNewestFirstScroll<HTMLElement>(feed.events, true);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.astradock.overlay.subscribeFeed((next) => { if (active) setFeed(orderOverlayFeed(next)); });
    void window.astradock.overlay.getPreferences().then((preferences) => {
      if (active) { setOpacity(preferences.opacity); setFilters(normalizeOverlayFilters(preferences.filters)); }
    }).catch(() => { if (active) setError('Overlay preferences could not be loaded.'); });
    return () => { active = false; unsubscribe(); };
  }, []);

  async function updatePreference(patch: { opacity?: number; displayMode?: 'friendly' | 'raw'; filters?: OverlayFilters }) {
    setError(null);
    try {
      const preferences = await window.astradock.overlay.updatePreferences(patch);
      setOpacity(preferences.opacity);
      if (patch.filters) setFilters(normalizeOverlayFilters(preferences.filters ?? patch.filters));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Overlay preference could not be changed.');
    }
  }

  async function updateFilters(next: OverlayFilters) {
    setSavingFilters(true);
    try { await updatePreference({ filters: next }); } finally { setSavingFilters(false); }
  }

  async function closeOverlay() {
    try {
      await window.astradock.overlay.close();
    } catch {
      setError('The event overlay could not be closed. Please try again.');
    }
  }

  return (
    <main className="event-overlay" aria-label="AstraDock live event overlay">
      <header className="event-overlay__header">
        <div>
          <p className="event-overlay__eyebrow">ASTRADOCK · LIVE EVENT STREAM</p>
          <h1>{feed.environment}</h1>
          <p className="event-overlay__status" data-state={feed.state}>{feed.state === 'unsupported_profile' ? 'Unsupported build' : feed.state === 'unverified_build' ? 'Unverified build' : feed.state === 'suspected_drift' ? 'Parser patterns changed' : feed.state.replaceAll('_', ' ')}</p>
        </div>
        <button type="button" className="event-overlay__close" onClick={() => void closeOverlay()} aria-label="Close event overlay">Close</button>
      </header>
      <section className="event-overlay__controls" aria-label="Overlay settings">
        <p className="event-overlay__pinned">Always on top</p>
        <div className="event-overlay__view"><span>View</span><button type="button" role="switch" aria-label="Show raw log messages" aria-checked={feed.displayMode === 'raw'} onClick={() => void updatePreference({ displayMode: feed.displayMode === 'raw' ? 'friendly' : 'raw' })}>{feed.displayMode === 'raw' ? 'Raw log' : 'Friendly'}</button></div>
        <label className="event-overlay__opacity"><span>Opacity <output>{Math.round(opacity * 100)}%</output></span><input type="range" min="45" max="100" value={Math.round(opacity * 100)} onChange={(event) => void updatePreference({ opacity: Number(event.currentTarget.value) / 100 })} aria-label="Overlay opacity" /></label>
      </section>
      <details className="event-overlay__filters"><summary>Filter events · {Object.values(filters).reduce((sum, values) => sum + values.length, 0)} selections</summary>
        <p>Selections narrow together. No selections in a group means all types. Counts cover the retained live buffer.</p>
        <div className="event-overlay__filter-groups">{([['categories', 'Event category', CATEGORIES], ['actions', 'Action type', ACTIONS], ['itemTypes', 'Item type', ITEM_TYPES]] as const).map(([key, label, options]) => <fieldset key={key} disabled={savingFilters}><legend>{label}</legend>{Object.entries(options).map(([id, name]) => <label key={id}><input type="checkbox" checked={filters[key].includes(id)} onChange={() => void updateFilters({ ...filters, [key]: filters[key].includes(id) ? filters[key].filter(value => value !== id) : [...filters[key], id] })} />{name}</label>)}</fieldset>)}</div>
        <button type="button" disabled={savingFilters} onClick={() => void updateFilters(normalizeOverlayFilters())}>Show all types</button>
      </details>
      {error ? <p className="event-overlay__error" role="alert">{error}</p> : null}
      {feed.statusMessage ? <p className="event-overlay__capture-status" role="status">{feed.statusMessage}</p> : null}
      <p className="visually-hidden" role="status" aria-live="polite">{savingFilters ? 'Updating filters' : `${Object.values(filters).reduce((sum, values) => sum + values.length, 0)} filter values selected`} · {feed.state}</p>
      <section ref={streamRef} className="event-overlay__stream" aria-label="Selected event kinds">
        {feed.events.length ? feed.events.map((event) => (
          <article className="event-overlay__event" key={event.id}>
            <div className="event-overlay__event-meta"><strong>{event.kind}</strong><time>{event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : 'Time unavailable'}</time></div>
            {feed.displayMode === 'raw' ? <>
              {event.rawEvidence?.messages.map((message, index) => <pre className="event-overlay__raw" key={index}>{message}</pre>)}
              {event.rawEvidence?.status !== 'available' ? <p className="event-overlay__evidence-status">{event.rawEvidence?.status === 'partial' ? 'Some contributing raw messages are unavailable.' : 'Original log message unavailable in the current evidence cache.'}</p> : null}
            </> : <p>{event.summary}</p>}
            {event.evidenceNote ? <details className="event-overlay__evidence"><summary>Evidence details</summary><p>{event.evidenceNote}</p></details> : null}
            <div className="event-overlay__event-provenance">{event.confidence} confidence · {event.provenance}</div>
          </article>
        )) : <p className="event-overlay__empty">{feed.state === 'loading' ? 'Connecting to Runtime Monitor…' : ['unsupported_profile', 'unverified_build'].includes(feed.state) ? 'No gameplay events are available for the current parser status.' : (feed.availableCount ?? 0) > 0 ? 'No events match these filters in the retained live buffer.' : feed.state === 'waiting' ? 'Waiting for capture in the main application. Use Start follow or Open event overlay to follow the selected environment.' : 'Waiting for gameplay events since AstraDock started.'}</p>}
      </section>
    </main>
  );
}
