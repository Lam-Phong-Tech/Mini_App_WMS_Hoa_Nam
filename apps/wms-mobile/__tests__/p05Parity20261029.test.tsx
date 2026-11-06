// Scoped UI/data regression. No server/hardware or actual session is used.
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text, View, Platform, StyleSheet } from 'react-native';
import { AppProviders } from '../src/app/App';
import { P05CreateNativeFlow } from '../src/features/outbound/P05CreateNativeFlow';
import { P05LinkedNativeFlow } from '../src/features/outbound/P05NativeFlow';
import { P05ReviewContent } from '../src/features/outbound/P05ReviewContent';
import { P05SourceField } from '../src/features/outbound/P05Information';
import { P04Frame } from '../src/features/inbound/P04Frame';
import { P05TextMeasure } from '../src/features/outbound/P05TextMeasure';
import { canP05ReviewHandoff } from '../src/features/outbound/p05ReviewPolicy';
import { createP05CreateOwner } from '../src/features/outbound/p05CreateOwner';
import { createP05NativeOwner } from '../src/features/outbound/p05NativeOwner';
import { createStorage, createMemoryBackend } from '../src/storage/storage';
import type {
  Context,
  AcceptedCode,
  Snapshot,
} from '../src/features/outbound/linked/types';
import type { P05CreateState } from '../src/features/outbound/p05CreateOwner';
import type { P05ResolverBinding } from '../src/features/outbound/linked/p05-owner-checks';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const codes: AcceptedCode[] = [
  {
    raw: 'TEST-RAW-1',
    itemId: id(6),
    skuId: id(7),
    sku: 'TEST-SKU',
    source: 'MANUAL',
    quantity: 1,
  },
];
const context: Context = {
  actor_id: id(1),
  auth_session_id: id(2),
  active_warehouse_id: id(3),
  warehouse_context: { status: 'READY' },
  available_warehouses: [
    { warehouse_id: id(3), name: 'Kho TEST', status: 'ACTIVE' },
  ],
  permissions: { read: true, save: true, record: true, cancel: true },
  record: { reconcile_mode: 'P03_LINKED' },
  address_contract: { format: 'TEXT', structured_codes_supported: false },
};
function checkIntent(): P05ResolverBinding {
  return {
    contract: 'p05-resolver-owner-v1',
    requestId: id(10),
    scope: { actorId: id(1), authSessionId: id(2), warehouseId: id(3) },
    draftId: id(4),
    scanSessionId: id(5),
    version: 1,
    purpose: 'REVALIDATE',
    body: { warehouse_id: id(3), raw_code: codes[0]!.raw },
    outcome: 'UNKNOWN',
  };
}
function ready() {
  return {
    step: 3,
    draftId: id(4),
    scanSessionId: id(5),
    busy: false,
    scanBusy: false,
    unknown: false,
    pending: null,
    error: '',
    outcome: null,
    accepted: codes,
  };
}

test('review UI actions reject command/resolver uncertainty, stale identity, terminal result and foreign raw without mutating evidence', () => {
  const s = ready();
  expect(canP05ReviewHandoff(s, s, codes[0]!.raw)).toBe(true);
  const intent = checkIntent(),
    raw = JSON.stringify(intent);
  for (const patch of [
    { busy: true },
    { scanBusy: true },
    { unknown: true },
    { pending: { key: id(9) } },
    { ownerChecks: [intent] },
    { error: 'revalidation failed' },
    { outcome: 'recorded' },
    { recorded: true },
    { step: 4 },
  ])
    expect(canP05ReviewHandoff({ ...s, ...patch }, s, codes[0]!.raw)).toBe(
      false,
    );
  expect(canP05ReviewHandoff({ ...s, draftId: id(8) }, s, codes[0]!.raw)).toBe(
    false,
  );
  expect(canP05ReviewHandoff(s, s, 'FOREIGN')).toBe(false);
  expect(JSON.stringify(intent)).toBe(raw);
});

test.each(['manual', 'linked'] as const)(
  '%s review keeps NFC outside the V4 manual approval screen and guards linked handoff',
  async kind => {
    const storage = createStorage(createMemoryBackend());
    const mb = createP05CreateOwner({ storage, uuid: () => id(20) }),
      lb = createP05NativeOwner({ storage, onChange: () => {} });
    const ms: P05CreateState = {
      ...mb.snapshot(),
      ...ready(),
      step: 3,
      context,
      version: 1,
      form: {
        ...mb.snapshot().form,
        name: 'TEST',
        recipient: 'TEST',
        phone: '0901234567',
        address: '12 TEST',
        province: '79',
        provinceName: 'TP TEST',
        ward: '1',
        wardName: 'Phường TEST',
        group: 'TEST',
        plannedInput: '2',
      },
    };
    const ls: Snapshot = {
      ...lb.snapshot(),
      ...ready(),
      step: 3,
      context,
      draftVersion: 1,
      error: null,
      outcome: null,
      document: {
        documentId: id(9),
        actorId: id(1),
        authSessionId: id(2),
        warehouseId: id(3),
        scanSessionId: id(5),
        warehouseName: 'Kho TEST',
        number: 'PX-TEST',
        recipient: 'TEST',
        phone: '0901234567',
        address: 'TEST',
        note: '',
        planned: 2,
        group: 'TEST',
      },
    };
    const noop = jest.fn(),
      send = jest.fn(async () => false),
      save = jest.fn(async () => false),
      assign = jest.fn();
    const mo = {
      ...mb,
      snapshot: () => ms,
      initialize: jest.fn(async () => true),
      leave: noop,
      isDirty: () => false,
      canRecord: () => false,
      send,
      save,
    };
    const lo = {
      ...lb,
      snapshot: () => ls,
      initialize: jest.fn(async () => true),
      start: () => true,
      leave: noop,
      canRecord: () => false,
      send,
      save,
    };
    let t!: Renderer.ReactTestRenderer;
    await act(async () => {
      t = Renderer.create(
        <AppProviders>
          {kind === 'manual' ? (
            <P05CreateNativeFlow
              owner={mo}
              onExit={noop}
              onAssignNfc={assign}
            />
          ) : (
            <P05LinkedNativeFlow
              owner={lo}
              returnDocumentId={id(9)}
              onExit={noop}
              onAssignNfc={assign}
            />
          )}
        </AppProviders>,
      );
    });
    const review = t.root.findByType(P05ReviewContent);
    const callback = review.props.onAssignNfc;
    const s = kind === 'manual' ? ms : ls;
    const before = JSON.stringify(s.accepted);
    if (kind === 'manual') {
      expect(callback).toBeUndefined();
      expect(review.props.documentNo).toBeNull();
      expect(JSON.stringify(t.toJSON())).toContain('Chưa được cấp');
      expect(JSON.stringify(t.toJSON())).toContain('Bước 3/3');
      expect(JSON.stringify(t.toJSON())).not.toContain('Gán NFC');
      expect(JSON.stringify(t.toJSON())).not.toContain('Đang soạn');
      expect(JSON.stringify(t.toJSON())).toContain('Gửi duyệt');
      expect(assign).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
      expect(JSON.stringify(s.accepted)).toBe(before);
      await act(async () => t.unmount());
      return;
    }
    s.ownerChecks = [checkIntent()];
    act(() => callback(codes[0]!.raw, 'TEST'));
    expect(assign).not.toHaveBeenCalled();
    s.ownerChecks = [];
    act(() => callback('FOREIGN', 'TEST'));
    expect(assign).not.toHaveBeenCalled();
    act(() => callback(codes[0]!.raw, 'TEST'));
    expect(assign.mock.calls).toEqual([[codes[0]!.raw, 'TEST']]);
    expect(JSON.stringify(s.accepted)).toBe(before);
    expect(send).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    await act(async () => t.unmount());
  },
);

test('latest Note removes edit-delivery; return-to-scanner keeps the same owner without SAVE/RECORD', async () => {
  const b = createP05CreateOwner({
    storage: createStorage(createMemoryBackend()),
    uuid: () => id(20),
  });
  const s: P05CreateState = {
    ...b.snapshot(),
    ...ready(),
    step: 3,
    context,
    version: 2,
    form: {
      ...b.snapshot().form,
      name: 'TEST',
      recipient: 'TEST',
      plannedInput: '2',
    },
  };
  const before = JSON.stringify([
      s.draftId,
      s.scanSessionId,
      s.version,
      s.accepted,
      s.form,
    ]),
    back = jest.fn(() => {
      s.step = (s.step - 1) as 1 | 2 | 3;
      return true;
    }),
    save = jest.fn(async () => false),
    send = jest.fn(async () => false);
  const owner = {
    ...b,
    snapshot: () => s,
    initialize: async () => true,
    leave: () => {},
    canRecord: () => false,
    isDirty: () => false,
    back,
    save,
    send,
  };
  let t!: Renderer.ReactTestRenderer;
  await act(async () => {
    t = Renderer.create(
      <AppProviders>
        <P05CreateNativeFlow owner={owner} onExit={() => {}} />
      </AppProviders>,
    );
  });
  expect(t.root.findByType(P05ReviewContent).props.onEditDelivery).toBeUndefined();
  await act(async () => {
    const footer=t.root.findByType(P04Frame).props.footer;
    footer.props.children.props.children[0].props.onPress();
  });
  expect(s.step).toBe(2);
  expect(back).toHaveBeenCalledTimes(1);
  expect(save).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  expect(
    JSON.stringify([s.draftId, s.scanSessionId, s.version, s.accepted, s.form]),
  ).toBe(before);
  await act(async () => t.unmount());
});

test('review totals distinguish accepted quantity, SKU identity and planned quantity; list expansion is readonly', () => {
  const accepted = [
      ...codes,
      { ...codes[0]!, raw: 'TEST2', itemId: id(8), skuId: id(9) },
    ],
    before = JSON.stringify(accepted);
  let t!: Renderer.ReactTestRenderer;
  act(() => {
    t = Renderer.create(
      <P05ReviewContent
        title="TEST"
        warehouse="Kho"
        recipient="TEST"
        phone="0901234567"
        address="TEST"
        group="TEST"
        planned={10}
        accepted={accepted}
      />,
    );
  });
  expect(t.root.findAll(n=>n.props.testID==='p05-review-totals')).toHaveLength(0);
  expect(t.root.findAll(n=>typeof n.props.testID==='string' && n.props.testID.startsWith('p05-review-group-') && n.type===View)).toHaveLength(2);
  expect(JSON.stringify(t.toJSON())).toContain('Số lượng đã soạn');
  expect(JSON.stringify(t.toJSON())).toContain('Còn thiếu 8 sản phẩm');
  act(() =>
    t.root
      .find(
        n =>
          n.props.accessibilityLabel === 'Xem tất cả mã đã soạn' &&
          !!n.props.onPress,
      )
      .props.onPress(),
  );
  expect(JSON.stringify(t.toJSON())).toContain('TEST2');
  expect(JSON.stringify(accepted)).toBe(before);
  act(() => t.unmount());
});

test('Web long readonly field gains a measured full reader without opacity overflow or text loss', () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  const value = 'Dòng 1\n' + '長🙂'.repeat(1000),
    read = jest.fn();
  let t!: Renderer.ReactTestRenderer;
  act(() => {
    t = Renderer.create(
      <P05SourceField label="Kho xuất" value={value} onRead={read} />,
    );
  });
  const m = t.root.findByType(P05TextMeasure);
  expect(StyleSheet.flatten(m.findByType(View).props.style)).toMatchObject({
    height: 0,
    overflow: 'hidden',
  });
  const text = m.findByType(Text);
  act(() => text.props.onLayout({ nativeEvent: { layout: { height: 63 } } }));
  act(() =>
    t.root
      .find(
        n =>
          n.props.accessibilityLabel === 'Xem đầy đủ Kho xuất' &&
          !!n.props.onPress,
      )
      .props.onPress(),
  );
  expect(read.mock.calls).toEqual([['Kho xuất', value]]);
  act(() => t.unmount());
  jest.restoreAllMocks();
});
