/** Home's locked relative-date presentation; absolute timestamp parsing is owned by P12. */
import {
  documentTimestampParts,
  parseDocumentTimestamp,
  type DocumentTimestamp,
} from '../../services/wms/documentTimestamps';

export function homeDocumentTime(
  timestamp: DocumentTimestamp,
  now = Date.now(),
): string {
  const at = documentTimestampParts(timestamp);
  if (!at) return 'Chưa ghi nhận';
  // Wall time is only for Hôm nay/Hôm qua; it never substitutes document time.
  const today = documentTimestampParts(
    parseDocumentTimestamp(new Date(now).toISOString()),
  )!;
  const day = (p: Record<string, string>) =>
    Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
  const delta = (day(today) - day(at)) / 86400000;
  const label =
    delta === 0
      ? 'Hôm nay'
      : delta === 1
      ? 'Hôm qua'
      : `${at.day}/${at.month}${at.year === today.year ? '' : '/' + at.year}`;
  return `${label} · ${at.hour}:${at.minute}`;
}
