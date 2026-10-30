import { useEffect, useRef, useState } from 'react';
import type { StationApi, StationConsent, StationProfile, StationReview, StationSnapshot } from '../../contracts/stationApi';

export type StationPage = 'signIn' | 'access' | 'inventory';
const capabilityLabels = { catalogRead: 'Read item catalog', inventoryRead: 'Read my inventory', inventoryWrite: 'Send reviewed inventory changes' } as const;
export function StationSettings({ client, snapshot, onChange, page, onPageChange, now = new Date() }: {
  client: StationApi | undefined; snapshot: StationSnapshot | null; onChange: (value: StationSnapshot) => void;
  page: StationPage; onPageChange: (page: StationPage) => void; now?: Date;
}) {
  const [profile, setProfile] = useState<StationProfile>(snapshot?.profile || { label: 'AstraDock Station', apiBaseUrl: '', clientId: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<StationReview | null>(null);
  const [phase, setPhase] = useState<'review' | 'first' | 'second'>('review');
  const [lookupId, setLookupId] = useState('');
  const [catalog, setCatalog] = useState<Awaited<ReturnType<StationApi['resolveItems']>>>([]);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const reviewTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (snapshot?.profile) setProfile(snapshot.profile); }, [snapshot?.profile?.apiBaseUrl, snapshot?.profile?.label, snapshot?.profile?.clientId]);
  useEffect(() => { if (review) reviewHeading.current?.focus(); }, [review?.stage, phase]);
  useEffect(() => { if (!snapshot?.session?.capabilities.inventoryWrite || !snapshot.consent.inventoryWrite || !snapshot.session.capabilities.inventoryRead || !snapshot.consent.inventoryRead) setReview(null); }, [snapshot?.session, snapshot?.consent]);
  const expired = Boolean(snapshot?.session && Date.parse(snapshot.session.expiresAt) <= now.valueOf());
  const unavailable = !client || !snapshot?.storageAvailable;
  const disabled = Boolean(busy) || unavailable;
  const remoteDisabled = disabled || !snapshot?.adapterAvailable || !snapshot.session || expired;

  async function run(label: string, work: () => Promise<StationSnapshot>) {
    setBusy(label); setError(null);
    try { const result = await work(); onChange(result); return result; }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Station could not complete this action.'); if (client) { try { onChange(await client.getSnapshot()); } catch { /* Keep the last confirmed UI state qualified by the visible error. */ } } return null; }
    finally { setBusy(null); }
  }
  async function startReview(proposalId: string, trigger: HTMLButtonElement) {
    reviewTrigger.current = trigger;
    const result = await run('Loading review', () => client!.review(proposalId));
    if (result?.review) { setReview(result.review); setPhase('review'); }
  }
  async function confirm() {
    if (!review) return;
    const result = await run('Confirming change', () => client!.confirm(review.proposalId, review.challenge));
    if (!result) { setReview(null); return; }
    setReview(result.review);
    if (result.review) setPhase('second');
    else { reviewTrigger.current?.focus(); if (!result.consent.paused) await run('Sending confirmed change', () => client!.retry()); }
  }
  async function cancelReview() {
    if (review) await run('Cancelling review', () => client!.cancel(review.proposalId));
    setReview(null); setPhase('review'); reviewTrigger.current?.focus();
  }
  async function lookupItem() {
    setBusy('Resolving item'); setError(null);
    try { setCatalog(await client!.resolveItems([lookupId.trim()])); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Item resolution failed.'); }
    finally { setBusy(null); }
  }
  const inventory = snapshot?.inventory;
  const age = inventory ? Math.max(0, Math.floor((now.valueOf() - Date.parse(inventory.lastUpdatedAt)) / 60000)) : null;
  const updated = inventory ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'long' }).format(new Date(inventory.lastUpdatedAt)) : 'Never updated';
  return <section className="settings-card settings-wide station-settings" aria-labelledby="station-heading">
    <div className="panel-heading"><div><p className="eyebrow">OPTIONAL CONNECTION</p><h2 id="station-heading">AstraDock Station</h2></div><span className="settings-state">{snapshot?.state.replaceAll('_', ' ') || 'Loading'}</span></div>
    <p>Sign-in is optional. Local monitoring and the overlay work without a Station account. Only your connected account is managed here.</p>
    <nav className="settings-actions" aria-label="Station settings">
      {([['signIn', 'Sign-in'], ['access', 'Station access'], ['inventory', 'My inventory']] as const).map(([id, label]) => <button type="button" key={id} aria-current={page === id ? 'page' : undefined} onClick={() => onPageChange(id)}>{label}</button>)}
    </nav>
    {unavailable ? <p role="status">{!client ? 'Station desktop services are unavailable.' : !snapshot ? 'Loading Station settings…' : 'Protected Station storage is unavailable. No credentials or private inventory will be saved in plaintext.'}</p> : null}
    {snapshot && !snapshot.adapterAvailable ? <p className="station-notice" role="note">{snapshot.adapterMessage} You can save your service configuration now. Sign-in and synchronization will become available when Station connectivity is ready.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    <p role="status" aria-live="polite">{busy || ''}</p>
    {page === 'signIn' ? <section aria-labelledby="station-signin-heading"><h3 id="station-signin-heading">Discord sign-in through Station</h3>
      <form className="settings-fields" onSubmit={event => { event.preventDefault(); void run('Saving Station configuration', () => client!.configure(profile)); }}>
        <label><span>Service name</span><input value={profile.label} required maxLength={80} onChange={event => setProfile(current => ({ ...current, label: event.target.value }))} disabled={disabled} /></label>
        <label><span>Station HTTPS service address</span><input type="url" value={profile.apiBaseUrl} required maxLength={2048} placeholder="HTTPS address supplied by your Station developer portal" onChange={event => setProfile(current => ({ ...current, apiBaseUrl: event.target.value }))} disabled={disabled} /><small>Changing service configuration signs out and clears local consent. Credentials are never forwarded to a different service.</small></label>
        <label><span>Public desktop client ID</span><input value={profile.clientId} maxLength={192} onChange={event => setProfile(current => ({ ...current, clientId: event.target.value }))} disabled={disabled} /><small>Provided by the developer portal. Leave empty while registration is unavailable. Never enter a client secret or Discord token.</small></label>
        <div><button type="submit" disabled={disabled}>Save service configuration{snapshot?.session ? ' and sign out' : ''}</button></div>
      </form>
      <dl className="settings-facts"><div><dt>Account</dt><dd>{snapshot?.session?.displayName || 'Not signed in'}</dd></div><div><dt>Station destination</dt><dd>{snapshot?.profile?.apiBaseUrl || 'Not configured'}</dd></div></dl>
      <div className="settings-actions"><button type="button" disabled={disabled || !snapshot?.profile || !snapshot.adapterAvailable} onClick={() => void run('Waiting for browser sign-in', () => client!.signIn())}>Sign in with Discord via Station</button>
      {busy === 'Waiting for browser sign-in' ? <button type="button" onClick={() => void client?.cancelSignIn().then(onChange).catch(() => setError('Sign-in cancellation could not be completed.'))}>Cancel sign-in</button> : null}
      {snapshot?.session ? <button type="button" disabled={disabled} onClick={() => void run('Signing out', () => client!.signOut())}>Sign out and disconnect</button> : null}</div>
    </section> : page === 'access' ? <section aria-labelledby="station-access-heading"><h3 id="station-access-heading">My Station access</h3>
      <dl className="settings-facts"><div><dt>Connected user</dt><dd>{snapshot?.session?.displayName || 'Not signed in'}</dd></div><div><dt>Roles</dt><dd>{snapshot?.session?.roles.join(', ') || 'None reported'}</dd></div><div><dt>Permission freshness</dt><dd>{expired ? 'Expired — refresh before remote operations' : snapshot?.session ? `Valid until ${new Date(snapshot.session.expiresAt).toLocaleString()}` : 'Unknown'}</dd></div></dl>
      <p>Station controls your grants. A permission is separate from consent and never bypasses review or either confirmation. Other users and role administration are managed in Station.</p>
      <fieldset className="settings-fields" disabled={disabled}><legend>Connection and data consent</legend>{Object.entries(capabilityLabels).map(([key, label]) => {
        const capability = key as keyof typeof capabilityLabels;
        const granted = snapshot?.session?.capabilities[capability] || false;
        return <label className="station-consent" key={key}><span><input type="checkbox" checked={snapshot?.consent[capability] || false} disabled={!granted || expired || Boolean(busy)} onChange={event => void run('Updating consent', () => client!.updateConsent({ [capability]: event.target.checked } as Partial<StationConsent>))} />{label}</span><small>{!snapshot?.session ? 'Sign in to load your permissions' : expired ? 'Online permission status expired' : granted ? 'Permitted by Station; opt in separately' : 'Not permitted by Station'}</small></label>;
      })}<label><span><input type="checkbox" checked={snapshot?.consent.paused ?? true} onChange={event => void run('Updating synchronization', () => client!.updateConsent({ paused: event.target.checked }))} />Pause outbound synchronization</span><small>Resuming sends only changes already reviewed and confirmed twice.</small></label></fieldset>
      <details><summary>Effective permissions reported by Station</summary><ul>{snapshot?.session?.permissions.map(permission => <li key={permission}>{permission}</li>)}</ul>{!snapshot?.session?.permissions.length ? <p>No permissions reported.</p> : null}</details>
      {snapshot?.session?.capabilities.catalogRead ? <section aria-labelledby="station-catalog-heading"><h3 id="station-catalog-heading">Item catalog lookup</h3><form className="settings-fields" onSubmit={event => { event.preventDefault(); void lookupItem(); }}><label><span>Exact game item identifier</span><input value={lookupId} maxLength={192} required onChange={event => setLookupId(event.target.value)} disabled={remoteDisabled || !snapshot.consent.catalogRead} /></label><div><button type="submit" disabled={remoteDisabled || !snapshot.consent.catalogRead || !lookupId.trim()}>Look up item</button></div></form><ul>{catalog.map(item => <li key={item.gameId}>{item.name || item.gameId} · {item.status} · {item.itemId || 'No unique Station ID'} · Catalog {item.revision}</li>)}</ul><p>Names enrich presentation. Unknown or ambiguous identifiers never authorize an inventory change.</p></section> : null}
      <div className="settings-actions"><button type="button" disabled={disabled || !snapshot?.session || !snapshot.adapterAvailable} onClick={() => void run('Refreshing access', () => client!.refreshAccess())}>Refresh my access</button>{snapshot?.session ? <button type="button" disabled={disabled} onClick={() => void run('Disconnecting', () => client!.signOut())}>Disconnect Station</button> : null}</div>
    </section> : <section aria-labelledby="station-inventory-heading"><h3 id="station-inventory-heading">My Station inventory</h3>
      <div className="station-freshness" role="status"><strong>Last updated: {updated}</strong><span>{age === null ? 'No complete inventory has been downloaded.' : `${age} minutes ago · ${expired || snapshot?.state === 'offline' ? 'Offline / expired connection — cached inventory' : inventory?.stale ? 'Stale confirmed inventory — refresh required' : 'Last complete Station snapshot'}`}</span></div>
      <p>Single game identity · {inventory ? `${inventory.environmentKey} · Inventory epoch ${inventory.epoch}` : 'Environment unknown'} · Pending changes do not alter confirmed quantities.</p>
      <button type="button" disabled={remoteDisabled || !snapshot?.session?.capabilities.inventoryRead || !snapshot.consent.inventoryRead} onClick={() => void run('Refreshing inventory', () => client!.refreshInventory())}>Refresh my inventory</button>
      {inventory ? inventory.items.length ? <div className="station-table-scroll"><table><caption>Confirmed Station inventory</caption><thead><tr><th scope="col">Item</th><th scope="col">Quantity</th><th scope="col">Unit</th><th scope="col">Location</th></tr></thead><tbody>{inventory.items.map(item => <tr key={item.id}><td>{item.name || 'Unresolved item'}<details><summary>Item identifier</summary>{item.itemId}</details></td><td>{item.quantity}</td><td>{item.unit}</td><td>{item.location || 'Unknown'}</td></tr>)}</tbody></table></div> : <p>Your last complete Station inventory is empty.</p> : <p>No authorized complete inventory is available. Sign in, enable inventory-read consent and refresh when Station support is available.</p>}
      <h3>Changes awaiting review</h3><p>Review → first “Are you sure?” → second “Are you sure?” → queue/send. Approved drops remove their quantity from current inventory. Requests, shop success, attachments and missing data alone are not ownership evidence.</p>
      {snapshot?.proposals.length ? <ul>{snapshot.proposals.map(proposal => <li key={proposal.id}><strong>{proposal.change.kind} · {proposal.change.quantity} × {proposal.change.itemId}</strong><span> · {proposal.status.replaceAll('_', ' ')}</span>{proposal.reason ? <p>{proposal.reason}</p> : null}{['awaiting_review', 'conflict'].includes(proposal.status) ? <div className="settings-actions"><button type="button" disabled={remoteDisabled || !snapshot.session?.capabilities.inventoryWrite || !snapshot.consent.inventoryWrite} onClick={event => void startReview(proposal.id, event.currentTarget)}>Review change</button><button type="button" disabled={disabled} onClick={() => void run('Rejecting proposal', () => client!.reject(proposal.id))}>Reject change</button></div> : null}</li>)}</ul> : <p>No qualified inventory changes are awaiting review. Unsupported or incomplete observations are never promoted just to create proposals.</p>}
      {review && snapshot?.session?.capabilities.inventoryWrite && snapshot.consent.inventoryWrite && snapshot.session.capabilities.inventoryRead && snapshot.consent.inventoryRead ? <section className="station-review" aria-labelledby="station-review-heading"><h3 ref={reviewHeading} tabIndex={-1} id="station-review-heading">{phase === 'review' ? 'Review inventory change' : phase === 'first' ? 'Are you sure? — confirmation 1 of 2' : 'Are you sure? — confirmation 2 of 2'}</h3><p>{review.name}: {review.before} → {review.after} {review.unit}</p><p>Destination: {snapshot?.profile?.label} · {snapshot?.session?.displayName} · {inventory?.environmentKey}</p>
        <details><summary>Minimized change payload</summary><pre>{JSON.stringify(snapshot?.proposals.find(proposal => proposal.id === review.proposalId)?.change, null, 2)}</pre></details>
        <p>{phase === 'review' ? 'Inspect the exact item, action, quantity and destination. Reviewing does not send anything.' : phase === 'first' ? 'The second confirmation is still required. Nothing has been queued or sent.' : 'This final confirmation queues this exact change. Synchronization permissions and consent are checked again before sending.'}</p>
        <div className="settings-actions"><button type="button" disabled={Boolean(busy)} onClick={() => void cancelReview()}>Cancel without sending</button><button type="button" disabled={remoteDisabled} onClick={() => phase === 'review' ? setPhase('first') : void confirm()}>{phase === 'review' ? 'Review complete — continue' : phase === 'first' ? 'Yes — continue to final confirmation' : 'Yes — queue this reviewed change'}</button></div>
      </section> : null}
      <h3>Outbound operations</h3><p>{snapshot?.consent.paused ? 'Synchronization is paused.' : 'Only fully confirmed operations are eligible to send.'}</p>
      <ul>{snapshot?.operations.map(operation => <li key={operation.id}>{operation.status} · {operation.attempts} attempts{operation.reason ? ` · ${operation.reason}` : ''}{operation.nextAttemptAt ? ` · Retry after ${new Date(operation.nextAttemptAt).toLocaleString()}` : ''}</li>)}</ul>
      <button type="button" disabled={remoteDisabled || !snapshot?.consent.inventoryWrite || snapshot.consent.paused} onClick={() => void run('Retrying eligible confirmed operations', () => client!.retry())}>Retry eligible confirmed operations</button>
    </section>}
  </section>;
}
