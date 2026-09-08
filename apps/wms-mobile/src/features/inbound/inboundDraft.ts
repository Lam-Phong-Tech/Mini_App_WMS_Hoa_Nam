/**
 * Phiếu nhập nháp — máy trạng thái, tách khỏi React.
 *
 * 🎨 Nguồn: ảnh **18–24** của bộ 47 ảnh.
 *
 * ## Ngữ nghĩa nghiệp vụ — lấy nguyên văn từ banner trong ảnh
 *
 * Ba banner dưới đây **không phải chú thích trang trí**, chúng mô tả đúng ba mốc
 * mà tồn kho thay đổi. Port sai là thủ kho hiểu nhầm hàng đã vào kho:
 *
 * | Ảnh | Nguyên văn | Nghĩa |
 * |:--:|---|---|
 * | 18 | *"Chưa tăng tồn ở bước quét — Scan chỉ lưu danh sách mã tạm."* | quét = **chỉ ghi nháp trên máy** |
 * | 20 | *"Chỉ Post Receipt mới tăng tồn."* | ghi nhận = tạo phiếu WMS, **chưa** tăng tồn |
 * | 24 | *"Tồn kho chỉ tăng sau khi duyệt/Post Receipt."* | tăng tồn ở mốc **thứ ba**, do người duyệt |
 *
 * ⇒ Ba mốc tách bạch: **quét** (máy) → **ghi nhận** (tạo phiếu, chờ duyệt) →
 * **Post Receipt** (tăng tồn). App chỉ chạm hai mốc đầu.
 *
 * ## Gom theo SKU
 *
 * Ảnh 18: *"Không cần chọn SKU hoặc nhập số lượng trước. Mini App gom các mã
 * cùng SKU sau khi quét."* ⇒ danh sách hiển thị theo **SKU**, nhưng chống trùng
 * vẫn theo **ITEM** (mỗi ITEM là một đơn vị vật lý — người dùng chốt ở Prompt 3).
 *
 * ## 🔒 Bước ghi bị Gate chặn
 *
 * `GATE_WMS §2d` chỉ mở **đọc**. Nút *Ghi nhận nhập* vì thế đưa bản ghi vào
 * hàng đợi rồi nhận `blocked_by_gate` từ `gateBlockedSender` — **không** khoá
 * nút câm lặng. Thủ kho thấy đúng lý do, và bản ghi nằm lại hàng đợi chờ Gate mở.
 */

import {
  parseScanPayload,
  normalizeScanCode,
  type ParsedScanPayload,
  type ScanSource,
} from '../../scanner/scanPayload';

export type { ScanSource };

/** Bốn bước của stepper, đúng nhãn trong ảnh 18. */
export const INBOUND_STEPS = [
  'Thông tin',
  'Quét mã',
  'Kiểm tra',
  'Gửi duyệt',
] as const;

export type InboundStep = 0 | 1 | 2 | 3;

/** Loại tồn kho do thủ kho xác nhận khi mã/SKU hoàn toàn mới. */
export type InboundItemType = 'PRODUCT' | 'COMPONENT';

/**
 * Mã hộp linh kiện nhỏ. SKU được phép có dấu gạch ngang; phần số hộp luôn là
 * đoạn số cuối cùng, ví dụ `BOX-DCPL1-001` hay `BOX-DCCS20083-2-001`.
 */
export interface ComponentBoxCode {
  readonly raw: string;
  readonly sku: string;
  readonly boxNumber: string;
}

/**
 * Chỉ nhận đúng format nghiệp vụ `BOX-<SKU>-<Mã số của hộp>`.
 *
 * Không dùng `split('-')`: SKU thực tế có thể chứa dấu gạch ngang, nên phải
 * tách từ đoạn số cuối. Mã không khớp trả `undefined` để nó đi qua luồng quét
 * sản phẩm/linh kiện dán tem bình thường.
 */
export function parseComponentBoxCode(raw: string): ComponentBoxCode | undefined {
  const value = raw.trim();
  const matched = /^BOX-(.+)-(\d+)$/i.exec(value);
  const sku = matched?.[1]?.trim();
  const boxNumber = matched?.[2];

  if (sku === undefined || sku === '' || boxNumber === undefined) {
    return undefined;
  }

  return { raw: value, sku, boxNumber };
}

/** Số lượng trong hộp phải là số nguyên dương, an toàn khi gửi JSON. */
export function parseComponentBoxQuantity(raw: string): number | undefined {
  const value = raw.trim();
  if (!/^\d+$/.test(value)) {
    return undefined;
  }
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : undefined;
}

/** Một mã đã quét. */
export interface ScannedCode {
  readonly key: string;
  readonly raw: string;
  readonly sku?: string;
  /** Tên SKU WMS trả về sau khi resolve. Không dùng để gửi record. */
  readonly skuName?: string;
  /** ID hiện vật WMS trả về từ resolve-code — ưu tiên cao nhất để chống trùng. */
  readonly itemId?: string;
  readonly item?: string;
  /** Chỉ có với SKU mới do thủ kho phân loại, hoặc hộp linh kiện. */
  readonly itemType?: InboundItemType;
  /** Mỗi tem dán sẵn là 1; hộp linh kiện có số lượng kiểm đếm thực tế. */
  readonly quantity: number;
  /** Có giá trị khi mã là `BOX-<SKU>-<Mã số hộp>`. */
  readonly boxNumber?: string;
  readonly source: ScanSource;
  /** Epoch ms lúc quét, theo giờ máy chủ nếu có. */
  readonly at: number;
}

/** Phần kết quả `inbound/resolve-code` mà nháp cần để vẽ lại đúng Mini App. */
export interface InboundCodeResolution {
  /** Định danh hiện vật bất biến do WMS trả về; không suy từ chuỗi QR. */
  readonly itemId?: string | null;
  readonly skuCode?: string | null;
  readonly skuName?: string | null;
  readonly itemUnique?: string | null;
  readonly serialNumber?: string | null;
  readonly itemType?: InboundItemType;
}

/** Một nhóm SKU sau khi gom. */
export interface SkuGroup {
  /** `undefined` khi mã không mang SKU — vẫn phải hiện, không được nuốt. */
  readonly sku?: string;
  readonly codes: readonly ScannedCode[];
}

export interface InboundDraft {
  /** Tên phiếu — bắt buộc trước khi sang bước quét (ảnh 18). */
  readonly name: string;
  /**
   * Kho nhận. Contract `inbound/record` bắt buộc `dst_warehouse_id`.
   *
   * 🔧 Thêm 2026-09-06. Mini App đang chạy có ô chọn kho ở đúng màn này và mặc
   * định kho đầu tiên (`pages/ReceiptCreatePage/index.tsx:41`); bản port đầu
   * của tôi bỏ sót, nên phiếu dựng ra không bao giờ gửi được.
   */
  readonly warehouseId?: string;
  /** Tên kho để hiện lại — không gửi lên, chỉ để thủ kho đọc. */
  readonly warehouseName?: string;
  /** Mã phiên cục bộ — Mini App tạo từ bước thông tin, không suy từ số mã quét. */
  readonly localDocumentRef?: string;
  readonly codes: readonly ScannedCode[];
  readonly step: InboundStep;
  readonly nameError?: string;
  readonly warehouseError?: string;
}

export const initialInboundDraft: InboundDraft = {
  name: '',
  codes: [],
  step: 0,
};

/** Nguyên văn cho ô bắt buộc. Ảnh 18 đánh dấu *Tên phiếu** có dấu sao đỏ. */
export const MESSAGE_NAME_REQUIRED = 'Vui lòng nhập tên phiếu.';

/**
 * Kho nhận không phải thứ người dùng gõ ra — nó đến từ WMS. Nên khi thiếu, lỗi
 * phải nói là **chưa lấy được**, không phải "vui lòng chọn": nguyên nhân thường
 * là mất mạng chứ không phải người dùng quên.
 */
export const MESSAGE_WAREHOUSE_REQUIRED = 'Chưa lấy được kho nhận từ WMS.';

// ---------------------------------------------------------------------------
// Bước 1 — thông tin
// ---------------------------------------------------------------------------

export function setDraftName(draft: InboundDraft, name: string): InboundDraft {
  return { ...draft, name, nameError: undefined };
}

export function setDraftWarehouse(
  draft: InboundDraft,
  warehouseId: string,
  warehouseName?: string,
): InboundDraft {
  return { ...draft, warehouseId, warehouseName, warehouseError: undefined };
}

/**
 * Điều kiện sang bước quét.
 *
 * Ảnh 18 cho thấy nút *TIẾP TỤC QUÉT* ở trạng thái **disabled** khi ô tên còn
 * trống — khác với màn Đăng nhập (nút luôn bấm được, bấm mới hiện lỗi). Giữ
 * đúng từng màn: đây là thiết kế của app cũ, không phải chỗ để thống nhất cho
 * gọn.
 */
export function canContinueToScan(draft: InboundDraft): boolean {
  return draft.name.trim() !== '' && (draft.warehouseId ?? '') !== '';
}

export function continueToScan(draft: InboundDraft): InboundDraft {
  // Báo CẢ HAI lỗi cùng lúc. Sửa một cái rồi mới biết còn cái nữa là kiểu bắt
  // người dùng đoán — nhất là khi lỗi thứ hai họ không tự sửa được.
  if (!canContinueToScan(draft)) {
    return {
      ...draft,
      nameError:
        draft.name.trim() === '' ? MESSAGE_NAME_REQUIRED : undefined,
      warehouseError:
        (draft.warehouseId ?? '') === ''
          ? MESSAGE_WAREHOUSE_REQUIRED
          : undefined,
    };
  }
  return {
    ...draft,
    step: 1,
    localDocumentRef: draft.localDocumentRef ?? generateLocalDocumentRef(),
    nameError: undefined,
    warehouseError: undefined,
  };
}

let localDocumentSequence = 0;

/** Cùng quy ước `local-…` Mini App dùng trước khi record lên WMS. */
function generateLocalDocumentRef(now: () => number = Date.now): string {
  localDocumentSequence = (localDocumentSequence + 1) % 1_000_000;
  return 'local-' + now().toString(36) + '-' + localDocumentSequence.toString(36);
}

// ---------------------------------------------------------------------------
// Bước 2 — quét
// ---------------------------------------------------------------------------

/**
 * Thêm một mã đã quét.
 *
 * Chống trùng theo **ITEM** khi mã có ITEM, theo mã chuẩn hoá khi không có —
 * đúng quy tắc đã chốt ở Prompt 3 (`scanPayload.dedupeKey`). Người dùng xác
 * nhận: *"Thực tế mọi hàng đều có mã item riêng."*
 *
 * Trả `{ draft, accepted }` để màn hình biết có nên kêu bíp hay báo trùng.
 */
export function addScannedCode(
  draft: InboundDraft,
  raw: string,
  at: number,
  source: ScanSource = 'CAMERA',
): { readonly draft: InboundDraft; readonly accepted: boolean } {
  const parsed: ParsedScanPayload = parseScanPayload(raw);
  const key = parsed.dedupeKey;

  if (draft.codes.some(code => code.key === key)) {
    return { draft, accepted: false };
  }

  const next: ScannedCode = {
    key,
    raw: parsed.raw,
    sku: parsed.sku,
    item: parsed.item,
    quantity: 1,
    source,
    at,
  };
  return { draft: { ...draft, codes: [...draft.codes, next] }, accepted: true };
}

/**
 * Chỉ gọi sau khi WMS đã resolve mã. Mini App không cộng một mã vào phiên quét
 * trước khi biết nó thuộc SKU nào; làm ngược lại sẽ cho phép ghi nhận một tem
 * WMS không nhận ra.
 */
export function addResolvedScannedCode(
  draft: InboundDraft,
  raw: string,
  at: number,
  source: ScanSource,
  resolution: InboundCodeResolution,
): { readonly draft: InboundDraft; readonly accepted: boolean } {
  const parsed = parseScanPayload(raw);
  const item =
    parsed.item ??
    nonEmpty(resolution.itemUnique) ??
    nonEmpty(resolution.serialNumber);
  const sku = nonEmpty(resolution.skuCode) ?? parsed.sku;
  const itemId = nonEmpty(resolution.itemId);

  /**
   * Khớp `getReceiptPhysicalDuplicateKey` của Mini App.
   *
   * QR có ITEM (hoặc URL/chuỗi định danh vật lý) chỉ được nhận một lần. Ngược
   * lại, barcode SKU trần là mã loại hàng: hai kiện cùng SKU có thể dùng chung
   * nhãn và phải được quét lặp để cộng số lượng. Bản port cũ đã dùng
   * `parsed.dedupeKey` cho cả hai, khiến lượt quét SKU thứ hai bị báo trùng.
   */
  // Một ITEM có thể được in bằng hai QR/serial khác nhau. Chỉ `item_id` WMS
  // mới là định danh tuyệt đối; nếu resolver chưa có ID (candidate mới) mới
  // hạ xuống item_unique rồi mã vật lý như Mini App.
  const physicalKey =
    itemId !== undefined
      ? 'item-id:' + normalizeScanCode(itemId)
      : item === undefined
      ? getPhysicalDuplicateKey(parsed.raw)
      : 'item:' + normalizeScanCode(item);
  const key =
    physicalKey ?? nextRepeatableSkuKey(draft, sku ?? parsed.normalized);

  if (physicalKey !== undefined && draft.codes.some(code => code.key === key)) {
    return { draft, accepted: false };
  }

  const skuName = nonEmpty(resolution.skuName);
  return {
    draft: {
      ...draft,
      codes: [
        ...draft.codes,
        {
          key,
          raw: parsed.raw,
          sku,
          skuName,
          itemId,
          item,
          itemType: resolution.itemType,
          quantity: 1,
          source,
          at,
        },
      ],
    },
    accepted: true,
  };
}

/**
 * Lọc cuối trước khi tạo batch: một hiện vật chỉ để lại dòng đầu tiên. Bước
 * quét đã chặn ngay từ đầu; lớp này bảo vệ cả nháp sinh bởi bản app cũ hoặc QR
 * khác nhau cùng resolve về một `item_id`. Barcode SKU trần vẫn được giữ lặp vì
 * nó không định danh một hiện vật riêng.
 */
export function dedupePhysicalInboundCodes(draft: InboundDraft): InboundDraft {
  const seen = new Set<string>();
  const codes = draft.codes.filter(code => {
    const identity =
      code.itemId === undefined || code.itemId.trim() === ''
        ? code.item === undefined || code.item.trim() === ''
          ? getPhysicalDuplicateKey(code.raw)
          : 'item:' + normalizeScanCode(code.item)
        : 'item-id:' + normalizeScanCode(code.itemId);
    if (identity === undefined) {
      return true;
    }
    if (seen.has(identity)) {
      return false;
    }
    seen.add(identity);
    return true;
  });
  return codes.length === draft.codes.length ? draft : { ...draft, codes };
}

/** `ITEM` của QR chuẩn là định danh hiện vật, không được cộng hai lần. */
function getPhysicalDuplicateKey(raw: string): string | undefined {
  const value = raw.trim();
  const compositeItem = value.match(/^HN\d+\|.*(?:^|\|)ITEM=([^|]+)/i)?.[1];
  if (compositeItem !== undefined && compositeItem.trim() !== '') {
    return normalizeScanCode(compositeItem);
  }

  // SKU/barcode hàng loạt (vd `SKU-A01`, `A_01`) có thể đại diện nhiều kiện;
  // không khoá cả phiên. QR URL hay chuỗi lạ vẫn là định danh vật lý và bị
  // chặn trùng để không tăng nhầm khi camera đọc lại cùng một tem.
  if (/^[A-Z0-9]+(?:[-_][A-Z0-9]+)*$/i.test(value)) {
    return undefined;
  }
  return value === '' ? undefined : normalizeScanCode(value);
}

/** Tạo khoá nội bộ riêng cho từng lượt quét lại cùng một SKU. */
function nextRepeatableSkuKey(draft: InboundDraft, sku: string): string {
  const prefix = 'sku-repeat:' + normalizeScanCode(sku) + ':';
  let sequence = 1;
  while (draft.codes.some(code => code.key === prefix + String(sequence))) {
    sequence += 1;
  }
  return prefix + String(sequence);
}

/**
 * Thêm một hộp linh kiện sau khi thủ kho đã kiểm đếm và xác nhận số lượng.
 * Hộp không đi qua lựa chọn loại hàng: tiền tố `BOX-` là quy ước nghiệp vụ
 * khẳng định đây luôn là linh kiện.
 */
export function addComponentBox(
  draft: InboundDraft,
  box: ComponentBoxCode,
  quantity: number,
  at: number,
  source: ScanSource,
): { readonly draft: InboundDraft; readonly accepted: boolean } {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    return { draft, accepted: false };
  }

  const key = normalizeScanCode(box.raw);
  if (draft.codes.some(code => code.key === key)) {
    return { draft, accepted: false };
  }

  return {
    draft: {
      ...draft,
      codes: [
        ...draft.codes,
        {
          key,
          raw: box.raw,
          sku: box.sku,
          item: box.raw,
          itemType: 'COMPONENT',
          quantity,
          boxNumber: box.boxNumber,
          source,
          at,
        },
      ],
    },
    accepted: true,
  };
}

function nonEmpty(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}

/** Xoá một mã. Ảnh 20 ghi *"Vuốt trái để xoá"* ở đầu danh sách SKU. */
export function removeScannedCode(
  draft: InboundDraft,
  key: string,
): InboundDraft {
  return { ...draft, codes: draft.codes.filter(code => code.key !== key) };
}

/** Xoá cả một nhóm SKU. */
export function removeSkuGroup(
  draft: InboundDraft,
  sku: string | undefined,
): InboundDraft {
  return { ...draft, codes: draft.codes.filter(code => code.sku !== sku) };
}

/**
 * Màn Mini App gom theo SKU nhưng thao tác "Xoá 1" chỉ gỡ mã mới nhất của
 * nhóm. Xoá cả nhóm sẽ làm mất các kiện đã quét đúng.
 */
export function removeNewestSkuCode(
  draft: InboundDraft,
  sku: string | undefined,
): InboundDraft {
  const newest = [...draft.codes].reverse().find(code => code.sku === sku);
  return newest === undefined ? draft : removeScannedCode(draft, newest.key);
}

// ---------------------------------------------------------------------------
// Gom nhóm và tổng hợp
// ---------------------------------------------------------------------------

/**
 * Gom mã theo SKU, **giữ thứ tự quét**.
 *
 * Giữ thứ tự chứ không sắp xếp lại: thủ kho quét theo thứ tự lấy hàng khỏi
 * thùng, và danh sách nhảy loạn sau mỗi lần quét làm họ mất chỗ đang nhìn.
 */
export function groupBySku(codes: readonly ScannedCode[]): readonly SkuGroup[] {
  const order: (string | undefined)[] = [];
  const buckets = new Map<string | undefined, ScannedCode[]>();

  for (const code of codes) {
    const bucket = buckets.get(code.sku);
    if (bucket === undefined) {
      order.push(code.sku);
      buckets.set(code.sku, [code]);
    } else {
      bucket.push(code);
    }
  }

  return order.map(sku => ({ sku, codes: buckets.get(sku) ?? [] }));
}

export interface InboundTotals {
  /** Tổng đơn vị thực tế: tem = 1, hộp = số lượng đã kiểm đếm. */
  readonly totalScanned: number;
  /** *SỐ SKU* ở ảnh 20, 21. */
  readonly skuCount: number;
}

export function totals(draft: InboundDraft): InboundTotals {
  return {
    totalScanned: draft.codes.reduce(
      (total, code) => total + (code.quantity ?? 1),
      0,
    ),
    skuCount: groupBySku(draft.codes).length,
  };
}

// ---------------------------------------------------------------------------
// Bước 3 — kiểm tra
// ---------------------------------------------------------------------------

/**
 * Đủ điều kiện ghi nhận chưa.
 *
 * Ảnh 20 khi chưa có mã: banner cam *"Chưa có mã quét — Quay lại màn camera để
 * quét ít nhất 1 sản phẩm trước khi ghi nhận nhập."* và nút ghi nhận **mờ**.
 */
export function canRecord(draft: InboundDraft): boolean {
  return draft.codes.length > 0;
}

/** Nguyên văn banner cảnh báo ở ảnh 20. */
export const MESSAGE_NO_CODE_TITLE = 'Chưa có mã quét';
export const MESSAGE_NO_CODE_BODY =
  'Quay lại màn camera để quét ít nhất 1 sản phẩm trước khi ghi nhận nhập.';

/** Nguyên văn banner giải thích ở ảnh 20. */
export const MESSAGE_POST_ONLY_TITLE = 'Chỉ Post Receipt mới tăng tồn';
export const MESSAGE_POST_ONLY_BODY =
  'Danh sách dưới đây đang là dữ liệu quét tạm. Bấm Ghi nhận nhập để tạo phiếu WMS, lưu evidence và chuyển sang chờ duyệt.';

/** Nguyên văn banner ở ảnh 24, sau khi ghi nhận. */
export const MESSAGE_NOT_POSTED_TITLE = 'Chưa tăng tồn kho';
export const MESSAGE_NOT_POSTED_BODY =
  'Bước này chỉ tạo phiếu WMS và lưu scan evidence. Tồn kho chỉ tăng sau khi duyệt/Post Receipt.';

// ---------------------------------------------------------------------------
// Payload đưa vào hàng đợi
// ---------------------------------------------------------------------------

/** Loại bản ghi trong outbox. */
export const INBOUND_OUTBOX_KIND = 'INBOUND_RECEIPT_DRAFT';

export interface InboundOutboxPayload {
  readonly name: string;
  /**
   * Kho nhận. `undefined` là **bất thường** — `continueToScan` đã chặn từ bước
   * 1 — nhưng vẫn để tuỳ chọn ở đây vì bản ghi trong hàng đợi có thể do phiên
   * bản app cũ ghi ra, trước khi trường này tồn tại. Bộ gửi phải tự xử lý.
   */
  readonly warehouseId?: string;
  readonly codes: readonly {
    readonly raw: string;
    readonly sku?: string;
    readonly itemId?: string;
    readonly item?: string;
    readonly itemType?: InboundItemType;
    readonly quantity?: number;
    readonly boxNumber?: string;
    readonly source?: ScanSource;
    readonly at: number;
  }[];
}

/**
 * Dựng payload để đưa vào hàng đợi.
 *
 * ⚠️ **Không** tự sinh `Idempotency-Key` ở đây. Khoá đó do `outbox.enqueue` sinh
 * một lần lúc tạo bản ghi và giữ nguyên qua mọi lần gửi lại — quy tắc người dùng
 * chốt 2026-09-05. Sinh thêm ở đây là tạo hai khoá cho cùng một phiếu.
 */
export function toOutboxPayload(draft: InboundDraft): InboundOutboxPayload {
  return {
    name: draft.name.trim(),
    warehouseId: draft.warehouseId,
    codes: draft.codes.map(code => ({
      raw: code.raw,
      sku: code.sku,
      itemId: code.itemId,
      item: code.item,
      itemType: code.itemType,
      quantity: code.quantity,
      boxNumber: code.boxNumber,
      source: code.source,
      at: code.at,
    })),
  };
}
