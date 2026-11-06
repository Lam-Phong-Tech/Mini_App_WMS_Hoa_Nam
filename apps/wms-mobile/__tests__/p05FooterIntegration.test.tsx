// Footer caller propagation only; no API, device, storage cleanup or business writes.
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import {
  P05NativeFlow,
  P05LinkedNativeFlow,
} from '../src/features/outbound/P05NativeFlow';
import { P05CreateNativeFlow } from '../src/features/outbound/P05CreateNativeFlow';
import * as createOwner from '../src/features/outbound/p05CreateOwner';
import { createP05NativeOwner } from '../src/features/outbound/p05NativeOwner';
import { P03Dialog } from '../src/features/scan/P03Dialog';
import { P04Frame } from '../src/features/inbound/P04Frame';
import { BottomNav } from '../src/ui/BottomNav';
import { setSession, clearSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
jest.mock('../src/features/outbound/p05CreateOwner', () => {
  const actual = jest.requireActual('../src/features/outbound/p05CreateOwner');
  return {
    ...actual,
    createP05CreateOwner: jest.fn(actual.createP05CreateOwner),
  };
});
const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const id = '00000000-0000-4000-8000-000000000001';
type Mode = 'manual' | 'entry-manual' | 'entry-linked';

function fixture(mode: Mode, stopped = true, busy = false) {
  const storage = createStorage(createMemoryBackend());
  setAppStorageForTesting(storage);
  setSession({
    accessToken: 'TEST-NOT-SENT',
    userId: id,
    authSessionId: id,
    activeWarehouseId: id,
  });
  const base =
    mode === 'entry-linked'
      ? createP05NativeOwner({ storage, onChange: () => {} })
      : createOwner.createP05CreateOwner({ storage });
  const state: any = {
    ...base.snapshot(),
    step: 1,
    busy,
    scanBusy: false,
    unknown: false,
    pending: null,
    version: 1,
    draftVersion: 1,
    error:
      mode === 'entry-linked' && stopped
        ? { code: 'WAREHOUSE_INACTIVE', message: 'TEST' }
        : '',
    errorCode: stopped ? 'WAREHOUSE_INACTIVE' : undefined,
  };
  if (mode === 'entry-linked') state.source = { source_document_id: id };
  const leave = jest.fn(),
    send = jest.fn(),
    save = jest.fn(),
    select = jest.fn(),
    exit = jest.fn();
  const owner: any = {
    ...base,
    snapshot: () => copy(state),
    initialize: jest.fn(async () => true),
    start: jest.fn(),
    leave,
    hasWork: () => true,
    isDirty: () => false,
    errors: () => ({}),
    canRecord: () => false,
    save,
    send,
  };
  return { owner, state, leave, send, save, select, exit };
}

async function mount(mode: Mode, key?: string, stopped = true, busy = false) {
  const f = fixture(mode, stopped, busy);
  if (mode === 'entry-manual')
    (createOwner.createP05CreateOwner as jest.Mock).mockReturnValue(f.owner);
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        {mode === 'manual' ? (
          <P05CreateNativeFlow
            owner={f.owner}
            onExit={f.exit}
            onSelectTab={f.select}
            footerActiveKey={key}
          />
        ) : (
          <P05NativeFlow
            owner={mode === 'entry-linked' ? f.owner : undefined}
            returnDocumentId={mode === 'entry-linked' ? id : undefined}
            onExit={f.exit}
            onSelectTab={f.select}
            footerActiveKey={key}
          />
        )}
      </AppProviders>,
    );
  });
  return { ...f, tree };
}
test('v5 TC09 failed SAVE shows owner feedback in the exit dialog and does not pretend to exit',async()=>{
 const t=await mount('manual',undefined,false,false);
 try{
  t.save.mockImplementation(async()=>{t.state.message='TC09: chưa được lưu lên Web';return false;});
  await act(async()=>t.tree.root.findByType(P04Frame).props.onBack());
  const dialog=t.tree.root.findByType(P03Dialog);
  expect(dialog.props.visible).toBe(true);
  await act(async()=>dialog.props.actions.find((a:any)=>a.label==='Lưu nháp và thoát').onPress());
  expect(t.tree.root.findByType(P03Dialog).props.message).toBe('TC09: chưa được lưu lên Web');
  expect(t.exit).not.toHaveBeenCalled();
 }finally{await act(async()=>t.tree.unmount());}
});

afterEach(() => {
  clearSession();
  jest.restoreAllMocks();
  (createOwner.createP05CreateOwner as jest.Mock)
    .mockReset()
    .mockImplementation(
      jest.requireActual('../src/features/outbound/p05CreateOwner')
        .createP05CreateOwner,
    );
  setAppStorageForTesting(undefined);
});

describe.each(['manual', 'entry-manual', 'entry-linked'] as const)(
  '%s footer',
  mode => {
    test.each([undefined, 'home', 'scan', 'documents'])(
      'preserves caller %s, default scan and existing nav callback',
      async key => {
        const t = await mount(mode, key),
          before = copy(t.state);
        const dialog = t.tree.root.findByType(P03Dialog);
        if (mode === 'entry-manual')
          expect(t.owner.initialize).toHaveBeenCalledTimes(1);
        expect(dialog.props.activeKey).toBe(key);
        expect(dialog.props.visible).toBe(true);
        const nav = t.tree.root.findAllByType(BottomNav);
        expect(nav).toHaveLength(1);
        expect(nav[0]!.props.activeKey).toBe(key ?? 'scan');
        expect(nav[0]!.props.disabled).toBe(false);
        if (mode === 'entry-manual')
          expect(
            t.tree.root.findByType(P05CreateNativeFlow).props.footerActiveKey,
          ).toBe(key);
        if (mode === 'entry-linked')
          expect(
            t.tree.root.findByType(P05LinkedNativeFlow).props.footerActiveKey,
          ).toBe(key);
        await act(async () => nav[0]!.props.onSelect('documents'));
        expect(t.select.mock.calls).toEqual([['documents']]);
        expect(t.leave).toHaveBeenCalledTimes(1);
        expect(t.state).toEqual(before);
        expect(t.send).not.toHaveBeenCalled();
        expect(t.save).not.toHaveBeenCalled();
        await act(async () => t.tree.unmount());
      },
    );

    test('busy still blocks footer navigation without changing active caller or original work', async () => {
      const t = await mount(mode, 'documents', true, true),
        before = copy(t.state);
      const nav = t.tree.root.findByType(BottomNav);
      expect(nav.props.activeKey).toBe('documents');
      expect(nav.props.disabled).toBe(true);
      await act(async () => nav.props.onSelect('home'));
      expect(t.select).not.toHaveBeenCalled();
      expect(t.leave).not.toHaveBeenCalled();
      expect(t.state).toEqual(before);
      await act(async () => t.tree.unmount());
    });

    test('S04 confirmation keeps caller tab and navigation locked; opening/canceling does not write', async () => {
      const t = await mount(mode, 'home', false),
        before = copy(t.state);
      await act(async () => t.tree.root.findByType(P04Frame).props.onBack());
      let dialog = t.tree.root.findByType(P03Dialog);
      expect(dialog.props.panel).toBe('S02');
      await act(async () =>
        dialog.props.actions.find((a: any) => a.label === 'Bỏ phiếu').onPress(),
      );
      dialog = t.tree.root.findByType(P03Dialog);
      expect(dialog.props.panel).toBe('S04');
      expect(dialog.props.activeKey).toBe('home');
      const nav = t.tree.root.findByType(BottomNav);
      expect(nav.props.disabled).toBe(true);
      await act(async () => nav.props.onSelect('documents'));
      expect(t.select).not.toHaveBeenCalled();
      expect(t.leave).not.toHaveBeenCalled();
      await act(async () => dialog.props.onBack());
      expect(t.state).toEqual(before);
      expect(t.save).not.toHaveBeenCalled();
      expect(t.send).not.toHaveBeenCalled();
      await act(async () => t.tree.unmount());
    });
  },
);
