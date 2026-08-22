import type { StreamEvent } from './runtime-monitor-model';
import { formatInstantContext } from './time';
import { safeDisplayText } from './terminal-event-format';

export interface TableEventRow {
  kind: string;
  severity: string;
  summary: string;
  attributes: string;
  shard: string;
  age: string;
  ageLabel: string;
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
  warning: 'Notice',
  urgent: 'Urgent',
  critical: 'Critical'
};

export function formatTableEvent(event: StreamEvent): TableEventRow {
  const kind = KIND_LABELS[event.kind] || 'Unknown event';
  const severity = URGENCY_LABELS[event.urgency] || 'Unclassified';
  const summary = safeDisplayText(event.summary, 'Event summary unavailable');
  const confidence = event.confidence ? safeDisplayText(event.confidence) : 'unknown';
  const provenance = safeDisplayText(event.row.provenance, 'Observed');
  const attributes = `${provenance} · Confidence ${confidence}`;
  const shard = safeDisplayText(
    event.row.shardName ?? event.row.shardId ?? event.row.region,
    event.context ? safeDisplayText(event.context, 'Unknown shard') : 'Unknown shard'
  );
  const age = safeDisplayText(event.ageLabel, 'Unknown age');
  const ageLabel = event.timestamp
    ? `${age}; event time ${formatInstantContext(event.timestamp)}`
    : `${age}; event time unknown`;

  return {
    kind,
    severity,
    summary,
    attributes,
    shard,
    age,
    ageLabel,
    accessibleLabel: `${kind}; ${severity}; ${summary}; ${attributes}; Shard ${shard}; ${ageLabel}`
  };
}
