import { useEffect, useState, type FocusEvent, type MouseEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import { instantMilliseconds } from './time';
import type { AlertState } from './runtime-notification-model';
import {
  createNotificationStackState,
  reconcileNotificationStack,
  setNotificationPaused,
  type NotificationEntry,
  type NotificationStackState
} from './runtime-notification-model';

interface RuntimeNotificationStackProps {
  alerts: readonly AlertState[];
  clock?: () => number;
  onEvidence?: (eventId: string) => void;
}

const systemClock = () => Date.now();

export function RuntimeNotificationStack({ alerts, clock = systemClock, onEvidence }: RuntimeNotificationStackProps) {
  const [state, setState] = useState<NotificationStackState>(() => createNotificationStackState());
  const [now, setNow] = useState(() => clock());

  useEffect(() => {
    const timestamp = clock();
    setNow(timestamp);
    setState((current) => reconcileNotificationStack(current, alerts, timestamp));
  }, [alerts, clock]);

  useEffect(() => {
    if (!state.entries.some((entry) => entry.expiresAt !== null || entry.exitingUntil !== null)) return undefined;
    const timer = window.setInterval(() => {
      const timestamp = clock();
      setNow(timestamp);
      setState((current) => reconcileNotificationStack(current, alerts, timestamp));
    }, 250);
    return () => window.clearInterval(timer);
  }, [alerts, clock, state.entries]);

  if (!state.entries.length) return null;

  return (
    <section className="attention-region" aria-label="Attention and warnings">
      <div className="notification-stack" aria-label={`${state.entries.length} active notification${state.entries.length === 1 ? '' : 's'}`}>
        {state.entries.map((entry) => (
          <NotificationCard
            entry={entry}
            now={now}
            key={entry.id}
            {...(onEvidence ? { onEvidence } : {})}
            onPause={(paused) => setState((current) => setNotificationPaused(current, entry.id, paused, clock()))}
          />
        ))}
        {state.overflowCount > 0 ? (
          <div className="notification-overflow" role="status">
            +{state.overflowCount} more notifications. Resolve higher-priority conditions to view them.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function NotificationCard({
  entry,
  now,
  onPause,
  onEvidence
}: {
  entry: NotificationEntry;
  now: number;
  onPause: (paused: boolean) => void;
  onEvidence?: (eventId: string) => void;
}) {
  const handlePointerEnter = (_event: MouseEvent<HTMLElement>) => onPause(true);
  const handlePointerLeave = (_event: MouseEvent<HTMLElement>) => onPause(false);
  const handleFocus = (_event: FocusEvent<HTMLElement>) => onPause(true);
  const handleBlur = (_event: FocusEvent<HTMLElement>) => onPause(false);
  const isExiting = entry.exitingUntil !== null;
  const remaining = entry.expiresAt === null || entry.paused ? null : Math.max(0, entry.expiresAt - now);

  return (
    <article
      className="alert notification-stack__item"
      data-exiting={isExiting}
      data-severity={entry.severity}
      data-paused={entry.paused}
      tabIndex={0}
      role={entry.severity === 'critical' ? 'alert' : 'status'}
      aria-label={`${entry.title}: ${entry.message}`}
      onMouseEnter={handlePointerEnter}
      onMouseLeave={handlePointerLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <AlertTriangle aria-hidden="true" />
      <div>
        <strong>{entry.title}</strong>
        <p>{entry.message}{entry.occurredAt ? ` · Observed ${formatNotificationAge(entry.occurredAt, now)}` : ''}</p>
      </div>
      {remaining !== null ? <span className="sr-only">Dismisses in {Math.ceil(remaining / 1_000)} seconds.</span> : null}
      {entry.evidenceEventId && onEvidence ? <button type="button" className="button secondary" onClick={() => onEvidence(entry.evidenceEventId || '')}>View evidence</button> : null}
    </article>
  );
}

function formatNotificationAge(timestamp: string, now: number): string {
  const observed = instantMilliseconds(timestamp);
  if (observed === null) return 'age unknown';
  const seconds = Math.max(0, Math.floor((now - observed) / 1_000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}
