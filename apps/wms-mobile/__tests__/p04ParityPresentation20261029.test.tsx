import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Platform } from 'react-native';
import { AppProviders } from '../src/app/App';
import { Dialog } from '../src/ui/Dialog';
import { Button } from '../src/ui/Button';
import { P04ReadableText } from '../src/features/inbound/P04ReadableText';
import { InboundReviewScreen } from '../src/features/inbound/InboundReviewScreen';
import { InboundResultScreen } from '../src/features/inbound/InboundResultScreen';
import { initialInboundDraft } from '../src/features/inbound/inboundDraft';

let tree: Renderer.ReactTestRenderer | undefined;
const longValue = 'Nguyên văn <>& 👋\n' + 'Khôngcắtdữliệu'.repeat(160);
const font = { fontSize: 14, lineHeight: 22 };
const measure = (label: string) => tree!.root.findAll(node =>
  node.props.testID === `p04-measure-${label}` &&
  typeof node.props.onTextLayout === 'function',
)[0];
const readerButton = (label: string) => tree!.root.findAll(node =>
  node.props.accessibilityLabel === `Xem đầy đủ ${label}` &&
  typeof node.props.onPress === 'function',
);
async function mount(element: React.ReactNode) {
  await act(async () => { tree = Renderer.create(<AppProviders>{element}</AppProviders>); });
}
async function nativeLines(label: string, lines: number) {
  await act(async () => measure(label).props.onTextLayout({ nativeEvent: { lines: Array.from({ length: lines }, () => ({})) } }));
}
afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});

test('reader is measured by rendered lines, retains full Unicode/newlines, and never trims the source', async () => {
  await mount(<P04ReadableText value={longValue} label="Ghi chú" textStyle={font} />);
  expect(readerButton('Ghi chú')).toHaveLength(0);
  await nativeLines('Ghi chú', 2);
  expect(readerButton('Ghi chú')).toHaveLength(0);
  await nativeLines('Ghi chú', 4);
  expect(readerButton('Ghi chú')).toHaveLength(1);
  await act(async () => readerButton('Ghi chú')[0].props.onPress());
  const dialog = tree!.root.findByType(Dialog);
  expect(dialog.props.message).toBe(longValue);
  expect(dialog.props.dismissOnBackdrop).toBe(false);
  expect(tree!.root.findByType(P04ReadableText).props.value).toBe(longValue);
  await act(async () => dialog.props.onDismiss());
  expect(tree!.root.findAllByType(Dialog)).toHaveLength(0);
  expect(readerButton('Ghi chú')).toHaveLength(1);
});

test('RNWeb uses full-text layout height because its Text does not emit onTextLayout', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  await mount(<P04ReadableText value="Mã dài" label="Mã phiếu" textStyle={font} />);
  const host = measure('Mã phiếu');
  await act(async () => host.props.onLayout({ nativeEvent: { layout: { width: 130, height: 44 } } }));
  expect(readerButton('Mã phiếu')).toHaveLength(0);
  await act(async () => host.props.onLayout({ nativeEvent: { layout: { width: 80, height: 66 } } }));
  expect(readerButton('Mã phiếu')).toHaveLength(1);
  await act(async () => host.props.onLayout({ nativeEvent: { layout: { width: 240, height: 22 } } }));
  expect(readerButton('Mã phiếu')).toHaveLength(0);
});

test('changing the source closes its old reader; a late measurement cannot attach it to new content', async () => {
  await mount(<P04ReadableText value={longValue} label="Kho" textStyle={font} />);
  const oldMeasure = measure('Kho').props.onTextLayout;
  await nativeLines('Kho', 5);
  await act(async () => readerButton('Kho')[0].props.onPress());
  await act(async () => tree!.update(<AppProviders><P04ReadableText value="Kho mới" label="Kho" textStyle={font} /></AppProviders>));
  expect(tree!.root.findAllByType(Dialog)).toHaveLength(0);
  expect(readerButton('Kho')).toHaveLength(0);
  await act(async () => oldMeasure({ nativeEvent: { lines: [{}, {}, {}, {}] } }));
  expect(readerButton('Kho')).toHaveLength(0);
  expect(tree!.root.findByType(P04ReadableText).props.value).toBe('Kho mới');
  await act(async () => tree!.update(<AppProviders><P04ReadableText value={longValue} label="Kho" textStyle={font} /></AppProviders>));
  expect(tree!.root.findAllByType(Dialog)).toHaveLength(0);
});

test('S03 note reader does not change accepted quantities, serial expansion or the RECORD callback/guard', async () => {
  const onRecord = jest.fn();
  const draft = { ...initialInboundDraft, name: 'Phiếu TEST', warehouseId: 'warehouse-test', note: longValue,
    codes: [
      { key: 'item-1', raw: 'RAW-01', item: 'SERIAL-01', sku: 'SKU-01', quantity: 1, source: 'MANUAL' as const, at: 1 },
      { key: 'box-1', raw: 'BOX-01', item: 'BOX-01', sku: 'SKU-01', quantity: 5, source: 'MANUAL' as const, at: 2 },
    ],
  };
  await mount(<InboundReviewScreen draft={draft} documentRef="PN-TEST" actorName="TEST UI" onRecord={onRecord} canSend={false} />);
  await nativeLines('Ghi chú', 20);
  await act(async () => readerButton('Ghi chú')[0].props.onPress());
  expect(tree!.root.findByType(Dialog).props.message).toBe(longValue);
  expect(onRecord).not.toHaveBeenCalled();
  expect(tree!.root.findByType(InboundReviewScreen).props.draft).toBe(draft);
  await act(async () => tree!.root.findByType(Dialog).props.onDismiss());
  const group = tree!.root.findAll(node => node.props.accessibilityLabel === 'SKU-01 · 2 mã · số lượng 6' && typeof node.props.onPress === 'function')[0];
  await act(async () => group.props.onPress());
  expect(JSON.stringify(tree!.toJSON())).toContain('SERIAL-01');
  const send = tree!.root.findAllByType(Button).find(node => node.props.label === 'Gửi phiếu lên Web')!;
  expect(send.props.disabled).toBe(true);
  expect(onRecord).not.toHaveBeenCalled();
});

test('v5 TC07 full document reader preserves the number and all navigation callbacks; BOX quantity is not a code count', async () => {
  const callbacks = { home: jest.fn(), next: jest.fn(), document: jest.fn(), history: jest.fn() };
  const documentRef = 'PN-' + '20261029'.repeat(9) + '-0001';
  await mount(<InboundResultScreen documentName="TEST" documentRef={documentRef} warehouseName="Kho TEST" quantity={50} codeCount={1}
    sentAt="2026-10-29T01:30:00Z" outcome="posted" onHome={callbacks.home} onNext={callbacks.next} onDocument={callbacks.document} onHistory={callbacks.history} />);
  await nativeLines('Mã phiếu', 4);
  await act(async () => readerButton('Mã phiếu')[0].props.onPress());
  const reader = tree!.root.findAllByType(Dialog).find(dialog => dialog.props.visible)!;
  expect(reader.props.message).toBe(documentRef);
  expect(Object.values(callbacks).every(callback => callback.mock.calls.length === 0)).toBe(true);
  await act(async () => reader.props.onDismiss());
  const text = JSON.stringify(tree!.toJSON());
  expect(tree!.root.findAllByType(P04ReadableText).find(n => n.props.label === 'Đã ghi nhận')!.props.value).toBe('1 mã');
  expect(text).not.toContain('50 mã');
  for (const label of [`Xem phiếu ${documentRef}`, 'Nhập lượt mới', 'Xem lịch sử', 'Trang chủ'])
    await act(async () => tree!.root.findAllByType(Button).find(node => node.props.label === label)!.props.onPress());
  for (const callback of Object.values(callbacks)) expect(callback).toHaveBeenCalledTimes(1);
});
