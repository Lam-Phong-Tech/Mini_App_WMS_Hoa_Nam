/**
 * Bản dựng này nhắm tới tier nào — **hằng số lúc biên dịch**.
 *
 * 🔒 Quy tắc người dùng chốt 2026-09-06, mục 6:
 * *"Không dùng menu/toggle đổi URL trong app. Tách build profile DEV/TEST và
 * Customer/Production."*
 *
 * ## Vì sao là một tệp nguồn chứ không phải cấu hình lúc chạy
 *
 * Bản trước đọc môi trường từ **storage**, và màn Chẩn đoán có nút đổi. Nghĩa là
 * một bản APK duy nhất có thể trỏ vào kho khách hàng chỉ bằng vài cú chạm —
 * đúng thứ mục 6 cấm. Cái nguy không phải người dùng cố tình, mà là chạm nhầm
 * rồi không ai biết bản trên tay thợ kho đang nói chuyện với stack nào.
 *
 * Hằng số biên dịch không có trạng thái để mà lệch: đọc tệp này là biết chắc
 * APK đó trỏ đi đâu, không cần hỏi thiết bị.
 *
 * ## Cách cắt bản Customer/Production
 *
 * 1. Sửa giá trị dưới đây thành `'customer-production'`.
 * 2. Chạy `npm run typecheck && npm test` — bộ test đối chiếu profile với base
 *    URL, nên sai cặp là đỏ ngay.
 * 3. Build release, rồi **hoàn nguyên tệp này về `'dev-test'`** trong cùng một
 *    lần commit để nhánh chính không bao giờ mặc định trỏ vào kho khách hàng.
 *
 * ⚠️ Mục 5: bản Customer **chỉ phát hành sau khi nghiệm thu DEV/TEST**.
 *
 * ## Hằng số này KHÔNG phải thứ quyết định an toàn
 *
 * Nó chỉ chọn base URL. Chốt chặn thật là **header máy chủ trả về** ở
 * `/api/v1/health` — xem `services/wms/tierCheck.ts`. Một bản dựng trỏ nhầm
 * host sẽ bị chính máy chủ đó tố cáo, chứ không tự tin vào hằng số của mình.
 */

import type { DeploymentTier } from './deployment';

export const BUILD_PROFILE: DeploymentTier = 'dev-test';
