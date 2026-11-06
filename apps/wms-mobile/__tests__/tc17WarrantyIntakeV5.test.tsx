import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { WarrantyIntakeScreen } from '../src/features/warranty/WarrantyIntakeScreen';
import { P09Action, P09Value } from '../src/features/warranty/P09Presentation';
import { createMemoryBackend, createStorage, setAppStorageForTesting } from '../src/storage/storage';
import { harness, envelope, resolved } from './fixtures/p09Mock';

jest.mock('../src/services/geo/useGeo', () => ({
  useProvinces: () => ({ items: [], phase: 'ready', reload: jest.fn() }),
  useWards: () => ({ items: [], phase: 'ready', reload: jest.fn() }),
}));
let tree: Renderer.ReactTestRenderer;
beforeEach(() => setAppStorageForTesting(createStorage(createMemoryBackend())));
afterEach(async () => { if (tree) await act(() => tree.unmount()); });

it('shows the three Note sections without an empty identity table, and wires read-only lookup', async () => {
  const h = harness(() => envelope(resolved)), onLookup = jest.fn();
  await act(async () => { tree = Renderer.create(<AppProviders><WarrantyIntakeScreen service={h.service} onBack={jest.fn()} onScan={jest.fn()} onLookup={onLookup} scanAvailable={false} /></AppProviders>); });
  const text = JSON.stringify(tree.toJSON());
  for (const heading of ['1. Xác định sản phẩm', '2. Chọn lỗi tiếp nhận', '3. Thông tin bổ sung']) expect(text).toContain(heading);
  expect(tree.root.findAllByType(P09Value).filter(node => ['Sản phẩm','Serial','Khách hàng','Liên hệ'].includes(node.props.label))).toHaveLength(0);
  await act(() => tree.root.findAllByType(P09Action).find(node => node.props.label === 'Tra cứu sản phẩm')!.props.onPress());
  expect(onLookup).toHaveBeenCalledWith('');
  expect(h.calls.every(call => call.method === 'GET')).toBe(true);
  expect(h.calls).toHaveLength(0);
});
