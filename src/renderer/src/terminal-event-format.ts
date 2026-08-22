import type { StreamEvent } from './runtime-monitor-model';
import { formatInstantContext, formatLocalClock } from './time';

/** The terminal is a presentation of normalized events, never a raw-log view. */
export interface TerminalEventLine {
  time: string;
  timeLabel: string;
  kind: string;
  urgency: string;
  summary: string;
  context: string;
  qualification: string;
  accessibleLabel: string;
}

const KIND_LABELS: Record<StreamEvent['kind'], string> = {
  shard: 'Shard',
  action: 'Action',
  session: 'Session',
  party: 'Party',
  zone: 'Zone',
  vehicle: 'Vehicle',
  navigation: 'Navigation',
  runtime: 'Runtime',
  diagnostic: 'Diagnostic'
};

const URGENCY_LABELS: Record<StreamEvent['urgency'], string> = {
  normal: 'Routine',
  warning: 'Warning',
  urgent: 'Urgent',
  critical: 'Critical'
};

const MAX_DISPLAY_TEXT = 240;

export function formatTerminalEvent(event: StreamEvent): TerminalEventLine {
  const kind = KIND_LABELS[event.kind] || 'Unknown event';
  const urgency = URGENCY_LABELS[event.urgency] || 'Unclassified';
  const summary = safeDisplayText(event.summary, 'Event summary unavailable');
  const context = safeDisplayText(event.context, 'No additional context');
  const qualification = event.confidence ? `Confidence ${safeDisplayText(event.confidence)}` : 'Confidence unknown';
  const time = formatLocalClock(event.timestamp);
  const timeLabel = formatInstantContext(event.timestamp);

  return {
    time,
    timeLabel,
    kind,
    urgency,
    summary,
    context,
    qualification,
    accessibleLabel: `${time}; ${kind}; ${urgency}; ${summary}; ${context}; ${qualification}`
  };
}

export function safeDisplayText(value: unknown, fallback = 'Unknown'): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized.length > MAX_DISPLAY_TEXT
    ? `${normalized.slice(0, MAX_DISPLAY_TEXT - 1).trimEnd()}…`
    : normalized;
}

