// Explicit manual-create mode: original P05 body + P03 linked SAVE/RECORD.
// Source-linked service remains separate; never switch mode after a server error.
import { apiClient } from '../../api/client';
import { getActiveSession, type Session } from '../../auth/session';
import { getCurrentEnvironment } from '../../config/env';
import { p03Scope, sameP03Scope, type P03Scope } from './p03Drafts';
import { toAppError } from '../../errors/AppError';
import { createP05Service, type P05Client } from './p05Outbound';
import {
  P05_NUMBERING_CONTRACT,
  P05_NUMBERING_HEADER,
  p05NumberingCapability,
  p05NumberingMeta,
  p05OfficialDraftNumber,
} from './p05Numbering';
import {
  P05ApiError,
  P03_CONTRACT,
  UUID,
  envelope,
  parseDraft,
  parseReceipt,
} from '../../features/outbound/linked/p05-contract';
import type {
  AcceptedCode,
  Context,
  ResponseData,
} from '../../features/outbound/linked/types';
import type { P05CreateForm } from '../../features/outbound/p05CreateForm';
import {
  p05CreateErrors,
  p05DeliveryAddress,
  p05StableJSON,
} from '../../features/outbound/p05CreateForm';
export const P05_RECORD_CONTRACT = 'p05-outbound-record-field-matrix-v1';
export const P05_RECORD_REVISION = 'p05-record-field-matrix-r1';
export const P05_PRODUCTS_CONTRACT = 'mini-app-products-pagination-v2';
export const P05_PRODUCTS_REVISION = 'canonical-sku-id-r1';
const P05_RECORD_FIELDS = new Set([
  'name',
  'warehouse_id',
  'request_no',
  'request_date',
  'recipient_name',
  'recipient_address',
  'recipient_contact_phone',
  'note',
  'expected_total_qty',
  'items',
  'items[].raw_code',
  'items[].scan_source',
]);
export interface P05CreateRequest {
  numberingContract?: typeof P05_NUMBERING_CONTRACT;
  reservedDocumentNo?: string | null;
  mode: 'manual-create';
  command: 'SAVE' | 'RECORD' | 'CANCEL';
  key: string;
  draftId: string;
  scanSessionId: string;
  method: 'PUT' | 'POST';
  path: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  form: P05CreateForm;
  batch: AcceptedCode[];
}
export interface P05Recipient {
  id: string;
  name: string;
  phone: string;
  address: string;
}
export interface P05Catalogue {
  recipients: P05Recipient[];
  groups: string[];
  skuGroups: Record<string, string>;
  recipientError?: string;
  groupError?: string;
}
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
function fail(message: string): never {
  throw new P05ApiError('CONTRACT_INVALID', message, { unknown: true });
}
function recordFieldList(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.some(
      field => typeof field !== 'string' || !P05_RECORD_FIELDS.has(field),
    ) ||
    new Set(value).size !== value.length
  )
    fail('Field matrix P05 chưa hợp lệ.');
  return value as string[];
}
function recordFieldError(body: Record<string, unknown>): string {
  const error = obj(body.error) ? body.error : undefined,
    details = obj(error?.details) ? error.details : undefined;
  if (
    error?.code !== 'OUTBOUND_RECORD_FIELDS_REQUIRED' ||
    details?.contract !== P05_RECORD_CONTRACT ||
    details.revision !== P05_RECORD_REVISION ||
    details.record_allowed !== false
  )
    fail('Lỗi field matrix P05 chưa khớp contract.');
  const missing = recordFieldList(details.missing_fields),
    invalid = recordFieldList(details.invalid_fields);
  if (!missing.length && !invalid.length)
    fail('Field matrix P05 không chỉ ra trường cần xử lý.');
  return [
    missing.length ? 'Thiếu: ' + missing.join(', ') + '.' : '',
    invalid.length ? 'Chưa hợp lệ: ' + invalid.join(', ') + '.' : '',
  ]
    .filter(Boolean)
    .join(' ');
}
export function validateP05CreateRequest(r: P05CreateRequest, scope: P03Scope) {
  if (
    r.mode !== 'manual-create' ||
    ![r.key, r.draftId, r.scanSessionId].every(v => UUID.test(v)) ||
    r.body.warehouse_id !== scope.warehouseId ||
    r.headers['Idempotency-Key'] !== r.key
  )
    fail('Định danh yêu cầu tạo phiếu không khớp.');
  const record = r.command === 'RECORD',
    save = r.command === 'SAVE';
  const path = record
    ? '/api/v1/mini-app/outbound/record'
    : `/api/v1/mini-app/drafts/${r.draftId}${save ? '' : '/cancel'}`;
  const fields = record
    ? [
        'name',
        'warehouse_id',
        'recipient_name',
        'recipient_address',
        'recipient_contact_phone',
        'note',
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
  if (r.numberingContract === P05_NUMBERING_CONTRACT)
    headers.push(P05_NUMBERING_HEADER);
  if (
    (r.numberingContract !== undefined &&
      r.numberingContract !== P05_NUMBERING_CONTRACT) ||
    (r.numberingContract === P05_NUMBERING_CONTRACT
      ? r.headers[P05_NUMBERING_HEADER] !== P05_NUMBERING_CONTRACT
      : r.headers[P05_NUMBERING_HEADER] !== undefined) ||
    (r.numberingContract &&
      record &&
      (!r.reservedDocumentNo ||
        !/^PX-\d{8}-\d{4,}$/.test(r.reservedDocumentNo)))
  )
    fail('Yêu cầu cấp số PX chưa giữ đúng contract hoặc số đã được xác nhận.');
  if (
    !['SAVE', 'RECORD', 'CANCEL'].includes(r.command) ||
    r.path !== path ||
    r.method !== (save ? 'PUT' : 'POST') ||
    Object.keys(r.body).some(k => !fields.includes(k)) ||
    Object.keys(r.headers).some(k => !headers.includes(k))
  )
    fail('Yêu cầu ngoài contract tạo phiếu P05/P03.');
  const batch = r.batch.map(c => ({
    raw_code: c.raw,
    scan_source: c.source,
  }));
  if (record) {
    if (
      Object.keys(p05CreateErrors(r.form)).length ||
      r.batch.length !== Number(r.form.plannedInput) ||
      r.body.expected_total_qty !== r.batch.length ||
      JSON.stringify(r.body.items) !== JSON.stringify(batch) ||
      r.headers['X-Draft-ID'] !== r.draftId ||
      r.headers['X-Draft-Scan-Session-ID'] !== r.scanSessionId ||
      !/^[1-9][0-9]*$/.test(r.headers['X-Draft-Version'] || '')
    )
      fail('Form/kế hoạch/SAVE chưa đủ để RECORD.');
    if (
      r.body.name !== r.form.name ||
      r.body.recipient_name !== r.form.recipient ||
      r.body.recipient_contact_phone !== r.form.phone ||
      r.body.recipient_address !== p05DeliveryAddress(r.form) ||
      r.body.note !== r.form.note
    )
      fail('Metadata RECORD khác snapshot đang giữ.');
  } else if (
    r.body.operation !== 'OUTBOUND' ||
    r.body.scan_session_id !== r.scanSessionId ||
    !/^"\d+"$/.test(r.headers['If-Match'] || '')
  )
    fail('Version/scope nháp không khớp.');
  if (
    save &&
    (JSON.stringify(r.body.codes) !== JSON.stringify(batch) ||
      !obj(r.body.form) ||
      p05StableJSON(r.body.form.p05_create) !==
        p05StableJSON({
          ...r.form,
          address_dataset: 'provinces.open-api.vn/v2',
        }))
  )
    fail('SAVE thiếu toàn bộ thông tin form/mã.');
  if (
    r.command === 'CANCEL' &&
    (!UUID.test(String(r.body.confirmed_request_id)) ||
      Number(r.headers['If-Match'].slice(1, -1)) < 1)
  )
    fail('Chưa có SAVE receipt để hủy.');
  if (
    r.batch.some(
      c =>
        !UUID.test(c.itemId) ||
        !UUID.test(c.skuId) ||
        c.quantity !== 1 ||
        !c.raw.trim() ||
        !['MANUAL', 'CAMERA', 'SCANNER', 'HARDWARE'].includes(c.source),
    ) ||
    new Set(r.batch.map(c => c.itemId)).size !== r.batch.length
  )
    fail('Batch phải là PRODUCT đơn lẻ, không trùng hiện vật.');
}
export function verifyP05CreateRecord(
  r: ResponseData,
  request: P05CreateRequest,
  scope: P03Scope,
) {
  const b = r.body;
  if (
    ![200, 201].includes(r.status) ||
    !obj(b) ||
    b.success !== true ||
    !obj(b.data) ||
    !obj(b.meta) ||
    b.meta.contract !== P05_RECORD_CONTRACT ||
    b.meta.revision !== P05_RECORD_REVISION ||
    !obj(b.meta.p03_draft)
  )
    fail('Chưa xác minh được RECORD tạo phiếu.');
  const data = b.data,
    link = b.meta.p03_draft,
    id = data.id ?? data.document_id,
    no = data.doc_no ?? data.document_no;
  if (
    request.numberingContract &&
    (no !== request.reservedDocumentNo ||
      (obj(b.meta.p03_draft) &&
        obj(b.meta.p03_draft.document) &&
        b.meta.p03_draft.document.document_no !== undefined &&
        b.meta.p03_draft.document.document_no !== no))
  )
    fail('Mã phiếu ghi nhận khác mã PX đã được cấp cho nháp.');
  if (
    typeof id !== 'string' ||
    !UUID.test(id) ||
    typeof no !== 'string' ||
    !no ||
    data.status !== 'SCANNING' ||
    data.readiness !== 'READY' ||
    data.record_allowed !== true ||
    recordFieldList(data.missing_fields).length !== 0 ||
    recordFieldList(data.invalid_fields).length !== 0 ||
    data.name !== (request.form.name.trim() || null) ||
    data.movement_created !== false ||
    data.posted === true ||
    (data.stock_effect !== undefined && data.stock_effect !== 'NONE')
  )
    fail('Chưa có mã phiếu/ID/trạng thái chờ Web hợp lệ.');
  const receipt = parseReceipt(link.receipt, request),
    draft = parseDraft(
      link.document,
      scope,
      request.draftId,
      request.scanSessionId,
    );
  if (
    draft.status !== 'RECORDED' ||
    draft.business_document_id !== id ||
    draft.version !== receipt.version ||
    JSON.stringify(
      draft.codes.map(c => ({
        raw_code: c.raw_code,
        scan_source: c.scan_source,
      })),
    ) !== JSON.stringify(request.body.items) ||
    p05StableJSON(draft.form.p05_create) !==
      p05StableJSON({
        ...request.form,
        address_dataset: 'provinces.open-api.vn/v2',
      })
  )
    fail('RECORD chưa liên kết đúng nháp và toàn bộ form.');
  return { receipt, draft, documentId: id, documentNo: no };
}
export function createP05CreateService(
  client: P05Client = apiClient,
  readSession: () => Session | undefined = getActiveSession,
) {
  const common = createP05Service(client, readSession),
    scope = () => p03Scope(readSession());
  async function request(
    path: string,
    options: Parameters<P05Client['request']>[0] = { path },
  ) {
    const captured = scope();
    try {
      const r = await client.request<unknown>({
        ...options,
        path,
        timeoutMs: options.timeoutMs ?? 15000,
      });
      if (!sameP03Scope(captured, scope()))
        throw new P05ApiError('OWNER_CHANGED', 'Phiên/kho đã thay đổi.', {
          unknown: options.method !== 'GET',
        });
      if (r.status >= 400 || (obj(r.data) && r.data.success === false)) {
        const b = r.data;
        const errorCode =
          obj(b) && obj(b.error) ? String(b.error.code) : 'HTTP_ERROR';
        throw new P05ApiError(
          errorCode,
          obj(b) && errorCode === 'OUTBOUND_RECORD_FIELDS_REQUIRED'
            ? recordFieldError(b)
            : obj(b) && typeof b.message === 'string'
            ? b.message
            : 'Máy chủ từ chối yêu cầu.',
          { status: r.status, unknown: r.status >= 500 },
        );
      }
      return { status: r.status, body: r.data, etag: r.header?.('ETag') };
    } catch (error) {
      if (error instanceof P05ApiError) throw error;
      const e = toAppError(error);
      throw new P05ApiError(e.code ?? 'API_ERROR', e.message, {
        status: e.status,
        traceId: e.requestId,
        unknown:
          ['network', 'timeout', 'parse', 'cancelled', 'unknown'].includes(
            e.kind,
          ) || (e.status ?? 0) >= 500,
      });
    }
  }
  const assertCatalogueRead = (signal?: AbortSignal) => {
    if (signal?.aborted)
      throw new P05ApiError('READ_CANCELLED', 'Đã dừng đọc danh mục.', {
        unknown: false,
      });
  };
  async function list(path: string, signal?: AbortSignal) {
    const pageSize = 50,
      maxPages = 200,
      // Bounded fan-out avoids serially waiting for a large, read-only
      // catalogue while keeping the DEV/TEST API below a request burst.
      concurrency = 4;
    type Page = {
      rows: Record<string, unknown>[];
      total: number;
      last: number;
      snapshotRevision?: string;
      strictCanonical: boolean;
    };
    const readPage = async (
      page: number,
      expected?: Pick<
        Page,
        'total' | 'last' | 'snapshotRevision' | 'strictCanonical'
      >,
    ): Promise<Page> => {
      assertCatalogueRead(signal);
      const r = await request(path, {
        path,
        method: 'GET',
        signal,
        query: { page, per_page: pageSize },
      });
      assertCatalogueRead(signal);
      const b = r.body;
      if (
        !obj(b) ||
        b.success !== true ||
        !Array.isArray(b.data) ||
        !obj(b.meta) ||
        b.meta.current_page !== page ||
        b.meta.per_page !== pageSize ||
        !Number.isSafeInteger(b.meta.total) ||
        (b.meta.total as number) < 0 ||
        !Number.isSafeInteger(b.meta.last_page) ||
        (b.meta.last_page as number) < 1
      )
        fail('Phân trang danh mục chưa xác minh.');
      const total = b.meta.total as number,
        last = b.meta.last_page as number,
        productCatalogue = path === '/api/v1/mini-app/products',
        hasV2Contract = productCatalogue && b.meta.contract !== undefined;
      let snapshotRevision: string | undefined;
      if (hasV2Contract) {
        const sort = b.meta.sort;
        if (
          b.meta.contract !== P05_PRODUCTS_CONTRACT ||
          b.meta.revision !== P05_PRODUCTS_REVISION ||
          b.meta.snapshot_consistent !== false ||
          b.meta.distinct_key !== 'sku_id' ||
          !Array.isArray(sort) ||
          sort.length !== 1 ||
          !obj(sort[0]) ||
          sort[0].field !== 'sku_id' ||
          sort[0].direction !== 'ASC' ||
          typeof b.meta.snapshot_revision !== 'string' ||
          !b.meta.snapshot_revision
        )
          fail('Contract phân trang sản phẩm v2 chưa xác minh.');
        if (!/^(?:W\/)?"[^"\r\n]+"$/.test(r.etag ?? ''))
          fail('ETag của catalog sản phẩm chưa xác minh.');
        snapshotRevision = b.meta.snapshot_revision;
      }
      if (
        last !== Math.max(1, Math.ceil(total / pageSize)) ||
        (expected &&
          (expected.total !== total ||
            expected.last !== last ||
            expected.strictCanonical !== hasV2Contract ||
            (hasV2Contract && expected.snapshotRevision !== snapshotRevision)))
      )
        throw new P05ApiError(
          'CATALOGUE_CHANGED',
          'Danh mục thay đổi trong lúc tải. Vui lòng tải lại.',
        );
      const rows = b.data.map(row => {
        if (!obj(row)) fail('Dòng danh mục không hợp lệ.');
        return row;
      });
      return {
        rows,
        total,
        last,
        snapshotRevision,
        strictCanonical: hasV2Contract,
      };
    };
    const first = await readPage(1);
    if (first.last > maxPages) return fail('Danh mục vượt giới hạn tải.');
    const pages: Record<string, unknown>[][] = Array.from(
      { length: first.last },
      () => [],
    );
    pages[0] = first.rows;
    let nextPage = 2;
    const worker = async () => {
      while (nextPage <= first.last) {
        const page = nextPage++;
        const result = await readPage(page, first);
        pages[page - 1] = result.rows;
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(concurrency, Math.max(0, first.last - 1)) },
        worker,
      ),
    );
    const ids = new Map<string, Record<string, unknown>>(),
      rows = pages.flat();
    for (const row of rows) {
      const id = String(row.agency_id ?? row.sku_id ?? '');
      if (!UUID.test(id)) fail(`Danh mục ${path} thiếu định danh hợp lệ.`);
      const previous = ids.get(id);
      if (previous) {
        if (
          path === '/api/v1/mini-app/products' &&
          [
            'sku_code',
            'sku_type',
            'status',
            'category_name',
            'brand_name',
          ].every(key => (previous[key] ?? null) === (row[key] ?? null))
        )
          continue;
        fail(`Danh mục ${path} lặp định danh không nhất quán.`);
      }
      ids.set(id, row);
    }
    if (rows.length !== first.total) fail('Danh mục chưa đủ theo tổng server.');
    if (first.strictCanonical && ids.size !== first.total)
      fail('Danh mục canonical chưa đủ theo tổng server.');
    return rows;
  }
  return {
    live: client === apiClient,
    baseUrl: getCurrentEnvironment().apiBaseUrl,
    async context() {
      const c = await common.context();
      p05NumberingCapability(c);
      return c;
    },
    resolve: common.resolve,
    async draft(id: string, scan: string, numbering = false) {
      if (!UUID.test(id) || !UUID.test(scan))
        fail('Định danh nháp không hợp lệ.');
      const r = await request('/api/v1/mini-app/drafts/' + id, {
        path: '',
        method: 'GET',
        query: {
          warehouse_id: scope().warehouseId,
          operation: 'OUTBOUND',
          scan_session_id: scan,
        },
        ...(numbering
          ? { headers: { [P05_NUMBERING_HEADER]: P05_NUMBERING_CONTRACT } }
          : {}),
      });
      const b = envelope(r, P03_CONTRACT);
      if (numbering) p05NumberingMeta(b);
      const d = parseDraft(b.data, scope(), id, scan);
      if (numbering) p05OfficialDraftNumber(d);
      return d;
    },
    current: common.current,
    async catalogue(signal?: AbortSignal): Promise<P05Catalogue> {
      assertCatalogueRead(signal);
      const [recipientResult, productResult] = await Promise.allSettled([
        list('/api/v1/recipients', signal).then(rows =>
          rows
            .filter(v => v.status === 'ACTIVE')
            .map(v => {
              if (typeof v.agency_name !== 'string' || !v.agency_name)
                fail('Thiếu tên người nhận.');
              return {
                id: String(v.agency_id),
                name: v.agency_name,
                phone: typeof v.phone === 'string' ? v.phone : '',
                address: typeof v.address === 'string' ? v.address : '',
              };
            }),
        ),
        list('/api/v1/mini-app/products', signal),
      ]);
      assertCatalogueRead(signal);
      const recipients =
        recipientResult.status === 'fulfilled' ? recipientResult.value : [];
      const products =
        productResult.status === 'fulfilled' ? productResult.value : [];
      const message = (v: PromiseRejectedResult) =>
        v.reason instanceof Error
          ? v.reason.message
          : 'Không đọc được danh mục.';
      const skuGroups: Record<string, string> = {};
      for (const p of products)
        if (
          p.status === 'ACTIVE' &&
          p.sku_type === 'PRODUCT' &&
          typeof p.category_name === 'string' &&
          p.category_name
        )
          skuGroups[String(p.sku_id)] = p.category_name;
      return {
        ...(recipientResult.status === 'rejected'
          ? { recipientError: message(recipientResult) }
          : {}),
        ...(productResult.status === 'rejected'
          ? { groupError: message(productResult) }
          : {}),
        recipients,
        groups: [...new Set(Object.values(skuGroups))].sort((a, b) =>
          a.localeCompare(b, 'vi'),
        ),
        skuGroups,
      };
    },
    async execute(r: P05CreateRequest) {
      validateP05CreateRequest(r, scope());
      return request(r.path, {
        path: r.path,
        method: r.method,
        body: r.body,
        headers: r.headers,
        timeoutMs: 30000,
      });
    },
    async reconcile(r: P05CreateRequest) {
      return envelope(
        await request(
          `/api/v1/mini-app/drafts/${r.draftId}/requests/${r.key}`,
          {
            path: '',
            method: 'GET',
            query: {
              warehouse_id: scope().warehouseId,
              operation: 'OUTBOUND',
              scan_session_id: r.scanSessionId,
              command: r.command,
            },
            ...(r.numberingContract
              ? { headers: { [P05_NUMBERING_HEADER]: r.numberingContract } }
              : {}),
          },
        ),
        P03_CONTRACT,
      );
    },
  };
}
export type P05CreateService = ReturnType<typeof createP05CreateService>;
export type P05CreateContext = Context;
