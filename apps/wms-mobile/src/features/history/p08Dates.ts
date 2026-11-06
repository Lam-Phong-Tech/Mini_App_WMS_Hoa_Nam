import { serverNow } from '../../auth/serverClock';
import type { P08Date } from '../../services/wms/p08Types';
import { historyInstant } from './historyPresentation';

// Reuse the formatter, never the date value: typed drafts should not rebuild ICU
// formatters on each render, while Today still reads the owner's clock at click.
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

export function p08ValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const at = Date.parse(value + 'T00:00:00Z');
  return (
    Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === value
  );
}
export function p08DateLabel(value: string): string {
  return p08ValidDate(value)
    ? value.split('-').reverse().join('/')
    : 'Chọn ngày';
}
export function p08MoveDay(value: string, days: number): string {
  if (!p08ValidDate(value)) throw new Error('Invalid calendar date');
  const day = new Date(value + 'T00:00:00Z');
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}
export function p08PickerBounds(
  today: string,
  field: 'date' | 'from' | 'to',
  from = '',
  to = '',
) {
  const min = p08MoveDay(today, -89);
  return {
    min: field === 'to' && p08ValidDate(from) && from > min ? from : min,
    max: field === 'from' && p08ValidDate(to) && to < today ? to : today,
  };
}
export function p08CalendarDays(month: string): (string | null)[] {
  const first = month + '-01';
  if (!p08ValidDate(first)) throw new Error('Invalid month');
  const at = new Date(first + 'T00:00:00Z');
  const blanks = (at.getUTCDay() + 6) % 7;
  const last = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const cells: (string | null)[] = Array(blanks).fill(null);
  for (let day = 1; day <= last; day++)
    cells.push(`${month}-${String(day).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** Display is always Vietnam time; response timezone still owns API date filters. */
export function p08TimeLabel(value: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}[T ]/.test(value)) return value;
  return historyInstant(value, timezone);
}

/** UI shortcut only. Calendar timezone comes from this P08 response. */
export function p08QuickDate(
  days: 1 | 7 | 30 | 90,
  timezone: string,
  nowMs = serverNow(),
): P08Date {
  let formatter = dateFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dateFormatters.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(new Date(nowMs));
  const value = (type: string) => parts.find(p => p.type === type)!.value;
  const to = `${value('year')}-${value('month')}-${value('day')}`;
  if (days === 1) return { date_mode: 'DATE', date: to };
  const start = new Date(to + 'T00:00:00Z');
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { date_mode: 'RANGE', from: start.toISOString().slice(0, 10), to };
}
