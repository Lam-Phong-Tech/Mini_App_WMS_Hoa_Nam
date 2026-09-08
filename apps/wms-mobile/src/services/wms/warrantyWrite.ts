/**
 * Tầng **GHI** của luồng bảo hành — đúng bốn thao tác, không hơn.
 *
 * 🔓 `GATE_WMS §2i` (2026-09-06) — **G, H, I, J**.
 * 🔴 **K (`DELETE warranty-attachments/{id}`) KHÔNG được duyệt.**
 *
 * ## Khác hẳn nhập/xuất kho ở hai điểm
 *
 * 1. **Không có lệnh đổi tồn kho.** Bảo hành là workflow trạng thái từng hồ sơ.
 *    Vì vậy **không** thao tác nào ở đây cần preflight tier — cái đó dành riêng
 *    cho `post-receipt` và `post-issue`.
 * 2. **Chạm dữ liệu cá nhân khách hàng**: tên, số điện thoại, địa chỉ, và ảnh
 *    hiện trạng sản phẩm. Năm thao tác kho hàng chỉ chạm hàng hoá.
 *
 * ## 🔴 Vì sao tệp này KHÔNG có `deleteAttachment()`
 *
 * `DELETE warranty-attachments/{id}` xoá **vĩnh viễn** — không thùng rác, không
 * hoàn tác. Nó cũng sẽ là method `DELETE` đầu tiên trong danh sách trắng.
 *
 * ⚠️ Hệ quả thật, phải nói ra ở giao diện: tải nhầm ảnh lên thì **không gỡ ra
 * được từ app**. Một nút xoá không hoạt động còn tệ hơn không có nút.
 *
 * ## Shape lấy từ đâu
 *
 * `src/services/warranty-flow.service.ts` của Mini App đang chạy — payload
 * chuyển trạng thái ở dòng 299-303, đường dẫn ở 311.
 */

import { AppError } from '../../errors/AppError';
import {
  apiClient,
  type ApiResponse,
  type RequestOptions,
} from '../../api/client';
import { approvedWriteFor } from '../../api/writeGate';
import { normalizeIfMatch } from './inboundWrite';
import type { ApiEnvelope, WarrantyCase } from './types';

export const WARRANTY_WRITE_PATHS = {
  resolveCode: '/api/v1/mini-app/warranty/resolve-code',
  cases: '/api/v1/mini-app/warranty-cases',
} as const;

export function warrantyStatusPath(caseId: string): string {
  return WARRANTY_WRITE_PATHS.cases + '/' + encodeURIComponent(caseId) + '/status';
}

export function warrantyAttachmentsPath(caseId: string): string {
  return (
    WARRANTY_WRITE_PATHS.cases + '/' + encodeURIComponent(caseId) + '/attachments'
  );
}

/** Tải file qua mạng kho có thể rất chậm — video tới 300 MB. */
export const ATTACHMENT_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

export interface WriteClient {
  request<T>(options: RequestOptions): Promise<ApiResponse<T>>;
}

export function assertApprovedWarrantyWrite(
  method: string,
  path: string,
): void {
  if (approvedWriteFor(method, path) === undefined) {
    throw new AppError({
      kind: 'blocked_by_gate',
      message:
        'Thao tác ghi ' +
        method +
        ' "' +
        path +
        '" chưa được duyệt. Luồng bảo hành có resolve-code, tạo hồ sơ, chuyển ' +
        'trạng thái và tải file trong GATE_WMS §2i — XOÁ file thì chưa.',
    });
  }
}

function extractEnvelopeMessage(envelope: unknown): string | undefined {
  if (typeof envelope !== 'object' || envelope === null) {
    return undefined;
  }
  const message = (envelope as { message?: unknown }).message;
  return typeof message === 'string' && message.length > 0 ? message : undefined;
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
  assertApprovedWarrantyWrite('POST', path);

  const response = await client.request<ApiEnvelope<T>>({
    path,
    method: 'POST',
    body,
    headers: extra.headers,
    signal: extra.signal,
    timeoutMs: extra.timeoutMs,
  });

  const envelope = response.data;

  // WMS trả HTTP 200 kèm `success: false` cho lỗi nghiệp vụ — client đang chạy
  // phải tự kiểm (`warranty-flow.service.ts:322`).
  if (envelope?.success === false) {
    throw new AppError({
      kind: 'http',
      status: response.status,
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
// G — resolve-code
// ---------------------------------------------------------------------------

export interface WarrantyResolvedCode {
  readonly item_code?: string;
  readonly item_id?: string;
  readonly sku_code?: string;
  readonly sku_name?: string;
  readonly product_name?: string;
  readonly serial_number?: string;
  /** Mã này có đủ điều kiện bảo hành không. */
  readonly eligible_for_warranty?: boolean;
  readonly eligibility_code?: string;
  /** Luồng WMS khuyến nghị, ví dụ hồ sơ thường hay hồ sơ tạm. */
  readonly recommended_flow?: string;
  readonly warranty_expires_at?: string | null;
}

/**
 * Mã này có mở hồ sơ bảo hành theo sản phẩm đã xác định được không.
 *
 * ⚠️ Thiếu hẳn trường ⇒ **coi là KHÔNG**. Cùng nguyên tắc với luồng xuất: máy
 * chủ chưa nói được thì client không thay nó quyết định.
 *
 * Không đủ điều kiện **không** phải ngõ cụt — người dùng vẫn mở được **hồ sơ
 * tạm** (mất tem/mã). Đó là lý do hàm này chỉ trả `boolean` chứ không ném lỗi.
 */
export function isEligibleForWarranty(
  resolved: WarrantyResolvedCode,
): boolean {
  return resolved.eligible_for_warranty === true;
}

/** 🔓 **G** — hỏi WMS mã bảo hành này là gì. Không tạo gì, không đổi gì. */
export function resolveWarrantyCode(
  rawCode: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
  client: WriteClient = apiClient,
): Promise<WarrantyResolvedCode> {
  return postApproved<WarrantyResolvedCode>(
    WARRANTY_WRITE_PATHS.resolveCode,
    { raw_code: rawCode },
    options,
    client,
  );
}

// ---------------------------------------------------------------------------
// H — tạo hồ sơ
// ---------------------------------------------------------------------------

export interface CreateWarrantyCaseInput {
  /** Có mã: mã sản phẩm đã resolve. */
  readonly itemCode?: string;
  /** Mất mã: lý do và mô tả sản phẩm tự khai — thay cho `itemCode`. */
  readonly missingCodeReason?: string;
  readonly manualProductDescription?: string;

  readonly customerName: string;
  readonly customerPhone: string;
  /** Địa chỉ **đã ghép**: số nhà, phường/xã, tỉnh/thành. */
  readonly customerAddress: string;

  readonly description: string;
  readonly defectIds: readonly string[];
  readonly accessoriesReceived?: string;
  readonly receivedCondition?: string;
}

/**
 * 🔓 **H** — tạo hồ sơ bảo hành.
 *
 * ## 🐞 Một lỗi của Mini App KHÔNG được port sang
 *
 * Người dùng chỉ ra (2026-09-06): *"Trong luồng 'mất mã',
 * `accessories_received` và `received_condition` hiện không được đưa vào payload
 * cuối cùng do hàm chuẩn hoá payload chỉ giữ chúng ở nhánh có `item_code`."*
 *
 * Hàm này gửi hai trường đó ở **cả hai** nhánh. Hồ sơ tạm chính là loại hồ sơ
 * hay có tranh chấp nhất — mất thông tin phụ kiện nhận kèm ở đúng đó là mất nó
 * ở chỗ cần nhất.
 *
 * ## `idempotencyKey` truyền vào, không tự sinh
 *
 * Cùng quy tắc người dùng chốt 2026-09-05. Ở đây hậu quả cụ thể là **hai hồ sơ
 * bảo hành cho cùng một sản phẩm** — và khách sẽ được gọi hai lần.
 */
export async function createWarrantyCase(
  input: CreateWarrantyCaseInput,
  idempotencyKey: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
  client: WriteClient = apiClient,
): Promise<WarrantyCase> {
  if (idempotencyKey.trim() === '') {
    throw new AppError({
      kind: 'config',
      message:
        'Thiếu Idempotency-Key cho tạo hồ sơ bảo hành. Gửi trùng sẽ tạo hai ' +
        'hồ sơ cho cùng một sản phẩm.',
    });
  }
  const hasCode = (input.itemCode ?? '').trim() !== '';
  const hasManual = (input.manualProductDescription ?? '').trim() !== '';
  if (!hasCode && !hasManual) {
    throw new AppError({
      kind: 'config',
      message:
        'Hồ sơ phải có mã sản phẩm, hoặc mô tả sản phẩm nếu mất tem/mã.',
    });
  }
  if (input.customerName.trim() === '' || input.description.trim() === '') {
    throw new AppError({
      kind: 'config',
      message: 'Hồ sơ thiếu tên khách hàng hoặc mô tả yêu cầu.',
    });
  }

  const body = {
    ...(hasCode
      ? { item_code: input.itemCode }
      : {
          missing_code_reason: input.missingCodeReason,
          manual_product_description: input.manualProductDescription,
        }),
    customer_name: input.customerName.trim(),
    customer_phone: input.customerPhone.trim(),
    customer_address: input.customerAddress.trim(),
    description: input.description.trim(),
    // Rỗng thì **bỏ hẳn khoá**, không gửi `[]`. Mini App gốc làm đúng vậy
    // (`warranty-flow.service.ts:497`); `[]` có thể rơi vào luật `min:1` phía
    // máy chủ trong khi vắng mặt thì lọt qua `nullable`.
    ...(input.defectIds.length === 0 ? {} : { defect_ids: input.defectIds }),
    // 🐞 Gửi ở CẢ HAI nhánh — xem chú thích trên.
    ...(input.accessoriesReceived === undefined ||
    input.accessoriesReceived.trim() === ''
      ? {}
      : { accessories_received: input.accessoriesReceived.trim() }),
    ...(input.receivedCondition === undefined ||
    input.receivedCondition.trim() === ''
      ? {}
      : { received_condition: input.receivedCondition.trim() }),
  };

  return postApproved<WarrantyCase>(
    WARRANTY_WRITE_PATHS.cases,
    body,
    { ...options, headers: { 'Idempotency-Key': idempotencyKey } },
    client,
  );
}

// ---------------------------------------------------------------------------
// I — chuyển trạng thái
// ---------------------------------------------------------------------------

export interface UpdateWarrantyStatusInput {
  readonly caseId: string;
  readonly status: string;
  /** Phiên bản hồ sơ, cho `If-Match`. **Bắt buộc.** */
  readonly version: string | number;
  readonly note?: string;
  /** *Kết quả kiểm tra* — trường KHÁC với `note`. */
  readonly confirmedDefect?: string;
}

/**
 * 🔓 **I** — chuyển trạng thái hồ sơ.
 *
 * Dùng `If-Match` dù **không** đụng tồn kho: hai người cùng mở một hồ sơ là
 * chuyện thường, và ghi đè *Kết quả kiểm tra* của nhau thì mất hẳn phần hồ sơ
 * kỹ thuật — thứ không dựng lại được.
 *
 * ⚠️ Client đang chạy gọi `generateClientScanId()` cho `Idempotency-Key`
 * (`warranty-flow.service.ts:318`) — khoá mới mỗi lần thử lại, đúng thứ người
 * dùng cấm. Khoá ở đây do bên gọi truyền vào.
 */
export async function updateWarrantyStatus(
  input: UpdateWarrantyStatusInput,
  idempotencyKey: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
  client: WriteClient = apiClient,
): Promise<WarrantyCase> {
  if (input.caseId.trim() === '' || input.status.trim() === '') {
    throw new AppError({
      kind: 'config',
      message: 'Thiếu mã hồ sơ hoặc trạng thái đích.',
    });
  }
  if (idempotencyKey.trim() === '') {
    throw new AppError({
      kind: 'config',
      message: 'Thiếu Idempotency-Key cho chuyển trạng thái hồ sơ bảo hành.',
    });
  }

  const ifMatch = normalizeIfMatch(input.version);
  if (ifMatch === undefined) {
    throw new AppError({
      kind: 'config',
      message:
        'Không lấy được phiên bản hồ sơ "' +
        input.caseId +
        '". Mở lại hồ sơ rồi thử lại — gửi thiếu phiên bản có thể ghi đè cập ' +
        'nhật của người khác.',
    });
  }

  return postApproved<WarrantyCase>(
    warrantyStatusPath(input.caseId),
    {
      status: input.status,
      // Trường rỗng bỏ hẳn, không gửi chuỗi rỗng — máy chủ phân biệt "không
      // gửi" với "gửi rỗng", và cái sau có thể xoá mất ghi chú đã có.
      ...(input.note === undefined || input.note.trim() === ''
        ? {}
        : { note: input.note.trim() }),
      ...(input.confirmedDefect === undefined ||
      input.confirmedDefect.trim() === ''
        ? {}
        : { confirmed_defect: input.confirmedDefect.trim() }),
    },
    {
      ...options,
      headers: {
        'Idempotency-Key': idempotencyKey,
        'If-Match': ifMatch,
      },
    },
    client,
  );
}

// ---------------------------------------------------------------------------
// J — tải file đính kèm
// ---------------------------------------------------------------------------

/** Bốn nhóm file, đúng như mô tả luồng bảo hành. */
export const ATTACHMENT_TYPES = [
  { value: 'INTAKE', label: 'Lúc tiếp nhận' },
  { value: 'DIAGNOSTIC', label: 'Kiểm tra/chẩn đoán' },
  { value: 'RETURN', label: 'Bàn giao/trả khách' },
  { value: 'OTHER', label: 'Khác' },
] as const;

export interface AttachmentFile {
  readonly uri: string;
  readonly name: string;
  readonly type: string;
  /**
   * Bản web giữ File/Blob gốc để `FormData` gửi đúng bytes. Android chỉ dùng
   * `{ uri, name, type }`, nên trường này luôn không có trên APK.
   */
  readonly blob?: Blob;
}

/**
 * 🔓 **J** — tải một file đính kèm lên hồ sơ.
 *
 * ## ⚠️ Chưa có đường CHỌN file trong app
 *
 * Dự án **không có** thư viện chọn ảnh/video, và `GATE_01 §11` #2 cấm tôi tự
 * thêm module native của bên thứ ba. Hàm này nhận một mô tả file đã có sẵn và
 * gửi đi được — nhưng nối nó với một nút *"Chọn ảnh"* thật thì cần duyệt thêm
 * một module native. Đã ghi vào `USER-ACTION-REQUIRED.md`.
 *
 * Viết sẵn tầng này chứ không đợi: nó kiểm chứng được bằng test, và khi có
 * module chọn file thì chỉ còn nối dây.
 *
 * ## Vì sao KHÔNG có `Idempotency-Key`
 *
 * Spec không khai header này cho endpoint tải file, và `writeGate` sẽ chặn.
 * Hệ quả cần biết: **gửi trùng sẽ tạo hai bản ghi file**. Bên gọi phải chống
 * bấm hai lần ở giao diện, vì ở đây không có gì đỡ.
 */
export async function uploadWarrantyAttachment(
  caseId: string,
  file: AttachmentFile,
  attachmentType: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
  client: WriteClient = apiClient,
): Promise<unknown> {
  if (caseId.trim() === '') {
    throw new AppError({ kind: 'config', message: 'Thiếu mã hồ sơ.' });
  }
  if (file.uri.trim() === '' || file.name.trim() === '') {
    throw new AppError({
      kind: 'config',
      message: 'Thiếu đường dẫn hoặc tên file.',
    });
  }

  const form = new FormData();
  if (file.blob !== undefined) {
    // Browser không hiểu object URI của React Native; phải đưa File/Blob thật
    // vào FormData để request có nội dung tệp thay vì chuỗi "[object Object]".
    (form.append as unknown as (
      name: string,
      value: Blob,
      fileName?: string,
    ) => void)('file', file.blob, file.name);
  } else {
    // React Native nhận `{uri, name, type}` cho phần file, khác chuẩn web.
    form.append('file', file as unknown as Blob);
  }
  form.append('attachment_type', attachmentType);

  return postApproved<unknown>(
    warrantyAttachmentsPath(caseId),
    form,
    {
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? ATTACHMENT_UPLOAD_TIMEOUT_MS,
    },
    client,
  );
}
