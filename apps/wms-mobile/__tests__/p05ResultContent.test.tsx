// Isolated component/navigation regression. No live receipt or HTTP is fabricated.
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text, View } from 'react-native';
import {
  P05ResultContent,
  useP05ResultActions,
} from '../src/features/outbound/P05ResultContent';
import { P04Icon } from '../src/features/inbound/P04Icon';
import { AppProviders } from '../src/app/App';
import { Button } from '../src/ui/Button';
import { P05CreateNativeFlow } from '../src/features/outbound/P05CreateNativeFlow';
import { P05LinkedNativeFlow } from '../src/features/outbound/P05NativeFlow';
import { createP05CreateOwner } from '../src/features/outbound/p05CreateOwner';
import { createP05NativeOwner } from '../src/features/outbound/p05NativeOwner';
import type {
  CurrentDocument,
  Snapshot,
  Context,
} from '../src/features/outbound/linked/types';
import { createStorage, createMemoryBackend } from '../src/storage/storage';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const labels = [
  'Mã phiếu',
  'Kho xuất',
  'Người nhận',
  'Số lượng đã soạn',
  'Thời gian gửi',
  'Trạng thái',
];
const context: Context = {
  actor_id: id(1),
  auth_session_id: id(2),
  active_warehouse_id: id(3),
  warehouse_context: { status: 'READY' },
  available_warehouses: [
    {
      warehouse_id: id(9),
      name: 'Không phải kho đã xác nhận',
      status: 'ACTIVE',
    },
    { warehouse_id: id(3), name: 'Kho đã xác nhận', status: 'ACTIVE' },
  ],
  permissions: { read: true, save: true, record: true, cancel: true },
  record: { reconcile_mode: 'P03_LINKED' },
  address_contract: { format: 'TEXT', structured_codes_supported: false },
};
const props = {
  documentNo: 'PX-TEST',
  warehouseName: 'Kho đã xác nhận',
  recipient: 'Người nhận TEST',
  count: 3,
  planned: 3,
  sentAt: '2026-10-11T14:40:07.621356Z',
  current: null,
  onRead: jest.fn(),
};
const row = (t: Renderer.ReactTestRenderer, label: string) =>
  t.root.findByProps({ testID: `p05-result-row-${label}` });
const text = (t: Renderer.ReactTestRenderer) => JSON.stringify(t.toJSON());
test('S03→S04 result controls ignore the tail of the send gesture; a different result never inherits readiness', () => {
  jest.useFakeTimers();
  function Ready({ step, recordId }: { step: number; recordId: string }) {
    return <Text>{String(useP05ResultActions(step, recordId))}</Text>;
  }
  let t!: Renderer.ReactTestRenderer;
  act(() => {
    t = Renderer.create(<Ready step={4} recordId="first" />);
  });
  expect(t.root.findByType(Text).props.children).toBe('false');
  act(() => jest.advanceTimersByTime(349));
  expect(t.root.findByType(Text).props.children).toBe('false');
  act(() => jest.advanceTimersByTime(1));
  expect(t.root.findByType(Text).props.children).toBe('true');
  act(() => t.update(<Ready step={4} recordId="second" />));
  expect(t.root.findByType(Text).props.children).toBe('false');
  act(() => t.unmount());
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});
function render(
  p: Partial<React.ComponentProps<typeof P05ResultContent>> = {},
) {
  let tree!: Renderer.ReactTestRenderer;
  act(() => {
    tree = Renderer.create(<P05ResultContent {...props} {...p} />);
  });
  return tree;
}

test('latest Note result uses green check and six source rows with historical waiting state', () => {
  const t = render();
  expect(t.root.findAllByType(P04Icon)[0]!.props.name).toBe('check');
  expect(
    t.root.findByProps({ accessibilityRole: 'header' }).props.children,
  ).toBe('Đã gửi duyệt phiếu xuất');
  expect(t.root.findAllByType(View).filter(n=>n.props.testID==='p05-result-steps')).toHaveLength(0);
  const rows = t.root
    .findByProps({ testID: 'p05-result-summary' })
    .findAllByType(View)
    .filter(
      n =>
        typeof n.props.testID === 'string' &&
        n.props.testID.startsWith('p05-result-row-'),
    );
  expect(rows.map(n => n.props.testID)).toEqual(
    labels.map(l => `p05-result-row-${l}`),
  );
  expect(
    row(t, 'Số lượng đã soạn')
      .findAllByType(Text)
      .map(n => n.props.children),
  ).toContain('3 / 3');
  expect(
    row(t, 'Thời gian gửi')
      .findAllByType(Text)
      .map(n => n.props.children),
  ).toContain('11/10/2026 21:40');
  expect(text(t)).toContain('Chưa ghi sổ');
  expect(text(t)).toContain('Chờ xử lý trên Web');
  expect(text(t)).not.toContain('Chờ duyệt');
  act(() => t.unmount());
});

test('missing receipt metadata is explicit and does not generate a date, number or warehouse', () => {
  const t = render({
    documentNo: null,
    warehouseName: undefined,
    recipient: null,
    count: NaN,
    sentAt: '   ',
  });
  for (const l of labels.slice(0, 2))
    expect(
      row(t, l)
        .findAllByType(Text)
        .map(n => n.props.children),
    ).toContain('Chưa xác minh');
  expect(text(t)).toContain('Chưa xác minh thời gian');
  expect(text(t)).not.toContain('11/10/2026');
  act(() => t.unmount());
});

test.each(['POSTED', 'CANCELLED', 'REVERSED', 'DRAFT'] as const)(
  'later Web %s remains distinct from the historical send result',
  status => {
    const current: CurrentDocument = {
      status,
      posted: status === 'POSTED',
      document: { id: id(4), status, src_warehouse_id: id(3), version: 6 },
      observed_at: '2026-10-11T15:00:00Z',
      history: [],
    };
    const t = render({ current });
    expect(text(t)).toContain('Trạng thái hiện tại:');
    expect(text(t)).not.toContain('Phiếu đang chờ xử lý trên Web.');
    expect(text(t)).toContain('Chưa ghi sổ');
    expect(
      t.root.findByProps({ accessibilityRole: 'header' }).props.children,
    ).toBe('Đã gửi duyệt phiếu xuất');
    expect(
      t.root
        .findByProps({ testID: 'p05-result-summary' })
        .findAllByType(Text)
        .filter(n => labels.includes(n.props.children)),
    ).toHaveLength(6);
    act(() => t.unmount());
  },
);

test.each(['Mã phiếu', 'Kho xuất'])(
  'measured long %s has a reader preserving raw Unicode/newlines and hides it again when it fits',
  label => {
    const raw = 'Dòng đầu\n' + '長🙂'.repeat(1000),
      onRead = jest.fn();
    const t = render({
      [label === 'Kho xuất' ? 'warehouseName' : 'documentNo']: raw,
      onRead,
    });
    const measurement = row(t, label)
      .findAllByType(Text)
      .find(n => n.props.onTextLayout)!;
    expect(measurement.props.accessible).toBe(false);
    act(() =>
      measurement.props.onTextLayout({ nativeEvent: { lines: [{}, {}, {}] } }),
    );
    const button = row(t, label).find(
      n => n.props.accessibilityRole === 'button' && !!n.props.onPress,
    );
    expect(button.findAllByType(Button)).toHaveLength(0);
    act(() => button.props.onPress());
    expect(onRead.mock.calls).toEqual([[label, raw]]);
    act(() =>
      measurement.props.onTextLayout({ nativeEvent: { lines: [{}, {}] } }),
    );
    expect(row(t, label).findAll(n => !!n.props.onPress)).toHaveLength(0);
    act(() => t.unmount());
  },
);

test.each(['manual', 'linked'] as const)(
  '%s S04 retains the real document callbacks and never dispatches SAVE/RECORD/reset from the result or reader',
  async kind => {
    const storage = createStorage(createMemoryBackend());
    const accepted = [1, 2, 3].map(n => ({
      raw: `TEST-${n}`,
      source: 'MANUAL' as const,
      itemId: id(10 + n),
      skuId: id(20),
      sku: 'SKU',
      quantity: 1 as const,
    }));
    const save = jest.fn(),
      send = jest.fn(),
      retrySame = jest.fn(),
      leave = jest.fn();
    const read = jest.fn(async () => true),
      onViewDocument = jest.fn(),
      onHistory = jest.fn(),
      onExit = jest.fn();
    const common = {
      initialize: jest.fn(async () => true),
      save,
      send,
      retrySame,
      leave,
      isDirty: () => false,
    };
    const manualBase = createP05CreateOwner({ storage });
    const manualState = {
      ...manualBase.snapshot(),
      step: 4 as const,
      context,
      accepted,
      documentId: id(4),
      documentNo: 'PX-TEST',
      committedAt: props.sentAt,
      outcome: 'recorded' as const,
    };
    const linkedBase = createP05NativeOwner({ storage, onChange: () => {} });
    const linkedState: Snapshot = {
      ...linkedBase.snapshot(),
      step: 4,
      context,
      accepted,
      recorded: true,
      outcome: 'recorded',
      sentAt: props.sentAt,
      document: {
        documentId: id(4),
        actorId: id(1),
        authSessionId: id(2),
        warehouseId: id(3),
        scanSessionId: id(5),
        warehouseName: 'Kho đã xác nhận',
        number: 'PX-TEST',
        recipient: 'Người nhận',
        phone: '0901234567',
        address: 'TEST',
        note: '',
        planned: 3,
        group: 'Nhóm',
      },
    };
    const manualOwner = {
      ...manualBase,
      ...common,
      snapshot: () => manualState,
      readCurrent: read,
    };
    const linkedOwner = {
      ...linkedBase,
      ...common,
      snapshot: () => linkedState,
      refreshCurrent: read,
      start: jest.fn(() => true),
    };
    const unchanged = JSON.stringify(
      kind === 'manual' ? manualState : linkedState,
    );
    let t!: Renderer.ReactTestRenderer;
    await act(async () => {
      t = Renderer.create(
        <AppProviders>
          {kind === 'manual' ? (
            <P05CreateNativeFlow
              owner={manualOwner}
              returnDocumentId={id(4)}
              onViewDocument={onViewDocument}
              onHistory={onHistory}
              onExit={onExit}
            />
          ) : (
            <P05LinkedNativeFlow
              owner={linkedOwner}
              returnDocumentId={id(4)}
              onViewDocument={onViewDocument}
              onHistory={onHistory}
              onExit={onExit}
            />
          )}
        </AppProviders>,
      );
    });
    expect(t.root.findByType(P05ResultContent).props.warehouseName).toBe(
      'Kho đã xác nhận',
    );
    expect(t.root.findByType(P05ResultContent).props.count).toBe(3);
    act(() =>
      t.root
        .findByType(P05ResultContent)
        .props.onRead('Kho', 'Nguồn\n' + '長'.repeat(2000)),
    );
    expect(text(t)).toContain('Nguồn\\n');
    const tap = async (label: string) => {
      await act(async () => {
        t.root
          .findAllByType(Button)
          .find(n => n.props.label === label || n.props.accessibilityLabel === label)!
          .props.onPress();
      });
    };
    await tap('Đóng');
    await tap('Xem chứng từ');
    expect(read).toHaveBeenCalledTimes(1);
    expect(onViewDocument.mock.calls).toEqual([[id(4)]]);
    expect(onHistory).not.toHaveBeenCalled();
    await tap('Về Trang chủ');
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(retrySame).not.toHaveBeenCalled();
    expect(JSON.stringify(kind === 'manual' ? manualState : linkedState)).toBe(
      unchanged,
    );
    await act(async () => t.unmount());
  },
);
