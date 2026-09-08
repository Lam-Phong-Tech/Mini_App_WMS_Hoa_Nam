/**
 * Mock của `@react-native-community/netinfo` cho Jest.
 * Chỉ thay tầng native khi chạy test; trạng thái trả về là "chưa xác định" để
 * test không vô tình phụ thuộc vào mạng thật.
 */

const state = {
  isConnected: false,
  isInternetReachable: null,
  type: 'unknown',
};

module.exports = {
  __esModule: true,
  default: {
    fetch: () => Promise.resolve(state),
    addEventListener: () => () => {},
  },
  fetch: () => Promise.resolve(state),
  addEventListener: () => () => {},
};
