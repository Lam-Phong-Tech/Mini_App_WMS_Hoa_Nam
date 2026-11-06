import type { RequestOptions } from '../src/api/client';
import type { Client } from '../src/services/wms/p07Catalog';
import {
  p07CatalogPage,
  readP07Items,
  readP07Tags,
  readP07Tag,
} from '../src/services/wms/p07Catalog';
import { p07AssignmentBlock } from '../src/services/wms/nfc';
const id = '10000000-0000-4000-8000-000000000001',
  warehouse = '10000000-0000-4000-8000-000000000002';
const meta = {
  contract: 'mini-app-p07-v1',
  warehouse_id: warehouse,
  count_unit: 'NFC_TAG',
  total: 1,
  current_page: 1,
  last_page: 1,
  tab_totals: { ALL: 4, ASSIGNED: 1, UNASSIGNED: 1, LOCKED: 1, UNKNOWN: 1 },
};
const body = () => ({
  success: true,
  data: [{ physical_code_id: id, status_label: null, tab_status: null }],
  meta: { ...meta },
});
test.each([
  ['ISSUED', 'UNASSIGNED', true, null],
  ['IN_STOCK', 'UNASSIGNED', true, 'ITEM_NOT_ISSUED'],
  ['ISSUED', 'ASSIGNED', true, 'ITEM_ALREADY_HAS_NFC'],
  ['ISSUED', 'UNASSIGNED', false, 'NFC_ELIGIBILITY_UNVERIFIED'],
] as const)(
  'assignment eligibility maps %s/%s/%s to %s',
  (itemStatus, nfcStatus, assignable, expected) => {
    expect(
      p07AssignmentBlock({
        item: { item_status: itemStatus },
        nfc_status: nfcStatus,
        nfc: null,
        assignable,
      }),
    ).toBe(expected);
  },
);
test('server counts include unknown and are never calculated from loaded tags', () => {
  const page = p07CatalogPage(body(), warehouse, 'NFC_TAG');
  expect(page.total).toBe(1);
  expect(page.totals?.ALL).toBe(4);
  expect(page.items).toHaveLength(1);
});
test.each([
  { warehouse_id: 'other' },
  { count_unit: 'ITEM' },
  { total: null },
  { contract: 'wrong' },
  { tab_totals: { ALL: 1 } },
  { current_page: 0 },
])(
  'unverified tag metadata is rejected, not converted to empty/zero: %o',
  patch => {
    expect(() =>
      p07CatalogPage(
        { ...body(), meta: { ...meta, ...patch } },
        warehouse,
        'NFC_TAG',
      ),
    ).toThrow(expect.objectContaining({ code: 'P07_RESPONSE_INVALID' }));
  },
);
test('duplicate tag IDs fail rather than manufacturing row identity', () => {
  const b = body();
  b.data.push(b.data[0]);
  expect(() => p07CatalogPage(b, warehouse, 'NFC_TAG')).toThrow();
});
test('ITEM count remains distinct; inherited items do not require custom contract', () => {
  expect(
    p07CatalogPage(
      {
        success: true,
        data: [{ item_id: id }],
        meta: {
          warehouse_id: warehouse,
          count_unit: 'ITEM',
          total: 1,
          current_page: 1,
          last_page: 1,
        },
      },
      warehouse,
      'ITEM',
    ).totals,
  ).toBeNull();
});
test('catalogues use exact scoped GET and keyword, never body or search', async () => {
  const request = jest.fn(async (_options: RequestOptions) => ({
    status: 200,
    data: body(),
  }));
  const client = { request } as unknown as Client;
  await readP07Tags(
    warehouse,
    { keyword: '🌸', tab_status: 'ALL', page: 1 },
    undefined,
    client,
  );
  expect(request.mock.calls[0][0]).toMatchObject({
    method: 'GET',
    query: { warehouse_id: warehouse, keyword: '🌸', tab_status: 'ALL' },
  });
  expect(request.mock.calls[0][0]).not.toHaveProperty('body');
  request.mockResolvedValueOnce({
    status: 200,
    data: {
      ...body(),
      data: [
        {
          item_id: id,
          item_status: 'ISSUED',
          nfc_status: 'UNASSIGNED',
        },
      ],
      meta: { ...meta, count_unit: 'ITEM' },
    },
  } as never);
  await readP07Items(warehouse, 'serial', 1, undefined, client);
  expect(request.mock.calls[1][0]).toMatchObject({
    query: {
      keyword: 'serial',
      item_status: 'ISSUED',
      nfc_status: 'UNASSIGNED',
    },
  });
  expect(request.mock.calls[1][0]).not.toHaveProperty('query.search');
});
test('item worklist rejects rows that are not issued and unassigned', async () => {
  const request = jest.fn(async () => ({
    status: 200,
    data: {
      success: true,
      data: [
        { item_id: id, item_status: 'IN_STOCK', nfc_status: 'UNASSIGNED' },
      ],
      meta: { ...meta, count_unit: 'ITEM' },
    },
  }));
  await expect(
    readP07Items(
      warehouse,
      '',
      1,
      undefined,
      { request } as unknown as Client,
    ),
  ).rejects.toMatchObject({ code: 'P07_RESPONSE_INVALID' });
});
test('detail must be exactly the requested tag ID and warehouse scope', async () => {
  const request = jest.fn(async () => ({
    status: 200,
    data: { success: true, data: { physical_code_id: id }, meta },
  }));
  await expect(
    readP07Tag(warehouse, id, undefined, { request } as unknown as Client),
  ).resolves.toMatchObject({ physical_code_id: id });
  await expect(
    readP07Tag(warehouse, 'other', undefined, { request } as unknown as Client),
  ).rejects.toMatchObject({ code: 'P07_RESPONSE_INVALID' });
});
