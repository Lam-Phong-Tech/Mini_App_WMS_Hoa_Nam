/**
 * Phân tích payload mã quét.
 *
 * ⚠️ **Port nguyên văn từ Mini App cũ, KHÔNG tự nghĩ ra định dạng.** Nguồn:
 *
 *  - `src/utils/normalizeScanCode.ts` — chuẩn hoá chuỗi
 *  - `src/services/scan.service.ts:1163-1164` — tách `SKU=` và `ITEM=` (dạng lỏng)
 *  - `src/pages/ScannerPage/index.tsx:1219` và
 *    `src/services/receipt-flow.service.ts:1725` — nhận dạng "composite item",
 *    **bắt buộc có tiền tố `HN<số>|`**
 *  - `src/services/receipt-flow.service.ts:1757` — chính app cũ dựng chuỗi
 *    `HN1|SKU=${skuCode}|ITEM=${itemUnique}`, xác nhận đây là định dạng chuẩn
 *
 * Người dùng xác nhận 2026-09-05: *"Thực tế mọi hàng đều có mã item riêng.
 * Trong mã QR có cả SKU và mã item riêng."*
 *
 * Hệ quả cho chống trùng: **một `ITEM` = một kiện hàng vật lý**. Quét trúng cùng
 * một `ITEM` hai lần luôn là thao tác thừa, không bao giờ là hai kiện.
 */

/** Port từ `src/utils/normalizeScanCode.ts` của Mini App cũ. */
export function normalizeScanCode(code: string): string {
  return code.trim().replace(/\s+/g, '').toUpperCase();
}

/**
 * Phạm vi chống trùng.
 *
 * `session` — chặn tới khi người dùng xoá kết quả. Dùng cho mã có `ITEM`:
 *             mỗi kiện chỉ được đếm một lần.
 * `window`  — chỉ chặn trong một cửa sổ ngắn, đủ lọc callback dội của camera.
 *             Dùng cho mã KHÔNG có `ITEM`, vì khi đó hai lần quét cùng chuỗi
 *             có thể là **hai kiện khác nhau cùng loại** — chặn cả phiên sẽ
 *             làm mất hàng.
 */
export type DedupeScope = 'session' | 'window';

/**
 * Mã này vào app bằng đường nào.
 *
 * 🔧 Thêm 2026-09-06 vì contract `inbound/record` bắt buộc trường
 * `scan_source`. Đặt ở đây chứ không trong `features/inbound/`: màn quét dùng
 * chung cho cả nhập và xuất, nên nó không được phụ thuộc vào một feature.
 *
 * Với thủ kho đây là **dấu vết truy nguyên**: mã gõ tay không có bằng chứng
 * máy đọc được, nên khi đối soát lệch thì nó là chỗ nhìn đầu tiên.
 */
export type ScanSource = 'CAMERA' | 'MANUAL';

export interface ParsedScanPayload {
  /** Nguyên văn chuỗi camera/đầu quét trả về. */
  readonly raw: string;
  /** Sau `normalizeScanCode` — dùng làm khoá khi không có `ITEM`. */
  readonly normalized: string;
  readonly sku?: string;
  readonly item?: string;
  /** Đúng dạng `HN<số>|…|ITEM=…` mà app cũ gọi là "composite item". */
  readonly isComposite: boolean;
  /** Khoá dùng để chống trùng. */
  readonly dedupeKey: string;
  readonly dedupeScope: DedupeScope;
}

/** Dạng lỏng — `scan.service.ts:1163-1164`. */
const SKU_PATTERN = /(?:^|\|)SKU=([^|]+)/i;
const ITEM_PATTERN = /(?:^|\|)ITEM=([^|]+)/i;

/** Dạng chặt — `ScannerPage:1219`, `receipt-flow.service.ts:1725`. */
const COMPOSITE_ITEM_PATTERN = /^HN\d+\|.*(?:^|\|)ITEM=([^|]+)/i;

export function parseScanPayload(raw: string): ParsedScanPayload {
  const normalized = normalizeScanCode(raw);

  const sku = raw.match(SKU_PATTERN)?.[1]?.trim();
  const item = raw.match(ITEM_PATTERN)?.[1]?.trim();
  const compositeItem = raw.match(COMPOSITE_ITEM_PATTERN)?.[1]?.trim();

  const isComposite = compositeItem !== undefined && compositeItem.length > 0;

  // Có ITEM → khoá là chính ITEM đã chuẩn hoá. Hai QR khác nhau của cùng một
  // SKU mang ITEM khác nhau nên KHÔNG bị coi là trùng — đúng nghiệp vụ:
  // 4 kiện cùng loại quét ra 4 dòng.
  const hasItem = item !== undefined && item.length > 0;

  return {
    raw,
    normalized,
    sku: sku !== undefined && sku.length > 0 ? sku : undefined,
    item: hasItem ? item : undefined,
    isComposite,
    dedupeKey: hasItem ? normalizeScanCode(item) : normalized,
    dedupeScope: hasItem ? 'session' : 'window',
  };
}

/** Nhãn ngắn để hiển thị: ưu tiên ITEM vì đó là định danh kiện hàng. */
export function displayLabel(parsed: ParsedScanPayload): string {
  return parsed.item ?? parsed.sku ?? parsed.normalized;
}
