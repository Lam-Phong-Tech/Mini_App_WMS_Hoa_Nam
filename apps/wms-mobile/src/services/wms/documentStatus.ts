/**
 * Giá trị `status` hợp lệ cho từng endpoint — **chép từ spec, không suy đoán**.
 *
 * 🔴 Vì sao tệp này tồn tại: ngày 2026-09-06 người dùng bắt được lỗi thật khi
 * chạy app trên máy Xiaomi 12 Pro —
 *
 * ```
 * HTTP 422  GET /api/v1/mini-app/outbound-documents?per_page=25&status=WAITING_APPROVAL
 * ```
 *
 * Nguyên nhân: tôi dùng chung `WAITING_APPROVAL` cho **cả hai** tab của màn Duyệt
 * phiếu. Nhưng spec khai enum **khác nhau** cho hai endpoint:
 *
 * | Endpoint | enum |
 * |---|---|
 * | `mini-app/inbound-documents` | `WAITING_APPROVAL` · `DRAFT` · `SCANNING` · `POSTED` · `CANCELLED` |
 * | `mini-app/outbound-documents` | `DRAFT` · `SCANNING` · `POSTED` · `CANCELLED` |
 *
 * Spec ghi thêm ở endpoint nhập: *"WAITING_APPROVAL là semantic status của Mini
 * App, không phải DB stock_document status."*
 *
 * ⇒ Đó là **bí danh riêng của luồng nhập**, không tồn tại ở luồng xuất.
 *
 * Bài học đã ghi vào code: enum của hai endpoint giống nhau **gần hết** nên rất
 * dễ tưởng là một. Gom vào đây và chặn bằng test thì không lặp lại được.
 */

/** `status` hợp lệ cho `GET /api/v1/mini-app/inbound-documents`. */
export const INBOUND_STATUS_VALUES = [
  'WAITING_APPROVAL',
  'DRAFT',
  'SCANNING',
  'POSTED',
  'CANCELLED',
] as const;

/** `status` hợp lệ cho `GET /api/v1/mini-app/outbound-documents`. */
export const OUTBOUND_STATUS_VALUES = [
  'DRAFT',
  'SCANNING',
  'POSTED',
  'CANCELLED',
] as const;

export type InboundStatus = (typeof INBOUND_STATUS_VALUES)[number];
export type OutboundStatus = (typeof OUTBOUND_STATUS_VALUES)[number];

/**
 * Trạng thái "đang chờ duyệt" của **phiếu nhập** — bí danh Mini App, spec khai.
 */
export const INBOUND_PENDING_STATUS: InboundStatus = 'WAITING_APPROVAL';

/**
 * ⛔️ **KHÔNG dùng `status` để lọc phiếu xuất chờ duyệt.**
 *
 * ## 🔧 Sửa 2026-09-06 — câu hỏi 18 đã có lời giải, và nó không phải `status`
 *
 * Bản trước đoán `SCANNING` là trạng thái canonical tương đương
 * `WAITING_APPROVAL`, rồi lọc thêm theo `mini_app_status` để bù. Lập luận đó
 * **đúng hướng nhưng sai công cụ**, và để lại một rủi ro tôi đã ghi rõ: phiếu
 * **đang quét dở** cũng mang `SCANNING`, làm số đếm cao hơn thực tế.
 *
 * Người dùng cung cấp mô tả luồng xuất (2026-09-06) cho biết endpoint này nhận
 * `ready_for_post` và `ready_for_issue`. Đối chiếu mã Mini App đang chạy thì
 * đúng — `scan.service.ts:1504-1505` đặt hai tham số đó.
 *
 * ⇒ Câu hỏi *"phiếu xuất chờ duyệt mang status gì"* **là câu hỏi sai**. Không có
 * status nào diễn đạt được "đã quét đủ, sẵn sàng Post"; đó là thứ **máy chủ
 * tính** và phơi ra bằng cờ riêng. Hỏi đúng thì không cần đoán, và cũng không
 * cần lọc bù ở client.
 *
 * Xem `OUTBOUND_READY_QUERY` ngay dưới.
 */
export const OUTBOUND_PENDING_STATUS: OutboundStatus = 'SCANNING';

/**
 * Bộ lọc **đúng** cho danh sách phiếu xuất chờ duyệt.
 *
 * Nguồn: mô tả luồng xuất của người dùng (2026-09-06), đối chiếu khớp với
 * `scan.service.ts:1477,1504-1505` của Mini App đang chạy.
 *
 * Hai cờ do **máy chủ tính**. Client chỉ truyền và hiển thị — không tự suy từ
 * `scanned_total_qty >= expected_total_qty`, vì điều kiện đủ để Post còn phụ
 * thuộc những thứ client không thấy (giữ chỗ tồn, quyền, trạng thái item).
 */
export const OUTBOUND_READY_QUERY = {
  ready_for_post: true,
  ready_for_issue: true,
} as const;

/**
 * Bộ lọc cho danh sách phiếu **nhập** chờ duyệt.
 *
 * Giữ `status=WAITING_APPROVAL` vì luồng nhập **có** bí danh đó và đã đo thật
 * trả 200 (§4e.2). Không đổi sang `ready_for_post` chỉ cho đồng bộ hình thức:
 * một thay đổi chưa đo được, ở màn thủ kho dùng hằng ngày, là rủi ro không cần.
 */
export const INBOUND_PENDING_QUERY = {
  status: INBOUND_PENDING_STATUS,
} as const;

/** Giá trị `mini_app_status` cho phiếu đã ghi nhận, đang chờ duyệt. */
export const MINI_APP_WAITING_APPROVAL = 'WAITING_APPROVAL';

export function isValidInboundStatus(value: string): boolean {
  return (INBOUND_STATUS_VALUES as readonly string[]).includes(value);
}

export function isValidOutboundStatus(value: string): boolean {
  return (OUTBOUND_STATUS_VALUES as readonly string[]).includes(value);
}
