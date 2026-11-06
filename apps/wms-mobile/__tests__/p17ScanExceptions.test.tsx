import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { ScrollView, View } from 'react-native';
import {
  P17ScanExceptions,
  p17CopyIdentity,
  type P17ScanExceptionsProps,
  type P17View,
} from '../src/features/scan/P17ScanExceptions';
import { P17Action } from '../src/features/scan/P17Primitives';
import { Dialog } from '../src/ui/Dialog';
import { resetHardwareBackForTest } from '../src/app/useHardwareBack';

const s01: P17View = Object.freeze({
  panel: 'P17.S01',
  raw: 'QR-EXACT <&>\nĐặng',
  reason: 'Không tìm thấy mã trong danh mục sản phẩm đang dùng.',
  context: { documentNo: 'PN-OWNER-1', acceptedCodeCount: 1 },
});
const s02: P17View = {
  panel: 'P17.S02',
  raw: 'RAW-CODE',
  reasonCode: 'ITEM_ALREADY_MATCHED',
  context: { documentNo: 'PX-OWNER-2', acceptedCodeCount: 2 },
  product: { name: 'Máy đã xác minh', sku: 'SKU-REAL' },
  relatedDocument: null,
};
const s03: P17View = {
  panel: 'P17.S03',
  verification: 'verified',
  physicalCodeId: 'tag-exact-id',
  uid: 'AA11',
  status: 'ASSIGNED',
  statusLabel: 'Đã liên kết',
  product: { sku: 'SKU-LINKED', serial: 'SER-LINKED' },
  canViewLink: true,
};
const s04: P17View = {
  panel: 'P17.S04',
  owner: 'P04',
  phase: 'unknown',
  context: { documentNo: 'PN-OWNER-1', acceptedCodeCount: 3 },
  identity: {
    operationKey: 'operation-key-original',
    draftId: 'draft-original',
    scanSessionId: 'scan-original',
    version: 2,
    command: 'RECORD',
  },
  sentAt: '2026-10-29T02:10:00Z',
  actorName: 'TEST UI',
  canCheck: true,
};
const trees: Renderer.ReactTestRenderer[] = [];
const text = (tree: Renderer.ReactTestRenderer) =>
  JSON.stringify(tree.toJSON());
function render(view: P17View, patch: Partial<P17ScanExceptionsProps> = {}) {
  const props = {
    scopeKey: 'opaque-scope-1',
    view,
    isCurrent: () => true,
    onBack: jest.fn(),
    ...patch,
  };
  let tree!: Renderer.ReactTestRenderer;
  act(() => {
    tree = Renderer.create(<P17ScanExceptions {...props} />);
  });
  trees.push(tree);
  return { tree, props };
}
function press(tree: Renderer.ReactTestRenderer, label: string) {
  const control = tree.root.findAll(
    n =>
      typeof n.props.onPress === 'function' &&
      n.props.accessibilityLabel === label,
  )[0];
  if (!control) throw new Error('Missing button ' + label);
  act(() => {
    control.props.onPress();
  });
}
const action = (tree: Renderer.ReactTestRenderer, label: string) =>
  tree.root.findAllByType(P17Action).find(n => n.props.label === label)!;
afterEach(() => {
  act(() => trees.splice(0).forEach(t => t.unmount()));
  resetHardwareBackForTest();
  jest.clearAllMocks();
});

test('all four canonical panels render through real RN primitives without owner/API/hardware effects', () => {
  for (const view of [s01, s02, s03, s04]) {
    const { tree, props } = render(view);
    expect(tree.root.findByProps({ testID: view.panel })).toBeDefined();
    expect(props.onBack).not.toHaveBeenCalled();
  }
  expect(global.fetch).not.toHaveBeenCalled();
});

test('S01 preserves raw/accepted count, locks r04 Quét lại then Nhập mã and reuses parent nav', async () => {
  const manual = jest.fn(),
    scan = jest.fn();
  const { tree } = render(s01, {
    onManual: manual,
    onScanAgain: scan,
    footerNavigation: <View testID="existing-footer" />,
  });
  const dock = tree.root.findByProps({ testID: 'P17.action-dock' });
  expect(dock.findAllByType(P17Action).map(n => n.props.label)).toEqual([
    'Quét lại',
    'Nhập mã',
  ]);
  expect(text(tree)).toContain('Đã giữ 1 mã hợp lệ');
  expect(text(tree)).toContain('Camera chưa kết nối');
  expect(tree.root.findByProps({ testID: 'existing-footer' })).toBeDefined();
  press(tree, 'Nhập mã');
  expect(manual).toHaveBeenCalledWith(s01.raw);
  expect(scan).not.toHaveBeenCalled();
  expect(s01.raw).toBe('QR-EXACT <&>\nĐặng');
  await act(async () => {});
});

test.each([null, undefined, -1, NaN])(
  'missing/invalid count %s never becomes zero',
  acceptedCodeCount => {
    const { tree } = render({ ...s01, context: { acceptedCodeCount } });
    expect(text(tree)).toContain('Số mã hợp lệ chưa xác định');
    expect(text(tree)).not.toContain('Đã giữ 0');
  },
);

test('zero is displayed only when source explicitly supplies zero', () => {
  const { tree } = render({ ...s01, context: { acceptedCodeCount: 0 } });
  expect(text(tree)).toContain('Đã giữ 0 mã hợp lệ');
});

test('S02 masks redacted holder fields and even a reason containing the private number', () => {
  const related = {
    kind: 'redacted',
    documentId: 'HIDDEN-ID',
    number: 'PX-PRIVATE',
    status: 'PRIVATE-STATUS',
  };
  const open = jest.fn();
  const { tree } = render(
    {
      ...s02,
      reason: 'Held by PX-PRIVATE',
      relatedDocument: related,
    } as P17View,
    { onViewRelated: open },
  );
  for (const secret of ['PX-PRIVATE', 'HIDDEN-ID', 'PRIVATE-STATUS'])
    expect(text(tree)).not.toContain(secret);
  expect(text(tree)).toContain('chưa được cấp quyền xem');
  expect(action(tree, 'Xem phiếu liên quan')).toBeUndefined();
  expect(open).not.toHaveBeenCalled();
});

test('S02 visible holder opens exact source ID, no alternate routes or first-record fallback', async () => {
  const open = jest.fn();
  const { tree } = render(
    {
      ...s02,
      relatedDocument: {
        kind: 'visible',
        documentId: 'EXACT-HOLDER',
        number: 'PX-VISIBLE',
        status: 'SCANNING',
        canOpen: true,
      },
    },
    { onViewRelated: open },
  );
  press(tree, 'Xem phiếu liên quan');
  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith('EXACT-HOLDER');
  await act(async () => {});
});

test('S02 missing product/unit/stock is not fabricated; known error code is localized', () => {
  const { tree } = render({ ...s02, product: null });
  expect(text(tree)).toContain(
    'Sản phẩm đang được giữ cho một phiếu xuất khác.',
  );
  expect(text(tree)).not.toContain('ITEM_ALREADY_MATCHED');
  expect(text(tree)).not.toContain('0 tồn');
  expect(text(tree)).toContain('Chưa xác định');
});

test.each([
  { redacted: true, document_id: 'SECRET-ID', doc_no: 'PX-SECRET' },
  {
    kind: 'visible',
    canOpen: false,
    documentId: 'SECRET-ID',
    number: 'PX-SECRET',
  },
])(
  'S02 malformed or revoked holder cannot leak cached identity or reason',
  relatedDocument => {
    const { tree } = render({
      ...s02,
      reason: 'Held by PX-SECRET',
      relatedDocument,
    } as P17View);
    expect(text(tree)).not.toContain('SECRET-ID');
    expect(text(tree)).not.toContain('PX-SECRET');
    expect(action(tree, 'Xem phiếu liên quan')).toBeUndefined();
  },
);

test('S03 verified link has exact tag-ID read and cancel, never a write/overwrite action', async () => {
  const open = jest.fn(),
    cancel = jest.fn();
  const { tree } = render(s03, { onViewLink: open, onCancel: cancel });
  press(tree, 'Xem liên kết');
  expect(open).toHaveBeenCalledWith('tag-exact-id');
  await act(async () => {});
  press(tree, 'Hủy');
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(text(tree)).not.toContain('Ghi đè');
  await act(async () => {});
});

test.each(['unverified', 'verified'] as const)(
  'S03 %s unknown mapping never displays a false ASSIGNED product',
  verification => {
    const { tree } = render({ ...s03, verification, status: null });
    expect(text(tree)).toContain('Chưa xác minh liên kết');
    expect(text(tree)).not.toContain('Thẻ đã liên kết');
    expect(text(tree)).not.toContain('Sản phẩm đã liên kết');
    expect(text(tree)).not.toContain('SKU-LINKED');
    expect(action(tree, 'Xem liên kết').props.disabled).toBe(true);
  },
);

test('S03 LOCKED is separate from ASSIGNED, missing read permission disables detail', () => {
  const { tree } = render({
    ...s03,
    status: 'LOCKED',
    statusLabel: 'Đã khóa',
    canViewLink: false,
  });
  expect(text(tree)).toContain('Thẻ đã khóa');
  expect(action(tree, 'Xem liên kết').props.disabled).toBe(true);
});

test('S04 UNKNOWN retains identity and never enables Gửi lại, even after verified receipt read', () => {
  const original = JSON.stringify(s04);
  for (const phase of [
    'unknown',
    'checking',
    'verified-record',
    'verified-save',
    'verified-cancel',
    'unavailable',
  ] as const) {
    const { tree } = render({ ...s04, phase });
    expect(action(tree, 'Gửi lại').props.disabled).toBe(true);
  }
  expect(JSON.stringify(s04)).toBe(original);
});

test('S04 missing/naive timestamp remains unknown, explicit offset displays Vietnam instant', () => {
  const valid = render(s04).tree;
  expect(text(valid)).toContain('29/10/2026 09:10');
  const missing = render({ ...s04, sentAt: '2026-10-29 09:10:00' }).tree;
  expect(text(missing)).not.toContain('29/10/2026 09:10');
  expect(text(missing)).toContain('Chưa xác định');
});

test('status check is explicit single-flight and no async completion from old scope shows feedback', async () => {
  let resolve!: () => void;
  const check = jest.fn(
    () =>
      new Promise<void>(r => {
        resolve = r;
      }),
  );
  const { tree, props } = render(s04, { onCheck: check });
  const original = action(tree, 'Kiểm tra trạng thái').props.onPress;
  act(() => {
    original();
    original();
  });
  expect(check).toHaveBeenCalledTimes(1);
  expect(action(tree, 'Đang kiểm tra…').props.busy).toBe(true);
  act(() => {
    tree.update(
      <P17ScanExceptions
        {...props}
        scopeKey="new-scope"
        isCurrent={() => false}
      />,
    );
  });
  await act(async () => {
    resolve();
  });
  expect(tree.root.findByProps({ testID: 'P17.stale-owner' })).toBeDefined();
  expect(tree.root.findAllByType(Dialog)).toHaveLength(0);
});

test('check rejection is handled with one safe dialog, never private error details', async () => {
  const { tree } = render(s04, {
    onCheck: async () => {
      throw Error('PRIVATE-TOKEN');
    },
  });
  await act(async () => {
    action(tree, 'Kiểm tra trạng thái').props.onPress();
  });
  expect(tree.root.findByType(Dialog).props.visible).toBe(true);
  expect(tree.root.findByType(Dialog).props.dismissOnBackdrop).toBe(false);
  expect(text(tree)).not.toContain('PRIVATE-TOKEN');
});

test('copy allowlist excludes credentials/body/actor IDs and requires confirmed clipboard result', async () => {
  const identity = {
    ...s04.identity,
    accessToken: 'SECRET-TOKEN',
    body: { raw: 'PRIVATE-BODY' },
    authSessionId: 'AUTH-SECRET',
    requestId: 'DISTINCT-HTTP-TRACE',
  };
  const copy = jest.fn(
    async (_identity: Readonly<typeof s04.identity>, _scopeKey: string) => true,
  );
  const { tree } = render({ ...s04, identity }, { onCopyIdentity: copy });
  press(tree, 'Thông tin đối chiếu');
  await act(async () => {
    action(tree, 'Sao chép thông tin yêu cầu').props.onPress();
  });
  expect(copy).toHaveBeenCalledWith(s04.identity, 'opaque-scope-1');
  expect(Object.isFrozen(copy.mock.calls[0][0])).toBe(true);
  expect(tree.root.findByType(Dialog).props.title).toBe(
    'Đã sao chép thông tin yêu cầu',
  );
  for (const secret of [
    'SECRET-TOKEN',
    'PRIVATE-BODY',
    'AUTH-SECRET',
    'DISTINCT-HTTP-TRACE',
  ])
    expect(text(tree)).not.toContain(secret);
  expect(Object.keys(p17CopyIdentity(identity))).toEqual([
    'command',
    'operationKey',
    'draftId',
    'scanSessionId',
    'version',
  ]);
});

test('failed clipboard result is not announced as success', async () => {
  const { tree } = render(s04, { onCopyIdentity: async () => false });
  press(tree, 'Thông tin đối chiếu');
  await act(async () => {
    action(tree, 'Sao chép thông tin yêu cầu').props.onPress();
  });
  expect(tree.root.findByType(Dialog).props.title).toBe(
    'Chưa sao chép được thông tin',
  );
});

test('long Unicode/newline/raw value uses exact full reader and Back closes reader before owner', () => {
  const full = ('Đặng <&>\n' + 'W'.repeat(200)).repeat(10);
  const onBack = jest.fn();
  const { tree } = render({ ...s01, raw: full }, { onBack });
  const measure = tree.root.findAll(
    n =>
      n.props.testID === 'P17.measure.Mã đã đọc' &&
      typeof n.props.onLayout === 'function',
  )[0];
  act(() =>
    measure.props.onLayout({ nativeEvent: { layout: { height: 1800 } } }),
  );
  press(tree, 'Xem đầy đủ Mã đã đọc');
  expect(tree.root.findByType(Dialog).props.message).toBe(full);
  press(tree, 'Quay lại');
  expect(tree.root.findByType(Dialog).props.visible).toBe(false);
  expect(onBack).not.toHaveBeenCalled();
  press(tree, 'Quay lại');
  expect(onBack).toHaveBeenCalledTimes(1);
});

test('scope invalidation clears protected overlay and refuses old navigation callbacks', () => {
  const onBack = jest.fn();
  const { tree, props } = render(s01, { onBack });
  const back = tree.root.findAll(
    n =>
      typeof n.props.onPress === 'function' &&
      n.props.accessibilityLabel === 'Quay lại',
  )[0].props.onPress;
  act(() =>
    tree.update(<P17ScanExceptions {...props} isCurrent={() => false} />),
  );
  act(() => back());
  expect(onBack).not.toHaveBeenCalled();
  expect(tree.root.findAllByType(Dialog)).toHaveLength(0);
});

test('owner scroll callback does not edit view data or create requests; dock is outside scroller', () => {
  const notify = jest.fn();
  const { tree } = render(s04, {
    onScrollPositionChange: notify,
    initialScrollY: 80,
  });
  const scroller = tree.root.findByType(ScrollView);
  expect(scroller.findAllByProps({ testID: 'P17.action-dock' })).toHaveLength(
    0,
  );
  act(() =>
    scroller.props.onScroll({ nativeEvent: { contentOffset: { y: 125 } } }),
  );
  expect(notify).toHaveBeenCalledWith(125);
});

test('verified SAVE cannot be displayed as a RECORD receipt; request data is unchanged', () => {
  const view: P17View = {
    ...s04,
    phase: 'verified-record',
    identity: { ...s04.identity, command: 'SAVE' },
  };
  const before = JSON.stringify(view);
  const { tree } = render(view);
  expect(text(tree)).toContain('Chưa xác định kết quả lưu nháp');
  expect(text(tree)).not.toContain('Đã đối chiếu yêu cầu ghi nhận');
  expect(JSON.stringify(view)).toBe(before);
});

test('a throwing owner guard conceals source data without throwing into native UI', () => {
  const { tree } = render(s04, {
    isCurrent: () => {
      throw Error('old session');
    },
  });
  expect(tree.root.findByProps({ testID: 'P17.stale-owner' })).toBeDefined();
  expect(text(tree)).not.toContain('PN-OWNER-1');
});

test('an HTTP trace is never substituted for a missing original operation key', () => {
  const identity = {
    ...s04.identity,
    operationKey: null,
    requestId: 'TRACE-IS-NOT-KEY',
  };
  const copy = jest.fn(async () => true);
  const { tree } = render(
    { ...s04, phase: 'verified-record', identity },
    { onCopyIdentity: copy },
  );
  press(tree, 'Thông tin đối chiếu');
  expect(text(tree)).not.toContain('TRACE-IS-NOT-KEY');
  expect(text(tree)).toContain('Chưa xác định kết quả gửi');
  expect(action(tree, 'Sao chép thông tin yêu cầu').props.disabled).toBe(true);
  expect(copy).not.toHaveBeenCalled();
});
