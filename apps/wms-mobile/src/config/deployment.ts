/**
 * Tier triển khai — từ vựng dùng chung cho toàn app.
 *
 * ## Bằng chứng hạ tầng (người dùng cung cấp 2026-09-06)
 *
 * | Tier | Domain API | Nginx đích | Stack | Database |
 * |---|---|---|---|---|
 * | `dev-test` | `khohoanamdev.lptech.info.vn` | `127.0.0.1:18082` | Green | `wms_hoanam_green` |
 * | `customer-production` | `khohoanamdev.bigk.click` | `127.0.0.1:18081` | Blue | `wms_hoanam_blue` |
 *
 * ⇒ **Mục 3 Gate WMS ĐÓNG.** Trước đó ba lời khai mâu thuẫn nhau về host nào là
 * production, và `GATE_01 §11` #8 cấm tôi tự phân xử. Nay không còn phải suy
 * luận: hai tier tách nhau ở **cổng Nginx, stack và database** — không phải chỉ
 * ở tên miền.
 *
 * ## Vì sao `APP_ENV` từng gây hiểu nhầm
 *
 * Green ghi `staging` trong `.env` nhưng Laravel runtime lại chạy `production`.
 * Hai khái niệm bị trộn làm một: **chế độ chạy của framework** và **tier triển
 * khai**. Người dùng đã tách chúng ra — cả hai stack chạy Laravel
 * production-like, còn tier nằm ở biến riêng `WMS_DEPLOYMENT_TIER`.
 *
 * Bài học ghi lại đây để không ai suy ra tier từ `APP_ENV` lần nữa: **nguồn duy
 * nhất có thẩm quyền là header phản hồi của `/api/v1/health`**, không phải tên
 * miền, không phải `APP_ENV`, không phải cờ trong app.
 */

/** Hai tier, đúng bằng số tier hạ tầng có. Không có tier thứ ba. */
export type DeploymentTier = 'dev-test' | 'customer-production';

/**
 * Header **máy chủ trả về** ở `/api/v1/health`, khai nó thuộc tier nào.
 *
 * Đây là nguồn có thẩm quyền duy nhất. App không được tự kết luận tier từ URL:
 * một bản dựng trỏ nhầm host vẫn "tin" là mình đúng nếu chỉ đọc hằng số của
 * chính mình — vòng lặp tự xác nhận, không phải kiểm chứng.
 */
export const TIER_RESPONSE_HEADER = 'X-WMS-Deployment-Tier';

/**
 * Header **app gửi lên**, khai bản dựng này nhắm tới tier nào.
 *
 * Backend chưa có middleware bắt buộc header này (người dùng ghi rõ
 * 2026-09-06). Gửi trước để khi middleware bật lên thì khoá được **hai chiều**:
 * app tự chặn khi máy chủ sai tier, và máy chủ trả `409 ENVIRONMENT_MISMATCH`
 * khi client sai tier.
 *
 * Một chiều thì vẫn hở: bản dựng cũ không gửi header sẽ đi lọt.
 */
export const CLIENT_TIER_HEADER = 'X-WMS-Client-Tier';

export function isDeploymentTier(value: unknown): value is DeploymentTier {
  return value === 'dev-test' || value === 'customer-production';
}

/** Nhãn tiếng Việt để hiện cho người vận hành. */
export function tierLabel(tier: DeploymentTier): string {
  return tier === 'dev-test' ? 'DEV/TEST (Green)' : 'Khách hàng (Blue)';
}
