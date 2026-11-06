import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { P04NativeFlow } from '../src/features/inbound/P04NativeFlow';
import { InboundCreateScreen } from '../src/features/inbound/InboundCreateScreen';
import { BusinessScanScreen } from '../src/features/scan/BusinessScanScreen';
import { P04Action } from '../src/features/inbound/P04Frame';
import { Sheet } from '../src/ui/Sheet';
import { Dialog } from '../src/ui/Dialog';
import { P17ScanExceptions } from '../src/features/scan/P17ScanExceptions';
import { Input } from '../src/ui/Input';
import { createStorage, createMemoryBackend } from '../src/storage/storage';
import { createP04ReviewService, P04_REVIEW_SESSION, type P04ReviewScenario } from '../src/web/p04ReviewService';
import { setTierCheckForTesting, resetTierCheckForTesting } from '../src/services/wms/tierCheck';

beforeEach(() => setTierCheckForTesting({ status: 'matched', expected: 'dev-test' }));
afterEach(() => resetTierCheckForTesting());

async function mount(scenario: P04ReviewScenario = 'normal') {
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => { tree = Renderer.create(<AppProviders><P04NativeFlow onExit={() => undefined}
    service={createP04ReviewService({ scenario })} storage={createStorage(createMemoryBackend())} getSession={() => P04_REVIEW_SESSION}
  /></AppProviders>); });
  const create = tree.root.findByType(InboundCreateScreen);
  await act(async () => create.props.onChange({ ...create.props.draft, name: 'BOX local', inboundCategory: 'PRODUCT' }));
  await act(async () => tree.root.findByType(InboundCreateScreen).props.onContinue());
  await act(async () => tree.root.findByType(BusinessScanScreen).props.onScan('BOX-DCJZ2090i-001', 'MANUAL'));
  return tree;
}

async function quantity(tree: Renderer.ReactTestRenderer, value: string) {
  await act(async () => tree.root.findAllByType(Input).find(input => input.props.label === 'Số lượng thực tế')!.props.onChangeText(value));
  await act(async () => tree.root.findAllByType(P04Action).find(action => action.props.label === 'Xác nhận số lượng')!.props.onPress());
}

test('BOX sheet keeps title/content while closing, without new-SKU buttons flashing', async () => {
  const tree = await mount();
  expect(tree.root.findAllByType(Sheet).find(sheet => sheet.props.visible)!.props.title).toBe('Số lượng trong hộp');
  await quantity(tree, '0');
  expect(JSON.stringify(tree.toJSON())).toContain('Số lượng phải là số nguyên từ 1 đến 100000.');
  await quantity(tree, '5');
  const closing = tree.root.findAllByType(Sheet).find(sheet => sheet.props.title === 'Số lượng trong hộp')!;
  expect(closing.props.visible).toBe(false);
  // RN's test Modal unmounts its descendants as soon as visible=false. Inspect
  // the actual content passed by the owner, which Web/native exit animations use.
  const labels: string[] = [];
  function readLabels(children: React.ReactNode) {
    React.Children.forEach(children, child => {
      if (!React.isValidElement<{ label?: string; children?: React.ReactNode }>(child)) return;
      if (child.props.label) labels.push(child.props.label);
      readLabels(child.props.children);
    });
  }
  readLabels(closing.props.children);
  expect(labels).toContain('Số lượng thực tế');
  expect(labels).not.toContain('Linh kiện');
  await act(async () => tree.unmount());
});

test('BOX SAVE UNKNOWN removes input sheet and presents standalone recovery without an old popup', async () => {
  const tree = await mount('save-timeout');
  await quantity(tree, '5');
  expect(tree.root.findAllByType(Sheet)).toHaveLength(0);
  const visible = tree.root.findAllByType(Dialog).filter(dialog => dialog.props.visible);
  expect(visible).toHaveLength(0);
  expect(tree.root.findByType(P17ScanExceptions).props.view.panel).toBe('P17.S04');
  expect(JSON.stringify(tree.toJSON())).not.toContain('Đã gửi phiếu nhập');
  await act(async () => tree.unmount());
});
