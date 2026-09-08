/**
 * Cấu hình theo môi trường — **một bản dựng, một tier, không đổi được lúc chạy**.
 *
 * ## 🔧 Viết lại 2026-09-06
 *
 * Bản trước đọc môi trường từ **storage** và màn Chẩn đoán có nút đổi. Người
 * dùng chốt mục 6: *"Không dùng menu/toggle đổi URL trong app. Tách build
 * profile DEV/TEST và Customer/Production."* ⇒ toàn bộ cơ chế chọn lúc chạy đã
 * bị gỡ; `getCurrentEnvironment()` nay suy ra từ `BUILD_PROFILE`, một hằng số
 * biên dịch.
 *
 * Cùng lần này, bốn môi trường cũ (`local`, hai host "chưa xác minh",
 * `production` rỗng) rút còn **đúng hai** — bằng đúng số tier hạ tầng có.
 * Giữ thêm mục nào cũng chỉ là chỗ để chọn nhầm.
 *
 * ## Mục 3 Gate WMS đã ĐÓNG
 *
 * `GATE_01 §11` #8 cấm tự phân loại môi trường, nên trước đây mọi môi trường
 * đều mang `environmentClassVerified: false`. Nay hạ tầng đã cung cấp bằng
 * chứng tách tier ở **cổng Nginx, stack và database** (xem `deployment.ts`),
 * nên cờ đó thành `true` — **không phải do tôi suy luận từ tên miền**.
 *
 * ## Cái cờ KHÔNG được bật
 *
 * `wmsGateApproved` vẫn `false` ở **cả hai** môi trường. Người dùng duyệt **ba
 * thao tác ghi** của luồng nhập kho (`GATE_WMS §2e` + `§2f`), không duyệt 175
 * endpoint ghi. Bật cờ này sẽ mở tất, kể cả `DELETE /api/v1/roles/{id}`. Đường
 * đi duy nhất vẫn là danh sách trắng ở `api/writeGate.ts`.
 */

import { BUILD_PROFILE } from './buildProfile';
import type { DeploymentTier } from './deployment';

export type EnvironmentName = DeploymentTier;

export interface AppEnvironment {
  readonly name: EnvironmentName;
  /** Nhãn hiển thị cho người vận hành. */
  readonly label: string;
  /** Base URL của API. Chuỗi rỗng = chưa cấu hình, client sẽ báo lỗi `config`. */
  readonly apiBaseUrl: string;
  readonly requestTimeoutMs: number;
  /**
   * Tier mà bản dựng này **kỳ vọng** máy chủ khai ở `/api/v1/health`.
   *
   * Kỳ vọng, không phải kết luận: nếu máy chủ trả tier khác thì app khoá thao
   * tác ghi và báo *"Sai môi trường"* (mục 4). Máy chủ mới là bên có thẩm quyền.
   */
  readonly expectedTier: DeploymentTier;
  /**
   * Lớp môi trường đã được chủ sở hữu API xác nhận hay chưa.
   *
   * ✅ `true` từ 2026-09-06 — bằng chứng hạ tầng, không phải suy luận.
   */
  readonly environmentClassVerified: boolean;
  /**
   * Toàn bộ 175 endpoint ghi đã được mở chưa. **Luôn `false`** — xem chú thích
   * đầu tệp. Ba thao tác nhập kho đi qua danh sách trắng, không qua cờ này.
   */
  readonly wmsGateApproved: boolean;
  /**
   * Lưu lượng tới host này có đi qua Cloudflare không.
   *
   * Khác `environmentClassVerified`: đây là **đường mạng**, đo được bằng header
   * `Server: cloudflare`. Dùng để màn Chẩn đoán không nói sai — một probe tới
   * host không qua Cloudflare mà báo "qua được Cloudflare" là thông tin sai
   * lệch, đúng loại làm mất hàng giờ dò lỗi nhầm chỗ.
   */
  readonly behindEdgeProxy: boolean;
}

export const ENVIRONMENTS: Readonly<Record<EnvironmentName, AppEnvironment>> = {
  /**
   * Green — nơi mọi thứ trong bản DEV/TEST chạy vào.
   *
   * `post-receipt` ở đây chỉ đổi dữ liệu `wms_hoanam_green`; **không** chạm nổi
   * tồn kho của khách hàng. Đó là lý do người dùng duyệt được C.
   */
  'dev-test': {
    name: 'dev-test',
    label: 'DEV/TEST — Green',
    apiBaseUrl: 'https://khohoanamdev.lptech.info.vn',
    requestTimeoutMs: 20000,
    expectedTier: 'dev-test',
    environmentClassVerified: true,
    wmsGateApproved: false,
    // Người dùng xác nhận 2026-09-06: "lptech.info.vn không qua Cloudflare".
    // Khớp với phép đo ngày 2026-09-05 (đi thẳng origin Nginx).
    behindEdgeProxy: false,
  },

  /**
   * 🔴 Blue — **kho thật của khách hàng**.
   *
   * Mục 5: bản Customer chỉ phát hành **sau khi nghiệm thu DEV/TEST**. Không có
   * đường nào từ bản DEV/TEST tới đây: `BUILD_PROFILE` là hằng số biên dịch, và
   * kể cả trỏ đúng thì preflight vẫn đòi header khớp tier.
   */
  'customer-production': {
    name: 'customer-production',
    label: 'Khách hàng — Blue',
    apiBaseUrl: 'https://khohoanamdev.bigk.click',
    requestTimeoutMs: 20000,
    expectedTier: 'customer-production',
    environmentClassVerified: true,
    wmsGateApproved: false,
    // Đo thật 2026-09-05: header `Server: cloudflare`; UA ngoài allowlist nhận
    // `Error 1010`. Hạ tầng xác nhận host này nằm sau Cloudflare.
    behindEdgeProxy: true,
  },
};

/**
 * Môi trường của bản dựng hiện tại.
 *
 * Không đọc storage, không nhận tham số ghi đè: một APK **chỉ** nói chuyện được
 * với một tier. Muốn đổi thì đổi `buildProfile.ts` và dựng lại.
 */
export function getCurrentEnvironment(): AppEnvironment {
  return ENVIRONMENTS[BUILD_PROFILE];
}

/**
 * Danh sách để **hiển thị**, không phải để chọn.
 *
 * Màn Chẩn đoán dùng nó cho biết hạ tầng có những tier nào; không màn nào được
 * phép đổi tier từ đây. Hàm `setCurrentEnvironment` cũ đã bị **xoá hẳn** chứ
 * không chỉ ẩn đi — còn hàm là còn đường gọi.
 */
export function listEnvironments(): readonly AppEnvironment[] {
  return Object.values(ENVIRONMENTS);
}

/** Thông tin build, hiển thị trên màn chẩn đoán. */
export interface BuildInfo {
  readonly isDebug: boolean;
  readonly applicationId: string;
  /** Tier mà bản dựng này nhắm tới — đọc thẳng từ hằng số biên dịch. */
  readonly profile: DeploymentTier;
}

export const BUILD_INFO: BuildInfo = {
  isDebug: typeof __DEV__ !== 'undefined' && __DEV__,
  applicationId: 'vn.info.lptech.wmshoanam',
  profile: BUILD_PROFILE,
};
