import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState, View } from 'react-native';
import { P09NativeCamera } from '../src/features/warranty/P09NativeCamera';
jest.mock('react-native-camera-kit', () => ({
  Camera: 'Camera',
  CameraType: { Back: 'back' },
}));
jest.mock('../src/scanner/useCameraPermission', () => ({
  useCameraPermission: () => ({ state: 'granted', request: jest.fn() }),
}));
jest.mock('../src/navigation/useIsScreenFocused', () => ({
  useIsScreenFocused: () => true,
}));
jest.mock('../src/services/wms/useDeploymentTier', () => ({
  useDeploymentTier: () => ({ allowed: true }),
}));

let tree: Renderer.ReactTestRenderer;
let state: any;
let lifecycle: (next: string) => void;
const onRead = jest.fn();
const renderSurface = (next: any) => {
  state = next;
  return <View>{next.camera}</View>;
};
const props = { manual: false, disabled: false, onRead, renderSurface };
beforeEach(() => {
  AppState.currentState = 'active';
  onRead.mockClear();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener: any) => {
      lifecycle = listener;
      return { remove: jest.fn() };
    });
});
afterEach(async () => {
  if (tree) await act(() => tree.unmount());
  jest.restoreAllMocks();
});
async function mount() {
  await act(() => {
    tree = Renderer.create(<P09NativeCamera {...props} />);
  });
}
it('starts camera directly when permission/tier allow and releases it for manual entry', async () => {
  await mount();
  expect(state.camera).toBeDefined();
  await act(async () => {
    await state.onActivate();
  });
  expect(state.camera).toBeDefined();
  await act(() => tree.update(<P09NativeCamera {...props} manual />));
  expect(state.camera).toBeUndefined();
  expect(state.onTorch).toBeUndefined();
});
it('stops preview in background, resumes on return and respects disabled owner state', async () => {
  await mount();
  await act(async () => {
    await state.onActivate();
  });
  await act(() => lifecycle('background'));
  expect(state.camera).toBeUndefined();
  await act(() => lifecycle('active'));
  expect(state.camera).toBeDefined();
  await act(() => tree.update(<P09NativeCamera {...props} disabled />));
  expect(state.camera).toBeUndefined();
});
it('latches repeated camera callbacks and transfers the unchanged code exactly once', async () => {
  await mount();
  await act(async () => {
    await state.onActivate();
  });
  const callback = state.camera.props.onReadCode;
  const event = {
    nativeEvent: { codeStringValue: 'HN12345', codeFormat: 'qr' },
  };
  await act(() => {
    callback(event);
    callback(event);
  });
  expect(onRead).toHaveBeenCalledTimes(1);
  expect(onRead).toHaveBeenCalledWith('HN12345');
  expect(state.camera).toBeUndefined();
});
it('ignores a late camera callback after the user leaves the screen', async () => {
  await mount();
  await act(async () => {
    await state.onActivate();
  });
  const callback = state.camera.props.onReadCode;
  await act(() => tree.unmount());
  callback({ nativeEvent: { codeStringValue: 'HN12345', codeFormat: 'qr' } });
  expect(onRead).not.toHaveBeenCalled();
});
