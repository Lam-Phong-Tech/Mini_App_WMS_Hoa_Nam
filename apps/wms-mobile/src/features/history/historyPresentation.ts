/** Read-only labels and explicit instants. Never infer an outcome or storage zone. */
import {
  formatVietnamDateTime,
  parseVietnamTimestamp,
} from '../../time/vietnamTime';

export const UNKNOWN_TIMEZONE = 'Múi giờ chưa xác minh';
export function historyInstant(
  value: string | null | undefined,
  _timezone = 'Asia/Ho_Chi_Minh',
): string {
  if (!value) return '—';
  const calendar = /^(\d{4}-\d{2}-\d{2})[T ]/.exec(value)?.[1];
  if (
    !calendar ||
    !Number.isFinite(Date.parse(calendar + 'T00:00:00Z')) ||
    new Date(calendar + 'T00:00:00Z').toISOString().slice(0, 10) !== calendar
  )
    return `${value} · Thời gian chưa hợp lệ`;
  if (!/(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value))
    return `${value} · ${UNKNOWN_TIMEZONE}`;
  const parsed = parseVietnamTimestamp(value);
  if (parsed.status !== 'RECORDED') return `${value} · Thời gian chưa hợp lệ`;
  // Response timezone is a server-filter contract, never a display override.
  return formatVietnamDateTime(parsed.epochMs, { seconds: true });
}
export function historyDay(value: string | null | undefined): string {
  const rendered = historyInstant(value);
  return /^\d{2}\/\d{2}\/\d{4}/.test(rendered)
    ? rendered.slice(0, 10)
    : 'Thời gian chưa xác minh';
}
export function historyClock(value: string | null | undefined): string {
  const rendered = historyInstant(value);
  return /^\d{2}\/\d{2}\/\d{4}/.test(rendered) ? rendered.slice(11, 16) : '—';
}
const statusLabels: Record<string, string> = {
  DRAFT: 'Bản nháp',
  SCANNING: 'Đang quét',
  POSTED: 'Đã ghi sổ',
  CANCELLED: 'Đã hủy',
  WAITING_APPROVAL: 'Chờ xử lý trên Web',
  RECEIVED: 'Đã tiếp nhận',
  CHECKING: 'Đang kiểm tra',
  REPAIRING: 'Đang sửa chữa',
  REPAIRED: 'Đã sửa chữa',
  COMPLETED: 'Hoàn tất',
  RETURNED: 'Đã trả khách',
  ACCEPTED: 'Được chấp nhận',
  VALID: 'Hợp lệ',
  DUPLICATE: 'Đọc trùng',
  REJECTED: 'Bị từ chối',
  RESOLVED: 'Đã phân giải',
  SUCCESS: 'Thành công',
  SUCCEEDED: 'Thành công',
  FAILED: 'Thất bại',
  ERROR: 'Có lỗi',
  PENDING: 'Đang chờ',
  UNKNOWN: 'Chưa xác định',
  NOT_RECORDED: 'Chưa ghi nhận kết quả',
  ACTIVE: 'Đang hoạt động',
  REVOKED: 'Đã thu hồi',
  CLOSED: 'Đã đóng',
  OTHER: 'Kết quả khác',
};
export function historyStatus(value: string | null | undefined): string {
  return value == null
    ? 'Chưa ghi nhận kết quả'
    : statusLabels[value.toUpperCase()] ??
        (/^[A-Z][A-Z0-9_]+$/.test(value) ? 'Chưa có nhãn trạng thái' : value);
}
export function historyAction(value: string | null | undefined): string {
  const labels: Record<string, string> = {
    SCAN: 'Quét mã',
    SCAN_START: 'Bắt đầu quét',
    CREATE: 'Tạo mới',
    SAVE: 'Lưu nháp',
    RECORD: 'Ghi nhận',
    POST: 'Ghi sổ',
    CANCEL: 'Hủy',
    RECEIVE: 'Tiếp nhận',
    CHECK: 'Kiểm tra',
    REPAIR: 'Sửa chữa',
    RETURN: 'Trả khách',
    ASSIGN_ITEM_NFC: 'Gán thẻ NFC',
    REPLACE_ITEM_NFC: 'Thay thẻ NFC',
    REVOKE_ITEM_NFC: 'Thu hồi thẻ NFC',
    ASSIGN: 'Gán thẻ',
    REPLACE: 'Thay thẻ',
    REVOKE: 'Thu hồi thẻ',
  };
  return value
    ? labels[value.toUpperCase()] ?? 'Hoạt động khác'
    : 'Chưa ghi nhận thao tác';
}
export function historySource(value: string | null | undefined): string {
  const labels: Record<string, string> = {
    RECEIPT_DOCUMENT: 'Nhập kho',
    ISSUE_DOCUMENT: 'Xuất kho',
    COMPONENT_ISSUE: 'Xuất linh kiện',
    WARRANTY: 'Bảo hành',
    LOOKUP: 'Tra cứu',
    SCAN: 'Phiên quét',
    DOCUMENT: 'Chứng từ',
    NFC: 'NFC',
  };
  return value ? labels[value] ?? 'Nguồn quét khác' : 'Chưa ghi nhận nghiệp vụ';
}
export function historyCount(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : '—';
}
