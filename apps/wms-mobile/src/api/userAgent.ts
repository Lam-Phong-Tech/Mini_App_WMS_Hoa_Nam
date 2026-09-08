/**
 * Danh tính client gửi kèm mọi request.
 *
 * 🔑 **Đây là chuỗi Cloudflare đang allowlist.** Quản trị hạ tầng xác nhận ngày
 * 2026-09-05: trên production `khohoanamdev.bigk.click`, request có
 * `User-Agent` **bắt đầu bằng** `WMSHoaNam-Android/` được cho qua (test thật với
 * `WMSHoaNam-Android/1.0.0` → `200 OK`). Client không thuộc allowlist vẫn nhận
 * `403` kèm header `Cf-Mitigated: challenge`.
 *
 * ⚠️ **Đổi tiền tố `WMSHoaNam-Android/` là làm chết app trên máy thủ kho.**
 * Không đổi nếu chưa có quản trị Cloudflare cập nhật rule trước. Có test khoá
 * tiền tố này lại (`userAgent.test.ts`).
 *
 * Cố ý **không** nhét thêm model máy hay phiên bản Android vào chuỗi: làm vậy
 * phải thêm `react-native-device-info`, mà rule chỉ khớp tiền tố nên không được
 * lợi gì. Cần chẩn đoán theo máy thì dùng `X-Request-ID` của máy chủ.
 *
 * Đây **không** phải giả mạo trình duyệt — app khai đúng danh tính của nó. Xem
 * `docs/migration/03-api-contract-delta.md` §4c.
 */

/**
 * Tiền tố Cloudflare khớp. Phần sau dấu `/` là phiên bản, không tham gia khớp.
 */
export const USER_AGENT_PREFIX = 'WMSHoaNam-Android/';

/**
 * Phiên bản app, phải khớp `versionName` trong `android/app/build.gradle`.
 *
 * Giữ tay ở hai nơi là chấp nhận được vì có test đối chiếu; đọc `build.gradle`
 * lúc chạy thì không làm được, mà thêm một thư viện chỉ để lấy một chuỗi thì
 * không đáng.
 */
export const APP_VERSION = '1.0';

/** Chuỗi `User-Agent` app gửi đi. */
export const USER_AGENT = USER_AGENT_PREFIX + APP_VERSION;

/**
 * Header Cloudflare gắn khi nó **thử thách** (challenge) một request.
 *
 * ⚠️ **Không phải dấu hiệu duy nhất, và không phải dấu hiệu chính.** Quản trị hạ
 * tầng mô tả ngày 2026-09-05 rằng client bị chặn nhận `403` kèm
 * `Cf-Mitigated: challenge`. Đo thật cùng ngày trên chính production cho thấy
 * phản hồi 403 **không mang header này** — xem `EDGE_BLOCK_EVIDENCE`.
 */
export const EDGE_MITIGATED_HEADER = 'cf-mitigated';

/** Header mà **ứng dụng** gắn vào mọi phản hồi; Cloudflare thì không. */
export const APP_REQUEST_ID_HEADER = 'x-request-id';

/**
 * 📋 Bằng chứng đo thật ngày 2026-09-05 trên `khohoanamdev.bigk.click`
 * (GET `/api/v1/mini-app/inbound-documents`, không kèm token):
 *
 * | User-Agent | HTTP | Ai trả lời |
 * |---|---|---|
 * | `WMSHoaNam-Android/1.0` ← **app gửi** | **401** | ứng dụng ✅ |
 * | `WMSHoaNam-Android/1.0.0` | 401 | ứng dụng |
 * | `okhttp/4.12.0` | 401 | ứng dụng |
 * | `curl/8.5.0` | 401 | ứng dụng |
 * | UA trình duyệt | 401 | ứng dụng |
 * | chuỗi rỗng | 401 | ứng dụng |
 * | `Python-urllib/3.12` | **403** | Cloudflare ❌ |
 * | *không gửi UA* | **403** | Cloudflare ❌ |
 *
 * Thân phản hồi 403 (nguyên văn, rút gọn):
 * `{"title":"Error 1010: Access denied","status":403,"error_code":1010,`
 * `"error_name":"browser_signature_banned","ray_id":"a3655321af89fe05"}`
 *
 * Ba điểm phân biệt được rút ra:
 *
 * 1. Cloudflare đặt `error_code` là **SỐ** (1010); ứng dụng đặt là **CHUỖI**
 *    (`"UNAUTHENTICATED"`). Không bao giờ lẫn được.
 * 2. Cloudflare kèm `error_name` và `ray_id`; ứng dụng thì không.
 * 3. Ứng dụng luôn gắn header `x-request-id`; Cloudflare thì không.
 *
 * `Cf-Mitigated` **không xuất hiện** trong lần đo này, nên không thể dựa vào nó.
 */
export const EDGE_BLOCK_EVIDENCE = 'docs/migration/03-api-contract-delta.md §4j';

function looksLikeCloudflareBody(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const record = body as Record<string, unknown>;
  // Chốt chặn quan trọng: ứng dụng dùng error_code kiểu CHUỖI. Kiểu số chỉ có
  // thể là mã lỗi 1xxx của Cloudflare.
  if (typeof record.error_code === 'number') {
    return true;
  }
  return (
    typeof record.error_name === 'string' || typeof record.ray_id === 'string'
  );
}

/**
 * Phản hồi này do **lớp biên** (Cloudflare) chặn, chứ không phải do ứng dụng?
 *
 * Ba dấu hiệu, xét theo thứ tự tin cậy giảm dần. Dấu hiệu thứ ba là phương án
 * dự phòng cho trường hợp Cloudflare trả trang HTML thay vì JSON — lúc đó không
 * đọc được thân, nhưng vẫn biết ứng dụng không đứng sau phản hồi này.
 *
 * Đọc header thủ công thay vì tin `response.headers` luôn tồn tại: polyfill
 * `fetch` và test giả đều có thể không có đối tượng đó.
 */
export function isEdgeBlocked(
  status: number,
  headers?: { get?: (name: string) => string | null } | undefined,
  body?: unknown,
): boolean {
  if (status !== 403) {
    return false;
  }
  const mitigated = headers?.get?.(EDGE_MITIGATED_HEADER);
  if (typeof mitigated === 'string' && mitigated.length > 0) {
    return true;
  }
  if (looksLikeCloudflareBody(body)) {
    return true;
  }
  // Không có dấu vết ứng dụng ⇒ phản hồi không đến từ ứng dụng.
  const appRequestId = headers?.get?.(APP_REQUEST_ID_HEADER);
  return typeof appRequestId !== 'string' || appRequestId.length === 0;
}
