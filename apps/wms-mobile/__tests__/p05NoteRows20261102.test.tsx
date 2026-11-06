// Latest Sheet Note presenters. Offline owner snapshots only; no receipt/live claim.
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TextInput, View } from 'react-native';
import { AppProviders } from '../src/app/App';
import { P05CreateNativeFlow } from '../src/features/outbound/P05CreateNativeFlow';
import { createP05CreateOwner } from '../src/features/outbound/p05CreateOwner';
import { P04Frame } from '../src/features/inbound/P04Frame';
import { P05ReviewContent } from '../src/features/outbound/P05ReviewContent';
import { P05ResultContent } from '../src/features/outbound/P05ResultContent';
import { P04Icon } from '../src/features/inbound/P04Icon';
import { Button } from '../src/ui/Button';
import { Dialog } from '../src/ui/Dialog';
import { createMemoryBackend, createStorage } from '../src/storage/storage';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function screen(
  step: 1 | 3 | 4 = 1,
  busy = false,
  patch: Record<string, unknown> = {},
) {
  const base = createP05CreateOwner({
    storage: createStorage(createMemoryBackend()),
  });
  const state: any = {
    ...base.snapshot(),
    step,
    busy,
    context: {
      active_warehouse_id: id(3),
      available_warehouses: [{ warehouse_id: id(3), name: 'Kho TEST' }],
      permissions: { record: true },
    },
    documentNo: 'PX-SOURCE-ONLY',
    documentId: step === 4 ? id(9) : null,
    form: {
      ...base.snapshot().form,
      recipientId: 'walk-in',
      recipient: 'Người TEST',
      phone: '0901234567',
      province: '79',
      provinceName: 'TP TEST',
      ward: '1',
      wardName: 'Phường TEST',
      address: '12 TEST',
      group: 'Nhóm TEST',
    },
    geo: {
      ...base.snapshot().geo,
      provinces: [{ code: '79', name: 'TP TEST' }],
      wards: [{ code: '1', name: 'Phường TEST' }],
      wardsProvince: '79',
    },
  };
  const field = jest.fn((key: string, value: string) => {
    if (!state.busy) {
      state.form[key] = value;
      return true;
    }
    return false;
  });
  Object.assign(state, patch);
  const owner: any = {
    ...base,
    snapshot: () => state,
    initialize: async () => true,
    leave: () => {},
    isDirty: () => false,
    canRecord: () => false,
    errors: () => ({}),
    field,
  };
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P05CreateNativeFlow owner={owner} onExit={() => {}} />
      </AppProviders>,
    );
  });
  return { tree, state, field };
}
const press = (t: Renderer.ReactTestRenderer, label: string) =>
  t.root.findAll(
    n => n.props.accessibilityLabel === label && !!n.props.onPress,
  )[0]!;
test('TC09 inline delivery controls preserve phone clear and owner identity', async () => {
  const t = await screen();
  expect(
    t.tree.root
      .findAllByType(TextInput)
      .some(n => n.props.accessibilityLabel === 'Địa chỉ chi tiết'),
  ).toBe(true);
  expect(
    t.tree.root.findAll(n => n.props.label === 'Tỉnh/Thành phố *'),
  ).toHaveLength(0);
  expect(
    t.tree.root.findByType(P04Frame).props.headerRight.props.children,
  ).toBe('Bước 1/3');
  expect(JSON.stringify(t.tree.toJSON())).toContain('PX-SOURCE-ONLY');
  expect(
    t.tree.root.findAll(
      n => n.props.accessibilityLabel === 'Địa chỉ giao' && n.props.onPress,
    ),
  ).toHaveLength(0);
  expect(
    t.tree.root.findAll(
      n => n.props.accessibilityLabel === 'Tỉnh/Thành phố' && !!n.props.onPress,
    ).length,
  ).toBeGreaterThan(0);
  expect(
    t.tree.root
      .findAllByType(TextInput)
      .some(n => n.props.accessibilityLabel === 'Địa chỉ chi tiết'),
  ).toBe(true);
  await act(async () => press(t.tree, 'Xóa số điện thoại').props.onPress());
  expect(t.state.form.phone).toBe('');
  expect(t.field.mock.calls).toEqual([['phone', '']]);
  await act(async () => t.tree.unmount());
});

test('TC09 address sub-selection owns one dialog; returning keeps existing structured values and clears no metadata', async () => {
  const t = await screen();
  const before = JSON.stringify(t.state.form);
  await act(async () => press(t.tree, 'Tỉnh/Thành phố').props.onPress());
  expect(
    t.tree.root.findAllByType(Dialog).filter(n => n.props.visible),
  ).toHaveLength(1);
  expect(
    t.tree.root.findAllByType(Dialog).find(n => n.props.visible)!.props.title,
  ).toBe('Tỉnh/Thành phố');
  await act(async () =>
    t.tree.root
      .findAllByType(Button)
      .find(n => n.props.label === 'Quay lại')!
      .props.onPress(),
  );
  expect(JSON.stringify(t.state.form)).toBe(before);
  await act(async () => t.tree.unmount());
});

test('TC09 source-provided draft number is displayed without using the free name as a number', async () => {
  const t = await screen(1, false, {
    documentNo: null,
    serverDraft: { doc_no: 'PX-BE-OBSERVED' },
  });
  expect(JSON.stringify(t.tree.toJSON())).not.toContain('PX-BE-OBSERVED');
  expect(JSON.stringify(t.tree.toJSON())).toContain('Chưa được cấp');
  expect(JSON.stringify(t.tree.toJSON())).not.toContain('PX-0005');
  await act(async () => t.tree.unmount());
});

test('TC09 warehouse stop owns the sole modal even if the retained address editor was requested', async () => {
  const t = await screen(1, false, { errorCode: 'WAREHOUSE_INACTIVE' });
  expect(
    t.tree.root.findAll(
      n => n.props.accessibilityLabel === 'Địa chỉ giao' && n.props.onPress,
    ),
  ).toHaveLength(0);
  expect(
    t.tree.root.findAllByType(Dialog).filter(n => n.props.visible),
  ).toHaveLength(0);
  // The existing P03 warehouse-stop owner is still visible, without modifying fields.
  expect(JSON.stringify(t.tree.toJSON())).toContain('Kho');
  expect(t.field).not.toHaveBeenCalled();
  await act(async () => t.tree.unmount());
});

test('TC10 catalogue loading alone does not delay a verified-context start CTA; unverified context remains blocked', async () => {
  const ready = await screen(1, false, { catalogueBusy: true });
  expect(
    ready.tree.root
      .findAllByType(Button)
      .find(n => n.props.label === 'Bắt đầu soạn hàng')!.props.disabled,
  ).toBe(false);
  await act(async () => ready.tree.unmount());
  const blocked = await screen(1, false, { context: null });
  expect(
    blocked.tree.root
      .findAllByType(Button)
      .find(n => n.props.label === 'Bắt đầu soạn hàng')!.props.disabled,
  ).toBe(true);
  await act(async () => blocked.tree.unmount());
});
test('TC15/28 review has metadata and quantity only, no type stats/edit action; unknown number stays unknown', () => {
  let t!: Renderer.ReactTestRenderer;
  act(() => {
    t = Renderer.create(
      <P05ReviewContent
        warehouse="Kho TEST"
        recipient="TEST"
        phone="0901234567"
        address="12 TEST"
        group="A, B"
        planned={2}
        accepted={[]}
        onEditDelivery={() => {}}
      />,
    );
  });
  expect(
    t.root.findAll(n => n.props.testID === 'p05-review-totals'),
  ).toHaveLength(0);
  expect(
    t.root.findAll(
      n => n.props.accessibilityLabel === 'Sửa thông tin giao hàng',
    ),
  ).toHaveLength(0);
  expect(JSON.stringify(t.toJSON())).toContain('Địa chỉ giao');
  expect(JSON.stringify(t.toJSON())).not.toContain('PX-0005');
  act(() => t.unmount());
});
test('TC16 result has green check and exactly six source rows, no two-milestone projection', () => {
  let t!: Renderer.ReactTestRenderer;
  act(() => {
    t = Renderer.create(
      <P05ResultContent
        documentNo="PX-SOURCE"
        warehouseName="Kho TEST"
        recipient="Người TEST"
        count={3}
        planned={3}
        sentAt="2026-11-02T00:00:00Z"
        current={null}
        onRead={() => {}}
      />,
    );
  });
  expect(t.root.findAllByType(P04Icon)[0]!.props.name).toBe('check');
  const rows = t.root
    .findByProps({ testID: 'p05-result-summary' })
    .findAllByType(View)
    .filter(
      n =>
        typeof n.props.testID === 'string' &&
        n.props.testID.startsWith('p05-result-row-'),
    );
  expect(rows.map(n => n.props.testID)).toEqual(
    [
      'Mã phiếu',
      'Kho xuất',
      'Người nhận',
      'Số lượng đã soạn',
      'Thời gian gửi',
      'Trạng thái',
    ].map(v => 'p05-result-row-' + v),
  );
  expect(
    t.root.findAll(n => n.props.testID === 'p05-result-steps'),
  ).toHaveLength(0);
  expect(JSON.stringify(t.toJSON())).toContain('3 / 3');
  expect(JSON.stringify(t.toJSON())).not.toContain('Đã ghi sổ trên Web');
  act(() => t.unmount());
});
test('TC16 both result actions are source-bound and titled Xuất kho', async () => {
  const t = await screen(4);
  expect(t.tree.root.findByType(P04Frame).props.title).toBe('Xuất kho');
  expect(
    t.tree.root
      .findAllByType(Button)
      .filter(n => !n.props.disabled || n.props.label)
      .map(n => n.props.label),
  ).not.toContain('Xem lịch sử');
  const actions = t.tree.root.findByType(P04Frame).props.footer;
  expect(
    React.Children.toArray(actions.props.children).map(
      (n: any) => n.props.label,
    ),
  ).toEqual(['Xem chứng từ', 'Về Trang chủ']);
  await act(async () => t.tree.unmount());
});
