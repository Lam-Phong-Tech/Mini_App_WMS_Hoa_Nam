/**
 * Đối soát SKU khi `inbound/resolve-code` trả về ứng viên mới.
 *
 * Có trường hợp backend resolve theo mã tem vật lý trả `NEW_*_CANDIDATE` dù
 * SKU đã hiện trong danh mục hoặc bảng tồn. Không được để kết luận đó mở ngay
 * màn "Sản phẩm hay linh kiện?": thủ kho sẽ vô tình tạo SKU trùng. Mini App
 * đối chiếu tiếp mã SKU với dữ liệu WMS trước khi coi nó là mới.
 *
 * Các lời gọi ở đây chỉ GET. `products?search` là danh mục đã dùng ở màn tra
 * cứu; `inventory/balances` xác nhận SKU đã thực sự có bản ghi tồn/kho.
 */

import { AppError } from '../../errors/AppError';
import { parseScanPayload } from '../../scanner/scanPayload';
import { readPage } from '../../services/wms/readOnlyClient';
import { WMS_READ_PATHS } from '../../services/wms/queries';

export interface ExistingInboundSku {
  readonly skuCode: string;
  readonly skuName?: string;
  readonly productId?: string;
  readonly warehouseName?: string;
  readonly stockStatus?: string;
  readonly availableQuantity?: number;
  /** Có ít nhất một dòng balance — tức SKU đã có bản ghi trong kho. */
  readonly foundInInventory: boolean;
}

interface CatalogProduct {
  readonly id?: string | number;
  readonly product_id?: string | number;
  readonly sku_id?: string | number;
  readonly code?: string | null;
  readonly sku_code?: string | null;
  readonly product_code?: string | null;
  readonly sku_name?: string | null;
  readonly product_name?: string | null;
  readonly name?: string | null;
}

interface InventoryBalance {
  readonly sku_code?: string | null;
  readonly product_code?: string | null;
  readonly code?: string | null;
  readonly product_name?: string | null;
  readonly sku_name?: string | null;
  readonly warehouse_name?: string | null;
  readonly stock_status?: string | null;
  readonly status?: string | null;
  readonly available_qty?: number | string | null;
  readonly available_quantity?: number | string | null;
  readonly qty_available?: number | string | null;
}

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

function firstText(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstQuantity(...values: readonly unknown[]): number | undefined {
  for (const value of values) {
    const numberValue = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return undefined;
}

function matchesCode(
  record: CatalogProduct | InventoryBalance,
  candidates: readonly string[],
): boolean {
  const codes = [record.sku_code, record.product_code, record.code]
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    .map(normalized);
  return candidates.some(candidate => codes.includes(normalized(candidate)));
}

function candidateCodes(rawCode: string): readonly string[] {
  const parsed = parseScanPayload(rawCode);
  return Array.from(
    new Set([rawCode, parsed.sku].filter((value): value is string => value !== undefined && value.trim() !== '')),
  );
}

/**
 * Trả SKU đã biết nếu tìm thấy chính xác; `undefined` khi cả danh mục lẫn
 * balance đã trả dữ liệu nhưng không có mã. Nếu cả hai nguồn không đọc được thì
 * ném lỗi để UI không tự tạo SKU theo một kết luận thiếu dữ liệu.
 */
export async function findExistingInboundSku(rawCode: string): Promise<ExistingInboundSku | undefined> {
  const candidates = candidateCodes(rawCode);
  const catalogRequests = candidates.map(code =>
    readPage<CatalogProduct>(WMS_READ_PATHS.products, {
      query: { search: code, per_page: 25 },
    }),
  );
  const requests = [...catalogRequests, readPage<InventoryBalance>(
    WMS_READ_PATHS.inventoryBalances,
    { query: { per_page: 50 } },
  )];
  const results = await Promise.allSettled(requests);
  const successful = results.filter(result => result.status === 'fulfilled');

  if (successful.length === 0) {
    throw new AppError({
      kind: 'network',
      message: 'Không đối soát được SKU với danh mục/tồn kho WMS.',
    });
  }

  // Giữ nguyên chỉ số của `results`: một request catalogue hỏng không được
  // phép làm response balance bị đọc nhầm thành catalogue.
  const catalog = results
    .slice(0, catalogRequests.length)
    .flatMap(result =>
      result.status === 'fulfilled'
        ? (result.value.items as readonly CatalogProduct[])
        : [],
    )
    .find(record => matchesCode(record, candidates));
  const balanceResult = results.at(-1);
  const balances =
    balanceResult?.status === 'fulfilled'
      ? (balanceResult.value.items as readonly InventoryBalance[])
      : [];
  const balance = balances.find(record => matchesCode(record, candidates));

  if (catalog === undefined && balance === undefined) return undefined;

  const skuCode = firstText(
    balance?.sku_code,
    catalog?.sku_code,
    catalog?.product_code,
    catalog?.code,
    candidates.at(1),
    candidates[0],
  );
  if (skuCode === undefined) return undefined;

  return {
    skuCode,
    skuName: firstText(
      balance?.sku_name,
      balance?.product_name,
      catalog?.sku_name,
      catalog?.product_name,
      catalog?.name,
    ),
    productId: firstText(catalog?.product_id, catalog?.sku_id, catalog?.id),
    warehouseName: firstText(balance?.warehouse_name),
    stockStatus: firstText(balance?.stock_status, balance?.status),
    availableQuantity: firstQuantity(
      balance?.available_qty,
      balance?.available_quantity,
      balance?.qty_available,
    ),
    foundInInventory: balance !== undefined,
  };
}
