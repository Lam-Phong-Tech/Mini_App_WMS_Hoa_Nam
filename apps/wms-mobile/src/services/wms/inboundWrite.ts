/**
 * Tầng **GHI** của luồng nhập kho — đúng ba thao tác, không hơn.
 *
 * 🔓 `GATE_WMS §2e` (2026-09-06) — **A** (`resolve-code`) và **B** (`record`).
 * 🔓 `GATE_WMS §2f` (2026-09-06) — **C** (`post-receipt`), sau khi hạ tầng cung
 * cấp bằng chứng tách tier và mục 3 Gate WMS đóng.
 *
 * ## 🔴 C là thao tác không hoàn tác được
 *
 * `post-receipt` **tăng tồn kho thật**. Bấm nhầm không sửa được bằng cách bấm
 * lại — phải có nghiệp vụ đảo phiếu trên WMS. Vì vậy nó là thao tác duy nhất ở
 * đây phải qua **preflight tier** ngay trước khi gửi.
 *
 * ## Bốn lớp chặn, độc lập nhau
 *
 * | Lớp | Ở đâu | Chặn gì |
 * |:--:|---|---|
 * | 1 | `services/wms/tierCheck.ts` | đang nói chuyện với **sai stack** |
 * | 2 | `api/client.ts` | mọi method khác GET/HEAD, trừ danh sách trắng |
 * | 3 | `api/writeGate.ts` | danh sách trắng theo cặp `METHOD` + đường dẫn |
 * | 4 | tệp này — `assertApprovedWrite` | chốt ngay tại nơi tầng nghiệp vụ gọi |
 *
 * Lớp 4 trông thừa, và đó là chủ đích: nó nằm **cạnh chỗ viết màn hình**, nên
 * người sửa `features/inbound/` đọc được lệnh cấm mà không phải mở `api/`.
 *
 * Lớp 1 khác hẳn ba lớp kia: ba lớp dưới hỏi *"thao tác này có được phép
 * không"*, còn nó hỏi *"ta đang nói chuyện với ai"*. Một câu hỏi về quyền, một
 * câu hỏi về sự thật — và chỉ máy chủ trả lời được câu thứ hai.
 *
 * ## Shape lấy từ đâu
 *
 * Không đoán. Toàn bộ tên trường dưới đây đọc từ **mã nguồn Mini App đang chạy
 * thật**: `src/services/receipt-flow.service.ts` — `WmsClassifyData` (dòng 109)
 * và `submitLocalReceiptViaMiniAppRecord` (dòng 679). Đó là client duy nhất
 * hiện gọi được hai endpoint này, nên nó đáng tin hơn cả bản spec.
 *
 * ⚠️ Response của `record` thì **chính Mini App cũ cũng khai là `unknown`**
 * (dòng 704). Nên `RecordedDocument` dưới đây để **mọi trường tuỳ chọn** và
 * không hàm nào bắt buộc phải có chúng. Đo được rồi mới siết.
 */

import {
  AppError,
  extractErrorCode,
  extractRequestId,
} from '../../errors/AppError';
import {
  apiClient,
  type ApiResponse,
  type RequestOptions,
} from '../../api/client';
import { approvedWriteFor } from '../../api/writeGate';
import type { ApiEnvelope } from './types';
import { requireTierForWrite } from './tierCheck';

/** Hai đường dẫn được duyệt. Gom một chỗ để đối chiếu với `03-api-mapping.md`. */
export const INBOUND_WRITE_PATHS = {
  resolveCode: '/api/v1/mini-app/inbound/resolve-code',
  record: '/api/v1/mini-app/inbound/record',
} as const;

/**
 * `record` chạy **cả lô trong một transaction** — validate toàn bộ, group theo
 * SKU, tạo receipt + lines + toàn bộ scan evidence. Một phiếu 200 mã mất lâu
 * hơn hẳn một phép đọc, nên timeout mặc định của môi trường là quá ngắn.
 *
 * Con số 30 giây lấy đúng từ Mini App đang chạy thật
 * (`receipt-flow.service.ts:711`), không phải tôi tự chọn.
 */
export const RECORD_TIMEOUT_MS = 30_000;

/**
 * Chỉ phần `request` của API client, tiêm được để test không cần mạng.
 *
 * Không thu hẹp thành một hàm `post` riêng: `assertApprovedWrite` mới là chốt,
 * và nó xét cả method — hẹp kiểu ở đây nữa chỉ làm khó test mà không thêm an
 * toàn.
 */
export interface WriteClient {
  request<T>(options: RequestOptions): Promise<ApiResponse<T>>;
}

/**
 * Chốt lớp 3: thao tác này có nằm trong danh sách `§2e` không.
 *
 * Thông báo cố ý nêu **tên endpoint và số hiệu Change Control**, để người gặp
 * lỗi biết phải xin duyệt cái gì chứ không chỉ biết là "bị chặn".
 */
export function assertApprovedWrite(method: string, path: string): void {
  if (approvedWriteFor(method, path) === undefined) {
    throw new AppError({
      kind: 'blocked_by_gate',
      message:
        'Thao tác ghi ' +
        method +
        ' "' +
        path +
        '" chưa được duyệt. Chỉ resolve-code và record nằm trong ' +
        'GATE_WMS §2e; post-receipt thì chưa.',
    });
  }
}

function extractEnvelopeMessage(envelope: unknown): string | undefined {
  if (typeof envelope !== 'object' || envelope === null) {
    return undefined;
  }
  const message = (envelope as { message?: unknown }).message;
  return typeof message === 'string' && message.length > 0
    ? message
    : undefined;
}

async function postApproved<T>(
  path: string,
  body: unknown,
  extra: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
  client: WriteClient,
): Promise<T> {
  assertApprovedWrite('POST', path);

  const response = await client.request<ApiEnvelope<T>>({
    path,
    method: 'POST',
    body,
    headers: extra.headers,
    signal: extra.signal,
    timeoutMs: extra.timeoutMs,
  });

  const envelope = response.data;

  // WMS trả HTTP 200 kèm `success: false` cho lỗi nghiệp vụ — đúng hành vi mà
  // Mini App cũ phải tự kiểm (`receipt-flow.service.ts:1078` và `:714`). Không
  // kiểm thì một phiếu bị từ chối sẽ hiện ra như đã ghi nhận thành công.
  if (envelope?.success === false) {
    throw new AppError({
      kind: 'http',
      status: response.status,
      code: extractErrorCode(envelope),
      route: path,
      requestId:
        response.header?.('x-request-id') ?? extractRequestId(envelope),
      message: extractEnvelopeMessage(envelope) ?? 'Máy chủ từ chối yêu cầu.',
    });
  }

  if (envelope === undefined || envelope === null || !('data' in envelope)) {
    throw new AppError({
      kind: 'parse',
      message: 'Phản hồi không có trường "data".',
      status: response.status,
    });
  }

  return envelope.data;
}

// ---------------------------------------------------------------------------
// A — resolve-code
// ---------------------------------------------------------------------------

/**
 * Kết quả resolve một mã quét.
 *
 * Mọi trường đều **tuỳ chọn trừ `raw_code`**: đó đúng là điều `WmsClassifyData`
 * ở Mini App khai, và nó phản ánh thực tế — một mã chưa có trong WMS thì hầu
 * hết các trường này rỗng.
 */
export interface ResolvedCode {
  readonly raw_code: string;
  readonly classification?: string;
  /** Phân biệt "mã của vật đã có trong WMS" với "vật hoàn toàn mới". */
  readonly resolution_status?: string;
  /** Dạng evidence WMS vừa resolve; mã hộp hợp lệ phải là `BOX`. */
  readonly item_type?: 'ITEM' | 'BOX' | string;
  /** Hộp linh kiện luôn cần thủ kho nhập số lượng kiểm đếm. */
  readonly requires_quantity?: boolean;
  /** Mã hộp và số thứ tự canon do WMS tách từ `raw_code`. */
  readonly box_code?: string | null;
  readonly box_number?: string | number | null;
  /**
   * Một số bản WMS trả trạng thái danh mục SKU ngay khi resolve mã hộp.
   * Các trường này là thông tin để chặn sớm, không được gửi lại ở record.
   */
  readonly sku_status?: string | null;
  readonly sku_active?: boolean | null;
  readonly is_sku_active?: boolean | null;
  readonly item_id?: string | null;
  readonly sku_id?: string | null;
  readonly product_id?: string | null;
  readonly sku_code?: string | null;
  readonly sku_name?: string | null;
  readonly product_name?: string | null;
  readonly name?: string | null;
  readonly item_unique?: string | null;
  readonly serial_number?: string | null;
  readonly normalized_code_value?: string | null;
  readonly stock_status?: string;
  readonly object_status?: string;
  readonly current_location?: {
    readonly warehouse_id?: string;
    readonly warehouse_code?: string;
    readonly warehouse_name?: string;
  };
}

/**
 * Ba trạng thái nghĩa là "mã này chưa có trong WMS, nhập sẽ tạo mới".
 *
 * Lấy nguyên từ `isInboundNewItemCandidate` (`receipt-flow.service.ts:1126`).
 * Không rút gọn thành so sánh tiền tố `NEW_`: tập giá trị đầy đủ của enum này
 * chưa ai xác nhận, nên khớp đúng ba chuỗi đã biết là cách an toàn.
 */
export const NEW_ITEM_RESOLUTIONS: readonly string[] = [
  'NEW_ITEM_CANDIDATE',
  'NEW_SKU_CANDIDATE',
  'NEW_PRODUCT_CANDIDATE',
];

export function isNewItemCandidate(resolved: ResolvedCode): boolean {
  return NEW_ITEM_RESOLUTIONS.includes(
    String(resolved.resolution_status ?? '').toUpperCase(),
  );
}

/**
 * Tên hiển thị của mã vừa resolve, theo đúng thứ tự ưu tiên Mini App đang dùng
 * (`getClassifyProductName`). Không có tên nào thì trả `undefined` — bên gọi tự
 * quyết hiện gì, tệp này không bịa chuỗi thay người dùng.
 */
export function resolvedDisplayName(
  resolved: ResolvedCode,
): string | undefined {
  for (const candidate of [
    resolved.sku_name,
    resolved.product_name,
    resolved.name,
  ]) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return undefined;
}

export interface ResolveCodeInput {
  readonly warehouseId: string;
  readonly rawCode: string;
}

/**
 * 🔓 **A** — hỏi WMS xem mã vừa quét là gì.
 *
 * Spec khẳng định thao tác này *"KHÔNG tạo document, KHÔNG tạo scan evidence,
 * KHÔNG tạo movement và KHÔNG đổi tồn"*. Nó là POST chỉ vì cần body.
 *
 * ⚠️ **Không** gửi `Idempotency-Key`: spec không khai header đó cho endpoint
 * này, và nó không tạo ra gì để mà cần chống trùng. `writeGate` cũng sẽ chặn.
 */
export function resolveCode(
  input: ResolveCodeInput,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
  client: WriteClient = apiClient,
): Promise<ResolvedCode> {
  return postApproved<ResolvedCode>(
    INBOUND_WRITE_PATHS.resolveCode,
    { raw_code: input.rawCode, warehouse_id: input.warehouseId },
    options,
    client,
  );
}

// ---------------------------------------------------------------------------
// B — record
// ---------------------------------------------------------------------------

/** Nguồn của một mã: quét bằng camera hay gõ tay. */
export type ScanSource = 'CAMERA' | 'MANUAL';

export interface RecordItem {
  /** Mã **gốc** từ camera, không chuẩn hoá — backend cần đúng mã vật lý. */
  readonly raw_code: string;
  readonly scan_source: ScanSource;
  /**
   * Dạng evidence vật lý mà backend nhận: một hiện vật đơn lẻ hoặc một hộp.
   *
   * Không nhầm trường này với `new_sku_type`: WMS chỉ nhận `ITEM | BOX` ở
   * đây. Lựa chọn “Sản phẩm/Linh kiện” của thủ kho thuộc trường riêng bên
   * dưới. Gửi `PRODUCT | COMPONENT` vào đây sẽ bị WMS từ chối 422.
   */
  readonly item_type?: 'ITEM' | 'BOX';
  /**
   * Phân loại catalog khi một ITEM hoàn toàn mới được tạo tại bước record.
   * Chỉ gửi cho ITEM mới; BOX đã xác định là linh kiện theo contract WMS.
   */
  readonly new_sku_type?: 'PRODUCT' | 'COMPONENT';
  /** SKU đã tách từ mã `BOX-<SKU>-<số>`. */
  readonly sku_code?: string;
  /** Số lượng thực tế trong hộp; tem dán từng món thì mặc định là 1. */
  readonly quantity?: number;
  /** Mã số hộp để lưu evidence/dễ đối soát. */
  readonly box_number?: string;
}

export interface RecordInput {
  readonly name: string;
  readonly dstWarehouseId: string;
  readonly items: readonly RecordItem[];
  /** `YYYY-MM-DD` theo giờ máy. Bỏ trống thì để máy chủ tự quyết. */
  readonly docDate?: string;
  readonly note?: string;
}

/**
 * Phiếu mà máy chủ trả về sau khi ghi nhận.
 *
 * ⚠️ Mọi trường **tuỳ chọn** vì shape chưa ai đo — Mini App cũ khai `unknown`.
 * Bên gọi phải chịu được việc không có trường nào.
 */
export interface RecordedDocument {
  readonly id?: string | number;
  readonly doc_no?: string;
  readonly document_no?: string;
  readonly status?: string;
  readonly version?: string | number;
}

/** Số phiếu để hiện cho thủ kho. WMS dùng lẫn hai tên trường, nên thử cả hai. */
export function recordedDocumentNo(
  document: RecordedDocument,
): string | undefined {
  const value = document.doc_no ?? document.document_no;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * 🔓 **B** — ghi nhận cả lô mã thành một phiếu nhập.
 *
 * Máy chủ *"validate toàn batch, chống duplicate, group theo SKU, tạo receipt +
 * lines + toàn bộ scan evidence trong MỘT DB transaction. Lỗi bất kỳ item nào
 * sẽ rollback toàn bộ."* ⇒ Kết quả chỉ có hai khả năng: cả phiếu vào, hoặc
 * không gì vào. Không có trạng thái nửa vời để phải đối soát.
 *
 * Tồn kho **chưa** đổi ở bước này — phiếu vào trạng thái chờ duyệt.
 *
 * ## `expected_total_qty` tự tính từ evidence
 *
 * Contract bắt buộc trường này, nhưng nó **không phải dữ liệu người dùng nhập**:
 * Tem dán từng món có số lượng 1; riêng evidence `BOX-<SKU>-<số>` mang số
 * lượng thủ kho vừa kiểm đếm. Cho phép truyền một tổng độc lập là mở đường cho
 * hai con số lệch nhau, nên hàm luôn tự cộng `items[].quantity` (mặc định 1).
 *
 * ## `idempotencyKey` là tham số bắt buộc, không tự sinh
 *
 * Người dùng chốt ngày 2026-09-05: *"Không tự tạo Idempotency-Key mới để gửi
 * lại. Khi retry phải dùng lại đúng Idempotency-Key cũ."* Nếu hàm này tự sinh
 * khoá thì mỗi lần gọi lại là một khoá mới — tức là đúng cái bị cấm. Khoá phải
 * đến từ bản ghi outbox, nơi nó sống lâu hơn một lần gọi.
 *
 * ## Vì sao `async` dù thân hàm chỉ `return`
 *
 * Hai lệnh kiểm dưới đây ném lỗi **trước** khi có promise nào. Nếu hàm không
 * `async` thì lỗi đó là **đồng bộ**, và bên gọi viết `record(...).catch(…)` sẽ
 * vỡ thay vì bắt được — một hàm trả `Promise` mà đôi khi ném thẳng là cái bẫy
 * kín đáo. `async` gói mọi lối thoát vào cùng một dạng.
 */
export async function record(
  input: RecordInput,
  idempotencyKey: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
  client: WriteClient = apiClient,
): Promise<RecordedDocument> {
  if (idempotencyKey.trim().length === 0) {
    throw new AppError({
      kind: 'config',
      message:
        'Thiếu Idempotency-Key cho inbound/record. Khoá phải lấy từ bản ghi ' +
        'outbox, không được sinh mới lúc gửi lại.',
    });
  }
  if (input.items.length === 0) {
    throw new AppError({
      kind: 'config',
      message: 'Phiếu nhập không có mã nào. Không gửi phiếu rỗng lên WMS.',
    });
  }

  const expectedTotalQty = input.items.reduce((total, item) => {
    const quantity = item.quantity ?? 1;
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new AppError({
        kind: 'config',
        message: 'Số lượng của từng mã nhập phải là số nguyên lớn hơn 0.',
      });
    }
    return total + quantity;
  }, 0);

  const body = {
    name: input.name,
    dst_warehouse_id: input.dstWarehouseId,
    // Nguồn duy nhất có thẩm quyền là evidence quét + số kiểm đếm hộp.
    expected_total_qty: expectedTotalQty,
    ...(input.docDate === undefined ? {} : { doc_date: input.docDate }),
    ...(input.note === undefined ? {} : { note: input.note }),
    items: input.items.map(item => ({
      raw_code: item.raw_code,
      scan_source: item.scan_source,
      ...(item.item_type === undefined ? {} : { item_type: item.item_type }),
      ...(item.new_sku_type === undefined
        ? {}
        : { new_sku_type: item.new_sku_type }),
      ...(item.sku_code === undefined ? {} : { sku_code: item.sku_code }),
      // BOX bắt buộc có quantity, kể cả khi thực tế trong hộp chỉ có một
      // linh kiện. ITEM đơn lẻ vẫn được phép lược `quantity: 1` theo contract.
      ...(item.quantity === undefined ||
      (item.item_type !== 'BOX' && item.quantity === 1)
        ? {}
        : { quantity: item.quantity }),
      ...(item.box_number === undefined ? {} : { box_number: item.box_number }),
    })),
  };

  return postApproved<RecordedDocument>(
    INBOUND_WRITE_PATHS.record,
    body,
    {
      headers: { 'Idempotency-Key': idempotencyKey },
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? RECORD_TIMEOUT_MS,
    },
    client,
  );
}

// ---------------------------------------------------------------------------
// C — post-receipt
// ---------------------------------------------------------------------------

/**
 * Đường dẫn `post-receipt` cho một phiếu cụ thể.
 *
 * Hàm chứ không phải hằng vì đường này mang `{id}`. Bên gọi không tự ghép chuỗi
 * — ghép sai một dấu `/` là cổng ở `writeGate` từ chối, và lỗi đó sẽ hiện ra
 * như "chưa được duyệt" thay vì "sai đường dẫn".
 */
export function postReceiptPath(documentId: string): string {
  return '/api/v1/mini-app/inbound-documents/' + documentId + '/post-receipt';
}

/** Spec khai 20 giây cho thao tác này (`receipt-flow.service.ts:915`). */
export const POST_RECEIPT_TIMEOUT_MS = 20_000;

/**
 * Chuẩn hoá giá trị `If-Match`.
 *
 * Lấy nguyên cách làm của client đang chạy thật (`normalizeIfMatch`,
 * `receipt-flow.service.ts:1708`): bỏ **mọi** dấu nháy kép rồi cắt khoảng
 * trắng. `ETag` thường về dạng `"7"`, còn `data.version` là số trần — hai nguồn
 * cùng phải ra một chuỗi.
 *
 * ⚠️ Mục 12 Gate WMS chưa đóng: chưa ai xác nhận máy chủ chấp nhận định dạng
 * nào. Đây là cách một client đang chạy được làm, **không phải** cam kết từ
 * phía máy chủ.
 */
export function normalizeIfMatch(
  value: string | number | null | undefined,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = String(value).replace(/"/g, '').trim();
  return text === '' ? undefined : text;
}

export interface PostReceiptInput {
  readonly documentId: string;
  /**
   * Phiên bản phiếu, cho `If-Match`. Lấy từ `ETag` của phản hồi đọc phiếu, hoặc
   * `data.version`. **Bắt buộc** — xem chú thích của `postReceipt`.
   */
  readonly version: string | number;
}

export interface PostedReceipt {
  readonly id?: string | number;
  readonly doc_no?: string;
  readonly document_no?: string;
  readonly status?: string;
  readonly version?: string | number;
}

/**
 * 🔓 **C** — Post Receipt: **tăng tồn kho thật**.
 *
 * 🔒 Change Control `GATE_WMS §2f`, người dùng duyệt 2026-09-06 sau khi hạ tầng
 * cung cấp bằng chứng tách tier. Trước đó thao tác này bị giữ lại.
 *
 * ## Đây là chỗ không hoàn tác được
 *
 * Spec: *"stock mutation cuối của luồng Mini App. Chỉ SCANNING full-scan mới
 * được Post. Sau thành công document=POSTED và tồn kho mới tăng."* Bấm nhầm
 * không sửa được bằng cách bấm lại — phải có nghiệp vụ đảo phiếu trên WMS.
 *
 * ## Ba chốt chặn phải qua hết
 *
 * 1. **Tier** — `requireTierForWrite` gọi lại `/api/v1/health` ngay trước khi
 *    gửi (mục 3 của luồng bắt buộc). Sai tier ⇒ `wrong_environment`, không retry.
 * 2. **Danh sách trắng** — `assertApprovedWrite` khớp theo từng đoạn đường dẫn.
 * 3. **Header** — `api/client.ts` chỉ cho `If-Match` đi qua đúng thao tác này.
 *
 * ## `version` bắt buộc, không có mặc định
 *
 * Client đang chạy thật từ chối duyệt khi không lấy được phiên bản
 * (*"Không lấy được phiên bản phiếu nhập để duyệt"*), nhưng ở nhánh tạo phiếu
 * nó lại rơi về `"1"` khi thiếu (`receipt-flow.service.ts:747`). **Không port
 * cái mặc định đó.** `If-Match: 1` gửi lên một phiếu đã sang version 3 là hoặc
 * bị từ chối, hoặc — tệ hơn — ghi đè mất thay đổi của người khác. Thiếu phiên
 * bản thì dừng lại và nói ra, đó là cả điểm tồn tại của kiểm soát lạc quan.
 *
 * ## `idempotencyKey` truyền vào, không tự sinh
 *
 * ⚠️ Client cũ gọi `generateClientScanId()` **mỗi lần** — tức là mỗi lần thử
 * lại mang một khoá mới, đúng thứ người dùng cấm ngày 2026-09-05. Không sao
 * chép chỗ đó: khoá phải ổn định theo phiếu, đến từ bên gọi.
 */
export async function postReceipt(
  input: PostReceiptInput,
  idempotencyKey: string,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    /** Tiêm để test không cần mạng. */
    ensureTier?: () => Promise<unknown>;
  } = {},
  client: WriteClient = apiClient,
): Promise<PostedReceipt> {
  if (input.documentId.trim() === '') {
    throw new AppError({
      kind: 'config',
      message: 'Thiếu mã phiếu nhập để Post Receipt.',
    });
  }
  if (idempotencyKey.trim().length === 0) {
    throw new AppError({
      kind: 'config',
      message:
        'Thiếu Idempotency-Key cho post-receipt. Khoá phải ổn định theo phiếu, ' +
        'không được sinh mới lúc gửi lại.',
    });
  }

  const ifMatch = normalizeIfMatch(input.version);
  if (ifMatch === undefined) {
    throw new AppError({
      kind: 'config',
      message:
        'Không lấy được phiên bản phiếu "' +
        input.documentId +
        '". Không Post Receipt khi chưa biết phiên bản — xem lại phiếu rồi thử lại.',
    });
  }

  // Bước 3 của luồng bắt buộc: kiểm tier LẠI, ngay trước lệnh tăng tồn.
  const ensureTier = options.ensureTier ?? requireTierForWrite;
  await ensureTier();

  return postApproved<PostedReceipt>(
    postReceiptPath(input.documentId),
    // Spec không khai trường nào cho body; client đang chạy gửi `{}`.
    {},
    {
      headers: {
        'Idempotency-Key': idempotencyKey,
        'If-Match': ifMatch,
      },
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? POST_RECEIPT_TIMEOUT_MS,
    },
    client,
  );
}
