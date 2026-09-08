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
import type { LookupResult } from './LookupScreen';

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
  const location =
    asRecord(data.current_location) ?? asRecord(item.current_location) ?? {};
  const category = asRecord(data.category) ?? asRecord(product.category) ?? {};
  const unit = asRecord(data.unit) ?? asRecord(product.unit) ?? {};

  return {
    id: firstText(data.item_id, item.id, item.item_id, data.product_id, product.id),
    // Đây là mã QR/Barcode thực tế vừa quét, đúng Mini App. Không thay bằng
    // SKU vì SKU không phải lúc nào cũng là mã của một hiện vật cụ thể.
    qr_code: rawCode,
    sku_code: firstText(data.sku_code, sku.sku_code, sku.code),
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
    ),
    group_name: firstText(data.category_name, category.name, product.category_name),
    unit: firstText(data.unit_name, data.unit, unit.name, product.unit_name, product.unit),
    warehouse_name: firstText(data.warehouse_name, location.warehouse_name),
    // Status tồn ưu tiên trước status đối tượng, như Mini App gốc.
    status: firstText(
      data.stock_status,
      item.stock_status,
      data.object_status,
      item.status,
      data.status,
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
): Promise<ProductSearchRecord | undefined> {
  const search = skuCode ?? code;
  const page = await readPage<ProductSearchRecord>(WMS_READ_PATHS.products, {
    query: { search, per_page: 15 },
  });
  const exact = page.items.find(item =>
    isExactCode(item, skuCode ?? code),
  );

  // Nếu trace tìm bằng QR thì response catalog có thể chỉ khớp QR gốc, không
  // khớp SKU. Khi đó mới thử mã đã quét; tuyệt đối không lấy phần tử đầu tiên.
  return exact ?? page.items.find(item => isExactCode(item, code));
}

/**
 * Luồng tra cứu chuẩn của Mini App: truy vết mã trước, sau đó bổ sung mô tả
 * từ catalogue khi WMS trả SKU. Tất cả request đều là GET.
 */
export async function lookupInventoryByCode(code: string): Promise<LookupResult> {
  const normalized = code.trim();
  if (normalized === '') {
    throw new AppError({ kind: 'http', status: 422, message: 'Thiếu mã cần tra cứu.' });
  }

  const payload = await readOne<unknown>(
    INVENTORY_TRACE_PATH + encodeURIComponent(normalized),
  );
  const trace = mapInventoryTrace(normalized, payload);
  const catalog = await findExactCatalogProduct(normalized, trace.sku_code ?? undefined).catch(
    () => undefined,
  );

  return mergeCatalogDetails(trace, catalog);
}
