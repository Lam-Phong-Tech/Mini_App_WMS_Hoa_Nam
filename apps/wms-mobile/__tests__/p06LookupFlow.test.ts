import {
  P06LookupFlow,
  p06DocumentTarget,
  p06EventQuantity,
  p06StockChip,
  p06StockText,
} from '../src/features/lookup/p06LookupFlow';
import {
  p06Identity,
  p06ScopeKey,
  p06Unique,
  type P06ListResponse,
} from '../src/services/wms/p06Catalog';
import {
  mockId,
  p06MockEvents,
  p06MockHarness,
  p06MockSession,
  p06MockStock,
} from '../src/web/p06ReviewFixtures';
const sku = { type: 'SKU' as const, id: mockId(100) };
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { resolve, promise };
}
describe('P06 native controller lifecycle — isolated mock', () => {
  it('S01 starts as SKU/PRODUCT; counts come from response not loaded rows', async () => {
    const h = p06MockHarness(),
      flow = new P06LookupFlow(h.service);
    await flow.start(p06MockSession);
    expect(flow.snapshot().view.mode).toBe('keyword');
    expect(flow.snapshot().list.data?.meta.count_unit).toBe('SKU');
    expect(flow.snapshot().list.data?.meta.total).toBe(23);
    expect(flow.snapshot().list.data?.data).toHaveLength(20);
  });
  it('Back preserves query/category/pages/list scroll and reopens exact identity', async () => {
    const h = p06MockHarness(),
      flow = new P06LookupFlow(h.service);
    await flow.start(p06MockSession);
    flow.setQuery('XP');
    await flow.search();
    flow.setScroll(1, 182);
    const before = flow.snapshot().list.data;
    await flow.open(sku);
    await flow.toPanel(3);
    expect(flow.snapshot().view.panel).toBe(3);
    expect(flow.back()).toBe(true);
    expect(flow.snapshot().view.panel).toBe(2);
    flow.back();
    expect(flow.snapshot().view.query).toBe('XP');
    expect(flow.snapshot().view.scroll[1]).toBe(182);
    expect(flow.snapshot().list.data).toBe(before);
    expect(flow.back()).toBe(false);
  });
  it('scan filters related SKU, can open component and restores category after clear', async () => {
    const h = p06MockHarness(),
      flow = new P06LookupFlow(h.service);
    await flow.start(
      p06MockSession,
      undefined,
      'HN1|SKU=D210108|ITEM=HN12349|SER=SER-123',
    );
    expect(flow.snapshot().view.panel).toBe(2);
    expect(flow.snapshot().view.identity).toEqual({
      type: 'SKU',
      id: mockId(104),
    });
    expect(h.calls[1].path.endsWith('/skus')).toBe(true);
    expect(h.calls[1].options?.query?.item_code).toBe('HN12349');
    expect(h.calls[1].options?.query?.sku_type).toBe('ALL');
    flow.back();
    await flow.clear();
    expect(flow.snapshot().view.category).toBe('PRODUCT');
    expect(flow.snapshot().list.data?.meta.count_unit).toBe('SKU');
  });
  it('plain scanned SKU stays keyword instead of being mislabeled item_code', async () => {
    const h = p06MockHarness(),
      flow = new P06LookupFlow(h.service);
    await flow.start(p06MockSession, undefined, 'D210108');
    expect(flow.snapshot().view).toMatchObject({
      query: 'D210108',
      mode: 'keyword',
    });
    expect(h.calls[1].options?.query?.keyword).toBe('D210108');
    expect(h.calls[1].options?.query?.item_code).toBeUndefined();
  });
  it('serial mode is explicit, preserving query and category; no code guessing', async () => {
    const h = p06MockHarness(),
      flow = new P06LookupFlow(h.service);
    await flow.start(p06MockSession);
    flow.setQuery('MOCK-SN-1');
    await flow.setFilters('serial', 'ACTIVE');
    await flow.search(true);
    expect(flow.snapshot().view.identity).toEqual({
      type: 'SKU',
      id: mockId(101),
    });
    expect(h.calls[1].options?.query?.keyword).toBeUndefined();
    expect(h.calls.at(-2)?.options?.query?.serial).toBe('MOCK-SN-1');
  });
  it.each([
    ['serial', 'MOCK-SN-1'],
    ['item_code', 'HN12346'],
  ] as const)(
    'S01 %s filter keeps SKU cards, null ITEM fields and SKU totals',
    async (mode, query) => {
      const h = p06MockHarness(),
        flow = new P06LookupFlow(h.service);
      await flow.start(p06MockSession);
      flow.setQuery(query);
      await flow.setFilters(mode, 'ACTIVE');
      const list = flow.snapshot().list.data!;
      expect(list.meta.count_unit).toBe('SKU');
      expect(list.meta.total).toBe(1);
      expect(list.meta.tab_totals).toEqual({
        ALL: 1,
        PRODUCT: 1,
        COMPONENT: 0,
      });
      expect(list.data[0]).toMatchObject({
        card_type: 'SKU',
        sku_id: mockId(101),
        item_id: null,
        item_code: null,
        serial_number: null,
      });
      expect(h.calls.at(-1)?.path).toBe('/api/v1/mini-app/catalog/skus');
      expect(h.calls.at(-1)?.options?.query?.[mode]).toBe(query);
      expect(h.calls.some(call => call.path.endsWith('/items'))).toBe(false);
      await flow.refresh();
      expect(flow.snapshot().list.data?.meta.count_unit).toBe('SKU');
      expect(h.calls.at(-1)?.path).toBe('/api/v1/mini-app/catalog/skus');
    },
  );
  it('S01 exact serial still requires ITEM-read permission, does not fabricate SKU results', async () => {
    const h = p06MockHarness(),
      flow = new P06LookupFlow(h.service);
    h.context.permissions.items = false;
    await flow.start(p06MockSession);
    flow.setQuery('MOCK-SN-1');
    await flow.setFilters('serial', 'ACTIVE');
    expect(flow.snapshot().list.error).toMatchObject({
      status: 403,
      code: 'P06_PERMISSION_DENIED',
    });
    expect(flow.snapshot().list.data).toBeUndefined();
    expect(h.calls.filter(call => call.options?.query?.serial)).toHaveLength(0);
  });
  it('explicit ITEM detail remains separate, Back reloads the S01 SKU list', async () => {
    const h = p06MockHarness(),
      flow = new P06LookupFlow(h.service);
    await flow.start(p06MockSession);
    await flow.open({ type: 'ITEM', id: mockId(201) });
    expect(flow.snapshot().detail.data?.data.card).toMatchObject({
      card_type: 'ITEM',
      item_id: mockId(201),
      sku_id: mockId(101),
    });
    flow.back();
    expect(flow.snapshot().view.panel).toBe(1);
    expect(flow.snapshot().list.data?.meta.count_unit).toBe('SKU');
    expect(
      flow.snapshot().list.data?.data.every(card => card.card_type === 'SKU'),
    ).toBe(true);
  });
  it('ambiguous exact matches remain selectable, never first auto-select', async () => {
    const h = p06MockHarness(),
      original = h.service.list;
    h.service.list = async (...args) => {
      const r = await original(...args);
      if (args[1] === 'SKU' && args[2]?.item_code) {
        const first = r.data[0];
        return {
          ...r,
          data: [
            first,
            {
              ...first,
              sku_id: mockId(999),
              stock: first.stock
                ? { ...first.stock, sku_id: mockId(999) }
                : null,
            },
          ],
          meta: {
            ...r.meta,
            total: 2,
            tab_totals: { ALL: 2, PRODUCT: 2, COMPONENT: 0 },
          },
        };
      }
      return r;
    };
    const flow = new P06LookupFlow(h.service);
    await flow.start(p06MockSession, undefined, 'HN1|SKU=MOCK|ITEM=HN12345');
    expect(flow.snapshot().list.data?.meta.total).toBe(2);
    expect(flow.snapshot().view.panel).toBe(1);
    expect(flow.snapshot().view.identity).toBeUndefined();
    expect(h.calls.some(c => c.path.includes(`/skus/${mockId(100)}`))).toBe(
      false,
    );
  });
  it('blank exact input issues no list request', async () => {
    const h = p06MockHarness(),
      flow = new P06LookupFlow(h.service);
    await flow.start(p06MockSession);
    const n = h.calls.length;
    await flow.setFilters('serial', 'ACTIVE');
    expect(flow.snapshot().list.error?.code).toBe('P06_EMPTY_EXACT');
    expect(h.calls).toHaveLength(n);
  });
  it('old search is aborted and dropped even when transport ignores AbortSignal', async () => {
    const h = p06MockHarness(),
      first = deferred<P06ListResponse>(),
      second = deferred<P06ListResponse>(),
      original = h.service.list;
    const flow = new P06LookupFlow(h.service);
    await flow.start(p06MockSession);
    const signals: AbortSignal[] = [];
    h.service.list = async (_c, _type, q, options) => {
      signals.push(options!.signal!);
      return q?.keyword === 'old' ? first.promise : second.promise;
    };
    flow.setQuery('old');
    const a = flow.search();
    flow.setQuery('new');
    const b = flow.search();
    const expected = await original(h.context, 'SKU', {
      keyword: 'XP',
      sku_type: 'PRODUCT',
    });
    second.resolve(expected);
    await b;
    first.resolve({ ...expected, data: [] });
    await a;
    expect(signals[0].aborted).toBe(true);
    expect(flow.snapshot().list.data).toBe(expected);
    expect(flow.snapshot().view.query).toBe('new');
  });
  it('load-more dedups typed identities and prevents duplicate request', async () => {
    const h = p06MockHarness(),
      flow = new P06LookupFlow(h.service);
    await flow.start(p06MockSession);
    await Promise.all([flow.moreList(), flow.moreList()]);
    expect(flow.snapshot().list.data?.data).toHaveLength(23);
    expect(h.calls.filter(c => c.options?.query?.page === 2)).toHaveLength(1);
    const card = flow.snapshot().list.data!.data[0];
    expect(
      p06Unique([card, card], c => JSON.stringify(p06Identity(c))),
    ).toHaveLength(1);
    const both = p06Unique(
      [sku, { type: 'ITEM' as const, id: sku.id }],
      c => `${c.type}:${c.id}`,
    );
    expect(both).toHaveLength(2);
  });
  it('identity switch discards late detail and gallery/stock from previous item', async () => {
    const h = p06MockHarness(),
      flow = new P06LookupFlow(h.service);
    await flow.start(p06MockSession);
    const original = h.service.detail,
      old = deferred<Awaited<ReturnType<typeof original>>>();
    h.service.detail = async (...args) =>
      args[1].id === sku.id ? old.promise : original(...args);
    const a = flow.open(sku);
    await flow.open({ type: 'SKU', id: mockId(101) });
    old.resolve(await original(h.context, sku));
    await a;
    expect(flow.snapshot().detail.data?.data.card.sku_id).toBe(mockId(101));
    expect(flow.snapshot().recent.some(r => r.identity.id === sku.id)).toBe(
      false,
    );
  });
  it('logout clears results/recents immediately and ignores late request', async () => {
    const h = p06MockHarness(),
      flow = new P06LookupFlow(h.service);
    await flow.start(p06MockSession);
    await flow.open(sku);
    const original = h.service.stock,
      delayed = deferred<Awaited<ReturnType<typeof original>>>();
    h.service.stock = () => delayed.promise;
    const pending = flow.toPanel(3);
    const data = await original(h.context, sku.id);
    h.setSession(undefined);
    await flow.start(undefined);
    delayed.resolve(data);
    await pending;
    expect(flow.snapshot().recent).toEqual([]);
    expect(flow.snapshot().detail.data).toBeUndefined();
    expect(flow.snapshot().stock.data).toBeUndefined();
    expect(flow.snapshot().context.error?.kind).toBe('auth');
  });
  it('restored navigation belongs to actor/session/warehouse; fresh detail is read', async () => {
    const h = p06MockHarness(),
      a = new P06LookupFlow(h.service);
    await a.start(p06MockSession);
    await a.open(sku);
    a.setScroll(2, 140);
    const restored = a.snapshot().view,
      b = new P06LookupFlow(h.service);
    await b.start(p06MockSession, restored);
    expect(b.snapshot().view.panel).toBe(2);
    expect(b.snapshot().view.scroll[2]).toBe(140);
    expect(b.snapshot().detail.data).not.toBe(a.snapshot().detail.data);
    const other = { ...p06MockSession, authSessionId: mockId(99) };
    h.setSession(other);
    const c = new P06LookupFlow(h.service);
    await c.start(other, restored);
    expect(c.snapshot().view.panel).toBe(1);
    expect(c.snapshot().recent).toEqual([]);
    expect(c.snapshot().view.scopeKey).toBe(p06ScopeKey(other));
  });
  it('timeline load-more keeps server total and event_id dedup; source switch resets page', async () => {
    const h = p06MockHarness(),
      flow = new P06LookupFlow(h.service);
    await flow.start(p06MockSession);
    await flow.open(sku);
    await flow.toPanel(4);
    await flow.loadTimeline(true);
    expect(flow.snapshot().timeline.data?.data).toHaveLength(25);
    expect(flow.snapshot().timeline.data?.meta.page).toBe(2);
    await flow.setSource('WARRANTY');
    expect(flow.snapshot().timeline.data?.meta.page).toBe(1);
    expect(
      flow.snapshot().timeline.data?.data.every(e => e.source === 'WARRANTY'),
    ).toBe(true);
  });
  it('controlled refresh revalidates context; revoked data not left visible', async () => {
    const h = p06MockHarness(),
      flow = new P06LookupFlow(h.service);
    await flow.start(p06MockSession);
    await flow.open(sku);
    h.context.permissions.skus = false;
    await flow.refresh();
    expect(flow.snapshot().detail.data).toBeUndefined();
    expect(flow.snapshot().detail.error?.status).toBe(403);
  });
  it('empty, source errors and missing values remain distinct', async () => {
    const empty = new P06LookupFlow(p06MockHarness('empty').service);
    await empty.start(p06MockSession);
    expect(empty.snapshot().list.data?.meta.total).toBe(0);
    expect(empty.snapshot().list.error).toBeUndefined();
    const error = new P06LookupFlow(p06MockHarness('unavailable').service);
    await error.start(p06MockSession);
    expect(error.snapshot().context.error?.kind).toBe('network');
    expect(error.snapshot().list.data).toBeUndefined();
    expect(p06StockText(null)).toBe('—');
    expect(p06StockText(0)).toBe('0');
    expect(p06StockText(-2.5)).toBe('-2,5');
    expect(p06StockChip({ ...p06MockStock(), status: 'MISMATCH' })).toBe(
      'Chưa xác nhận',
    );
  });
  it('document links use exact type+ID+can_open; signed warranty quantity is never faked', () => {
    const events = p06MockEvents();
    expect(p06DocumentTarget(events[0])).toEqual({
      owner: 'P12',
      id: mockId(500),
      type: 'receipt',
    });
    expect(p06DocumentTarget(events[2])).toEqual({
      owner: 'P09',
      id: mockId(502),
      type: 'WARRANTY_CASE',
    });
    expect(
      p06DocumentTarget({
        ...events[0],
        document: { ...events[0].document!, can_open: false },
      }),
    ).toBeUndefined();
    expect(
      p06DocumentTarget({
        ...events[0],
        document: { ...events[0].document!, type: 'PN' },
      }),
    ).toBeUndefined();
    expect(p06EventQuantity(events[1])).toBe('-2,5');
    expect(p06EventQuantity(events[2])).toBe('Không áp dụng');
  });
});
