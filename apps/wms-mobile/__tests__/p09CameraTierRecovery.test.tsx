// Native camera recovery after a transient health failure; no owner commands.
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState, View } from 'react-native';
import { apiClient, type ApiResponse } from '../src/api/client';
import { TIER_RESPONSE_HEADER } from '../src/config/deployment';
import { P09NativeCamera } from '../src/features/warranty/P09NativeCamera';
import {
  checkDeploymentTier,
  getLastTierCheck,
  resetTierCheckForTesting,
} from '../src/services/wms/tierCheck';

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

let tree: Renderer.ReactTestRenderer | undefined;
let surface: Parameters<
  Parameters<typeof P09NativeCamera>[0]['renderSurface']
>[0];
const onRead = jest.fn();
const response = (tier?: string): ApiResponse<unknown> => ({
  status: 200,
  data: {},
  header: name => (name === TIER_RESPONSE_HEADER ? tier : undefined),
});
beforeEach(() => {
  resetTierCheckForTesting();
  AppState.currentState = 'active';
  onRead.mockClear();
});
afterEach(async () => {
  if (tree) await act(() => tree!.unmount());
  tree = undefined;
  jest.restoreAllMocks();
  resetTierCheckForTesting();
});
async function mount() {
  await act(async () => {
    tree = Renderer.create(
      <P09NativeCamera
        manual={false}
        disabled={false}
        onRead={onRead}
        renderSurface={next => {
          surface = next;
          return <View>{next.camera}</View>;
        }}
      />,
    );
  });
}
async function unreachable() {
  await checkDeploymentTier({
    get: async () => {
      throw Error('offline');
    },
  });
}

test('explicit health recheck recovers a cached failure and transfers a simulated SDK callback once', async () => {
  await unreachable();
  let finish!: (r: ApiResponse<unknown>) => void;
  const get = jest.spyOn(apiClient, 'get').mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }) as ReturnType<typeof apiClient.get>,
  );
  const request = jest.spyOn(apiClient, 'request');
  await mount();
  expect(surface.camera).toBeUndefined();
  expect(surface.activationLabel).toBe('Kiểm tra lại môi trường quét');
  expect(get).not.toHaveBeenCalled();
  const retry = surface.onActivate!;
  await act(() => {
    retry();
    retry();
  });
  expect(get).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenCalledWith('/api/v1/health', { timeoutMs: 8000 });
  expect(surface.camera).toBeUndefined();
  expect(surface.onActivate).toBeUndefined();
  await act(async () => finish(response('dev-test')));
  expect(surface.camera).toBeDefined();
  const callback = (
    surface.camera as React.ReactElement<{ onReadCode(e: unknown): void }>
  ).props.onReadCode;
  await act(() => {
    callback({ nativeEvent: { codeStringValue: 'BOX-SEED-0005' } });
    callback({ nativeEvent: { codeStringValue: 'BOX-SEED-0005' } });
  });
  expect(onRead).toHaveBeenCalledTimes(1);
  expect(onRead).toHaveBeenCalledWith('BOX-SEED-0005');
  expect(surface.camera).toBeUndefined();
  expect(request).not.toHaveBeenCalled();
});

test.each([undefined, 'customer-production'])(
  'missing/wrong tier %s stays blocked after the explicit read',
  async tier => {
    await unreachable();
    const get = jest.spyOn(apiClient, 'get').mockResolvedValue(response(tier));
    await mount();
    await act(async () => surface.onActivate!());
    expect(get).toHaveBeenCalledTimes(1);
    expect(surface.camera).toBeUndefined();
    expect(surface.onActivate).toBeUndefined();
    expect(surface.caption).toContain('Sai môi trường');
    expect(onRead).not.toHaveBeenCalled();
    expect(getLastTierCheck().status).toBe(tier ? 'mismatched' : 'missing');
  },
);

test('a second failed health read remains recoverable without invoking the camera', async () => {
  await unreachable();
  const get = jest
    .spyOn(apiClient, 'get')
    .mockRejectedValue(Error('still offline'));
  await mount();
  await act(async () => surface.onActivate!());
  expect(get).toHaveBeenCalledTimes(1);
  expect(surface.camera).toBeUndefined();
  expect(surface.onActivate).toBeDefined();
  expect(onRead).not.toHaveBeenCalled();
});
