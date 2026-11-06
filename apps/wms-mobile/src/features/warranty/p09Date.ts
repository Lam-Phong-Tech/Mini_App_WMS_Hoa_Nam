import { formatVietnamDateTime } from '../../time/vietnamTime';

/** Preserve the source instant; never assign a zone to a naive timestamp. */
export function p09Date(value?: string | null): string {
  return formatVietnamDateTime(value, { missing: 'Chưa có dữ liệu' });
}
