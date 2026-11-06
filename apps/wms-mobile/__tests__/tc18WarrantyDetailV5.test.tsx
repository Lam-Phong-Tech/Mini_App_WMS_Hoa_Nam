import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { WarrantyCaseDetail } from '../src/features/warranty/WarrantyCaseDetail';
import { P09Card, P09Hero, P09Value } from '../src/features/warranty/P09Presentation';
import { createMemoryBackend, createStorage, setAppStorageForTesting } from '../src/storage/storage';
import { harness, envelope, caseRow, pageMeta, id } from './fixtures/p09Mock';

let tree: Renderer.ReactTestRenderer;
const content = (node: Renderer.ReactTestInstance | string): string =>
  typeof node === 'string' ? node : node.children.map(content).join(' ');
beforeEach(() => setAppStorageForTesting(createStorage(createMemoryBackend())));
afterEach(async () => { if (tree) await act(() => tree.unmount()); });

it('separates intake from repair, keeps the real serial and removes the unsupported PN/edit controls', async () => {
  const row = { ...caseRow(), status: 'CHECKING' as const, serial_number: 'SER-EXACT', confirmed_defect: 'Persisted diagnosis', accessories_received: 'Persisted accessory' };
  const h = harness(o => o.path.endsWith('/'+id(4)) ? envelope(row) : envelope([], { ...pageMeta, total: 0 }));
  await act(async () => { tree = Renderer.create(<AppProviders><WarrantyCaseDetail service={h.service} warrantyCase={row} onBack={jest.fn()} /></AppProviders>); });
  const hero = content(tree.root.findByType(P09Hero));
  expect(hero.includes('Serial:')).toBe(true);
  expect(hero.includes('SER-EXACT')).toBe(true);
  expect(hero.includes('SN:')).toBe(false);
  expect(hero.includes('PN:')).toBe(false);
  const titles = tree.root.findAllByType(P09Card).map(n => n.props.title);
  expect(titles).toContain('Thông tin tiếp nhận');
  expect(titles).toContain('Xử lý sửa chữa');
  const intake = tree.root.findAllByType(P09Card).find(n => n.props.title === 'Thông tin tiếp nhận')!;
  const labels = intake.findAllByType(P09Value).map(n => n.props.label);
  expect(labels).toContain('Phụ kiện');
  expect(labels).not.toContain('Sản phẩm');
  expect(labels).not.toContain('Serial');
  expect(labels).not.toContain('Chẩn đoán');
  expect(tree.root.findAllByProps({ accessibilityLabel: 'Chỉnh sửa thông tin hồ sơ' })).toHaveLength(0);
  const repair = tree.root.findAllByType(P09Card).find(n => n.props.title === 'Xử lý sửa chữa')!;
  expect(repair.findAllByType(P09Value).find(n => n.props.label === 'Chẩn đoán')?.props.value).toBe('Persisted diagnosis');
  expect(repair.findAllByType(P09Value).find(n => n.props.label === 'Kết quả sửa chữa')?.props.value).toBeUndefined();
  expect(h.calls.every(c => c.method === 'GET')).toBe(true);
});
