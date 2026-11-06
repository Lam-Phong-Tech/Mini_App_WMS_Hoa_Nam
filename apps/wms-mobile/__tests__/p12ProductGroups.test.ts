import { productGroups } from '../src/features/documents/p12/products';
import type { Page, Scan } from '../src/features/documents/p12/contract';
const sku = '11111111-1111-4111-8111-111111111111';
const row = (id: string, overrides: Partial<Scan> = {}) =>
  ({
    id,
    document_id: 'parent',
    sku_id: sku,
    sku_name: 'Owner product',
    sku_code: 'CODE',
    unit: 'Cái',
    quantity: 1,
    serial_number: 'S-' + id,
    raw_code: 'RAW-' + id,
    ...overrides,
  } as Scan);
const page = (rows: Scan[], overrides: Partial<Page<Scan>> = {}) =>
  ({
    items: rows,
    paging: {
      total: rows.length,
      page: 1,
      lastPage: 1,
      perPage: 20,
      hasMore: false,
      snapshotConsistent: false,
    },
    meta: {},
    summary: { entry_count: rows.length, coverage: 'CURRENT_QUERY' },
    ...overrides,
  } as Page<Scan>);
test('groups by persisted SKU identity and sums only complete, single-unit loaded evidence', () => {
  const result = productGroups(page([row('1'), row('2', { quantity: 4 })]));
  expect(result.complete).toBe(true);
  expect(result.groups).toHaveLength(1);
  expect(result.groups[0]).toMatchObject({
    skuId: sku,
    quantity: 5,
    unit: 'Cái',
    serialCount: 2,
  });
  expect(
    productGroups(page([row('1'), row('2', { quantity: 4 })]), 'RAW-1')
      .groups[0].quantity,
  ).toBe(5);
});
test('partial pages and missing terminal proof never become complete from rows.length', () => {
  const p = page([row('1')]);
  p.paging.hasMore = true;
  p.paging.total = 2;
  p.paging.lastPage = 2;
  expect(productGroups(p).groups[0].quantity).toBeNull();
  p.paging = { total: 1, page: null, perPage: 20, snapshotConsistent: false };
  expect(productGroups(p).complete).toBe(false);
  p.paging = {
    total: 1,
    page: 1,
    lastPage: 1,
    perPage: 20,
    hasMore: true,
    snapshotConsistent: false,
  };
  expect(productGroups(p).complete).toBe(false);
});
test('missing quantity/unit, mixed units and legacy cache keep quantity null, never zero/planned', () => {
  for (const overrides of [
    { quantity: null },
    { quantity: -1 },
    { unit: null },
    { unit: 'Hộp' },
  ])
    expect(
      productGroups(page([row('1'), row('2', overrides)])).groups[0].quantity,
    ).toBeNull();
  const p = page([row('1')]);
  p.summary!.coverage = 'LEGACY_CACHE_PENDING_REFRESH';
  expect(productGroups(p).groups[0].quantity).toBeNull();
});
test('candidate serials are not evidence and missing SKU IDs are not merged by code/name', () => {
  const groups = productGroups(
    page([
      row('1', {
        sku_id: null,
        serial_number: null,
        candidate_serial_number: 'guess',
      }),
      row('2', { sku_id: null, serial_number: null }),
    ]),
  ).groups;
  expect(groups).toHaveLength(2);
  expect(groups[0].serialCount).toBe(0);
  expect(groups[0].skuId).toBeNull();
});
test('conflicting catalog names are not chosen as an authoritative historical label', () => {
  expect(
    productGroups(page([row('1'), row('2', { sku_name: 'Changed name' })]))
      .groups[0].name,
  ).toBeNull();
});
