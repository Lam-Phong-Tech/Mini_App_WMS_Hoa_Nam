import {
  DOCUMENT_DISPLAY_TIMEZONE,
  documentTimestampParts,
  parseDocumentTimestamp,
} from '../services/wms/documentTimestamps';

export const VIETNAM_TIMEZONE = DOCUMENT_DISPLAY_TIMEZONE;

/** Explicit instants only. SQL separator/offset notation is not a timezone guess.
 * This is a display adapter; never write its normalized value back to a request,
 * receipt, checkpoint or API object. P12's RFC3339 contract parser stays strict.
 */
export function parseVietnamTimestamp(raw) {
  if (typeof raw !== 'string') return parseDocumentTimestamp(raw);
  const match =
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(\.\d{1,6})?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(
      raw,
    );
  if (!match) return parseDocumentTimestamp(raw);
  const offset =
    match[4] === 'Z'
      ? 'Z'
      : match[4].length === 3
      ? `${match[4]}:00`
      : match[4].length === 5
      ? `${match[4].slice(0, 3)}:${match[4].slice(3)}`
      : match[4];
  const parsed = parseDocumentTimestamp(
    `${match[1]}T${match[2]}${match[3] ?? ''}${offset}`,
  );
  return Object.freeze({ ...parsed, raw });
}

/** Numbers are already-known epoch milliseconds (clock/local scan/session). */
export function vietnamTimeParts(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isFinite(new Date(value).getTime()))
      return null;
    return documentTimestampParts({ status: 'RECORDED', epochMs: value });
  }
  return documentTimestampParts(parseVietnamTimestamp(value));
}

export function formatVietnamDateTime(
  value,
  { seconds = false, missing = '—' } = {},
) {
  const p = vietnamTimeParts(value);
  return p
    ? `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}${
        seconds ? ':' + p.second : ''
      }`
    : missing;
}
export function formatVietnamDate(value, missing = '—') {
  const p = vietnamTimeParts(value);
  return p ? `${p.day}/${p.month}/${p.year}` : missing;
}
/** Date-only business fields are calendar values, never timezone-shifted. */
export function formatVietnamDateValue(value, missing = '—') {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const valid = parseDocumentTimestamp(`${value}T00:00:00Z`);
    return valid.status === 'RECORDED'
      ? value.split('-').reverse().join('/')
      : missing;
  }
  return formatVietnamDateTime(value, { missing });
}
export function formatVietnamClock(
  value,
  { seconds = false, missing = '—' } = {},
) {
  const p = vietnamTimeParts(value);
  return p ? `${p.hour}:${p.minute}${seconds ? ':' + p.second : ''}` : missing;
}
/** Only for a new default/calendar grouping, not existing date-only values. */
export function vietnamDateKey(value) {
  const p = vietnamTimeParts(value);
  return p ? `${p.year}-${p.month}-${p.day}` : null;
}
