// Navigation owner seam only; no backend, camera, persisted real session or writes.
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { P04NativeFlow } from '../src/features/inbound/P04NativeFlow';
import { InboundCreateScreen } from '../src/features/inbound/InboundCreateScreen';
import { createP04Flow, type P04FlowState } from '../src/features/inbound/p04Flow';
import { initialInboundDraft } from '../src/features/inbound/inboundDraft';
import { P03Dialog } from '../src/features/scan/P03Dialog';
import { P17ScanExceptions } from '../src/features/scan/P17ScanExceptions';
import { BusinessScanScreen } from '../src/features/scan/BusinessScanScreen';
import { P04Action } from '../src/features/inbound/P04Frame';
import { BottomNav } from '../src/ui/BottomNav';
import { Dialog } from '../src/ui/Dialog';
import { createMemoryBackend, createStorage, setAppStorageForTesting } from '../src/storage/storage';

jest.mock('../src/features/inbound/p04Flow', () => ({ createP04Flow: jest.fn() }));
jest.mock('../src/features/scan/BusinessScanScreen', () => ({
  BusinessScanScreen: (props: object) => require('react').createElement('ScannerOwnerSeam', props),
}));
const scope = { actorId: 'actor', authSessionId: 'auth', warehouseId: 'warehouse' };
const session = { accessToken: 'test-only', userId: 'actor', authSessionId: 'auth', activeWarehouseId: 'warehouse' };
beforeEach(() => jest.mocked(global.fetch).mockClear());
afterEach(() => expect(global.fetch).not.toHaveBeenCalled());
const stateFixture = (): P04FlowState => ({
  phase: 'ready', types: [], busy: false, resume: true,
  context: { actor_id: 'actor', auth_session_id: 'auth', active_warehouse_id: 'warehouse',
    warehouse_context: { status: 'READY' }, warehouse_status: 'ACTIVE', inbound_supported: true,
    permissions: { read: true, save: true, record: true, cancel: true }, available_warehouses: [], },
  run: { id: 'draft', scope, identity: { documentId: 'draft', scanSessionId: 'scan' },
    ui: { ...initialInboundDraft, warehouseId: scope.warehouseId, name: 'Kept', note: 'Giữ đầy đủ', step: 0,
      codes: [{ key: 'kept', raw: 'RAW-KEPT', sku: 'SKU', quantity: 1, at: 1, source: 'MANUAL' }] },
    items: [{ raw_code: 'RAW-KEPT', quantity: 1, scan_source: 'MANUAL' }], rows: [], closed: false, updatedAt: 1 },
});
async function mount({ state = stateFixture(), active = 'scan' as string | undefined, tabs = true } = {}) {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  let current = true;
  let emit!: (state: P04FlowState) => void;
  const api = {
    begin: async () => emit(state), snapshot: () => state,
    isCurrent: jest.fn(() => current), dispose: jest.fn(), view: jest.fn(),
    resume: jest.fn(() => { state.resume = false; emit({ ...state }); }),
    saveAndLeave: jest.fn(async () => true), cancel: jest.fn(async () => true),
    finish: jest.fn(() => true), dismiss: jest.fn(),
    scan: jest.fn(async () => ({ row: { outcome: 'REJECTED', reason_code: 'CODE_REJECTED' }, eventId: 'event', requiresInput: false })),
  };
  (createP04Flow as jest.Mock).mockImplementation(({ onChange }) => { emit = onChange; return api; });
  const onExit = jest.fn(), onSelectTab = jest.fn();
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => { tree = Renderer.create(<AppProviders><P04NativeFlow
    onExit={onExit} onSelectTab={tabs ? onSelectTab : undefined} footerActiveKey={active}
    getSession={() => session} /></AppProviders>); });
  return { tree, api, state, onExit, onSelectTab,
    setCurrent: (value: boolean) => { current = value; },
    update: () => act(() => emit({ ...state })),
    close: () => act(() => tree.unmount()),
  };
}
const dialog = (tree: Renderer.ReactTestRenderer) => tree.root.findByType(P03Dialog);
const action = (tree: Renderer.ReactTestRenderer, label: string) =>
  dialog(tree).props.actions.find((a: { label: string }) => a.label === label);

test.each(['home', 'scan', 'documents'])('P03 retains caller %s across unfinished/stopped/cancel panels and has exactly one locked footer', async active => {
  const f = await mount({ active });
  expect(dialog(f.tree).props.panel).toBe('S02');
  expect(dialog(f.tree).props.activeKey).toBe(active);
  expect(f.tree.root.findAllByType(BottomNav)).toHaveLength(1);
  expect(f.tree.root.findByType(BottomNav).props.activeKey).toBe(active);
  await act(async () => action(f.tree, 'Bỏ phiếu').onPress());
  expect(dialog(f.tree).props.panel).toBe('S04');
  expect(f.tree.root.findByType(BottomNav).props.disabled).toBe(true);
  await act(async () => dialog(f.tree).props.onSelectTab('history'));
  expect(f.onSelectTab).not.toHaveBeenCalled();
  await act(async () => action(f.tree, 'Quay lại').onPress());
  f.state.context!.warehouse_status = 'INACTIVE';
  await f.update();
  expect(dialog(f.tree).props.panel).toBe('S03');
  expect(f.tree.root.findAllByType(BottomNav)).toHaveLength(1);
  expect(f.tree.root.findByType(BottomNav).props.activeKey).toBe(active);
  await act(async () => dialog(f.tree).props.onSelectTab('history'));
  expect(f.onSelectTab).toHaveBeenCalledWith('history');
  expect(f.api.saveAndLeave).not.toHaveBeenCalled();
  f.close();
});

test('omitted active key keeps P03 default scan and P17 legacy footer omission', async () => {
  // Assign undefined explicitly after default destructuring to exercise an omitted prop.
  const f = await mount();
  await act(async () => f.tree.update(<AppProviders><P04NativeFlow onExit={f.onExit} /></AppProviders>));
  expect(f.tree.root.findByType(BottomNav).props.activeKey).toBe('scan');
  f.state.resume = false;
  (f.state.run!.ui as { step: number }).step = 1;
  await f.update();
  await act(async () => f.tree.root.findByType(BusinessScanScreen).props.onScan('BAD', 'MANUAL'));
  expect(f.tree.root.findByType(P17ScanExceptions).props.footerNavigation).toBeUndefined();
  expect(f.tree.root.findAllByType(BottomNav)).toHaveLength(0);
  f.close();
});

test('unfinished footer queues exit, waits for confirmed SAVE, and ignores repeat clicks while saving', async () => {
  const f = await mount({ active: 'documents' });
  const kept = JSON.stringify(f.state.run);
  await act(async () => dialog(f.tree).props.onSelectTab('history'));
  expect(f.onSelectTab).not.toHaveBeenCalled();
  expect(f.api.saveAndLeave).not.toHaveBeenCalled();
  expect(JSON.stringify(f.state.run)).toBe(kept);
  let release!: (saved: boolean) => void;
  f.api.saveAndLeave.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  await act(async () => action(f.tree, 'Lưu nháp và thoát').onPress());
  await act(async () => dialog(f.tree).props.onSelectTab('profile'));
  expect(f.onSelectTab).not.toHaveBeenCalled();
  await act(async () => { release(true); await Promise.resolve(); });
  expect(f.onSelectTab.mock.calls).toEqual([['history']]);
  expect(f.onExit).not.toHaveBeenCalled();
  f.close();
});

test('cancelled exit target is cleared; normal Back/save keeps the original caller', async () => {
  const f = await mount();
  await act(async () => dialog(f.tree).props.onSelectTab('history'));
  await act(async () => action(f.tree, 'Hủy').onPress());
  expect(dialog(f.tree).props.visible).toBe(false);
  await act(async () => f.tree.root.findByType(InboundCreateScreen).props.onBack());
  await act(async () => action(f.tree, 'Lưu nháp và thoát').onPress());
  expect(f.onSelectTab).not.toHaveBeenCalled();
  expect(f.onExit).toHaveBeenCalledTimes(1);
  f.close();
});

test('confirmed discard after a footer request goes to that tab, without bypassing confirmation', async () => {
  const f = await mount();
  await act(async () => dialog(f.tree).props.onSelectTab('profile'));
  await act(async () => action(f.tree, 'Bỏ phiếu').onPress());
  expect(f.api.cancel).not.toHaveBeenCalled();
  expect(f.onSelectTab).not.toHaveBeenCalled();
  await act(async () => action(f.tree, 'Bỏ phiếu').onPress());
  expect(f.api.cancel).toHaveBeenCalledTimes(1);
  expect(f.onSelectTab.mock.calls).toEqual([['profile']]);
  expect(f.onExit).not.toHaveBeenCalled();
  f.close();
});

test('footer checks latest busy/scope and rejects unknown tab keys, without relying only on disabled UI', async () => {
  const f = await mount();
  const callback = dialog(f.tree).props.onSelectTab;
  f.state.busy = true;
  await act(async () => callback('home'));
  f.state.busy = false;
  f.setCurrent(false);
  await act(async () => callback('home'));
  f.setCurrent(true);
  await act(async () => callback('not-a-tab'));
  expect(f.onSelectTab).not.toHaveBeenCalled();
  expect(f.api.saveAndLeave).not.toHaveBeenCalled();
  f.close();
});

test('P17 S01 uses one actual locked BottomNav, retains caller and routes dirty exit through P03', async () => {
  const state = stateFixture();
  state.resume = false;
  (state.run!.ui as { step: number }).step = 1;
  const f = await mount({ state, active: 'documents' });
  await act(async () => f.tree.root.findByType(BusinessScanScreen).props.onScan('BAD', 'MANUAL'));
  const nav = f.tree.root.findByType(BottomNav);
  expect(nav.props.activeKey).toBe('documents');
  expect(nav.props.style).toBeUndefined();
  expect(f.tree.root.findAllByType(BottomNav)).toHaveLength(1);
  expect(f.tree.root.findAllByType(P03Dialog)).toHaveLength(0);
  const callback = nav.props.onSelect;
  const kept = JSON.stringify(state.run);
  await act(async () => callback('history'));
  expect(f.tree.root.findAllByType(P17ScanExceptions)).toHaveLength(0);
  expect(dialog(f.tree).props.visible).toBe(true);
  expect(f.tree.root.findAllByType(BottomNav)).toHaveLength(1);
  expect(f.onSelectTab).not.toHaveBeenCalled();
  await act(async () => callback('profile')); // stale exception footer cannot replace target
  await act(async () => action(f.tree, 'Lưu nháp và thoát').onPress());
  expect(f.onSelectTab.mock.calls).toEqual([['history']]);
  expect(JSON.stringify(state.run)).toBe(kept);
  f.close();
});

test.each(['FAILED', 'CHECK_UNKNOWN'] as const)('%s explicit Home from scan uses home callback and preserves frozen request/data', async outcome => {
  const state = stateFixture(); state.resume = false;
  if (outcome === 'FAILED') state.run!.pending = {
    command: 'RECORD', key: 'original-key', requestId: 'original-trace', shiftId: 'original-shift',
    outcome: 'FAILED', version: 7, body: { warehouse_id: 'warehouse', scan_session_id: 'scan' },
  };
  else state.run!.ownerChecks = [{ command: 'VALIDATE', requestId: 'original-trace', shiftId: 'original-shift',
    outcome: 'UNKNOWN', version: 7, body: { warehouse_id: 'warehouse', item: { raw_code: 'RAW-KEPT' } } }];
  const f = await mount({ state, active: 'scan' });
  const home = f.tree.root.findAllByType(P04Action).find(a => a.props.label === 'Về Trang chủ — giữ phiếu')!;
  const kept = JSON.stringify(state.run);
  state.busy = true;
  await act(async () => home.props.onPress());
  state.busy = false; f.setCurrent(false);
  await act(async () => home.props.onPress());
  expect(f.onSelectTab).not.toHaveBeenCalled();
  f.setCurrent(true);
  await act(async () => home.props.onPress());
  expect(f.onSelectTab.mock.calls).toEqual([['home']]);
  expect(f.onExit).not.toHaveBeenCalled();
  expect(JSON.stringify(state.run)).toBe(kept);
  expect(f.api.saveAndLeave).not.toHaveBeenCalled();
  expect(f.api.cancel).not.toHaveBeenCalled();
  f.close();
});

test('explicit Home has no generic-exit fallback when Home route is unavailable', async () => {
  const state = stateFixture(); state.resume = false;
  state.run!.ownerChecks = [{ command: 'REVIEW', requestId: 'trace', shiftId: 'shift', version: 3, body: {}, outcome: 'UNKNOWN' }];
  const f = await mount({ state, tabs: false });
  const home = f.tree.root.findAllByType(P04Action).find(a => a.props.label === 'Về Trang chủ — giữ phiếu')!;
  expect(home.props.disabled).toBe(true);
  await act(async () => home.props.onPress());
  expect(f.onExit).not.toHaveBeenCalled();
  expect(f.tree.root.findAllByType(Dialog).filter(d => d.props.visible)).toHaveLength(1);
  f.close();
});
