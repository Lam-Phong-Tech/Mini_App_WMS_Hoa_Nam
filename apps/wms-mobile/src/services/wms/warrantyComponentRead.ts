/** P20 GET-only owner: POSTED links + bounded per-ID proof hydration. */
import { AppError, toAppError } from '../../errors/AppError';
import { apiClient, type ApiResponse } from '../../api/client';
import {
  captureSessionScope,
  isSessionScopeCurrent,
  getActiveSession,
} from '../../auth/session';
import type { ReadClient, ReadOptions } from './readOnlyClient';
export const P20_CONTRACT = 'p20-component-history-v1';
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
type Scope = ReturnType<typeof captureSessionScope>;
export type QuantityStatus = 'CONFIRMED' | 'INCOMPLETE' | 'MISMATCH';
export type RawCodeStatus =
  | 'RECORDED'
  | 'NOT_RECORDED'
  | 'UNAVAILABLE'
  | 'IDENTITY_MISMATCH';
export interface WarrantyComponentIssuedLine {
  readonly id: string;
  readonly skuCode?: string;
  readonly skuName?: string;
  readonly unit: string | null;
  readonly unitSource: 'CURRENT_SKU_CATALOG' | 'NOT_RECORDED';
  readonly quantity: number | null;
  readonly quantityStatus: QuantityStatus;
  readonly scannedCodeCount: number | null;
  readonly codes: readonly { rawCode: string | null; status: RawCodeStatus }[];
}
export interface WarrantyComponentHistoryDocument {
  readonly id: string;
  readonly documentNumber?: string;
  readonly postedAt: string | null;
  readonly lines: readonly WarrantyComponentIssuedLine[];
  readonly quantityTotal?: number | null;
  readonly quantityStatus?: QuantityStatus;
  readonly totalsByUnit?: Readonly<Record<string, number>> | null;
  readonly detailUnavailable?: boolean;
  readonly detailError?: string;
}
export interface WarrantyComponentHistoryPage {
  readonly documents: readonly WarrantyComponentHistoryDocument[];
  readonly page: number | null;
  readonly total: number;
  readonly hasMore: boolean;
  readonly nextPage: number | null;
  readonly nextCursor: string | null;
}
function invalid(message: string): never {
  throw new AppError({ kind: 'parse', code: 'P20_INVALID_RESPONSE', message });
}
function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('Dữ liệu lịch sử chưa được xác minh.');
  return v as Record<string, unknown>;
}
function number(v: unknown): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0)
    invalid('Số lượng/tổng nguồn không hợp lệ.');
  return v;
}
function optionalText(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}
function nullableText(v: unknown): string | null {
  if (v === null) return null;
  if (typeof v !== 'string') invalid('Trường lịch sử không hợp lệ.');
  return v;
}
function status(v: unknown): QuantityStatus {
  if (v !== 'CONFIRMED' && v !== 'INCOMPLETE' && v !== 'MISMATCH')
    invalid('Thiếu bằng chứng số lượng.');
  return v;
}
function qty(v: unknown, s: QuantityStatus): number | null {
  if (s === 'CONFIRMED') return number(v);
  if (v !== null) invalid('Lượng chưa xác minh phải giữ null.');
  return null;
}
function scope(): Scope {
  const s = captureSessionScope();
  if (
    !getActiveSession() ||
    !isSessionScopeCurrent(s) ||
    !s.authSessionId ||
    !s.userId ||
    !s.warehouseId ||
    !uuid.test(s.warehouseId)
  )
    throw new AppError({
      kind: 'blocked_by_gate',
      code: 'P20_CONTEXT_REQUIRED',
      message: 'Cần phiên và kho đã xác nhận để đọc lịch sử.',
    });
  return s;
}
function current(s: Scope) {
  if (!getActiveSession() || !isSessionScopeCurrent(s))
    throw new AppError({
      kind: 'cancelled',
      code: 'P20_STALE_SCOPE',
      message: 'Ngữ cảnh lịch sử đã thay đổi.',
    });
}
function envelope(r: ApiResponse<unknown>, s: Scope) {
  current(s);
  const body = obj(r.data),
    meta = obj(body.meta);
  if (
    r.status !== 200 ||
    body.success !== true ||
    meta.component_history_contract !== P20_CONTRACT ||
    meta.warehouse_id !== s.warehouseId ||
    meta.read_only !== true ||
    meta.operation_receipt !== false
  )
    invalid('Thiếu contract lịch sử P20.');
  return { body, meta };
}
function link(
  value: unknown,
  caseId: string,
  s: Scope,
): WarrantyComponentHistoryDocument {
  const raw = obj(value),
    id = raw.component_issue_document_id;
  if (
    typeof id !== 'string' ||
    !uuid.test(id) ||
    raw.warranty_case_id !== caseId ||
    raw.warehouse_id !== s.warehouseId ||
    raw.status !== 'POSTED' ||
    typeof raw.can_open !== 'boolean'
  )
    invalid('Phiếu lịch sử không đúng hồ sơ/kho/trạng thái.');
  if (
    raw.can_open &&
    raw.detail_url !== '/api/v1/mini-app/warranty-component-issues/' + id
  )
    invalid('URL chi tiết không đúng owner.');
  return {
    id,
    documentNumber: optionalText(raw.document_no),
    postedAt: nullableText(raw.posted_at),
    lines: [],
    ...(raw.can_open
      ? {}
      : {
          detailUnavailable: true,
          detailError: 'Nguồn không cho phép mở chi tiết.',
        }),
  };
}
function detail(
  payload: unknown,
  summary: WarrantyComponentHistoryDocument,
  caseId: string,
  s: Scope,
): WarrantyComponentHistoryDocument {
  const data = obj(payload),
    d = obj(data.document),
    history = obj(data.history);
  if (
    d.id !== summary.id ||
    d.warranty_case_id !== caseId ||
    d.warehouse_id !== s.warehouseId ||
    d.status !== 'POSTED' ||
    !Array.isArray(data.lines) ||
    history.contract !== P20_CONTRACT ||
    history.is_operation_receipt !== false ||
    history.read_stock_effect !== 'NONE'
  )
    invalid('Bằng chứng không thuộc phiếu POSTED được yêu cầu.');
  const lines = data.lines.map(lineValue => {
    const line = obj(lineValue);
    if (
      typeof line.id !== 'string' ||
      !uuid.test(line.id) ||
      !Array.isArray(line.items)
    )
      invalid('Dòng linh kiện không có ID/bằng chứng nguồn.');
    const quantityStatus = status(line.quantity_status),
      quantity = qty(line.issued_qty, quantityStatus);
    const codes = line.items.map(itemValue => {
      const item = obj(itemValue),
        rawStatus = item.raw_code_status;
      if (
        item.status !== 'POSTED' ||
        item.line_id !== line.id ||
        ![
          'RECORDED',
          'NOT_RECORDED',
          'UNAVAILABLE',
          'IDENTITY_MISMATCH',
        ].includes(String(rawStatus))
      )
        invalid('Mã quét không đúng dòng POSTED.');
      const rawCode = nullableText(item.raw_code);
      if (
        rawStatus === 'RECORDED'
          ? rawCode === null || rawCode.length === 0
          : rawCode !== null
      )
        invalid('Mã thiếu/mâu thuẫn bằng chứng nguồn.');
      return { rawCode, status: rawStatus as RawCodeStatus };
    });
    const unit = nullableText(line.unit);
    if (
      line.unit_source !==
      (unit === null ? 'NOT_RECORDED' : 'CURRENT_SKU_CATALOG')
    )
      invalid('Đơn vị chưa có nguồn catalog được xác nhận.');
    return {
      id: line.id,
      skuCode: optionalText(line.sku_code),
      skuName: optionalText(line.sku_name),
      unit,
      unitSource: line.unit_source as 'CURRENT_SKU_CATALOG' | 'NOT_RECORDED',
      quantity,
      quantityStatus,
      codes,
      scannedCodeCount:
        codes.length && codes.every(c => c.status === 'RECORDED')
          ? new Set(codes.map(c => c.rawCode)).size
          : null,
    };
  });
  if (new Set(lines.map(l => l.id)).size !== lines.length)
    invalid('Dòng lịch sử bị trùng ID.');
  const quantityStatus = status(history.quantity_status),
    quantityTotal = qty(history.quantity_total, quantityStatus);
  if (
    quantityStatus === 'CONFIRMED' &&
    (lines.some(l => l.quantity === null) ||
      lines.reduce((n, l) => n + (l.quantity ?? 0), 0) !== quantityTotal)
  )
    invalid('Tổng đã xác nhận không khớp bằng chứng từng dòng.');
  const totalsByUnit =
    history.totals_by_unit === null ? null : obj(history.totals_by_unit);
  if (totalsByUnit) Object.values(totalsByUnit).forEach(number);
  return {
    id: summary.id,
    documentNumber: optionalText(d.component_issue_no),
    postedAt: nullableText(d.posted_at),
    lines,
    quantityTotal,
    quantityStatus,
    totalsByUnit: totalsByUnit as Readonly<Record<string, number>> | null,
  };
}
export async function fetchPostedWarrantyComponentHistoryPage(
  caseId: string,
  options: ReadOptions = {},
  client: ReadClient = apiClient,
): Promise<WarrantyComponentHistoryPage> {
  const s = scope();
  if (!uuid.test(caseId))
    throw new AppError({ kind: 'config', message: 'Cần ID hồ sơ thật.' });
  const q = options.query ?? {};
  if (
    Object.keys(q).some(
      k => !['page', 'per_page', 'cursor', 'warehouse_id'].includes(k),
    ) ||
    (q.warehouse_id !== undefined && q.warehouse_id !== s.warehouseId) ||
    ('page' in q && 'cursor' in q)
  )
    throw new AppError({
      kind: 'config',
      message: 'Query lịch sử không đúng owner/scope.',
    });
  const perPage = q.per_page ?? 20,
    page = 'cursor' in q ? null : q.page ?? 1;
  if (
    typeof perPage !== 'number' ||
    !Number.isInteger(perPage) ||
    perPage < 1 ||
    perPage > 100 ||
    (page !== null &&
      (typeof page !== 'number' ||
        !Number.isInteger(page) ||
        page < 1 ||
        page > 100000)) ||
    ('cursor' in q && (typeof q.cursor !== 'string' || !q.cursor))
  )
    throw new AppError({
      kind: 'config',
      message: 'Phân trang P20 không hợp lệ.',
    });
  const headers = { 'X-Component-History-Contract': P20_CONTRACT };
  const { body, meta } = envelope(
    await client.get<unknown>(
      '/api/v1/mini-app/warranty-cases/' + caseId + '/component-issues',
      {
        signal: options.signal,
        timeoutMs: options.timeoutMs,
        headers,
        query: {
          warehouse_id: s.warehouseId,
          per_page: perPage,
          ...(page === null ? { cursor: q.cursor } : { page }),
        },
      },
    ),
    s,
  );
  if (
    !Array.isArray(body.data) ||
    typeof meta.hasMore !== 'boolean' ||
    !(meta.nextCursor === null || typeof meta.nextCursor === 'string') ||
    !(meta.nextPage === null || typeof meta.nextPage === 'number')
  )
    invalid('Thiếu metadata phân trang P20.');
  const total = number(meta.total),
    nextPage = meta.nextPage === null ? null : number(meta.nextPage),
    nextCursor = meta.nextCursor as string | null;
  if (
    body.data.length > perPage ||
    body.data.length > total ||
    (meta.hasMore
      ? page === null
        ? !nextCursor || nextCursor === q.cursor
        : nextPage !== Number(page) + 1
      : nextPage !== null || nextCursor !== null)
  )
    invalid('Phân trang nguồn không nhất quán.');
  const links = body.data.map(v => link(v, caseId, s));
  if (new Set(links.map(l => l.id)).size !== links.length)
    invalid('Phiếu lịch sử bị trùng ID.');
  const hydrate = async (l: WarrantyComponentHistoryDocument) => {
    if (l.detailUnavailable) return l;
    const { body: detailEnvelope } = envelope(
      await client.get<unknown>(
        '/api/v1/mini-app/warranty-component-issues/' + l.id,
        {
          signal: options.signal,
          timeoutMs: options.timeoutMs,
          headers,
          query: { warehouse_id: s.warehouseId },
        },
      ),
      s,
    );
    return detail(detailEnvelope.data, l, caseId, s);
  };
  const settled: PromiseSettledResult<WarrantyComponentHistoryDocument>[] = [];
  for (let offset = 0; offset < links.length; offset += 4) {
    current(s);
    const batch = await Promise.allSettled(
      links.slice(offset, offset + 4).map(hydrate),
    );
    current(s);
    for (const r of batch)
      if (r.status === 'rejected' && toAppError(r.reason).status === 401)
        throw toAppError(r.reason);
    settled.push(...batch);
  }
  current(s);
  const documents = settled.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const e = toAppError(r.reason);
    if (e.kind === 'cancelled' || e.status === 401) throw e;
    return { ...links[i], detailUnavailable: true, detailError: e.message };
  });
  return {
    documents,
    page: page as number | null,
    total,
    hasMore: meta.hasMore,
    nextPage,
    nextCursor,
  };
}
/** Direct owner detail for a selected immutable link, even outside the loaded page. */
export async function fetchPostedWarrantyComponentHistoryDocument(
  caseId: string,
  documentId: string,
  options: ReadOptions = {},
  client: ReadClient = apiClient,
): Promise<WarrantyComponentHistoryDocument> {
  const s = scope();
  if (!uuid.test(caseId) || !uuid.test(documentId))
    throw new AppError({
      kind: 'config',
      code: 'P20_CANONICAL_ID_REQUIRED',
      message: 'Cần đúng ID hồ sơ và phiếu đã xuất.',
    });
  const { body } = envelope(
    await client.get<unknown>(
      '/api/v1/mini-app/warranty-component-issues/' + documentId,
      {
        signal: options.signal,
        timeoutMs: options.timeoutMs,
        headers: { 'X-Component-History-Contract': P20_CONTRACT },
        query: { warehouse_id: s.warehouseId },
      },
    ),
    s,
  );
  return detail(
    body.data,
    { id: documentId, postedAt: null, lines: [] },
    caseId,
    s,
  );
}

export async function fetchPostedWarrantyComponentHistory(
  caseId: string,
  options: ReadOptions = {},
  client: ReadClient = apiClient,
): Promise<readonly WarrantyComponentHistoryDocument[]> {
  return (
    await fetchPostedWarrantyComponentHistoryPage(caseId, options, client)
  ).documents;
}
