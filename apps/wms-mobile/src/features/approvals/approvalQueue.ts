/**
 * Hợp đồng đọc hàng đợi duyệt dùng chung cho Trang chủ và màn Duyệt phiếu.
 *
 * Đây là nơi duy nhất quyết định một chứng từ có thuộc hàng đợi duyệt hay
 * không. Trang chủ chỉ hiển thị tổng của hai truy vấn này; không được suy ra
 * từ một snapshot lịch sử hay từ các trạng thái đang quét dở.
 */

import {
  INBOUND_PENDING_QUERY,
  OUTBOUND_READY_QUERY,
} from '../../services/wms/documentStatus';

export type ApprovalQueueKind = 'inbound' | 'outbound';

/**
 * 50 đủ để hiện trọn hầu hết hàng đợi ca làm việc, vẫn giữ nút tải thêm cho
 * các ca có nhiều chứng từ. Cả Trang chủ lẫn màn Duyệt đều dùng cùng cỡ trang.
 */
export const APPROVAL_QUEUE_PAGE_SIZE = 50;

export function approvalQueueQuery(
  kind: ApprovalQueueKind,
  page: number = 1,
): Readonly<Record<string, string | number | boolean>> {
  return {
    ...(kind === 'inbound' ? INBOUND_PENDING_QUERY : OUTBOUND_READY_QUERY),
    page,
    per_page: APPROVAL_QUEUE_PAGE_SIZE,
  };
}

/**
 * Số badge luôn là số dòng WMS thực sự trả về cho bộ lọc hàng đợi.
 *
 * Không dùng `meta.total`: backend hiện có thể trả tổng của tập rộng hơn tập
 * dữ liệu đã lọc. Dùng nó làm thẻ "Chờ duyệt" tạo số không có dòng tương ứng
 * ở màn Duyệt — chính là lỗi cần tránh. Khi hàng đợi vượt 50, người dùng bấm
 * "Tải thêm phiếu"; badge tăng theo các dòng đã tải, không nói quá dữ liệu.
 */
export function approvalQueueTotal(loadedCount: number): number {
  return Math.max(0, loadedCount);
}
