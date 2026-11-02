import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StationSettings, type StationPage } from '../src/renderer/src/station-settings';
import type { StationApi, StationSnapshot } from '../src/contracts/stationApi';

const base = (): StationSnapshot => ({
  storageAvailable: true, adapterAvailable: true, adapterMessage: null, state: 'connected',
  profile: { label: 'Synthetic Station', apiBaseUrl: 'https://station.example.org', clientId: 'synthetic-client' },
  session: { displayName: 'Synthetic player', roles: ['member'], permissions: ['synthetic-permission'], capabilities: { catalogRead: true, inventoryRead: true, inventoryWrite: true }, expiresAt: '2026-10-30T13:00:00.000Z' },
  consent: { catalogRead: true, inventoryRead: true, inventoryWrite: true, paused: true },
  inventory: { revision: 'revision-1', environmentKey: 'LIVE-synthetic', epoch: 'epoch-1', lastUpdatedAt: '2026-10-30T11:00:00.000Z', stale: false, items: [{ id: 'row-1', itemId: 'item-1', name: 'Synthetic bottle', quantity: 5, unit: 'items', location: null }] },
  proposals: [{ id: 'proposal-1', status: 'awaiting_review', reason: null, change: { eventId: 'event-1', ruleVersion: 'rule-1', kind: 'drop', itemId: 'item-1', quantity: 2, unit: 'items', environmentKey: 'LIVE-synthetic', epoch: 'epoch-1', sourceTimestamp: '2026-10-30T11:30:00.000Z', ingestedAt: '2026-10-30T11:30:01.000Z', gameBuild: 'synthetic-build', provenance: 'observed', confidence: 'confirmed' } }], operations: [], review: null
});
function Harness({ client, initial = base(), initialPage = 'inventory' }: { client: StationApi; initial?: StationSnapshot; initialPage?: StationPage }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [page, setPage] = useState(initialPage);
  return <StationSettings client={client} snapshot={snapshot} onChange={setSnapshot} page={page} onPageChange={setPage} now={new Date('2026-10-30T12:00:00.000Z')} />;
}
function clientFixture() {
  const snapshot = base();
  const review = { proposalId: 'proposal-1', stage: 1 as const, challenge: 'first', before: 5, after: 3, name: 'Synthetic bottle', unit: 'items' };
  const client = { getSnapshot: vi.fn(async () => snapshot), review: vi.fn(async () => ({ ...snapshot, review })), confirm: vi.fn(async (_id: string, challenge: string) => challenge === 'first' ? { ...snapshot, review: { ...review, stage: 2 as const, challenge: 'second' } } : { ...snapshot, proposals: [{ ...snapshot.proposals[0]!, status: 'queued' }], review: null }), cancel: vi.fn(async () => snapshot), retry: vi.fn(async () => snapshot), configure: vi.fn(async () => snapshot), signIn: vi.fn(async () => snapshot) };
  return { client: client as unknown as StationApi, spies: client };
}
afterEach(cleanup);
describe('Station management and review', () => {
  it('requires reviewing and both explicit confirmations while showing before/after quantities', async () => {
    const { client, spies } = clientFixture(); render(<Harness client={client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
    expect(await screen.findByRole('heading', { name: 'Review inventory change' })).toHaveFocus();
    expect(screen.getByText('Synthetic bottle: 5 → 3 items')).toBeVisible();
    expect(spies.confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Review complete — continue' }));
    expect(screen.getByRole('heading', { name: /confirmation 1 of 2/ })).toHaveFocus();
    expect(spies.confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes — continue to final confirmation' }));
    expect(await screen.findByRole('heading', { name: /confirmation 2 of 2/ })).toHaveFocus();
    expect(spies.confirm).toHaveBeenCalledExactlyOnceWith('proposal-1', 'first');
    fireEvent.click(screen.getByRole('button', { name: 'Yes — queue this reviewed change' }));
    await waitFor(() => expect(spies.confirm).toHaveBeenCalledTimes(2));
    expect(spies.confirm).toHaveBeenLastCalledWith('proposal-1', 'second');
    expect(spies.retry).not.toHaveBeenCalled();
    expect(screen.getByRole('cell', { name: '5' })).toBeVisible();
  });
  it('cancels the second confirmation without calling the final confirmation or sending', async () => {
    const { client, spies } = clientFixture(); render(<Harness client={client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Review complete — continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes — continue to final confirmation' }));
    await screen.findByRole('heading', { name: /confirmation 2 of 2/ });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel without sending' }));
    await waitFor(() => expect(spies.cancel).toHaveBeenCalledWith('proposal-1'));
    expect(spies.confirm).toHaveBeenCalledTimes(1); expect(spies.retry).not.toHaveBeenCalled();
  });
  it('keeps offline inventory and its absolute last-update time visible after online permission expiry', () => {
    const { client } = clientFixture(); const initial = base(); initial.state = 'offline'; initial.session!.expiresAt = '2026-10-30T11:30:00.000Z';
    render(<Harness client={client} initial={initial} />);
    expect(screen.getByText(/Last updated:/)).toBeVisible();
    expect(screen.getByText(/60 minutes ago.*cached inventory/)).toBeVisible();
    expect(screen.getByRole('cell', { name: '5' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Refresh my inventory' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Review change' })).toBeDisabled();
  });
  it('optional sign-in shows the real API blocker, and grants never create an administration screen', () => {
    const { client, spies } = clientFixture(); const initial = base(); initial.adapterAvailable = false; initial.adapterMessage = 'Awaiting reviewed developer portal.'; initial.session = null;
    render(<Harness client={client} initial={initial} initialPage="signIn" />);
    expect(screen.getByText(/Sign-in is optional/)).toBeVisible();
    expect(screen.getByText(/Awaiting reviewed developer portal/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign in with Discord via Station' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /manage users|edit roles/i })).not.toBeInTheDocument();
    expect(spies.signIn).not.toHaveBeenCalled(); expect(spies.configure).not.toHaveBeenCalled();
  });
});
