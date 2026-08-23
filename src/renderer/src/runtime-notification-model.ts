export type NotificationSeverity = 'warning' | 'critical';
export type NotificationLifetime = 'persistent' | 'transient';

export interface AlertState {
  id: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  lifetime: NotificationLifetime;
  evidenceEventId?: string | null;
  occurredAt?: string | null;
  reason?: string;
  state?: 'active' | 'cleared' | 'acknowledged';
}

export const MAX_VISIBLE_NOTIFICATIONS = 4;
export const MIN_TRANSIENT_DURATION_MS = 5_000;
export const MAX_TRANSIENT_DURATION_MS = 12_000;
export const NOTIFICATION_EXIT_DURATION_MS = 180;

export interface NotificationEntry extends AlertState {
  createdAt: number;
  expiresAt: number | null;
  exitingUntil: number | null;
  paused: boolean;
}

export interface NotificationStackState {
  entries: NotificationEntry[];
  overflowCount: number;
  dismissed: Record<string, string>;
}

export interface AlertLifecycleState {
  active: Record<string, AlertState>;
  history: AlertState[];
}

export function createAlertLifecycleState(): AlertLifecycleState {
  return { active: {}, history: [] };
}

/** Reconciles semantic conditions, so repeated physical lines do not repeat alerts. */
export function reconcileAlertLifecycle(previous: AlertLifecycleState, incoming: readonly AlertState[]): AlertLifecycleState {
  const nextActive: Record<string, AlertState> = {};
  const incomingIds = new Set(incoming.map((alert) => alert.id));
  const history = [...previous.history];
  for (const [id, prior] of Object.entries(previous.active)) {
    if (!incomingIds.has(id)) history.push({ ...prior, state: 'cleared' });
  }
  for (const alert of incoming) nextActive[alert.id] = { ...alert, state: 'active' };
  return { active: nextActive, history: history.slice(-200) };
}

export function createNotificationStackState(): NotificationStackState {
  return { entries: [], overflowCount: 0, dismissed: {} };
}

export function reconcileNotificationStack(
  previous: NotificationStackState,
  alerts: readonly AlertState[],
  now: number
): NotificationStackState {
  const incoming = new Map(alerts.map((alert) => [alert.id, alert]));
  const previousById = new Map(previous.entries.map((entry) => [entry.id, entry]));
  const dismissed = { ...previous.dismissed };
  for (const id of Object.keys(dismissed)) {
    if (!incoming.has(id)) delete dismissed[id];
  }
  const next: NotificationEntry[] = [];

  for (const entry of previous.entries) {
    const alert = incoming.get(entry.id);
    if (alert) {
      next.push({
        ...entry,
        ...alert,
        exitingUntil: null,
        expiresAt: entry.expiresAt ?? getExpiry(alert, entry.createdAt)
      });
    } else if (entry.exitingUntil !== null || entry.expiresAt === null || entry.paused || entry.expiresAt > now) {
      next.push({ ...entry, exitingUntil: entry.exitingUntil ?? now + NOTIFICATION_EXIT_DURATION_MS });
    }
  }

  for (const alert of alerts) {
    if (previousById.has(alert.id)) continue;
    if (dismissed[alert.id] === notificationFingerprint(alert)) continue;
    next.push({
      ...alert,
      createdAt: now,
      expiresAt: getExpiry(alert, now),
      exitingUntil: null,
      paused: false
    });
  }

  const active = next
    .filter((entry) => entry.exitingUntil === null || entry.exitingUntil > now)
    .filter((entry) => entry.paused || entry.expiresAt === null || entry.expiresAt > now)
    .sort(compareNotificationEntries);
  const visible = active.slice(0, MAX_VISIBLE_NOTIFICATIONS);
  const activeIds = new Set(active.map((entry) => entry.id));

  for (const alert of alerts) {
    if (!activeIds.has(alert.id) && alert.lifetime === 'transient') {
      dismissed[alert.id] = notificationFingerprint(alert);
    }
  }

  return {
    entries: visible,
    overflowCount: Math.max(0, active.length - visible.length),
    dismissed
  };
}

function notificationFingerprint(alert: AlertState): string {
  return [alert.severity, alert.lifetime, alert.title, alert.message].join('|');
}

export function setNotificationPaused(
  state: NotificationStackState,
  id: string,
  paused: boolean,
  now: number
): NotificationStackState {
  return {
    ...state,
    entries: state.entries.map((entry) => {
      if (entry.id !== id) return entry;
      if (paused) return { ...entry, paused: true };
      const duration = entry.expiresAt === null ? null : Math.max(0, entry.expiresAt - entry.createdAt);
      return {
        ...entry,
        paused: false,
        createdAt: now,
        expiresAt: duration === null ? null : now + duration
      };
    })
  };
}

export function getTransientDuration(message: string): number {
  const estimatedReadingTime = 2_500 + Math.ceil(message.trim().length / 45) * 1_000;
  return Math.min(MAX_TRANSIENT_DURATION_MS, Math.max(MIN_TRANSIENT_DURATION_MS, estimatedReadingTime));
}

function getExpiry(alert: AlertState, createdAt: number): number | null {
  return alert.lifetime === 'transient' ? createdAt + getTransientDuration(alert.message) : null;
}

function compareNotificationEntries(left: NotificationEntry, right: NotificationEntry): number {
  const severityOrder = { critical: 0, warning: 1 } as const;
  return severityOrder[left.severity] - severityOrder[right.severity]
    || left.createdAt - right.createdAt
    || left.id.localeCompare(right.id);
}
