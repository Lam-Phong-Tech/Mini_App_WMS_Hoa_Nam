import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { P05NativeFlow } from '../src/features/outbound/P05NativeFlow';
import { createP05NativeOwner } from '../src/features/outbound/p05NativeOwner';
import {
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../src/storage/storage';
import type { Service, Context } from '../src/features/outbound/linked/types';
import { Button } from '../src/ui/Button';
const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  session = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  warehouse = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const context: Context = {
  actor_id: actor,
  auth_session_id: session,
  active_warehouse_id: warehouse,
  warehouse_context: { status: 'READY' },
  available_warehouses: [
    { warehouse_id: warehouse, name: 'Kho đã xác nhận', status: 'ACTIVE' },
  ],
  permissions: { read: true, save: true, cancel: true, record: true },
  record: { reconcile_mode: 'P03_LINKED' },
  address_contract: { format: 'TEXT', structured_codes_supported: false },
};
function fixture(denied = false) {
  const storage = createStorage(createMemoryBackend());
  setAppStorageForTesting(storage);
  const execute = jest.fn();
  const service: Service = {
    fixture: false,
    baseUrl: 'isolated',
    now: Date.now,
    context: async () => {
      if (denied) throw Error('Không xác minh phiên/kho.');
      return context;
    },
    sources: async () => ({
      items: [],
      meta: {
        page: 1,
        per_page: 20,
        total: 0,
        last_page: 1,
        warehouse_id: warehouse,
        source_kind: 'WMS_OUTBOUND_DOCUMENT',
      },
    }),
    source: jest.fn(),
    resolve: jest.fn(),
    execute,
    reconcile: jest.fn(),
    draft: jest.fn(),
    current: jest.fn(),
  };
  const owner = createP05NativeOwner({
    storage,
    service,
    getScope: () => ({
      actorId: actor,
      authSessionId: session,
      warehouseId: warehouse,
    }),
    onChange: () => undefined,
  });
  return { storage, owner, execute };
}
afterEach(() => setAppStorageForTesting(undefined));
test('native mount retains even expired legacy data; linked entry never converts or deletes it', async () => {
  const f = fixture(),
    legacy = [
      {
        id: 'old-local',
        kind: 'outbound',
        status: 'DRAFT',
        expiresAt: '2020-01-01T00:00:00Z',
        payload: { codes: [{ raw: 'KEEP-THIS' }] },
      },
    ];
  f.storage.setObject('workflow.drafts.v1', legacy);
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P05NativeFlow owner={f.owner} onExit={() => undefined} />
      </AppProviders>,
    );
  });
  expect(f.storage.getObject('workflow.drafts.v1')).toEqual(legacy);
  expect(f.owner.snapshot().source).toBeNull();
  expect(f.owner.snapshot().draftId).toBeNull();
  expect(f.execute).not.toHaveBeenCalled();
  const start = tree.root
    .findAllByType(Button)
    .find(n => n.props.label === 'Bắt đầu soạn hàng')!;
  expect(start.props.disabled).toBe(true);
  expect(JSON.stringify(tree.toJSON())).toContain(
    'Bản nháp trước vẫn được giữ',
  );
  await act(async () => tree.unmount());
});
test('native context failure has explicit recovery and cannot open fixture or scan step', async () => {
  const f = fixture(true);
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <P05NativeFlow owner={f.owner} onExit={() => undefined} />
      </AppProviders>,
    );
  });
  expect(JSON.stringify(tree.toJSON())).toContain('Không xác minh phiên/kho');
  expect(f.owner.snapshot().step).toBe(1);
  expect(f.owner.snapshot().accepted).toEqual([]);
  expect(f.execute).not.toHaveBeenCalled();
  expect(
    tree.root
      .findAllByType(Button)
      .find(n => n.props.label === 'Bắt đầu soạn hàng')?.props.disabled,
  ).toBe(true);
  await act(async () => tree.unmount());
});
