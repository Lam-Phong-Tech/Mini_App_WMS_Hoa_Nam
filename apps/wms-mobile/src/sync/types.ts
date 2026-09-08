/**
 * Hàng đợi đồng bộ — kiểu dữ liệu và máy trạng thái.
 *
 * ⚠️ Hai quy tắc dưới đây do **người dùng chốt ngày 2026-09-05**, không phải do
 * tôi tự đặt (Prompt 3 cấm tự đặt quy tắc xung đột/idempotency):
 *
 *  1. **Chống trùng phía client, KHÔNG tự retry.** Một bản ghi chỉ có đúng một
 *     request bay cùng lúc. Gặp timeout → đánh dấu `unknown`, DỪNG, để người
 *     dùng tự kiểm tra trên WMS rồi quyết định. Không giả định gì về server.
 *  2. **Không bao giờ tự giải quyết xung đột.** Server báo xung đột → đánh dấu
 *     `conflict`, giữ nguyên dữ liệu local, đưa người dùng quyết định.
 *
 * Ghi ở GATE_01 §0b (nới ràng buộc) và docs/migration/03-offline-sync.md.
 */

/**
 * Trạng thái vòng đời của một bản ghi trong outbox.
 *
 * ```
 *   pending ──(người dùng bấm đồng bộ)──> syncing
 *                                            │
 *              ┌────────────┬────────────┬───┴────────┬─────────────┐
 *              ▼            ▼            ▼            ▼             ▼
 *           synced       failed      conflict     unknown       pending
 *          (2xx)      (lỗi nghiệp   (409/412)   (timeout —    (chưa gửi đi:
 *                       vụ 4xx)                  đã gửi,      offline, config,
 *                                                không rõ)     bị Gate chặn)
 * ```
 *
 * `synced` là trạng thái cuối duy nhất được coi là thành công.
 * `unknown` và `conflict` **bắt buộc** cần người dùng can thiệp — không có
 * đường tự động nào đi ra khỏi hai trạng thái này.
 */
export type OutboxState =
  | 'pending'
  | 'syncing'
  | 'synced'
  | 'failed'
  | 'conflict'
  | 'unknown';

/** Các trạng thái mà người dùng bấm "đồng bộ" sẽ thử gửi. */
export const SENDABLE_STATES: readonly OutboxState[] = ['pending', 'failed'];

/**
 * Trạng thái cần người dùng can thiệp thủ công.
 * Đồng bộ tự động KHÔNG bao giờ đụng vào các bản ghi này.
 */
export const NEEDS_ATTENTION_STATES: readonly OutboxState[] = [
  'conflict',
  'unknown',
];

export interface OutboxAttempt {
  /** ISO-8601. */
  readonly at: string;
  readonly resultState: OutboxState;
  /** `AppError.kind` của lần thử, nếu thất bại. */
  readonly errorKind?: string;
  readonly httpStatus?: number;
  /** Mã lỗi nghiệp vụ server trả về, nếu đọc được. */
  readonly errorCode?: string;
  /** Route và request ID để đối chiếu trực tiếp log WMS. */
  readonly route?: string;
  readonly requestId?: string;
  /** Không lưu QR thô vào log: chỉ giữ vân tay một chiều của cả lô. */
  readonly scanFingerprint?: string;
  readonly scanCount?: number;
  /** Thông điệp đã được rút gọn cho người vận hành. */
  readonly message?: string;
}

/**
 * Một mutation chờ gửi.
 *
 * `endpoint`/`method`/`payload` cố tình để **mờ** ở tầng này: hàng đợi không
 * biết gì về nghiệp vụ kho. Việc gắn vào endpoint thật thuộc Prompt 4 và chỉ
 * được làm sau khi `GATE_WMS_API_INTEGRATION` PASS.
 */
export interface OutboxRecord {
  readonly id: string;
  /** Loại nghiệp vụ, ví dụ 'RECEIPT_DRAFT'. Do tầng gọi đặt, không đoán. */
  readonly kind: string;
  readonly state: OutboxState;
  /** ISO-8601 lúc bản ghi được tạo trên máy. */
  readonly createdAt: string;
  /** ISO-8601 lần đổi trạng thái gần nhất. */
  readonly updatedAt: string;
  /** Số lần đã thực sự gửi đi. Chỉ để hiển thị, KHÔNG dùng để tự retry. */
  readonly attemptCount: number;
  /** Lần thử gần nhất — Prompt 3 §D "Giữ lỗi cuối cùng để hỗ trợ kiểm tra". */
  readonly lastAttempt?: OutboxAttempt;
  /**
   * Khoá idempotency của bản ghi này. **Sinh MỘT lần lúc đưa vào hàng đợi và
   * không bao giờ đổi**, kể cả qua nhiều lần gửi lại hay khởi động lại app.
   *
   * 🔒 **Quy tắc do người dùng chốt 2026-09-05:**
   * *"Không tự tạo Idempotency-Key mới để gửi lại. Khi retry phải dùng lại
   * đúng Idempotency-Key cũ."*
   *
   * Vì sao đây là chỗ dễ sai chết người: nếu khoá được sinh lúc **gửi** thay vì
   * lúc **tạo**, thì mỗi lần gửi lại mang một khoá khác ⇒ máy chủ coi là hai
   * request khác nhau ⇒ **hai phiếu nhập cho cùng một lô hàng**. Đúng cái mà
   * idempotency sinh ra để chặn.
   *
   * ⚠️ Trường này chỉ **lưu**, chưa được **gửi**: `GATE_01 §11` #6 vẫn cấm gắn
   * header `Idempotency-Key`, và `api/client.ts` cưỡng chế lệnh cấm đó. Lưu sẵn
   * để khi Gate mở thì khoá đã ổn định từ đầu, không phải chế thêm.
   */
  readonly idempotencyKey: string;
  /** Dữ liệu nghiệp vụ, do tầng gọi định hình. */
  readonly payload: unknown;
}

export interface OutboxSummary {
  readonly total: number;
  readonly pending: number;
  readonly syncing: number;
  readonly synced: number;
  readonly failed: number;
  readonly conflict: number;
  readonly unknown: number;
  /** `conflict + unknown` — số bản ghi bắt buộc cần người dùng xử lý. */
  readonly needsAttention: number;
}

export function summarise(records: readonly OutboxRecord[]): OutboxSummary {
  const count = (state: OutboxState): number =>
    records.filter(record => record.state === state).length;

  const conflict = count('conflict');
  const unknownCount = count('unknown');

  return {
    total: records.length,
    pending: count('pending'),
    syncing: count('syncing'),
    synced: count('synced'),
    failed: count('failed'),
    conflict,
    unknown: unknownCount,
    needsAttention: conflict + unknownCount,
  };
}
