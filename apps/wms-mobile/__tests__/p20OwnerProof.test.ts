import {
  fetchPostedWarrantyComponentHistoryPage,
  P20_CONTRACT,
} from '../src/services/wms/warrantyComponentRead';
import { clearSession, setSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { AppError } from '../src/errors/AppError';
const id = (n: number) =>
  '20000000-0000-4000-8000-' + String(n).padStart(12, '0');
const warehouse = id(12),
  caseId = id(2),
  documentId = id(3),
  lineId = id(4);
const response = (data: unknown, extra: Record<string, unknown> = {}) => ({
  status: 200,
  data: {
    success: true,
    data,
    meta: {
      component_history_contract: P20_CONTRACT,
      warehouse_id: warehouse,
      read_only: true,
      operation_receipt: false,
      ...extra,
    },
  },
});
const link = (extra: Record<string, unknown> = {}) => ({
  component_issue_document_id: documentId,
  document_no: 'XLK-source',
  warranty_case_id: caseId,
  warehouse_id: warehouse,
  status: 'POSTED',
  posted_at: null,
  created_at: 'FAKE-CREATE-TIME',
  can_open: true,
  detail_url: '/api/v1/mini-app/warranty-component-issues/' + documentId,
  ...extra,
});
const detail = (
  lineExtra: Record<string, unknown> = {},
  historyExtra: Record<string, unknown> = {},
) => ({
  document: {
    id: documentId,
    component_issue_no: 'XLK-source',
    warranty_case_id: caseId,
    warehouse_id: warehouse,
    status: 'POSTED',
    posted_at: null,
    created_at: 'FAKE-CREATE-TIME',
  },
  lines: [
    {
      id: lineId,
      sku_code: 'LK',
      sku_name: 'Linh kiện',
      unit: 'chiếc',
      unit_source: 'CURRENT_SKU_CATALOG',
      issued_qty: 2,
      quantity_status: 'CONFIRMED',
      required_qty: 90,
      scanned_qty: 60,
      items: [
        {
          status: 'POSTED',
          line_id: lineId,
          raw_code: '  BOX-SOURCE  ',
          raw_code_status: 'RECORDED',
        },
      ],
      ...lineExtra,
    },
  ],
  history: {
    contract: P20_CONTRACT,
    is_operation_receipt: false,
    read_stock_effect: 'NONE',
    quantity_total: 2,
    quantity_status: 'CONFIRMED',
    totals_by_unit: { chiếc: 2 },
    ...historyExtra,
  },
});
const client = (
  d: unknown = detail(),
  meta: Record<string, unknown> = {},
  links: unknown[] = [link()],
) =>
  ({
    get: jest.fn(async (path: string) =>
      path.endsWith('/component-issues')
        ? response(links, {
            total: links.length,
            page: 1,
            per_page: 20,
            hasMore: false,
            nextCursor: null,
            nextPage: null,
            ...meta,
          })
        : response(d),
    ),
  } as any);
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'offline',
    userId: id(10),
    authSessionId: id(11),
    activeWarehouseId: warehouse,
  });
});
afterEach(() => clearSession());
test('two GET routes send P20 header/warehouse, no mutation body/status/limit', async () => {
  const c = client(),
    p = await fetchPostedWarrantyComponentHistoryPage(caseId, {}, c);
  expect(c.get.mock.calls[0]).toEqual([
    '/api/v1/mini-app/warranty-cases/' + caseId + '/component-issues',
    {
      signal: undefined,
      timeoutMs: undefined,
      headers: { 'X-Component-History-Contract': P20_CONTRACT },
      query: { warehouse_id: warehouse, per_page: 20, page: 1 },
    },
  ]);
  expect(c.get.mock.calls[1][0]).toBe(
    '/api/v1/mini-app/warranty-component-issues/' + documentId,
  );
  for (const call of c.get.mock.calls) {
    expect(call[1]).not.toHaveProperty('body');
    expect(call[1].headers).not.toHaveProperty('If-Match');
  }
  expect(p.documents[0]).toMatchObject({
    id: documentId,
    postedAt: null,
    quantityTotal: 2,
    lines: [
      {
        quantity: 2,
        scannedCodeCount: 1,
        codes: [{ rawCode: '  BOX-SOURCE  ' }],
      },
    ],
  });
});
test('raw and issued proof missing remains null, never required/scanned/zero/current code', async () => {
  const d = detail(
    {
      issued_qty: null,
      quantity_status: 'INCOMPLETE',
      items: [
        {
          status: 'POSTED',
          line_id: lineId,
          raw_code: null,
          raw_code_status: 'NOT_RECORDED',
        },
      ],
    },
    {
      quantity_total: null,
      quantity_status: 'INCOMPLETE',
      totals_by_unit: null,
    },
  );
  const p = await fetchPostedWarrantyComponentHistoryPage(
    caseId,
    {},
    client(d),
  );
  expect(p.documents[0]).toMatchObject({
    postedAt: null,
    quantityTotal: null,
    lines: [
      {
        quantity: null,
        scannedCodeCount: null,
        codes: [{ rawCode: null, status: 'NOT_RECORDED' }],
      },
    ],
  });
});
test('403 child preserves POSTED link/error, not entire empty history', async () => {
  const c = client();
  c.get.mockImplementation(async (path: string) => {
    if (path.endsWith('/component-issues'))
      return response([link()], {
        total: 1,
        page: 1,
        hasMore: false,
        nextCursor: null,
        nextPage: null,
      });
    throw new AppError({ kind: 'http', status: 403, message: 'denied detail' });
  });
  const p = await fetchPostedWarrantyComponentHistoryPage(caseId, {}, c);
  expect(p.total).toBe(1);
  expect(p.documents[0]).toMatchObject({
    id: documentId,
    postedAt: null,
    detailUnavailable: true,
    lines: [],
  });
});
test.each(['id', 'warehouse_id', 'warranty_case_id', 'status'])(
  'wrong child identity %s never hydrates proof',
  async field => {
    const d = detail();
    (d.document as any)[field] = field === 'status' ? 'DRAFT' : id(99);
    const p = await fetchPostedWarrantyComponentHistoryPage(
      caseId,
      {},
      client(d),
    );
    expect(p.documents[0].detailUnavailable).toBe(true);
    expect(p.documents[0].lines).toEqual([]);
  },
);
test('REMOVED item, false raw proof and total mismatch are partial detail errors, no fallback', async () => {
  const variants = [
    detail({
      items: [
        {
          status: 'REMOVED',
          line_id: lineId,
          raw_code: 'fake',
          raw_code_status: 'RECORDED',
        },
      ],
    }),
    detail({
      items: [
        {
          status: 'POSTED',
          line_id: lineId,
          raw_code: 'fake',
          raw_code_status: 'IDENTITY_MISMATCH',
        },
      ],
    }),
    detail({}, { quantity_total: 3 }),
  ];
  for (const d of variants)
    expect(
      (await fetchPostedWarrantyComponentHistoryPage(caseId, {}, client(d)))
        .documents[0].detailUnavailable,
    ).toBe(true);
});
test('server hasMore, even a short page, is authoritative; invalid metadata is not empty', async () => {
  const p = await fetchPostedWarrantyComponentHistoryPage(
    caseId,
    {},
    client(detail(), { total: 8, hasMore: true, nextPage: 2 }),
  );
  expect(p.hasMore).toBe(true);
  expect(p.nextPage).toBe(2);
  await expect(
    fetchPostedWarrantyComponentHistoryPage(
      caseId,
      {},
      client(detail(), { hasMore: undefined }),
    ),
  ).rejects.toMatchObject({ kind: 'parse' });
});
test('unopenable link never calls detail; list scope/status mismatch fails', async () => {
  const c = client(detail(), {}, [link({ can_open: false, detail_url: null })]);
  expect(
    (await fetchPostedWarrantyComponentHistoryPage(caseId, {}, c)).documents[0]
      .detailUnavailable,
  ).toBe(true);
  expect(c.get).toHaveBeenCalledTimes(1);
  await expect(
    fetchPostedWarrantyComponentHistoryPage(
      caseId,
      {},
      client(detail(), {}, [link({ warranty_case_id: id(77) })]),
    ),
  ).rejects.toMatchObject({ kind: 'parse' });
});
test('only exact query namespaces, page/cursor mutual exclusion and confirmed warehouse', async () => {
  for (const query of [
    { page: 1, cursor: 'x' },
    { status: 'POSTED' },
    { limit: 20 },
    { warehouse_id: id(77) },
  ]) {
    const c = client();
    await expect(
      fetchPostedWarrantyComponentHistoryPage(caseId, { query }, c),
    ).rejects.toMatchObject({ kind: 'config' });
    expect(c.get).not.toHaveBeenCalled();
  }
});
test('new login while hydration pending discards old protected rows', async () => {
  const c = client();
  let finish!: (x: any) => void;
  c.get.mockImplementation(async (path: string) =>
    path.endsWith('/component-issues')
      ? response([link()], {
          total: 1,
          hasMore: false,
          nextCursor: null,
          nextPage: null,
        })
      : new Promise(r => {
          finish = r;
        }),
  );
  const p = fetchPostedWarrantyComponentHistoryPage(caseId, {}, c);
  await new Promise<void>(r => setTimeout(() => r(), 0));
  setSession({
    accessToken: 'new',
    userId: id(10),
    authSessionId: id(77),
    activeWarehouseId: warehouse,
  });
  finish(response(detail()));
  await expect(p).rejects.toMatchObject({ kind: 'cancelled' });
});
