import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState, Modal } from 'react-native';
import { AppProviders } from '../src/app/App';
import { HomeScreen } from '../src/features/home/HomeScreen';
import { fetchHomeRecentDocuments } from '../src/features/home/homeDocuments';
import { createP12Service } from '../src/features/documents/p12/service';
import { createP12Controller } from '../src/features/documents/p12/controller';
import { HOME_CAPABILITIES } from '../src/services/wms/home';
import { setSession, clearSession } from '../src/auth/session';
import {
  setAppStorageForTesting,
  createStorage,
  createMemoryBackend,
} from '../src/storage/storage';
import * as protocol from './fixtures/p12Protocol';
import * as mixed from './fixtures/p12Mixed';
const user = {
  id: protocol.actor,
  auth_session_id: protocol.session,
  active_warehouse_id: protocol.warehouse,
  warehouse_scope_ids: [protocol.warehouse],
  warehouse_context: { status: 'READY' },
  available_warehouses: [
    { warehouse_id: protocol.warehouse, status: 'ACTIVE' },
  ],
  permissions: protocol.context().rights,
  name: 'Nguyễn Minh Anh',
};
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'offline',
    userId: user.id,
    authSessionId: user.auth_session_id,
    activeWarehouseId: protocol.warehouse,
  });
});
afterEach(() => clearSession());
const base = {
  capabilities: { ...HOME_CAPABILITIES, stockSummary: true },
  fetchUser: async () => user,
  fetchWarehouse: async () => ({
    id: protocol.warehouse,
    status: 'ACTIVE',
    name: 'Kho Hoa Nam',
  }),
  fetchUnread: async () => 3,
  fetchShift: async () => null,
  fetchStockSummary: async () => ({
    warehouseId: protocol.warehouse,
    authorizationScope: 'GLOBAL',
    warranty: { open: 4, ownershipComplete: false },
    inbound: { pending: 2, posted: 1 },
    outbound: { pending: 4, posted: 1 },
  }),
};
describe('P02 follows P12 read owners', () => {
  it('TC06 v5 keeps the extra component-resume shortcut off Home without invoking its owner', async () => {
    const open = jest.fn();
    let tree;
    await act(async () => {
      tree = Renderer.create(
        <AppProviders>
          <HomeScreen
            deps={{ ...base, fetchRecentDocuments: async () => [] }}
            onOpenComponentResume={open}
          />
        </AppProviders>,
      );
    });
    try {
      expect(tree.root.findAllByProps({
        accessibilityLabel: 'Phiếu linh kiện đang làm',
      })).toHaveLength(0);
      expect(JSON.stringify(tree.toJSON())).not.toContain(
        'Tổng phiếu linh kiện đang làm',
      );
      expect(open).not.toHaveBeenCalled();
    } finally {
      await act(async () => tree.unmount());
    }
  });
  it('View all accepts warranty-only read permission without granting stock or write access', async () => {
    const open = jest.fn();
    let tree;
    await act(async () => {
      tree = Renderer.create(
        <AppProviders>
          <HomeScreen
            deps={{
              ...base,
              fetchUser: async () => ({
                ...user,
                permissions: ['warehouse.view', 'warranty.view'],
              }),
              fetchRecentDocuments: async () => [],
            }}
            onSeeAll={open}
          />
        </AppProviders>,
      );
    });
    try {
      const button = tree.root.findByProps({
        accessibilityLabel: 'Xem tất cả chứng từ',
      });
      expect(button.props.disabled).toBe(false);
      await act(async () => button.props.onPress());
      expect(open).toHaveBeenCalledTimes(1);
      expect(
        tree.root.findByProps({
          accessibilityLabel: 'Nhập kho. Nhận hàng và kiểm đếm',
        }).props.disabled,
      ).toBe(true);
    } finally {
      await act(async () => tree.unmount());
    }
  });
  it('uses one scoped mixed GET, keeps server order and real IDs, and excludes writes', async () => {
    const calls = [];
    const client = {
      get: async (path, options) => {
        calls.push({ path, options });
        return {
          status: 200,
          data: mixed.response(options.query),
          header: key =>
            ({
              'Cache-Control': 'private, no-store',
              'Content-Type': 'application/json',
              'X-Content-Type-Options': 'nosniff',
              Vary: 'Authorization',
            }[key] ?? null),
        };
      },
    };
    const api = createP12Service(() => ({ user }), {
      client,
      origin: 'https://p12.invalid',
    });
    const records = await fetchHomeRecentDocuments(user, {}, api);
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe('/api/v1/mini-app/documents');
    expect(calls[0].options).toMatchObject({
      p12Read: true,
      query: {
        warehouse_id: protocol.warehouse,
        source: 'ALL',
        status: 'ALL',
        sort: 'created_at_desc',
        per_page: 3,
      },
    });
    expect(records.map(r => r.type)).toEqual([
      'outbound',
      'inbound',
      'warranty',
    ]);
    expect(records.map(r => r.id)).toEqual([
      protocol.id(11),
      protocol.id(10),
      protocol.id(12),
    ]);
    expect(records.every(r => r.displayMappingPending)).toBe(true);
  });
  it('scope mismatch/failed mixed source never falls back to three legacy lists or blocks Home', async () => {
    const inRead = jest.fn(),
      outRead = jest.fn(),
      warranty = jest.fn();
    let tree;
    await act(async () => {
      tree = Renderer.create(
        <AppProviders>
          <HomeScreen
            deps={{
              ...base,
              fetchRecentDocuments: async () => {
                throw new Error('mixed unavailable');
              },
              fetchInboundRecent: inRead,
              fetchOutboundRecent: outRead,
              fetchScopedWarranty: warranty,
            }}
          />
        </AppProviders>,
      );
    });
    expect(inRead).not.toHaveBeenCalled();
    expect(outRead).not.toHaveBeenCalled();
    expect(warranty).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain('Chưa xác minh được nguồn');
    expect(
      tree.root.findAllByType(Modal).filter(m => m.props.visible),
    ).toHaveLength(0);
    await act(async () => tree.unmount());
  });
  it('a mixed-source failure stays local to recent documents while real background still refreshes', async () => {
    const changes = [],
      readUser = jest.fn(async () => user);
    const eventSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((event, callback) => {
        if (event === 'change') changes.push(callback);
        return { remove() {} };
      });
    let tree;
    await act(async () => {
      tree = Renderer.create(
        <AppProviders>
          <HomeScreen
            deps={{
              ...base,
              fetchUser: readUser,
              fetchRecentDocuments: async () => {
                throw new Error('source failed');
              },
            }}
          />
        </AppProviders>,
      );
    });
    expect(readUser.mock.calls.length).toBeGreaterThanOrEqual(1);
    await act(async () => changes.forEach(fn => fn('background')));
    expect(
      tree.root.findAllByType(Modal).filter(m => m.props.visible),
    ).toHaveLength(0);
    await act(async () => changes.forEach(fn => fn('active')));
    expect(readUser.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(
      tree.root.findAllByType(Modal).filter(m => m.props.visible),
    ).toHaveLength(0);
    await act(async () => changes.forEach(fn => fn('background')));
    await act(async () => changes.forEach(fn => fn('active')));
    expect(readUser.mock.calls.length).toBeGreaterThanOrEqual(3);
    await act(async () => tree.unmount());
    eventSpy.mockRestore();
  });
  it('whole KPI chooses the source and sends its owner instead of an unrelated All filter', async () => {
    const open = jest.fn();
    let tree;
    await act(async () => {
      tree = Renderer.create(
        <AppProviders>
          <HomeScreen deps={base} onOpenPendingDocuments={open} />
        </AppProviders>,
      );
    });
    await act(async () =>
      tree.root
        .findByProps({ accessibilityLabel: 'Xem Phiếu chờ xử lý' })
        .props.onPress(),
    );
    expect(open).not.toHaveBeenCalled();
    await act(async () =>
      tree.root
        .findByProps({ accessibilityLabel: 'Xuất kho · 4' })
        .props.onPress(),
    );
    expect(open).toHaveBeenCalledWith('outbound');
    await act(async () => tree.unmount());
  });
  it('warranty KPI offers the four open canonical states and hands the exact selected state to P12', async () => {
    const open = jest.fn();
    let tree;
    await act(async () => {
      tree = Renderer.create(
        <AppProviders>
          <HomeScreen deps={base} onOpenWarrantyList={open} />
        </AppProviders>,
      );
    });
    await act(async () =>
      tree.root
        .findByProps({ accessibilityLabel: 'Xem Bảo hành đang mở' })
        .props.onPress(),
    );
    expect(open).not.toHaveBeenCalled();
    await act(async () =>
      tree.root
        .findByProps({ accessibilityLabel: 'Chờ bàn giao' })
        .props.onPress(),
    );
    expect(open).toHaveBeenCalledWith('COMPLETED');
    await act(async () => tree.unmount());
  });
  it('P12 queue preserves exact readiness through detail Back and clears it on ordinary filters', async () => {
    const list = jest.fn(async () => ({
      items: [],
      paging: {
        total: 0,
        page: 1,
        perPage: 20,
        lastPage: 1,
        snapshotConsistent: false,
      },
      meta: {},
    }));
    const api = {
      scopeKey: () => 'same-owner',
      list,
      normalize: (_t, row) => row,
      detail: async () => ({ id: protocol.id(1), type: 'outbound' }),
    };
    const controller = createP12Controller(api);
    await controller.stockQueue('outbound');
    expect(list.mock.calls[0][1]).toMatchObject({
      ready_for_issue: true,
      page: 1,
      per_page: 20,
    });
    expect(list.mock.calls[0][1].status).toBeUndefined();
    await controller.open('outbound', protocol.id(1));
    controller.back();
    expect(controller.snapshot().stockQueue).toBe('outbound');
    await controller.filters({
      ...controller.snapshot().filters,
      status: 'POSTED',
    });
    expect(controller.snapshot().stockQueue).toBeUndefined();
    expect(list.mock.calls.at(-1)[1].ready_for_issue).toBeUndefined();
    await controller.stockQueue('inbound');
    expect(list.mock.calls.at(-1)[1].status).toBe('WAITING_APPROVAL');
    expect(list.mock.calls.at(-1)[1].ready_for_issue).toBeUndefined();
    controller.dispose();
  });
});
