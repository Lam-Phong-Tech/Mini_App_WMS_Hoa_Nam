/**
 * Storage abstraction.
 *
 * Ràng buộc GATE_01 Q1: dùng `react-native-mmkv` để giữ **API đồng bộ**.
 * Lý do đồng bộ quan trọng: luồng quét mã đọc/ghi state ngay trong handler sự
 * kiện bàn phím; một await ở giữa sẽ mở cửa sổ cho lần quét kế tiếp chen vào.
 *
 * Backend được tiêm vào (`StorageBackend`) để test chạy được trên Node mà không
 * cần native module — không phải để giả lập tính năng chưa làm.
 */

import { createMMKV } from 'react-native-mmkv';

/** Bề mặt tối thiểu mà tầng trên thực sự dùng. */
export interface StorageBackend {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  contains(key: string): boolean;
  getAllKeys(): string[];
}

export interface KeyValueStorage {
  getString(key: string): string | undefined;
  setString(key: string, value: string): void;
  getBoolean(key: string): boolean | undefined;
  setBoolean(key: string, value: boolean): void;
  getNumber(key: string): number | undefined;
  setNumber(key: string, value: number): void;
  getObject<T>(key: string): T | undefined;
  setObject(key: string, value: unknown): void;
  remove(key: string): void;
  has(key: string): boolean;
  keys(): string[];
}

export function createStorage(backend: StorageBackend): KeyValueStorage {
  return {
    getString: key => backend.getString(key),
    setString: (key, value) => backend.set(key, value),

    getBoolean: key => {
      const raw = backend.getString(key);
      if (raw === undefined) {
        return undefined;
      }
      return raw === 'true';
    },
    setBoolean: (key, value) => backend.set(key, value ? 'true' : 'false'),

    getNumber: key => {
      const raw = backend.getString(key);
      if (raw === undefined) {
        return undefined;
      }
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : undefined;
    },
    setNumber: (key, value) => backend.set(key, String(value)),

    getObject: <T>(key: string): T | undefined => {
      const raw = backend.getString(key);
      if (raw === undefined) {
        return undefined;
      }
      try {
        return JSON.parse(raw) as T;
      } catch {
        // Dữ liệu hỏng thì coi như chưa có, không làm sập ứng dụng.
        return undefined;
      }
    },
    setObject: (key, value) => backend.set(key, JSON.stringify(value)),

    remove: key => backend.delete(key),
    has: key => backend.contains(key),
    keys: () => backend.getAllKeys(),
  };
}

/** Backend trong bộ nhớ — dùng cho unit test. */
export function createMemoryBackend(
  seed: Record<string, string> = {},
): StorageBackend {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getString: key => map.get(key),
    set: (key, value) => {
      map.set(key, value);
    },
    delete: key => {
      map.delete(key);
    },
    contains: key => map.has(key),
    getAllKeys: () => Array.from(map.keys()),
  };
}

/**
 * Backend thật.
 *
 * ⚠️ Chưa bật mã hoá: `MMKV` nhận `encryptionKey`, nhưng khoá phải sinh và giữ
 * trong Android Keystore. Việc đó chưa nằm trong phạm vi Prompt 2 và chưa làm.
 * Vì vậy KHÔNG lưu mật khẩu hay dữ liệu nhạy cảm dài hạn qua storage này —
 * xem docs/migration/02-architecture.md §"Hạn chế đã biết".
 */
function createMmkvBackend(id: string): StorageBackend {
  // MMKV v4 tạo instance qua `createMMKV`, không còn `new MMKV`.
  const instance = createMMKV({ id });
  return {
    getString: key => instance.getString(key),
    set: (key, value) => instance.set(key, value),
    // `remove` trả về boolean; backend chỉ cần hiệu ứng phụ.
    delete: key => {
      instance.remove(key);
    },
    contains: key => instance.contains(key),
    getAllKeys: () => instance.getAllKeys(),
  };
}

let appStorageInstance: KeyValueStorage | undefined;

/** Storage dùng chung của ứng dụng. Tạo trễ để test không chạm native module. */
export function getAppStorage(): KeyValueStorage {
  if (appStorageInstance === undefined) {
    appStorageInstance = createStorage(createMmkvBackend('wms.app'));
  }
  return appStorageInstance;
}

/** Chỉ dùng trong test để tiêm backend bộ nhớ. */
export function setAppStorageForTesting(
  storage: KeyValueStorage | undefined,
): void {
  appStorageInstance = storage;
}
