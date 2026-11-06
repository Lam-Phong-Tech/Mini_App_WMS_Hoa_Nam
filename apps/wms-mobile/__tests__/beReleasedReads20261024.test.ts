import { explicitRead } from '../src/services/wms/explicitReadFields';
import { boxQuery, parseBoxes } from '../src/services/wms/p18Boxes';
import { parseWebQueue, webQueueQuery } from '../src/services/wms/p13WebQueue';
import {
  assertBeAppRead,
  BE_APP_READ_RELEASE,
} from '../src/config/beAppReadRelease';
import { getCurrentEnvironment } from '../src/config/env';
import {
  setSession,
  clearSession,
  getSession,
  getSessionGeneration,
} from '../src/auth/session';
import { createBeReleasedReads } from '../src/services/wms/beReleasedReads';
import {
  createStorage,
  createMemoryBackend,
  setAppStorageForTesting,
} from '../src/storage/storage';
import {
  boxBody,
  boxRow,
  queueBody,
  queueRow,
  project,
  scope,
  user,
  headers,
  id,
  actor,
  session,
  warehouse,
} from './fixtures/beReleasedReads20261024';
import type { ReadClient } from '../src/services/wms/readOnlyClient';
import type { ApiResponse } from '../src/api/client';

const q = () => webQueueQuery();
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  setSession({
    accessToken: 'local-unit-test',
    userId: actor,
    authSessionId: session,
    activeWarehouseId: warehouse,
  });
});
afterEach(() => clearSession());
test('new P11 commands and production remain OFF', () => {
  expect(BE_APP_READ_RELEASE.p11CommandsEnabled).toBe(false);
  expect(BE_APP_READ_RELEASE.productionEnabled).toBe(false);
});
test('separate explicit adapter preserves known zero/false/empty values and the literal owner precondition', () => {
  const body = project({
    success: true,
    data: { zero: 0, no: false, list: [], obj: {}, missing: null },
    meta: { contract: 'unit-owner' },
  });
  body.meta.read_fields.owner_precondition = {
    etag: 'W/"0002"',
    source: 'EXACT_OWNER_RESPONSE_HEADER',
    use: 'ORIGINAL_OWNER_IF_MATCH_ONLY_NOT_HTTP_CACHE_VALIDATOR',
  };
  const parsed = explicitRead(body, 'unit-owner');
  expect(parsed.body.data).toEqual({ zero: 0, no: false, list: [], obj: {} });
  expect(
    parsed.field('/data/missing', (v): v is string => typeof v === 'string'),
  ).toEqual({ supplied: false, status: 'UNSPECIFIED_BY_OWNER' });
  expect(parsed.ownerPrecondition).toBe('W/"0002"');
});
test.each([
  (b: any) => {
    b.data.null = null;
  },
  (b: any) => {
    b.meta.read_fields.owner_contract = 'other';
  },
  (b: any) => {
    b.meta.read_fields.missing_fields.push({
      ...b.meta.read_fields.missing_fields[0],
    });
  },
  (b: any) => {
    b.meta.read_fields.missing_fields[0].path = '/data';
  },
  (b: any) => {
    b.meta.read_fields.missing_fields[0].value_supplied = true;
  },
  (b: any) => {
    b.meta.read_fields.missing_fields[0].source = 'CLIENT';
  },
  (b: any) => {
    b.meta.read_fields.missing_fields[0].path = '/bad~9';
  },
])(
  'invalid explicit metadata/null is rejected without fabricating a legacy body %#',
  mutate => {
    const body = boxBody();
    mutate(body);
    expect(() => explicitRead(body, 'p18-single-warehouse-boxes-v1')).toThrow();
  },
);
test('P13 current queue is separate from canonical SCANNING/readiness and reports whole-filter totals', () => {
  const body = queueBody(),
    result = parseWebQueue(body, scope(), q());
  expect(result.total).toBe(1);
  expect(result.items[0].handoff).toMatchObject({
    supplied: true,
    value: {
      state: 'WAITING_WEB_POST',
      reviewed: { supplied: false, status: 'NOT_RECORDED' },
    },
  });
  expect(result.items[0].target).toEqual({
    id: id(10),
    kind: 'inbound',
    warehouseId: warehouse,
  });
  const legacy = queueRow();
  legacy.web_post_handoff = null;
  legacy.web_post_handoff_availability = 'NOT_ESTABLISHED';
  const all = webQueueQuery({ web_queue: 'ALL' });
  expect(
    parseWebQueue(queueBody(all, [legacy]), scope(), all).items[0].handoff,
  ).toEqual({ supplied: false, status: 'NOT_ESTABLISHED' });
});
test.each([
  (b: any) => {
    b.data[0].web_post_handoff.state = 'POSTED';
  },
  (b: any) => {
    b.data[0].web_post_handoff.warehouse_id = id(99);
  },
  (b: any) => {
    b.data[0].read_target.path = 'https://evil.invalid/';
  },
  (b: any) => {
    b.data[0].read_target.query.other = 'x';
  },
  (b: any) => {
    b.meta.query.web_queue = 'ALL';
  },
  (b: any) => {
    b.meta.total = 0;
  },
  (b: any) => {
    b.meta.source_facets.INBOUND.total = 9;
  },
  (b: any) => {
    b.meta.web_post_queue.coverage = 'ALL_LEGACY';
  },
  (b: any) => {
    b.meta.hasMore = true;
  },
  (b: any) => {
    b.meta.write_operations.push('POST');
  },
  (b: any) => {
    b.meta.cursor_version = 2;
  },
])(
  'P13 rejects cross-scope/stale state/partial totals/cursor downgrade %#',
  mutate => {
    const body = queueBody();
    mutate(body);
    expect(() => parseWebQueue(body, scope(), q())).toThrow();
  },
);
test('P13 POSTED/CANCELLED, missing legacy intent, warranty zero and real cursor semantics stay distinct', () => {
  const all = webQueueQuery({ web_queue: 'ALL' });
  for (const state of ['POSTED', 'CANCELLED']) {
    const parsed = parseWebQueue(
      queueBody(all, [queueRow('INBOUND', 10, state)]),
      scope(),
      all,
    );
    expect(parsed.items[0].handoff).toMatchObject({
      supplied: true,
      value: { state },
    });
  }
  expect(
    parseWebQueue(queueBody(q(), [queueRow('WARRANTY', 12)]), scope(), q())
      .total,
  ).toBe(0);
  const first = webQueueQuery({ per_page: 1 });
  const result = parseWebQueue(
    queueBody(first, [queueRow('INBOUND', 10), queueRow('OUTBOUND', 11)]),
    scope(),
    first,
  );
  expect(result.total).toBe(2);
  expect(result.items).toHaveLength(1);
  expect(result.nextCursor).toBe('mock:cursor:1');
});
test('P13 respects denied facets and source permission rather than synthesizing a zero', () => {
  const result = parseWebQueue(
    queueBody(q(), [queueRow()], ['INBOUND']),
    { ...scope(), rights: ['inbound.view'] },
    q(),
  );
  expect(result.facets.OUTBOUND.supplied).toBe(false);
  expect(() =>
    parseWebQueue(queueBody(), { ...scope(), rights: ['inbound.view'] }, q()),
  ).toThrow();
});
test('BOX detail uses actual identity and component master, not available balance or product size', () => {
  const result = parseBoxes(boxBody(), scope(), boxQuery());
  expect(result.items[0]).toMatchObject({
    id: id(70),
    classification: 'COMPONENT_QUANTITY',
    containedQty: { supplied: true, value: 5 },
    available: { supplied: false },
    capacity: { supplied: false },
  });
  expect(
    parseBoxes(boxBody([boxRow()], {}, true), scope(), boxQuery(), id(70))
      .items[0].id,
  ).toBe(id(70));
  expect(
    parseBoxes(boxBody([boxRow(70, 'PRODUCT', false)]), scope(), boxQuery())
      .items[0].classification,
  ).toBe('PRODUCT');
});
test.each([
  (b: any) => {
    b.data[0].warehouse_id = id(90);
  },
  (b: any) => {
    b.data[0].classification = 'PRODUCT';
  },
  (b: any) => {
    b.data[0].available_qty = 5;
  },
  (b: any) => {
    b.data[0].contained_qty = -1;
  },
  (b: any) => {
    b.data[0].contained_qty = 0.5;
  },
  (b: any) => {
    b.data[0].quantity_semantics = 'AVAILABLE';
  },
  (b: any) => {
    b.data[0].read_target.path = '/api/v1/containers/' + id(99);
  },
  (b: any) => {
    b.meta.total = 0;
  },
  (b: any) => {
    b.meta.last_page = 4;
  },
  (b: any) => {
    b.meta.product_to_component_reclassification = true;
  },
])('BOX rejects false quantities/classifications/targets/total %#', mutate => {
  const body = boxBody();
  mutate(body);
  expect(() => parseBoxes(body, scope(), boxQuery())).toThrow();
});
test.each(['NOT_RECORDED', 'SOURCE_INCONSISTENT'])(
  'BOX missing quantity stays %s, never zero',
  status => {
    const row = { ...boxRow(), contained_qty: null, quantity_status: status };
    expect(
      parseBoxes(boxBody([row as never]), scope(), boxQuery()).items[0]
        .containedQty,
    ).toEqual({ supplied: false, status });
  },
);
test.each([
  { keyword: 'x'.repeat(101) },
  { page: 0 },
  { page: 1.2 },
  { perPage: 101 },
  { skuType: 'SPARE' },
])('BOX invalid query does not dispatch %#', query =>
  expect(() => boxQuery(query as never)).toThrow(),
);
test.each([
  { path: '/api/v1/containers/' + id(70) + '/move' },
  { method: 'POST' },
  { body: {} },
  { responseType: 'blob' },
  { receiptTransport: 'p09' },
  { path: '/api/v1/auth/me' },
  {
    headers: {
      'X-Read-Fields-Contract': 'explicit-read-fields-v1',
      'If-None-Match': 'x',
    },
  },
])(
  'read representation cannot escape to writes/binary/other owners %#',
  change => {
    expect(() =>
      assertBeAppRead(
        {
          path: '/api/v1/mini-app/documents',
          beAppRead: 'p13',
          headers: { 'X-Read-Fields-Contract': 'explicit-read-fields-v1' },
          ...change,
        } as never,
        getCurrentEnvironment(),
      ),
    ).toThrow();
  },
);
test('header opt-in without an owner, or on production, is rejected', () => {
  const options = {
    path: '/api/v1/mini-app/documents',
    headers: { 'X-Read-Fields-Contract': 'explicit-read-fields-v1' },
  };
  expect(() => assertBeAppRead(options, getCurrentEnvironment())).toThrow();
  expect(() =>
    assertBeAppRead({ ...options, beAppRead: 'p13' }, {
      ...getCurrentEnvironment(),
      name: 'customer-production',
    } as never),
  ).toThrow();
});
function harness() {
  let currentUser = user();
  const freshUser = jest.fn(async () => currentUser),
    get = jest.fn(async (path: string, options: any) => ({
      status: 200,
      data: path.includes('containers') ? boxBody() : queueBody(options.query),
      header: (name: string) => (headers as Record<string, string>)[name],
    })) as jest.Mock;
  const service = createBeReleasedReads(
    () => ({ session: getSession(), user: currentUser }),
    {
      client: { get } as ReadClient,
      freshUser,
    },
  );
  return {
    service,
    get,
    freshUser,
    setUser: (value: typeof currentUser) => {
      currentUser = value;
    },
  };
}
test('service dispatches only scoped GET, performs fresh rights check, and keeps contract headers local', async () => {
  const h = harness();
  await h.service.webQueue();
  await h.service.boxes();
  expect(h.freshUser).toHaveBeenCalledTimes(2);
  expect(h.get.mock.calls[0]).toMatchObject([
    '/api/v1/mini-app/documents',
    {
      beAppRead: 'p13',
      query: {
        warehouse_id: warehouse,
        web_queue: 'WAITING_WEB_POST',
        cursor: 'start',
      },
      headers: { 'X-Read-Fields-Contract': 'explicit-read-fields-v1' },
    },
  ]);
  expect(h.get.mock.calls[1][1].headers).toEqual({
    'X-Read-Fields-Contract': 'explicit-read-fields-v1',
    'X-Container-Read-Contract': 'p18-single-warehouse-boxes-v1',
  });
  expect(Object.keys(h.service).sort()).toEqual([
    'box',
    'boxes',
    'scopeKey',
    'webQueue',
  ]);
});
test.each(['', '   ', '\t\n'])(
  'P18 omits a blank optional keyword instead of sending keyword= (%j)',
  async keyword => {
    const h = harness();
    await h.service.boxes({ keyword });
    const query = h.get.mock.calls[0][1].query;
    expect(Object.hasOwn(query, 'keyword')).toBe(false);
    expect(new URLSearchParams(query).has('keyword')).toBe(false);
    expect(query).toMatchObject({
      warehouse_id: warehouse,
      sku_type: 'ALL',
      page: 1,
      per_page: 20,
    });
  },
);
test('P18 trims a nonempty keyword and preserves literal special characters', async () => {
  const h = harness();
  await h.service.boxes({ keyword: '  BOX%_+  ' });
  expect(h.get.mock.calls[0][1].query.keyword).toBe('BOX%_+');
});
test('missing BOX grants or stale fresh rights cause no business HTTP', async () => {
  const h = harness();
  h.setUser({ ...user(), permissions: ['sku.view'] });
  await expect(h.service.boxes()).rejects.toMatchObject({
    code: 'READ_FORBIDDEN',
  });
  expect(h.get).not.toHaveBeenCalled();
  expect(h.freshUser).not.toHaveBeenCalled();
  const h2 = harness();
  h2.freshUser.mockResolvedValue({ ...user(), permissions: [] });
  await expect(h2.service.webQueue()).rejects.toMatchObject({
    code: 'READ_RIGHTS_CHANGED',
  });
  expect(h2.get).not.toHaveBeenCalled();
});
test('late same-endpoint reply after family change is discarded', async () => {
  const h = harness();
  let resolve!: (value: ApiResponse<unknown>) => void;
  h.get.mockImplementation(
    () =>
      new Promise(r => {
        resolve = r;
      }),
  );
  const pending = h.service.boxes();
  await Promise.resolve();
  await Promise.resolve();
  setSession({ ...getSession()!, authSessionId: id(90) });
  resolve({
    status: 200,
    data: boxBody(),
    header: name => (headers as Record<string, string>)[name],
  });
  await expect(pending).rejects.toThrow();
  expect(getSessionGeneration()).toBeGreaterThan(0);
});
test('missing private headers / transformed ETag cannot be accepted', async () => {
  const h = harness();
  h.get.mockResolvedValue({
    status: 200,
    data: boxBody(),
    header: (name: string) =>
      name === 'ETag' ? '"2"' : (headers as Record<string, string>)[name],
  });
  await expect(h.service.boxes()).rejects.toMatchObject({
    code: 'READ_PRIVATE_HEADERS_INVALID',
  });
});
