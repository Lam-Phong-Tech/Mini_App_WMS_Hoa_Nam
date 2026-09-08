/**
 * Kiểu dữ liệu WMS — **suy từ phản hồi THẬT**, không suy từ spec.
 *
 * Vì sao không lấy thẳng từ OpenAPI: spec `WMS_HoaNam API v2.0.0` **thiếu trường**
 * so với API thật. Ba trường `create_idempotency_key`, `retention_until`,
 * `legal_hold_flag` được server trả về nhưng spec nhắc **0 lần**
 * ([03-api-contract-delta.md §4f.3](../../../../../docs/migration/03-api-contract-delta.md)).
 * Sinh types chỉ từ spec sẽ mất chúng.
 *
 * Nguồn: contract test có token ngày 2026-09-05 (§4e, §4f) — người dùng tự chạy.
 */

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

/**
 * Envelope thành công có **hai biến thể**, đo thật (§4e.3):
 *
 * ```
 * có phân trang    → { data, links, meta, success }
 * không phân trang → { data, meta, success }
 * ```
 *
 * Khác với `/public/config` (không token) vốn trả thêm `message`, `error_code`,
 * `errors` bằng `null`. Vì vậy mọi trường ngoài `data` đều để tuỳ chọn.
 */
export interface ApiEnvelope<T> {
  readonly success?: boolean;
  readonly data: T;
  readonly links?: ApiLinks;
  readonly meta?: ApiMeta;
}

export interface ApiLinks {
  readonly first?: string | null;
  readonly last?: string | null;
  readonly prev?: string | null;
  readonly next?: string | null;
}

export interface ApiMeta {
  readonly current_page?: number;
  readonly per_page?: number;
  readonly total?: number;
  readonly last_page?: number;
  /** Có ở **mọi** phản hồi. Dùng khi báo lỗi cho bộ phận hỗ trợ. */
  readonly request_id?: string;
  /** ISO 8601 +07:00. Nguồn thời gian duy nhất — xem `auth/serverClock.ts`. */
  readonly timestamp?: string;
}

/** Một trang dữ liệu đã bóc khỏi envelope. */
export interface Page<T> {
  readonly items: readonly T[];
  readonly meta?: ApiMeta;
  readonly links?: ApiLinks;
}

// ---------------------------------------------------------------------------
// Trường dùng chung
// ---------------------------------------------------------------------------

/**
 * Khoá optimistic locking. Đo thật: có ở **cả list lẫn detail** của cả ba loại
 * tài liệu (§4f.1).
 *
 * 🔓 Từ `GATE_WMS §2f` (2026-09-06), giá trị này **được gửi** qua `If-Match` —
 * nhưng chỉ cho đúng một thao tác: `post-receipt`. Mọi nơi khác vẫn cấm, và
 * `api/client.ts` cưỡng chế điều đó.
 *
 * ⚠️ Mục 12 Gate WMS vẫn chưa đóng hẳn: chưa ai xác nhận server chấp nhận định
 * dạng nào. Sai thì nhận `412` và hàng đợi xếp vào `conflict` — không ghi đè.
 */
export interface Versioned {
  readonly version?: number;
}

/**
 * 🔴 Tiến độ do **máy chủ tính**, client **không được** cộng lại (§4f.6).
 *
 * Hai nguồn sự thật cho cùng một con số là lỗi chờ xảy ra: thủ kho thấy app báo
 * 7/8 trong khi WMS báo 8/8 thì không biết tin ai.
 */
export interface ServerProgress {
  readonly expected_total_qty?: number;
  readonly scanned_total_qty?: number;
  readonly remaining_qty?: number;
  readonly progress_percent?: number;
}

// ---------------------------------------------------------------------------
// Tài liệu nhập / xuất
// ---------------------------------------------------------------------------

/**
 * Phiếu nhập kho.
 *
 * `id` là **UUID chuỗi**, không phải số (§4f.7) — ví dụ đo được:
 * `c725221e-b87e-41b7-a81a-ffbd9b859ab3`.
 */
export interface InboundDocument extends Versioned, ServerProgress {
  readonly id: string;
  readonly doc_no?: string;
  readonly doc_date?: string;
  readonly doc_type?: string;
  /**
   * ⚠️ **Tách riêng** khỏi `status` canonical (§4f.6). Hai trường khác nhau:
   * `status` là trạng thái WMS, `mini_app_status` là trạng thái Mini App thấy.
   * Trộn hai cái là hiển thị sai trạng thái phiếu.
   */
  readonly status?: string;
  readonly mini_app_status?: string;
  /** Máy chủ tính. Client chỉ hiển thị. */
  readonly ready_for_post?: boolean;
  readonly note?: string | null;
  readonly source_name?: string | null;
  readonly source_reference?: string | null;
  readonly src_warehouse_id?: string | null;
  readonly dst_warehouse_id?: string | null;
  /** Server **lưu** idempotency key lên chính tài liệu. Spec không khai (§4f.3). */
  readonly create_idempotency_key?: string | null;
  /** Thời điểm WMS nhận và đưa phiếu vào hàng chờ duyệt. */
  readonly submitted_at?: string;
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly posted_at?: string | null;
  readonly lines?: readonly DocumentLine[];
  /** ⚠️ CHỈ có ở **chi tiết**, không có ở danh sách (§4f.5). */
  readonly status_history?: readonly unknown[];
}

/** Phiếu xuất kho. Khác phiếu nhập ở `ready_for_issue` và các trường người nhận. */
export interface OutboundDocument extends Versioned, ServerProgress {
  readonly id: string;
  readonly doc_no?: string;
  readonly status?: string;
  readonly mini_app_status?: string;
  readonly ready_for_issue?: boolean;
  readonly required_total_qty?: number;
  readonly full_scan?: boolean;
  readonly rfid_required?: boolean;
  readonly recipient_name?: string | null;
  readonly recipient_phone_snapshot?: string | null;
  readonly recipient_address_snapshot?: string | null;
  readonly recipient_type?: string | null;
  readonly note?: string | null;
  readonly create_idempotency_key?: string | null;
  /** Thời điểm WMS nhận và đưa phiếu vào hàng chờ duyệt. */
  readonly submitted_at?: string;
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly lines?: readonly DocumentLine[];
  /** ⚠️ CHỈ có ở chi tiết (§4f.5). */
  readonly status_history?: readonly unknown[];
  readonly item_matches?: readonly unknown[];
  readonly movements?: readonly unknown[];
}

// ---------------------------------------------------------------------------
// Bảo hành
// ---------------------------------------------------------------------------

/**
 * 🔴 Hồ sơ bảo hành **KHÔNG có trường `id`** (§4f.4).
 *
 * Nó dùng `warranty_case_id` + `warranty_case_code`. Đây là lý do không viết
 * được hàm `getId(record)` dùng chung cho ba loại tài liệu, và là lý do script
 * dò dữ liệu ngày 2026-09-05 không mở được chi tiết bảo hành.
 */
export interface WarrantyCase extends Versioned {
  readonly warranty_case_id: string;
  readonly warranty_case_code?: string;
  readonly status?: string;
  readonly sku_code?: string | null;
  readonly sku_name?: string | null;
  readonly manual_product_description?: string | null;
  /**
   * PII. **Máy chủ tự che theo quyền** — thủ kho không có `warranty.pii.view`
   * nên nhận `H*** V*** N***` (§4i.3, và ảnh 40 vs khảo sát ảnh cùng màn).
   * Client **không** tự che, cũng **không** giả định đã che.
   */
  readonly customer_name?: string | null;
  readonly customer_phone?: string | null;
  readonly customer_address?: string | null;
  /** Nội dung khách báo / yêu cầu bảo hành. */
  readonly description?: string | null;
  /** `true` khi máy chủ đã che PII cho vai hiện tại. */
  readonly pii_masked?: boolean;
  /** Spec nhắc 0 lần. Hạn máy chủ giữ hồ sơ; **gần như luôn NULL** (§4i.2). */
  readonly retention_until?: string | null;
  /** Spec nhắc 0 lần. Không endpoint nào set được — ops sửa tay. App chỉ đọc. */
  readonly legal_hold_flag?: boolean | null;
  readonly received_at?: string | null;
  readonly closed_at?: string | null;
  readonly reported_defect?: string | null;
  readonly confirmed_defect?: string | null;
  readonly accessories_received?: string | null;
  readonly received_condition?: string | null;
  readonly defects?: readonly unknown[];
  readonly created_at?: string;
  readonly updated_at?: string;
}

/**
 * Giá trị đánh dấu hồ sơ đã bị ẩn danh sau khi hết hạn lưu trữ.
 *
 * BA xác nhận 2026-09-06: **API chưa có cờ `pii_anonymized`**, nên app chỉ nhận
 * ra qua chính giá trị này (§4k.3).
 */
export const ANONYMIZED_MARKER = '[ANONYMIZED]';

export function isAnonymized(value: string | null | undefined): boolean {
  return value === ANONYMIZED_MARKER;
}

// ---------------------------------------------------------------------------
// Khác
// ---------------------------------------------------------------------------

/**
 * Một mã đã quét trong phiếu.
 *
 * Nguồn: `scan-entries` của luồng **nhập** (`receipt-flow.service.ts:552`), và
 * `item_matches` / `matches` của luồng **xuất**
 * (`pages/OutboundDocumentDetailPage/index.tsx:359-361`).
 *
 * ⚠️ Hai luồng phơi dữ liệu này ở **hai chỗ khác nhau** — nhập có endpoint
 * riêng, xuất nhét sẵn trong chi tiết. Không gộp thành một đường gọi: gộp thì
 * một trong hai luồng sẽ phải gọi một endpoint không tồn tại.
 */
export interface ScanEntry {
  readonly id?: string;
  readonly line_id?: string;
  readonly raw_code?: string;
  readonly code_value?: string;
  readonly item_unique?: string;
  readonly serial_number?: string;
  readonly sku_code?: string;
  readonly sku_name?: string;
  readonly scan_source?: string;
  readonly scanned_at?: string;
  readonly created_at?: string;
  readonly status?: string;
}

/** Một dòng sản phẩm trong phiếu. */
export interface DocumentLine {
  readonly id?: string;
  readonly line_id?: string;
  readonly sku_code?: string;
  readonly sku_name?: string;
  readonly product_name?: string;
  readonly qty_planned?: number;
  readonly qty_scanned?: number;
}

export interface Warehouse {
  readonly id: string;
  readonly code?: string;
  readonly name?: string;
  readonly status?: string;
}

export interface CurrentUser {
  readonly id?: string;
  readonly name?: string;
  readonly email?: string;
  /** Ảnh đại diện có thể được `auth/me` trả về cho tài khoản Mini App. */
  readonly avatar_url?: string;
  readonly role?: string;
  readonly permissions?: readonly string[];
}
