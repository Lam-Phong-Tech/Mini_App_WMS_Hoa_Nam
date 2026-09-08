import { mapInventoryTrace } from '../src/features/lookup/inventoryLookup';

describe('truy vết tồn từ QR/Barcode', () => {
  it('giữ nguyên mã QR vừa quét và dùng trạng thái tồn trước trạng thái object', () => {
    const result = mapInventoryTrace('QR-ITEM-001', {
      sku_code: 'SKU-001',
      item_code: 'ITEM-001',
      serial_number: 'SN-001',
      stock_status: 'IN_STOCK',
      object_status: 'ACTIVE',
      current_location: { warehouse_name: 'Kho tổng Hoa Nam' },
      product: {
        product_name: 'Van cảm biến',
        category_name: 'Thiết bị',
        unit_name: 'Cái',
        usage: 'Lắp trong tủ điều khiển',
        description: 'Hàng đã nhập kho',
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        qr_code: 'QR-ITEM-001',
        sku_code: 'SKU-001',
        item_code: 'ITEM-001',
        serial: 'SN-001',
        product_name: 'Van cảm biến',
        warehouse_name: 'Kho tổng Hoa Nam',
        status: 'IN_STOCK',
      }),
    );
  });

  it('chịu được backend bọc thêm data và không biến SKU thành QR mới', () => {
    const result = mapInventoryTrace('https://qr.example/physical-123', {
      data: {
        sku: { code: 'SKU-123', name: 'Động cơ' },
        item: { item_unique: 'ITEM-123', status: 'ACTIVE' },
      },
    });

    expect(result.qr_code).toBe('https://qr.example/physical-123');
    expect(result.sku_code).toBe('SKU-123');
    expect(result.item_code).toBe('ITEM-123');
    expect(result.status).toBe('ACTIVE');
  });
});
