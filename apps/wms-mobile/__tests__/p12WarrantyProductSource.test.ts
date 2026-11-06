import { warrantyProductPage } from '../src/features/documents/p12/controller';
import type { Document } from '../src/features/documents/p12/contract';

const document = (source: Record<string, unknown>): Document =>
  ({
    type: 'warranty',
    id: 'e1111111-1111-4111-8111-111111111107',
    number: 'TC12-TEST-WARRANTY-20261025',
    warehouseId: '01a06f33-6bff-70b8-a089-3c68a83b11a8',
    p12: {} as Document['p12'],
    source,
  } as Document);

test('warranty products use persisted detail identity without scan endpoint or catalog lookup', () => {
  const page = warrantyProductPage(
    document({
      item_id: 'e1111111-1111-4111-8111-111111111103',
      product_id: 'e1111111-1111-4111-8111-111111111101',
      sku_code: 'TC11-TC12-TEST-SKU-20261025',
      sku_name: 'TEST TC11 TC12 Product',
      serial_number: 'TC11-TC12-TEST-SERIAL-20261025',
      identification_status: 'IDENTIFIED',
    }),
  );

  expect(page).toMatchObject({
    items: [
      {
        id: 'e1111111-1111-4111-8111-111111111103',
        sku_id: 'e1111111-1111-4111-8111-111111111101',
        sku_code: 'TC11-TC12-TEST-SKU-20261025',
        sku_name: 'TEST TC11 TC12 Product',
        serial_number: 'TC11-TC12-TEST-SERIAL-20261025',
      },
    ],
    summary: {
      entry_count: 1,
      sku_count: 1,
      item_count: 1,
      resolved_serial_count: 1,
      quantity_total: null,
      coverage: 'CURRENT_QUERY',
    },
  });
  expect(page?.paging.hasMore).toBe(false);
  expect(page?.meta).toMatchObject({
    kind: 'LOCAL_OWNER_DETAIL_PRESENTATION_NOT_BACKEND_CONTRACT',
    source: 'PERSISTED_WARRANTY_CASE_DETAIL',
  });
});

test('warranty products stay explicitly unavailable when persisted identity is absent', () => {
  expect(warrantyProductPage(document({ identification_status: 'IDENTIFIED' }))).toBeNull();
});
