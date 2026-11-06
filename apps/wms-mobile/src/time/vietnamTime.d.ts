import type { DocumentTimestamp } from '../services/wms/documentTimestamps';
export const VIETNAM_TIMEZONE: 'Asia/Ho_Chi_Minh';
export function parseVietnamTimestamp(raw: unknown): DocumentTimestamp;
export function vietnamTimeParts(value: unknown): Record<string, string> | null;
export function formatVietnamDateTime(
  value: unknown,
  options?: { seconds?: boolean; missing?: string },
): string;
export function formatVietnamDate(value: unknown, missing?: string): string;
export function formatVietnamDateValue(
  value: unknown,
  missing?: string,
): string;
export function formatVietnamClock(
  value: unknown,
  options?: { seconds?: boolean; missing?: string },
): string;
export function vietnamDateKey(value: unknown): string | null;
