import { describe, expect, it } from 'vitest';
import {
  createNotificationStackState,
  getTransientDuration,
  MAX_VISIBLE_NOTIFICATIONS,
  NOTIFICATION_EXIT_DURATION_MS,
  reconcileNotificationStack,
  setNotificationPaused,
  createAlertLifecycleState,
  reconcileAlertLifecycle
} from '../src/renderer/src/runtime-notification-model';

const alert = (id: string, severity: 'warning' | 'critical' = 'warning', lifetime: 'persistent' | 'transient' = 'persistent') => ({
  id, severity, lifetime, title: id, message: `${id} message`
});

describe('runtime notification presentation lifecycle', () => {
  it('keeps stable identities, prioritizes critical alerts, and bounds the visible stack', () => {
    const alerts = [alert('w1'), alert('c1', 'critical'), alert('w2'), alert('w3'), alert('w4')];
    const state = reconcileNotificationStack(createNotificationStackState(), alerts, 100);
    expect(state.entries.map((entry) => entry.id)).toEqual(['c1', 'w1', 'w2', 'w3']);
    expect(state.overflowCount).toBe(1);

    const updated = reconcileNotificationStack(state, [alert('w1', 'warning', 'persistent')], 200);
    expect(updated.entries.find((entry) => entry.id === 'w1')).toEqual(expect.objectContaining({ id: 'w1', createdAt: 100, exitingUntil: null }));
    expect(updated.entries.filter((entry) => entry.id !== 'w1')).toHaveLength(3);
  });

  it('retains a removed condition briefly for a downward exit without retaining it after the animation', () => {
    const state = reconcileNotificationStack(createNotificationStackState(), [alert('warning')], 100);
    const exiting = reconcileNotificationStack(state, [], 200);
    expect(exiting.entries[0]).toEqual(expect.objectContaining({ id: 'warning', exitingUntil: 200 + NOTIFICATION_EXIT_DURATION_MS }));
    expect(reconcileNotificationStack(exiting, [], 200 + NOTIFICATION_EXIT_DURATION_MS)).toEqual({ entries: [], overflowCount: 0, dismissed: {} });
  });

  it('pauses transient expiry while focused and resumes with a fresh readable duration', () => {
    const state = reconcileNotificationStack(createNotificationStackState(), [alert('action', 'warning', 'transient')], 100);
    const paused = setNotificationPaused(state, 'action', true, 2_000);
    expect(reconcileNotificationStack(paused, [], 100_000).entries).toHaveLength(1);
    const resumed = setNotificationPaused(paused, 'action', false, 3_000);
    expect(resumed.entries[0].expiresAt).toBe(3_000 + getTransientDuration('action message'));
  });

  it('does not resurrect an expired transient while its source alert remains present', () => {
    const initial = reconcileNotificationStack(createNotificationStackState(), [alert('action', 'warning', 'transient')], 100);
    const expired = reconcileNotificationStack(initial, [alert('action', 'warning', 'transient')], 20_000);
    expect(expired.entries).toHaveLength(0);
    expect(reconcileNotificationStack(expired, [alert('action', 'warning', 'transient')], 21_000).entries).toHaveLength(0);
  });

  it('uses a readable minimum and bounded duration for transient copy', () => {
    expect(getTransientDuration('short')).toBeGreaterThanOrEqual(5_000);
    expect(getTransientDuration('x'.repeat(10_000))).toBeLessThanOrEqual(12_000);
    expect(MAX_VISIBLE_NOTIFICATIONS).toBe(4);
  });

  it('creates one active alert per semantic transition and records clears', () => {
    const initial = reconcileAlertLifecycle(createAlertLifecycleState(), [alert('disconnect')]);
    const repeated = reconcileAlertLifecycle(initial, [alert('disconnect')]);
    expect(Object.keys(repeated.active)).toEqual(['disconnect']);
    const cleared = reconcileAlertLifecycle(repeated, []);
    expect(cleared.active).toEqual({});
    expect(cleared.history).toEqual([expect.objectContaining({ id: 'disconnect', state: 'cleared' })]);
  });
});
