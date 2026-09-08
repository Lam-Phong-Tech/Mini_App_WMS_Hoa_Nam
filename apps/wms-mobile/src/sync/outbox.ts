/**
 * Outbox — hàng đợi mutation bền vững.
 *
 * Chỉ lo **lưu trữ và vòng đời trạng thái**. Việc gửi đi nằm ở `syncEngine.ts`.
 * Tách ra để test được toàn bộ máy trạng thái mà không cần mạng.
 *
 * Bền vững qua restart: mọi thay đổi ghi thẳng xuống MMKV qua `Repository`,
 * mỗi bản ghi một khoá nguyên tử. Không có bộ đệm trong RAM nào có thể mất khi
 * app bị đóng đột ngột.
 */

import { createRepository, type Repository } from '../storage/repository';
import { getAppStorage, type KeyValueStorage } from '../storage/storage';
import { logger, type Logger } from '../logging/logger';
import {
  summarise,
  type OutboxAttempt,
  type OutboxRecord,
  type OutboxState,
  type OutboxSummary,
} from './types';

export const OUTBOX_COLLECTION = 'outbox';

/**
 * Ngưỡng **cảnh báo** số bản ghi chưa gửi — người dùng chốt 2026-09-05.
 *
 * Suy từ chính sách cảnh báo phía máy chủ mà người dùng đưa ra cho `audit_outbox`:
 * *"Warning khi ≥ 200 qua 2 chu kỳ liên tiếp, Critical khi đạt 500 hoặc tiếp tục
 * tăng"*. Áp cùng hình dạng cho hàng đợi trên máy để hai bên đọc giống nhau.
 *
 * "Qua 2 chu kỳ liên tiếp" tránh báo động giả: một ca kiểm kho lớn có thể vượt
 * 200 trong chốc lát rồi đồng bộ hết ngay.
 *
 * 🔒 Cả hai mức chỉ **cảnh báo**, tuyệt đối không kích hoạt xoá bất cứ thứ gì —
 * xem `pruneSynced` và `GATE_01 §3`.
 */
export const UNSENT_WARNING_THRESHOLD = 200;

/** Mức nghiêm trọng: đạt ngưỡng này là phải xử lý ngay, không chờ chu kỳ thứ hai. */
export const UNSENT_CRITICAL_THRESHOLD = 500;

let counter = 0;

/** Id đủ duy nhất trong phạm vi một máy. Không cần dependency uuid. */
export function generateOutboxId(now: () => number = Date.now): string {
  counter = (counter + 1) % 1_000_000;
  const random = Math.floor(Math.random() * 1_000_000);
  return (
    now().toString(36) +
    '-' +
    counter.toString(36) +
    '-' +
    random.toString(36)
  );
}

/**
 * Sinh khoá idempotency cho **một** bản ghi, đúng một lần.
 *
 * Ràng buộc từ spec WMS: khoá dài **8–100 ký tự**; cùng khoá + cùng payload →
 * máy chủ replay; cùng khoá + khác payload → **409**; sai độ dài → **422**.
 *
 * Không dùng `generateOutboxId()` cho việc này dù hai thứ nhìn giống nhau: id
 * là định danh **cục bộ trên máy**, khoá idempotency là thứ **gửi cho máy chủ**.
 * Trộn hai vai trò thì sau này đổi cách sinh id sẽ vô tình đổi cả ngữ nghĩa
 * idempotency.
 */
export function generateIdempotencyKey(
  now: () => number = Date.now,
  random: () => number = Math.random,
): string {
  const time = now().toString(36);
  const a = Math.floor(random() * 2_176_782_336).toString(36);
  const b = Math.floor(random() * 2_176_782_336).toString(36);
  // Tiền tố cho biết khoá do app này sinh, giúp tra cứu phía máy chủ.
  const key = 'wmshn-' + time + '-' + a + '-' + b;
  // Spec đòi tối thiểu 8 ký tự; tiền tố đã đảm bảo, nhưng chốt lại cho chắc.
  return key.length >= 8 ? key.slice(0, 100) : key.padEnd(8, '0');
}

export interface OutboxDeps {
  storage?: KeyValueStorage;
  log?: Logger;
  now?: () => Date;
}

export interface Outbox {
  /** Đưa một mutation vào hàng đợi ở trạng thái `pending`. */
  enqueue(input: { kind: string; payload: unknown }): OutboxRecord;
  get(id: string): OutboxRecord | undefined;
  list(): OutboxRecord[];
  listByState(state: OutboxState): OutboxRecord[];
  summary(): OutboxSummary;
  /** Đổi trạng thái và ghi lại lần thử. */
  transition(
    id: string,
    state: OutboxState,
    attempt?: Omit<OutboxAttempt, 'at' | 'resultState'>,
  ): OutboxRecord | undefined;
  /**
   * Khôi phục sau khi app khởi động lại.
   *
   * Bản ghi còn kẹt ở `syncing` nghĩa là app bị đóng **giữa lúc request đang
   * bay** — không thể biết server đã nhận hay chưa. Theo quy tắc người dùng
   * chốt, chúng chuyển sang `unknown` chứ **không** quay về `pending`: quay về
   * `pending` sẽ khiến lần đồng bộ sau gửi lại và có nguy cơ tạo bản ghi trùng.
   */
  recoverAfterRestart(): { recovered: number };
  /**
   * Xoá các bản ghi **đã `synced`** cũ hơn `olderThanMs`.
   *
   * ❌ Không bao giờ đụng tới `pending`/`failed`/`conflict`/`unknown` —
   * GATE_01 §3: "Không làm mất dữ liệu kiểm kho".
   */
  pruneSynced(olderThanMs: number): { removed: number };
  /** Chỉ dùng trong test và màn chẩn đoán. */
  clear(): void;
}

export function createOutbox(deps: OutboxDeps = {}): Outbox {
  const log = deps.log ?? logger;
  const storage = deps.storage ?? getAppStorage();
  const now = deps.now ?? (() => new Date());
  const repo: Repository<OutboxRecord> = createRepository<OutboxRecord>(
    storage,
    OUTBOX_COLLECTION,
    log,
  );

  const iso = (): string => now().toISOString();

  return {
    enqueue: ({ kind, payload }) => {
      const timestamp = iso();
      const record: OutboxRecord = {
        id: generateOutboxId(),
        kind,
        state: 'pending',
        createdAt: timestamp,
        updatedAt: timestamp,
        attemptCount: 0,
        // Sinh MỘT lần, tại đây, lúc TẠO — không phải lúc gửi. Xem chú thích
        // đầy đủ ở `OutboxRecord.idempotencyKey`. Sinh lúc gửi = phiếu trùng.
        idempotencyKey: generateIdempotencyKey(),
        payload,
      };
      repo.put(record);

      const unsent = repo
        .list()
        .filter(item => item.state !== 'synced').length;
      if (unsent >= UNSENT_CRITICAL_THRESHOLD) {
        log.error('Hàng đợi chưa gửi ở mức NGHIÊM TRỌNG.', {
          unsent,
          threshold: UNSENT_CRITICAL_THRESHOLD,
        });
      } else if (unsent >= UNSENT_WARNING_THRESHOLD) {
        log.warn('Hàng đợi chưa gửi đang lớn.', {
          unsent,
          threshold: UNSENT_WARNING_THRESHOLD,
        });
      }
      return record;
    },

    get: id => repo.get(id),
    list: () => repo.list(),
    listByState: state => repo.list().filter(record => record.state === state),
    summary: () => summarise(repo.list()),

    transition: (id, state, attempt) => {
      return repo.update(id, current => {
        const isSendAttempt = state !== 'syncing';
        return {
          ...current,
          state,
          updatedAt: iso(),
          // Chỉ đếm khi một lần gửi đã kết thúc, không đếm lúc vào `syncing`.
          attemptCount: isSendAttempt
            ? current.attemptCount + 1
            : current.attemptCount,
          lastAttempt:
            attempt === undefined
              ? current.lastAttempt
              : { ...attempt, at: iso(), resultState: state },
        };
      });
    },

    recoverAfterRestart: () => {
      const stuck = repo.list().filter(record => record.state === 'syncing');
      for (const record of stuck) {
        repo.put({
          ...record,
          state: 'unknown',
          updatedAt: iso(),
          lastAttempt: {
            at: iso(),
            resultState: 'unknown',
            message:
              'Ứng dụng bị đóng khi đang gửi. Không rõ máy chủ đã nhận hay chưa — cần kiểm tra thủ công trên WMS.',
          },
        });
      }
      if (stuck.length > 0) {
        log.warn('Có bản ghi kẹt ở trạng thái đang gửi, đã chuyển sang unknown.', {
          count: stuck.length,
        });
      }
      return { recovered: stuck.length };
    },

    pruneSynced: olderThanMs => {
      const cutoff = now().getTime() - olderThanMs;
      let removed = 0;
      for (const record of repo.list()) {
        if (record.state !== 'synced') {
          continue;
        }
        const updatedAt = Date.parse(record.updatedAt);
        if (Number.isFinite(updatedAt) && updatedAt < cutoff) {
          repo.remove(record.id);
          removed += 1;
        }
      }
      return { removed };
    },

    clear: () => repo.clear(),
  };
}
