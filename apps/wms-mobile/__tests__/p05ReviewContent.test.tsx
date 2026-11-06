import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text, View } from 'react-native';
import { P05ReviewContent } from '../src/features/outbound/P05ReviewContent';
import type {
  AcceptedCode,
  SourceLine,
} from '../src/features/outbound/linked/types';
const accepted: AcceptedCode[] = [
  {
    raw: 'RAW-1',
    itemId: 'item1',
    skuId: 'sku1',
    sku: 'A',
    source: 'MANUAL',
    quantity: 1,
  },
  {
    raw: 'RAW-2',
    itemId: 'item2',
    skuId: 'sku1',
    sku: 'A',
    source: 'MANUAL',
    quantity: 1,
  },
  {
    raw: 'RAW-3',
    itemId: 'item3',
    skuId: 'sku2',
    sku: 'A',
    source: 'MANUAL',
    quantity: 1,
  },
];
const base = {
  title: 'Phiếu đang soạn',
  warehouse: 'Kho phiên',
  recipient: 'Khách mới',
  phone: '0901234567',
  address: '12 Hoa Nam',
  group: 'Nhóm A',
  planned: 3,
  accepted,
};
function render(
  extra: Partial<React.ComponentProps<typeof P05ReviewContent>> = {},
) {
  let tree!: Renderer.ReactTestRenderer;
  act(() => {
    tree = Renderer.create(<P05ReviewContent {...base} {...extra} />);
  });
  return tree;
}
test('manual review groups by SKU identity, preserves every raw and does not fabricate a PX or per-SKU plan', () => {
  const data = JSON.stringify(accepted),
    t = render();
  const json = JSON.stringify(t.toJSON());
  expect(json).not.toContain('Tên phiếu');
  expect(json).toContain('Mã phiếu');
  expect(json).toContain('Chưa được cấp');
  expect(json).not.toContain('PX-');
  expect(
    t.root
      .findAllByType(View)
      .filter(n => String(n.props.testID).startsWith('p05-review-group-')),
  ).toHaveLength(2);
  act(() =>
    t.root
      .find(
        n =>
          n.props.accessibilityLabel === 'Xem tất cả mã đã soạn' &&
          !!n.props.onPress,
      )
      .props.onPress(),
  );
  const shown = JSON.stringify(t.toJSON());
  for (const c of accepted) expect(shown).toContain(c.raw);
  expect(JSON.stringify(accepted)).toBe(data);
  act(() => t.unmount());
});
test('source-linked review uses authoritative name and summed per-SKU plan; equal total alone cannot assert complete', () => {
  const lines: SourceLine[] = [
    {
      line_id: 'l1',
      sku_id: 'sku1',
      sku_code: 'A',
      sku_name: 'Tên nguồn',
      planned_qty: 1,
      scanned_qty: 0,
    },
    {
      line_id: 'l2',
      sku_id: 'sku1',
      sku_code: 'A',
      sku_name: 'Tên nguồn',
      planned_qty: 2,
      scanned_qty: 0,
    },
  ];
  const t = render({
    documentNo: 'PX-SOURCE',
    sourceLines: lines,
  });
  const json = JSON.stringify(t.toJSON());
  expect(json).toContain('Mã phiếu');
  expect(json).toContain('PX-SOURCE');
  expect(json).toContain('Tên nguồn');
  expect(json).toContain('2/3');
  expect(json).toContain('Chưa khớp kế hoạch từng SKU');
  act(() => t.unmount());
});
test('long Unicode/newline metadata and note are read verbatim, no ellipsis/data overwrite in reader', () => {
  const raw = 'Dòng 1\n' + '長🙂'.repeat(1000),
    read = jest.fn(),
    t = render({ address: raw, note: raw, onRead: read });
  const measured = t.root
    .findAllByType(Text)
    .filter(n => n.props.onTextLayout && n.props.children === raw);
  expect(measured).toHaveLength(2);
  for (const n of measured)
    act(() => n.props.onTextLayout({ nativeEvent: { lines: [{}, {}, {}] } }));
  for (const label of ['Địa chỉ giao', 'Ghi chú'])
    act(() =>
      t.root
        .find(
          n =>
            n.props.accessibilityLabel === `Xem đầy đủ ${label}` &&
            !!n.props.onPress,
        )
        .props.onPress(),
    );
  expect(read.mock.calls).toEqual([
    ['Địa chỉ giao', raw],
    ['Ghi chú', raw],
  ]);
  act(() => t.unmount());
});
test('incomplete review presents requested/scanned counts separately and retains accepted codes without manufacturing scans', () => {
  const t = render({ planned: 10 });
  const json = JSON.stringify(t.toJSON());
  expect(json).toContain('Còn thiếu 7 sản phẩm');
  expect(json).toContain('Số lượng yêu cầu');
  expect(json).toContain('Số lượng đã soạn');
  expect(accepted).toHaveLength(3);
  act(() => t.unmount());
});

test('P05 S03 never exposes NFC before outbound POST makes the item ISSUED', () => {
  const assign = jest.fn();
  const t = render({ onAssignNfc: assign });
  const buttons = t.root.findAll(
    n => n.props.accessibilityLabel === 'Gán NFC' && !!n.props.onPress,
  );
  expect(buttons).toHaveLength(0);
  expect(assign).not.toHaveBeenCalled();
  act(() => t.unmount());
});
