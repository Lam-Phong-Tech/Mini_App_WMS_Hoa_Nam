import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { P04Icon } from '../src/features/inbound/P04Icon';
import { WarrantyListScreen } from '../src/features/warranty/WarrantyListScreen';
import { P09Action } from '../src/features/warranty/P09Presentation';
import { createMemoryBackend, createStorage, setAppStorageForTesting } from '../src/storage/storage';
import { harness, envelope, caseRow, pageMeta, id } from './fixtures/p09Mock';

let tree: Renderer.ReactTestRenderer;
beforeEach(() => setAppStorageForTesting(createStorage(createMemoryBackend())));
afterEach(async () => { if (tree) await act(() => tree.unmount()); });
async function render(props: React.ComponentProps<typeof WarrantyListScreen>) {
  await act(async () => { tree = Renderer.create(<AppProviders><WarrantyListScreen {...props} /></AppProviders>); });
}
function button(label: string) {
  return tree.root.findAllByProps({ accessibilityRole: 'button', accessibilityLabel: label })
    .find(node => typeof node.props.onPress === 'function')!;
}

it('restores the caller Back and vector list controls without opening intake or writing', async () => {
  const h = harness(() => envelope([caseRow()], pageMeta));
  const onBack = jest.fn(), onManualEntry = jest.fn();
  await render({ service: h.service, onBack, onManualEntry });
  expect(button('Quay lại')).toBeDefined();
  await act(() => button('Quay lại').props.onPress());
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(button('Lọc hồ sơ bảo hành').findAllByType(P04Icon).map(node => node.props.name)).toContain('funnel');
  expect(button('Tiếp nhận bảo hành').findAllByType(P04Icon).map(node => node.props.name)).toContain('plus');
  const status = tree.root.findAllByType(P09Action).find(node => node.props.accessibilityLabel === 'Tất cả trạng thái (40)')!;
  expect(status.props.variant).toBe('secondary');
  expect(status.findAllByType(P04Icon).map(node => node.props.name)).toContain('chevron-down');
  expect(onManualEntry).not.toHaveBeenCalled();
  expect(h.calls.every(call => call.method === 'GET')).toBe(true);
});

it('quick filters use canonical server statuses, keep missing facets unknown and never count the page', async () => {
  const h = harness(() => envelope([caseRow()], { ...pageMeta, total: 82 }));
  await render({ service: h.service });
  for (const label of ['Đã tiếp nhận', 'Đang kiểm tra', 'Chờ bàn giao', 'Đã trả khách']) {
    expect(button(`Lọc ${label} (—)`)).toBeDefined();
  }
  await act(async () => button('Lọc Chờ bàn giao (—)').props.onPress());
  expect(h.calls[h.calls.length - 1].query).toMatchObject({ status: 'COMPLETED', warehouse_id: id(3) });
  expect(button('Lọc Chờ bàn giao (—)').props.accessibilityState.selected).toBe(true);
  expect(h.calls.some(call => call.query?.per_page === 1)).toBe(false);
  expect(h.calls.every(call => call.method === 'GET')).toBe(true);
});

it('does not enable intake for a read-only account', async () => {
  const h = harness(() => envelope([caseRow()], pageMeta));
  const ctx = h.service.scope();
  const readService = { ...h.service, scope: () => ({ ...ctx, permissions: ['warranty.view'] }) };
  await render({ service: readService, onManualEntry: jest.fn(), onScan: jest.fn() });
  expect(button('Tiếp nhận bảo hành').props.disabled).toBe(true);
  expect(button('Tiếp nhận và sửa chữa bảo hành').props.disabled).toBe(true);
});
