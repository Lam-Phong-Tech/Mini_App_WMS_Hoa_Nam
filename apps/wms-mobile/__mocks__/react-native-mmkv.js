/**
 * Mock của `react-native-mmkv` cho Jest.
 *
 * MMKV v4 là Nitro module (C++) và phát hành dưới dạng ESM, không nạp được
 * trong môi trường Node của Jest. Mock này chỉ thay **hạ tầng lưu trữ** khi
 * chạy test — không thay thế hay che giấu tính năng nào của ứng dụng.
 *
 * Bề mặt phải khớp phần `StorageBackend` thực dùng trong src/storage/storage.ts:
 * `getString`, `set`, `remove`, `contains`, `getAllKeys`.
 */

function createMMKV() {
  const store = new Map();

  return {
    getString(key) {
      return store.get(key);
    },
    set(key, value) {
      store.set(key, String(value));
    },
    remove(key) {
      return store.delete(key);
    },
    contains(key) {
      return store.has(key);
    },
    getAllKeys() {
      return Array.from(store.keys());
    },
    clearAll() {
      store.clear();
    },
  };
}

module.exports = { createMMKV };
