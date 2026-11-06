/** document-timestamps-v1. Only explicitly contracted document attributes. */
export const DOCUMENT_TIMESTAMP_CONTRACT = 'document-timestamps-v1';
export const DOCUMENT_DISPLAY_TIMEZONE = 'Asia/Ho_Chi_Minh';
const absolute = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;
export function parseDocumentTimestamp(raw) {
  if (raw === undefined) return Object.freeze({ status: 'MISSING', raw });
  if (raw === null) return Object.freeze({ status: 'NOT_RECORDED', raw });
  const invalid = () => Object.freeze({ status: 'INVALID', raw });
  if (typeof raw !== 'string') return invalid();
  const m = absolute.exec(raw);
  if (!m) return invalid();
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] ||
      Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6]) > 59 ||
      (m[8] !== 'Z' && (Number(m[8].slice(1, 3)) > 23 || Number(m[8].slice(4)) > 59))) return invalid();
  // Parse the original RFC3339 string exactly once. Date's millisecond precision
  // is used only for display; raw/fraction are retained for source comparison.
  const epochMs = Date.parse(raw);
  if (!Number.isFinite(epochMs)) return invalid();
  return Object.freeze({ status: 'RECORDED', raw, epochMs,
    epochSecond: Math.floor(epochMs / 1000),
    microsecond: Number((m[7] ?? '').padEnd(6, '0')),
    fractionalDigits: m[7]?.length ?? 0 });
}
export function compareDocumentTimestamps(a, b) {
  if (a.status !== 'RECORDED' || b.status !== 'RECORDED') throw new Error('DOCUMENT_TIMESTAMP_NOT_RECORDED');
  return Math.sign(a.epochSecond - b.epochSecond) || Math.sign(a.microsecond - b.microsecond);
}
export function documentTimestampParts(parsed) {
  if (parsed.status !== 'RECORDED') return null;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: DOCUMENT_DISPLAY_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(parsed.epochMs);
  return Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
}
export function formatDocumentTimestamp(parsed, { seconds = false, timeFirst = false, missing = 'Chưa có thời điểm ghi nhận' } = {}) {
  const p = documentTimestampParts(parsed);
  if (!p) return missing;
  const date = `${p.day}/${p.month}/${p.year}`, time = `${p.hour}:${p.minute}${seconds ? ':' + p.second : ''}`;
  return timeFirst ? `${time}, ${date}` : `${date} ${time}`;
}
export function isDocumentTimestampMetadata(meta) {
  const t = meta?.timestamps;
  return meta?.timestamp_contract === DOCUMENT_TIMESTAMP_CONTRACT &&
    t?.contract === DOCUMENT_TIMESTAMP_CONTRACT && t.format === 'RFC3339_UTC' &&
    ['Asia/Ho_Chi_Minh', 'UTC'].includes(t.legacy_naive_timezone) &&
    t.offset_policy === 'PRESERVE_INSTANT' && t.fractional_digits === 6 &&
    t.precision_policy === 'PRESERVE_AVAILABLE_ZERO_PAD_NOT_EXTRA_ACCURACY' && t.null_policy === 'PRESERVE_NULL';
}
