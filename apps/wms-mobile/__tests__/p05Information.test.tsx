// S01 rendering/state preservation checks. Visual approval comes from actual images.
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import {
  P05Information,
  P05SourceField,
} from '../src/features/outbound/P05Information';
import type { Snapshot } from '../src/features/outbound/linked/types';
const empty = {
  step: 1,
  source: null,
  document: null,
  busy: false,
  context: {
    active_warehouse_id: 'warehouse',
    available_warehouses: [
      { warehouse_id: 'warehouse', name: 'Kho đã xác nhận', status: 'ACTIVE' },
    ],
    permissions: { read: true, save: true, record: true, cancel: true },
  },
} as unknown as Snapshot;
const labels = [
  'Kho xuất',
  'Mã phiếu',
  'Người nhận',
  'Số điện thoại',
  'Địa chỉ giao',
  'Số lượng cần soạn',
  'Nhóm hàng',
  'Ghi chú',
];
test('S01 reserves all eight form positions before selecting source, with no editable metadata or invented values', async () => {
  const before = JSON.stringify(empty),
    choose = jest.fn();
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <P05Information
        state={empty}
        locked={false}
        onChoose={choose}
        onRead={() => undefined}
        onLegacy={() => undefined}
      />,
    );
  });
  expect(
    tree.root.findAllByType(P05SourceField).map(f => f.props.label),
  ).toEqual(labels);
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  const selector = tree.root.findAll(
    n => n.props.testID === 'p05-source-select' && !!n.props.onPress,
  )[0];
  await act(async () => selector.props.onPress());
  expect(choose).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(empty)).toBe(before);
  expect(
    tree.root
      .findAllByType(P05SourceField)
      .slice(2)
      .every(f => f.props.value === 'Chưa chọn nguồn'),
  ).toBe(true);
  act(() => tree.unmount());
});
test('selected source values stay readonly and exact, preserve missing contact/TEXT address and authoritative plan above99', async () => {
  const state = {
    ...empty,
    source: { doc_no: 'PX-VERIFIED' },
    document: {
      warehouseName: 'Kho đã xác nhận',
      recipient: 'Khách vãng lai',
      phone: '',
      address: 'Địa chỉ văn bản,không dataset',
      planned: 100,
      group: 'SKU-A, SKU-B',
      note: 'Ghi chú\nUnicode ✓',
    },
  } as unknown as Snapshot;
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <P05Information
        state={state}
        locked={false}
        onChoose={() => undefined}
        onRead={() => undefined}
        onLegacy={() => undefined}
      />,
    );
  });
  const fields = tree.root.findAllByType(P05SourceField);
  expect(
    fields.find(f => f.props.label === 'Số lượng cần soạn')?.props.value,
  ).toBe('100');
  expect(fields.find(f => f.props.label === 'Địa chỉ giao')?.props.value).toBe(
    state.document?.address,
  );
  expect(fields.find(f => f.props.label === 'Số điện thoại')?.props.value).toBe(
    'Chưa có trên phiếu nguồn',
  );
  expect(fields.find(f => f.props.label === 'Ghi chú')?.props.value).toBe(
    state.document?.note,
  );
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  act(() => tree.unmount());
});
test('busy/UNKNOWN selector is disabled; legacy notice is a link opening existing reader, not a replacement form', async () => {
  const legacy = jest.fn();
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <P05Information
        state={empty}
        locked
        onChoose={() => undefined}
        onRead={() => undefined}
        hasLegacy
        onLegacy={legacy}
      />,
    );
  });
  expect(
    tree.root.findAll(
      n => n.props.testID === 'p05-source-select' && !!n.props.onPress,
    )[0].props.disabled,
  ).toBe(true);
  const link = tree.root.findAll(
    n =>
      n.props.accessibilityLabel === 'Thông tin bản nháp trước' &&
      !!n.props.onPress,
  )[0];
  act(() => link.props.onPress());
  expect(legacy).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});
test('long field has two-line excerpt and full reader only after measured truncation, without changing raw metadata', async () => {
  const raw = ('Địa chỉ dài\n' + 'A'.repeat(300) + ' ✓').repeat(4),
    read = jest.fn();
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <P05SourceField
        label="Địa chỉ"
        value={raw}
        icon="pin"
        onRead={read}
      />,
    );
  });
  const measure = tree.root
    .findAllByType(Text)
    .find(n => typeof n.props.onTextLayout === 'function')!;
  act(() =>
    measure.props.onTextLayout({
      nativeEvent: { lines: [{ text: '1' }, { text: '2' }, { text: '3' }] },
    }),
  );
  const button = tree.root.findAll(
    n =>
      n.props.accessibilityLabel === 'Xem đầy đủ Địa chỉ' &&
      !!n.props.onPress,
  )[0];
  act(() => button.props.onPress());
  expect(read).toHaveBeenCalledWith('Địa chỉ', raw);
  expect(tree.root.findByType(P05SourceField).props.value).toBe(raw);
  expect(
    tree.root.findAllByType(Text).some(n => n.props.numberOfLines === 2),
  ).toBe(true);
  act(() => tree.unmount());
});
