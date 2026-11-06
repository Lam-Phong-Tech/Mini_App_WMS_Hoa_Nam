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
import { Platform } from 'react-native';
import { hashNativeFile } from '../../native/p12Files';
import {
  apiClient,
  type ApiResponse,
  type RequestOptions,
} from '../../api/client';
import { approvedWriteFor } from '../../api/writeGate';
import type { ApiEnvelope, WarrantyCase } from './types';
import { createP03RequestId } from './p03Drafts';
import { captureSessionScope, isSessionScopeCurrent } from '../../auth/session';
import { parseVietnamTimestamp } from '../../time/vietnamTime';

export const WARRANTY_WRITE_PATHS = {
  resolveCode: '/api/v1/mini-app/warranty/resolve-code',
  cases: '/api/v1/mini-app/warranty-cases',
} as const;

export function warrantyStatusPath(caseId: string): string {
  return (
    WARRANTY_WRITE_PATHS.cases + '/' + encodeURIComponent(caseId) + '/status'
  );
}

export function warrantyAttachmentsPath(caseId: string): string {
  return (
    WARRANTY_WRITE_PATHS.cases +
    '/' +
    encodeURIComponent(caseId) +
    '/attachments'
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
export function isEligibleForWarranty(resolved: WarrantyResolvedCode): boolean {
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
  readonly p03Draft?: {
    readonly draftId: string;
    readonly scanSessionId: string;
    readonly version: number;
  };
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
  _input: CreateWarrantyCaseInput,
  _idempotencyKey: string,
  _options: { signal?: AbortSignal; timeoutMs?: number } = {},
  _client: WriteClient = apiClient,
): Promise<WarrantyCase> {
  throw new AppError({
    kind: 'blocked_by_gate',
    code: 'P09_LEGACY_DISABLED',
    message:
      'Luồng bảo hành cũ đã khóa. Sử dụng adapter mini-app-p09-v1; nhánh P03 linked chờ xác nhận tương thích backend.',
  });
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
  _input: UpdateWarrantyStatusInput,
  _idempotencyKey: string,
  _options: { signal?: AbortSignal; timeoutMs?: number } = {},
  _client: WriteClient = apiClient,
): Promise<WarrantyCase> {
  throw new AppError({
    kind: 'blocked_by_gate',
    code: 'P09_LEGACY_DISABLED',
    message:
      'Luồng bảo hành cũ đã khóa. Sử dụng adapter mini-app-p09-v1; nhánh P03 linked chờ xác nhận tương thích backend.',
  });
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

export const OWNER_ATTACHMENT_UPLOAD_CONTRACT =
  'owner-attachment-upload-v1' as const;
const OWNER_ATTACHMENT_UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export type OwnerAttachmentOwner = 'inbound' | 'outbound' | 'warranty';
export type OwnerAttachmentOutcome = 'SUCCEEDED' | 'REJECTED' | 'UNKNOWN';
export interface OwnerAttachmentUploadOptions {
  readonly expectedScope?: ReturnType<typeof captureSessionScope>;
  readonly expectedSha256?: string;
  readonly beforeDispatch?: () => void;
  readonly warehouseId: string;
  /** Stable key must be retained by the caller across timeout/remount. */
  readonly idempotencyKey?: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly note?: string;
  readonly attachmentType?: string;
}
export interface OwnerAttachmentReceipt {
  readonly request_key?: string;
  readonly operation_key?: string;
  readonly parent_id?: string;
  readonly warehouse_id?: string;
  readonly file_sha256?: string;
  readonly attachment_id?: string | null;
  readonly attachment_status_at_completion?: string | null;
  readonly [key: string]: unknown;
}
export interface OwnerAttachmentReconcile {
  readonly outcome: OwnerAttachmentOutcome;
  readonly requestState:
    | 'PENDING'
    | 'SUCCEEDED'
    | 'REJECTED'
    | 'UNKNOWN'
    | null;
  readonly receipt: OwnerAttachmentReceipt | null;
  readonly currentAttachment: Record<string, unknown> | null;
  readonly retryPolicy: 'CHECK_ONLY' | 'NONE';
  readonly cancelSupported: false;
  readonly observedAt: string | null;
}

function ownerAttachmentPath(
  owner: OwnerAttachmentOwner,
  parentId: string,
): string {
  const segment =
    owner === 'warranty' ? 'warranty-cases' : owner + '-documents';
  return `/api/v1/mini-app/${segment}/${encodeURIComponent(
    parentId,
  )}/attachments`;
}
function ownerAttachmentReconcilePath(
  owner: OwnerAttachmentOwner,
  parentId: string,
  key: string,
): string {
  return (
    ownerAttachmentPath(owner, parentId) +
    '/requests/' +
    encodeURIComponent(key)
  );
}
function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function requireOwnerUuid(value: string, label: string): void {
  if (!OWNER_ATTACHMENT_UUID.test(value))
    throw new AppError({
      kind: 'config',
      code: 'P18_UUID_REQUIRED',
      message: `${label} phải là UUID thật.`,
    });
}
function lowercaseSha(value: string): string {
  if (!/^[a-f0-9]{64}$/.test(value))
    throw new AppError({
      kind: 'config',
      code: 'P18_SHA256_REQUIRED',
      message: 'SHA-256 phải là chuỗi hex thường 64 ký tự.',
    });
  return value;
}
function uploadScope(warehouseId: string, expected = captureSessionScope()) {
  if (
    !expected.userId ||
    !expected.authSessionId ||
    expected.warehouseId !== warehouseId ||
    !isSessionScopeCurrent(expected)
  )
    throw new AppError({
      kind: 'cancelled',
      code: 'P18_SCOPE_CHANGED',
      message: 'Phiên/kho upload đã thay đổi. Giữ yêu cầu gốc để đối chiếu.',
    });
  return expected;
}
export function parseOwnerUploadReceipt(
  value: unknown,
  expected: {
    owner: OwnerAttachmentOwner;
    parentId: string;
    key: string;
    warehouseId: string;
    sha256: string;
    scope: ReturnType<typeof captureSessionScope>;
  },
): OwnerAttachmentReceipt {
  const r = objectRecord(value);
  const succeeded = r?.outcome === 'SUCCEEDED';
  if (
    !r ||
    r.contract !== OWNER_ATTACHMENT_UPLOAD_CONTRACT ||
    r.command !== 'UPLOAD' ||
    r.request_key !== expected.key ||
    r.actor_id !== expected.scope.userId ||
    r.auth_session_id !== expected.scope.authSessionId ||
    r.parent_type !== expected.owner.toUpperCase() ||
    r.parent_id !== expected.parentId ||
    r.warehouse_id !== expected.warehouseId ||
    r.file_sha256 !== expected.sha256 ||
    !['SUCCEEDED', 'REJECTED'].includes(String(r.outcome)) ||
    parseVietnamTimestamp(r.completed_at).status !== 'RECORDED' ||
    (r.scan_result !== null &&
      !['CLEAN', 'INFECTED', 'UNSCANNED'].includes(String(r.scan_result))) ||
    (succeeded
      ? r.http_status !== 201 ||
        !OWNER_ATTACHMENT_UUID.test(String(r.attachment_id)) ||
        r.attachment_status_at_completion !== 'ACTIVE'
      : !Number.isInteger(r.http_status) ||
        Number(r.http_status) < 400 ||
        Number(r.http_status) >= 500 ||
        !(
          r.attachment_id === null ||
          OWNER_ATTACHMENT_UUID.test(String(r.attachment_id))
        ) ||
        !(
          r.attachment_status_at_completion === null ||
          r.attachment_status_at_completion === 'QUARANTINED'
        )) ||
    (r.attachment_id === null
      ? r.attachment_version_at_completion !== null
      : !Number.isSafeInteger(r.attachment_version_at_completion) ||
        Number(r.attachment_version_at_completion) < 1)
  )
    throw new AppError({
      kind: 'parse',
      code: 'P18_UPLOAD_RECEIPT_INVALID',
      message:
        'Biên nhận upload chưa khớp đầy đủ owner/phiên/tệp/yêu cầu. Chỉ đối chiếu, chưa gửi lại.',
    });
  return r;
}
function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}
/* eslint-disable no-bitwise */
function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}
/** Small dependency-free SHA-256 fallback for React Native file URIs. */
function sha256Fallback(input: Uint8Array): string {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const bitLength = input.length * 8,
    total = Math.ceil((input.length + 9) / 64) * 64,
    data = new Uint8Array(total);
  data.set(input);
  data[input.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(total - 4, bitLength >>> 0, false);
  view.setUint32(total - 8, Math.floor(bitLength / 0x100000000), false);
  let h0 = 0x6a09e667,
    h1 = 0xbb67ae85,
    h2 = 0x3c6ef372,
    h3 = 0xa54ff53a,
    h4 = 0x510e527f,
    h5 = 0x9b05688c,
    h6 = 0x1f83d9ab,
    h7 = 0x5be0cd19;
  for (let offset = 0; offset < total; offset += 64) {
    const w = new Uint32Array(64);
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 =
          rotateRight(w[i - 15], 7) ^
          rotateRight(w[i - 15], 18) ^
          (w[i - 15] >>> 3),
        s1 =
          rotateRight(w[i - 2], 17) ^
          rotateRight(w[i - 2], 19) ^
          (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4,
      f = h5,
      g = h6,
      hh = h7;
    for (let i = 0; i < 64; i++) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25),
        ch = (e & f) ^ (~e & g),
        t1 = (hh + s1 + ch + constants[i] + w[i]) >>> 0,
        s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22),
        maj = (a & b) ^ (a & c) ^ (b & c),
        t2 = (s0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + hh) >>> 0;
  }
  const words = [h0, h1, h2, h3, h4, h5, h6, h7];
  const bytes = new Uint8Array(32);
  words.forEach((word, index) => {
    bytes[index * 4] = (word >>> 24) & 255;
    bytes[index * 4 + 1] = (word >>> 16) & 255;
    bytes[index * 4 + 2] = (word >>> 8) & 255;
    bytes[index * 4 + 3] = word & 255;
  });
  return bytesToHex(bytes);
}
export async function hashAttachmentFile(
  file: AttachmentFile,
): Promise<string> {
  if (!file.blob && Platform.OS === 'android')
    return (await hashNativeFile(file.uri)).sha256;
  const blob = file.blob ?? (await (await fetch(file.uri)).blob());
  const bytes = new Uint8Array(
    await (
      blob as unknown as { arrayBuffer(): Promise<ArrayBuffer> }
    ).arrayBuffer(),
  );
  const subtle = (
    globalThis as unknown as {
      crypto?: {
        subtle?: {
          digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer>;
        };
      };
    }
  ).crypto?.subtle;
  if (subtle)
    return bytesToHex(new Uint8Array(await subtle.digest('SHA-256', bytes)));
  return sha256Fallback(bytes);
}

function validateOwnerAttachment(
  owner: OwnerAttachmentOwner,
  file: AttachmentFile,
  blobSize?: number,
): void {
  const size = blobSize ?? file.blob?.size;
  if (size !== undefined && (!Number.isSafeInteger(size) || size <= 0))
    throw new AppError({
      kind: 'config',
      code: 'P18_FILE_INVALID',
      message: 'Kích thước tệp không hợp lệ.',
    });
  const mime = file.type.toLowerCase();
  const allowed =
    owner === 'warranty'
      ? [
          'image/jpeg',
          'image/png',
          'image/webp',
          'video/mp4',
          'video/quicktime',
          'video/webm',
        ]
      : ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(mime))
    throw new AppError({
      kind: 'config',
      code: 'P18_MIME_NOT_ALLOWED',
      message: 'Định dạng tệp không được owner cho phép.',
    });
  const max =
    owner === 'warranty' && mime.startsWith('video/')
      ? 314572800
      : owner === 'warranty'
      ? 10485760
      : 15728640;
  if (size !== undefined && size > max)
    throw new AppError({
      kind: 'config',
      code: 'P18_FILE_TOO_LARGE',
      message: 'Tệp vượt giới hạn của owner.',
    });
}

/** P18 opt-in upload: exact parent/key/hash/scope, never legacy fallback. */
export async function uploadOwnerAttachment(
  owner: OwnerAttachmentOwner,
  parentId: string,
  file: AttachmentFile,
  options: OwnerAttachmentUploadOptions,
  client: WriteClient = apiClient,
): Promise<{
  requestKey: string;
  sha256: string;
  receipt: OwnerAttachmentReceipt;
}> {
  requireOwnerUuid(parentId, 'parent_id');
  requireOwnerUuid(options.warehouseId, 'warehouse_id');
  const key = options.idempotencyKey ?? createP03RequestId();
  requireOwnerUuid(key, 'Idempotency-Key');
  validateOwnerAttachment(owner, file);
  const scope = uploadScope(options.warehouseId, options.expectedScope);
  const sha256 = lowercaseSha(await hashAttachmentFile(file));
  uploadScope(options.warehouseId, scope);
  if (options.expectedSha256 && sha256 !== options.expectedSha256)
    throw new AppError({
      kind: 'config',
      code: 'P18_FILE_CHANGED',
      message: 'Bytes tệp đã thay đổi; chưa gửi yêu cầu.',
    });
  const form = new FormData();
  if (file.blob)
    (
      form.append as unknown as (
        name: string,
        value: Blob,
        fileName?: string,
      ) => void
    )('file', file.blob, file.name);
  else form.append('file', file as unknown as Blob);
  if (options.attachmentType)
    form.append('attachment_type', options.attachmentType);
  if (owner !== 'warranty' && options.note !== undefined) {
    if (options.note.length > 500)
      throw new AppError({
        kind: 'config',
        code: 'P18_NOTE_TOO_LONG',
        message: 'Ghi chú tối đa 500 ký tự.',
      });
    form.append('note', options.note);
  }
  const path = ownerAttachmentPath(owner, parentId);
  assertApprovedWarrantyWrite('POST', path);
  options.beforeDispatch?.();
  uploadScope(options.warehouseId, scope);
  const response = await client.request<ApiEnvelope<unknown>>({
    path,
    method: 'POST',
    body: form,
    p18Upload: true,
    headers: {
      'X-Upload-Contract': OWNER_ATTACHMENT_UPLOAD_CONTRACT,
      'Idempotency-Key': key,
      'X-Upload-Warehouse-ID': options.warehouseId,
      'X-Upload-SHA256': sha256,
    },
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? ATTACHMENT_UPLOAD_TIMEOUT_MS,
  });
  const body = objectRecord(response.data),
    meta = objectRecord(body?.meta),
    receipt = objectRecord(meta?.upload_receipt);
  uploadScope(options.warehouseId, scope);
  if (!receipt)
    throw new AppError({
      kind: 'unknown',
      code: 'P18_UPLOAD_OUTCOME_UNKNOWN',
      message:
        'Owner chưa trả biên nhận P18 hợp lệ; giữ nguyên key và đối chiếu, không gửi lại.',
      status: response.status,
    });
  const verified = parseOwnerUploadReceipt(receipt, {
    owner,
    parentId,
    key,
    warehouseId: options.warehouseId,
    sha256,
    scope,
  });
  if (verified.outcome !== 'SUCCEEDED')
    throw new AppError({
      kind: 'http',
      code: 'P18_UPLOAD_REJECTED_VERIFIED',
      message: 'Owner đã xác nhận từ chối upload. Không gửi lại tự động.',
      status: response.status,
      cause: verified,
    });
  if (
    response.status !== 201 ||
    body?.success !== true ||
    objectRecord(body.data)?.id !== verified.attachment_id
  )
    throw new AppError({
      kind: 'parse',
      code: 'P18_UPLOAD_RECEIPT_INVALID',
      message: 'Nội dung upload không khớp biên nhận đã trả.',
    });
  return { requestKey: key, sha256, receipt: verified };
}

export async function reconcileOwnerAttachment(
  owner: OwnerAttachmentOwner,
  parentId: string,
  operationKey: string,
  warehouseId: string,
  fileSha256: string,
  client: Pick<typeof apiClient, 'get'> = apiClient,
): Promise<OwnerAttachmentReconcile> {
  requireOwnerUuid(parentId, 'parent_id');
  requireOwnerUuid(operationKey, 'operation_key');
  requireOwnerUuid(warehouseId, 'warehouse_id');
  const sha256 = lowercaseSha(fileSha256);
  const scope = uploadScope(warehouseId);
  const response = await client.get<unknown>(
    ownerAttachmentReconcilePath(owner, parentId, operationKey),
    { query: { warehouse_id: warehouseId, file_sha256: sha256 } },
  );
  const body = objectRecord(response.data),
    data = objectRecord(body?.data);
  const outcome = data?.outcome,
    receipt = objectRecord(data?.receipt),
    current = objectRecord(data?.current_attachment);
  if (
    response.status !== 200 ||
    body?.success !== true ||
    !['SUCCEEDED', 'REJECTED', 'UNKNOWN'].includes(String(outcome)) ||
    !['PENDING', 'SUCCEEDED', 'REJECTED', 'UNKNOWN', null].includes(
      data?.request_state as never,
    ) ||
    objectRecord(body?.meta)?.contract !== OWNER_ATTACHMENT_UPLOAD_CONTRACT ||
    data?.request_key !== operationKey ||
    data?.parent_type !== owner.toUpperCase() ||
    data?.parent_id !== parentId ||
    data?.warehouse_id !== warehouseId ||
    data?.auth_session_id !== scope.authSessionId ||
    data?.file_sha256 !== sha256 ||
    data?.retry_policy !== (outcome === 'UNKNOWN' ? 'CHECK_ONLY' : 'NONE') ||
    data?.cancel_supported !== false ||
    parseVietnamTimestamp(data?.observed_at).status !== 'RECORDED' ||
    (outcome === 'UNKNOWN'
      ? data.receipt !== null ||
        ['SUCCEEDED', 'REJECTED'].includes(String(data.request_state))
      : data?.request_state !== outcome)
  )
    throw new AppError({
      kind: 'parse',
      code: 'P18_RECONCILE_INVALID',
      message: 'Kết quả đối chiếu upload chưa đúng contract.',
      status: response.status,
    });
  uploadScope(warehouseId, scope);
  if (outcome !== 'UNKNOWN') {
    const verified = parseOwnerUploadReceipt(receipt, {
      owner,
      parentId,
      key: operationKey,
      warehouseId,
      sha256,
      scope,
    });
    if (
      verified.outcome !== outcome ||
      (current && current.attachment_id !== verified.attachment_id)
    )
      throw new AppError({
        kind: 'parse',
        code: 'P18_RECONCILE_INVALID',
        message: 'Kết quả đối chiếu khác biên nhận gốc.',
      });
  }
  return {
    outcome: outcome as OwnerAttachmentOutcome,
    requestState:
      data?.request_state as OwnerAttachmentReconcile['requestState'],
    receipt: receipt as OwnerAttachmentReceipt | null,
    currentAttachment: current,
    retryPolicy: data!.retry_policy as 'CHECK_ONLY' | 'NONE',
    cancelSupported: false,
    observedAt: typeof data?.observed_at === 'string' ? data.observed_at : null,
  };
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
    (
      form.append as unknown as (
        name: string,
        value: Blob,
        fileName?: string,
      ) => void
    )('file', file.blob, file.name);
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
