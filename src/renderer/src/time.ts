const ISO_INSTANT_PATTERN = /^(?<date>\d{4}-\d{2}-\d{2})T(?<time>\d{2}:\d{2}:\d{2})(?:\.\d{1,9})?(?<offset>Z|[+-]\d{2}:\d{2})$/;
const clockFormatters = new Map<string, Intl.DateTimeFormat>();
const contextFormatters = new Map<string, Intl.DateTimeFormat>();

export function instantMilliseconds(value: string | Date | null | undefined): number | null {
  if (value instanceof Date) return Number.isNaN(value.valueOf()) ? null : value.valueOf();
  if (typeof value !== 'string') return null;
  const match = value.match(ISO_INSTANT_PATTERN);
  if (!match?.groups || !hasValidCalendarFields(match.groups)) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function hasValidCalendarFields(groups: Record<string, string>): boolean {
  const dateParts = groups.date?.split('-').map(Number);
  const timeParts = groups.time?.split(':').map(Number);
  const offset = groups.offset;
  if (!dateParts || dateParts.length !== 3 || !timeParts || timeParts.length !== 3 || !offset) return false;
  const year = dateParts[0] as number;
  const month = dateParts[1] as number;
  const day = dateParts[2] as number;
  const hour = timeParts[0] as number;
  const minute = timeParts[1] as number;
  const second = timeParts[2] as number;
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  if (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return false;
  if (offset !== 'Z') {
    const offsetParts = offset.slice(1).split(':').map(Number);
    if (offsetParts.length !== 2) return false;
    const offsetHour = offsetParts[0] as number;
    const offsetMinute = offsetParts[1] as number;
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }
  return true;
}

export function compareInstants(left: string | null | undefined, right: string | null | undefined): number {
  return (instantMilliseconds(left) ?? 0) - (instantMilliseconds(right) ?? 0);
}

export function formatLocalClock(value: string | null | undefined, timeZone?: string): string {
  const milliseconds = instantMilliseconds(value);
  if (milliseconds === null) return 'UNKNOWN';
  return clockFormatter(timeZone).format(milliseconds);
}

export function formatInstantContext(value: string | null | undefined, timeZone?: string): string {
  const milliseconds = instantMilliseconds(value);
  if (milliseconds === null) return 'Unknown event time';
  return `${contextFormatter(timeZone).format(milliseconds)} · UTC ${new Date(milliseconds).toISOString()}`;
}

function clockFormatter(timeZone?: string): Intl.DateTimeFormat {
  const key = timeZone || 'system';
  let formatter = clockFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      ...(timeZone ? { timeZone } : {})
    });
    clockFormatters.set(key, formatter);
  }
  return formatter;
}

function contextFormatter(timeZone?: string): Intl.DateTimeFormat {
  const key = timeZone || 'system';
  let formatter = contextFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23', timeZoneName: 'shortOffset',
      ...(timeZone ? { timeZone } : {})
    });
    contextFormatters.set(key, formatter);
  }
  return formatter;
}
