import type { KeyValueStorage } from '../storage/storage';
/** Optimistic per-journal lease. Every read/write compares the original bytes;
 * a second tab/controller editing during an async owner read is never replaced. */
export function draftSaveStorage(
  store: KeyValueStorage,
  keys: string[],
  prefix = '',
): KeyValueStorage {
  const expected = new Map(keys.map(key => [key, store.getString(key)]));
  const check = (key: string) => {
    if (!expected.has(key) || store.getString(key) !== expected.get(key))
      throw Error(
        'Nháp đã được thay đổi ở màn khác. Giữ dữ liệu mới; xác nhận lại trước khi lưu.',
      );
  };
  const protectedKey = (key: string) => !prefix || key.startsWith(prefix);
  const getString = (key: string) => {
    if (protectedKey(key)) check(key);
    return store.getString(key);
  };
  const setString = (key: string, value: string) => {
    if (protectedKey(key)) check(key);
    store.setString(key, value);
    if (protectedKey(key)) expected.set(key, value);
  };
  return {
    ...store,
    getString,
    getObject<T>(key: string) {
      if (protectedKey(key)) check(key);
      return store.getObject<T>(key);
    },
    keys() {
      return store
        .keys()
        .filter(key => !protectedKey(key) || expected.has(key));
    },
    has(key) {
      if (protectedKey(key)) check(key);
      return store.has(key);
    },
    getBoolean(key) {
      const value = getString(key);
      return value === undefined ? undefined : value === 'true';
    },
    getNumber(key) {
      const value = getString(key);
      if (value === undefined) return;
      const n = Number(value);
      return Number.isFinite(n) ? n : undefined;
    },
    setBoolean(key, value) {
      setString(key, value ? 'true' : 'false');
    },
    setNumber(key, value) {
      setString(key, String(value));
    },
    setString,
    setObject(key, value) {
      setString(key, JSON.stringify(value));
    },
    remove() {
      throw Error('Lưu nháp không được xóa định danh.');
    },
  };
}
