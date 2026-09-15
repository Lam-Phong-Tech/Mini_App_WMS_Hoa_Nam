import {
  mapInventoryTrace,
  searchLookupCatalog,
} from '../src/features/lookup/inventoryLookup';
import { createApiClient } from '../src/api/client';

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

  it('đọc tên SKU từ resolved_object khi tra cứu trực tiếp bằng SKU', () => {
    const result = mapInventoryTrace('DF1234', {
      resolved_id: 'sku-df1234',
      resolved_type: 'SKU',
      resolved_object: {
        sku_code: 'DF1234',
        sku_name: 'Máy Khoan cắt điện',
        unit: 'cái',
        family_name: 'Dụng cụ cắt',
      },
    });

    expect(result).toMatchObject({
      id: 'sku-df1234',
      sku_code: 'DF1234',
      product_name: 'Máy Khoan cắt điện',
      unit: 'cái',
      group_name: 'Dụng cụ cắt',
    });
  });

  it('giữ movement trace thật để dựng lịch sử, không tự tính chênh lệch', () => {
    const result = mapInventoryTrace('DF1234', {
      resolved_object: { sku_id: 'sku-df1234', sku_code: 'DF1234' },
      movements: [{
        id: 'mv-1',
        movement_type: 'RECEIPT',
        qty_delta: 3,
        warehouse_name: 'Kho tổng Hoa Nam',
        doc_no: 'PN-001',
        occurred_at: '2026-09-16T09:00:00+07:00',
      }],
    });

    expect(result.sku_id).toBe('sku-df1234');
    expect(result.movements).toEqual([{
      id: 'mv-1',
      type: 'RECEIPT',
      quantityDelta: 3,
      warehouseName: 'Kho tổng Hoa Nam',
      documentNo: 'PN-001',
      occurredAt: '2026-09-16T09:00:00+07:00',
      status: undefined,
    }]);
  });

  it('danh sách catalogue dùng query keyword và sku_type đã công bố', async () => {
    let requestedUrl = '';
    const client = createApiClient({
      environment: {
        name: 'dev-test', label: 'test', apiBaseUrl: 'https://example.test',
        requestTimeoutMs: 1000, expectedTier: 'dev-test',
        environmentClassVerified: true, wmsGateApproved: false, behindEdgeProxy: false,
      },
      fetchImpl: async input => {
        requestedUrl = String(input);
        return new Response(JSON.stringify({ success: true, data: [{
          sku_id: 'sku-1', sku_code: 'DCCS20061-2', sku_name: 'Cưa cắt cành',
          sku_type: 'PRODUCT', unit: 'cái', available_qty: 3,
        }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    });
    const items = await searchLookupCatalog('cưa', { skuType: 'PRODUCT' }, client);
    expect(requestedUrl).toContain('keyword=c%C6%B0a');
    expect(requestedUrl).toContain('sku_type=PRODUCT');
    expect(items[0]).toMatchObject({ skuCode: 'DCCS20061-2', availableQty: 3 });
  });
});
