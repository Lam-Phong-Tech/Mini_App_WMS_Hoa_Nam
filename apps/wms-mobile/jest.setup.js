/* eslint-env jest */
// Node cannot load Keychain/Keystore. Keep only the native storage boundary in
// memory; the real JS session/refresh/serialization logic remains under test.
// A missing-module test deletes this port and still exercises the native guard.
{
  const {NativeModules}=require('react-native');
  let refreshToken=null;
  NativeModules.WmsSecureSession={
    getRefreshToken:async()=>refreshToken,
    setRefreshToken:async value=>{refreshToken=value;},
    clearRefreshToken:async()=>{refreshToken=null;},
  };
}
/**
 * Thiết lập Jest.
 *
 * Chỉ thay các module **native** không nạp được trong Node. Không mock bất kỳ
 * logic nghiệp vụ hay tầng nền nào của ứng dụng.
 */

// Mock chính thức của thư viện đặt toàn bộ export dưới `default`,
// nên phải lấy `.default` thì các named export mới hiện ra.
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

// Native view only; no decoder/permission/optical success is simulated here.
// Individual camera tests still inject and assert native callback behaviour.
jest.mock('react-native-camera-kit', () => {
  const React = require('react');
  return {
    Camera: props => React.createElement('NativeCameraBridge', props),
    CameraType: { Back: 'back', Front: 'front' },
  };
});

/**
 * `react-native-image-picker` la module native — nap trong Node se vo.
 *
 * Mock cho nem loi neu bi goi that: moi test chon anh deu **tiem** ban gia rieng
 * qua `PickerDeps`, nen hai ham nay khong bao gio duoc goi that. Nem loi ro rang
 * hon la im lang tra `undefined`.
 */
jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(() => {
    throw new Error('Test phai tiem PickerDeps.fromLibrary, khong goi that.');
  }),
  launchCamera: jest.fn(() => {
    throw new Error('Test phai tiem PickerDeps.fromCamera, khong goi that.');
  }),
}));

// Unit/component test phải truyền HTTP giả qua dependency injection. Chặn mạng
// thật ở đây để một effect vô tình mount không làm Jest giữ socket sau khi các
// assertion đã xong; test nào cần phản hồi mạng phải tự tiêm nó.
global.fetch = jest.fn(async () => {
  throw new Error('Test không được gọi HTTP thật. Hãy tiêm fetch/get giả.');
});
