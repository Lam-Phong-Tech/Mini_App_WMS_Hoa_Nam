/**
 * Preflight tier — hỏi máy chủ *"anh là stack nào"* trước khi cho ghi.
 *
 * 🔒 Luồng bắt buộc người dùng chốt 2026-09-06:
 *
 * | # | Yêu cầu | Ở đâu |
 * |:--:|---|---|
 * | 2 | Khi app mở, gọi `GET /api/v1/health`; chỉ bật quét và `post-receipt` khi header đúng | `checkDeploymentTier` + `useDeploymentTier` |
 * | 3 | Trước `post-receipt`, kiểm tra header tier **lần nữa** | `requireTierForWrite` |
 * | 4 | Header thiếu hoặc khác ⇒ khoá ghi, báo *"Sai môi trường"*, **không retry** | `assertTierMatched` + `wrong_environment` |
 *
 * ## Vì sao hỏi máy chủ thay vì tin hằng số của chính mình
 *
 * App **biết** nó nhắm tới tier nào (`BUILD_PROFILE`). Nhưng đó là điều nó tự
 * khai. Nếu chỉ đọc hằng số của mình thì một bản dựng trỏ nhầm host vẫn tự tin
 * là đúng — vòng lặp tự xác nhận, không phải kiểm chứng. Chỉ **máy chủ đang trả
 * lời** mới nói được nó là stack nào, và đó là lý do bước này tồn tại.
 *
 * ## Vì sao kiểm hai lần chứ không một
 *
 * Lần đầu lúc mở app; lần hai ngay trước `post-receipt`. Giữa hai mốc đó có thể
 * hàng giờ trôi qua — DNS đổi, VPN bật lên, hạ tầng chuyển cổng Nginx. Kiểm
 * lại tốn một request; không kiểm lại thì rủi ro là **tăng tồn nhầm stack**,
 * mà thao tác đó không hoàn tác được bằng cách bấm lại.
 *
 * ## Vì sao "thiếu header" bị xử như "sai tier"
 *
 * Không có header nghĩa là **không biết** đang nói chuyện với ai. Với một lệnh
 * tăng tồn kho, "không biết" và "biết là sai" đáng bị chặn như nhau. Đoán thoáng
 * ở đây là đổi một sự cố nhìn thấy được lấy một sự cố âm thầm.
 */

import { AppError } from '../../errors/AppError';
import { apiClient, type ApiResponse } from '../../api/client';
import { getCurrentEnvironment } from '../../config/env';
import {
  TIER_RESPONSE_HEADER,
  isDeploymentTier,
  tierLabel,
  type DeploymentTier,
} from '../../config/deployment';

/** Endpoint công khai hạ tầng đã bổ sung header tier vào. */
export const HEALTH_PATH = '/api/v1/health';

/**
 * Preflight phải nhanh — nó chặn cả màn hình. Ngắn hơn timeout chung (20s) để
 * thủ kho không phải nhìn màn chờ nửa phút mới biết là mất mạng.
 */
export const TIER_CHECK_TIMEOUT_MS = 8000;

export type TierStatus =
  /** Chưa hỏi lần nào. */
  | 'unchecked'
  /** Máy chủ khai đúng tier bản dựng này nhắm tới. Chỉ trạng thái này cho ghi. */
  | 'matched'
  /** Máy chủ khai một tier KHÁC. */
  | 'mismatched'
  /** Máy chủ trả lời nhưng **không có** header tier, hoặc giá trị lạ. */
  | 'missing'
  /** Không gọi được `/health`. */
  | 'unreachable';

export interface TierCheckResult {
  readonly status: TierStatus;
  /** Tier bản dựng này nhắm tới. */
  readonly expected: DeploymentTier;
  /** Giá trị **thô** máy chủ trả về — giữ nguyên kể cả khi không hợp lệ. */
  readonly reported?: string;
  /** Epoch ms lúc hỏi, để biết kết quả cũ tới đâu. */
  readonly checkedAt?: number;
  readonly error?: AppError;
}

/**
 * Câu tiếng Việt hiện cho thủ kho. Nguyên văn *"Sai môi trường"* theo mục 4.
 *
 * Câu này cố ý **không** gợi ý bấm lại: gửi lại với cùng bản dựng sẽ sai y hệt.
 * Cách sửa duy nhất là cài đúng bản APK, và đó là việc của người phát hành.
 */
export const MESSAGE_WRONG_ENVIRONMENT = 'Sai môi trường';

const UNCHECKED: TierCheckResult = {
  status: 'unchecked',
  expected: 'dev-test',
};

let lastResult: TierCheckResult = UNCHECKED;

/** Kết quả lần kiểm gần nhất. `unchecked` khi app vừa mở. */
export function getLastTierCheck(): TierCheckResult {
  return lastResult;
}

/** Chỉ dùng trong test. */
export function resetTierCheckForTesting(): void {
  lastResult = UNCHECKED;
}

/**
 * Đặt sẵn kết quả — **chỉ dùng trong test**.
 *
 * Có hàm này để test màn hình không phải giả lập cả tầng mạng chỉ để dựng một
 * trạng thái tier. Không màn nào trong `src/features` được gọi nó; nếu gọi thì
 * đã là một đường đi vòng qua chốt chặn.
 */
export function setTierCheckForTesting(result: TierCheckResult): void {
  lastResult = result;
}

export interface TierCheckDeps {
  readonly get?: <T>(
    path: string,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ) => Promise<ApiResponse<T>>;
  readonly now?: () => number;
}

/**
 * Hỏi máy chủ và ghi nhớ kết quả.
 *
 * **Không bao giờ ném lỗi.** Mọi hỏng hóc đều thành một `TierCheckResult` —
 * bên gọi ở màn hình cần *hiển thị* trạng thái, còn bên gọi ở luồng ghi thì
 * dùng `assertTierMatched` để biến nó thành lỗi. Trộn hai việc vào một hàm sẽ
 * bắt màn hình phải `try/catch` chỉ để vẽ một dòng chữ.
 */
export async function checkDeploymentTier(
  deps: TierCheckDeps = {},
): Promise<TierCheckResult> {
  const get = deps.get ?? apiClient.get;
  const now = deps.now ?? Date.now;
  const expected = getCurrentEnvironment().expectedTier;

  let response: ApiResponse<unknown>;
  try {
    response = await get<unknown>(HEALTH_PATH, {
      timeoutMs: TIER_CHECK_TIMEOUT_MS,
    });
  } catch (error) {
    lastResult = {
      status: 'unreachable',
      expected,
      checkedAt: now(),
      error:
        error instanceof AppError
          ? error
          : new AppError({
              kind: 'network',
              message: 'Không gọi được ' + HEALTH_PATH + '.',
              cause: error,
            }),
    };
    return lastResult;
  }

  const reported = response.header?.(TIER_RESPONSE_HEADER)?.trim();

  if (reported === undefined || reported === '' || !isDeploymentTier(reported)) {
    lastResult = {
      status: 'missing',
      expected,
      reported,
      checkedAt: now(),
    };
    return lastResult;
  }

  lastResult = {
    status: reported === expected ? 'matched' : 'mismatched',
    expected,
    reported,
    checkedAt: now(),
  };
  return lastResult;
}

/**
 * Biến kết quả kiểm thành lỗi, nếu không phải `matched`.
 *
 * Dùng `wrong_environment` chứ không `blocked_by_gate`: `syncEngine` xếp cái
 * này vào `failed` (gửi lại vô ích) thay vì `pending` (chờ rồi gửi lại) — đúng
 * mục 4 *"không retry"*.
 */
export function assertTierMatched(result: TierCheckResult): void {
  if (result.status === 'matched') {
    return;
  }

  const detail =
    result.status === 'mismatched'
      ? 'Máy chủ khai tier "' +
        String(result.reported) +
        '" nhưng bản dựng này dành cho ' +
        tierLabel(result.expected) +
        '.'
      : result.status === 'missing'
        ? 'Máy chủ không khai header ' +
          TIER_RESPONSE_HEADER +
          ' nên không xác định được đang nói chuyện với stack nào.'
        : result.status === 'unreachable'
          ? 'Chưa gọi được ' +
            HEALTH_PATH +
            ' để xác định môi trường. ' +
            (result.error?.message ?? '')
          : 'Chưa kiểm tra môi trường lần nào.';

  throw new AppError({
    kind: 'wrong_environment',
    message: MESSAGE_WRONG_ENVIRONMENT + ' — ' + detail.trim(),
  });
}

/**
 * Bước 3 của luồng bắt buộc: kiểm **lại** ngay trước một thao tác ghi.
 *
 * Cố ý luôn gọi mạng, **không** dùng kết quả đã nhớ. Kết quả cũ từ lúc mở app
 * không chứng minh được gì cho thời điểm hiện tại, mà thứ sắp xảy ra là một
 * lệnh tăng tồn kho không hoàn tác được.
 */
export async function requireTierForWrite(
  deps: TierCheckDeps = {},
): Promise<TierCheckResult> {
  const result = await checkDeploymentTier(deps);
  assertTierMatched(result);
  return result;
}

/** Quét có được bật không — mục 2. */
export function scanningAllowed(result: TierCheckResult): boolean {
  return result.status === 'matched';
}
