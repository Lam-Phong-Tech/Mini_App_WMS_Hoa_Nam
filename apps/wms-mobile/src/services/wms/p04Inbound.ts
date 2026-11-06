import {
  apiClient,
  type ApiResponse,
  type RequestOptions,
} from '../../api/client';
import { getActiveSession, type Session } from '../../auth/session';
import { AppError } from '../../errors/AppError';
import { assertP03ReconcileIdentity } from './p03ReconcileIdentity';
import {
  parseP03Draft,
  parseP03Receipt,
  p03Scope,
  sameP03Scope,
  requireP03Uuid,
  type P03Scope,
  type P03Identity,
  type P03Draft,
  type P03Receipt,
  type P03Client,
  type P03RequestCommand,
} from './p03Drafts';
export const P04_CONTRACT = 'mini-app-p04-v1',
  P04_BASE = '/api/v1/mini-app/inbound';
export interface P04Item {
  raw_code: string;
  quantity: number;
  scan_source: 'CAMERA' | 'SCANNER' | 'HARDWARE' | 'MANUAL';
  item_type?: 'ITEM' | 'BOX';
  box_number?: string | null;
  new_sku_type?: 'PRODUCT' | 'COMPONENT' | null;
}
export interface P04Body {
  warehouse_id: string;
  scan_session_id: string;
  inbound_type: 'receipt';
  inbound_category?: 'PRODUCT' | 'COMPONENT' | 'OTHER';
  supplier_id: string | null;
  name: string;
  note: string;
  doc_date?: string;
  items: P04Item[];
}
export interface P04Resolved {
  item_type: 'ITEM' | 'BOX';
  sku_id: string | null;
  sku_code: string;
  sku_name: string | null;
  sku_type: 'PRODUCT' | 'COMPONENT' | null;
  item_id: string | null;
  item_unique: string | null;
  serial_number: string | null;
  box_number: string | null;
  requires_quantity: boolean;
  requires_new_sku_type: boolean;
  is_serial_tracked: boolean;
  warehouse_id: string;
  stock_effect: 'NONE';
}
export interface P04Row {
  row_no: number;
  raw_code: string;
  outcome: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED';
  reason_code: string | null;
  quantity?: number;
  resolved?: P04Resolved;
  message?: string;
}
export interface P04Draft extends P03Draft {
  actor_id: string;
  document_no: string | null;
  metadata: Omit<P04Body, 'warehouse_id' | 'scan_session_id' | 'items'>;
  items: P04Item[];
  scan_session: {
    status: 'OPEN' | 'CLOSED';
    document_version: number;
    expires_at: null;
    expiry_policy: 'AUTH_SESSION';
  };
  created_at: string;
  updated_at: string;
}
export interface P04Context {
  actor_id: string;
  auth_session_id: string;
  active_warehouse_id: string | null;
  warehouse_context: {
    status: 'READY' | 'REQUIRED' | 'UNAVAILABLE';
    error_code?: string;
  };
  warehouse_status: 'ACTIVE' | 'INACTIVE' | null;
  inbound_supported: boolean;
  permissions: {
    read: boolean;
    save: boolean;
    cancel: boolean;
    record: boolean;
  };
  available_warehouses: {
    warehouse_id: string;
    name: string;
    code: string;
    status: string;
  }[];
  ui_metadata_extension?: 'p04-ui-options-v1';
  inbound_categories?: {
    id: 'PRODUCT' | 'COMPONENT' | 'OTHER';
    label: string;
  }[];
  document_number_format?: string;
  document_number_assignment?: 'ON_RECORD' | 'WITH_DRAFT_SAVE';
}
export interface P04Review {
  document: P04Draft;
  metadata: P04Draft['metadata'];
  items: P04Row[];
  sku_summary: {
    sku_code: string;
    sku_name: string | null;
    quantity: number;
  }[];
  can_record: boolean;
  revalidated_at: string;
  stock_effect: 'NONE';
}
export interface P04Record {
  document_id: string;
  doc_no: string;
  record_status: 'RECORDED';
  posted: false;
  status: string;
  draft_id: string;
  stock_effect: 'NONE';
}
const object = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
function invalid(path: string): never {
  throw new AppError({
    kind: 'parse',
    code: 'INVALID_P04_RESPONSE',
    route: path,
    message:
      'Phản hồi P04 chưa khớp định danh hoặc contract. Giữ dữ liệu để đối chiếu.',
  });
}
export function p04Envelope(r: ApiResponse<unknown>, path: string) {
  const b = object(r.data);
  if (
    r.status < 200 ||
    r.status >= 300 ||
    b?.success !== true ||
    object(b.meta)?.contract !== P04_CONTRACT ||
    !Object.hasOwn(b, 'data')
  )
    invalid(path);
  return b;
}
function guard(scope: P03Scope, read: () => Session | undefined) {
  let current: P03Scope;
  try {
    current = p03Scope(read());
  } catch {
    throw new AppError({
      kind: 'cancelled',
      code: 'P04_SESSION_CHANGED',
      message: 'Phiên hoặc kho đã thay đổi. Không dùng kết quả cũ.',
    });
  }
  if (!sameP03Scope(scope, current))
    throw new AppError({
      kind: 'cancelled',
      code: 'P04_SESSION_CHANGED',
      message: 'Phiên hoặc kho đã thay đổi. Không dùng kết quả cũ.',
    });
}
export function parseP04Draft(
  v: unknown,
  scope: P03Scope,
  id: P03Identity,
): P04Draft {
  const d = parseP03Draft(v, scope, id, 'INBOUND') as P04Draft;
  if (
    d.actor_id !== scope.actorId ||
    !object(d.metadata) ||
    d.metadata.inbound_type !== 'receipt' ||
    !Array.isArray(d.items) ||
    !object(d.scan_session) ||
    d.scan_session.document_version !== d.version ||
    d.scan_session.status !== (d.status === 'DRAFT' ? 'OPEN' : 'CLOSED') ||
    d.scan_session.expiry_policy !== 'AUTH_SESSION'
  )
    invalid(P04_BASE);
  return d;
}
export function parseP04Record(
  response: ApiResponse<unknown>,
  scope: P03Scope,
  id: P03Identity,
  key: string,
  version: number,
) {
  const b = p04Envelope(response, P04_BASE),
    data = object(b.data),
    meta = object(object(b.meta)?.p03_draft);
  const draft = parseP03Draft(meta?.document, scope, id, 'INBOUND');
  const receipt = parseP03Receipt(meta?.receipt, draft, key, 'RECORD');
  if (
    !data ||
    typeof data.document_id !== 'string' ||
    typeof data.doc_no !== 'string' ||
    !data.doc_no.trim() ||
    data.record_status !== 'RECORDED' ||
    data.posted !== false ||
    data.stock_effect !== 'NONE' ||
    draft.status !== 'RECORDED' ||
    draft.business_document_id !== data.document_id ||
    draft.version !== version + 1
  )
    invalid(P04_BASE);
  requireP03Uuid(data.document_id);
  return {
    data: data as unknown as P04Record,
    draft,
    receipt,
    sentAt: object(meta?.receipt)?.committed_at as string | undefined,
  };
}
export function createP04Service(
  client: P03Client = apiClient,
  readSession: () => Session | undefined = getActiveSession,
) {
  async function request(
    scope: P03Scope,
    path: string,
    options: Omit<RequestOptions, 'path'> = {},
  ) {
    guard(scope, readSession);
    const r = await client.request<unknown>({ path, ...options });
    guard(scope, readSession);
    return r;
  }
  function draftPath(id: P03Identity) {
    requireP03Uuid(id.documentId);
    requireP03Uuid(id.scanSessionId);
    return `${P04_BASE}/drafts/${id.documentId}`;
  }
  function headers(
    version: number,
    key?: string,
    binding?: import('../../shift/p04Admission').P04CommandBinding,
  ) {
    if (!Number.isSafeInteger(version) || version < 0)
      throw new AppError({
        kind: 'config',
        message: 'Thiếu version đã xác minh.',
      });
    if (key) requireP03Uuid(key);
    if (binding) {
      requireP03Uuid(binding.requestId);
      requireP03Uuid(binding.shiftId);
      if (binding.requestId === key)
        throw new AppError({
          kind: 'config',
          code: 'P04_TRACE_KEY_CONFLICT',
          message: 'Trace của owner phải tách khỏi operation key.',
        });
    } else if (client === apiClient) {
      throw new AppError({
        kind: 'blocked_by_gate',
        code: 'P04_ORIGINAL_IDENTITY_REQUIRED',
        message:
          'Thiếu định danh ca/trace gốc của owner; chỉ đối chiếu, không gửi lại.',
      });
    }
    return {
      'If-Match': `"${version}"`,
      ...(key ? { 'Idempotency-Key': key } : {}),
      ...(binding
        ? {
            'X-Work-Shift-ID': binding.shiftId,
            'X-Request-ID': binding.requestId,
          }
        : {}),
    };
  }
  function identity(scope: P03Scope, id: P03Identity) {
    return {
      warehouse_id: scope.warehouseId,
      scan_session_id: id.scanSessionId,
    };
  }
  return {
    /** Admission is strict only for the live API client; review fixtures remain isolated. */
    live: client === apiClient,
    async context(scope: P03Scope): Promise<P04Context> {
      const path = P04_BASE + '/context',
        b = p04Envelope(await request(scope, path), path),
        c = object(b.data);
      if (
        !c ||
        c.actor_id !== scope.actorId ||
        c.auth_session_id !== scope.authSessionId ||
        !object(c.permissions) ||
        ['read', 'save', 'cancel', 'record'].some(
          k => typeof object(c.permissions)?.[k] !== 'boolean',
        ) ||
        !Array.isArray(c.available_warehouses) ||
        !object(c.warehouse_context) ||
        typeof c.inbound_supported !== 'boolean'
      )
        invalid(path);
      if (
        object(c.warehouse_context)?.status === 'READY' &&
        c.active_warehouse_id !== scope.warehouseId
      )
        invalid(path);
      return c as unknown as P04Context;
    },
    async types(scope: P03Scope) {
      const path = P04_BASE + '/types',
        b = p04Envelope(
          await request(scope, path, {
            query: { warehouse_id: scope.warehouseId },
          }),
          path,
        );
      if (
        !Array.isArray(b.data) ||
        b.data.some(t => {
          const x = object(t);
          return (
            x?.id !== 'receipt' ||
            x.code !== 'receipt' ||
            typeof x.label !== 'string' ||
            typeof x.allowed !== 'boolean'
          );
        })
      )
        invalid(path);
      return b.data as {
        id: 'receipt';
        code: 'receipt';
        label: string;
        allowed: boolean;
      }[];
    },
    async save(
      scope: P03Scope,
      id: P03Identity,
      body: P04Body,
      key: string,
      version: number,
      binding?: import('../../shift/p04Admission').P04CommandBinding,
    ) {
      const path = draftPath(id);
      if (
        body.warehouse_id !== scope.warehouseId ||
        body.scan_session_id !== id.scanSessionId
      )
        invalid(path);
      const r = await request(scope, path, {
          method: 'PUT',
          body,
          headers: headers(version, key, binding),
        }),
        data = object(p04Envelope(r, path).data),
        document = parseP04Draft(data?.document, scope, id),
        receipt = parseP03Receipt(data?.receipt, document, key, 'SAVE');
      if (
        document.status !== 'DRAFT' ||
        document.version !== version + 1 ||
        r.status !== (version === 0 ? 201 : 200)
      )
        invalid(path);
      return { document, receipt };
    },
    async detail(scope: P03Scope, id: P03Identity) {
      const path = draftPath(id),
        b = p04Envelope(
          await request(scope, path, { query: identity(scope, id) }),
          path,
        );
      return parseP04Draft(object(b.data)?.document, scope, id);
    },
    async scanSession(scope: P03Scope, id: P03Identity, version: number) {
      const path = draftPath(id) + '/scan-session',
        b = p04Envelope(
          await request(scope, path, { query: identity(scope, id) }),
          path,
        ),
        s = object(b.data);
      if (
        !s ||
        s.document_id !== id.documentId ||
        s.scan_session_id !== id.scanSessionId ||
        s.auth_session_id !== scope.authSessionId ||
        s.warehouse_id !== scope.warehouseId ||
        s.document_version !== version ||
        s.status !== 'OPEN' ||
        s.expiry_policy !== 'AUTH_SESSION'
      )
        invalid(path);
      return s;
    },
    async validate(
      scope: P03Scope,
      id: P03Identity,
      version: number,
      eventId: string,
      item: P04Item,
      binding?: import('../../shift/p04Admission').P04CommandBinding,
    ) {
      requireP03Uuid(eventId);
      const path = draftPath(id) + '/validate-code',
        b = p04Envelope(
          await request(scope, path, {
            method: 'POST',
            body: { ...identity(scope, id), client_event_id: eventId, item },
            headers: headers(version, undefined, binding),
          }),
          path,
        ),
        d = object(b.data),
        row = object(d?.result);
      if (
        !d ||
        d.document_id !== id.documentId ||
        d.scan_session_id !== id.scanSessionId ||
        d.version !== version ||
        d.client_event_id !== eventId ||
        d.event_persisted !== false ||
        d.stock_effect !== 'NONE' ||
        !row ||
        row.raw_code !== item.raw_code ||
        !['ACCEPTED', 'DUPLICATE', 'REJECTED'].includes(String(row.outcome))
      )
        invalid(path);
      if (
        row.outcome === 'ACCEPTED' &&
        (!object(row.resolved) ||
          object(row.resolved)?.warehouse_id !== scope.warehouseId ||
          object(row.resolved)?.stock_effect !== 'NONE' ||
          !Number.isSafeInteger(row.quantity) ||
          (row.quantity as number) < 1)
      )
        invalid(path);
      return row as unknown as P04Row;
    },
    async review(
      scope: P03Scope,
      id: P03Identity,
      version: number,
      binding?: import('../../shift/p04Admission').P04CommandBinding,
    ) {
      const path = draftPath(id) + '/review',
        b = p04Envelope(
          await request(scope, path, {
            method: 'POST',
            body: identity(scope, id),
            headers: headers(version, undefined, binding),
          }),
          path,
        ),
        d = object(b.data);
      const document = parseP04Draft(d?.document, scope, id);
      if (
        document.version !== version ||
        !d ||
        d.stock_effect !== 'NONE' ||
        !Array.isArray(d.items) ||
        !Array.isArray(d.sku_summary) ||
        typeof d.can_record !== 'boolean' ||
        d.revalidation_policy !== 'AGAIN_AT_RECORD'
      )
        invalid(path);
      return d as unknown as P04Review;
    },
    async record(
      scope: P03Scope,
      id: P03Identity,
      version: number,
      key: string,
      binding?: import('../../shift/p04Admission').P04CommandBinding,
    ) {
      return parseP04Record(
        await request(scope, draftPath(id) + '/record', {
          method: 'POST',
          body: identity(scope, id),
          headers: headers(version, key, binding),
        }),
        scope,
        id,
        key,
        version,
      );
    },
    async reconcile(
      scope: P03Scope,
      id: P03Identity,
      key: string,
      command: P03RequestCommand,
    ) {
      requireP03Uuid(key);
      const path = draftPath(id) + '/requests/' + key,
        b = p04Envelope(
          await request(scope, path, {
            query: { ...identity(scope, id), command },
          }),
          path,
        ),
        d = object(b.data);
      if (
        !d ||
        !['UNKNOWN', 'SUCCEEDED'].includes(String(d.outcome)) ||
        d.new_document_allowed !== false ||
        !['NONE', 'SAME_REQUEST_ONLY'].includes(String(d.retry))
      )
        invalid(path);
      assertP03ReconcileIdentity(d, {
        key,
        draftId: id.documentId,
        scanSessionId: id.scanSessionId,
        warehouseId: scope.warehouseId,
        operation: 'INBOUND',
        command,
      });
      if (
        d.outcome === 'UNKNOWN' &&
        (d.cancel_allowed !== false ||
          d.receipt !== null ||
          d.response !== null ||
          d.retry !== 'SAME_REQUEST_ONLY')
      )
        invalid(path);
      if (d.outcome === 'SUCCEEDED') {
        const document = parseP03Draft(d.document, scope, id, 'INBOUND'),
          receipt = object(d.receipt);
        if (
          !Number.isSafeInteger(receipt?.version) ||
          (receipt!.version as number) < 1 ||
          (receipt!.version as number) > document.version
        )
          invalid(path);
        parseP03Receipt(
          d.receipt,
          { ...document, version: receipt!.version as number },
          key,
          command,
        );
      }
      return d;
    },
    async cancel(
      scope: P03Scope,
      id: P03Identity,
      version: number,
      key: string,
      confirmedRequestId: string,
      reason: string,
      binding?: import('../../shift/p04Admission').P04CommandBinding,
    ) {
      requireP03Uuid(confirmedRequestId);
      const path = draftPath(id) + '/cancel',
        b = p04Envelope(
          await request(scope, path, {
            method: 'POST',
            body: {
              ...identity(scope, id),
              confirmed_request_id: confirmedRequestId,
              reason,
            },
            headers: headers(version, key, binding),
          }),
          path,
        ),
        d = object(b.data),
        document = parseP04Draft(d?.document, scope, id),
        receipt = parseP03Receipt(d?.receipt, document, key, 'CANCEL');
      if (document.status !== 'CANCELLED') invalid(path);
      return { document, receipt };
    },
    async document(scope: P03Scope, documentId: string) {
      requireP03Uuid(documentId);
      const path = P04_BASE + '/documents/' + documentId,
        b = p04Envelope(
          await request(scope, path, {
            query: { warehouse_id: scope.warehouseId },
          }),
          path,
        ),
        d = object(b.data),
        doc = object(d?.document);
      if (
        !d ||
        doc?.id !== documentId ||
        (doc.warehouse_id !== scope.warehouseId &&
          doc.dst_warehouse_id !== scope.warehouseId) ||
        typeof d.posted !== 'boolean' ||
        !Array.isArray(d.history)
      )
        invalid(path);
      return d;
    },
  };
}
export type P04Service = ReturnType<typeof createP04Service>;
export type P04SaveReceipt = P03Receipt;
