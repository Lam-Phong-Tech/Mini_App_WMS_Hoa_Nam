/** Regression evidence for BE7d661813. Mock HTTP only; never substitutes BE CI/live. */
import { AppError } from '../src/errors/AppError';
import type { RequestOptions } from '../src/api/client';
import {
  createP06CatalogService,
  type P06ListResponse,
  type P06TimelineResponse,
} from '../src/services/wms/p06Catalog';
import type { ReadClient } from '../src/services/wms/readOnlyClient';
import { P06LookupFlow } from '../src/features/lookup/p06LookupFlow';
import {
  mockId,
  p06MockHarness,
  p06MockSession,
  type P06MockScenario,
} from '../src/web/p06ReviewFixtures';
const sku = { type: 'SKU' as const, id: mockId(100) },
  item = { type: 'ITEM' as const, id: mockId(200) };
function patch(mutate: (body: any, path: string) => void) {
  const h = p06MockHarness();
  const client: ReadClient = {
    async get<T>(
      path: string,
      options?: Omit<RequestOptions, 'path' | 'method'>,
    ) {
      const response = await h.client.get<any>(path, options);
      mutate(response.data, path);
      return { ...response, data: response.data as T };
    },
  };
  return {
    ...h,
    service: createP06CatalogService(client, h.readSession, () => true),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { resolve, promise };
}
describe('P06 BE supplement — current contract completeness', () => {
  it.each([
    [false, false, false],
    [true, false, true],
    [false, true, true],
    [true, true, false],
  ])(
    'context/detail permission mapping agrees: view=%s manage=%s print=%s',
    async (view, manage, print) => {
      const h = p06MockHarness();
      Object.assign(h.context.permissions, {
        warranty_view: view,
        warranty_manage: manage,
        label_print_permission: print,
      });
      const context = (await h.service.context()).data;
      for (const target of [sku, item]) {
        const detail = (await h.service.detail(context, target)).data;
        expect(context.permissions.warranty_view).toBe(view || manage);
        expect(detail.capabilities.warranty.view_permitted).toBe(
          context.permissions.warranty_view,
        );
        expect(detail.capabilities.warranty.manage_permitted).toBe(
          context.permissions.warranty_manage,
        );
        expect(detail.capabilities.label_print.permission_granted).toBe(
          context.permissions.label_print_permission,
        );
        expect(detail.capabilities.warranty.action_exposed).toBe(false);
        expect(detail.capabilities.label_print.action_exposed).toBe(false);
      }
    },
  );
  it.each(['items-without-sku', 'stock-without-sku', 'manage-without-view'])(
    'rejects inconsistent authoritative rights: %s',
    async kind => {
      const h = patch((body, path) => {
        if (!path.endsWith('/context')) return;
        const p = body.data.permissions;
        if (kind === 'manage-without-view') {
          p.warranty_manage = true;
          p.warranty_view = false;
        } else {
          p.skus = false;
          p.items = kind === 'items-without-sku';
          p.stock = kind === 'stock-without-sku';
        }
      });
      await expect(h.service.context()).rejects.toMatchObject({
        code: 'P06_PERMISSION_PROJECTION_MISMATCH',
      });
      expect(h.calls).toHaveLength(1);
    },
  );
  it.each([
    { body: [] },
    { body: null },
    { body: {} },
    { method: 'POST' },
    { headers: { Authorization: 'ISOLATED_INVALID_OVERRIDE' } },
  ])('query-only GET rejects runtime option injection %j', async options => {
    const h = p06MockHarness();
    await expect(h.service.context(options as any)).rejects.toMatchObject({
      code: 'P06_INVALID_QUERY',
    });
    expect(h.calls).toHaveLength(0);
  });
  it('does not alter server timeline total2 to disguise the reported BE expected3 failure', async () => {
    const h = patch((body, path) => {
      if (path.endsWith('/timeline')) {
        body.data = [body.data[0], body.data[2]];
        body.meta.total = 2;
        body.meta.last_page = 1;
      }
    });
    const result = await h.service.timeline(h.context, sku);
    expect(result.meta.total).toBe(2);
    expect(result.data).toHaveLength(2);
    expect(result.meta.sources).toEqual({
      LEDGER: 'INCLUDED',
      WARRANTY: 'INCLUDED',
    });
  });
  it('timeline rows greater than declared total are schema failure, not recalculated success', async () => {
    const h = patch((body, path) => {
      if (path.endsWith('/timeline')) {
        body.meta.total = 1;
        body.meta.last_page = 1;
      }
    });
    await expect(h.service.timeline(h.context, sku)).rejects.toMatchObject({
      kind: 'parse',
    });
  });
  it.each(['warehouse-required', 'warehouse-inactive'] as P06MockScenario[])(
    '%s stops at context; no scoped HTTP and no false empty stock',
    async scenario => {
      const h = p06MockHarness(scenario),
        flow = new P06LookupFlow(h.service);
      await flow.start(p06MockSession);
      expect(h.calls).toHaveLength(1);
      expect(h.calls[0].path.endsWith('/context')).toBe(true);
      expect(flow.snapshot().context.error).toMatchObject({
        status: 409,
        code:
          scenario === 'warehouse-inactive'
            ? 'WAREHOUSE_INACTIVE'
            : 'WAREHOUSE_CONTEXT_REQUIRED',
      });
      expect(flow.snapshot().list.data).toBeUndefined();
      expect(flow.snapshot().stock.data).toBeUndefined();
    },
  );
  it('replays list pages from fresh reads after remount, keeping query/category/scroll', async () => {
    const h = p06MockHarness(),
      first = new P06LookupFlow(h.service);
    await first.start(p06MockSession);
    await first.moreList();
    first.setScroll(1, 1300);
    const view = first.snapshot().view;
    expect(view.listPages).toBe(2);
    h.cards[0].sku_name = 'Tên mới từ nguồn mock';
    const next = new P06LookupFlow(h.service);
    await next.start(p06MockSession, view);
    expect(next.snapshot().list.data?.data).toHaveLength(23);
    expect(next.snapshot().list.data?.meta.page).toBe(2);
    expect(next.snapshot().list.data?.data[0].sku_name).toBe(
      'Tên mới từ nguồn mock',
    );
    expect(first.snapshot().list.data?.data[0].sku_name).not.toBe(
      'Tên mới từ nguồn mock',
    );
    expect(next.snapshot().view.scroll[1]).toBe(1300);
    expect(next.snapshot().view.category).toBe(view.category);
    expect(next.snapshot().view.query).toBe(view.query);
    expect(next.snapshot().list.data?.meta.snapshot.id).not.toBe(
      first.snapshot().list.data?.meta.snapshot.id,
    );
  });
  it('replays timeline pages fresh for S04 navigation metadata; source/scroll retained', async () => {
    const h = p06MockHarness(),
      first = new P06LookupFlow(h.service);
    await first.start(p06MockSession);
    await first.open(sku);
    await first.toPanel(4);
    await first.loadTimeline(true);
    first.setScroll(4, 600);
    const next = new P06LookupFlow(h.service);
    await next.start(p06MockSession, first.snapshot().view);
    expect(next.snapshot().timeline.data?.data).toHaveLength(25);
    expect(next.snapshot().timeline.data?.meta.page).toBe(2);
    expect(next.snapshot().view.scroll[4]).toBe(600);
    await next.setSource('WARRANTY');
    expect(next.snapshot().view.timelinePages).toBe(1);
    expect(next.snapshot().view.scroll[4]).toBe(0);
  });
  it('late replay page cannot overwrite a new query even if mock ignores abort', async () => {
    const h = p06MockHarness(),
      first = new P06LookupFlow(h.service);
    await first.start(p06MockSession);
    await first.moreList();
    const original = h.service.list,
      second = deferred<P06ListResponse>(),
      entered = deferred<void>();
    h.service.list = (...args) => {
      if (args[2]?.page === 2) {
        entered.resolve();
        return second.promise;
      }
      return original(...args);
    };
    const next = new P06LookupFlow(h.service),
      replay = next.start(p06MockSession, first.snapshot().view);
    await entered.promise;
    next.setQuery('XP');
    await next.search();
    const latest = next.snapshot().list.data;
    second.resolve(
      await original(h.context, 'SKU', { sku_type: 'PRODUCT', page: 2 }),
    );
    await replay;
    expect(next.snapshot().view.query).toBe('XP');
    expect(next.snapshot().list.data).toBe(latest);
    expect(next.snapshot().view.listPages).toBe(1);
  });
  it('page2 permission withdrawal removes previously displayed catalogue data', async () => {
    const h = p06MockHarness(),
      flow = new P06LookupFlow(h.service);
    await flow.start(p06MockSession);
    h.service.list = async () => {
      throw new AppError({
        kind: 'http',
        status: 403,
        code: 'RAW_REVOKED',
        message: 'Quyền bị thu hồi',
      });
    };
    await flow.moreList();
    expect(flow.snapshot().list.error?.code).toBe('RAW_REVOKED');
    expect(flow.snapshot().list.data).toBeUndefined();
  });
  it('timeline pagination rejection never leaves old events under a forbidden message', async () => {
    const h = p06MockHarness(),
      flow = new P06LookupFlow(h.service);
    await flow.start(p06MockSession);
    await flow.open(sku);
    await flow.toPanel(4);
    h.service.timeline = async () => {
      throw new AppError({
        kind: 'http',
        status: 403,
        message: 'Quyền bị thu hồi',
      });
    };
    await flow.loadTimeline(true);
    expect(flow.snapshot().timeline.error?.status).toBe(403);
    expect(flow.snapshot().timeline.data).toBeUndefined();
  });
  it('Back cancels a gallery read and clears loading; late response does not resurrect it', async () => {
    const h = p06MockHarness(),
      flow = new P06LookupFlow(h.service);
    await flow.start(p06MockSession);
    await flow.open(sku);
    const original = h.service.gallery,
      pending = deferred<Awaited<ReturnType<typeof original>>>();
    h.service.gallery = () => pending.promise;
    const request = flow.loadGallery();
    expect(flow.snapshot().gallery.loading).toBe(true);
    flow.back();
    expect(flow.snapshot().gallery.loading).toBe(false);
    pending.resolve(await original(h.context, sku.id));
    await request;
    expect(flow.snapshot().gallery.data).toBeUndefined();
    expect(flow.snapshot().view.panel).toBe(1);
  });
  it('limited rights keep authorized warranty history; stock/item are forbidden rather than zero', async () => {
    const h = p06MockHarness('limited-rights'),
      c = (await h.service.context()).data;
    const d = (await h.service.detail(c, sku)).data,
      timeline: P06TimelineResponse = await h.service.timeline(c, sku);
    expect(d.stock).toBeNull();
    expect(d.stock_availability).toBe('FORBIDDEN');
    expect(timeline.meta.sources).toEqual({
      LEDGER: 'FORBIDDEN',
      WARRANTY: 'INCLUDED',
    });
    expect(
      timeline.data.every(
        e =>
          e.source === 'WARRANTY' &&
          e.item_id === null &&
          e.signed_quantity === null,
      ),
    ).toBe(true);
    await expect(h.service.detail(c, item)).rejects.toMatchObject({
      status: 403,
    });
  });
});
