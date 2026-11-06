import {
  formatVietnamClock,
  formatVietnamDateTime,
} from '../../time/vietnamTime';

/**
 * Formats server timestamps for the P04 screens only.
 *
 * The API value remains unchanged; this is a display adapter for the locked
 * B04 pattern: `dd/mm/yyyy HH:mm` in Vietnam time.
 */
export function formatP04DateTime(
  value: string | undefined,
): string | undefined {
  if (value === undefined || value.trim() === '') return undefined;

  return formatVietnamDateTime(value, { missing: 'Chưa xác minh thời điểm' });
}

export const formatP04ScanTime = (instant: number): string =>
  formatVietnamClock(instant, { seconds: true });
