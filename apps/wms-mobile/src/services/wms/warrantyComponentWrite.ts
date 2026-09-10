/**
 * Xuất linh kiện cho hồ sơ bảo hành bằng API WMS gốc.
 *
 * Luồng này cố ý không gọi họ `/mini-app/warranty-component-issues`: API đó
 * nhận một hợp đồng khác. Phiếu linh kiện chuẩn phải đi theo thứ tự tạo phiếu
 * → scan vào từng dòng → post. Chỉ `post` mới làm giảm tồn kho.
 */

import { apiClient, type ApiResponse, type RequestOptions } from '../../api/client';
import { approvedWriteFor } from '../../api/writeGate';
import {
  AppError,
  extractErrorCode,
  extractRequestId,
} from '../../errors/AppError';
import { readOne } from './readOnlyClient';
import { normalizeIfMatch } from './inboundWrite';
import { fetchWarrantyCase } from './queries';
import { requireTierForWrite } from './tierCheck';
import type { ApiEnvelope, WarrantyCase } from './types';

export const COMPONENT_ISSUE_DOCUMENTS_PATH =
  '/api/v1/component-issue-documents';
export const WARRANTY_COMPONENT_ISSUE_TIMEOUT_MS = 20_000;

export function componentIssueDocumentPath(documentId: string): string {
  return COMPONENT_ISSUE_DOCUMENTS_PATH + '/' + encodeURIComponent(documentId);
}

export function componentIssueScanPath(documentId: string): string {
  return componentIssueDocumentPath(documentId) + '/scan';
}

export function componentIssuePostPath(documentId: string): string {
  return componentIssueDocumentPath(documentId) + '/post';
}

export interface WarrantyComponentWriteClient {
  request<T>(options: RequestOptions): Promise<ApiResponse<T>>;
}

export interface ComponentIssueDocumentLine {
  readonly id?: string | number;
  readonly line_id?: string | number;
  readonly sku_id?: string | number;
  readonly required_qty?: number;
  readonly items?: readonly ComponentIssueDocumentItem[];
}

/** Bằng chứng quét trong chi tiết phiếu. Các tên trường khác nhau giữa bản BE. */
export interface ComponentIssueDocumentItem {
  readonly code_value?: string;
  readonly raw_code?: string;
  readonly physical_code_value?: string;
  readonly quantity?: number;
}

export interface ComponentIssueDocument {
  readonly id?: string | number;
  readonly component_issue_document_id?: string | number;
  readonly version?: string | number;
  readonly status?: string;
  readonly lines?: readonly ComponentIssueDocumentLine[];
}

export interface WarrantyComponentIssueItem {
  /** SKU COMPONENT + ACTIVE đã được đối soát trước lúc tạo phiếu. */
  readonly skuId: string;
  readonly codeValue: string;
  readonly quantity: number;
}

export interface WarrantyComponentBatchInput {
  readonly caseId: string;
  readonly warehouseId: string;
  readonly items: readonly WarrantyComponentIssueItem[];
  /** Khoá ổn định của nút xác nhận; chỉ dùng cho lệnh Post cuối. */
  readonly postIdempotencyKey: string;
}

export interface WarrantyComponentBatchResult {
  readonly documentId: string;
  readonly issuedLines: number;
  readonly issuedQuantity: number;
  readonly version?: string;
  readonly warrantyCase?: WarrantyCase;
}

export interface WarrantyComponentBatchOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly ensureTier?: () => Promise<unknown>;
  readonly loadCase?: (caseId: string) => Promise<WarrantyCase>;
  readonly loadDocument?: (documentId: string) => Promise<ComponentIssueDocument>;
  /** Phiếu đã tạo ở lần trước; dùng khi mở lại app giữa lúc xuất dở. */
  readonly existingDocumentId?: string;
  /** Mã đã có phản hồi scan thành công ở lần chạy trước. */
  readonly completedCodeKeys?: readonly string[];
  /** Mã có request scan dở lúc app bị đóng. */
  readonly pendingCodeKey?: string;
  /**
   * Ghi bền vững tiến độ TRƯỚC/Sau từng request. Không đổi tồn; chỉ giúp lần
   * mở sau tiếp tục đúng document và đúng Idempotency-Key của Post.
   */
  readonly onProgress?: (progress: WarrantyComponentProgress) => void;
}

export interface WarrantyComponentProgress {
  readonly stage: 'creating' | 'created' | 'scanning' | 'scanned' | 'posting';
  readonly documentId?: string;
  readonly version?: string;
  readonly completedCodeKeys: readonly string[];
  readonly pendingCodeKey?: string;
}

interface SuccessfulWrite<T> {
  readonly data: T;
  readonly etagVersion?: string;
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Chuẩn hoá phản hồi phiếu từ WMS.
 *
 * Create/scan/post có thể trả document phẳng, nhưng GET chi tiết trên WMS
 * đang trả `{ document: {...}, lines: [...] }`. `lines` là sibling của
 * `document`, không nằm trong document. Nếu chỉ bóc `document`, client sẽ
 * mất line_id rồi dừng trước bước scan dù phiếu nháp đã được tạo.
 */
function asDocument(value: unknown): ComponentIssueDocument | undefined {
  const direct = record(value);
  if (direct === undefined) return undefined;
  if (
    text(direct.id) !== undefined ||
    text(direct.component_issue_document_id) !== undefined
  ) {
    return direct as ComponentIssueDocument;
  }
  const nested = record(direct.document);
  if (nested === undefined) return undefined;

  const siblingLines = direct.lines;
  return {
    ...nested,
    ...(Array.isArray(siblingLines)
      ? { lines: siblingLines as readonly ComponentIssueDocumentLine[] }
      : {}),
  } as ComponentIssueDocument;
}

function documentId(document: ComponentIssueDocument | undefined): string | undefined {
  return text(document?.id) ?? text(document?.component_issue_document_id);
}

function documentVersion(document: ComponentIssueDocument | undefined): string | undefined {
  return normalizeIfMatch(document?.version);
}

function lineId(line: ComponentIssueDocumentLine): string | undefined {
  return text(line.id) ?? text(line.line_id);
}

function lineForSku(
  document: ComponentIssueDocument,
  skuId: string,
): ComponentIssueDocumentLine | undefined {
  return document.lines?.find(line => text(line.sku_id) === skuId);
}

function codeKey(value: string): string {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

function scannedCodeKeys(document: ComponentIssueDocument): Set<string> {
  const keys = new Set<string>();
  for (const line of document.lines ?? []) {
    for (const item of line.items ?? []) {
      const code = item.code_value ?? item.raw_code ?? item.physical_code_value;
      if (typeof code === 'string' && code.trim() !== '') keys.add(codeKey(code));
    }
  }
  return keys;
}

function envelopeMessage(envelope: unknown): string | undefined {
  const message = record(envelope)?.message;
  return typeof message === 'string' && message.trim() !== ''
    ? message
    : undefined;
}

function assertApprovedComponentIssueWrite(method: string, path: string): void {
  if (approvedWriteFor(method, path) === undefined) {
    throw new AppError({
      kind: 'blocked_by_gate',
      message:
        'Thao tác xuất linh kiện ' +
        method +
        ' "' +
        path +
        '" chưa được duyệt trong danh sách ghi WMS.',
    });
  }
}

async function postApproved<T>(
  path: string,
  body: unknown,
  extra: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
  client: WarrantyComponentWriteClient,
): Promise<SuccessfulWrite<T>> {
  assertApprovedComponentIssueWrite('POST', path);
  const response = await client.request<ApiEnvelope<T>>({
    path,
    method: 'POST',
    body,
    headers: extra.headers,
    signal: extra.signal,
    timeoutMs: extra.timeoutMs,
  });
  const envelope = response.data;
  if (envelope?.success === false) {
    throw new AppError({
      kind: 'http',
      status: response.status,
      code: extractErrorCode(envelope),
      route: path,
      requestId:
        response.header?.('x-request-id') ?? extractRequestId(envelope),
      message: envelopeMessage(envelope) ?? 'WMS từ chối xuất linh kiện.',
    });
  }
  if (envelope === undefined || envelope === null || !('data' in envelope)) {
    throw new AppError({
      kind: 'parse',
      status: response.status,
      route: path,
      message: 'Phản hồi WMS không có trường "data".',
    });
  }
  return {
    data: envelope.data,
    etagVersion: normalizeIfMatch(response.header?.('ETag')),
  };
}

function validateBatch(input: WarrantyComponentBatchInput): void {
  if (input.caseId.trim() === '') {
    throw new AppError({ kind: 'config', message: 'Thiếu mã hồ sơ bảo hành.' });
  }
  if (input.warehouseId.trim() === '') {
    throw new AppError({ kind: 'config', message: 'Thiếu kho xuất linh kiện.' });
  }
  if (input.items.length === 0) {
    throw new AppError({
      kind: 'config',
      message: 'Hồ sơ phải có ít nhất một linh kiện cần xuất.',
    });
  }
  if (input.postIdempotencyKey.trim() === '') {
    throw new AppError({
      kind: 'config',
      message: 'Thiếu Idempotency-Key ổn định cho lệnh xác nhận xuất.',
    });
  }

  const codes = new Set<string>();
  for (const item of input.items) {
    if (item.skuId.trim() === '') {
      throw new AppError({
        kind: 'config',
        message: 'Có mã quét chưa đối soát được SKU linh kiện.',
      });
    }
    if (item.codeValue.trim() === '') {
      throw new AppError({ kind: 'config', message: 'Mã linh kiện không được rỗng.' });
    }
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new AppError({
        kind: 'config',
        message: 'Số lượng linh kiện phải là số nguyên dương.',
      });
    }
    const code = item.codeValue.trim().replace(/\s+/g, '').toUpperCase();
    if (codes.has(code)) {
      throw new AppError({
        kind: 'config',
        message: 'Danh sách có mã linh kiện bị trùng.',
      });
    }
    codes.add(code);
  }
}

function requiredLines(items: readonly WarrantyComponentIssueItem[]): readonly {
  sku_id: string;
  required_qty: number;
}[] {
  const quantities = new Map<string, number>();
  for (const item of items) {
    quantities.set(item.skuId, (quantities.get(item.skuId) ?? 0) + item.quantity);
  }
  return Array.from(quantities, ([sku_id, required_qty]) => ({
    sku_id,
    required_qty,
  }));
}

async function defaultLoadDocument(documentId: string): Promise<ComponentIssueDocument> {
  const payload = await readOne<unknown>(componentIssueDocumentPath(documentId));
  const document = asDocument(payload);
  if (document === undefined) {
    throw new AppError({
      kind: 'parse',
      message: 'Phản hồi chi tiết phiếu linh kiện không có thông tin phiếu.',
    });
  }
  return document;
}

async function freshDocument(
  document: ComponentIssueDocument | undefined,
  documentIdValue: string,
  loadDocument: (documentId: string) => Promise<ComponentIssueDocument>,
): Promise<ComponentIssueDocument> {
  if (
    document !== undefined &&
    documentVersion(document) !== undefined &&
    document.lines !== undefined
  ) {
    return document;
  }
  const loaded = await loadDocument(documentIdValue);
  if (documentVersion(loaded) === undefined) {
    throw new AppError({
      kind: 'parse',
      message:
        'WMS không trả version của phiếu xuất linh kiện. Không thể gửi If-Match an toàn.',
    });
  }
  return loaded;
}

export async function createComponentIssueDocument(
  input: Pick<WarrantyComponentBatchInput, 'caseId' | 'warehouseId' | 'items'>,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
  client: WarrantyComponentWriteClient = apiClient,
): Promise<ComponentIssueDocument> {
  if (input.caseId.trim() === '' || input.warehouseId.trim() === '') {
    throw new AppError({
      kind: 'config',
      message: 'Thiếu hồ sơ bảo hành hoặc kho xuất linh kiện.',
    });
  }
  if (input.items.length === 0) {
    throw new AppError({ kind: 'config', message: 'Chưa có linh kiện cần xuất.' });
  }
  const write = await postApproved<unknown>(
    COMPONENT_ISSUE_DOCUMENTS_PATH,
    {
      warehouse_id: input.warehouseId,
      warranty_case_id: input.caseId,
      lines: requiredLines(input.items),
    },
    {
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? WARRANTY_COMPONENT_ISSUE_TIMEOUT_MS,
    },
    client,
  );
  const result = asDocument(write.data);
  if (documentId(result) === undefined) {
    throw new AppError({
      kind: 'parse',
      message: 'WMS đã tạo phiếu nhưng phản hồi không có id phiếu.',
    });
  }
  return result as ComponentIssueDocument;
}

export async function scanComponentIssueDocument(
  input: {
    documentId: string;
    lineId: string;
    version: string | number;
    codeValue: string;
    quantity: number;
  },
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
  client: WarrantyComponentWriteClient = apiClient,
): Promise<ComponentIssueDocument> {
  const version = normalizeIfMatch(input.version);
  if (
    input.documentId.trim() === '' ||
    input.lineId.trim() === '' ||
    version === undefined ||
    input.codeValue.trim() === '' ||
    !Number.isSafeInteger(input.quantity) ||
    input.quantity <= 0
  ) {
    throw new AppError({
      kind: 'config',
      message: 'Thiếu dữ liệu phiếu, dòng phiếu, version hoặc mã quét linh kiện.',
    });
  }
  const write = await postApproved<unknown>(
    componentIssueScanPath(input.documentId),
    {
      line_id: input.lineId,
      quantity: input.quantity,
      code_value: input.codeValue.trim(),
    },
    {
      headers: { 'If-Match': version },
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? WARRANTY_COMPONENT_ISSUE_TIMEOUT_MS,
    },
    client,
  );
  const result = asDocument(write.data);
  if (result === undefined) {
    throw new AppError({
      kind: 'parse',
      message: 'Phản hồi quét linh kiện không có thông tin phiếu.',
    });
  }
  return {
    ...result,
    version: write.etagVersion ?? documentVersion(result),
  };
}

export async function postComponentIssueDocument(
  input: { documentId: string; version: string | number },
  idempotencyKey: string,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    ensureTier?: () => Promise<unknown>;
  } = {},
  client: WarrantyComponentWriteClient = apiClient,
): Promise<ComponentIssueDocument> {
  const version = normalizeIfMatch(input.version);
  if (input.documentId.trim() === '' || version === undefined) {
    throw new AppError({
      kind: 'config',
      message: 'Thiếu mã phiếu hoặc version mới nhất để xác nhận xuất.',
    });
  }
  if (idempotencyKey.trim() === '') {
    throw new AppError({
      kind: 'config',
      message: 'Thiếu Idempotency-Key ổn định để xác nhận xuất.',
    });
  }

  // Chỉ Post làm trừ tồn, nên preflight được đặt sát ngay trước lệnh này.
  await (options.ensureTier ?? requireTierForWrite)();
  const write = await postApproved<unknown>(
    componentIssuePostPath(input.documentId),
    {},
    {
      headers: {
        'If-Match': version,
        'Idempotency-Key': idempotencyKey,
      },
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? WARRANTY_COMPONENT_ISSUE_TIMEOUT_MS,
    },
    client,
  );
  return (
    asDocument(write.data) ?? {
      id: input.documentId,
      version: write.etagVersion,
    }
  );
}

/**
 * Thực hiện chuỗi create → scan → post. Mọi mã phải được đối soát SKU trước
 * khi gọi hàm này; nhờ đó lệnh tạo luôn có đủ line cho từng mã quét.
 */
export async function issueWarrantyComponents(
  input: WarrantyComponentBatchInput,
  options: WarrantyComponentBatchOptions = {},
  client: WarrantyComponentWriteClient = apiClient,
): Promise<WarrantyComponentBatchResult> {
  validateBatch(input);
  const loadDocument = options.loadDocument ?? defaultLoadDocument;
  const completed = new Set(
    (options.completedCodeKeys ?? []).map(code => codeKey(code)),
  );
  let created: ComponentIssueDocument | undefined;
  let id = options.existingDocumentId?.trim();
  if (id === undefined || id === '') {
    options.onProgress?.({ stage: 'creating', completedCodeKeys: [] });
    created = await createComponentIssueDocument(input, options, client);
    id = documentId(created);
  }
  if (id === undefined) {
    throw new AppError({ kind: 'parse', message: 'Không nhận được id phiếu linh kiện.' });
  }

  let current = await freshDocument(created, id, loadDocument);
  if (String(current.status ?? '').toUpperCase() === 'POSTED') {
    return {
      documentId: id,
      issuedLines: input.items.length,
      issuedQuantity: input.items.reduce((sum, item) => sum + item.quantity, 0),
      version: documentVersion(current),
    };
  }
  options.onProgress?.({
    stage: 'created',
    documentId: id,
    version: documentVersion(current),
    completedCodeKeys: Array.from(completed),
  });

  const evidence = scannedCodeKeys(current);
  const pendingCodeKey = options.pendingCodeKey?.trim();
  if (
    pendingCodeKey !== undefined &&
    pendingCodeKey !== '' &&
    !completed.has(codeKey(pendingCodeKey)) &&
    !evidence.has(codeKey(pendingCodeKey))
  ) {
    throw new AppError({
      kind: 'config',
      code: 'COMPONENT_SCAN_RECONCILIATION_REQUIRED',
      message:
        'Không xác minh được mã đang quét dở trên phiếu WMS. Mở phiếu trên Web để đối chiếu trước khi quét lại, tránh xuất trùng.',
    });
  }
  for (const item of input.items) {
    const itemKey = codeKey(item.codeValue);
    // Phản hồi scan đã mất nhưng server đã lưu evidence: nhận lại từ chi tiết,
    // tuyệt đối không gửi scan lần hai cho cùng một mã/hộp.
    if (completed.has(itemKey) || evidence.has(itemKey)) {
      completed.add(itemKey);
      continue;
    }
    const line = lineForSku(current, item.skuId);
    const currentLineId = line === undefined ? undefined : lineId(line);
    const version = documentVersion(current);
    if (currentLineId === undefined) {
      throw new AppError({
        kind: 'parse',
        message: 'Phiếu linh kiện không có dòng cho SKU đã chọn. Không quét vào dòng không xác định.',
      });
    }
    if (version === undefined) {
      throw new AppError({
        kind: 'parse',
        message: 'Phiếu linh kiện không có version để quét an toàn.',
      });
    }
    options.onProgress?.({
      stage: 'scanning',
      documentId: id,
      version,
      completedCodeKeys: Array.from(completed),
      pendingCodeKey: itemKey,
    });
    const scanned = await scanComponentIssueDocument(
      {
        documentId: id,
        lineId: currentLineId,
        version,
        codeValue: item.codeValue,
        quantity: item.quantity,
      },
      options,
      client,
    );
    current = await freshDocument(scanned, id, loadDocument);
    // Một số response scan tối giản không trả lại lines; GET chi tiết là nguồn
    // chuẩn trước lượt scan tiếp theo, tránh dùng line/version cũ.
    if (current.lines === undefined) current = await loadDocument(id);
    completed.add(itemKey);
    options.onProgress?.({
      stage: 'scanned',
      documentId: id,
      version: documentVersion(current),
      completedCodeKeys: Array.from(completed),
    });
  }

  const finalVersion = documentVersion(current);
  if (finalVersion === undefined) {
    throw new AppError({
      kind: 'parse',
      message: 'Không lấy được version mới nhất trước khi xác nhận xuất.',
    });
  }
  options.onProgress?.({
    stage: 'posting',
    documentId: id,
    version: finalVersion,
    completedCodeKeys: Array.from(completed),
  });
  const posted = await postComponentIssueDocument(
    { documentId: id, version: finalVersion },
    input.postIdempotencyKey,
    options,
    client,
  );

  let warrantyCase: WarrantyCase | undefined;
  try {
    warrantyCase = await (options.loadCase ?? fetchWarrantyCase)(input.caseId);
  } catch {
    // Đã Post thành công; lỗi làm mới hồ sơ không được biến thành lỗi xuất.
  }
  return {
    documentId: id,
    issuedLines: input.items.length,
    issuedQuantity: input.items.reduce((sum, item) => sum + item.quantity, 0),
    version: documentVersion(posted) ?? finalVersion,
    warrantyCase,
  };
}
