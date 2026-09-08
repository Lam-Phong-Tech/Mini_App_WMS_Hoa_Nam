/**
 * Repository abstraction trên nền key-value.
 *
 * Vì sao mỗi bản ghi là **một khoá duy nhất** chứa một JSON blob:
 * MMKV bảo đảm ghi nguyên tử ở mức từng khoá, nhưng KHÔNG có transaction nhiều
 * khoá. Nhồi trọn bản ghi vào một khoá là cách duy nhất ở thư viện này để
 * "tránh ghi dở dang" (Prompt 3 §C) — hoặc bản ghi cũ còn nguyên, hoặc bản ghi
 * mới đã trọn vẹn, không có trạng thái ở giữa.
 *
 * Hệ quả có chủ đích: KHÔNG có file index riêng. Index tách rời sẽ tạo ra đúng
 * cái ghi-hai-khoá mà ta đang tránh, và lệch index là mất dấu bản ghi. Danh sách
 * được dựng bằng cách quét khoá theo tiền tố — chấp nhận được ở quy mô hàng đợi
 * kho (hàng trăm bản ghi), và không bao giờ lệch với dữ liệu thật.
 */

import type { KeyValueStorage } from './storage';
import { logger, type Logger } from '../logging/logger';

export interface Identifiable {
  readonly id: string;
}

export interface Repository<T extends Identifiable> {
  get(id: string): T | undefined;
  /** Mọi bản ghi đọc được. Bản ghi hỏng JSON bị bỏ qua và ghi log. */
  list(): T[];
  /** Ghi đè trọn vẹn một bản ghi. Nguyên tử ở mức khoá. */
  put(record: T): void;
  /**
   * Đọc–sửa–ghi trên một bản ghi.
   * Trả về bản ghi mới, hoặc `undefined` nếu không tìm thấy id.
   */
  update(id: string, mutate: (current: T) => T): T | undefined;
  remove(id: string): void;
  count(): number;
  /** Chỉ dùng khi thực sự cần dọn sạch collection. */
  clear(): void;
}

/** Ký tự phân tách tiền tố. Không xuất hiện trong id do `assertSafeId` chặn. */
const SEPARATOR = '/';

function assertSafeId(id: string): void {
  if (id.length === 0) {
    throw new Error('Repository: id rỗng.');
  }
  if (id.includes(SEPARATOR)) {
    // Cho phép sẽ khiến id này đè lên vùng khoá của collection khác.
    throw new Error('Repository: id không được chứa "' + SEPARATOR + '": ' + id);
  }
}

export function createRepository<T extends Identifiable>(
  storage: KeyValueStorage,
  collection: string,
  log: Logger = logger,
): Repository<T> {
  const prefix = collection + SEPARATOR;
  const keyFor = (id: string): string => {
    assertSafeId(id);
    return prefix + id;
  };

  const readAtKey = (key: string): T | undefined => {
    const value = storage.getObject<T>(key);
    if (value === undefined) {
      // `getObject` đã nuốt lỗi JSON. Phân biệt "không có" với "hỏng" ở đây.
      if (storage.has(key)) {
        log.error('Bản ghi hỏng JSON, bỏ qua.', { key });
      }
      return undefined;
    }
    return value;
  };

  const keysOfCollection = (): string[] =>
    storage.keys().filter(key => key.startsWith(prefix));

  return {
    get: id => readAtKey(keyFor(id)),

    list: () => {
      const records: T[] = [];
      for (const key of keysOfCollection()) {
        const record = readAtKey(key);
        if (record !== undefined) {
          records.push(record);
        }
      }
      return records;
    },

    put: record => {
      storage.setObject(keyFor(record.id), record);
    },

    update: (id, mutate) => {
      const key = keyFor(id);
      const current = readAtKey(key);
      if (current === undefined) {
        return undefined;
      }
      const next = mutate(current);
      if (next.id !== id) {
        throw new Error(
          'Repository: update không được đổi id (' + id + ' -> ' + next.id + ').',
        );
      }
      storage.setObject(key, next);
      return next;
    },

    remove: id => {
      storage.remove(keyFor(id));
    },

    count: () => keysOfCollection().length,

    clear: () => {
      for (const key of keysOfCollection()) {
        storage.remove(key);
      }
    },
  };
}
