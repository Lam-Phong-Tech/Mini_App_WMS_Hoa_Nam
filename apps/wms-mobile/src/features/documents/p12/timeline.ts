import {
  parseDocumentTimestamp,
  formatDocumentTimestamp,
} from '../../../services/wms/documentTimestamps';

/** Legacy event timestamp seam; preserve the source, never infer from status. */
export function timelineTime(value: unknown): string {
  if (typeof value !== 'string') return 'Chưa có thời điểm ghi nhận';
  const m =
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(
      value,
    );
  if (!m) return 'Chưa có thời điểm ghi nhận';
  const zone =
    m[4] === 'Z'
      ? 'Z'
      : m[4].length === 3
      ? m[4] + ':00'
      : m[4].length === 5
      ? m[4].slice(0, 3) + ':' + m[4].slice(3)
      : m[4];
  return formatDocumentTimestamp(
    parseDocumentTimestamp(m[1] + 'T' + m[2] + (m[3] ? '.' + m[3] : '') + zone),
    { timeFirst: false },
  );
}

// Explicit owner action keys, NOT guessed from title, readiness or current state.
const actions: Record<string, string> = {
  scan_start: 'Bắt đầu quét sản phẩm',
  scan_started: 'Bắt đầu quét sản phẩm',
  post_receipt: 'Ghi sổ phiếu nhập',
  post_issue: 'Ghi sổ phiếu xuất',
  submit: 'Gửi phiếu',
  approve: 'Duyệt phiếu',
  cancel: 'Hủy phiếu',
  note: 'Ghi chú hồ sơ',
};
const warrantyActions: Record<string,string> = {
  receive: 'Tiếp nhận bảo hành',
  check: 'Kiểm tra bảo hành',
  repair: 'Sửa chữa bảo hành',
  complete: 'Hoàn tất sửa chữa',
  return: 'Bàn giao trả khách',
};
export function timelineEventTitle(key: unknown, source?: string): string {
  if (source === 'warranty' && typeof key === 'string' && Object.hasOwn(warrantyActions,key.toLowerCase()))
    return warrantyActions[key.toLowerCase()];
  return typeof key === 'string' && Object.hasOwn(actions, key.toLowerCase())
    ? actions[key.toLowerCase()]
    : 'Hoạt động khác (chưa có nhãn)';
}
