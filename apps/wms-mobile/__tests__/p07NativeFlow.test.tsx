// Component mocks only; no Android/NFC acceptance is inferred from this suite.
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { P07NativeFlow } from '../src/features/nfc/P07NativeFlow';
import { P07Action, P07Frame } from '../src/features/nfc/P07Frame';
import { P04Icon } from '../src/features/inbound/P04Icon';
import { StyleSheet,View } from 'react-native';
import { ScannerNativeText } from '../src/ui/ScannerNativeText';
import {
  readP07Tags,
  readP07Items,
  readP07Tag,
} from '../src/services/wms/p07Catalog';
import { resolveNfcCode } from '../src/services/wms/nfc';
import {
  createNativeNfcAssignment,
  currentNfcContext,
} from '../src/features/nfc/nativeNfcAssignment';
import { resetHardwareBackForTest } from '../src/app/useHardwareBack';
import { AppError } from '../src/errors/AppError';
import { P17ScanExceptions } from '../src/features/scan/P17ScanExceptions';
import { P17Action } from '../src/features/scan/P17Primitives';

jest.mock('../src/navigation/RootNavigator', () => ({
  RootNavigator: () => null,
}));

jest.mock('../src/features/nfc/nativeNfcAssignment', () => ({
  createNativeNfcAssignment: jest.fn(),
  currentNfcContext: jest.fn(),
}));
jest.mock('../src/native/nfc', () => ({
  cancelNfc: jest.fn(),
  copyNfcIdentifier: jest.fn(async () => undefined),
}));
jest.mock('../src/services/wms/p07Catalog', () => ({
  NFC_TABS: ['ALL', 'ASSIGNED', 'UNASSIGNED'],
  readP07Tags: jest.fn(),
  readP07Items: jest.fn(),
  readP07Tag: jest.fn(),
}));
jest.mock('../src/services/wms/queries', () => ({
  fetchCurrentUser: jest.fn(async () => ({
    active_warehouse_id: 'warehouse-a',
    available_warehouses: [{ warehouse_id: 'warehouse-a', name: 'Kho TEST' }],
  })),
}));
jest.mock('../src/services/wms/nfc', () => ({
  ...jest.requireActual('../src/services/wms/nfc'),
  resolveNfcCode: jest.fn(),
}));
const scope = {
  actorId: 'actor-a',
  authSessionId: 'session-a',
  warehouseId: 'warehouse-a',
};
jest.setTimeout(15000);
let tree: Renderer.ReactTestRenderer | undefined;
const flow = () => ({
  snapshot: jest.fn(() => undefined),
  readSnapshot: jest.fn(() => undefined),
  mappingSnapshot: jest.fn((): any => undefined),
  dispose: jest.fn(),
  prepare: jest.fn(),
  resetConfirmed: jest.fn(),
  writeAndConfirm: jest.fn(),
  release: jest.fn(),
  reconcile: jest.fn(),
  verifyWrittenChip: jest.fn(),
  prepareRecovery: jest.fn(),
  readRecoveryChip: jest.fn(),
});
const view = () => JSON.stringify(tree?.toJSON());
async function mount(
  onBack = jest.fn(),
  onSelectTab?: (key: string) => void,
  initialCode?: string,
  onManageTags?: () => void,
) {
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P07NativeFlow
          onBack={onBack}
          onSelectTab={onSelectTab}
          initialCode={initialCode}
          onManageTags={onManageTags}
        />
      </AppProviders>,
    );
    jest.runOnlyPendingTimers();
  });
}
async function press(label: string) {
  await act(async () => {
    tree!.root
      .findAllByType(P07Action)
      .find(n => n.props.label === label)!
      .props.onPress();
  });
}
async function start() {
  await act(async () => {
    tree!.root
      .findAll(n => typeof n.props.onPress === 'function')
      .find(n => n.props.accessibilityLabel === 'Thêm liên kết NFC')!
      .props.onPress();
  });
}
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
  jest.clearAllMocks();
  (currentNfcContext as jest.Mock).mockReturnValue(scope);
  (createNativeNfcAssignment as jest.Mock).mockReturnValue(flow());
  (readP07Tags as jest.Mock).mockResolvedValue({
    items: [],
    totals: { ALL: 128, ASSIGNED: 100, UNASSIGNED: 28 },
    page: 1,
    lastPage: 1,
  });
  (readP07Items as jest.Mock).mockResolvedValue({
    items: [],
    page: 1,
    lastPage: 1,
  });
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
  resetHardwareBackForTest();
  jest.useRealTimers();
});
describe('P07 native panels — mocked render/interaction', () => {
  it('uses the shared readable chevron for the NFC entry without starting an assignment', async () => {
    const f = flow();
    (createNativeNfcAssignment as jest.Mock).mockReturnValue(f);
    await mount();
    expect(tree!.root.findAllByType(P04Icon).some(n => n.props.name === 'chevron' && n.props.size === 24)).toBe(true);
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.writeAndConfirm).not.toHaveBeenCalled();
  });
  it('keeps the add icon outlined while retaining its existing accessible action',async()=>{
    const f=flow();
    (createNativeNfcAssignment as jest.Mock).mockReturnValue(f);
    await mount();
    const add=tree!.root.findAll(n=>n.props.accessibilityLabel==='Thêm liên kết NFC'&&typeof n.props.onPress==='function')[0];
    const outline=add.findAllByType(View).find(n=>n.props.testID==='P07.add.icon');
    expect(outline).toBeDefined();
    const style=StyleSheet.flatten(outline!.props.style);
    expect(style.borderWidth).toBeGreaterThan(0);
    expect(style.width).toBe(style.height);
    expect(add.findAllByType(P04Icon).some(n=>n.props.name==='plus')).toBe(true);
    await act(async()=>add.props.onPress());
    expect(tree!.root.findByType(P07Frame).props.panel).toBe(2);
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.writeAndConfirm).not.toHaveBeenCalled();
  });
  it('keeps a status on the right of a long code while opening the exact original tag',async()=>{
    const tag={physical_code_id:'07070707-0707-4707-8707-000000000013',hardware_uid:'UI-UID-TC13',code_value:'NFC-LONG-CODE-KEEP-THE-ORIGINAL-ID',tab_status:'ASSIGNED',status_label:'Đã liên kết',updated_at:'2026-11-05T12:00:00Z'};
    (readP07Tags as jest.Mock).mockResolvedValue({items:[tag],totals:{ALL:1,ASSIGNED:1,UNASSIGNED:0},page:1,lastPage:1});
    (readP07Tag as jest.Mock).mockResolvedValue(tag);
    await mount();
    await act(async()=>{jest.runOnlyPendingTimers();});
    const code=tree!.root.findAllByType(ScannerNativeText).find(n=>n.props.children===tag.code_value)!;
    expect(code.props.numberOfLines).toBe(1);
    expect(StyleSheet.flatten(code.props.style).flex).toBe(1);
    const header=code.parent!;
    expect(StyleSheet.flatten(header.props.style).flexWrap).toBe('nowrap');
    const badge=header.findAllByType(ScannerNativeText).find(n=>n.props.children===tag.status_label)!;
    expect(StyleSheet.flatten(badge.props.style).flexShrink).toBe(0);
    expect(badge.props.numberOfLines).toBe(1);
    const row=tree!.root.findAll(n=>typeof n.props.onPress==='function'&&n.findAllByType(ScannerNativeText).some(t=>t.props.children===tag.code_value)).pop()!;
    await act(async()=>row.props.onPress());
    expect(readP07Tag).toHaveBeenCalledWith('warehouse-a',tag.physical_code_id);
    expect(view()).toContain(tag.code_value);
  });
  it('list update marker uses persisted updated_at and never substitutes assigned_at',async()=>{
    (readP07Tags as jest.Mock).mockResolvedValue({items:[
      {physical_code_id:'07070707-0707-4707-8707-000000000001',hardware_uid:'UI-UID-1',code_value:'TAG-UI-1',tab_status:'ASSIGNED',status_label:'Đã liên kết',updated_at:'2026-11-04T02:00:00Z',assigned_at:'2026-09-09T07:32:00Z'},
      {physical_code_id:'07070707-0707-4707-8707-000000000002',hardware_uid:'UI-UID-2',code_value:'TAG-UI-2',tab_status:'ASSIGNED',status_label:'Đã liên kết',updated_at:null,assigned_at:'2026-09-09T07:32:00Z'}
    ],totals:{ALL:2,ASSIGNED:2,UNASSIGNED:0},page:1,lastPage:1});
    await mount();await act(async()=>{jest.runOnlyPendingTimers();});expect(view()).toContain('TAG-UI-1');expect(view()).toContain('Cập nhật:');expect(view()).toContain('04/11/2026 09:00');expect(view()).not.toContain('09/09/2026');
  });
  it('keeps canonical S01 as the only tag list without a nested management CTA', async () => {
    const onManageTags = jest.fn();
    await mount(jest.fn(), undefined, undefined, onManageTags);
    expect(view()).not.toContain('Quản lý danh sách thẻ');
    expect(onManageTags).not.toHaveBeenCalled();
    expect(
      tree!.root
        .findAll(n => typeof n.props.onPress === 'function')
        .some(n => n.props.accessibilityLabel === 'Thêm liên kết NFC'),
    ).toBe(true);
  }, 30000);

  it('a scanned product code opens the existing picker with the code retained, without starting native NFC', async () => {
    const f = flow();
    (createNativeNfcAssignment as jest.Mock).mockReturnValue(f);
    await mount(jest.fn(), undefined, 'SN-SCANNED');
    expect(view()).toContain('Chọn sản phẩm');
    expect(view()).toContain('SN-SCANNED');
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.writeAndConfirm).not.toHaveBeenCalled();
  });
  it('blocks an in-stock product before NFC read or reservation', async () => {
    const f = flow();
    (createNativeNfcAssignment as jest.Mock).mockReturnValue(f);
    (resolveNfcCode as jest.Mock).mockResolvedValue({
      resolved: true,
      assignable: true,
      item: { item_id: 'item-in-stock', item_status: 'IN_STOCK' },
      nfc_status: 'UNASSIGNED',
      nfc: null,
    });
    await mount(jest.fn(), undefined, 'ITEM-IN-STOCK');
    await press('Nhận diện mã đã nhập');
    expect(view()).toContain('Chỉ liên kết NFC cho sản phẩm đã xuất kho');
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.writeAndConfirm).not.toHaveBeenCalled();
  });
  it('explicit Home action returns home even when NFC was opened from another navigation tab', async () => {
    const f = flow(),
      onBack = jest.fn(),
      onSelectTab = jest.fn();
    (f.snapshot as jest.Mock).mockReturnValue({
      stage: 'UNKNOWN',
      key: 'old-key',
      itemId: 'item-a',
      hardwareUid: 'UID-OLD',
      preparation: {},
    });
    (createNativeNfcAssignment as jest.Mock).mockReturnValue(f);
    await mount(onBack, onSelectTab);
    await act(async () => tree!.root.findByType(P07Frame).props.onBack());
    const leave = tree!.root
      .findAllByType(P07Action)
      .filter(p => p.props.label === 'Về Trang chủ — giữ lượt')
      .pop()!;
    await act(async () => leave.props.onPress());
    expect(onSelectTab).toHaveBeenCalledWith('home');
    expect(onBack).not.toHaveBeenCalled();
    expect(f.resetConfirmed).not.toHaveBeenCalled();
  });
  it('can leave an UNKNOWN operation without clearing/releasing it and keeps the old identity', async () => {
    const f = flow(),
      onBack = jest.fn();
    const pending = {
      stage: 'UNKNOWN',
      key: 'same-key',
      itemId: 'item-a',
      hardwareUid: 'UID-OLD',
      preparation: {},
    };
    (f.snapshot as jest.Mock).mockReturnValue(pending);
    (createNativeNfcAssignment as jest.Mock).mockReturnValue(f);
    await mount(onBack);
    await act(async () => tree!.root.findByType(P07Frame).props.onBack());
    expect(view()).toContain('Giữ lượt NFC và rời màn hình?');
    const exit = tree!.root
      .findAllByType(P07Action)
      .filter(p => p.props.label === 'Về Trang chủ — giữ lượt')
      .pop()!;
    await act(async () => exit.props.onPress());
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(f.resetConfirmed).not.toHaveBeenCalled();
    expect(f.release).not.toHaveBeenCalled();
    expect(f.writeAndConfirm).not.toHaveBeenCalled();
    expect(f.snapshot()).toEqual(pending);
  });
  it.each([false, true])(
    'REJECTED prepare eligibility=%s requires the explicit recovery dialog',
    async allowed => {
      const f = flow();
      (f.snapshot as jest.Mock).mockReturnValue({
        stage: 'REJECTED',
        itemId: 'item-a',
        hardwareUid: 'UID-OLD',
        preparation: { item: { item_id: 'item-a' } },
        rejection: {
          may_create_new_request: allowed,
          receipt: { receipt_id: 'receipt-a' },
        },
      });
      (createNativeNfcAssignment as jest.Mock).mockReturnValue(f);
      await mount();
      const open = tree!.root
        .findAllByType(P07Action)
        .find(p => p.props.label === 'Chuẩn bị phục hồi bằng thẻ mới');
      expect(!!open).toBe(allowed);
      expect(f.prepareRecovery).not.toHaveBeenCalled();
      if (allowed) {
        await press('Chuẩn bị phục hồi bằng thẻ mới');
        expect(view()).toContain('Chuẩn bị phục hồi NFC?');
        expect(f.prepareRecovery).not.toHaveBeenCalled();
        await press('Hủy');
        expect(f.prepareRecovery).not.toHaveBeenCalled();
        await press('Chuẩn bị phục hồi bằng thẻ mới');
        await press('Xác nhận chuẩn bị phục hồi');
        expect(f.prepareRecovery).toHaveBeenCalledTimes(1);
      }
      expect(f.writeAndConfirm).not.toHaveBeenCalled();
      expect(f.resetConfirmed).not.toHaveBeenCalled();
    },
  );
  it('a granted recovery hold exposes only new blank-chip read, keeping physical writes explicit', async () => {
    const f = flow();
    (f.snapshot as jest.Mock).mockReturnValue({
      stage: 'RECOVERY_READY',
      itemId: 'item-a',
      hardwareUid: 'UID-OLD',
      preparation: { item: { item_id: 'item-a' } },
      recoveryPrepare: {
        preparation: {
          item: { item_id: 'item-a' },
          sku: { sku_name: 'Recovered product' },
        },
      },
    });
    (createNativeNfcAssignment as jest.Mock).mockReturnValue(f);
    await mount();
    await press('Đọc thẻ trắng mới');
    expect(f.readRecoveryChip).toHaveBeenCalledTimes(1);
    expect(f.prepareRecovery).not.toHaveBeenCalled();
    expect(f.writeAndConfirm).not.toHaveBeenCalled();
    expect(view()).toContain('Recovered product');
  });
  it('S01 uses server counts even when loaded list is empty; S02 cannot advance or read without chosen item', async () => {
    await mount();
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(view()).toContain('128');
    await start();
    expect(tree!.root.findByType(P07Frame).props.panel).toBe(2);
    expect(
      tree!.root
        .findAllByType(P07Action)
        .find(n => n.props.label === 'Tiếp tục →')!.props.disabled,
    ).toBe(true);
    expect(
      tree!.root
        .findAll(n => typeof n.props.onPress === 'function')
        .find(
          n =>
            n.props.disabled &&
            n.findAll(n => n.props.children === 'Đọc thẻ NFC').length,
        )!.props.disabled,
    ).toBe(true);
  });
  it('double read invokes preparation once; Continue stays disabled while pending', async () => {
    const f = flow();
    let complete!: () => void;
    f.prepare.mockImplementation(
      () =>
        new Promise<void>(r => {
          complete = r;
        }),
    );
    (createNativeNfcAssignment as jest.Mock).mockReturnValue(f);
    (readP07Items as jest.Mock).mockResolvedValue({
      items: [
        {
          item_id: 'item-a',
          serial_number: 'SN-TEST',
          item_status: 'ISSUED',
          nfc_status: 'UNASSIGNED',
          sku: { sku_name: 'Sản phẩm TEST', sku_code: 'SKU-TEST' },
        },
      ],
      page: 1,
      lastPage: 1,
    });
    await mount();
    await start();
    await act(async () => {
      tree!.root
        .findAll(n => typeof n.props.onPress === 'function')
        .find(n => n.props.accessibilityLabel === 'Đổi sản phẩm NFC')!
        .props.onPress();
      jest.runOnlyPendingTimers();
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(view()).toContain('Đã xuất kho · Chưa liên kết NFC');
    await act(async () => {
      tree!.root
        .findAll(n => typeof n.props.onPress === 'function')
        .find(n => n.findAll(n => n.props.children === 'SN-TEST').length)!
        .props.onPress();
    });
    const button = tree!.root
      .findAll(n => typeof n.props.onPress === 'function')
      .find(n => n.findAll(n => n.props.children === 'Đọc thẻ NFC').length)!;
    await act(async () => {
      button.props.onPress();
      button.props.onPress();
    });
    expect(f.prepare).toHaveBeenCalledTimes(1);
    expect(
      tree!.root
        .findAllByType(P07Action)
        .find(n => n.props.label === 'Tiếp tục →')!.props.disabled,
    ).toBe(true);
    await act(async () => complete());
  });
  it('routes an exact mapped-chip conflict to standalone P17.S03 without opening the generic NFC sheet or mutating', async () => {
    const f = flow();
    const observation = {
      context: scope,
      itemId: 'item-target',
      hardwareUid: 'UID-EXACT',
      resolveCode: 'RESOLVED',
      verification: 'verified' as const,
      physicalCodeId: 'physical-exact',
      status: 'ASSIGNED' as const,
      statusLabel: 'Đã liên kết',
      canViewLink: true,
      product: {
        code: 'ITEM-LINKED',
        name: 'Sản phẩm đã liên kết',
        sku: 'SKU-LINKED',
        serial: 'SERIAL-LINKED',
      },
    };
    f.mappingSnapshot.mockReturnValue(observation);
    f.prepare.mockRejectedValue(
      new AppError({
        kind: 'config',
        code: 'NFC_TAG_ALREADY_ASSIGNED',
        message: 'mapped',
      }),
    );
    (createNativeNfcAssignment as jest.Mock).mockReturnValue(f);
    (resolveNfcCode as jest.Mock).mockResolvedValue({
      resolved: true,
      assignable: true,
      item: {
        item_id: 'item-target',
        serial_number: 'SERIAL-TARGET',
        item_status: 'ISSUED',
      },
      sku: { sku_code: 'SKU-TARGET', sku_name: 'Sản phẩm đích' },
      nfc_status: 'UNASSIGNED',
      nfc: null,
    });
    await mount(jest.fn(), undefined, 'SERIAL-TARGET');
    await press('Nhận diện mã đã nhập');
    const read = tree!.root
      .findAll(n => typeof n.props.onPress === 'function')
      .find(n => n.findAll(x => x.props.children === 'Đọc thẻ NFC').length)!;
    await act(async () => read.props.onPress());
    expect(tree!.root.findByType(P17ScanExceptions).props.view).toMatchObject({
      panel: 'P17.S03',
      verification: 'verified',
      physicalCodeId: 'physical-exact',
      uid: 'UID-EXACT',
      status: 'ASSIGNED',
    });
    expect(view()).toContain('Sản phẩm đã liên kết');
    expect(view()).not.toContain('Thông báo NFC');
    await act(async () => {
      tree!.root
        .findAllByType(P17Action)
        .find(n => n.props.label === 'Hủy')!
        .props.onPress();
    });
    expect(tree!.root.findByType(P07Frame).props.panel).toBe(2);
    expect(f.prepare).toHaveBeenCalledTimes(1);
    expect(f.writeAndConfirm).not.toHaveBeenCalled();
    expect(f.release).not.toHaveBeenCalled();
    expect(f.reconcile).not.toHaveBeenCalled();
  });
  it('P17.S03 opens only the exact current GET detail and rejects no journal/write action', async () => {
    const f = flow();
    const observation = {
      context: scope,
      itemId: 'item-target',
      hardwareUid: 'UID-EXACT',
      resolveCode: 'RESOLVED',
      verification: 'verified' as const,
      physicalCodeId: 'physical-exact',
      status: 'LOCKED' as const,
      statusLabel: 'Đã khóa',
      canViewLink: true,
    };
    f.mappingSnapshot.mockReturnValue(observation);
    f.prepare.mockRejectedValue(
      new AppError({
        kind: 'config',
        code: 'NFC_TAG_ALREADY_ASSIGNED',
        message: 'mapped',
      }),
    );
    (createNativeNfcAssignment as jest.Mock).mockReturnValue(f);
    (resolveNfcCode as jest.Mock).mockResolvedValue({
      resolved: true,
      assignable: true,
      item: { item_id: 'item-target', item_status: 'ISSUED' },
      nfc_status: 'UNASSIGNED',
      nfc: null,
    });
    (readP07Tag as jest.Mock).mockResolvedValue({
      physical_code_id: 'physical-exact',
      hardware_uid: 'UID-EXACT',
      tab_status: 'LOCKED',
      status_label: 'Đã khóa',
      sku_name: 'Chi tiết hiện tại',
    });
    await mount(jest.fn(), undefined, 'SERIAL-TARGET');
    await press('Nhận diện mã đã nhập');
    const read = tree!.root
      .findAll(n => typeof n.props.onPress === 'function')
      .find(n => n.findAll(x => x.props.children === 'Đọc thẻ NFC').length)!;
    await act(async () => read.props.onPress());
    await act(async () => {
      tree!.root
        .findAllByType(P17Action)
        .find(n => n.props.label === 'Xem liên kết')!
        .props.onPress();
    });
    expect(readP07Tag).toHaveBeenCalledWith('warehouse-a', 'physical-exact');
    expect(view()).toContain('P07.tag-detail-dialog');
    expect(view()).toContain('Chi tiết hiện tại');
    expect(f.writeAndConfirm).not.toHaveBeenCalled();
    expect(f.release).not.toHaveBeenCalled();
    expect(f.reconcile).not.toHaveBeenCalled();
  });
  it('shows real blank-tag read separately from assignment and keeps Continue locked on Web', async () => {
    const f = flow();
    f.prepare.mockImplementation(async () => {
      (f.readSnapshot as jest.Mock).mockReturnValue({
        context: scope,
        itemId: 'item-a',
        hardwareUid: 'UID-READ-TEST',
        hasNdefData: false,
      });
      throw new AppError({
        kind: 'config',
        code: 'NFC_UID_BOUND_WRITE_UNSUPPORTED',
        message: 'APK required',
      });
    });
    (createNativeNfcAssignment as jest.Mock).mockReturnValue(f);
    (readP07Items as jest.Mock).mockResolvedValue({
      items: [
        {
          item_id: 'item-a',
          serial_number: 'SN-TEST',
          item_status: 'ISSUED',
          nfc_status: 'UNASSIGNED',
          sku: { sku_name: 'TEST' },
        },
      ],
      page: 1,
      lastPage: 1,
    });
    await mount();
    await start();
    await act(async () => {
      tree!.root
        .findAll(n => typeof n.props.onPress === 'function')
        .find(n => n.props.accessibilityLabel === 'Đổi sản phẩm NFC')!
        .props.onPress();
      jest.runOnlyPendingTimers();
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    await act(async () => {
      tree!.root
        .findAll(n => typeof n.props.onPress === 'function')
        .find(n => n.findAll(n => n.props.children === 'SN-TEST').length)!
        .props.onPress();
    });
    await act(async () => {
      tree!.root
        .findAll(n => typeof n.props.onPress === 'function')
        .find(n => n.findAll(n => n.props.children === 'Đọc thẻ NFC').length)!
        .props.onPress();
    });
    expect(view()).toContain('UID-READ-TEST');
    expect(view()).toContain('NDEF trống · chưa xác minh liên kết');
    expect(view()).toContain('APK Android');
    expect(view()).not.toContain('Chip đã có dữ liệu');
    expect(tree!.root.findByType(P07Frame).props.panel).toBe(2);
    expect(
      tree!.root
        .findAllByType(P07Action)
        .find(n => n.props.label === 'Tiếp tục →')!.props.disabled,
    ).toBe(true);
    expect(f.writeAndConfirm).not.toHaveBeenCalled();
    await press('Đóng');
    expect(view()).toContain('NDEF trống · chưa xác minh liên kết');
    expect(
      tree!.root.findByProps({ testID: 'P07.read-capability' }),
    ).toBeDefined();
    (currentNfcContext as jest.Mock).mockReturnValue({
      ...scope,
      authSessionId: 'session-b',
    });
    await act(async () => {
      tree!.update(
        <AppProviders>
          <P07NativeFlow onBack={jest.fn()} />
        </AppProviders>,
      );
    });
    expect(view()).not.toContain('UID-READ-TEST');
  });
  it('UNKNOWN opens S03 and exposes reconciliation without physical rewrite', async () => {
    const f = flow();
    f.reconcile.mockResolvedValue('UNKNOWN');
    (f.snapshot as jest.Mock).mockReturnValue({
      stage: 'UNKNOWN',
      itemId: 'item-a',
      hardwareUid: 'UID-TEST',
      preparation: { item: { item_id: 'item-a' }, sku: { name: 'TEST' } },
    });
    (createNativeNfcAssignment as jest.Mock).mockReturnValue(f);
    await mount();
    expect(tree!.root.findByType(P07Frame).props.panel).toBe(3);
    expect(view()).not.toContain('Đã liên kết thẻ NFC');
    await press('Kiểm tra kết quả liên kết');
    expect(f.reconcile).toHaveBeenCalledTimes(1);
    expect(f.writeAndConfirm).not.toHaveBeenCalled();
    expect(view()).toContain('WMS chưa có xác nhận hoàn tất');
  });
  it('an unverified prepare restores to S03 with a prewrite explanation and no false valid badge', async () => {
    const f = flow();
    (f.snapshot as jest.Mock).mockReturnValue({
      stage: 'PREPARE_UNKNOWN',
      itemId: 'item-a',
      key: 'old-key',
      hardwareUid: 'UID-TEST',
      preparation: { reservation_token: '' },
    });
    (createNativeNfcAssignment as jest.Mock).mockReturnValue(f);
    await mount();
    expect(tree!.root.findByType(P07Frame).props.panel).toBe(3);
    expect(view()).toContain('Chưa xác minh giữ chỗ');
    expect(view()).toContain('Chưa ghi chip hoặc gửi PATCH');
    expect(view()).not.toContain('Hợp lệ');
    expect(f.writeAndConfirm).not.toHaveBeenCalled();
    expect(
      tree!.root
        .findAllByType(P07Action)
        .some(n => n.props.label === 'Xác nhận liên kết →'),
    ).toBe(false);
  });
  it('S04 shows historical timestamp in locked date-first VN format and SKU from the receipt', async () => {
    const f = flow();
    (f.snapshot as jest.Mock).mockReturnValue({
      stage: 'CONFIRMED',
      preparation: {},
      result: {
        item: { serial_number: 'SN-RECEIPT' },
        sku: { sku_code: 'SKU-RECEIPT', sku_name: 'Tên từ biên nhận' },
        nfc: {
          hardware_uid: 'UID-RECEIPT',
          assigned_at: '2026-09-09T07:32:00Z',
        },
      },
    });
    (createNativeNfcAssignment as jest.Mock).mockReturnValue(f);
    await mount();
    expect(view()).toContain('09/09/2026 14:32');
    expect(view()).toContain('SKU: SKU-RECEIPT');
    expect(view()).toContain('Tên từ biên nhận');
  });
  it('Back during UNKNOWN keeps the old request and displays the real recovery guard', async () => {
    const f = flow();
    (f.snapshot as jest.Mock).mockReturnValue({
      stage: 'UNKNOWN',
      itemId: 'item-a',
      hardwareUid: 'UID-TEST',
      preparation: { item: { item_id: 'item-a' } },
    });
    (createNativeNfcAssignment as jest.Mock).mockReturnValue(f);
    await mount();
    await act(async () => tree!.root.findByType(P07Frame).props.onBack());
    expect(view()).toContain('Giữ nguyên chip và yêu cầu');
    expect(view()).not.toContain('cấu hình máy chủ');
    expect(f.resetConfirmed).not.toHaveBeenCalled();
    expect(f.writeAndConfirm).not.toHaveBeenCalled();
    expect(tree!.root.findByType(P07Frame).props.panel).toBe(3);
  });
  it('rechecks a now-active product without rewriting an old inactive prepare or reporting success', async () => {
    const f = flow();
    const saved = {
      stage: 'UNKNOWN',
      itemId: 'item-a',
      hardwareUid: 'UID-TEST',
      preparation: {
        item: { item_id: 'item-a', serial_number: 'SN-TEST' },
        sku: { status: 'INACTIVE' },
      },
    };
    (f.snapshot as jest.Mock).mockReturnValue(saved);
    f.reconcile.mockResolvedValue('UNKNOWN');
    (createNativeNfcAssignment as jest.Mock).mockReturnValue(f);
    (resolveNfcCode as jest.Mock).mockResolvedValue({
      resolved: true,
      item: { item_id: 'item-a' },
      sku: { status: 'ACTIVE' },
    });
    await mount();
    await press('Kiểm tra kết quả liên kết');
    expect(view()).toContain('Sản phẩm hiện đang hoạt động');
    expect(view()).toContain('WMS chưa có xác nhận hoàn tất');
    expect(f.writeAndConfirm).not.toHaveBeenCalled();
    expect(saved.preparation.sku.status).toBe('INACTIVE');
  });
  it('only confirmed receipt opens S04; missing linker/warehouse remain absent, UID copy shares value cell', async () => {
    const f = flow();
    (f.snapshot as jest.Mock).mockReturnValue({
      stage: 'CONFIRMED',
      itemId: 'item-a',
      hardwareUid: 'UID-TEST',
      preparation: {},
      result: {
        nfc: {
          hardware_uid: 'UID-TEST',
          physical_code_id: 'tag-a',
          assigned_warehouse: null,
          linker: null,
        },
        item: { item_id: 'item-a', serial_number: 'SN-TEST' },
        sku: { name: 'TEST' },
      },
    });
    (createNativeNfcAssignment as jest.Mock).mockReturnValue(f);
    await mount();
    expect(tree!.root.findByType(P07Frame).props.panel).toBe(4);
    expect(view()).toContain('Đã liên kết thẻ NFC');
    const copy = tree!.root
      .findAll(n => typeof n.props.onPress === 'function')
      .find(n => n.props.accessibilityLabel === 'Sao chép Mã thẻ (UID)')!;
    expect(
      copy.parent!.findAll(n => n.props.children === 'UID-TEST').length,
    ).toBeGreaterThan(0);
    expect(view()).not.toContain('Kho TEST');
  });
});
