import { createP05CreateService } from '../src/services/wms/p05Create';
import type { P05Client } from '../src/services/wms/p05Outbound';
import type { RequestOptions } from '../src/api/client';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function fixture() {
  const calls: RequestOptions[] = [];
  const products = Array.from({ length: 958 }, (_, i) => ({
    sku_id: id(i + 100),
    sku_name: 'Same name',
    sku_type: 'PRODUCT',
    category_name: `Nhóm ${i % 28}`,
    status: 'ACTIVE',
  }));
  const options = {
    duplicate: false,
    duplicateConflict: false,
    changedTotal: false,
    missingRow: false,
    badId: false,
    badRecipient: false,
    snapshotChange: false,
    contractFailure: false,
    legacyProductContract: false,
    weakEtag: false,
  };
  const client: P05Client = {
    async request<T>(r: RequestOptions) {
      calls.push(r);
      const page = Number(r.query?.page),
        per = Number(r.query?.per_page);
      const recipient = r.path === '/api/v1/recipients';
      const all = recipient
        ? [
            {
              agency_id: id(4),
              agency_name: options.badRecipient ? '' : 'Đại lý thật',
              status: 'ACTIVE',
            },
            { agency_id: id(5), agency_name: 'Ngừng', status: 'INACTIVE' },
          ]
        : products;
      const data = all.slice((page - 1) * per, page * per).map(v => ({ ...v }));
      if (!recipient && page === 2 && options.duplicate)
        data[0] = { ...products[0] };
      if (!recipient && page === 2 && options.duplicateConflict)
        data[0] = { ...products[0], category_name: 'Nhóm xung đột' };
      if (!recipient && page === 1 && options.badId)
        data[0] = { ...products[0], sku_id: 'NO-UUID' };
      if (!recipient && page === 20 && options.missingRow) data.pop();
      const productMeta = recipient || options.legacyProductContract
        ? {}
        : {
            contract: options.contractFailure
              ? 'mini-app-products-pagination-v1'
              : 'mini-app-products-pagination-v2',
            revision: 'canonical-sku-id-r1',
            snapshot_consistent: false,
            snapshot_revision:
              options.snapshotChange && page === 2 ? 'stock:109' : 'stock:108',
            distinct_key: 'sku_id',
            sort: [{ field: 'sku_id', direction: 'ASC' }],
          };
      return {
        status: 200,
        data: {
          success: true,
          data,
          meta: {
            current_page: page,
            per_page: per,
            total:
              all.length +
              (!recipient && page === 2 && options.changedTotal ? 1 : 0),
            last_page: Math.max(1, Math.ceil(all.length / per)),
            ...productMeta,
          },
        } as T,
        header: (name: string) =>
          !recipient && name.toLowerCase() === 'etag'
            ? `${options.weakEtag ? 'W/' : ''}"products-${page}"`
            : undefined,
      };
    },
  };
  const service = createP05CreateService(client, () => ({
    accessToken: 'TEST-IN-MEMORY',
    userId: id(1),
    authSessionId: id(2),
    activeWarehouseId: id(3),
  }));
  return { service, calls, options };
}

test('958 rows over 20 pages are complete and unique before enabling 28 groups; no invented option or write', async () => {
  const f = fixture(),
    c = await f.service.catalogue();
  expect(Object.keys(c.skuGroups)).toHaveLength(958);
  expect(c.groups).toHaveLength(28);
  expect(c.recipients.map(v => v.id)).toEqual([id(4)]);
  expect(c.recipientError).toBeUndefined();
  expect(c.groupError).toBeUndefined();
  expect(
    f.calls.filter(v => v.path.endsWith('/products')).map(v => v.query?.page),
  ).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  expect(
    f.calls.every(v => v.method === 'GET' && v.query?.per_page === 50),
  ).toBe(true);
});
test('legacy identical duplicate product metadata keeps the distinct group list usable', async () => {
  const f = fixture();
  f.options.duplicate = true;
  f.options.legacyProductContract = true;
  const c = await f.service.catalogue();
  expect(c.groupError).toBeUndefined();
  expect(c.groups).toHaveLength(28);
  expect(Object.keys(c.skuGroups)).toHaveLength(957);
  expect(c.skuGroups[id(100)]).toBe('Nhóm 0');
});

test('v2 canonical catalog rejects even an otherwise identical duplicate row', async () => {
  const f = fixture();
  f.options.duplicate = true;
  const c = await f.service.catalogue();
  expect(c.groups).toEqual([]);
  expect(c.skuGroups).toEqual({});
  expect(c.groupError).toContain('canonical chưa đủ');
});

test.each(['duplicateConflict', 'changedTotal', 'missingRow', 'badId'] as const)(
  '%s fails product catalogue closed without deduping/faking total or hiding recipients',
  async failure => {
    const f = fixture();
    f.options[failure] = true;
    const c = await f.service.catalogue();
    expect(c.groups).toEqual([]);
    expect(c.skuGroups).toEqual({});
    expect(c.groupError).toBeTruthy();
    expect(c.recipients.map(v => v.id)).toEqual([id(4)]);
    expect(c.recipientError).toBeUndefined();
  },
);
test.each(['snapshotChange', 'contractFailure'] as const)(
  '%s fails closed for v2 canonical catalogue',
  async failure => {
    const f = fixture();
    f.options[failure] = true;
    const c = await f.service.catalogue();
    expect(c.groups).toEqual([]);
    expect(c.skuGroups).toEqual({});
    expect(c.groupError).toBeTruthy();
    expect(c.recipients.map(v => v.id)).toEqual([id(4)]);
  },
);
test('v2 accepts proxy-weakened ETag while snapshot revision remains stable', async () => {
  const f = fixture();
  f.options.weakEtag = true;
  const c = await f.service.catalogue();
  expect(c.groupError).toBeUndefined();
  expect(Object.keys(c.skuGroups)).toHaveLength(958);
  expect(c.groups).toHaveLength(28);
});
test('malformed recipient catalogue keeps complete verified product data and emits only recipient error', async () => {
  const f = fixture();
  f.options.badRecipient = true;
  const c = await f.service.catalogue();
  expect(c.recipients).toEqual([]);
  expect(c.recipientError).toBeTruthy();
  expect(c.groupError).toBeUndefined();
  expect(Object.keys(c.skuGroups)).toHaveLength(958);
});

test('large read-only catalogue requests the remaining pages with bounded concurrency while retaining server page order', async () => {
  const products = Array.from({ length: 250 }, (_, index) => ({
      sku_id: id(index + 100),
      sku_name: `SKU ${index + 1}`,
      sku_type: 'PRODUCT',
      category_name: `Nhóm ${index % 5}`,
      status: 'ACTIVE',
    })),
    pages: number[] = [],
    pending = new Map<
      number,
      (value: {
        status: number;
        data: Record<string, unknown>;
      }) => void
    >();
  const response = (all: readonly Record<string, unknown>[], page: number) => ({
    status: 200,
    data: {
      success: true,
      data: all.slice((page - 1) * 50, page * 50),
      meta: {
        current_page: page,
        per_page: 50,
        total: all.length,
        last_page: Math.max(1, Math.ceil(all.length / 50)),
      },
    },
  });
  const service = createP05CreateService(
    {
      request: r => {
        const page = Number(r.query?.page),
          all =
            r.path === '/api/v1/recipients'
              ? [
                  {
                    agency_id: id(4),
                    agency_name: 'Đại lý thật',
                    status: 'ACTIVE',
                  },
                ]
              : products;
        if (r.path === '/api/v1/mini-app/products') pages.push(page);
        if (r.path === '/api/v1/mini-app/products' && page > 1)
          return new Promise<{
            status: number;
            data: Record<string, unknown>;
          }>(resolve => pending.set(page, resolve));
        return Promise.resolve(response(all, page) as never);
      },
    } as P05Client,
    () => ({
      accessToken: 'TEST-IN-MEMORY',
      userId: id(1),
      authSessionId: id(2),
      activeWarehouseId: id(3),
    }),
  );
  const read = service.catalogue();
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  expect(pages).toEqual([1, 2, 3, 4, 5]);
  for (const page of [2, 3, 4, 5])
    pending.get(page)?.(response(products, page));
  const catalogue = await read;
  expect(Object.keys(catalogue.skuGroups)).toHaveLength(250);
  expect(catalogue.groups).toEqual(['Nhóm 0', 'Nhóm 1', 'Nhóm 2', 'Nhóm 3', 'Nhóm 4']);
});
