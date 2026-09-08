/**
 * Tầng **GHI** của luồng xuất kho — đúng ba thao tác, không hơn.
 *
 * 🔓 `GATE_WMS §2g` (2026-09-06) — **D** (`resolve-code`) và **E** (`record`).
 * 🔓 `GATE_WMS §2h` (2026-09-06) — **F** (`post-issue`).
 *
 * ## 🔴 `post-issue` là chỗ nguy hiểm nhất trong app
 *
 * Nó **giảm tồn kho thật**, và nguy hơn `post-receipt` không phải vì hậu quả
 * lớn hơn mà vì **khó thấy hơn**: post nhầm phiếu **nhập** thì tồn dư ra và lần
 * đếm nào cũng lộ; post nhầm phiếu **xuất** thì hàng bị trừ khỏi sổ trong khi
 * vẫn nằm trên kệ — sổ và kho lệch nhau im lặng tới kỳ kiểm kê.
 *
 * ## Đối xứng với `inboundWrite.ts`, và chỗ khác biệt
 *
 * Cùng ba lớp chặn, cùng quy tắc idempotency. Khác hai điểm:
 *
 * 1. `resolve-code` của luồng xuất trả thêm **`eligible_for_outbound`** — mã có
 *    tồn tại không **và** có được phép xuất không là hai câu hỏi khác nhau. Một
 *    kiện đang giữ chỗ cho phiếu khác vẫn resolve ra SKU đúng nhưng không được
 *    xuất.
 * 2. Preflight tier **chỉ** gắn vào `post-issue`, không gắn vào hai thao tác
 *    kia. `resolve-code` bị gọi **một lần cho mỗi mã quét** — thêm một request
 *    `/health` cho mỗi mã là nhân đôi lưu lượng ở đúng chỗ mạng kho yếu nhất.
 *    Màn quét đã bị khoá theo tier ở tầng trên, nên không có đường vòng.
 *
 * ## Shape lấy từ đâu
 *
 * Không đoán. Đọc từ `src/services/scan.service.ts` của Mini App đang chạy:
 * `OutboundResolveCodeInput` (dòng 229), `OutboundResolvedCode` (dòng 234),
 * `OutboundRecordBatchInput` (dòng 257).
 */

import { AppError } from '../../errors/AppError';
import {
  apiClient,
  type ApiResponse,
  type RequestOptions,
} from '../../api/client';
import { approvedWriteFor } from '../../api/writeGate';
import type { ApiEnvelope } from './types';
import type { ScanSource } from '../../scanner/scanPayload';
import { normalizeIfMatch } from './inboundWrite';
import { requireTierForWrite } from './tierCheck';

/**
 * Hai đường dẫn cố định. `post-issue` mang `{id}` nên dựng bằng
 * `postIssuePath()` chứ không phải hằng.
 */
export const OUTBOUND_WRITE_PATHS = {
  resolveCode: '/api/v1/mini-app/outbound/resolve-code',
  record: '/api/v1/mini-app/outbound/record',
} as const;

/** Cùng lý do với `inbound/record`: cả lô chạy trong một transaction. */
export const OUTBOUND_RECORD_TIMEOUT_MS = 30_000;

/**
 * `resolve-code` chạy **mỗi lần quét**, nên timeout phải ngắn.
 *
 * Thủ kho cầm máy chờ trước kệ hàng: 8 giây đã là lâu, 20 giây thì họ sẽ nghĩ
 * máy treo và quét lại — sinh ra mã trùng và một lần gọi nữa.
 */
export const OUTBOUND_RESOLVE_TIMEOUT_MS = 8000;

export interface WriteClient {
  request<T>(options: RequestOptions): Promise<ApiResponse<T>>;
}

/**
 * Chốt ngay tại tầng nghiệp vụ: thao tác này có nằm trong danh sách trắng không.
 */
export function assertApprovedOutboundWrite(
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
        '" chưa được duyệt. Luồng xuất chỉ có resolve-code, record và ' +
        'post-issue trong GATE_WMS §2g/§2h — không endpoint nào khác.',
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
  assertApprovedOutboundWrite('POST', path);

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
  // phải tự kiểm (`scan.service.ts:1568`). Bỏ qua thì một phiếu bị từ chối sẽ
  // hiện ra như đã ghi nhận xong.
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
// D — resolve-code
// ---------------------------------------------------------------------------

/**
 * Kết quả resolve một mã xuất.
 *
 * Mọi trường tuỳ chọn — đúng như `OutboundResolvedCode` ở Mini App khai, và
 * phản ánh thực tế: một mã lạ thì hầu hết các trường này rỗng.
 */
export interface OutboundResolvedCode {
  readonly sku_id?: string;
  readonly sku_code?: string;
  readonly sku_name?: string;
  readonly item_id?: string;
  readonly item_unique?: string;
  readonly item_status?: string;
  /**
   * 🔴 Mã này có được phép xuất không.
   *
   * Tách hẳn khỏi "mã có tồn tại không": một kiện **đang giữ chỗ** cho phiếu
   * khác vẫn resolve ra SKU đúng nhưng không được xuất. Coi "resolve thành
   * công" là "xuất được" chính là cách hàng của phiếu này bị lấy nhầm sang
   * phiếu kia.
   */
  readonly eligible_for_outbound?: boolean;
  /** Mã lý do khi không đủ điều kiện — dùng để hiện câu giải thích. */
  readonly eligibility_code?: string;
  readonly available_qty?: number;
  readonly reservation?: {
    readonly doc_no?: string;
    readonly status?: string;
  };
  readonly raw_code?: string;
  readonly code_value?: string;
}

/**
 * Mã này có xuất được không.
 *
 * ⚠️ Thiếu hẳn trường `eligible_for_outbound` ⇒ **coi là KHÔNG được**. Máy chủ
 * chưa nói được thì client không thay nó quyết định — với thao tác lấy hàng ra
 * khỏi kho, "không biết" phải xử như "không được".
 */
export function isEligibleForOutbound(
  resolved: OutboundResolvedCode,
): boolean {
  return resolved.eligible_for_outbound === true;
}

/**
 * Câu giải thích vì sao mã không xuất được, để hiện cho thủ kho.
 *
 * Nêu **số phiếu đang giữ chỗ** khi có: thủ kho cần biết đi hỏi ai, chứ không
 * chỉ biết là "không được".
 */
export function ineligibleReason(resolved: OutboundResolvedCode): string {
  const reservation = resolved.reservation?.doc_no;
  if (reservation !== undefined && reservation !== '') {
    return 'Mã đang giữ chỗ cho phiếu ' + reservation + '.';
  }
  const code = resolved.eligibility_code;
  if (code !== undefined && code !== '') {
    return 'WMS từ chối xuất mã này (' + code + ').';
  }
  if (resolved.item_status !== undefined && resolved.item_status !== '') {
    return 'Mã đang ở trạng thái "' + resolved.item_status + '".';
  }
  return 'WMS chưa xác nhận mã này đủ điều kiện xuất.';
}

/** Tên hiển thị của mã vừa resolve. */
export function outboundDisplayName(
  resolved: OutboundResolvedCode,
): string | undefined {
  for (const candidate of [resolved.sku_name, resolved.sku_code]) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim();
    }
  }
  return undefined;
}

export interface OutboundResolveInput {
  readonly warehouseId: string;
  readonly rawCode: string;
}

/**
 * 🔓 **D** — hỏi WMS mã vừa quét là gì và có xuất được không.
 *
 * Không tạo gì, không đổi tồn. POST chỉ vì cần body.
 *
 * ⚠️ **Không** gửi `Idempotency-Key`: spec không khai header đó cho endpoint
 * này, và `writeGate` cũng sẽ chặn.
 */
export function resolveOutboundCode(
  input: OutboundResolveInput,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
  client: WriteClient = apiClient,
): Promise<OutboundResolvedCode> {
  return postApproved<OutboundResolvedCode>(
    OUTBOUND_WRITE_PATHS.resolveCode,
    { raw_code: input.rawCode, warehouse_id: input.warehouseId },
    {
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? OUTBOUND_RESOLVE_TIMEOUT_MS,
    },
    client,
  );
}

// ---------------------------------------------------------------------------
// E — record
// ---------------------------------------------------------------------------

export interface OutboundRecordItem {
  /** Mã **gốc** từ camera, không chuẩn hoá. */
  readonly raw_code: string;
  readonly scan_source: ScanSource;
}

export interface OutboundRecordInput {
  readonly name: string;
  readonly warehouseId: string;
  readonly recipientName: string;
  /** Địa chỉ **đã ghép**: chi tiết, phường/xã, tỉnh/thành. */
  readonly recipientAddress?: string;
  readonly recipientPhone?: string;
  /** Đã gộp nhóm đối tượng — backend chưa có trường `recipient_type` riêng. */
  readonly note?: string;
  readonly items: readonly OutboundRecordItem[];
}

export interface RecordedOutboundDocument {
  readonly id?: string;
  readonly doc_no?: string;
  readonly document_no?: string;
  readonly status?: string;
  readonly version?: string | number;
}

export function recordedOutboundDocumentNo(
  document: RecordedOutboundDocument,
): string | undefined {
  const value = document.doc_no ?? document.document_no;
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * 🔓 **E** — ghi nhận cả lô mã thành một phiếu xuất.
 *
 * Phiếu vào trạng thái **chờ duyệt**; tồn kho **chưa** giảm. Bước giảm tồn là
 * `post-issue` — chưa được duyệt.
 *
 * ## `expected_total_qty` cố ý KHÔNG phải tham số
 *
 * Cùng lý do với luồng nhập: số lượng có thẩm quyền duy nhất là **số mã đã
 * quét**. Ở luồng xuất còn chặt hơn — người dùng đã khai *"số lượng cần quét"*
 * ở bước 1, và app chỉ cho ghi nhận khi quét **đủ** số đó. Truyền một con số
 * thứ ba vào đây là mở đường cho ba nguồn sự thật.
 *
 * ## `idempotencyKey` truyền vào, không tự sinh
 *
 * Quy tắc người dùng chốt 2026-09-05: *"khi retry phải dùng lại đúng
 * Idempotency-Key cũ."* Khoá đến từ bản ghi outbox, nơi nó sống lâu hơn một lần
 * gọi.
 */
export async function recordOutbound(
  input: OutboundRecordInput,
  idempotencyKey: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
  client: WriteClient = apiClient,
): Promise<RecordedOutboundDocument> {
  if (idempotencyKey.trim() === '') {
    throw new AppError({
      kind: 'config',
      message:
        'Thiếu Idempotency-Key cho outbound/record. Khoá phải lấy từ bản ghi ' +
        'outbox, không được sinh mới lúc gửi lại.',
    });
  }
  if (input.items.length === 0) {
    throw new AppError({
      kind: 'config',
      message: 'Phiếu xuất không có mã nào. Không gửi phiếu rỗng lên WMS.',
    });
  }
  if (input.warehouseId.trim() === '') {
    throw new AppError({
      kind: 'config',
      message:
        'Phiếu xuất thiếu kho. Tạo lại phiếu và chọn kho trước khi ghi nhận.',
    });
  }
  if (input.recipientName.trim() === '') {
    throw new AppError({
      kind: 'config',
      message: 'Phiếu xuất thiếu tên người nhận.',
    });
  }

  const body = {
    name: input.name,
    warehouse_id: input.warehouseId,
    recipient_name: input.recipientName,
    ...(input.recipientAddress === undefined || input.recipientAddress === ''
      ? {}
      : { recipient_address: input.recipientAddress }),
    ...(input.recipientPhone === undefined || input.recipientPhone === ''
      ? {}
      : { recipient_contact_phone: input.recipientPhone }),
    ...(input.note === undefined || input.note === '' ? {} : { note: input.note }),
    // Nguồn duy nhất có thẩm quyền là số mã đã quét — xem chú thích trên.
    expected_total_qty: input.items.length,
    items: input.items.map(item => ({
      raw_code: item.raw_code,
      scan_source: item.scan_source,
    })),
  };

  return postApproved<RecordedOutboundDocument>(
    OUTBOUND_WRITE_PATHS.record,
    body,
    {
      headers: { 'Idempotency-Key': idempotencyKey },
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? OUTBOUND_RECORD_TIMEOUT_MS,
    },
    client,
  );
}

// ---------------------------------------------------------------------------
// F — post-issue
// ---------------------------------------------------------------------------

/**
 * Đường dẫn `post-issue` cho một phiếu cụ thể.
 *
 * Hàm chứ không phải hằng vì đường này mang `{id}`. Bên gọi không tự ghép chuỗi
 * — ghép sai một dấu `/` thì cổng từ chối, và lỗi hiện ra như "chưa được duyệt"
 * thay vì "sai đường dẫn".
 */
export function postIssuePath(documentId: string): string {
  return (
    '/api/v1/mini-app/outbound-documents/' + documentId + '/post-issue'
  );
}

/** Cùng con số client đang chạy dùng cho `post-receipt`. */
export const POST_ISSUE_TIMEOUT_MS = 20_000;

export interface PostIssueInput {
  readonly documentId: string;
  /**
   * Phiên bản phiếu, cho `If-Match`. Lấy từ `data.version` của lần đọc chi tiết
   * **gần nhất**. **Bắt buộc** — xem chú thích của `postIssue`.
   */
  readonly version: string | number;
}

export interface IssuedOutboundDocument {
  readonly id?: string;
  readonly doc_no?: string;
  readonly document_no?: string;
  readonly status?: string;
  readonly version?: string | number;
}

/**
 * 🔓 **F** — Post Issue: **giảm tồn kho thật**.
 *
 * 🔒 Change Control `GATE_WMS §2h`, người dùng duyệt 2026-09-06.
 *
 * ## Đây là chỗ nguy hiểm nhất trong app
 *
 * Nguy hơn `post-receipt` không phải vì hậu quả lớn hơn, mà vì nó **khó thấy
 * hơn**: post nhầm phiếu nhập thì tồn dư ra và lần đếm nào cũng lộ; post nhầm
 * phiếu xuất thì hàng bị trừ khỏi sổ trong khi vẫn nằm trên kệ — sổ và kho lệch
 * nhau im lặng cho tới kỳ kiểm kê.
 *
 * ## Ba chốt chặn phải qua hết
 *
 * 1. **Tier** — `requireTierForWrite` gọi lại `/api/v1/health` ngay trước khi
 *    gửi. Sai tier ⇒ `wrong_environment`, không retry.
 * 2. **Danh sách trắng** — khớp theo từng đoạn đường dẫn.
 * 3. **Header** — `api/client.ts` chỉ cho `If-Match` đi qua hai thao tác
 *    `post-*`.
 *
 * ## `version` bắt buộc, không có mặc định
 *
 * ⚠️ Client đang chạy gọi `normalizeIfMatch(ifMatch)` mà **không kiểm kết quả**
 * (`scan.service.ts:1747`), nên khi thiếu version nó gửi `If-Match: undefined`
 * — một header rác mà máy chủ hoặc bỏ qua (mất hẳn optimistic locking) hoặc từ
 * chối. Không port lỗi đó: thiếu version thì dừng lại và nói ra.
 *
 * ## `idempotencyKey` truyền vào, không tự sinh
 *
 * ⚠️ Client cũ rơi về `generateClientScanId()` khi không được truyền — mỗi lần
 * thử lại một khoá mới, đúng thứ người dùng cấm ngày 2026-09-05.
 */
export async function postIssue(
  input: PostIssueInput,
  idempotencyKey: string,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    /** Tiêm để test không cần mạng. */
    ensureTier?: () => Promise<unknown>;
  } = {},
  client: WriteClient = apiClient,
): Promise<IssuedOutboundDocument> {
  if (input.documentId.trim() === '') {
    throw new AppError({
      kind: 'config',
      message: 'Thiếu mã phiếu xuất để Post Issue.',
    });
  }
  if (idempotencyKey.trim() === '') {
    throw new AppError({
      kind: 'config',
      message:
        'Thiếu Idempotency-Key cho post-issue. Khoá phải ổn định theo phiếu, ' +
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
        '". Không Post Issue khi chưa biết phiên bản — mở lại phiếu rồi thử lại.',
    });
  }

  // Kiểm tier LẠI, ngay trước lệnh giảm tồn.
  const ensureTier = options.ensureTier ?? requireTierForWrite;
  await ensureTier();

  return postApproved<IssuedOutboundDocument>(
    postIssuePath(input.documentId),
    // Spec không khai trường nào cho body; client đang chạy gửi `{}`.
    {},
    {
      headers: {
        'Idempotency-Key': idempotencyKey,
        'If-Match': ifMatch,
      },
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? POST_ISSUE_TIMEOUT_MS,
    },
    client,
  );
}
