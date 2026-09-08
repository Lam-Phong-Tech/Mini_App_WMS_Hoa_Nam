/**
 * Chốt chặn callback trùng cho camera.
 *
 * Prompt 3 §A: "Chặn callback trùng trong khoảng thời gian ngắn."
 *
 * Vì sao cần: camera đọc **liên tục**, một mã nằm yên trong khung hình sẽ sinh
 * ra hàng chục callback mỗi giây. Không chặn thì một lần giơ mã lên tạo ra hàng
 * chục dòng nhập kho.
 *
 * ⚠️ **Bài học từ lần sửa 2026-09-05.** Bản đầu chỉ nhớ **một mã cuối cùng**.
 * Người dùng thử trên máy thật và báo "có trùng" — đúng. Khi hai mã cùng nằm
 * trong khung hình (hoặc MLKit đọc nhầm rồi đọc đúng xen kẽ), chuỗi callback là
 * `A B A B …`; mỗi lần đến đều **khác** mã trước nên đều lọt:
 *
 *     A → nhận (last = A)
 *     B → nhận (last = B)
 *     A → nhận lại vì khác B   ← trùng
 *
 * Vì vậy giờ **mỗi mã giữ cửa sổ riêng** trong một `Map`, không còn phụ thuộc
 * thứ tự đến.
 *
 * Đây là logic thuần, không đụng React hay native — để test được đầy đủ.
 *
 * ⚠️ Khác với `KeyboardWedgeParser`: ở đó chống trùng **mặc định TẮT** vì đầu
 * quét chỉ bắn một lần mỗi khi bóp cò, chặn nhầm sẽ nuốt lần quét hợp lệ khi
 * thủ kho cố tình quét cùng một mã hai lần. Camera thì ngược lại — bắt buộc
 * phải chặn, nếu không sẽ ngập callback.
 */

import type { DedupeScope } from './scanPayload';

export interface ScanGuardConfig {
  /**
   * Trong bao lâu thì **cùng một mã** bị bỏ qua.
   * Đủ dài để một lần giơ mã chỉ tính một lần, đủ ngắn để thủ kho quét lại
   * chính mã đó khi cần.
   */
  readonly dedupeWindowMs: number;
  /**
   * Số mã tối đa giữ trong bộ nhớ chống trùng.
   *
   * Có giới hạn để `Map` không phình vô hạn khi thủ kho quét hàng nghìn thùng
   * liên tục. Khi vượt ngưỡng, mã **cũ nhất** bị loại — nó cũng là mã đã hết
   * cửa sổ từ lâu nhất nên loại đi là an toàn.
   */
  readonly maxTrackedCodes: number;
}

export const DEFAULT_SCAN_GUARD_CONFIG: ScanGuardConfig = {
  dedupeWindowMs: 1500,
  maxTrackedCodes: 64,
};

export interface ScanGuard {
  /**
   * `true` = chấp nhận mã này; `false` = trùng, bỏ qua.
   *
   * `scope` quyết định chặn tới bao giờ:
   *  - `'session'` — chặn tới khi `reset()`. Dùng cho mã có `ITEM`, vì một
   *    `ITEM` là một kiện hàng vật lý; quét lại luôn là thao tác thừa.
   *  - `'window'` — chỉ chặn trong `dedupeWindowMs`. Dùng cho mã không có
   *    `ITEM`, vì hai lần quét cùng chuỗi có thể là hai kiện khác nhau.
   */
  accept(code: string, at?: number, scope?: DedupeScope): boolean;
  /**
   * Mã đã gửi lên WMS nhưng bị từ chối. Khoá riêng mã đó tới hết phiên quét;
   * các mã khác vẫn đi qua ngay. Điều này chặn camera bắt lại đúng tem lỗi rồi
   * gửi request lặp vô hạn.
   */
  reject(code: string): void;
  /** Xoá trạng thái — gọi khi rời màn hoặc bật lại camera. */
  reset(): void;
  /** Mã vừa được chấp nhận gần nhất, để hiển thị. */
  lastAccepted(): string | undefined;
  /** Số mã đang được theo dõi. Dùng để test và chẩn đoán. */
  trackedCount(): number;
  /** Số mã đã bị khoá cả phiên. Dùng để test và chẩn đoán. */
  sessionCount(): number;
}

export function createScanGuard(
  config: ScanGuardConfig = DEFAULT_SCAN_GUARD_CONFIG,
  now: () => number = Date.now,
): ScanGuard {
  /** code → thời điểm được chấp nhận gần nhất (phạm vi `window`). */
  const acceptedAt = new Map<string, number>();
  /** Mã đã nhận với phạm vi `session` — không bao giờ nhận lại tới khi reset. */
  const acceptedInSession = new Set<string>();
  /** Mã WMS đã từ chối — cũng không cho camera bắn lặp tới khi reset phiên. */
  const rejectedInSession = new Set<string>();
  let last: string | undefined;

  /** Bỏ các mã đã hết cửa sổ; chúng không còn ảnh hưởng quyết định nào nữa. */
  const dropExpired = (nowMs: number): void => {
    for (const [code, at] of acceptedAt) {
      if (nowMs - at >= config.dedupeWindowMs) {
        acceptedAt.delete(code);
      }
    }
  };

  const capTrackedCodes = (): void => {
    while (acceptedAt.size > config.maxTrackedCodes) {
      const oldest = acceptedAt.keys().next();
      if (oldest.done === true) {
        break;
      }
      acceptedAt.delete(oldest.value);
    }
  };

  return {
    accept: (code, at, scope = 'window') => {
      const timestamp = at ?? now();
      dropExpired(timestamp);

      // `window` chỉ lọc callback dội của barcode SKU hợp lệ. Riêng mã đã bị
      // WMS từ chối phải bị khoá cả phiên, nếu không cứ 1.5 giây camera lại
      // nhận cùng tem lỗi, thay phiên card “đang kiểm tra”/“lỗi” và làm người
      // dùng tưởng preview bị nhảy hoặc mã kế tiếp bị bỏ qua.
      if (rejectedInSession.has(code)) {
        return false;
      }

      if (scope === 'session') {
        // Một kiện hàng chỉ được đếm một lần trong cả phiên quét.
        if (acceptedInSession.has(code)) {
          return false;
        }
        acceptedInSession.add(code);
        last = code;
        return true;
      }

      const previous = acceptedAt.get(code);
      if (previous !== undefined && timestamp - previous < config.dedupeWindowMs) {
        // Còn trong cửa sổ → bỏ qua. KHÔNG cập nhật mốc thời gian, nếu không
        // một mã nằm yên trong khung hình sẽ bị chặn vĩnh viễn.
        return false;
      }

      acceptedAt.set(code, timestamp);
      last = code;
      capTrackedCodes();

      return true;
    },

    reject: code => {
      // Không gọi `reset()` ở đây: reset mọi mã đã quét thành công và tạo một
      // vòng lặp callback. Chỉ cô lập đúng tem vừa bị WMS từ chối.
      rejectedInSession.add(code);
    },

    reset: () => {
      acceptedAt.clear();
      acceptedInSession.clear();
      rejectedInSession.clear();
      last = undefined;
    },

    lastAccepted: () => last,
    trackedCount: () => acceptedAt.size,
    sessionCount: () => acceptedInSession.size,
  };
}
