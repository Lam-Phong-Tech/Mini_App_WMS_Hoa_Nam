// Browser module with mocked MediaStream/decoder, not a hardware acceptance test.
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
const { Camera } = jest.requireActual('../src/web/camera-kit');
const mockDecode = jest.fn(),
  stopDecoder = jest.fn();
jest.mock('../src/web/loadCameraDecoder', () => ({
  loadCameraDecoder: async () => ({
    BrowserMultiFormatReader: jest
      .fn()
      .mockImplementation(() => ({
        decodeFromVideoElement: (...args: any[]) => mockDecode(...args),
      })),
  }),
}));
let tree: Renderer.ReactTestRenderer | undefined;
let mediaOriginal: PropertyDescriptor | undefined,
  detectorOriginal: PropertyDescriptor | undefined;
const stop = jest.fn(),
  play = jest.fn(async () => undefined),
  getUserMedia = jest.fn();
let video: any;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  video = { readyState: 4, play, srcObject: null };
  mediaOriginal = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  detectorOriginal = Object.getOwnPropertyDescriptor(
    globalThis,
    'BarcodeDetector',
  );
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  mockDecode.mockResolvedValue({ stop: stopDecoder });
});
afterEach(async () => {
  if (tree) await act(() => tree!.unmount());
  tree = undefined;
  if (mediaOriginal)
    Object.defineProperty(navigator, 'mediaDevices', mediaOriginal);
  else Reflect.deleteProperty(navigator, 'mediaDevices');
  if (detectorOriginal)
    Object.defineProperty(globalThis, 'BarcodeDetector', detectorOriginal);
  else Reflect.deleteProperty(globalThis, 'BarcodeDetector');
  jest.useRealTimers();
});
async function mount(Reader: any, onRead = jest.fn()) {
  Object.defineProperty(globalThis, 'BarcodeDetector', {
    configurable: true,
    value: Reader,
  });
  await act(async () => {
    tree = Renderer.create(<Camera onReadCode={onRead} />, {
      createNodeMock: () => video,
    });
  });
  return onRead;
}
test.each(['constructor', 'detect'])(
  'native %s failure switches once to ZXing on the same real stream',
  async mode => {
    class Detector {
      constructor() {
        if (mode === 'constructor') throw Error('unavailable');
      }
      detect() {
        return Promise.reject(Error('not supported'));
      }
    }
    await mount(Detector);
    if (mode === 'detect')
      await act(async () => {
        jest.advanceTimersByTime(150);
      });
    expect(mockDecode).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(mockDecode).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
  },
);
test('native success continues scanning frames and latest callback without reopening camera', async () => {
  let raw = 'QR-1';
  const detect = jest.fn(async () => [{ rawValue: raw, format: 'qr_code' }]);
  class Detector {
    detect = detect;
  }
  const first = await mount(Detector);
  await act(async () => {
    jest.advanceTimersByTime(150);
  });
  expect(first).toHaveBeenCalledWith({
    nativeEvent: { codeStringValue: 'QR-1', codeFormat: 'qr_code' },
  });
  const second = jest.fn();
  raw = 'QR-2';
  await act(() => tree!.update(<Camera onReadCode={second} />));
  await act(async () => {
    jest.advanceTimersByTime(150);
  });
  expect(second).toHaveBeenCalledWith({
    nativeEvent: { codeStringValue: 'QR-2', codeFormat: 'qr_code' },
  });
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  expect(stop).not.toHaveBeenCalled();
});
