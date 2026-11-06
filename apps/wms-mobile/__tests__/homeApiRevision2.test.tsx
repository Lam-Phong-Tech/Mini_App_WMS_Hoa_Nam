import React from 'react';
import {setSession,clearSession,captureSessionScope} from '../src/auth/session';
import {setAppStorageForTesting,createStorage,createMemoryBackend} from '../src/storage/storage';
let pushFreshness:any={};try{pushFreshness=require('../src/features/notifications/delivery/freshness');}catch(e){if(!String((e as any)?.message??e).includes('delivery/freshness'))throw e;}
import Renderer from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { HomeScreen } from '../src/features/home/HomeScreen';
import { HnHomeIcon } from '../src/ui/HnHomeIcon';
import {
  useHomeSummary,
  type HomeState,
  type UseHomeSummaryDeps,
} from '../src/features/home/useHomeSummary';
import {
  HOME_CAPABILITIES,
  HOME_SUMMARY_PATH,
  aggregatePending,
  confirmedHomeWarehouse,
  fetchHomeStockSummary,
  fetchHomeWarehouse,
  fetchHomeUnreadCount,
  fetchHomePendingPage,
  mergeHomeRecent,
  parseHomeStockSummary,
  warehouseActivity,
} from '../src/services/wms/home';
import { mapCurrentUser } from '../src/services/wms/queries';
import {
  isPreviewReadyShift,
  parseWorkShift,
} from '../src/services/wms/workShift';
import type { ReadClient } from '../src/services/wms/readOnlyClient';
import type { CurrentUser } from '../src/services/wms/types';
import type { Session } from '../src/auth/session';
const warehouseId = '11111111-1111-4111-8111-111111111111';
test('FCM publishes unread count to Home without reloading its business summary',async()=>{expect(typeof pushFreshness.publishNotificationFreshness).toBe('function');setAppStorageForTesting(createStorage(createMemoryBackend()));const session={accessToken:'test-only',userId:'user-1',authSessionId:'session-1',activeWarehouseId:warehouseId};setSession(session);let state!:ReturnType<typeof useHomeSummary>;const configured=deps({readSession:()=>session});function Harness(){state=useHomeSummary(configured);return null;}const tree=await render(<Harness/>);const summary=state.summary;await Renderer.act(async()=>pushFreshness.publishNotificationFreshness(captureSessionScope(),17,true));expect(state.unread).toBe(17);expect(state.summary).toBe(summary);await close(tree);clearSession();});
const user: CurrentUser = {
  id: 'user-1',
  auth_session_id: 'session-1',
  active_warehouse_id: warehouseId,
  name: 'Nguyễn Minh Anh',
  warehouse_scope_ids: [warehouseId],
  permissions: [
    'inbound.view',
    'outbound.view',
    'warehouse.view',
    'warranty.view',
    'inbound.create',
    'inbound.scan',
    'sku.view',
  ],
};
const shift = {
  shift_id: 'shift-1',
  actor_id: 'user-1',
  auth_session_id: 'session-1',
  warehouse_id: warehouseId,
  status: 'ACTIVE',
  preview_ready: true,
  started_at: '2026-10-06T01:02:03Z',
};
const rawSummary = {
  warehouse_id: warehouseId,
  data_scope: 'WAREHOUSE_SCOPED',
  authorization_scope: 'GLOBAL',
  date: '2026-10-12',
  timezone: 'Asia/Ho_Chi_Minh',
  posted_count: 3,
  pending_approval_count: 999,
  inbound: { pending_approval_count: 120, posted_count: 1 },
  outbound: { pending_approval_count: 81, posted_count: 2 },
  warranty: {
    open_count: 125,
    open_statuses: ['RECEIVED', 'CHECKING', 'REPAIRING', 'COMPLETED'],
    warehouse_scope: {
      contract: 'warranty-owner-v1',
      warehouse_id: warehouseId,
      unassigned_policy: 'EXCLUDED',
      ownership_complete: false,
    },
  },
};
const meta = { contract: 'mini-app-p02-v2' };
const stock = parseHomeStockSummary(rawSummary, warehouseId, meta);
const client = (data: unknown): ReadClient =>
  ({
    get: jest.fn(async () => ({
      status: 200,
      data: { success: true, data, meta },
    })),
  } as unknown as ReadClient);
function deps(extra: UseHomeSummaryDeps = {}): UseHomeSummaryDeps {
  return {
    capabilities: { ...HOME_CAPABILITIES, stockSummary: true },
    fetchUser: async () => user,
    fetchStockSummary: async () => stock,
    fetchWarehouse: async () => ({
      id: warehouseId,
      name: 'Kho đã xác nhận',
      status: 'ACTIVE',
    }),
    fetchShift: async () => shift,
    fetchUnread: async () => 12,
    ...extra,
  };
}
async function render(element: React.ReactElement) {
  let tree!: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    tree = Renderer.create(<AppProviders>{element}</AppProviders>);
  });
  return tree;
}
const close = async (tree: Renderer.ReactTestRenderer) => {
  await Renderer.act(async () => tree.unmount());
};

test('TC_UAT_08 restores the View all arrow inside the existing accessible read action', async () => {
  const open = jest.fn();
  const tree = await render(
    <HomeScreen
      deps={deps({ fetchRecentDocuments: async () => [] })}
      onSeeAll={open}
    />,
  );
  try {
    const button = tree.root.findByProps({
      accessibilityLabel: 'Xem tất cả chứng từ',
    });
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.findByType(HnHomeIcon).props.name).toBe('arrow');
    expect(open).not.toHaveBeenCalled();
  } finally {
    await close(tree);
  }
});

test('TC_UAT_07 task guide opens the existing chooser without selecting a write operation', async () => {
  const select = jest.fn();
  const choose = jest.fn();
  const tree = await render(
    <HomeScreen
      deps={deps({ fetchRecentDocuments: async () => [] })}
      onSelectTask={select}
      onChooseTask={choose}
    />,
  );
  try {
    const guide = tree.root.findByProps({ testID: 'hn-home-task-guide' });
    expect(JSON.stringify(tree.toJSON())).toContain(
      'Chọn nghiệp vụ để bắt đầu',
    );
    expect(guide.findByType(HnHomeIcon).props.name).toBe('arrow');
    expect(guide.props.accessibilityRole).toBe('button');
    expect(choose).not.toHaveBeenCalled();
    await Renderer.act(async () => guide.props.onPress());
    expect(choose).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveBeenCalled();
  } finally {
    await close(tree);
  }
});
const fullCapabilities = {
  stockSummary: true,
  warehouseListFilter: true,
  stableCreatedAtSort: true,
  warrantyWarehouseScope: true,
  recentAggregate: false,
};
const row = (id: string, date: string) => ({
  id,
  doc_no: id,
  created_at: date,
  status: 'SCANNING',
  mini_app_status: 'WAITING_APPROVAL',
});
describe('P02 endpoint and scope contracts', () => {
  it('pending-page uses exact readiness/scope/page and total when the release gate is open', async () => {
    const c = client({});
    await expect(
      fetchHomePendingPage('inbound', warehouseId, 1, {}, c, {
        ...HOME_CAPABILITIES,
        warehouseListFilter: false,
      }),
    ).rejects.toMatchObject({ kind: 'blocked_by_gate' });
    expect(c.get).not.toHaveBeenCalled();
    const ready = {
      get: jest.fn(async () => ({
        status: 200,
        data: { success: true, data: [{ id: 'real' }], meta: { total: 151 } },
      })),
    } as unknown as ReadClient;
    const result = await fetchHomePendingPage(
      'inbound',
      warehouseId,
      1,
      {},
      ready,
      fullCapabilities,
    );
    expect(result.meta?.total).toBe(151);
    expect(result.items).toHaveLength(1);
    expect(ready.get).toHaveBeenCalledWith(
      '/api/v1/mini-app/inbound-documents',
      {
        query: {
          status: 'WAITING_APPROVAL',
          warehouse_id: warehouseId,
          page: 1,
          per_page: 50,
        },
      },
    );
    await fetchHomePendingPage(
      'outbound',
      warehouseId,
      2,
      {},
      ready,
      fullCapabilities,
    );
    expect(ready.get).toHaveBeenLastCalledWith(
      '/api/v1/mini-app/outbound-documents',
      {
        query: {
          ready_for_issue: 1,
          warehouse_id: warehouseId,
          page: 2,
          per_page: 50,
        },
      },
    );
  });
  it('uses server summary >50, not page length or an unverified top-level total', async () => {
    const c = client(rawSummary);
    const result = await fetchHomeStockSummary(warehouseId, {}, c);
    expect(aggregatePending(result, user)).toBe(201);
    expect(c.get).toHaveBeenCalledWith(HOME_SUMMARY_PATH, {
      query: { warehouse_id: warehouseId },
    });
  });
  it.each([
    { ...rawSummary, warehouse_id: 'other' },
    { ...rawSummary, data_scope: 'GLOBAL' },
    { ...rawSummary, inbound: undefined },
    { ...rawSummary, inbound: { pending_approval_count: -1, posted_count: 1 } },
  ])('rejects malformed/unscoped summary %#', r =>
    expect(() => parseHomeStockSummary(r, warehouseId, meta)).toThrow(),
  );
  it('preserves null and allowed parts; no combined total under partial permissions', () => {
    const s = parseHomeStockSummary(
      { ...rawSummary, outbound: null },
      warehouseId,
      meta,
    );
    expect(s.outbound).toBeNull();
    expect(s.inbound?.pending).toBe(120);
    expect(aggregatePending(s, user)).toBeUndefined();
    expect(
      aggregatePending(stock, { ...user, permissions: ['inbound.view'] }),
    ).toBeUndefined();
  });
  it('null scope, empty scope and absent context are different', () => {
    expect(confirmedHomeWarehouse({ ...user, warehouse_scope_ids: null })).toBe(
      warehouseId,
    );
    expect(
      confirmedHomeWarehouse({ ...user, warehouse_scope_ids: [] }),
    ).toBeUndefined();
    expect(
      confirmedHomeWarehouse({ ...user, warehouse_scope_ids: undefined }),
    ).toBeUndefined();
    expect(
      confirmedHomeWarehouse({ ...user, active_warehouse_id: undefined }),
    ).toBeUndefined();
    expect(
      mapCurrentUser({
        ...user,
        user_id: user.id,
        id: undefined,
        display_name: 'Tên server',
        warehouse_scope_ids: null,
      }).warehouse_scope_ids,
    ).toBeNull();
    expect(
      mapCurrentUser({ display_name: 'Tên server', name: 'Tên cũ' }).name,
    ).toBe('Tên server');
  });
  it('reads exact warehouse profile, keeps unknown/INACTIVE distinct', async () => {
    const c = client({
      id: warehouseId,
      name: 'Kho server',
      status: 'INACTIVE',
    });
    const w = await fetchHomeWarehouse(warehouseId, {}, c);
    expect(c.get).toHaveBeenCalledWith('/api/v1/warehouses/' + warehouseId, {});
    expect(warehouseActivity(w)).toBe(false);
    expect(warehouseActivity({ ...w, status: 'OTHER' })).toBeUndefined();
    await expect(
      fetchHomeWarehouse(
        warehouseId,
        {},
        client({ id: 'other', status: 'ACTIVE' }),
      ),
    ).rejects.toThrow();
  });
  it.each([
    null,
    {},
    { unread_count: -1 },
    { unread_count: '3' },
    { count: 3 },
    { unread_count: 1.2 },
  ])('never invents unread zero for bad payload %#', v =>
    expect(fetchHomeUnreadCount({}, client(v))).rejects.toThrow(),
  );
  it('reads exact unread_count including verified zero', async () => {
    await expect(
      fetchHomeUnreadCount({}, client({ unread_count: 0 })),
    ).resolves.toBe(0);
    await expect(
      fetchHomeUnreadCount({}, client({ unread_count: 1001 })),
    ).resolves.toBe(1001);
  });
  it('current/start require actor, session, warehouse, readiness and timezone-aware timestamp', () => {
    expect(
      isPreviewReadyShift(shift, {
        actorId: 'user-1',
        authSessionId: 'session-1',
        warehouseId,
      }),
    ).toBe(true);
    for (const changed of [
      { actor_id: 'other' },
      { auth_session_id: 'other' },
      { warehouse_id: 'other' },
      { status: 'CLOSED' },
      { preview_ready: false },
      { started_at: '2026-10-06 08:00:00' },
    ])
      expect(
        isPreviewReadyShift(
          { ...shift, ...changed },
          { actorId: 'user-1', authSessionId: 'session-1', warehouseId },
        ),
      ).toBe(false);
    expect(() =>
      parseWorkShift({ ...shift, actor_id: undefined }, 'current'),
    ).toThrow();
  });
  it('merges top3 of three types by created_at with stable keys and preserves canonical status', () => {
    const d = '2026-10-06T03:00:00Z';
    const rows = mergeHomeRecent([
      { type: 'outbound', items: [row('x', d)] },
      {
        type: 'inbound',
        items: [
          row('a', d),
          row('b', d),
          { id: 'missing', doc_no: 'missing' },
          row('old', '2026-10-01T03:00:00Z'),
        ],
      },
      {
        type: 'warranty',
        items: [
          {
            warranty_case_id: 'w',
            warranty_case_code: 'BH-real',
            status: 'COMPLETED',
            created_at: d,
          },
        ],
      },
    ]);
    expect(rows.map(r => r.type + ':' + r.id)).toEqual([
      'inbound:b',
      'inbound:a',
      'outbound:x',
    ]);
    expect(
      mergeHomeRecent([
        {
          type: 'warranty',
          items: [
            {
              warranty_case_id: 'w',
              warranty_case_code: 'BH-real',
              status: 'COMPLETED',
              created_at: d,
            },
          ],
        },
      ])[0].status,
    ).toBe('COMPLETED');
  });
});
describe('P02 UI/source lifecycle', () => {
  it('LOCKED clock is display-only, with no technical ca page or extra confirmation', async () => {
    const tree = await render(
      <HomeScreen confirmedShift={shift} deps={deps()} />,
    );
    let clockAncestor = tree.root.findByProps({
      testID: 'hn-home-live-clock',
    }).parent;
    while (clockAncestor) {
      expect(clockAncestor.props.onPress).toBeUndefined();
      expect(clockAncestor.props.accessibilityRole).not.toBe('button');
      clockAncestor = clockAncestor.parent;
    }
    expect(
      tree.root.findByProps({ testID: 'hn-home-live-clock' }).props
        .accessibilityHint,
    ).toContain('08:02:03');
    expect(tree.root.findAllByProps({ testID: 'hn-home-shift-started-at' })).toHaveLength(0);
    expect(JSON.stringify(tree.toJSON())).toContain('Giờ hiện tại');
    expect(JSON.stringify(tree.toJSON())).not.toContain(
      'Trạng thái ca làm việc',
    );
    await close(tree);
  });
  it('keeps pending endpoints closed despite injecting fetch functions; uses exact profile and shift without changing layout', async () => {
    const pending = jest.fn(async () => ({ items: [] }));
    const tree = await render(
      <HomeScreen
        deps={deps({
          fetchInboundRecent: pending,
          fetchOutboundRecent: pending,
          fetchScopedWarranty: pending,
        })}
      />,
    );
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain('201');
    expect(text).toContain('Kho đã xác nhận');
    expect(
      tree.root.findByProps({ testID: 'hn-home-live-clock' }).props
        .accessibilityHint,
    ).toContain('08:02:03');
    expect(text).toContain('Chưa xác minh được nguồn');
    expect(pending).not.toHaveBeenCalled();
    expect(HOME_CAPABILITIES).toEqual({
      stockSummary: true,
      warehouseListFilter: true,
      stableCreatedAtSort: true,
      warrantyWarehouseScope: false,
      recentAggregate: true,
    });
    await close(tree);
  });
  it('does not query summary or profile when warehouse context is null or outside scope', async () => {
    for (const me of [
      { ...user, active_warehouse_id: undefined },
      { ...user, warehouse_scope_ids: [] },
    ]) {
      const summary = jest.fn(async () => stock),
        profile = jest.fn(async () => ({ id: warehouseId }));
      const tree = await render(
        <HomeScreen
          deps={deps({
            fetchUser: async () => me,
            fetchStockSummary: summary,
            fetchWarehouse: profile,
          })}
        />,
      );
      expect(summary).not.toHaveBeenCalled();
      expect(profile).not.toHaveBeenCalled();
      expect(JSON.stringify(tree.toJSON())).not.toContain('Đang hoạt động');
      await close(tree);
    }
  });
  it('v2 permits warranty-only summary and a profile/read error leaves independent data visible', async () => {
    const summary = jest.fn(async () => stock);
    const tree = await render(
      <HomeScreen
        deps={deps({
          fetchUser: async () => ({ ...user, permissions: ['warranty.view'] }),
          fetchStockSummary: summary,
          fetchUnread: async () => 7,
        })}
      />,
    );
    expect(summary).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(tree.toJSON())).toContain('7');
    await close(tree);
    const tree2 = await render(
      <HomeScreen
        deps={deps({
          fetchWarehouse: async () => {
            throw new Error('profile');
          },
        })}
      />,
    );
    expect(JSON.stringify(tree2.toJSON())).toContain('201');
    expect(JSON.stringify(tree2.toJSON())).toContain('Chưa xác minh');
    await close(tree2);
  });
  it('valid P01 receipt is passed unchanged; Home does not call current or start a new shift', async () => {
    const current = jest.fn(async () => shift);
    const tree = await render(
      <HomeScreen
        confirmedShift={shift}
        deps={deps({ fetchShift: current })}
      />,
    );
    expect(current).not.toHaveBeenCalled();
    expect(
      tree.root.findByProps({ testID: 'hn-home-live-clock' }).props
        .accessibilityHint,
    ).toContain('08:02:03');
    await close(tree);
  });
  it('v2 warranty count comes only from P02 summary, never a P12 page total', async () => {
 
    let state!: ReturnType<typeof useHomeSummary>;
    const warranty = jest.fn(async (_id: string, o: any) => ({
      items: o.query.status
        ? []
        : [
            {
              warranty_case_id: 'w',
              warranty_case_code: 'BH-real',
              created_at: '2026-10-06T03:00:00Z',
              status: 'COMPLETED',
            },
          ],
      meta: { total: 125 },
    }));
    const configured = deps({
      capabilities: fullCapabilities,
      fetchInboundRecent: async () => ({
        items: [row('a', '2026-10-06T01:00:00Z')],
      }),
      fetchOutboundRecent: async () => ({
        items: [row('x', '2026-10-06T02:00:00Z')],
      }),
      fetchScopedWarranty: warranty,
    });
    function Harness() {
      state = useHomeSummary(configured);
      return null;
    }
    const tree = await render(<Harness />);
    expect(state.summary.openWarranty).toBe(125);
    expect(warranty).not.toHaveBeenCalled();
    expect(state.summary.recent).toEqual([]);
    await close(tree);
  });
  it('stale response cannot overwrite another actor/session and request is aborted on unmount', async () => {
    let release!: (u: CurrentUser) => void;
    let session: Session | undefined = {
      accessToken: 'test-only',
      userId: 'user-1',
      authSessionId: 'session-1',
      activeWarehouseId: warehouseId,
    };
    let state!: HomeState;
    const old = deps({
      readSession: () => session,
      fetchUser: () =>
        new Promise(resolve => {
          release = resolve;
        }),
    });
    function Harness() {
      state = useHomeSummary(old);
      return null;
    }
    const tree = await render(<Harness />);
    session = { ...session!, userId: 'user-2', authSessionId: 'session-2' };
    await Renderer.act(async () => release(user));
    expect(state.summary.pendingApproval).toBeUndefined();
    await close(tree);
  });
  it('refresh losing permission clears protected count instead of carrying the old total', async () => {
    let me = user,
      state!: ReturnType<typeof useHomeSummary>;
    const configured = deps({ fetchUser: async () => me });
    function Harness() {
      state = useHomeSummary(configured);
      return null;
    }
    const tree = await render(<Harness />);
    expect(state.summary.pendingApproval).toBe(201);
    me = { ...user, permissions: [] };
    await Renderer.act(async () => {
      state.reload();
    });
    expect(state.summary.pendingApproval).toBeUndefined();
    await close(tree);
  });
  it('snapshot actor mismatch blocks every Home read after me', async () => {
    const stockRead = jest.fn(async () => stock),
      configured = deps({
        readSession: () => ({
          accessToken: 'test-only',
          userId: 'other',
          authSessionId: 'session-1',
        }),
        fetchStockSummary: stockRead,
      });
    const tree = await render(<HomeScreen deps={configured} />);
    expect(stockRead).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain('Không tải được');
    await close(tree);
  });
});
