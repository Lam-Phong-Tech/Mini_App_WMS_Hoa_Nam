import { resolved } from './fixtures/p09Mock';
const mockContext = jest.fn(),
  mockDetail = jest.fn();
jest.mock('../src/services/wms/p06Catalog', () => ({
  createP06CatalogService: () => ({
    context: (...args: unknown[]) => mockContext(...args),
    detail: (...args: unknown[]) => mockDetail(...args),
  }),
}));
import { readP09Product } from '../src/features/warranty/p09ProductRead';
beforeEach(() => {
  mockContext.mockReset().mockResolvedValue({ data: { read_only: true } });
  mockDetail.mockReset().mockResolvedValue({
    data: {
      card: {
        card_type: 'ITEM',
        item_id: resolved.item_id,
        sku_id: resolved.sku_id,
        serial_number: resolved.serial_number,
        sku_name: 'Model from catalog',
      },
    },
    meta: { contract: 'mini-app-p06-v1', request_id: 'read-id' },
  });
});
it('projects only the exact resolved item and never invents customer data', async () => {
  const value = await readP09Product(resolved);
  expect(mockDetail).toHaveBeenCalledWith(
    { read_only: true },
    { type: 'ITEM', id: resolved.item_id },
  );
  expect(value).toEqual({
    item_id: resolved.item_id,
    serial_number: resolved.serial_number,
    product_name: 'Model from catalog',
  });
  expect(value.customer_name).toBeUndefined();
});
it.each(['item_id', 'sku_id', 'serial_number', 'card_type'])(
  'rejects a mismatched %s',
  async key => {
    const response = await mockDetail();
    response.data.card[key] = 'foreign';
    mockDetail.mockResolvedValue(response);
    await expect(readP09Product(resolved)).rejects.toThrow(
      'P09_PRODUCT_IDENTITY_MISMATCH',
    );
  },
);
