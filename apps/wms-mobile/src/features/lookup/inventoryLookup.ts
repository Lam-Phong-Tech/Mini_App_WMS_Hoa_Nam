/**
 * Truy vết tồn kho theo QR/Barcode.
 *
 * Mini App gốc không "tạo" QR từ SKU. Khi thủ kho quét (hoặc nhập) một mã,
 * nó gọi `GET /api/v1/inventory/trace/{code}` rồi dùng chính mã đó làm mã
 * truy xuất. Endpoint này chỉ đọc, không tạo phiếu và không làm đổi tồn kho.
 *
 * Tệp này giữ adapter tách khỏi màn hình để không còn tình trạng tìm theo từ
 * khoá rồi lấy bản ghi đầu tiên: một SKU có tiền tố giống SKU khác sẽ không bị
 * hiển thị nhầm thành hàng đã tồn.
 */

import { AppError } from '../../errors/AppError';
import { readOne, readPage } from '../../services/wms/readOnlyClient';
import { WMS_READ_PATHS } from '../../services/wms/queries';
import type {
  LookupMovement,
  LookupResult,
  LookupWarehouseBalance,
} from './LookupScreen';

const INVENTORY_TRACE_PATH = '/api/v1/inventory/trace/';

type RecordValue = Record<string, unknown>;

interface ProductSearchRecord {
  readonly id?: string | number;
  readonly product_id?: string | number;
  readonly sku_id?: string | number;
  readonly code?: string | null;
  readonly sku_code?: string | null;
  readonly product_code?: string | null;
  readonly qr_code?: string | null;
  readonly item_code?: string | null;
  readonly item_unique?: string | null;
  readonly serial?: string | null;
  readonly serial_no?: string | null;
  readonly serial_number?: string | null;
  readonly name?: string | null;
  readonly sku_name?: string | null;
  readonly product_name?: string | null;
  readonly category_name?: string | null;
  readonly group_name?: string | null;
  readonly unit?: string | null;
  readonly unit_name?: string | null;
  readonly warehouse_name?: string | null;
  readonly status?: string | null;
  readonly stock_status?: string | null;
  readonly usage?: string | null;
  readonly usage_description?: string | null;
  readonly purpose?: string | null;
  readonly description?: string | null;
  readonly short_description?: string | null;
  readonly available_qty?: number | string | null;
  readonly sku_type?: 'PRODUCT' | 'COMPONENT' | string | null;
}

export interface LookupCatalogItem {
  readonly skuId?: string;
  readonly skuCode: string;
  readonly skuName?: string;
  readonly skuType?: 'PRODUCT' | 'COMPONENT';
  readonly unit?: string;
  readonly categoryName?: string;
  readonly status?: string;
  readonly availableQty?: number;
}

interface InventoryRecord {
  readonly warehouse_name?: string | null;
  readonly warehouse_code?: string | null;
  readonly location_name?: string | null;
  readonly location_code?: string | null;
  readonly stock_status?: string | null;
  readonly total_qty?: number | string | null;
  readonly total_quantity?: number | string | null;
  readonly available_qty?: number | string | null;
  readonly available_quantity?: number | string | null;
  readonly qty_available?: number | string | null;
  readonly reserved_qty?: number | string | null;
  readonly reserved_quantity?: number | string | null;
  readonly unavailable_qty?: number | string | null;
  readonly non_sellable_qty?: number | string | null;
}

function asRecord(value: unknown): RecordValue | undefined {
  return typeof value === 'object' && value !== null
    ? (value as RecordValue)
    : undefined;
}

function firstText(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstNumber(...values: readonly unknown[]): number | undefined {
  for (const value of values) {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function mapMovement(value: unknown): LookupMovement | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  return {
    id: firstText(record.id, record.movement_id),
    type: firstText(record.movement_type, record.type),
    quantityDelta: firstNumber(record.qty_delta, record.quantity_delta, record.qty_change),
    occurredAt: firstText(record.occurred_at, record.created_at, record.posted_at),
    warehouseName: firstText(record.warehouse_name),
    documentNo: firstText(record.doc_no, record.document_no, record.source_no),
    status: firstText(record.stock_status, record.status),
  };
}

function mapInventoryRecord(record: InventoryRecord): LookupWarehouseBalance {
  return {
    warehouseName: firstText(record.warehouse_name),
    warehouseCode: firstText(record.warehouse_code),
    locationName: firstText(record.location_name),
    locationCode: firstText(record.location_code),
    stockStatus: firstText(record.stock_status),
    totalQty: firstNumber(record.total_qty, record.total_quantity),
    availableQty: firstNumber(
      record.available_qty,
      record.available_quantity,
      record.qty_available,
    ),
    reservedQty: firstNumber(record.reserved_qty, record.reserved_quantity),
    unavailableQty: firstNumber(record.unavailable_qty, record.non_sellable_qty),
  };
}

function mapCatalogItem(record: ProductSearchRecord): LookupCatalogItem | undefined {
  const skuCode = firstText(record.sku_code, record.product_code, record.code);
  if (skuCode === undefined) return undefined;
  const skuType = firstText(record.sku_type);
  return {
    skuId: firstText(record.sku_id, record.product_id, record.id),
    skuCode,
    skuName: firstText(record.sku_name, record.product_name, record.name),
    skuType: skuType === 'PRODUCT' || skuType === 'COMPONENT' ? skuType : undefined,
    unit: firstText(record.unit, record.unit_name),
    categoryName: firstText(record.category_name, record.group_name),
    status: firstText(record.status),
    availableQty: firstNumber(record.available_qty),
  };
}

function isExactCode(record: ProductSearchRecord, code: string): boolean {
  const normalized = code.trim().toUpperCase();
  return [
    record.qr_code,
    record.sku_code,
    record.product_code,
    record.code,
    record.item_code,
    record.item_unique,
    record.serial,
    record.serial_no,
    record.serial_number,
  ].some(value => value?.trim().toUpperCase() === normalized);
}

function unwrapTracePayload(value: unknown): RecordValue {
  const record = asRecord(value);
  if (record === undefined) return {};

  // Một số bản backend bọc thêm `data` sau envelope ngoài. Chỉ bóc khi phần
  // trong thực sự là object để không làm mất một trường `data` hợp lệ khác.
  return asRecord(record.data) ?? record;
}

/** Chuyển dữ liệu trace biến thể của WMS về đúng các hàng Mini App hiển thị. */
export function mapInventoryTrace(rawCode: string, payload: unknown): LookupResult {
  const data = unwrapTracePayload(payload);
  const product = asRecord(data.product) ?? {};
  const sku = asRecord(data.sku) ?? {};
  const item = asRecord(data.item) ?? {};
  // Tra cứu theo SKU của BE trả dữ liệu dưới `resolved_object`, thay vì
  // `sku`/`product`. Bỏ nhánh này làm UI có mã SKU nhưng mất tên dù server đã
  // trả `sku_name` đầy đủ.
  const resolved = asRecord(data.resolved_object) ?? {};
  const location =
    asRecord(data.current_location) ?? asRecord(item.current_location) ?? {};
  const category = asRecord(data.category) ?? asRecord(product.category) ?? {};
  const unit = asRecord(data.unit) ?? asRecord(product.unit) ?? {};
  const movements = Array.isArray(data.movements)
    ? data.movements.map(mapMovement).filter((value): value is LookupMovement => value !== undefined)
    : [];

  return {
    id: firstText(
      data.item_id,
      item.id,
      item.item_id,
      data.resolved_id,
      resolved.sku_id,
      data.product_id,
      product.id,
    ),
    sku_id: firstText(
      data.sku_id,
      sku.id,
      resolved.sku_id,
      item.sku_id,
      product.sku_id,
    ),
    // Đây là mã QR/Barcode thực tế vừa quét, đúng Mini App. Không thay bằng
    // SKU vì SKU không phải lúc nào cũng là mã của một hiện vật cụ thể.
    qr_code: rawCode,
    sku_code: firstText(data.sku_code, sku.sku_code, sku.code, resolved.sku_code),
    item_code:
      firstText(data.item_code, data.item_unique, item.item_code, item.item_unique) ??
      rawCode,
    serial: firstText(
      data.serial,
      data.serial_no,
      data.serial_number,
      item.serial,
      item.serial_no,
      item.serial_number,
    ),
    product_name: firstText(
      data.product_name,
      data.sku_name,
      data.name,
      product.product_name,
      product.name,
      sku.sku_name,
      sku.name,
      resolved.sku_name,
      resolved.product_name,
      resolved.name,
    ),
    group_name: firstText(
      data.category_name,
      category.name,
      product.category_name,
      resolved.family_name,
      resolved.category_name,
    ),
    unit: firstText(
      data.unit_name,
      data.unit,
      unit.name,
      product.unit_name,
      product.unit,
      resolved.unit,
    ),
    warehouse_name: firstText(data.warehouse_name, location.warehouse_name),
    // Status tồn ưu tiên trước status đối tượng, như Mini App gốc.
    status: firstText(
      data.stock_status,
      item.stock_status,
      data.object_status,
      item.status,
      data.status,
      resolved.stock_status,
      resolved.status,
    ),
    usage: firstText(
      data.usage,
      data.usage_description,
      data.purpose,
      product.usage,
      product.usage_description,
      product.purpose,
      sku.usage,
    ),
    description: firstText(
      data.description,
      data.short_description,
      product.description,
      product.short_description,
      sku.description,
    ),
    movements,
  };
}

function mergeCatalogDetails(
  trace: LookupResult,
  product: ProductSearchRecord | undefined,
): LookupResult {
  if (product === undefined) return trace;

  return {
    ...trace,
    id: trace.id ?? firstText(product.id, product.product_id, product.sku_id),
    sku_id: trace.sku_id ?? firstText(product.sku_id, product.product_id, product.id),
    sku_code: trace.sku_code ?? firstText(product.sku_code, product.product_code, product.code),
    item_code: trace.item_code ?? firstText(product.item_code, product.item_unique),
    serial: trace.serial ?? firstText(product.serial, product.serial_no, product.serial_number),
    product_name:
      trace.product_name ?? firstText(product.product_name, product.sku_name, product.name),
    group_name: trace.group_name ?? firstText(product.group_name, product.category_name),
    unit: trace.unit ?? firstText(product.unit, product.unit_name),
    warehouse_name: trace.warehouse_name ?? firstText(product.warehouse_name),
    status: trace.status ?? firstText(product.stock_status, product.status),
    usage:
      trace.usage ?? firstText(product.usage, product.usage_description, product.purpose),
    description: trace.description ?? firstText(product.description, product.short_description),
  };
}

async function findExactCatalogProduct(
  code: string,
  skuCode: string | undefined,
  signal?: AbortSignal,
): Promise<ProductSearchRecord | undefined> {
  const keyword = skuCode ?? code;
  const page = await readPage<ProductSearchRecord>(WMS_READ_PATHS.products, {
    // Swagger DEV công bố `keyword`; dùng `search` trước đây bị server bỏ qua
    // và trả trang đầu, khiến merge catalogue không thể khớp SKU.
    query: { keyword, per_page: 15 },
    signal,
  });
  const exact = page.items.find(item =>
    isExactCode(item, skuCode ?? code),
  );

  // Nếu trace tìm bằng QR thì response catalog có thể chỉ khớp QR gốc, không
  // khớp SKU. Khi đó mới thử mã đã quét; tuyệt đối không lấy phần tử đầu tiên.
  return exact ?? page.items.find(item => isExactCode(item, code));
}

/**
 * Danh sách tra cứu đúng contract Swagger DEV:
 * `keyword` tìm theo mã hoặc tên SKU và `sku_type` phân biệt Sản phẩm/Linh kiện.
 * Đây là GET; chọn một dòng vẫn quay về trace theo chính SKU để lấy hiện vật.
 */
export async function searchLookupCatalog(
  keyword: string,
  options: {
    skuType?: 'PRODUCT' | 'COMPONENT';
    signal?: AbortSignal;
  } = {},
  client?: Parameters<typeof readPage<ProductSearchRecord>>[2],
): Promise<readonly LookupCatalogItem[]> {
  const normalized = keyword.trim();
  if (normalized === '') return [];
  const page = await readPage<ProductSearchRecord>(WMS_READ_PATHS.products, {
    query: {
      keyword: normalized,
      ...(options.skuType === undefined ? {} : { sku_type: options.skuType }),
      per_page: 25,
    },
    signal: options.signal,
  }, client);
  return page.items
    .map(mapCatalogItem)
    .filter((item): item is LookupCatalogItem => item !== undefined);
}

async function fetchInventoryByWarehouse(
  skuId: string,
  signal?: AbortSignal,
): Promise<readonly LookupWarehouseBalance[]> {
  const page = await readPage<InventoryRecord>(WMS_READ_PATHS.inventory, {
    query: { sku_id: skuId, per_page: 100 },
    signal,
  });
  return page.items.map(mapInventoryRecord);
}

/**
 * Luồng tra cứu chuẩn của Mini App: truy vết mã trước, sau đó bổ sung mô tả
 * từ catalogue khi WMS trả SKU. Tất cả request đều là GET.
 */
export async function lookupInventoryByCode(
  code: string,
  signal?: AbortSignal,
): Promise<LookupResult> {
  const normalized = code.trim();
  if (normalized === '') {
    throw new AppError({ kind: 'http', status: 422, message: 'Thiếu mã cần tra cứu.' });
  }

  const payload = await readOne<unknown>(
    INVENTORY_TRACE_PATH + encodeURIComponent(normalized),
    { signal },
  );
  const trace = mapInventoryTrace(normalized, payload);
  const catalog = await findExactCatalogProduct(
    normalized,
    trace.sku_code ?? undefined,
    signal,
  ).catch(cause => {
    // Hủy lookup phải đi về UI để request cũ không lặng lẽ bổ sung dữ liệu
    // catalogue sau khi thủ kho đã chuyển sang mã mới.
    if (signal?.aborted === true) throw cause;
    return undefined;
  });

  const merged = mergeCatalogDetails(trace, catalog);
  const inventory =
    merged.sku_id === undefined
      ? []
      : await fetchInventoryByWarehouse(merged.sku_id, signal).catch(cause => {
        // Không để thiếu quyền đọc tồn làm phủ nhận hiện vật vừa trace thành
        // công. Nhưng hủy request vẫn phải nổi lên để guard chống stale hoạt động.
        if (signal?.aborted === true) throw cause;
        return [];
      });
  return { ...merged, inventory_by_warehouse: inventory };
}
