// Native bridge fixtures only: these tests do not establish optical/device PASS.
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { Camera } from 'react-native-camera-kit';
import { AppProviders } from '../src/app/App';
import { BusinessScanScreen } from '../src/features/scan/BusinessScanScreen';
import { Button } from '../src/ui/Button';
import { CodeInput } from '../src/ui/CodeInput';
import {
  setTierCheckForTesting,
  resetTierCheckForTesting,
} from '../src/services/wms/tierCheck';

jest.mock('react-native-camera-kit', () => {
  const R = require('react');
  return {
    Camera: (props: unknown) => R.createElement('NativeCameraBridge', props),
    CameraType: { Back: 'back', Front: 'front' },
  };
});

const context = {
  warehouseName: 'Confirmed warehouse',
  codes: [],
  attempts: [],
};
const originalAppState = AppState.currentState;
let listeners: ((state: string) => void)[];
beforeEach(() => {
  jest.useFakeTimers();
  jest.replaceProperty(Platform, 'OS', 'android');
  AppState.currentState = 'active';
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('granted');
  listeners = [];
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, callback) => {
      listeners.push(callback as (state: string) => void);
      return { remove: jest.fn() };
    });
  setTierCheckForTesting({ status: 'matched', expected: 'dev-test' });
});
afterEach(() => {
  resetTierCheckForTesting();
  jest.restoreAllMocks();
  AppState.currentState = originalAppState;
  jest.useRealTimers();
});

async function mount() {
  const onScan = jest.fn(async () => ({ accepted: true }));
  let tree!: Renderer.ReactTestRenderer;
  const screen = (scanPaused = false) => (
    <AppProviders>
      <BusinessScanScreen
        title="Nhập kho"
        documentName="P04 bridge test"
        sessionLabel="Phiên quét nhập kho"
        layout="board"
        p04Context={context}
        scannedCount={0}
        onScan={onScan}
        onBack={() => undefined}
        onDone={() => undefined}
        scanPaused={scanPaused}
      />
    </AppProviders>
  );
  await act(async () => {
    tree = Renderer.create(screen());
  });
  const button = (label: string) =>
    tree.root.findAllByType(Button).find(node => node.props.label === label)!;
  return {
    tree,
    onScan,
    button,
    screen,
    close: () => act(() => tree.unmount()),
  };
}

test('P04 never opens camera automatically; explicit enable uses the rear native scanner', async () => {
  const f = await mount();
  expect(f.tree.root.findAllByType(Camera)).toHaveLength(0);
  await act(async () => {
    f.button('Bật camera').props.onPress();
  });
  const camera = f.tree.root.findByType(Camera);
  expect(camera.props.cameraType).toBe('back');
  expect(camera.props.scanBarcode).toBe(true);
  expect(PermissionsAndroid.request).not.toHaveBeenCalled();
  f.close();
});

test('inbound has paired review/continue actions from the approved scan screen; empty scan cannot review',async()=>{
  const f=await mount();
  const labels=f.tree.root.findAllByType(Button).map(b=>b.props.label);
  expect(labels.filter(l=>l==='Kiểm tra phiếu')).toHaveLength(1);
  expect(labels).toContain('Tiếp tục quét');
  expect(JSON.stringify(f.tree.toJSON())).not.toContain('Thêm ít nhất 1 mã hợp lệ để kiểm tra phiếu.');
  expect(f.button('Kiểm tra phiếu').props.disabled).toBe(true);
  expect(f.onScan).not.toHaveBeenCalled();f.close();
});

test('permission denial keeps native camera closed and enables no scan callback', async () => {
  (PermissionsAndroid.check as jest.Mock).mockResolvedValue(false);
  (PermissionsAndroid.request as jest.Mock).mockResolvedValue('denied');
  const f = await mount();
  await act(async () => {
    f.button('Bật camera').props.onPress();
  });
  expect(PermissionsAndroid.request).toHaveBeenCalledTimes(1);
  expect(f.tree.root.findAllByType(Camera)).toHaveLength(0);
  expect(f.onScan).not.toHaveBeenCalled();
  f.close();
});

test('camera error releases the failed bridge and explicit retry opens a fresh bridge without scanning', async () => {
  const f = await mount();
  await act(async () => f.button('Bật camera').props.onPress());
  await act(async () => f.tree.root.findByType(Camera).props.onError({nativeEvent:{errorMessage:'Camera is already in use'}}));
  expect(f.tree.root.findAllByType(Camera)).toHaveLength(0);
  expect(JSON.stringify(f.tree.toJSON())).toContain('Camera is already in use');
  await act(async () => f.button('Bật camera').props.onPress());
  expect(f.tree.root.findAllByType(Camera)).toHaveLength(1);
  expect(f.onScan).not.toHaveBeenCalled();
  expect(JSON.stringify(f.tree.toJSON())).not.toContain('Camera is already in use');
  f.close();
});

test('native decode retains raw code and CAMERA source; repeated frames cannot send twice', async () => {
  const f = await mount();
  await act(async () => {
    f.button('Bật camera').props.onPress();
  });
  const callback = f.tree.root.findByType(Camera).props.onReadCode;
  const raw = 'HN1|SKU=ABC|ITEM=EXISTING-01';
  await act(async () => {
    callback({ nativeEvent: { codeStringValue: raw, codeFormat: 'qr' } });
    callback({ nativeEvent: { codeStringValue: raw, codeFormat: 'qr' } });
  });
  expect(f.onScan.mock.calls).toEqual([[raw, 'CAMERA']]);
  f.close();
});

test('manual entry and owner pause release the camera; background releases it too', async () => {
  const f = await mount();
  await act(async () => {
    f.button('Bật camera').props.onPress();
  });
  await act(async () => {
    f.button('Nhập tay').props.onPress();
  });
  expect(f.tree.root.findAllByType(Camera)).toHaveLength(0);
  await act(async () => {
    f.tree.root
      .findAll(node => node.props.accessibilityLabel === 'Thu gọn nhập tay')[0]
      .props.onPress();
  });
  expect(f.tree.root.findAllByType(Camera)).toHaveLength(1);
  await act(async () => {
    f.tree.update(f.screen(true));
  });
  expect(f.tree.root.findAllByType(Camera)).toHaveLength(0);
  await act(async () => {
    f.tree.update(f.screen(false));
  });
  expect(f.tree.root.findAllByType(Camera)).toHaveLength(1);
  await act(async () => {
    for (const callback of listeners) callback('background');
  });
  expect(f.tree.root.findAllByType(Camera)).toHaveLength(0);
  f.close();
});

test('P04 manual keeps the form ready for the next code and preserves raw MANUAL input', async () => {
  const f = await mount();
  await act(async () => f.button('Nhập tay').props.onPress());
  expect(f.tree.root.findAllByType(Camera)).toHaveLength(0);
  expect(
    f.tree.root
      .findAllByType(Button)
      .some(button => button.props.label === 'Bật camera'),
  ).toBe(false);
  const raw = ' HN1|SKU=ABC|ITEM=NEXT-01 ';
  await act(async () =>
    f.tree.root.findByType(CodeInput).props.onChangeText(raw),
  );
  await act(async () => f.button('Kiểm tra mã').props.onPress());
  expect(f.onScan.mock.calls).toEqual([[raw, 'MANUAL']]);
  expect(f.tree.root.findByType(CodeInput).props.value).toBe('');
  await act(async () => jest.advanceTimersByTime(600));
  await act(async () =>
    f.tree.root.findByType(CodeInput).props.onChangeText('SECOND-CODE'),
  );
  await act(async () => f.button('Kiểm tra mã').props.onPress());
  expect(f.onScan.mock.calls).toEqual([
    [raw, 'MANUAL'],
    ['SECOND-CODE', 'MANUAL'],
  ]);
  f.close();
});
