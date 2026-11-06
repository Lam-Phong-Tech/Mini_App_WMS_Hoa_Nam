// Native fixture callbacks do not establish optical/physical device PASS.
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { Camera } from 'react-native-camera-kit';
import { AppProviders } from '../src/app/App';
import { Button } from '../src/ui/Button';
import { DocumentSearchCamera } from '../src/features/documents/p12/DocumentSearchCamera';
const mockPermission = {
  state: 'granted',
  request: jest.fn(async () => undefined),
  recheck: jest.fn(async (): Promise<void> => undefined),
};
let mockAllowed = true,
  mockFocused = true;
const mockRecheckTier = jest.fn();
jest.mock('react-native-camera-kit', () => ({
  Camera: 'NativeDocumentCamera',
  CameraType: { Back: 'back' },
}));
jest.mock('../src/scanner/useCameraPermission', () => ({
  useCameraPermission: () => mockPermission,
}));
jest.mock('../src/services/wms/useDeploymentTier', () => ({
  useDeploymentTier: () => ({ allowed: mockAllowed, recheck: mockRecheckTier }),
}));
jest.mock('../src/navigation/useIsScreenFocused', () => ({
  useIsScreenFocused: () => mockFocused,
}));
const originalAppState = AppState.currentState;
let tree: Renderer.ReactTestRenderer, lifecycle: (state: string) => void;
const read = jest.fn(() => true),
  manual = jest.fn(),
  cancel = jest.fn();
const props = {
  disabled: false,
  onRead: read,
  onManual: manual,
  onCancel: cancel,
};
beforeEach(() => {
  AppState.currentState = 'active';
  mockPermission.state = 'granted';
  mockAllowed = true;
  mockFocused = true;
  jest.clearAllMocks();
  mockPermission.recheck.mockImplementation(async () => undefined);
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_name, callback: any) => {
      lifecycle = callback;
      return { remove: jest.fn() };
    });
});
afterEach(async () => {
  if (tree) await act(() => tree.unmount());
  jest.restoreAllMocks();
  AppState.currentState = originalAppState;
});
async function mount(disabled = false, arm = true) {
  await act(() => {
    tree = Renderer.create(
      <AppProviders>
        <DocumentSearchCamera {...props} disabled={disabled} />
      </AppProviders>,
    );
  });
  if (
    arm &&
    !disabled &&
    mockAllowed &&
    mockFocused &&
    mockPermission.state === 'granted'
  )
    await press('Bật camera');
}
const event = (value: string) => ({
  nativeEvent: { codeStringValue: value, codeFormat: 'qr' },
});
async function press(label: string) {
  await act(async () => {
    tree.root
      .findAllByType(Button)
      .find(n => n.props.label === label)!
      .props.onPress();
  });
}
test('uses existing permission only, never automatically asks, captures or uploads', async () => {
  await mount(false, false);
  expect(tree.root.findAllByType(Camera)).toHaveLength(0);
  await press('Bật camera');
  expect(tree.root.findAllByType(Camera)).toHaveLength(1);
  expect(mockPermission.request).not.toHaveBeenCalled();
  expect(tree.root.findByType(Camera).props.capture).toBeUndefined();
  expect(read).not.toHaveBeenCalled();
});
test.each(['denied', 'checking', 'blocked', 'unavailable'])(
  'permission %s never enables preview or auto-asks',
  async state => {
    mockPermission.state = state;
    await mount();
    expect(tree.root.findAllByType(Camera)).toHaveLength(0);
    expect(mockPermission.request).not.toHaveBeenCalled();
  },
);
test('only explicit permission intent requests once; no denied auto-loop', async () => {
  mockPermission.state = 'denied';
  await mount();
  await press('Xin quyền camera');
  expect(mockPermission.request).toHaveBeenCalledTimes(1);
  expect(tree.root.findAllByType(Camera)).toHaveLength(0);
});
test.each(['tier', 'focus', 'disabled'])('%s gate stops camera', async gate => {
  if (gate === 'tier') mockAllowed = false;
  if (gate === 'focus') mockFocused = false;
  await mount(gate === 'disabled');
  expect(tree.root.findAllByType(Camera)).toHaveLength(0);
  expect(read).not.toHaveBeenCalled();
});
test('latches same and different consecutive frames after one accepted opaque code', async () => {
  await mount();
  const callback = tree.root.findByType(Camera).props.onReadCode;
  await act(() => {
    callback(event(' PN-001 '));
    callback(event('PN-001'));
    callback(event('PN-002'));
  });
  expect(read).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledWith('PN-001');
  expect(tree.root.findAllByType(Camera)).toHaveLength(0);
});
test('unsupported URL is not followed/searched; a later valid code still works', async () => {
  await mount();
  const callback = tree.root.findByType(Camera).props.onReadCode;
  await act(() => callback(event('https://external.invalid/qr?token=x')));
  expect(read).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('QR chứa liên kết');
  await act(() => callback(event('PN-001')));
  expect(read).toHaveBeenCalledWith('PN-001');
});
test('background stops capture; foreground waits recheck and rejects the old preview', async () => {
  await mount();
  const stale = tree.root.findByType(Camera).props.onReadCode;
  await act(() => lifecycle('background'));
  expect(tree.root.findAllByType(Camera)).toHaveLength(0);
  let resolve!: () => void;
  mockPermission.recheck.mockImplementationOnce(
    () =>
      new Promise<void>(r => {
        resolve = r;
      }),
  );
  await act(() => lifecycle('active'));
  expect(tree.root.findAllByType(Camera)).toHaveLength(0);
  await act(async () => {
    resolve();
  });
  expect(tree.root.findAllByType(Camera)).toHaveLength(1);
  await act(() => stale(event('PN-OLD')));
  expect(read).not.toHaveBeenCalled();
  await act(() =>
    tree.root.findByType(Camera).props.onReadCode(event('PN-NEW')),
  );
  expect(read).toHaveBeenCalledWith('PN-NEW');
});
test('manual transition and unmount reject late frames immediately', async () => {
  await mount();
  const callback = tree.root.findByType(Camera).props.onReadCode;
  await press('Dùng đầu đọc / nhập tay');
  expect(manual).toHaveBeenCalledTimes(1);
  await act(() => callback(event('PN-LATE')));
  expect(read).not.toHaveBeenCalled();
  await act(() => tree.unmount());
  callback(event('PN-LATER'));
  expect(read).not.toHaveBeenCalled();
});
test('camera errors hide SDK details, stop preview; explicit retry invalidates the old preview', async () => {
  await mount();
  const callback = tree.root.findByType(Camera).props.onReadCode;
  await act(() =>
    tree.root.findByType(Camera).props.onError({
      nativeEvent: { errorMessage: 'private native detail' },
    }),
  );
  expect(tree.root.findAllByType(Camera)).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).not.toContain('private native detail');
  await press('Thử lại camera');
  expect(tree.root.findAllByType(Camera)).toHaveLength(1);
  callback(event('PN-OLD'));
  expect(read).not.toHaveBeenCalled();
});
test('StrictMode lifecycle replay does not permanently silence the current preview', async () => {
  await act(() => {
    tree = Renderer.create(
      <React.StrictMode>
        <AppProviders>
          <DocumentSearchCamera {...props} />
        </AppProviders>
      </React.StrictMode>,
    );
  });
  await press('Bật camera');
  await act(() =>
    tree.root.findByType(Camera).props.onReadCode(event('PN-CURRENT')),
  );
  expect(read).toHaveBeenCalledTimes(1);
});
