import {
  createApiClient,
  apiClient,
  buildUrl,
  type RequestOptions,
} from '../src/api/client';
import { ENVIRONMENTS } from '../src/config/env';
import { P06_RELEASE, p06DevReadVerified } from '../src/config/p06Release';
import { AppError } from '../src/errors/AppError';
import { logger } from '../src/logging/logger';
import {
  createP06CatalogService,
  p06ErrorState,
  p06Identity,
  p06IdentityKey,
  p06ImageUri,
  P06_BASE,
  type P06ListQuery,
} from '../src/services/wms/p06Catalog';
import type { ReadClient } from '../src/services/wms/readOnlyClient';
import {
  mockId,
  p06MockHarness,
  p06MockImage,
  p06MockSession,
} from '../src/web/p06ReviewFixtures';

const sku = { type: 'SKU' as const, id: mockId(100) },
  item = { type: 'ITEM' as const, id: mockId(200) };
function patched(mutate: (body: any, path: string) => void) {
  const h = p06MockHarness(),
    client: ReadClient = {
      async get<T>(
        path: string,
        options?: Omit<RequestOptions, 'path' | 'method'>,
      ) {
        const r = await h.client.get<any>(path, options);
        mutate(r.data, path);
        return r as { status: number; data: T };
      },
    };
  return {
    ...h,
    service: createP06CatalogService(client, h.readSession, () => true),
  };
}
describe('P06 mini-app-p06-v1 — mock HTTP, never live', () => {
  it('runtime missing-master diagnostics keep the real response Request-ID and never export the card or auth', async () => {
    const h = p06MockHarness();
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const get = jest.spyOn(apiClient, 'get').mockImplementation(async (path, options) => {
      if (path === '/api/v1/health') return {
        status: 200, header: () => 'dev-test',
        data: { success: true, data: { build: { sha: 'b'.repeat(40) } } },
      } as any;
      return h.client.get<any>(path, options);
    });
    try {
      const service = createP06CatalogService(apiClient, h.readSession, () => true);
      const context = (await service.context()).data;
      const detail = await service.detail(context, sku);
      expect(detail.data.card.sku_id).toBe(sku.id);
      expect(warn).toHaveBeenCalledWith('P06_MASTER_FIELDS_UNAVAILABLE', {
        requestId: detail.meta.request_id, categoryName: 'MISSING', brandName: 'MISSING',
      });
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/accessToken|refreshToken|Authorization|sku_name|sku_code|actor_id/);
    } finally {
      get.mockRestore(); warn.mockRestore();
    }
  });
  it('optional current-master labels remain scoped to their card and malformed labels do not remove the parent', async () => {
    const h = patched((body, path) => {
      if (path.endsWith('/skus/' + sku.id)) Object.assign(body.data.card, {
        category_name: 'Máy khoan & vặn vít', brand_name: { name: 'invalid shape' }, description: null,
      });
    });
    const context = (await h.service.context()).data;
    const detail = await h.service.detail(context, sku);
    expect(detail.data.card).toMatchObject({ sku_id: sku.id, category_name: 'Máy khoan & vặn vít', brand_name: null, description: null });
    expect(detail.data.card.sku_name).toBeTruthy();
    const other = await h.service.detail(context, item);
    expect(other.data.card).not.toHaveProperty('category_name');
    expect(other.data.card).not.toHaveProperty('brand_name');
  });
  it.each([true, false])('new DEV SHA reaches strict context contract validation; compatible=%s', async compatible => {
    const h = p06MockHarness();
    const get = jest.spyOn(apiClient, 'get').mockImplementation(async (path, options) => {
      if (path === '/api/v1/health') return {
        status: 200,
        header: () => 'dev-test',
        data: { success: true, data: { build: { sha: 'b'.repeat(40) } } },
      } as any;
      const response = await h.client.get<any>(path, options);
      if (!compatible) response.data.meta.contract = 'mini-app-p06-v999';
      return response;
    });
    try {
      const service = createP06CatalogService(apiClient, h.readSession, () => true);
      if (compatible) {
        expect((await service.context()).data).toMatchObject({ actor_id: h.context.actor_id });
      } else {
        await expect(service.context()).rejects.toMatchObject({ kind: 'parse' });
      }
      expect(get.mock.calls.map(c => c[0])).toEqual(['/api/v1/health', P06_BASE + '/context']);
    } finally { get.mockRestore(); }
  });
  it('missing acceptance remains OFF without HTTP; current acceptance is DEV read only', async () => {
    const h = p06MockHarness(),
      client: ReadClient = { get: h.client.get };
    const get = jest.spyOn(client, 'get');
    await expect(
      createP06CatalogService(client, h.readSession, () =>
        p06DevReadVerified(null),
      ).context(),
    ).rejects.toMatchObject({ kind: 'blocked_by_gate' });
    await expect(
      createP06CatalogService(client, h.readSession, () =>
        p06DevReadVerified(null),
      ).context(),
    ).rejects.toMatchObject({
      code: 'P06_PENDING_RELEASE',
    });
    expect(get).not.toHaveBeenCalled();
    expect(P06_RELEASE).toEqual({
      status: 'PENDING_TEST_AND_DEPLOYMENT',
      runtimePolicy: 'OWNER_CONTRACT',
      productionEnabled: true,
    });
  });
  it('all9 routes are GET only, query allowlisted; context has no query/body', async () => {
    const h = p06MockHarness(),
      c = (await h.service.context()).data;
    await h.service.list(c, 'SKU');
    await h.service.list(c, 'ITEM');
    await h.service.detail(c, sku);
    await h.service.detail(c, item);
    await h.service.stock(c, sku.id);
    await h.service.gallery(c, sku.id);
    await h.service.timeline(c, sku);
    await h.service.timeline(c, item);
    expect(h.calls.map(call => call.path)).toEqual(
      [
        'context',
        'skus',
        'items',
        `skus/${sku.id}`,
        `items/${item.id}`,
        `skus/${sku.id}/stock`,
        `skus/${sku.id}/gallery`,
        `skus/${sku.id}/timeline`,
        `items/${item.id}/timeline`,
      ].map(p => `${P06_BASE}/${p}`),
    );
    expect(h.calls[0].options?.query).toBeUndefined();
    for (const call of h.calls) {
      expect(call.options?.body).toBeUndefined();
      expect(call.options?.headers).toEqual({
        Accept: 'application/json',
        'X-P06-Card-Metadata-Revision': 'p06-card-master-r2',
      });
    }
    for (const call of h.calls.slice(1))
      expect(call.options?.query?.warehouse_id).toBe(
        p06MockSession.activeWarehouseId,
      );
  });
  it('actual HTTP transport encodes reserved characters and uses access bearer/no GET body', async () => {
    const h = p06MockHarness(),
      fetchImpl = jest.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify(
            (
              await h.client.get(`${P06_BASE}/items`, {
                query: {
                  sku_type: 'ALL',
                  serial: 'A&B +/%',
                  per_page: 20,
                  page: 1,
                },
              })
            ).data,
          ),
      })) as unknown as jest.Mock;
    const client = createApiClient({
      environment: {
        ...ENVIRONMENTS['dev-test'],
        apiBaseUrl: 'https://api.example.invalid',
      },
      getSession: h.readSession,
      fetchImpl,
    });
    const service = createP06CatalogService(client, h.readSession, () => true);
    await service.list(h.context, 'ITEM', { serial: 'A&B +/%' });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(new URL(url).searchParams.get('serial')).toBe('A&B +/%');
    expect(options.method).toBe('GET');
    expect(options.body).toBeUndefined();
    expect(options.headers.Authorization).toBe(
      `Bearer ${p06MockSession.accessToken}`,
    );
    expect(options.headers.Accept).toBe('application/json');
    expect(buildUrl('https://api.example.invalid', P06_BASE + '/context')).toBe(
      'https://api.example.invalid' + P06_BASE + '/context',
    );
  });
  it('blank query omitted; serial+code retained as AND, never renamed to q', async () => {
    const h = p06MockHarness();
    await h.service.list(h.context, 'ITEM', {
      keyword: ' ',
      serial: ' MOCK-SN-1 ',
      item_code: ' HN12346 ',
    });
    expect(h.calls[0].options?.query).toEqual({
      warehouse_id: mockId(3),
      serial: 'MOCK-SN-1',
      item_code: 'HN12346',
      page: 1,
      per_page: 20,
    });
  });
  it.each([
    { q: 'x' },
    { sort: 'name' },
    { from_date: '2026-10-08' },
    { tenant_id: mockId(1) },
    { page: 0 },
    { per_page: 101 },
    { keyword: 'x'.repeat(201) },
    { item_code: 'x'.repeat(513) },
    { sku_id: 'WH-01' },
    { status: 'available' },
    { item_status: 'lower' },
  ])('invalid query never goes over HTTP: %j', async query => {
    const h = p06MockHarness();
    await expect(
      h.service.list(h.context, 'ITEM', query as P06ListQuery),
    ).rejects.toMatchObject({ code: 'P06_INVALID_QUERY' });
    expect(h.calls).toHaveLength(0);
  });
  it('SKU does not accept ITEM status; timeline does not accept type/date/keyword', async () => {
    const h = p06MockHarness();
    await expect(
      h.service.list(h.context, 'SKU', { item_status: 'AVAILABLE' }),
    ).rejects.toMatchObject({ kind: 'config' });
    await expect(
      h.service.timeline(h.context, sku, { from_date: '2026-10-08' } as any),
    ).rejects.toMatchObject({ kind: 'config' });
    expect(h.calls).toHaveLength(0);
  });
  it('typed identity and server counts are kept separate from rows', async () => {
    const h = p06MockHarness(),
      a = await h.service.list(h.context, 'SKU', {
        sku_type: 'PRODUCT',
        per_page: 1,
      }),
      b = await h.service.list(h.context, 'ITEM', { item_code: 'HN12345' });
    expect(a.data).toHaveLength(1);
    expect(a.meta.total).toBe(23);
    expect(a.meta.tab_totals).toEqual({ ALL: 24, PRODUCT: 23, COMPONENT: 1 });
    expect(a.data[0].item_id).toBeNull();
    expect(a.data[0].serial_number).toBeNull();
    expect(b.meta.count_unit).toBe('ITEM');
    expect(p06Identity(b.data[0])).toEqual(item);
    expect(p06IdentityKey(sku)).not.toBe(p06IdentityKey(item));
    expect(b.data[0].stock).toBeNull();
  });
  it.each([
    'actor',
    'auth',
    'warehouse',
    'contract',
    'snapshot',
    'cross-snapshot',
    'count-unit',
    'total',
    'location',
    'card-type',
    'missing-version',
  ])('rejects malformed list/context: %s', async corruption => {
    const h = patched((b, path) => {
      if (path.endsWith('/context')) {
        if (corruption === 'actor') b.data.actor_id = mockId(999);
        if (corruption === 'auth') b.data.auth_session_id = mockId(999);
        if (corruption === 'warehouse')
          b.data.active_warehouse_id = mockId(999);
      } else {
        if (corruption === 'contract') b.meta.contract = 'legacy';
        if (corruption === 'snapshot')
          b.data[0].stock.snapshot_id = mockId(999);
        if (corruption === 'cross-snapshot')
          b.meta.snapshot.cross_request_snapshot = true;
        if (corruption === 'count-unit') b.meta.count_unit = 'ITEM';
        if (corruption === 'total') b.meta.total = 90;
        if (corruption === 'location') b.data[0].current_location = 'A-01';
        if (corruption === 'card-type') b.data[0].card_type = 'ITEM';
        if (corruption === 'missing-version') delete b.data[0].version;
      }
    });
    await expect(
      (async () => {
        const c = (await h.service.context()).data;
        return h.service.list(c, 'SKU');
      })(),
    ).rejects.toMatchObject({ kind: 'parse' });
  });
  it('same SKU cannot substitute a different ITEM detail', async () => {
    const h = patched((b, path) => {
      if (path.includes(`/items/${item.id}`)) b.data.card.item_id = mockId(201);
    });
    await expect(h.service.detail(h.context, item)).rejects.toMatchObject({
      code: 'P06_IDENTITY_MISMATCH',
    });
  });
  it.each(['items', 'stock', 'ledger', 'skus'] as const)(
    'independent permission %s denies locally, no fallback HTTP',
    async permission => {
      const h = p06MockHarness();
      h.context.permissions[permission] = false;
      const op =
        permission === 'items'
          ? h.service.detail(h.context, item)
          : permission === 'stock'
          ? h.service.stock(h.context, sku.id)
          : permission === 'ledger'
          ? h.service.timeline(h.context, sku, { source: 'LEDGER' })
          : h.service.list(h.context, 'SKU');
      await expect(op).rejects.toMatchObject({ status: 403 });
      expect(h.calls).toHaveLength(0);
    },
  );
  it('serial/item code needs ITEM permission even on SKU list', async () => {
    const h = p06MockHarness();
    h.context.permissions.items = false;
    await expect(
      h.service.list(h.context, 'SKU', { serial: 'SN' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(h.calls).toHaveLength(0);
  });
  it.each(['REQUIRED', 'UNAVAILABLE', 'NO_SESSION', 'INACTIVE', 'MISMATCH'])(
    'warehouse %s is unavailable, no implicit context switch',
    async status => {
      const h = p06MockHarness();
      if (status === 'INACTIVE') h.context.warehouse_status = status;
      else if (status === 'MISMATCH')
        h.context.active_warehouse_id = mockId(999);
      else h.context.warehouse_context.status = status as any;
      await expect(h.service.list(h.context, 'SKU')).rejects.toMatchObject({
        status: status === 'NO_SESSION' ? 401 : 409,
      });
      expect(h.calls).toHaveLength(0);
    },
  );
  it('context can be read without a local warehouse; scoped GET remains blocked', async () => {
    const h = patched(b => {
      b.data.active_warehouse_id = null;
      b.data.warehouse_context.status = 'REQUIRED';
      b.data.warehouse_status = null;
    });
    h.setSession({ ...p06MockSession, activeWarehouseId: undefined });
    const c = (await h.service.context()).data;
    expect(c.warehouse_context.status).toBe('REQUIRED');
    await expect(h.service.list(c, 'SKU')).rejects.toMatchObject({
      code: 'WAREHOUSE_CONTEXT_REQUIRED',
    });
  });
  it.each(['logout', 'actor', 'auth-session', 'warehouse', 'abort'])(
    'late response discarded on %s',
    async kind => {
      const h = p06MockHarness();
      let release!: () => void;
      const wait = new Promise<void>(resolve => {
        release = resolve;
      });
      const client: ReadClient = {
          async get<T>(
            path: string,
            options?: Omit<RequestOptions, 'path' | 'method'>,
          ) {
            const r = await h.client.get<T>(path, options);
            await wait;
            return r;
          },
        },
        controller = new AbortController();
      const service = createP06CatalogService(
          client,
          h.readSession,
          () => true,
        ),
        pending = service.list(
          h.context,
          'SKU',
          {},
          { signal: controller.signal },
        );
      if (kind === 'abort') controller.abort();
      else
        h.setSession(
          kind === 'logout'
            ? undefined
            : {
                ...p06MockSession,
                ...(kind === 'actor'
                  ? { userId: mockId(90) }
                  : kind === 'auth-session'
                  ? { authSessionId: mockId(91) }
                  : { activeWarehouseId: mockId(92) }),
              },
        );
      release();
      await expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
    },
  );
  it('access refresh preserves stable session identity', async () => {
    const h = p06MockHarness();
    h.setSession({ ...p06MockSession, accessToken: 'ISOLATED_REFRESH_MARKER' });
    await expect(h.service.list(h.context, 'SKU')).resolves.toHaveProperty(
      'meta.count_unit',
      'SKU',
    );
  });
  it.each(['ready', 'incomplete', 'mismatch'] as const)(
    'stock %s preserves server values and uncertainty',
    async scenario => {
      const h = p06MockHarness(scenario),
        r = await h.service.stock(h.context, sku.id);
      expect(r.data.total_qty).toBe(scenario === 'incomplete' ? null : 12);
      expect(r.data.location_breakdown).toBeNull();
      expect(r.data.snapshot_id).toBe(r.meta.snapshot.id);
      expect(r.data.status).toBe(
        scenario === 'ready'
          ? 'CONFIRMED'
          : scenario === 'incomplete'
          ? 'INCOMPLETE'
          : 'MISMATCH',
      );
    },
  );
  it('EMPTY is a true zero; unknown/null is not converted to zero', async () => {
    const h = p06MockHarness();
    const r = await h.service.stock(h.context, mockId(104));
    expect(r.data.status).toBe('EMPTY');
    expect(r.data.total_qty).toBe(0);
    const bad = patched((b, p) => {
      if (p.endsWith('/stock')) {
        b.data.status = 'EMPTY';
        b.data.total_qty = null;
      }
    });
    await expect(bad.service.stock(bad.context, sku.id)).rejects.toMatchObject({
      kind: 'parse',
    });
  });
  it('SKU fingerprint is not sent as If-Match and four quantities are never derived', async () => {
    const h = patched((b, p) => {
      if (p.endsWith('/stock')) {
        b.data.status = 'MISMATCH';
        b.data.unavailable_qty = 7.125;
      }
    });
    const r = await h.service.stock(h.context, sku.id);
    expect(r.data.unavailable_qty).toBe(7.125);
    expect(h.calls[0].options?.headers).toEqual({
      Accept: 'application/json',
      'X-P06-Card-Metadata-Revision': 'p06-card-master-r2',
    });
  });
  it('gallery denies UNKNOWN/UNAVAILABLE/unapproved URLs and keeps nullable thumbnail/expiry', async () => {
    const h = p06MockHarness(),
      image = (await h.service.gallery(h.context, sku.id)).data[0];
    expect(image.thumbnail_url).toBeNull();
    expect(image.expires_at).toBeNull();
    expect(
      p06ImageUri(image, ['https://images.example.invalid']),
    ).toBeUndefined();
    const publicImage = {
      ...p06MockImage(),
      access: 'PUBLIC' as const,
      expiry_policy: 'NO_SIGNED_EXPIRY' as const,
    };
    expect(p06ImageUri(publicImage)).toBeUndefined();
    expect(p06ImageUri(publicImage, ['https://images.example.invalid'])).toBe(
      publicImage.full_url,
    );
    expect(
      p06ImageUri(
        {
          ...publicImage,
          full_url: 'https://user:pass@images.example.invalid/image.png',
        },
        ['https://images.example.invalid'],
      ),
    ).toBeUndefined();
    expect(
      p06ImageUri(
        { ...publicImage, full_url: 'http://images.example.invalid/image.png' },
        ['http://images.example.invalid'],
      ),
    ).toBeUndefined();
  });
  it('permission=true still leaves print/warranty action_exposed=false', async () => {
    const h = p06MockHarness(),
      d = (await h.service.detail(h.context, item)).data;
    expect(d.capabilities.label_print.permission_granted).toBe(true);
    expect(d.capabilities.label_print.action_exposed).toBe(false);
    expect(d.capabilities.warranty.action_exposed).toBe(false);
    const bad = patched((b, p) => {
      if (p.includes(sku.id))
        b.data.capabilities.label_print.action_exposed = true;
    });
    await expect(bad.service.detail(bad.context, sku)).rejects.toMatchObject({
      kind: 'parse',
    });
  });
  it('timeline preserves ledger signed decimals and WARRANTY null, paged server totals', async () => {
    const h = p06MockHarness(),
      r = await h.service.timeline(h.context, sku);
    expect(r.meta.total).toBe(25);
    expect(r.data).toHaveLength(20);
    expect(r.data[1].signed_quantity).toBe(-2.5);
    expect(r.data[2].signed_quantity).toBeNull();
    expect(r.data[2].quantity_applicability).toBe('NOT_APPLICABLE');
    const bad = patched((b, p) => {
      if (p.endsWith('/timeline')) b.data[2].signed_quantity = -1;
    });
    await expect(bad.service.timeline(bad.context, sku)).rejects.toMatchObject({
      kind: 'parse',
    });
  });
  it('ALL reads authorized subset and reports forbidden source instead of zero', async () => {
    const h = p06MockHarness();
    h.context.permissions.warranty_view = false;
    const r = await h.service.timeline(h.context, sku);
    expect(r.meta.sources).toEqual({
      LEDGER: 'INCLUDED',
      WARRANTY: 'FORBIDDEN',
    });
    expect(r.data.every(e => e.source === 'LEDGER')).toBe(true);
    expect(r.meta.total).toBe(17);
  });
  it.each([401, 403, 404, 409, 422, 429, 503])(
    'raw HTTP%d/error/request ID preserved, no second endpoint',
    async status => {
      const h = p06MockHarness(),
        client: ReadClient = {
          async get<T>() {
            return {
              status,
              data: {
                success: false,
                error: { code: 'RAW_MIDDLEWARE_CODE', message: 'Source error' },
                meta: { request_id: 'source-request' },
              } as T,
            };
          },
        };
      await expect(
        createP06CatalogService(client, h.readSession, () => true).list(
          h.context,
          'SKU',
        ),
      ).rejects.toMatchObject({
        status,
        code: 'RAW_MIDDLEWARE_CODE',
        requestId: 'source-request',
      });
      expect(
        p06ErrorState(new AppError({ kind: 'http', status, message: 'x' })),
      ).toBe(
        status === 401
          ? 'auth'
          : status === 403
          ? 'forbidden'
          : status === 404
          ? 'not-found'
          : status === 409
          ? 'context'
          : status === 422
          ? 'input'
          : 'unavailable',
      );
    },
  );
});
