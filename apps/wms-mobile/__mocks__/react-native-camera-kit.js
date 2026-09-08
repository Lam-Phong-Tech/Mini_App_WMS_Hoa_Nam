/**
 * Mock tầng native của `react-native-camera-kit` cho Jest.
 *
 * Lý do tồn tại — giống hệt lý do của `react-native-mmkv` và `netinfo`:
 * gói này là native module, Node của Jest không nạp được. Mock chỉ thay
 * **tầng native**, KHÔNG thay logic nào của ứng dụng.
 *
 * Toàn bộ logic camera có thể test được đã tách ra ba module thuần và được
 * kiểm chứng thật trong `__tests__/cameraScan.test.ts`:
 *   - `scanner/cameraFormats.ts`   — ánh xạ định dạng
 *   - `scanner/cameraScanGuard.ts` — chống callback trùng
 *   - `scanner/cameraPermission.ts` — máy trạng thái quyền
 *
 * ❌ Mock này KHÔNG được dùng để tuyên bố "camera đã hoạt động"
 * (Prompt 3 cấm). Việc camera đọc được mã thật chỉ kiểm chứng được trên
 * thiết bị — xem docs/migration/03-device-test-matrix.md.
 */

const React = require('react');

const CameraType = { Front: 'front', Back: 'back' };

/** Chỉ render một view rỗng; không có khung xem thật trong Jest. */
const Camera = React.forwardRef((props, ref) => {
  React.useImperativeHandle(ref, () => ({
    capture: async () => {
      throw new Error('capture() không được gọi trong test.');
    },
    requestDeviceCameraAuthorization: async () => false,
    checkDeviceCameraAuthorizationStatus: async () => false,
  }));
  return React.createElement('CameraKitCamera', props, props.children);
});
Camera.displayName = 'MockCameraKitCamera';

module.exports = {
  __esModule: true,
  default: {
    requestDeviceCameraAuthorization: async () => false,
    checkDeviceCameraAuthorizationStatus: async () => false,
  },
  Camera,
  CameraType,
  Orientation: {
    PORTRAIT: 0,
    LANDSCAPE_LEFT: 1,
    PORTRAIT_UPSIDE_DOWN: 2,
    LANDSCAPE_RIGHT: 3,
  },
};
