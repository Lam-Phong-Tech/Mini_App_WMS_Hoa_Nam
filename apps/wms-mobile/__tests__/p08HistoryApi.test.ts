import {
  p08Identity,
  p08Query,
  p08Scope,
} from '../src/services/wms/p08History';
import {
  P08_RELEASE,
  P08_SOURCE_COMMIT,
  P08_DEV_READ_EVIDENCE,
  p08DevReadVerified,
  assertP08Connected,
} from '../src/config/p08Release';
import { context, harness, id } from './fixtures/p08Mock';
import { createP08MockHistory } from '../src/services/wms/p08History';
import type { ReadClient } from '../src/services/wms/readOnlyClient';

describe('P08 mini-app-p08-v1 mock HTTP / scoped DEV runtime', () => {
  it('expired zero/NaN expiry fails auth; valid session lacking history grant fails403, not session expiry', () => {
    const c = context();
    for (const expiresAtMs of [0, Number.NaN])
      expect(() =>
        p08Scope({ ...c, session: { ...c.session!, expiresAtMs } }),
      ).toThrow();
    try {
      p08Scope({ ...c, user: { ...c.user, permissions: [] } });
      throw Error('should deny');
    } catch (e) {
      expect(e).toMatchObject({
        kind: 'http',
        status: 403,
        code: 'HISTORY_READ_FORBIDDEN',
      });
    }
  });
  it('canonical scan projection wins over a legacy mirror of the same immutable activity', async () => {
    const h = harness(b => {
      const original = {
        ...b.data[0],
        source: 'SCAN',
        business: 'SCAN',
        recordId: 'SCAN:' + id(9),
        activityId: 'SCAN:' + id(10),
        sourceTable: 'scan_events',
        detail: { canOpen: false, url: null, ownerPermissionRechecked: true },
        attachments: {
          canOpen: false,
          url: null,
          policy: 'OWNER_ENDPOINT_REAUTHORIZATION_NO_STORAGE_URL',
        },
      };
      b.data = [
        original,
        {
          ...original,
          sourceTable: 'scan_record_events',
          label: 'legacy mirror',
        },
      ];
    });
    const result = await h.api.records({ date_mode: 'ALL' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].sourceTable).toBe('scan_events');
  });
  it('missing batch404 is distinct from an existing empty batch; response never falls back', async () => {
    const http: ReadClient = {
      async get<T>() {
        return {
          status: 404,
          data: {
            success: false,
            code: 'RESOURCE_NOT_FOUND',
            message: 'mock missing batch',
          } as T,
        };
      },
    };
    await expect(
      createP08MockHistory(context, http).session(id(9)),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('privacy/time/schema policies checked including absent timestamp and single-response snapshot', async () => {
    for (const mutate of [
      (b: any) => {
        b.meta.snapshot.cross_request_snapshot = true;
      },
      (b: any) => {
        b.meta.snapshot.id = 'bad';
      },
      (b: any) => {
        b.meta.scopePolicy = 'UNSCOPED';
      },
      (b: any) => {
        b.data[0].time = '2026-02-30 12:00:00';
      },
    ])
      await expect(
        harness(mutate).api.records({ date_mode: 'ALL' }),
      ).rejects.toThrow();
    const unknown = harness(b => {
      b.data.forEach((e: any) => {
        e.time = null;
        e.timeStatus = 'NOT_RECORDED';
      });
      b.meta.organizationScope = [];
    });
    expect(
      (await unknown.api.records({ date_mode: 'ALL' })).data[0].time,
    ).toBeNull();
  });
  it('accepts PostgreSQL short UTC offset timestamps without weakening calendar validation', async () => {
    const pg = harness(b => {
      b.meta.asOf = '2026-10-10 08:00:00.123456+00';
      b.data.forEach((e: any) => {
        e.time = '2026-10-10 08:00:00+00';
        e.timeStatus = 'SOURCE_TIMESTAMP';
      });
    });
    await expect(pg.api.records({ date_mode: 'ALL' })).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ time: '2026-10-10 08:00:00+00' }),
      ]),
    });
    await expect(
      harness(b => {
        b.data[0].time = '2026-02-30 08:00:00+00';
      }).api.records({ date_mode: 'ALL' }),
    ).rejects.toMatchObject({ code: 'P08_INVALID_EVENT_TIME' });
  });
  it('opens only verified DEV read evidence; customer and tampered evidence fail closed', () => {
    expect(P08_RELEASE.productionEnabled).toBe(true);
    expect(() => assertP08Connected()).not.toThrow();
    expect(
      p08DevReadVerified(P08_DEV_READ_EVIDENCE, 'dev-test', '/wms-api'),
    ).toBe(true);
    expect(
      p08DevReadVerified(P08_DEV_READ_EVIDENCE, 'dev-test', '/bad-proxy'),
    ).toBe(false);
    expect(
      p08DevReadVerified(P08_DEV_READ_EVIDENCE, 'customer-production'),
    ).toBe(false);
    expect(
      p08DevReadVerified({ ...P08_DEV_READ_EVIDENCE!, runtimeSha: 'bad' }),
    ).toBe(false);
    expect(
      p08DevReadVerified({
        ...P08_DEV_READ_EVIDENCE!,
        approvedLimitations: [],
      }),
    ).toBe(false);
    expect(P08_RELEASE.status).toBe('DEV_TEST_LIVE_READ_UAT_20261014');
    expect(P08_SOURCE_COMMIT).toBe('6bca132ced532579856acb411dfd932a5a909e34');
  });
  it('4GET only / no body or write headers / query encoding and endpoint allowlists', async () => {
    const h = harness();
    await h.api.records({
      date_mode: 'ALL',
      keyword: 'a & b',
      status: 'ACCEPTED',
    });
    await h.api.detail('DOCUMENT:' + id(9), 'DOCUMENT:' + id(10));
    await h.api.session(id(9));
    await h.api.summary({ date_mode: 'DATE', date: '2026-10-10' });
    expect(h.calls).toHaveLength(4);
    for (const call of h.calls) {
      const q = new URL('https://mock.invalid' + call.path);
      expect(q.searchParams.get('warehouse_id')).toBe(id(3));
      expect(call.options).not.toHaveProperty('body');
      expect(call.options).not.toHaveProperty('headers');
    }
    expect(h.calls[0].path).toContain('a+%26+b');
    expect(h.calls[1].path).toContain('DOCUMENT%3A');
    expect([
      ...new URL('https://mock.invalid' + h.calls[2].path).searchParams.keys(),
    ]).toEqual(['warehouse_id', 'limit']);
    expect(h.calls[3].path).not.toMatch(/limit|cursor|activityId/);
  });
  it.each([
    'source',
    'business',
    'status',
    'keyword',
    'date_mode',
    'date',
    'activityId',
    'sort',
    'page',
  ])('session rejects list field %s; summary rejects paging', key => {
    expect(() => p08Query('session', id(3), { [key]: 'ALL' })).toThrow();
    expect(() => p08Query('summary', id(3), { limit: 1 })).toThrow();
    expect(() => p08Query('summary', id(3), { cursor: 'opaque' })).toThrow();
  });
  it('date modes validate exact dates and reversed pairs; limits and privacy claims rejected', () => {
    for (const bag of [
      { date_mode: 'ALL', date: '2026-10-10' },
      { date_mode: 'DATE' },
      { date_mode: 'DATE', date: '2026-02-30' },
      { date_mode: 'RANGE', from: '2026-10-10', to: '2026-10-09' },
      { timezone: 'UTC' },
      { tenant: 'x' },
      { date_from: 'x' },
      { limit: 0 },
      { limit: 101 },
      { keyword: 'x'.repeat(201) },
    ])
      expect(() => p08Query('records', id(3), bag)).toThrow();
    expect(
      p08Query('records', id(3), {
        date_mode: 'RANGE',
        from: '2026-10-09',
        to: '2026-10-10',
        cursor: '',
        status: '',
      }),
    ).not.toMatch(/cursor=|status=/);
  });
  it('requires confirmed READY ACTIVE exact warehouse/history.read, never first warehouse/role', () => {
    const c = context();
    expect(() =>
      p08Scope({ ...c, user: { ...c.user, permissions: [], role: 'admin' } }),
    ).toThrow();
    expect(() =>
      p08Scope({
        ...c,
        user: { ...c.user, warehouse_context: { status: 'REQUIRED' } },
      }),
    ).toThrow();
    expect(() =>
      p08Scope({
        ...c,
        user: {
          ...c.user,
          available_warehouses: [{ warehouse_id: id(3), status: 'INACTIVE' }],
        },
      }),
    ).toThrow();
  });
  it('dedups mirror by activity; multiple events with same parent survive; selected outside page valid', async () => {
    const h = harness();
    const list = await h.api.records({ date_mode: 'ALL' });
    expect(list.data).toHaveLength(2);
    expect(list.data[0].recordId).toBe(list.data[1].recordId);
    const d = await h.api.detail('DOCUMENT:' + id(9), 'DOCUMENT:' + id(12));
    expect(d.data.selectedActivity?.activityId).toBe('DOCUMENT:' + id(12));
    expect(
      d.data.events.some(
        e => e.activityId === d.data.selectedActivity?.activityId,
      ),
    ).toBe(false);
  });
  it.each(['raw-id', 'LS-0001', 'SCAN:auth-session'])(
    'rejects invalid namespaces %s',
    idValue => {
      expect(() => p08Identity(idValue)).toThrow();
    },
  );
  it('wrong parent/event UUID/meta warehouse/contract/capability denied; no host forwarding', async () => {
    for (const mutate of [
      (b: any) => {
        b.meta.contract = 'wrong';
      },
      (b: any) => {
        b.meta.warehouseId = id(4);
      },
      (b: any) => {
        b.data[0].eventId = id(400);
      },
      (b: any) => {
        b.data[0].detail.url = 'https://foreign.invalid';
      },
      (b: any) => {
        b.data[0].rawCode = 'not permitted';
      },
    ]) {
      const h = harness(mutate);
      await expect(h.api.records({ date_mode: 'ALL' })).rejects.toThrow();
    }
    const h = harness(b => {
      b.data.events[0].recordId = 'DOCUMENT:' + id(400);
    });
    await expect(h.api.detail('DOCUMENT:' + id(9))).rejects.toThrow();
  });
  it('history.read alone cannot consume source or owner capabilities', async () => {
    const h = harness();
    h.setContext({
      ...context(),
      user: { ...context().user, permissions: ['history.read'] },
    });
    await expect(h.api.records({ date_mode: 'ALL' })).rejects.toThrow();
    const d = harness();
    d.setContext({
      ...context(),
      user: {
        ...context().user,
        permissions: context().user!.permissions!.filter(
          p => p !== 'documents.read',
        ),
      },
    });
    await expect(d.api.records({ date_mode: 'ALL' })).rejects.toThrow();
  });
  it('opaque cursor is bound to path/query/limit/session/rights/kho; cannot reuse across endpoints', async () => {
    const h = harness(b => {
      b.meta.hasMore = true;
      b.meta.nextCursor = 'opaque-1';
    });
    await h.api.records({ date_mode: 'ALL' }, { limit: 1 });
    await h.api.records({ date_mode: 'ALL' }, { limit: 1, cursor: 'opaque-1' });
    for (const [f, limit] of [
      [{ date_mode: 'ALL', keyword: 'new' }, 1],
      [{ date_mode: 'ALL' }, 20],
    ] as const)
      await expect(
        h.api.records(f, { limit, cursor: 'opaque-1' }),
      ).rejects.toThrow();
    await expect(
      h.api.detail('DOCUMENT:' + id(9), undefined, {
        limit: 1,
        cursor: 'opaque-1',
      }),
    ).rejects.toThrow();
    await expect(
      h.api.session(id(9), { limit: 1, cursor: 'opaque-1' }),
    ).rejects.toThrow();
    h.setContext({
      ...context(),
      session: { ...context().session!, authSessionId: id(5) },
      user: { ...context().user!, auth_session_id: id(5) },
    });
    await expect(
      h.api.records({ date_mode: 'ALL' }, { limit: 1, cursor: 'opaque-1' }),
    ).rejects.toThrow();
  });
  it('session whole-batch metrics do not derive from page1; RESOLVED other; empty batch quantity null', async () => {
    const h = harness();
    const r = await h.api.session(id(9), { limit: 1 });
    expect(r.data.events).toHaveLength(1);
    expect([
      r.data.total,
      r.data.accepted,
      r.data.duplicate,
      r.data.other,
      r.data.quantity,
    ]).toEqual([3, 1, 1, 1, null]);
    const empty = harness(b => {
      Object.assign(b.data, {
        total: 0,
        accepted: 0,
        duplicate: 0,
        other: 0,
        statusTotals: [],
        events: [],
      });
      b.meta.total = 0;
    });
    expect((await empty.api.session(id(9))).data.quantity).toBeNull();
  });
  it('summary complete/partial/true zero use grandTotal; forbidden is not source availability', async () => {
    const partial = harness(b => {
      b.meta.sources.SCAN.status = 'PARTIAL';
      b.data.coverage = 'PARTIAL';
      b.data.grandTotal = null;
    });
    expect(
      (await partial.api.summary({ date_mode: 'ALL' })).data.grandTotal,
    ).toBeNull();
    const bad = harness(b => {
      b.meta.sources.SCAN.status = 'UNAVAILABLE';
    });
    await expect(bad.api.summary({ date_mode: 'ALL' })).rejects.toThrow();
    const zero = harness(b => {
      b.meta.total = 0;
      b.data.grandTotal = 0;
      b.data.availableTotal = 0;
      b.data.groups.forEach((g: any) => {
        g.availableTotal = 0;
      });
      b.data.statusTotals = [];
    });
    expect((await zero.api.summary({ date_mode: 'ALL' })).data.grandTotal).toBe(
      0,
    );
    const forbidden = harness(b => {
      b.meta.sources.SCAN.status = 'FORBIDDEN';
    });
    expect(
      (await forbidden.api.summary({ date_mode: 'ALL' })).meta.sources.SCAN
        .status,
    ).toBe('FORBIDDEN');
  });
  it('extra actor/serial/version never used to hydrate privacy projection', async () => {
    const h = harness(b => {
      Object.assign(b.data[0], {
        actor: 'mock-secret',
        serial: 'secret',
        version: 100,
      });
    });
    const r = await h.api.records({ date_mode: 'ALL' });
    expect(r.data[0]).not.toHaveProperty('actor');
    expect(r.data[0]).not.toHaveProperty('serial');
    expect(r.data[0]).not.toHaveProperty('version');
    expect(r.data[0]).not.toHaveProperty('password');
  });
});
