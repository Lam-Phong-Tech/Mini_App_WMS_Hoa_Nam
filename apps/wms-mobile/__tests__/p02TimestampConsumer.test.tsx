import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppProviders } from '../src/app/App';
import { HomeScreen } from '../src/features/home/HomeScreen';
import { NotificationPopover } from '../src/features/notifications/NotificationPopover';
import {
  useHomeSummary,
  type HomeState,
  type UseHomeSummaryDeps,
} from '../src/features/home/useHomeSummary';
import { homeDocumentTime } from '../src/features/home/homeDocumentTime';
import { homeRecentRecord } from '../src/features/home/homeDocuments';
import {
  parseDocumentTimestamp,
  formatDocumentTimestamp,
} from '../src/services/wms/documentTimestamps';
import { HOME_CAPABILITIES } from '../src/services/wms/home';
import {
  setSession,
  getSession,
  clearSession,
  getSessionGeneration,
} from '../src/auth/session';
import {
  getShiftState,
  resetShiftState,
  publishShiftState,
} from '../src/shift/shiftState';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import type { WorkShift } from '../src/services/wms/workShift';

const warehouse = '11111111-1111-4111-8111-111111111111';
const me = {
  id: 'local-actor',
  auth_session_id: 'local-family',
  active_warehouse_id: warehouse,
  warehouse_scope_ids: [warehouse],
  name: 'Nguyễn Minh Anh',
  permissions: [
    'warehouse.view',
    'inbound.view',
    'outbound.view',
    'warranty.view',
  ],
};
const owner = {
  actorId: me.id,
  authSessionId: me.auth_session_id,
  warehouseId: warehouse,
};
const shift: WorkShift = {
  shift_id: 'local-shift',
  actor_id: me.id,
  auth_session_id: me.auth_session_id,
  warehouse_id: warehouse,
  status: 'ACTIVE',
  preview_ready: true,
  started_at: '2026-10-11T01:00:00Z',
};
const pairs = [
  [
    '4a4635bb-e36e-4ce9-97b5-fef2cd1f7a84',
    '2026-10-11T14:40:07.000000Z',
    '11/10 · 21:40',
    '11/10/2026 21:40',
  ],
  [
    '78634041-b2d4-4686-9ad4-a7d83d3c07b0',
    '2026-10-11T04:02:58.000000Z',
    '11/10 · 11:02',
    '11/10/2026 11:02',
  ],
  [
    'ec317150-be9c-4d7a-a9db-e8c73af55d74',
    '2026-10-09T08:11:50.000000Z',
    '09/10 · 15:11',
    '09/10/2026 15:11',
  ],
] as const;
const configured = (extra: UseHomeSummaryDeps = {}): UseHomeSummaryDeps => ({
  capabilities: {
    ...HOME_CAPABILITIES,
    stockSummary: true,
    recentAggregate: true,
  },
  fetchUser: async () => me,
  fetchWarehouse: async () => ({
    id: warehouse,
    name: 'Kho Hoa Nam',
    status: 'ACTIVE',
  }),
  fetchShift: async () => null,
  fetchUnread: async () => 3,
  fetchStockSummary: async () => ({
    warehouseId: warehouse,
    authorizationScope: 'GLOBAL',
    inbound: { pending: 2, posted: 0 },
    outbound: { pending: 3, posted: 0 },
    warranty: { open: 4, ownershipComplete: false },
  }),
  fetchRecentDocuments: async () =>
    pairs.map(([id, raw], i) => ({
      id,
      number: 'PX-local-' + i,
      type: 'outbound',
      createdAt: raw,
      status: 'SCANNING',
    })),
  ...extra,
});
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  resetShiftState();
  setSession({
    accessToken: 'local-only',
    userId: me.id,
    authSessionId: me.auth_session_id,
    activeWarehouseId: warehouse,
  });
});
afterEach(() => {
  clearSession();
  resetShiftState();
  jest.restoreAllMocks();
});
it('Home reuses the P12 parsed timestamp object, keeps raw precision and distinguishes missing from null', () => {
  const raw = pairs[0][1],
    timestamp = parseDocumentTimestamp(raw),
    parse = jest.spyOn(Date, 'parse');
  const base: any = {
    id: pairs[0][0],
    number: 'PX-local',
    type: 'outbound',
    p12: { status: { canonical: 'SCANNING' } },
    source: {},
  };
  const row = homeRecentRecord({
    ...base,
    createdAt: raw,
    createdTimestamp: timestamp,
  });
  expect(row.timestamp).toBe(timestamp);
  expect(row.createdAt).toBe(raw);
  expect(parse).not.toHaveBeenCalled();
  const missing = homeRecentRecord(base),
    nullable = homeRecentRecord({ ...base, createdAt: null });
  expect(Object.hasOwn(missing, 'createdAt')).toBe(false);
  expect(missing.timestamp?.status).toBe('MISSING');
  expect(nullable.createdAt).toBeNull();
  expect(nullable.timestamp?.status).toBe('NOT_RECORDED');
});

it.each(pairs)(
  'Home and canonical minute display represent the same supplied instant %s',
  (_id, raw, home, canonical) => {
    const parsed = parseDocumentTimestamp(raw);
    expect(parsed.raw).toBe(raw);
    expect(homeDocumentTime(parsed, Date.parse('2026-10-13T01:00:00Z'))).toBe(
      home,
    );
    expect(formatDocumentTimestamp(parsed)).toBe(canonical);
    expect(
      homeDocumentTime(parsed, Date.parse('2026-10-13T01:00:00Z')),
    ).not.toMatch(/\.000000|:\d\d:\d\d/);
  },
);
it.each([
  null,
  undefined,
  '2026-02-30T01:00:00Z',
  '2026-10-11',
  '2026-10-11 21:40:07',
  'not-a-date',
])(
  'missing or invalid timestamp does not fabricate a current value %s',
  raw => {
    expect(
      homeDocumentTime(
        parseDocumentTimestamp(raw),
        Date.parse('2026-10-13T01:00:00Z'),
      ),
    ).toBe('Chưa ghi nhận');
  },
);
it('Z/explicit +07, midnight and fractional precision preserve the locked Home UX', () => {
  const now = Date.parse('2026-10-13T17:01:00Z');
  expect(
    homeDocumentTime(
      parseDocumentTimestamp('2026-10-13T17:00:00.123456Z'),
      now,
    ),
  ).toBe('Hôm nay · 00:00');
  expect(
    homeDocumentTime(
      parseDocumentTimestamp('2026-10-14T00:00:00.123456+07:00'),
      now,
    ),
  ).toBe('Hôm nay · 00:00');
  expect(
    homeDocumentTime(parseDocumentTimestamp('2026-10-12T17:00:00Z'), now),
  ).toBe('Hôm qua · 00:00');
  expect(
    homeDocumentTime(parseDocumentTimestamp('2025-12-31T10:00:00Z'), now),
  ).toBe('31/12/2025 · 17:00');
});
it('Home memoizes document parsing and opens each exact UUID without reading summary as recent', async () => {
  const parse = jest.spyOn(Date, 'parse'),
    open = jest.fn();
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <HomeScreen deps={configured()} onOpenDocument={open} />
      </AppProviders>,
    );
  });
  try {
    const records = () =>
      pairs.map((_pair, i) =>
        tree.root.findByProps({
          accessibilityLabel: 'Mở chứng từ PX-local-' + i,
        }),
      );
    expect(
      new Set(records().map(node => node.props.accessibilityLabel)).size,
    ).toBe(3);
    for (const [i, [id, raw]] of pairs.entries()) {
      expect(parse.mock.calls.filter(c => c[0] === raw)).toHaveLength(1);
      await act(async () => records()[i].props.onPress());
      expect(open).toHaveBeenLastCalledWith('outbound', id);
    }
    await act(async () =>
      tree.root
        .findByProps({ accessibilityLabel: 'Xem đầy đủ tên: Nguyễn Minh Anh' })
        .props.onPress(),
    );
    for (const [, raw] of pairs)
      expect(parse.mock.calls.filter(c => c[0] === raw)).toHaveLength(1);
  } finally {
    await act(async () => tree.unmount());
  }
});
it('Home uses authoritative shared NO_SHIFT and ACTIVE/ENDED state instead of a stale confirmation prop', async () => {
  publishShiftState(null, owner);
  const fetchShift = jest.fn(async () => shift);
  let state!: ReturnType<typeof useHomeSummary>;
  const deps = configured({
    readSession: getSession,
    readSharedShift: getShiftState,
    fetchShift,
  });
  function Harness() {
    state = useHomeSummary(deps, { confirmedShift: shift });
    return null;
  }
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(<Harness />);
  });
  try {
    expect(state.shift).toBeUndefined();
    expect(fetchShift).not.toHaveBeenCalled();
    await act(async () => publishShiftState(shift, owner));
    expect(state.shift).toEqual(shift);
    await act(async () =>
      publishShiftState(
        {
          ...shift,
          status: 'ENDED',
          preview_ready: false,
          ended_at: '2026-10-11T02:00:00Z',
        },
        owner,
      ),
    );
    expect(state.shift).toBeUndefined();
    expect(fetchShift).not.toHaveBeenCalled();
  } finally {
    await act(async () => tree.unmount());
  }
});
it('a new auth generation with identical account/family IDs cannot expose a late old response', async () => {
  let release!: (value: typeof me) => void;
  let reads = 0;
  let state!: HomeState;
  const deps = configured({
    readSession: getSession,
    fetchUser: () => {
      reads++;
      return reads === 1
        ? new Promise(resolve => {
            release = resolve;
          })
        : new Promise(() => {});
    },
  });
  function Harness() {
    state = useHomeSummary(deps);
    return null;
  }
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(<Harness />);
  });
  try {
    await act(async () => {
      clearSession();
      setSession({
        accessToken: 'new-local-login',
        userId: me.id,
        authSessionId: me.auth_session_id,
        activeWarehouseId: warehouse,
      });
    });
    await act(async () => release(me));
    expect(state.summary.recent).toEqual([]);
    expect(state.user).toBeUndefined();
  } finally {
    await act(async () => tree.unmount());
  }
});
it('queued recent navigation from the old auth generation is discarded after logout', async () => {
  const open = jest.fn();
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <HomeScreen
          deps={configured({ readSession: getSession })}
          onOpenDocument={open}
        />
      </AppProviders>,
    );
  });
  try {
    const queued = tree.root.findByProps({
      accessibilityLabel: 'Mở chứng từ PX-local-0',
    }).props.onPress;
    await act(async () => clearSession());
    await act(async () => queued());
    expect(open).not.toHaveBeenCalled();
  } finally {
    await act(async () => tree.unmount());
  }
});
it('queued callback from the previous shift verification epoch is ignored across same-family token refresh', async () => {
  const open = jest.fn();
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <HomeScreen
          deps={configured({
            readSession: getSession,
            readSharedShift: getShiftState,
          })}
          onOpenDocument={open}
        />
      </AppProviders>,
    );
  });
  try {
    const queued = tree.root.findByProps({
      accessibilityLabel: 'Mở chứng từ PX-local-0',
    }).props.onPress;
    const generation = getSessionGeneration(),
      epoch = getShiftState().verificationEpoch;
    await act(async () =>
      setSession({ ...getSession()!, accessToken: 'rotated-local-only' }),
    );
    expect(getSessionGeneration()).toBe(generation);
    expect(getShiftState().verificationEpoch).toBeGreaterThan(epoch);
    await act(async () => queued());
    expect(open).not.toHaveBeenCalled();
    await act(async () =>
      tree.root
        .findByProps({ accessibilityLabel: 'Mở chứng từ PX-local-0' })
        .props.onPress(),
    );
    expect(open).toHaveBeenCalledWith('outbound', pairs[0][0]);
  } finally {
    await act(async () => tree.unmount());
  }
});
it('an old unread callback cannot reload the new auth generation', async () => {
  const fetchUser = jest.fn(async () => me);
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <HomeScreen deps={configured({ readSession: getSession, fetchUser })} />
      </AppProviders>,
    );
  });
  try {
    const old =
      tree.root.findByType(NotificationPopover).props.onUnreadCountChange;
    await act(async () => clearSession());
    const count = fetchUser.mock.calls.length;
    await act(async () => old(0));
    expect(fetchUser).toHaveBeenCalledTimes(count);
  } finally {
    await act(async () => tree.unmount());
  }
});
it('a captured recent callback from a previous source read and a disposed Home cannot navigate', async () => {
  const open = jest.fn();
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <HomeScreen deps={configured()} onOpenDocument={open} />
      </AppProviders>,
    );
  });
  const old = tree.root.findByProps({
    accessibilityLabel: 'Mở chứng từ PX-local-0',
  }).props.onPress;
  try {
    await act(async () =>
      tree.update(
        <AppProviders>
          <HomeScreen
            deps={configured({ fetchRecentDocuments: async () => [] })}
            onOpenDocument={open}
          />
        </AppProviders>,
      ),
    );
    await act(async () => old());
    expect(open).not.toHaveBeenCalled();
  } finally {
    await act(async () => tree.unmount());
  }
  await act(async () => old());
  expect(open).not.toHaveBeenCalled();
});
it('Home keeps the first three rows from P12 order and never promotes an older sample UUID', async () => {
  const older = {
    id: pairs[0][0],
    number: 'OLD-SAMPLE',
    type: 'outbound' as const,
    status: 'SCANNING',
    createdAt: pairs[0][1],
  };
  const newer = [3, 2, 1].map((n, i) => ({
    id: '00000000-0000-4000-8000-00000000000' + n,
    number: 'NEW-' + n,
    type: 'inbound' as const,
    status: 'SCANNING',
    createdAt: '2026-10-13T0' + (9 - i) + ':00:00.000000Z',
  }));
  const read = jest.fn(async () => [...newer, older]);
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(
      <AppProviders>
        <HomeScreen
          deps={configured({ fetchRecentDocuments: read })}
          onOpenDocument={() => {}}
        />
      </AppProviders>,
    );
  });
  try {
    const body = JSON.stringify(tree.toJSON());
    expect(body).not.toContain('OLD-SAMPLE');
    const labels = tree.root
      .findAll(
        node =>
          typeof node.props.accessibilityLabel === 'string' &&
          node.props.accessibilityLabel.startsWith('Mở chứng từ '),
      )
      .map(node => node.props.accessibilityLabel);
    expect([...new Set(labels)]).toEqual([
      'Mở chứng từ NEW-3',
      'Mở chứng từ NEW-2',
      'Mở chứng từ NEW-1',
    ]);
    expect(
      homeDocumentTime(
        parseDocumentTimestamp(older.createdAt),
        Date.parse('2026-10-13T01:00:00Z'),
      ),
    ).toBe('11/10 · 21:40');
    expect(read).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => tree.unmount());
  }
});
it.each([403, 404])(
  'failed P12 read %s is unknown rather than empty or a fixture page',
  async status => {
    const error = {
      code: status === 403 ? 'ACCESS_DENIED' : 'DOCUMENT_NOT_FOUND',
      status,
      message: 'Local denied read',
    };
    let tree!: Renderer.ReactTestRenderer;
    await act(async () => {
      tree = Renderer.create(
        <AppProviders>
          <HomeScreen
            deps={configured({
              fetchRecentDocuments: async () => {
                throw error;
              },
            })}
          />
        </AppProviders>,
      );
    });
    try {
      const body = JSON.stringify(tree.toJSON());
      expect(body).toContain('Chưa xác minh được nguồn');
      expect(body).not.toContain('PX-local-');
      expect(body).not.toContain('Chưa có chứng từ gần đây');
    } finally {
      await act(async () => tree.unmount());
    }
  },
);
it.each(['DISABLED', 'ENABLED', 'DRAINING'] as const)(
  'Home preserves shared legacy identity in %s without upgrading tracking or reading another shift',
  async mode => {
    const legacy: WorkShift = {
      ...shift,
      version: 1,
      ended_at: null,
      tracking_contract: null,
      lifecycle: {
        contract: 'p01-p14-lifecycle-v1',
        mode,
        tracking_status: 'LEGACY_UNTRACKED',
        end_supported: false,
        end_unavailable_reason: 'LEGACY_UNTRACKED',
        end_readiness: 'REQUIRES_CLOSE_CHECK_AND_LOCAL_CLEAN',
        owner_coverage: 'PARTIAL_EXPLICIT_OWNER_PROTOCOLS',
        local_state_verified: false,
        legacy_upgrade_allowed: false,
      },
    };
    publishShiftState(legacy, owner);
    const fetchShift = jest.fn(async () => shift);
    let state!: ReturnType<typeof useHomeSummary>;
    const deps = configured({
      readSession: getSession,
      readSharedShift: getShiftState,
      fetchShift,
    });
    function Harness() {
      state = useHomeSummary(deps);
      return null;
    }
    let tree!: Renderer.ReactTestRenderer;
    await act(async () => {
      tree = Renderer.create(<Harness />);
    });
    try {
      expect(state.shift).toBe(getShiftState().shift);
      expect(state.shift?.tracking_contract).toBeNull();
      expect(state.shift?.lifecycle?.end_supported).toBe(false);
      expect(fetchShift).not.toHaveBeenCalled();
    } finally {
      await act(async () => tree.unmount());
    }
  },
);
