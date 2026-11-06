import { createP08Controller } from '../src/features/history/p08HistoryController';
import { createP08MockHistory } from '../src/services/wms/p08History';
import { AppError } from '../src/errors/AppError';
import { event, harness, id } from './fixtures/p08Mock';
import type { ReadClient } from '../src/services/wms/readOnlyClient';
import type { RequestOptions } from '../src/api/client';
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

describe('P08 read controller / mock HTTP', () => {
  it('direct document history preserves canonical parent and does not guess an event',async()=>{
    const h=harness(),detail=jest.spyOn(h.api,'detail');
    const c=createP08Controller(h.api);
    c.record('DOCUMENT:'+id(9),{source:'DOCUMENT',business:'INBOUND',date_mode:'ALL'});
    await flush();
    expect(detail).toHaveBeenCalledWith('DOCUMENT:'+id(9),undefined,{limit:20},expect.anything());
    expect(c.snapshot().current.recordId).toBe('DOCUMENT:'+id(9));
    expect(c.back()).toBe(false);c.dispose();
  });
  it('422 cursor scope mismatch purges protected pages and retries first page', async () => {
    const h = harness(b => {
      b.meta.hasMore = true;
      b.meta.nextCursor = 'opaque';
    });
    const client: ReadClient = {
      async get<T>(p: string, o?: Omit<RequestOptions, 'path' | 'method'>) {
        if (p.includes('cursor='))
          throw new AppError({
            kind: 'http',
            status: 422,
            code: 'HISTORY_CURSOR_SCOPE_MISMATCH',
            message: 'mock scope changed',
          });
        return h.client.get<T>(p, o);
      },
    };
    const c = createP08Controller(createP08MockHistory(h.readContext, client));
    await c.load();
    await c.load(true);
    expect(c.snapshot().current.rows).toHaveLength(0);
    expect(c.snapshot().current.meta).toBeUndefined();
    await c.load();
    expect(c.snapshot().current.rows).toHaveLength(2);
    expect(h.calls.at(-1)?.path).not.toContain('cursor=');
    c.dispose();
  });
  it('restoring same session pages can continue opaque cursor; changing source/rights resets', async () => {
    const h = harness(b => {
      b.meta.hasMore = true;
      b.meta.nextCursor = 'opaque-same-session';
    });
    const first = createP08Controller(h.api);
    await first.load();
    first.scroll(132);
    const retained = first.snapshot();
    first.dispose();
    const next = createP08Controller(h.api, retained);
    await next.load(true);
    expect(next.snapshot().current.scrollY).toBe(132);
    expect(h.calls[1].path).toContain('cursor=opaque-same-session');
    next.filters({ date_mode: 'ALL', source: 'SCAN' });
    await flush();
    expect(h.calls.at(-1)?.path).not.toContain('cursor=');
    next.dispose();
  });
  it('Back keeps loaded pages, filter bag, cursor and scroll; dedup activity not parent', async () => {
    let page = 0;
    const h = harness(b => {
      b.data = page++ ? [event(11), event(12)] : [event(10), event(11)];
      b.meta.hasMore = page === 1;
      b.meta.nextCursor = page === 1 ? 'opaque-page2' : null;
    });
    const c = createP08Controller(h.api);
    await c.load();
    await c.load(true);
    c.scroll(144);
    c.detail(c.snapshot().current.rows[1]);
    await flush();
    expect(c.snapshot().current.panel).toBe('S02');
    expect(c.back()).toBe(true);
    expect(c.snapshot().current.rows).toHaveLength(3);
    expect(c.snapshot().current.meta?.total).toBe(3);
    expect(c.snapshot().current.scrollY).toBe(144);
    expect(c.snapshot().current.filters.date_mode).toBe('ALL');
    c.dispose();
  });
  it('latest query wins even when mock ignores AbortSignal; no stale timeline on a new day', async () => {
    const h = harness();
    let finish: (() => void) | undefined;
    const mock: ReadClient = {
      async get<T>(
        path: string,
        options?: Omit<RequestOptions, 'path' | 'method'>,
      ) {
        const result = await h.client.get<T>(path, options);
        if (path.includes('date=2026-10-09'))
          await new Promise<void>(r => {
            finish = r;
          });
        return result;
      },
    };
    const c = createP08Controller(createP08MockHistory(h.readContext, mock));
    c.filters({ date_mode: 'DATE', date: '2026-10-09' });
    await flush();
    c.filters({ date_mode: 'DATE', date: '2026-10-10' });
    await flush();
    expect(c.snapshot().current.meta?.dateMode).toBe('DATE');
    finish?.();
    await flush();
    expect(c.snapshot().current.filters).toMatchObject({ date: '2026-10-10' });
    expect(c.snapshot().current.error).toBeUndefined();
    c.dispose();
  });
  it('session/warehouse/permission changes purge protected data; late callback cannot repopulate Back', async () => {
    const h = harness();
    const c = createP08Controller(h.api);
    await c.load();
    c.detail(event());
    await flush();
    h.setContext({ session: undefined, user: undefined });
    c.refreshScope();
    expect(c.snapshot().current.rows).toHaveLength(0);
    expect(c.snapshot().stack).toHaveLength(0);
    expect(c.back()).toBe(false);
    c.dispose();
  });
  it('page error preserves same-scope pages; forbidden clears them and back stack', async () => {
    const h = harness(b => {
      b.meta.hasMore = true;
      b.meta.nextCursor = 'opaque';
    });
    let deny = false;
    const client: ReadClient = {
      async get<T>(p: string, o?: Omit<RequestOptions, 'path' | 'method'>) {
        if (p.includes('cursor'))
          throw new AppError({
            kind: 'http',
            status: deny ? 403 : 503,
            message: 'mock',
          });
        return h.client.get<T>(p, o);
      },
    };
    const c = createP08Controller(createP08MockHistory(h.readContext, client));
    await c.load();
    await c.load(true);
    expect(c.snapshot().current.rows).toHaveLength(2);
    expect(c.snapshot().current.error?.status).toBe(503);
    deny = true;
    await c.load(true);
    expect(c.snapshot().current.rows).toHaveLength(0);
    expect(c.snapshot().current.meta).toBeUndefined();
    c.dispose();
  });
  it('S03 binding comes from SCAN parent, never selected event/auth session; counts preserved', async () => {
    const h = harness();
    const c = createP08Controller(h.api);
    await c.load();
    c.detail(event(10, 'SCAN', 9));
    await flush();
    c.session();
    await flush();
    expect(c.snapshot().current.batchId).toBe(id(9));
    expect(c.snapshot().current.batch?.total).toBe(3);
    expect(c.snapshot().current.batch?.events).toHaveLength(1);
    c.dispose();
  });
  it('summary drilldown preserves date/source/status/keyword; summary has no paging', async () => {
    const h = harness();
    const c = createP08Controller(h.api);
    c.filters({
      date_mode: 'RANGE',
      from: '2026-10-01',
      to: '2026-10-10',
      source: 'DOCUMENT',
      keyword: 'label',
      status: 'WAITING_APPROVAL',
    });
    await flush();
    c.summary();
    await flush();
    expect(c.snapshot().current.summary?.grandTotal).toBe(3);
    c.drilldown('INBOUND');
    await flush();
    expect(c.snapshot().current.filters).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-10',
      source: 'DOCUMENT',
      status: 'WAITING_APPROVAL',
      keyword: 'label',
      business: 'INBOUND',
    });
    expect(
      h.calls.find(call => call.path.includes('/summary'))?.path,
    ).not.toMatch(/limit|cursor/);
    c.dispose();
  });
  it('double reload while busy is one read; missing parent404 never uses another record', async () => {
    const h = harness();
    let release: (() => void) | undefined;
    let calls = 0;
    const client: ReadClient = {
      async get<T>(p: string, o?: Omit<RequestOptions, 'path' | 'method'>) {
        calls++;
        if (p.includes('/records/'))
          throw new AppError({
            kind: 'http',
            status: 404,
            message: 'missing mock parent',
          });
        const result = await h.client.get<T>(p, o);
        await new Promise<void>(r => {
          release = r;
        });
        return result;
      },
    };
    const c = createP08Controller(createP08MockHistory(h.readContext, client));
    const read = c.load();
    await c.load();
    await flush();
    expect(calls).toBe(1);
    release?.();
    await read;
    c.detail(event());
    await flush();
    expect(c.snapshot().current.error?.status).toBe(404);
    expect(c.snapshot().current.detail).toBeUndefined();
    c.dispose();
  });
});
