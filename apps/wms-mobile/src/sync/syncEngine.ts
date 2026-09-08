/**
 * Máy đồng bộ.
 *
 * Hai quy tắc người dùng chốt 2026-09-05 được cưỡng chế **trong đường thực thi**,
 * không dựa vào kỷ luật lập trình viên:
 *
 *  1. **Không tự retry.** Không có timer, không có backoff, không có listener
 *     mạng nào gọi tới đây. `syncAll()` chỉ chạy khi người dùng bấm.
 *  2. **Không tự giải quyết xung đột.** `conflict` và `unknown` là ngõ cụt của
 *     máy trạng thái tự động — chỉ người dùng mới đưa bản ghi ra khỏi đó.
 *
 * Chống gửi trùng có hai lớp:
 *  - **Bền vững:** bản ghi được ghi xuống đĩa ở trạng thái `syncing` TRƯỚC khi
 *    request bay đi. App chết giữa chừng → lần khởi động sau thấy `syncing` và
 *    chuyển thành `unknown` (xem `outbox.recoverAfterRestart`).
 *  - **Trong tiến trình:** `inFlight` chặn hai lời gọi song song trên cùng id.
 */

import { AppError, toAppError } from '../errors/AppError';
import { canReachNetwork, type ConnectivityState } from '../connectivity/connectivity';
import { logger, type Logger } from '../logging/logger';
import type { Outbox } from './outbox';
import { SENDABLE_STATES, type OutboxRecord, type OutboxState } from './types';

/**
 * Kết quả phân loại một lần gửi thất bại.
 *
 * `pending` = chắc chắn request CHƯA rời máy → gửi lại an toàn.
 * `unknown` = request ĐÃ đi nhưng không biết kết quả → **cấm gửi lại tự động**.
 */
export interface FailureClassification {
  readonly state: Exclude<OutboxState, 'syncing' | 'synced'>;
  readonly reason: string;
}

/**
 * ✅ **HTTP 5xx = `unknown`. CHÍNH SÁCH ĐÃ CHỐT — người dùng quyết 2026-09-05.**
 *
 * Đây **không còn là giả định tạm**. Người dùng chọn *chính sách an toàn*, nguyên
 * văn: mọi trường hợp **`500`, `502`, `503`, `504`, timeout và mất kết nối sau
 * khi đã gửi mutation** đều mặc định là `unknown`.
 *
 * Lý do họ đưa ra, và tôi đồng tình: *"Timeout và lỗi gateway vẫn luôn là
 * `unknown` vì client không biết request đã đến và được xử lý tới đâu."*
 *
 * Bối cảnh đầy đủ: spec WMS **có** cam kết rollback — 339/339 operation khai 500
 * đều ghi *"giao dịch đã được rollback"*. Người dùng biết điều đó và **vẫn chọn
 * `unknown`**, vì cam kết ấy chỉ áp dụng khi app **nhận được** 500; timeout và
 * lỗi gateway thì không nói lên điều gì.
 *
 * 🔓 **Bốn điều kiện để được phép nới cho riêng `500`** (người dùng đặt ra):
 *
 * 1. Backend chứng minh giao dịch được **rollback toàn bộ**;
 * 2. **Không có side effect ngoài transaction** (email, webhook, job đã đẩy đi…);
 * 3. **Idempotency hoạt động đúng** — đã kiểm chứng, không phải chỉ có tài liệu;
 * 4. **Đã có integration test xác nhận**.
 *
 * Đủ **cả bốn** thì mới tách riêng `500` sang `failed`. `502`/`503`/`504`,
 * timeout và mất kết nối **vĩnh viễn** giữ `unknown` — không điều kiện nào mở
 * được nhánh đó.
 *
 * 🔒 Kèm theo, hai quy tắc bắt buộc khi gửi lại (xem `OutboxRecord.idempotencyKey`):
 * **không** sinh khoá idempotency mới, và **phải** dùng lại đúng khoá cũ.
 */
export const HTTP_5XX_POLICY: 'unknown' | 'failed' = 'unknown';

/**
 * Thông điệp hiển thị cho thủ kho khi kết quả không xác định.
 *
 * Nguyên văn do người dùng chốt 2026-09-05 — **không tự diễn đạt lại**: chữ
 * "đối chiếu" ở đây là một thao tác nghiệp vụ có thật, không phải cách nói.
 */
export const UNKNOWN_RESULT_MESSAGE =
  'Chưa xác định máy chủ đã ghi nhận hay chưa. ' +
  'Vui lòng đồng bộ/đối chiếu trước khi gửi lại.';

/** Status coi là xung đột. 409 Conflict, 412 Precondition Failed. */
export const CONFLICT_STATUSES: readonly number[] = [409, 412];

export function classifyFailure(error: AppError): FailureClassification {
  switch (error.kind) {
    // ----- Chắc chắn chưa rời máy: an toàn để người dùng bấm gửi lại -----
    case 'network':
      return { state: 'pending', reason: 'Không có mạng — request chưa gửi đi.' };
    case 'config':
      return { state: 'pending', reason: 'Chưa cấu hình máy chủ — request chưa gửi đi.' };
    case 'blocked_by_gate':
      return { state: 'pending', reason: error.message };
    case 'blocked_by_edge':
      // Cloudflare chặn TRƯỚC khi request tới ứng dụng — có `error_code` kiểu
      // số 1010 và không có `x-request-id` để chứng minh (xem api/userAgent.ts).
      // Ứng dụng chưa hề thấy request này, nên không có gì để ghi trùng ⇒
      // `pending`, không phải `unknown`. Xếp nhầm sang `unknown` sẽ bắt thủ kho
      // đi đối chiếu một phiếu mà máy chủ chưa từng nhận.
      return {
        state: 'pending',
        reason:
          'Bị lớp bảo vệ mạng chặn, request chưa tới máy chủ. ' +
          'Báo quản trị hệ thống rồi gửi lại.',
      };

    // ----- Đã gửi, không biết kết quả: CẤM gửi lại tự động -----
    // Ba nhánh dưới đây VĨNH VIỄN là `unknown`. Không điều kiện nào ở
    // `HTTP_5XX_POLICY` mở được chúng: client không biết request đã đi tới đâu.
    case 'timeout':
      return {
        state: 'unknown',
        reason: 'Hết thời gian chờ sau khi đã gửi. ' + UNKNOWN_RESULT_MESSAGE,
      };
    case 'cancelled':
      return {
        state: 'unknown',
        reason: 'Request bị huỷ sau khi đã gửi. ' + UNKNOWN_RESULT_MESSAGE,
      };
    case 'parse':
      return {
        state: 'unknown',
        reason:
          'Máy chủ có phản hồi nhưng không đọc được. ' + UNKNOWN_RESULT_MESSAGE,
      };

    // ----- Sai stack: gửi lại cũng sai y như vậy -----
    case 'wrong_environment':
      // KHÔNG phải `pending`. `pending` nghĩa là "chờ điều kiện đổi rồi gửi
      // lại", mà điều kiện ở đây là **bản dựng**, không đổi được lúc chạy. Để
      // `pending` là hứa hão với thủ kho rằng phiếu sẽ tự đi được.
      return { state: 'failed', reason: error.message };

    // ----- Server đã trả lời rõ ràng -----
    case 'auth':
      return { state: 'failed', reason: 'Phiên hết hạn. Đăng nhập lại rồi gửi lại.' };

    case 'http': {
      const status = error.status;
      if (status !== undefined && CONFLICT_STATUSES.includes(status)) {
        const detail = error.message.trim();
        const correlation = [
          error.code === undefined ? undefined : 'Mã lỗi: ' + error.code + '.',
          error.requestId === undefined
            ? undefined
            : 'Mã yêu cầu: ' + error.requestId + '.',
        ]
          .filter((value): value is string => value !== undefined)
          .join(' ');
        return {
          state: 'conflict',
          reason:
            'Máy chủ báo xung đột (' +
            status +
            '). ' +
            (detail === ''
              ? 'Dữ liệu trên WMS đã thay đổi.'
              : detail) +
            (correlation === '' ? '' : ' ' + correlation) +
            ' Không tự ghi đè — cần người dùng quyết định.',
        };
      }
      if (status !== undefined && status >= 500) {
        // 500 · 502 · 503 · 504 — người dùng chốt cùng một chính sách an toàn.
        // Chỉ 500 mới có đường nới, và chỉ khi đủ 4 điều kiện ở HTTP_5XX_POLICY.
        return {
          state: HTTP_5XX_POLICY,
          reason: 'Máy chủ lỗi ' + status + '. ' + UNKNOWN_RESULT_MESSAGE,
        };
      }
      // `inbound/record` có thể trả HTTP 200 kèm `success: false`. Khi đó
      // `postApproved` đã lấy được `message` nghiệp vụ từ envelope. Không được
      // thay nó bằng câu chung chung ở đây: thủ kho cần biết chính xác WMS đang
      // thiếu kho, sai mã, hay từ chối trạng thái nào để sửa đúng phiếu.
      const detail = error.message.trim();
      return {
        state: 'failed',
        reason:
          detail === ''
            ? 'Máy chủ từ chối (' + (status ?? '4xx') + '). Lỗi nghiệp vụ, gửi lại sẽ bị từ chối tương tự.'
            : detail,
      };
    }

    default:
      return {
        state: 'unknown',
        reason: 'Lỗi không xác định sau khi gửi. Kiểm tra trên WMS trước khi gửi lại.',
      };
  }
}

/**
 * Hàm thực sự gửi một bản ghi. Giá trị trả về là phản hồi nghiệp vụ tuỳ chọn;
 * máy đồng bộ không diễn giải nó, nhưng màn tạo phiếu có thể lấy mã chứng từ
 * WMS để hiện đúng như Mini App thay vì hiện id hàng đợi của điện thoại.
 */
export type OutboxSender = (record: OutboxRecord) => Promise<unknown>;

export interface SyncEngineDeps {
  outbox: Outbox;
  send: OutboxSender;
  log?: Logger;
}

export interface SyncOneResult {
  readonly id: string;
  readonly state: OutboxState;
  readonly reason?: string;
  /** `true` khi bản ghi bị bỏ qua vì đang có request khác bay. */
  readonly skipped?: boolean;
  /** Phản hồi của bộ gửi khi đồng bộ thành công. */
  readonly response?: unknown;
}

export interface SyncRunResult {
  readonly attempted: number;
  readonly synced: number;
  readonly results: readonly SyncOneResult[];
  /** Lý do không chạy lần nào, ví dụ đang offline. */
  readonly haltedReason?: string;
}

export interface SyncEngine {
  /** Gửi đúng một bản ghi. Chỉ nhận bản ghi ở `SENDABLE_STATES`. */
  syncOne(id: string): Promise<SyncOneResult>;
  /**
   * Gửi tuần tự mọi bản ghi gửi được.
   * ⚠️ **Chỉ được gọi từ hành động người dùng.** Không có bộ đếm giờ nào gọi.
   */
  syncAll(connectivity: ConnectivityState): Promise<SyncRunResult>;
  /** Id đang có request bay — để UI khoá nút. */
  inFlightIds(): string[];
}

export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  const log = deps.log ?? logger;
  const { outbox, send } = deps;
  const inFlight = new Set<string>();

  async function syncOne(id: string): Promise<SyncOneResult> {
    if (inFlight.has(id)) {
      // Lớp chống trùng trong tiến trình.
      return { id, state: 'syncing', skipped: true, reason: 'Đang gửi rồi.' };
    }

    const record = outbox.get(id);
    if (record === undefined) {
      return { id, state: 'failed', reason: 'Không tìm thấy bản ghi.' };
    }
    if (!SENDABLE_STATES.includes(record.state)) {
      return {
        id,
        state: record.state,
        skipped: true,
        reason:
          'Trạng thái "' +
          record.state +
          '" không được gửi tự động — cần người dùng xử lý trước.',
      };
    }

    inFlight.add(id);
    // Ghi `syncing` xuống đĩa TRƯỚC khi gửi: app chết giữa chừng vẫn truy được.
    outbox.transition(id, 'syncing');

    try {
      const response = await send(record);
      outbox.transition(id, 'synced', { message: 'Máy chủ đã nhận.' });
      return { id, state: 'synced', response };
    } catch (raw) {
      const error = toAppError(raw);
      const { state, reason } = classifyFailure(error);
      outbox.transition(id, state, {
        errorKind: error.kind,
        httpStatus: error.status,
        errorCode: error.code,
        route: error.route,
        requestId: error.requestId,
        scanFingerprint: error.scanFingerprint,
        scanCount: error.scanCount,
        message: reason,
      });
      log.warn('Gửi bản ghi thất bại.', {
        id,
        kind: record.kind,
        errorKind: error.kind,
        status: error.status,
        code: error.code,
        route: error.route,
        requestId: error.requestId,
        scanFingerprint: error.scanFingerprint,
        scanCount: error.scanCount,
        nextState: state,
      });
      return { id, state, reason };
    } finally {
      inFlight.delete(id);
    }
  }

  return {
    syncOne,

    syncAll: async connectivity => {
      if (!canReachNetwork(connectivity)) {
        // Không đánh dấu bản ghi nào thất bại: chúng chưa hề được gửi.
        return {
          attempted: 0,
          synced: 0,
          results: [],
          haltedReason: 'Đang offline. Không gửi gì cả.',
        };
      }

      const queue = outbox
        .list()
        .filter(record => SENDABLE_STATES.includes(record.state))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      const results: SyncOneResult[] = [];
      for (const record of queue) {
        // Tuần tự, không song song: giữ thứ tự nghiệp vụ và không dồn tải server.
        results.push(await syncOne(record.id));
      }

      return {
        attempted: results.length,
        synced: results.filter(result => result.state === 'synced').length,
        results,
      };
    },

    inFlightIds: () => Array.from(inFlight),
  };
}
