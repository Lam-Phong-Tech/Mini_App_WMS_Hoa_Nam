/**
 * Schema version + migration cho dữ liệu local.
 *
 * Vì sao cần: MMKV là key-value phẳng, không có schema. Khi hình dạng dữ liệu
 * đổi ở bản sau, dữ liệu cũ trên máy người dùng vẫn còn. Không có migration thì
 * hoặc app crash khi đọc, hoặc phải xoá sạch — mà GATE_01 §3 yêu cầu
 * "Không làm mất dữ liệu kiểm kho khi mất mạng hoặc ứng dụng bị đóng".
 *
 * Nguyên tắc:
 *  - Migration chạy **một lần lúc khởi động**, trước khi bất kỳ repository nào đọc.
 *  - Mỗi migration đi từ đúng một version lên version kế tiếp.
 *  - Migration phải chịu được việc chạy trên dữ liệu rỗng (máy mới cài).
 *  - Migration KHÔNG được ném lỗi ra ngoài làm sập app; lỗi được ghi lại và
 *    version giữ nguyên để lần sau thử lại.
 */

import type { KeyValueStorage } from './storage';
import { logger, type Logger } from '../logging/logger';

/** Khoá lưu version hiện tại của dữ liệu trên máy. */
export const SCHEMA_VERSION_KEY = 'schema.version';

/**
 * Version schema mà bản code này mong đợi.
 *
 * Lịch sử:
 *   1 — Prompt 3: thêm outbox đồng bộ (`outbox.*`).
 */
export const CURRENT_SCHEMA_VERSION = 1;

export interface Migration {
  /** Version mà migration này nâng lên. Chạy khi version hiện tại = `to - 1`. */
  readonly to: number;
  readonly description: string;
  readonly run: (storage: KeyValueStorage) => void;
}

/**
 * Danh sách migration, phải xếp tăng dần theo `to`.
 *
 * Migration lên version 1 cố tình **không làm gì**: máy đã cài bản Prompt 2
 * chỉ có `config.environment` và khoá phiên — cả hai đều còn hợp lệ nguyên vẹn.
 * Nó tồn tại để đóng mốc version, không phải chỗ giữ chỗ cho việc chưa làm.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    to: 1,
    description:
      'Đóng mốc schema v1. Dữ liệu Prompt 2 (config.environment, khoá phiên) giữ nguyên, không cần biến đổi.',
    run: () => {
      // Không có gì phải chuyển đổi — xem chú thích ở trên.
    },
  },
];

export interface MigrationOutcome {
  readonly from: number;
  readonly to: number;
  /** Số migration đã chạy thành công trong lần gọi này. */
  readonly applied: number;
  /** Migration đầu tiên bị lỗi, nếu có. Version sẽ dừng ngay trước nó. */
  readonly failedAt?: number;
}

export function readSchemaVersion(storage: KeyValueStorage): number {
  const raw = storage.getNumber(SCHEMA_VERSION_KEY);
  if (raw === undefined || !Number.isInteger(raw) || raw < 0) {
    // Chưa có mốc nào -> coi như máy mới, bắt đầu từ 0.
    return 0;
  }
  return raw;
}

/**
 * Chạy toàn bộ migration còn thiếu, theo thứ tự.
 *
 * Dừng ngay tại migration đầu tiên ném lỗi và **không** nâng version qua nó —
 * để lần khởi động sau thử lại thay vì bỏ qua âm thầm.
 */
export function runMigrations(
  storage: KeyValueStorage,
  migrations: readonly Migration[] = MIGRATIONS,
  log: Logger = logger,
): MigrationOutcome {
  const from = readSchemaVersion(storage);

  if (from > CURRENT_SCHEMA_VERSION) {
    // Người dùng vừa hạ cấp app. Không đoán cách hạ dữ liệu — để nguyên.
    log.warn('Schema trên máy mới hơn bản app đang chạy; bỏ qua migration.', {
      onDevice: from,
      appExpects: CURRENT_SCHEMA_VERSION,
    });
    return { from, to: from, applied: 0 };
  }

  const pending = migrations
    .filter(migration => migration.to > from)
    .slice()
    .sort((a, b) => a.to - b.to);

  let current = from;
  let applied = 0;

  for (const migration of pending) {
    try {
      migration.run(storage);
      current = migration.to;
      storage.setNumber(SCHEMA_VERSION_KEY, current);
      applied += 1;
    } catch (error) {
      log.error('Migration thất bại, dừng tại đây.', {
        to: migration.to,
        description: migration.description,
        error,
      });
      return { from, to: current, applied, failedAt: migration.to };
    }
  }

  return { from, to: current, applied };
}
