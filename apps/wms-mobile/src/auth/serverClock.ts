/**
 * Đồng hồ máy chủ — nguồn thời gian DUY NHẤT cho mọi so sánh hạn.
 *
 * Vì sao tồn tại: máy quét Android giá rẻ chạy sai đồng hồ vài ngày là chuyện
 * thường (pin CMOS yếu, không đồng bộ NTP, người dùng tự chỉnh). Nếu lấy
 * `Date.now()` của máy để so với `retention_until` hoặc hạn token thì hoặc xoá
 * dữ liệu sớm, hoặc giữ quá hạn, hoặc gia hạn token sai lúc.
 *
 * Mọi phản hồi của WMS đều mang `meta.timestamp` (ISO 8601, +07:00). Module này
 * ghi nhận độ lệch giữa giờ máy chủ và giờ máy, rồi `serverNow()` trả về giờ máy
 * chủ ước lượng.
 *
 * ⚠️ Đây là **ước lượng**, không phải đồng bộ thật: độ lệch còn lẫn cả độ trễ
 * mạng một chiều. Sai số cỡ vài trăm ms — không đáng kể với hạn tính bằng phút
 * và ngày, nhưng đừng dùng module này để đo hiệu năng.
 */

/** Độ lệch = giờ máy chủ − giờ máy. Dương nghĩa là máy đang chậm. */
let skewMs = 0;

/** Đã từng nhận được giờ máy chủ lần nào chưa. */
let synced = false;

/**
 * Bỏ qua độ lệch nhỏ hơn ngưỡng này: dưới mức đó thì chênh lệch chủ yếu là độ
 * trễ mạng chứ không phải đồng hồ máy sai, hiệu chỉnh chỉ thêm nhiễu.
 */
export const SKEW_IGNORE_MS = 2_000;

/**
 * Ghi nhận `meta.timestamp` từ một phản hồi.
 *
 * @param iso Chuỗi ISO trong `meta.timestamp`. Giá trị hỏng bị bỏ qua im lặng —
 *   không được để một phản hồi dị dạng làm hỏng đồng hồ của cả app.
 */
export function recordServerTime(
  iso: unknown,
  deviceNowMs: number = Date.now(),
): void {
  if (typeof iso !== 'string' || iso.length === 0) {
    return;
  }
  const serverMs = Date.parse(iso);
  if (Number.isNaN(serverMs)) {
    return;
  }
  const observed = serverMs - deviceNowMs;
  synced = true;
  skewMs = Math.abs(observed) < SKEW_IGNORE_MS ? 0 : observed;
}

/** Giờ máy chủ ước lượng, tính bằng epoch millisecond. */
export function serverNow(deviceNowMs: number = Date.now()): number {
  return deviceNowMs + skewMs;
}

/** Độ lệch đang áp dụng. Dùng để hiển thị chẩn đoán, không dùng để tính hạn. */
export function getClockSkewMs(): number {
  return skewMs;
}

/**
 * Đã bao giờ nhận được giờ máy chủ chưa.
 *
 * Khi còn `false`, `serverNow()` chính là giờ máy — mọi quyết định **xoá dữ
 * liệu** dựa trên nó đều không đáng tin. Bên gọi phải tự kiểm cờ này trước khi
 * xoá bất cứ thứ gì.
 */
export function hasServerTime(): boolean {
  return synced;
}

/** Đưa về trạng thái ban đầu. Dùng cho test và khi đăng xuất. */
export function resetServerClock(): void {
  skewMs = 0;
  synced = false;
}

/**
 * Rút `meta.timestamp` ra khỏi thân phản hồi bất kỳ.
 *
 * Envelope thật có hai biến thể (`{data, links, meta, success}` và
 * `{data, meta, success}`), nhưng `meta.timestamp` có ở cả hai — xem
 * `docs/migration/03-api-contract-delta.md` §4e.3.
 */
export function readServerTimestamp(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }
  const meta = (payload as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null) {
    return undefined;
  }
  const timestamp = (meta as { timestamp?: unknown }).timestamp;
  return typeof timestamp === 'string' ? timestamp : undefined;
}
