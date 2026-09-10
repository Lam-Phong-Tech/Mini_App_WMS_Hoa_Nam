/**
 * Đối soát mã quét trước khi tạo phiếu xuất linh kiện bảo hành.
 *
 * Không dùng `/scan/classify`: endpoint đó chỉ nói physical code map tới SKU,
 * không biết hồ sơ bảo hành có đang ở CHECKING/REPAIRING hay mã có đủ tồn để
 * xuất. Nguồn quyết định duy nhất là resolver của chính component issue.
 * Resolver chỉ kiểm tra, không tạo phiếu, scan evidence hay movement.
 */

import { type ApiResponse, apiClient, type RequestOptions } from '../../api/client';
import { approvedWriteFor } from '../../api/writeGate';
import { AppError, extractErrorCode, extractRequestId } from '../../errors/AppError';
import type { ApiEnvelope } from '../../services/wms/types';
import type { ResolvedWarrantyComponentSku } from './warrantyComponentDraft';

export const COMPONENT_ISSUE_RESOLVE_CODE_PATH =
  '/api/v1/component-issue-documents/resolve-code';

const COMPONENT_ISSUE_RESOLVE_TIMEOUT_MS = 8_000;

/** Phần dữ liệu resolver trả về, kể cả trường hợp HTTP 200 nhưng bị từ chối. */
export interface ComponentIssueResolvedCode {
  readonly raw_code?: string | null;
  readonly sku_id?: string | number | null;
  readonly sku_code?: string | null;
  readonly sku_name?: string | null;
  readonly item_id?: string | number | null;
  readonly container_id?: string | number | null;
  readonly eligible_for_issue?: boolean;
  readonly case_allows_issue?: boolean;
  readonly eligibility_code?: string | null;
  /** Câu giải thích cụ thể do resolver BE trả về cho mã eligibility mới. */
  readonly eligibility_message?: string | null;
  readonly available_qty?: number | null;
  /** Hộp cần nhập số lượng; tem linh kiện riêng luôn là 1. */
  readonly requires_quantity?: boolean;
}

export interface WarrantyComponentSkuLookupClient {
  request<T>(options: RequestOptions): Promise<ApiResponse<T>>;
}

export interface WarrantyComponentSkuLookupInput {
  readonly rawCode: string;
  readonly warehouseId: string;
  readonly caseId: string;
}

export interface WarrantyComponentSkuLookupOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function envelopeMessage(envelope: unknown): string | undefined {
  if (typeof envelope !== 'object' || envelope === null) return undefined;
  const message = (envelope as { message?: unknown }).message;
  return typeof message === 'string' && message.trim() !== ''
    ? message.trim()
    : undefined;
}

/**
 * Câu dành cho thủ kho. HTTP 200 không đồng nghĩa mã dùng được, nên không lấy
 * thông báo chung của transport để che mất kết luận cụ thể này của WMS.
 */
export function componentIssueEligibilityMessage(
  resolved: ComponentIssueResolvedCode,
): string {
  if (resolved.case_allows_issue !== true) {
    return 'Hồ sơ bảo hành chưa ở trạng thái Đang kiểm tra hoặc Đang sửa chữa.';
  }

  const code = text(resolved.eligibility_code);
  const backendMessage = text(resolved.eligibility_message);
  switch (code) {
    case 'BOX_SKU_NOT_FOUND':
      return 'SKU trong mã hộp không tồn tại trong danh mục linh kiện (' + code + ').';
    case 'BOX_SKU_NOT_COMPONENT':
      return 'SKU trong mã hộp là sản phẩm, không phải linh kiện (' + code + ').';
    case 'BOX_NOT_RECEIVED':
      return 'Hộp chưa được nhập kho nên chưa có tồn để xuất (' + code + ').';
    case 'COMPONENT_BOX_INVALID':
      return 'Hộp không còn linh kiện khả dụng để xuất (' + code + ').';
    case 'SERIAL_COMPONENT_REQUIRES_ITEM':
      return 'Linh kiện này quản lý theo mã riêng; quét tem trên từng linh kiện, không quét mã hộp (' + code + ').';
    default:
      if (backendMessage !== undefined) {
        return code === undefined
          ? backendMessage
          : backendMessage + ' (' + code + ').';
      }
      return code === undefined
        ? 'WMS chưa xác nhận mã và hồ sơ đủ điều kiện xuất.'
        : 'WMS chưa cho phép xuất mã này (' + code + ').';
  }
}

function assertResolverIsApproved(): void {
  if (
    approvedWriteFor('POST', COMPONENT_ISSUE_RESOLVE_CODE_PATH) === undefined
  ) {
    throw new AppError({
      kind: 'blocked_by_gate',
      message: 'API đối soát mã linh kiện bảo hành chưa được mở trong cổng gọi WMS.',
    });
  }
}

function validateInput(input: WarrantyComponentSkuLookupInput): void {
  if (input.rawCode.trim() === '') {
    throw new AppError({ kind: 'config', message: 'Mã linh kiện không được rỗng.' });
  }
  if (input.warehouseId.trim() === '') {
    throw new AppError({ kind: 'config', message: 'Chưa chọn kho xuất linh kiện.' });
  }
  if (input.caseId.trim() === '') {
    throw new AppError({ kind: 'config', message: 'Chưa xác định hồ sơ bảo hành.' });
  }
}

/**
 * Resolve một tem linh kiện/hộp theo đúng ngữ cảnh kho và hồ sơ bảo hành.
 *
 * `eligible_for_issue` và `case_allows_issue` phải cùng đúng `true`. Thiếu
 * một trong hai cờ cũng là không được phép: FE không được tự suy đoán thay BE.
 */
export async function resolveWarrantyComponentSku(
  input: WarrantyComponentSkuLookupInput,
  options: WarrantyComponentSkuLookupOptions = {},
  client: WarrantyComponentSkuLookupClient = apiClient,
): Promise<ResolvedWarrantyComponentSku> {
  validateInput(input);
  assertResolverIsApproved();

  const response = await client.request<ApiEnvelope<ComponentIssueResolvedCode>>({
    path: COMPONENT_ISSUE_RESOLVE_CODE_PATH,
    method: 'POST',
    body: {
      raw_code: input.rawCode.trim(),
      warehouse_id: input.warehouseId,
      warranty_case_id: input.caseId,
    },
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? COMPONENT_ISSUE_RESOLVE_TIMEOUT_MS,
  });
  const envelope = response.data;

  if (envelope?.success === false) {
    throw new AppError({
      kind: 'http',
      status: response.status,
      code: extractErrorCode(envelope),
      route: COMPONENT_ISSUE_RESOLVE_CODE_PATH,
      requestId: response.header?.('x-request-id') ?? extractRequestId(envelope),
      message: envelopeMessage(envelope) ?? 'WMS không đối soát được mã linh kiện.',
    });
  }
  if (envelope === undefined || envelope === null || !('data' in envelope)) {
    throw new AppError({
      kind: 'parse',
      status: response.status,
      route: COMPONENT_ISSUE_RESOLVE_CODE_PATH,
      message: 'Phản hồi đối soát mã không có trường "data".',
    });
  }

  const resolved = envelope.data;
  if (typeof resolved !== 'object' || resolved === null) {
    throw new AppError({
      kind: 'parse',
      status: response.status,
      route: COMPONENT_ISSUE_RESOLVE_CODE_PATH,
      message: 'Phản hồi đối soát mã không có thông tin linh kiện.',
    });
  }
  if (
    resolved.eligible_for_issue !== true ||
    resolved.case_allows_issue !== true
  ) {
    throw new AppError({
      kind: 'http',
      // 200 là kết quả transport hợp lệ nhưng dữ liệu nghiệp vụ bị từ chối.
      status: response.status,
      code: text(resolved.eligibility_code),
      route: COMPONENT_ISSUE_RESOLVE_CODE_PATH,
      requestId: response.header?.('x-request-id') ?? extractRequestId(envelope),
      message: componentIssueEligibilityMessage(resolved),
    });
  }

  const skuId = text(resolved.sku_id);
  if (skuId === undefined) {
    throw new AppError({
      kind: 'parse',
      status: response.status,
      route: COMPONENT_ISSUE_RESOLVE_CODE_PATH,
      message: 'WMS đã cho phép xuất nhưng không trả SKU của mã vừa quét.',
    });
  }
  const available = resolved.available_qty;
  return {
    skuId,
    skuCode: text(resolved.sku_code),
    skuName: text(resolved.sku_name),
    requiresQuantity: resolved.requires_quantity === true,
    availableQuantity:
      typeof available === 'number' && Number.isFinite(available)
        ? available
        : undefined,
  };
}
