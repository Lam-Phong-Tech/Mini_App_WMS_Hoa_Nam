// Native renderer tests; physical keyboard verification is reported separately.
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import {
  AppState,
  PermissionsAndroid,
  Platform,
  TextInput,
} from 'react-native';
import { AppProviders } from '../src/app/App';
import {
  BusinessScanScreen,
  type ScanFeedback,
} from '../src/features/scan/BusinessScanScreen';
import { Button } from '../src/ui/Button';
import { CodeInput } from '../src/ui/CodeInput';
import {
  setTierCheckForTesting,
  resetTierCheckForTesting,
} from '../src/services/wms/tierCheck';
import { Camera } from 'react-native-camera-kit';
import { P04Action } from '../src/features/inbound/P04Frame';
beforeEach(() => {
  AppState.currentState = 'active';
  jest.useFakeTimers();
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  setTierCheckForTesting({ status: 'matched', expected: 'dev-test' });
});
afterEach(() => {
  resetTierCheckForTesting();
  jest.restoreAllMocks();
  jest.useRealTimers();
});
async function mount(
  onScan: jest.Mock<Promise<ScanFeedback>, [string, string]>,
) {
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <BusinessScanScreen
          title="Xuất kho"
          documentName="PX-Test"
          stepLabel="Bước 2/3"
          sessionLabel="Phiếu xuất"
          scannedCount={0}
          layout="board"
          p05Context={{
            planned: 2,
            codes: [],
            attempts: [],
            documentRef: 'PX-Test',
            warehouseName: 'Kho test',
          }}
          onScan={onScan}
          onBack={() => undefined}
          onDone={() => undefined}
        />
      </AppProviders>,
    );
  });
  const button = (label: string) =>
    tree.root.findAllByType(Button).find(n => n.props.label === label)!;
  await act(async () => button('Nhập tay').props.onPress());
  return {
    tree,
    button,
    input: () => tree.root.findByType(CodeInput),
    close: () => act(() => tree.unmount()),
  };
}
test('P05 manual rejection keeps raw, shows reason and permits same raw retry immediately', async () => {
  const scan = jest
    .fn<Promise<ScanFeedback>, [string, string]>()
    .mockResolvedValueOnce({
      accepted: false,
      message: 'Mã đang được giữ chỗ. Kiểm tra rồi thử lại.',
    })
    .mockResolvedValueOnce({ accepted: true });
  const f = await mount(scan);
  const raw = 'SN-PN-RW-20261006-001';
  await act(async () => f.input().props.onChangeText(raw));
  await act(async () => f.button('Kiểm tra mã').props.onPress());
  expect(f.input().props.value).toBe(raw);
  expect(JSON.stringify(f.tree.toJSON())).toContain('Mã đang được giữ chỗ');
  await act(async () => f.button('Kiểm tra mã').props.onPress());
  expect(scan.mock.calls).toEqual([
    [raw, 'MANUAL'],
    [raw, 'MANUAL'],
  ]);
  expect(f.input().props.value).toBe('');
  expect(f.tree.root.findAllByType(Camera)).toHaveLength(0);
  f.close();
});
test('TC11 scan screen hides document context/note and uses the two locked action labels', async () => {
  const f = await mount(jest.fn().mockResolvedValue({ accepted: false }));
  expect(
    f.tree.root.findAllByProps({ accessibilityLabel: 'Chi tiết phiếu đang xuất' }),
  ).toHaveLength(0);
  expect(JSON.stringify(f.tree.toJSON())).not.toContain(
    'Kiểm tra phiếu trước khi gửi',
  );
  expect(JSON.stringify(f.tree.toJSON())).not.toContain('Còn thiếu');
  const check = f.tree.root
    .findAllByType(P04Action)
    .find(n => n.props.label === 'Kiểm tra phiếu')!;
  expect(check.props.trailing).toBeUndefined();
  const resume = f.tree.root
    .findAllByType(P04Action)
    .find(n => n.props.label === 'Tiếp tục soạn')!;
  expect(resume.props.trailing).toBeDefined();
  await act(async () =>
    resume.props.onPress(),
  );
  expect(f.tree.root.findAllByType(Camera)).toHaveLength(1);
  expect(f.tree.root.findAllByType(CodeInput)).toHaveLength(0);
  f.close();
});
test('P05 resolver transport error is visible and never permanently camera-dedupes manual input', async () => {
  const scan = jest
    .fn<Promise<ScanFeedback>, [string, string]>()
    .mockRejectedValueOnce(new Error('Không nhận được phản hồi kiểm tra mã.'))
    .mockResolvedValueOnce({ accepted: true });
  const f = await mount(scan);
  await act(async () => f.input().props.onChangeText('A'));
  await act(async () => f.button('Kiểm tra mã').props.onPress());
  expect(f.input().props.value).toBe('A');
  expect(JSON.stringify(f.tree.toJSON())).toContain('Không nhận được phản hồi');
  await act(async () => f.input().props.onSubmitEditing());
  expect(scan).toHaveBeenCalledTimes(2);
  f.close();
});
test('manual Enter and button double submit share synchronous lock; input remains mounted', async () => {
  let release!: (r: ScanFeedback) => void;
  const scan = jest.fn<Promise<ScanFeedback>, [string, string]>(
    () => new Promise(resolve => (release = resolve)),
  );
  const f = await mount(scan);
  await act(async () => f.input().props.onChangeText('A'));
  const input = f.tree.root.findByType(TextInput);
  await act(async () => {
    f.input().props.onSubmitEditing();
    f.button('Kiểm tra mã').props.onPress();
  });
  expect(scan).toHaveBeenCalledTimes(1);
  expect(f.tree.root.findByType(TextInput)).toBe(input);
  expect(f.button('Kiểm tra mã').props.disabled).toBe(true);
  await act(async () => release({ accepted: true }));
  expect(f.tree.root.findByType(TextInput)).toBe(input);
  expect(f.input().props.value).toBe('');
  f.close();
});
test('manual raw is passed unchanged to owner, clear only after success; next code needs no artificial wait', async () => {
  const scan = jest
    .fn<Promise<ScanFeedback>, [string, string]>()
    .mockResolvedValue({ accepted: true });
  const f = await mount(scan);
  await act(async () => f.input().props.onChangeText(' HN1|SKU=A|ITEM=X '));
  await act(async () => f.button('Kiểm tra mã').props.onPress());
  await act(async () => f.input().props.onChangeText('B'));
  await act(async () => f.input().props.onSubmitEditing());
  expect(scan.mock.calls).toEqual([
    [' HN1|SKU=A|ITEM=X ', 'MANUAL'],
    ['B', 'MANUAL'],
  ]);
  expect(f.input().props.value).toBe('');
  f.close();
});

test('P05 Enter submits without blurring the manual input while preserving the synchronous double-submit guard', async () => {
  const scan = jest
    .fn<Promise<ScanFeedback>, [string, string]>()
    .mockResolvedValue({ accepted: true });
  const f = await mount(scan);
  expect(f.input().props.submitBehavior).toBe('submit');
  expect(f.input().props.blurOnSubmit).toBe(false);
  await act(async () => f.input().props.onChangeText('A'));
  await act(async () => f.input().props.onSubmitEditing());
  expect(scan.mock.calls).toEqual([['A', 'MANUAL']]);
  f.close();
});
test('code input uses visible-password and keeps both input text and submit inline on P05', async () => {
  const f = await mount(
    jest
      .fn<Promise<ScanFeedback>, [string, string]>()
      .mockResolvedValue({ accepted: true }),
  );
  const input = f.tree.root.findByType(TextInput);
  expect(input.props.keyboardType).toBe('visible-password');
  expect(input.props.autoCorrect).toBe(false);
  expect(input.props.autoCapitalize).toBe('none');
  expect(f.input().props.accessibilityLabel).toBe('Mã QR/Serial/SKU');
  expect(JSON.stringify(f.tree.toJSON())).toContain('Xuất kho');
  expect(f.tree.root.findAllByType(Camera)).toHaveLength(0);
  f.close();
});
test('manual entry cannot bypass an unverified/wrong deployment tier', async () => {
  setTierCheckForTesting({
    status: 'mismatched',
    expected: 'dev-test',
    reported: 'customer-production',
  });
  const scan = jest
    .fn<Promise<ScanFeedback>, [string, string]>()
    .mockResolvedValue({ accepted: true });
  const f = await mount(scan);
  await act(async () => f.input().props.onChangeText('A'));
  await act(async () => f.button('Kiểm tra mã').props.onPress());
  expect(scan).not.toHaveBeenCalled();
  expect(f.input().props.value).toBe('A');
  expect(JSON.stringify(f.tree.toJSON())).toContain('nhưng bản cài này');
  f.close();
});
test('oversized manual code is retained with explicit error and sends no resolver request', async () => {
  const scan = jest
    .fn<Promise<ScanFeedback>, [string, string]>()
    .mockResolvedValue({ accepted: true });
  const f = await mount(scan),
    raw = 'X'.repeat(513);
  await act(async () => f.input().props.onChangeText(raw));
  await act(async () => f.input().props.onSubmitEditing());
  expect(scan).not.toHaveBeenCalled();
  expect(f.input().props.value).toBe(raw);
  expect(JSON.stringify(f.tree.toJSON())).toContain('512 ký tự');
  f.close();
});

test('late resolver completion does not erase newer text typed before the native input locks', async () => {
  let release!: (result: ScanFeedback) => void;
  const scan = jest.fn<Promise<ScanFeedback>, [string, string]>(
    () => new Promise(resolve => (release = resolve)),
  );
  const f = await mount(scan);
  await act(async () => f.input().props.onChangeText('OLD'));
  await act(async () => f.input().props.onSubmitEditing());
  await act(async () => f.input().props.onChangeText('NEW-TEXT'));
  await act(async () => release({ accepted: true }));
  expect(f.input().props.value).toBe('NEW-TEXT');
  expect(scan.mock.calls).toEqual([['OLD', 'MANUAL']]);
  f.close();
});

test('retained valid code clears manual input only after owner confirms SAVE snapshot', async () => {
  const scan = jest
    .fn<Promise<ScanFeedback>, [string, string]>()
    .mockResolvedValue({
      accepted: false,
      retained: true,
      message: 'Chờ xác nhận SAVE.',
    });
  const f = await mount(scan);
  await act(async () => f.input().props.onChangeText('A'));
  await act(async () => f.input().props.onSubmitEditing());
  expect(f.input().props.value).toBe('A');
  await act(async () =>
    f.tree.update(
      <AppProviders>
        <BusinessScanScreen
          title="Xuất kho"
          documentName="PX-Test"
          stepLabel="Bước 2/3"
          sessionLabel="Phiếu xuất"
          scannedCount={1}
          layout="board"
          p05Context={{
            planned: 2,
            snapshotSaved: true,
            codes: [{ raw: 'A', quantity: 1, at: 0 }],
            attempts: [],
            documentRef: 'PX-Test',
            warehouseName: 'Kho test',
          }}
          onScan={scan}
          onBack={() => undefined}
          onDone={() => undefined}
        />
      </AppProviders>,
    ),
  );
  expect(f.input().props.value).toBe('');
  expect(JSON.stringify(f.tree.toJSON())).not.toContain('Chờ xác nhận SAVE.');
  expect(scan).toHaveBeenCalledTimes(1);
  f.close();
});
