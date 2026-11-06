import { apiClient, type RequestOptions } from '../../api/client';
import { getActiveSession, type Session } from '../../auth/session';
import { getCurrentEnvironment } from '../../config/env';
import { serverNow } from '../../auth/serverClock';
import { toAppError } from '../../errors/AppError';
import { p03Scope, sameP03Scope, type P03Scope } from './p03Drafts';
import { assertReadOnlyPath } from './readOnlyClient';
import {
  P05ApiError,
  P05_CONTRACT,
  P03_CONTRACT,
  UUID,
  envelope,
  parseContext,
  parseSource,
  parseDraft,
  draftEtagMatches,
} from '../../features/outbound/linked/p05-contract';
import type {
  Service,
  FrozenRequest,
  ResponseData,
  CurrentDocument,
} from '../../features/outbound/linked/types';
import type { P05ResolverBinding } from '../../features/outbound/linked/p05-owner-checks';
export interface P05Client {
  request<T>(options: RequestOptions): Promise<{
    status: number;
    data: T;
    header?: (name: string) => string | undefined;
  }>;
}
const positive = (n: unknown): n is number =>
  Number.isSafeInteger(n) && (n as number) > 0;
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const invalid = (message: string): never => {
  throw new P05ApiError('CONTRACT_INVALID', message, { unknown: true });
};
export function validateP05Frozen(r: FrozenRequest, scope: P03Scope) {
  if (
    !UUID.test(r.key) ||
    !UUID.test(r.draftId) ||
    !UUID.test(r.scanSessionId) ||
    !UUID.test(r.sourceId) ||
    !positive(r.sourceVersion) ||
    r.body.warehouse_id !== scope.warehouseId ||
    r.headers['Idempotency-Key'] !== r.key
  )
    invalid('Định danh yêu cầu không khớp phiên/kho.');
  const record = r.command === 'RECORD',
    save = r.command === 'SAVE',
    expected = record
      ? '/api/v1/mini-app/outbound/record'
      : `/api/v1/mini-app/drafts/${r.draftId}${save ? '' : '/cancel'}`;
  if (
    !['SAVE', 'RECORD', 'CANCEL'].includes(r.command) ||
    r.path !== expected ||
    r.method !== (save ? 'PUT' : 'POST')
  )
    invalid('Yêu cầu nằm ngoài contract P05/P03.');
  const fields = record
    ? [
        'warehouse_id',
        'source_document_id',
        'source_version',
        'expected_total_qty',
        'items',
      ]
    : save
    ? ['warehouse_id', 'operation', 'scan_session_id', 'title', 'codes', 'form']
    : [
        'warehouse_id',
        'operation',
        'scan_session_id',
        'confirmed_request_id',
        'reason',
      ];
  const headers = record
    ? [
        'Idempotency-Key',
        'X-Draft-ID',
        'X-Draft-Scan-Session-ID',
        'X-Draft-Version',
      ]
    : ['Idempotency-Key', 'If-Match'];
  if (
    Object.keys(r.body).some(k => !fields.includes(k)) ||
    Object.keys(r.headers).some(k => !headers.includes(k))
  )
    invalid('Không ghi đè metadata/trường ngoài contract.');
  if (record) {
    if (
      r.headers['X-Draft-ID'] !== r.draftId ||
      r.headers['X-Draft-Scan-Session-ID'] !== r.scanSessionId ||
      !/^\d+$/.test(r.headers['X-Draft-Version'] ?? '') ||
      !positive(Number(r.headers['X-Draft-Version'])) ||
      r.body.source_document_id !== r.sourceId ||
      r.body.source_version !== r.sourceVersion ||
      !positive(r.body.expected_total_qty)
    )
      invalid('Link nguồn/nháp chưa khớp.');
  } else if (
    !/^"\d+"$/.test(r.headers['If-Match'] ?? '') ||
    r.body.operation !== 'OUTBOUND' ||
    r.body.scan_session_id !== r.scanSessionId
  )
    invalid('Version hoặc scan session P03 chưa khớp.');
  if (
    save &&
    (!object(r.body.form) ||
      !object(r.body.form.p05_source) ||
      r.body.form.p05_source.document_id !== r.sourceId ||
      r.body.form.p05_source.version !== r.sourceVersion)
  )
    invalid('Full SAVE thiếu liên kết nguồn.');
  if (
    r.command === 'CANCEL' &&
    (!UUID.test(String(r.body.confirmed_request_id)) ||
      Number(r.headers['If-Match']?.slice(1, -1)) < 1)
  )
    invalid('Chưa có receipt SAVE để hủy.');
  const codes = record ? r.body.items : save ? r.body.codes : [];
  if (
    record &&
    (!Array.isArray(codes) ||
      codes.length !== r.body.expected_total_qty ||
      codes.length < 1 ||
      codes.length > 1000)
  )
    invalid('Số mã không khớp số lượng kế hoạch.');
  if (
    !Array.isArray(codes) ||
    codes.some(
      c =>
        !object(c) ||
        typeof c.raw_code !== 'string' ||
        !c.raw_code.trim() ||
        !['MANUAL', 'CAMERA', 'SCANNER', 'HARDWARE'].includes(
          String(c.scan_source),
        ) ||
        (c.quantity !== undefined && c.quantity !== 1) ||
        Object.keys(c).some(
          k =>
            !(
              record
                ? ['raw_code', 'scan_source']
                : ['raw_code', 'scan_source', 'quantity']
            ).includes(k),
        ),
    )
  )
    invalid('Batch PRODUCT phải quantity1 và giữ đúng raw/source.');
}
export function createP05Service(
  client: P05Client = apiClient,
  readSession: () => Session | undefined = getActiveSession,
): Service {
  async function request(
    path: string,
    options: Omit<RequestOptions, 'path'> = {},
  ): Promise<ResponseData> {
    const captured = p03Scope(readSession()),
      method = options.method ?? 'GET';
    if (method === 'GET') assertReadOnlyPath(path);
    try {
      const r = await client.request<unknown>({
        path,
        ...options,
        timeoutMs: options.timeoutMs ?? 15000,
      });
      if (!sameP03Scope(captured, p03Scope(readSession())))
        throw new P05ApiError('OWNER_CHANGED', 'Phiên/kho đã thay đổi.', {
          unknown: method !== 'GET',
        });
      const b = r.data;
      if (r.status >= 400 || (object(b) && b.success === false))
        throw new P05ApiError(
          String(object(b) && object(b.error) ? b.error.code : 'HTTP_ERROR'),
          object(b) && typeof b.message === 'string'
            ? b.message
            : 'Máy chủ từ chối yêu cầu.',
          { status: r.status, unknown: r.status >= 500 },
        );
      return { status: r.status, body: b, etag: r.header?.('ETag') };
    } catch (error) {
      if (error instanceof P05ApiError) throw error;
      const e = toAppError(error);
      throw new P05ApiError(e.code ?? 'API_READ_ERROR', e.message, {
        status: e.status,
        traceId: e.requestId,
        unknown:
          [
            'network',
            'timeout',
            'parse',
            'cancelled',
            'unknown',
            'blocked_by_edge',
          ].includes(e.kind) || (e.status ?? 0) >= 500,
      });
    }
  }
  const scope = () => p03Scope(readSession());
  return {
    live: client === apiClient,
    fixture: false,
    baseUrl: getCurrentEnvironment().apiBaseUrl,
    now: serverNow,
    async context() {
      return parseContext(
        envelope(
          await request('/api/v1/mini-app/outbound/context'),
          P05_CONTRACT,
        ),
        scope(),
      );
    },
    async sources({ q = '', page = 1, perPage = 20 } = {}) {
      if (
        q.length > 200 ||
        !positive(page) ||
        !positive(perPage) ||
        perPage > 100
      )
        invalid('Bộ lọc nguồn không hợp lệ.');
      const b = envelope(
          await request('/api/v1/mini-app/outbound/sources', {
            query: {
              warehouse_id: scope().warehouseId,
              q: q.trim() ? q : undefined,
              page,
              per_page: perPage,
            },
          }),
          P05_CONTRACT,
        ),
        m = b.meta;
      if (
        !Array.isArray(b.data) ||
        m.warehouse_id !== scope().warehouseId ||
        m.source_kind !== 'WMS_OUTBOUND_DOCUMENT' ||
        m.page !== page ||
        m.per_page !== perPage ||
        !Number.isSafeInteger(m.total) ||
        (m.total as number) < 0 ||
        m.last_page !== Math.max(1, Math.ceil((m.total as number) / perPage)) ||
        b.data.length > perPage
      )
        invalid('Phân trang/nguồn chưa xác minh.');
      const rows = b.data;
      if (!Array.isArray(rows)) return invalid('Thiếu danh sách nguồn.');
      return {
        items: rows.map((v: unknown) => parseSource(v, scope(), serverNow())),
        meta: m as unknown as Awaited<ReturnType<Service['sources']>>['meta'],
      };
    },
    async source(id) {
      if (!UUID.test(id)) invalid('Source ID phải UUID.');
      const d = parseSource(
        envelope(
          await request(`/api/v1/mini-app/outbound/sources/${id}`, {
            query: { warehouse_id: scope().warehouseId },
          }),
          P05_CONTRACT,
        ).data,
        scope(),
        serverNow(),
      );
      if (d.source_document_id !== id)
        invalid('Detail không khớp nguồn đã chọn.');
      return d;
    },
    async resolve(raw, binding?: P05ResolverBinding) {
      if (
        binding &&
        (binding.contract !== 'p05-resolver-owner-v1' ||
          !UUID.test(binding.requestId) ||
          !UUID.test(binding.draftId) ||
          !UUID.test(binding.scanSessionId) ||
          !sameP03Scope(binding.scope, scope()) ||
          binding.body.warehouse_id !== scope().warehouseId ||
          binding.body.raw_code !== raw ||
          binding.outcome !== 'IN_FLIGHT' ||
          (binding.shiftId !== undefined && !UUID.test(binding.shiftId)))
      )
        throw new P05ApiError(
          'P05_CHECK_IDENTITY_REQUIRED',
          'Định danh kiểm mã không khớp body/phiên gốc.',
        );
      if (client === apiClient && (!binding || !binding.shiftId))
        throw new P05ApiError(
          'P05_CHECK_IDENTITY_REQUIRED',
          'Owner chưa xác nhận ca/trace gốc cho lượt kiểm mã.',
        );
      const r = await request('/api/v1/mini-app/outbound/resolve-code', {
        method: 'POST',
        body: { warehouse_id: scope().warehouseId, raw_code: raw },
        ...(binding
          ? {
              headers: {
                'X-Request-ID': binding.requestId,
                ...(binding.shiftId
                  ? { 'X-Work-Shift-ID': binding.shiftId }
                  : {}),
              },
            }
          : {}),
      });
      if (!object(r.body) || r.body.success !== true || !object(r.body.data))
        invalid('Resolver chưa xác minh.');
      const body = r.body;
      if (!object(body) || !object(body.data))
        return invalid('Thiếu resolver.');
      if (
        body.data.warehouse_id !== undefined &&
        body.data.warehouse_id !== scope().warehouseId
      )
        invalid('Resolver không khớp kho đang thao tác.');
      return body.data;
    },
    async execute(r) {
      validateP05Frozen(r, scope());
      return request(r.path, {
        method: r.method,
        body: r.body,
        headers: r.headers,
        timeoutMs: 30000,
      });
    },
    async reconcile(r) {
      return envelope(
        await request(
          `/api/v1/mini-app/drafts/${r.draftId}/requests/${r.key}`,
          {
            query: {
              warehouse_id: scope().warehouseId,
              operation: 'OUTBOUND',
              scan_session_id: r.scanSessionId,
              command: r.command,
            },
          },
        ),
        P03_CONTRACT,
      );
    },
    async draft(id, scan) {
      const r = await request(`/api/v1/mini-app/drafts/${id}`, {
          query: {
            warehouse_id: scope().warehouseId,
            operation: 'OUTBOUND',
            scan_session_id: scan,
          },
        }),
        d = parseDraft(envelope(r, P03_CONTRACT).data, scope(), id, scan);
      if (!draftEtagMatches(r.etag, d.version))
        invalid('ETag/version nháp không khớp.');
      return d;
    },
    async current(id) {
      const b = envelope(
          await request(`/api/v1/mini-app/outbound/documents/${id}`, {
            query: { warehouse_id: scope().warehouseId },
          }),
          P05_CONTRACT,
        ),
        d = b.data;
      if (
        !object(d) ||
        !object(d.document) ||
        d.document.id !== id ||
        d.document.src_warehouse_id !== scope().warehouseId ||
        d.document.status !== d.status ||
        !positive(d.document.version) ||
        !['DRAFT', 'SCANNING', 'POSTED', 'CANCELLED', 'REVERSED'].includes(
          String(d.status),
        ) ||
        d.posted !== (d.status === 'POSTED') ||
        !Array.isArray(d.history) ||
        d.history.some(
          h =>
            !object(h) ||
            !UUID.test(String(h.id)) ||
            h.stock_document_id !== id,
        ) ||
        !Number.isFinite(Date.parse(String(d.observed_at)))
      )
        invalid('Trạng thái hiện tại chưa xác minh.');
      return d as unknown as CurrentDocument;
    },
  };
}
