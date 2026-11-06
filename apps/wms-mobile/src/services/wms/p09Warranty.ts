import { apiClient, type RequestOptions } from '../../api/client';
import { getActiveSession, type Session } from '../../auth/session';
import {
  assertP09Connected,
  assertP09ReadConnected,
  p09RuntimeMatches,
  p09DevReadEnabled,
  p09DevWriteEnabled,
  P09_RELEASE,
  P09_CONTRACT,
} from '../../config/p09Release';
import {
  AppError,
  toAppError,
  extractErrorCode,
  extractErrorMessage,
} from '../../errors/AppError';
import { createP03RequestId } from './p03Drafts';
import type { CurrentUser, WarrantyCase } from './types';
import {
  handoverBody,
  readHandoverSnapshot,
  type P09Handover,
  type P09HandoverSnapshot,
} from './p09Handover';
export type { P09Handover } from './p09Handover';

export const P09_BASE = '/api/v1/mini-app';
export const P09_STATUSES = [
  'RECEIVED',
  'CHECKING',
  'REPAIRING',
  'COMPLETED',
  'RETURNED',
  'CANCELLED',
] as const;
export type P09Status = (typeof P09_STATUSES)[number];
export interface P09Context {
  session?: Session;
  user?: CurrentUser;
}
export interface P09Scope {
  actorId: string;
  authSessionId: string;
  warehouseId: string;
  permissions: readonly string[];
}
export interface P09Case extends WarrantyCase {
  handover?: P09HandoverSnapshot;
  /** Verified envelope ownership, distinct from fields of the case body. */
  ownerScope?: {
    warehouseId: string;
    policy: 'PERSISTED_WARRANTY_OWNER_BEFORE_TOTAL';
    source: 'P09_META';
  };
  item_id?: string | null;
  version: number;
  status: P09Status;
  free_text_redacted?: boolean;
  serial_number?: string | null;
  capabilities?: {
    attachments_read: boolean;
    attachments_download: boolean;
    posted_component_issues_read: boolean;
  };
}
export interface P09PageMeta {
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
  nextPage: number | null;
  pagination: 'KEYSET' | 'OFFSET';
  latest_recorded_event_id?: string | null;
  latest_recorded_event_at?: string | null;
}
export interface P09Page<T> {
  items: readonly T[];
  meta: P09PageMeta;
}
export interface P09Event {
  event_id: string;
  warranty_case_id: string;
  actor: { user_id: string | null; display_name?: string | null };
  event_at: string | null;
  from_status: string | null;
  to_status: string | null;
  message: string | null;
  message_redacted: boolean;
}
export interface P09Component {
  component_issue_document_id: string;
  warranty_case_id: string;
  status: 'POSTED';
  can_open: boolean;
  detail_url: string | null;
}
export interface P09Attachment {
  attachment_id: string;
  warranty_case_id: string;
  file_name: string | null;
  file_name_redacted: boolean;
  status: string | null;
  can_download: boolean;
  download_url: string | null;
  content_type: string | null;
  file_size_bytes: number | null;
  checksum: string | null;
  attachment_type: string | null;
}
export interface P09Resolved {
  item_id: string;
  eligible_for_warranty: boolean | null;
  eligibility_code: string;
  active_warranty_exists: boolean;
  serial_number?: string | null;
  sku_id?: string;
}
export interface P09Receipt {
  request_id: string;
  state: 'SUCCEEDED' | 'FAILED' | 'PROCESSING' | 'UNKNOWN';
  operation?: 'CREATE' | 'UPDATE';
  warranty_case_id?: string | null;
  version?: number | null;
  status?: P09Status | null;
  error_code?: string | null;
  http_status?: number | null;
  completed_at?: string | null;
  may_create_new_request: boolean;
}
export interface P09Command {
  readonly scope: P09Scope;
  readonly operation: 'CREATE' | 'UPDATE';
  readonly target?: string;
  readonly method: 'POST' | 'PATCH';
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly body: Readonly<Record<string, unknown>>;
  readonly headers: Readonly<Record<string, string>>;
  readonly requestId: string;
  readonly idempotencyKey: string;
}
export type P09Filters = {
  search?: string;
  status?: P09Status | 'ALL';
  sort?: 'created_at_asc' | 'created_at_desc';
  per_page?: number;
  page?: number;
  cursor?: string;
  date_mode?: 'ALL' | 'DATE' | 'RANGE';
  date_field?: 'created_at' | 'received_at' | 'returned_at';
  date?: string;
  from?: string;
  to?: string;
};
export type P09Paging = Pick<P09Filters, 'per_page' | 'page' | 'cursor'>;
type Obj = Record<string, unknown>;
const object = (v: unknown): v is Obj =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const positive = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) > 0;
const nullableString = (v: unknown) => v == null || typeof v === 'string';
export function p09Ensure(
  ok: unknown,
  code = 'P09_INVALID_RESPONSE',
  kind: 'parse' | 'config' | 'blocked_by_gate' = 'parse',
): asserts ok {
  if (!ok)
    throw new AppError({
      kind,
      code,
      message:
        'Chưa xác minh được dữ liệu hoặc hợp đồng bảo hành (' + code + ').',
    });
}
export function p09Scope(c: P09Context, write = false): P09Scope {
  const s = c.session,
    u = c.user;
  if (
    !s?.accessToken ||
    !s.userId ||
    !s.authSessionId ||
    (s.expiresAtMs !== undefined &&
      (!Number.isFinite(s.expiresAtMs) || s.expiresAtMs <= Date.now()))
  )
    throw new AppError({
      kind: 'auth',
      status: 401,
      message: 'Phiên bảo hành không còn hợp lệ.',
    });
  p09Ensure(
    u &&
      u.id === s.userId &&
      u.auth_session_id === s.authSessionId &&
      u.active_warehouse_id === s.activeWarehouseId &&
      uuid(s.activeWarehouseId) &&
      u.warehouse_context?.status === 'READY' &&
      u.available_warehouses?.some(
        w => w.warehouse_id === s.activeWarehouseId && w.status === 'ACTIVE',
      ),
    'P09_CONTEXT_REQUIRED',
    'config',
  );
  const permissions = u.permissions ?? [];
  if (
    !(write
      ? permissions.includes('warranty.manage')
      : permissions.includes('warranty.view') ||
        permissions.includes('warranty.manage'))
  )
    throw new AppError({
      kind: 'http',
      status: 403,
      code: 'WARRANTY_PERMISSION_DENIED',
      message: 'Chưa có quyền thao tác bảo hành.',
    });
  return {
    actorId: s.userId,
    authSessionId: s.authSessionId,
    warehouseId: s.activeWarehouseId!,
    permissions: [...permissions].sort(),
  };
}
export function p09ContextKey(context: P09Context): string {
  try {
    return JSON.stringify(p09Scope(context));
  } catch {
    return '';
  }
}
export function p09Query(
  warehouseId: string,
  input: Record<string, unknown>,
  kind: 'list' | 'events' | 'page' = 'list',
): RequestOptions['query'] {
  p09Ensure(uuid(warehouseId), 'P09_WAREHOUSE_UUID', 'config');
  const allowed = [
    'per_page',
    'page',
    'cursor',
    ...(kind === 'list'
      ? [
          'search',
          'status',
          'sort',
          'date_mode',
          'date_field',
          'date',
          'from',
          'to',
        ]
      : kind === 'events'
      ? ['sort']
      : []),
  ];
  p09Ensure(
    Object.keys(input).every(k => allowed.includes(k)) &&
      !(input.page !== undefined && input.cursor !== undefined),
    'P09_QUERY',
    'config',
  );
  if (input.search !== undefined)
    p09Ensure(
      typeof input.search === 'string' && input.search.length <= 200,
      'P09_SEARCH',
      'config',
    );
  if (
    kind === 'list' &&
    ['date_mode', 'date_field', 'date', 'from', 'to'].some(
      k => input[k] !== undefined,
    )
  ) {
    const validDay = (v: unknown) =>
      typeof v === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      Number.isFinite(Date.parse(v + 'T00:00:00Z')) &&
      new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
    const mode = input.date_mode ?? 'ALL';
    p09Ensure(
      ['ALL', 'DATE', 'RANGE'].includes(String(mode)),
      'P09_DATE_MODE',
      'config',
    );
    if (mode === 'ALL')
      p09Ensure(
        input.date === undefined &&
          input.from === undefined &&
          input.to === undefined &&
          input.date_field === undefined,
        'P09_DATE_QUERY',
        'config',
      );
    else {
      p09Ensure(
        ['created_at', 'received_at', 'returned_at'].includes(
          String(input.date_field),
        ),
        'P09_DATE_FIELD',
        'config',
      );
      p09Ensure(
        mode === 'DATE'
          ? validDay(input.date) &&
              input.from === undefined &&
              input.to === undefined
          : validDay(input.from) &&
              validDay(input.to) &&
              String(input.from) <= String(input.to) &&
              input.date === undefined,
        'P09_DATE_QUERY',
        'config',
      );
    }
  }
  if (input.status !== undefined)
    p09Ensure(
      ['ALL', ...P09_STATUSES].includes(input.status as never),
      'P09_STATUS',
      'config',
    );
  if (input.sort !== undefined)
    p09Ensure(
      (kind === 'events'
        ? ['event_at_asc', 'event_at_desc']
        : ['created_at_asc', 'created_at_desc']
      ).includes(String(input.sort)),
      'P09_SORT',
      'config',
    );
  if (input.per_page !== undefined)
    p09Ensure(
      positive(input.per_page) && input.per_page <= 100,
      'P09_PAGE_SIZE',
      'config',
    );
  if (input.page !== undefined)
    p09Ensure(
      positive(input.page) && input.page <= 100000,
      'P09_PAGE',
      'config',
    );
  if (input.cursor !== undefined)
    p09Ensure(
      typeof input.cursor === 'string' &&
        input.cursor.length > 0 &&
        input.cursor.length <= 4096,
      'P09_CURSOR',
      'config',
    );
  // Laravel converts empty query strings to null; optional `search` is a
  // string when present. Omit an unused search rather than sending `search=`.
  const query = Object.fromEntries(
    Object.entries(input).filter(
      ([key, value]) =>
        value !== undefined &&
        !(key === 'search' && typeof value === 'string' && !value.trim()),
    ),
  );
  return { warehouse_id: warehouseId, ...query } as RequestOptions['query'];
}
function caseData(
  v: unknown,
  id?: string,
  permissions: readonly string[] = [],
): P09Case {
  p09Ensure(
    object(v) &&
      uuid(v.warranty_case_id) &&
      (!id || v.warranty_case_id.toLowerCase() === id.toLowerCase()) &&
      positive(v.version) &&
      P09_STATUSES.includes(v.status as never),
  );
  return {
    ...v,
    handover: readHandoverSnapshot(v.handover, permissions),
  } as unknown as P09Case;
}
function receiptData(v: unknown, command: P09Command): P09Receipt {
  p09Ensure(
    object(v) &&
      v.request_id === command.requestId &&
      ['SUCCEEDED', 'FAILED', 'PROCESSING', 'UNKNOWN'].includes(
        String(v.state),
      ) &&
      typeof v.may_create_new_request === 'boolean',
  );
  if (v.operation !== undefined) p09Ensure(v.operation === command.operation);
  if (v.warranty_case_id && command.target)
    p09Ensure(
      String(v.warranty_case_id).toLowerCase() === command.target.toLowerCase(),
    );
  if (v.state === 'SUCCEEDED')
    p09Ensure(
      v.operation === command.operation &&
        uuid(v.warranty_case_id) &&
        positive(v.version) &&
        P09_STATUSES.includes(v.status as never),
    );
  if (v.state === 'SUCCEEDED' && command.body.status === 'RETURNED')
    p09Ensure(
      v.status === 'RETURNED' &&
        v.version ===
          Number(command.headers['If-Match']?.replace(/"/g, '')) + 1,
      'P09_HANDOVER_RECEIPT_INVALID',
    );
  if (v.stock_effect !== undefined) p09Ensure(v.stock_effect === 'NONE');
  if (v.state !== 'FAILED') p09Ensure(v.may_create_new_request === false);
  return v as unknown as P09Receipt;
}
export type P09Create =
  | { mode: 'IDENTIFIED'; resolved: P09Resolved }
  | {
      mode: 'TEMP_ONLY';
      missing_code_reason: string;
      manual_product_description: string;
    };
export interface P09Customer {
  customer_name: string;
  customer_phone: string;
  description: string;
  customer_address?: string;
  reported_defect?: string;
  accessories_received?: string;
  received_condition?: string;
  defect_ids?: readonly string[];
}
export interface P09Update {
  status?: Exclude<P09Status, 'RETURNED'>;
  note?: string;
  confirmed_defect?: string;
  cancel_reason?: string;
}
function textField(
  value: unknown,
  max: number,
  required = false,
): string | undefined {
  if (value === undefined && !required) return undefined;
  p09Ensure(
    typeof value === 'string' &&
      value.length <= max &&
      (!required || !!value.trim()),
    'P09_FIELD_VALIDATION',
    'config',
  );
  return value.trim() || undefined;
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
export function createP09Service(
  getContext: () => P09Context,
  deps: {
    client?: Pick<typeof apiClient, 'request'>;
    assertConnected?: () => void;
    newId?: () => string;
  } = {},
) {
  const client = deps.client ?? apiClient,
    connected = deps.assertConnected;
  const issued = new WeakSet<P09Command>();
  const checkOnly = new WeakSet<P09Command>();
  const scope = (write = false) => {
    if (connected) connected();
    else if (write) assertP09Connected();
    else assertP09ReadConnected();
    return p09Scope(getContext(), write);
  };
  function same(s: P09Scope, write = false) {
    p09Ensure(
      JSON.stringify(scope(write)) === JSON.stringify(s),
      'P09_CONTEXT_CHANGED',
      'blocked_by_gate',
    );
  }
  function permission(s: P09Scope, p: string) {
    if (!s.permissions.includes(p))
      throw new AppError({
        kind: 'http',
        status: 403,
        code: 'P09_PERMISSION_DENIED',
        message: 'Chưa có quyền đọc dữ liệu bảo hành này.',
      });
  }
  async function verifyRuntime(s: P09Scope) {
    if (connected || P09_RELEASE.productionEnabled) return;
    const response = await client.request<unknown>({
      method: 'GET',
      path: '/api/v1/health',
    });
    same(s);
    const envelope = response.data;
    p09Ensure(
      response.status === 200 &&
        object(envelope) &&
        envelope.success === true &&
        object(envelope.data) &&
        object(envelope.data.build) &&
        p09RuntimeMatches(
          envelope.data.build.sha,
          response.header?.('X-WMS-Deployment-Tier'),
        ),
      'P09_RUNTIME_CHANGED',
      'blocked_by_gate',
    );
  }
  async function read(
    path: string,
    query: RequestOptions['query'],
    s: P09Scope,
  ) {
    await verifyRuntime(s);
    const r = await client
      .request<unknown>({ method: 'GET', path, query })
      .catch(cause => {
        if (!connected && p09DevReadEnabled()) {
          const error = toAppError(cause);
          const trace =
            '[P09_USB_READ_ERROR] ' +
            JSON.stringify({
              at: new Date().toISOString(),
              path: path.replace(
                /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
                '{id}',
              ),
              httpStatus: error.status ?? null,
              errorCode: error.code ?? null,
              requestId: error.requestId ?? null,
              statusFilter: query?.status ?? null,
            });
          try {
            const nativeLog = (
              globalThis as typeof globalThis & {
                nativeLoggingHook?: (message: string, level: number) => void;
              }
            ).nativeLoggingHook;
            if (nativeLog) nativeLog(trace, 1);
            else console.info(trace);
          } catch {
            /* Evidence must not change read outcomes. */
          }
        }
        throw cause;
      });
    same(s);
    p09Ensure(object(r.data));
    const e = r.data;
    if (e.success !== true)
      throw new AppError({
        kind: 'http',
        status: r.status,
        code: extractErrorCode(e),
        message: extractErrorMessage(e) ?? 'Không đọc được bảo hành.',
      });
    p09Ensure(
      object(e.meta) &&
        e.meta.contract === P09_CONTRACT &&
        e.meta.warehouse_id === s.warehouseId,
    );
    if (!connected && p09DevReadEnabled()) {
      const trace =
        '[P09_USB_READ] ' +
        JSON.stringify({
          at: new Date().toISOString(),
          path: path.replace(
            /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
            '{id}',
          ),
          httpStatus: r.status,
          contract: e.meta.contract,
          statusFilter: query?.status ?? null,
          sort: query?.sort ?? null,
          hasSearch:
            typeof query?.search === 'string' && query.search.length > 0,
          sourceTimeFormat: (() => {
            const value = object(e.data)
              ? e.data.received_at ?? e.data.created_at
              : Array.isArray(e.data) && object(e.data[0])
              ? e.data[0].event_at ??
                e.data[0].received_at ??
                e.data[0].created_at
              : null;
            if (typeof value !== 'string') return 'ABSENT';
            if (
              /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d(?::?\d\d)?)$/.test(
                value,
              )
            )
              return value.includes('T')
                ? 'ISO_WITH_OFFSET'
                : 'SQL_WITH_OFFSET';
            return /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d{1,6})?$/.test(
              value,
            )
              ? 'WITHOUT_OFFSET'
              : 'UNRECOGNIZED';
          })(),
          total: e.meta.total ?? null,
          rows: Array.isArray(e.data) ? e.data.length : null,
          hasMore: e.meta.hasMore ?? null,
          pagination: e.meta.pagination ?? null,
          requestId: r.header?.('X-Request-ID') ?? e.meta.request_id ?? null,
          version: object(e.data) ? e.data.version ?? null : null,
          status: object(e.data) ? e.data.status ?? null : null,
        });
      try {
        const nativeLog = (
          globalThis as typeof globalThis & {
            nativeLoggingHook?: (message: string, level: number) => void;
          }
        ).nativeLoggingHook;
        if (nativeLog) nativeLog(trace, 1);
        else console.info(trace);
      } catch {
        /* Audit logging never changes API outcomes. */
      }
    }
    return { data: e.data, meta: e.meta, etag: r.header?.('ETag') };
  }
  async function page<T>(
    path: string,
    input: Record<string, unknown>,
    kind: 'list' | 'events' | 'page',
    parse: (v: unknown) => T,
    s: P09Scope,
  ): Promise<P09Page<T>> {
    const r = await read(path, p09Query(s.warehouseId, input, kind), s),
      m = r.meta;
    p09Ensure(
      Array.isArray(r.data) &&
        Number.isSafeInteger(m.total) &&
        Number(m.total) >= 0 &&
        typeof m.hasMore === 'boolean' &&
        ['KEYSET', 'OFFSET'].includes(String(m.pagination)) &&
        nullableString(m.nextCursor) &&
        (m.nextPage === null || positive(m.nextPage)),
    );
    p09Ensure(
      !m.hasMore ||
        (m.pagination === 'KEYSET'
          ? typeof m.nextCursor === 'string' && !!m.nextCursor
          : positive(m.nextPage)),
    );
    return { items: r.data.map(parse), meta: m as unknown as P09PageMeta };
  }
  function idPath(id: string) {
    p09Ensure(uuid(id), 'P09_CANONICAL_ID', 'config');
    return P09_BASE + '/warranty-cases/' + id;
  }
  async function detail(id: string) {
    const s = scope(),
      r = await read(idPath(id), { warehouse_id: s.warehouseId }, s);
    const row = caseData(r.data, id, s.permissions);
    return {
      ...row,
      ownerScope:
        r.meta.scope_policy === 'PERSISTED_WARRANTY_OWNER_BEFORE_TOTAL'
          ? {
              warehouseId: String(r.meta.warehouse_id),
              policy: 'PERSISTED_WARRANTY_OWNER_BEFORE_TOTAL' as const,
              source: 'P09_META' as const,
            }
          : undefined,
    };
  }
  function command(
    operation: 'CREATE' | 'UPDATE',
    body: Obj,
    target?: string,
    version?: number,
  ): P09Command {
    const s = scope(true),
      id = (deps.newId ?? createP03RequestId)();
    p09Ensure(uuid(id), 'P09_REQUEST_UUID', 'config');
    if (operation === 'UPDATE')
      p09Ensure(positive(version), 'P09_VERSION_REQUIRED', 'config');
    const snapshot: P09Command = freeze({
      scope: s,
      operation,
      target,
      method: operation === 'CREATE' ? 'POST' : 'PATCH',
      path: target ? idPath(target) : P09_BASE + '/warranty-cases',
      query: { warehouse_id: s.warehouseId },
      body: JSON.parse(JSON.stringify(body)) as Obj,
      headers: {
        'Idempotency-Key': id,
        'X-Request-ID': id,
        ...(operation === 'UPDATE' ? { 'If-Match': '"' + version + '"' } : {}),
      },
      requestId: id,
      idempotencyKey: id,
    });
    issued.add(snapshot);
    return snapshot;
  }
  return {
    restoreForReconcile(value: unknown): P09Command {
      p09Ensure(object(value), 'P09_RECOVERY_INVALID');
      const c = value as unknown as P09Command;
      const create = c.operation === 'CREATE';
      same(c.scope);
      p09Ensure(
        ['CREATE', 'UPDATE'].includes(c.operation) &&
          uuid(c.requestId) &&
          c.idempotencyKey === c.requestId &&
          c.method === (create ? 'POST' : 'PATCH') &&
          (create ? !c.target : uuid(c.target)) &&
          c.path ===
            (create ? P09_BASE + '/warranty-cases' : idPath(c.target!)) &&
          object(c.query) &&
          Object.keys(c.query).length === 1 &&
          c.query.warehouse_id === c.scope.warehouseId &&
          object(c.body) &&
          Object.keys(c.body).every(k => k === 'item_id') &&
          (c.body.item_id === undefined || uuid(c.body.item_id)) &&
          object(c.headers) &&
          Object.keys(c.headers).length === (create ? 2 : 3) &&
          c.headers['Idempotency-Key'] === c.requestId &&
          c.headers['X-Request-ID'] === c.requestId &&
          (create
            ? !c.headers['If-Match']
            : /^"[1-9][0-9]*"$/.test(c.headers['If-Match'])),
        'P09_RECOVERY_INVALID',
      );
      const restored = freeze(JSON.parse(JSON.stringify(c)) as P09Command);
      issued.add(restored);
      checkOnly.add(restored);
      return restored;
    },
    canWrite: () =>
      !!connected || P09_RELEASE.productionEnabled || p09DevWriteEnabled(),
    componentScope() {
      const s = scope();
      const user = getContext().user;
      p09Ensure(
        (user?.canonical_profile?.status ?? user?.status) === 'ACTIVE',
        'P19_ACTOR_STATUS_REQUIRED',
        'blocked_by_gate',
      );
      return {
        ...s,
        actorStatus: 'ACTIVE' as const,
        warehouseStatus: 'ACTIVE' as const,
        warehouseConfirmed: true as const,
        permissions: [...s.permissions],
      };
    },
    contextKey: () => p09ContextKey(getContext()),
    scope,
    list: (input: P09Filters = {}) =>
      page(
        P09_BASE + '/warranty-cases',
        input,
        'list',
        v => caseData(v, undefined, scope().permissions),
        scope(),
      ),
    detail,
    events: (
      id: string,
      input: P09Paging & { sort?: 'event_at_asc' | 'event_at_desc' } = {},
    ) =>
      page(
        idPath(id) + '/events',
        input,
        'events',
        v => {
          p09Ensure(
            object(v) &&
              uuid(v.event_id) &&
              v.warranty_case_id === id &&
              (v.actor == null ||
                (object(v.actor) &&
                  nullableString(v.actor.user_id) &&
                  nullableString(v.actor.display_name))) &&
              nullableString(v.event_at) &&
              nullableString(v.message) &&
              typeof v.message_redacted === 'boolean',
          );
          return {
            ...v,
            actor: object(v.actor) ? v.actor : { user_id: null },
            event_at: v.event_at ?? null,
          } as unknown as P09Event;
        },
        scope(),
      ),
    components: (id: string, input: P09Paging = {}) => {
      const s = scope();
      permission(s, 'documents.read');
      permission(s, 'warranty.component_issue');
      return page(
        idPath(id) + '/component-issues',
        input,
        'page',
        v => {
          p09Ensure(
            object(v) &&
              uuid(v.component_issue_document_id) &&
              v.warranty_case_id === id &&
              v.status === 'POSTED' &&
              typeof v.can_open === 'boolean' &&
              nullableString(v.detail_url),
          );
          if (v.can_open)
            p09Ensure(
              v.detail_url ===
                P09_BASE +
                  '/warranty-component-issues/' +
                  v.component_issue_document_id,
            );
          return v as unknown as P09Component;
        },
        s,
      );
    },
    attachments: (id: string, input: P09Paging = {}) => {
      const s = scope();
      permission(s, 'documents.read');
      return page(
        idPath(id) + '/attachments',
        input,
        'page',
        v => {
          p09Ensure(
            object(v) &&
              uuid(v.attachment_id) &&
              v.warranty_case_id === id &&
              typeof v.can_download === 'boolean' &&
              nullableString(v.download_url) &&
              nullableString(v.status),
          );
          return v as unknown as P09Attachment;
        },
        s,
      );
    },
    async download(file: P09Attachment, caseId: string) {
      const s = scope();
      permission(s, 'documents.read');
      permission(s, 'warranty.pii.view');
      p09Ensure(
        file.warranty_case_id === caseId &&
          uuid(caseId) &&
          uuid(file.attachment_id) &&
          file.status === 'ACTIVE' &&
          file.can_download &&
          file.download_url ===
            P09_BASE +
              '/warranty-attachments/' +
              file.attachment_id +
              '/download',
        'P09_DOWNLOAD_DENIED',
        'blocked_by_gate',
      );
      // Pinned BE returns relative same-origin URLs. Never forward bearer to a
      // guessed storage URL, external origin or redirect.
      const r = await client.request<Blob>({
        method: 'GET',
        path: file.download_url!,
        responseType: 'blob',
      });
      same(s);
      return r.data;
    },
    async resolve(input: { raw_code?: string; item_id?: string }) {
      const s = scope();
      await verifyRuntime(s);
      p09Ensure(
        Object.keys(input).every(k => ['raw_code', 'item_id'].includes(k)) &&
          (input.raw_code !== undefined) !== (input.item_id !== undefined),
        'P09_IDENTITY_REQUIRED',
        'config',
      );
      if (input.item_id !== undefined)
        p09Ensure(uuid(input.item_id), 'P09_ITEM_UUID', 'config');
      if (input.raw_code !== undefined) textField(input.raw_code, 512, true);
      const r = await client.request<unknown>({
        method: 'POST',
        path: P09_BASE + '/warranty/resolve-code',
        body: { ...input, warehouse_id: s.warehouseId },
      });
      same(s);
      p09Ensure(
        object(r.data) &&
          r.data.success === true &&
          object(r.data.meta) &&
          r.data.meta.contract === P09_CONTRACT &&
          r.data.meta.warehouse_id === s.warehouseId &&
          object(r.data.data),
      );
      const v = r.data.data;
      p09Ensure(
        v.resolved === true &&
          uuid(v.item_id) &&
          uuid(v.sku_id) &&
          (v.serial_number === null || typeof v.serial_number === 'string') &&
          v.stock_effect === 'NONE' &&
          v.movement_created === false &&
          v.wms_case_created === false &&
          [true, false, null].includes(v.eligible_for_warranty as never) &&
          typeof v.eligibility_code === 'string' &&
          typeof v.active_warranty_exists === 'boolean',
      );
      if (!connected && p09DevReadEnabled()) {
        const trace =
          '[P09_USB_READ] ' +
          JSON.stringify({
            at: new Date().toISOString(),
            path: P09_BASE + '/warranty/resolve-code',
            method: 'POST',
            httpStatus: r.status,
            contract: P09_CONTRACT,
            requestId:
              r.header?.('X-Request-ID') ?? r.data.meta.request_id ?? null,
            resolved: true,
            stockEffect: v.stock_effect,
            movementCreated: v.movement_created,
            caseCreated: v.wms_case_created,
          });
        try {
          const hook = (
            globalThis as typeof globalThis & {
              nativeLoggingHook?: (line: string, level: number) => void;
            }
          ).nativeLoggingHook;
          if (hook) hook(trace, 1);
          else console.info(trace);
        } catch {
          /* Evidence must not affect lookup. */
        }
      }
      return v as unknown as P09Resolved;
    },
    prepareCreate(
      identity: P09Create,
      fields: P09Customer,
      linkedDraft?: unknown,
    ) {
      p09Ensure(!linkedDraft, 'P09_P03_LINK_PENDING', 'blocked_by_gate');
      p09Ensure(
        Object.keys(fields).every(k =>
          [
            'customer_name',
            'customer_phone',
            'description',
            'customer_address',
            'reported_defect',
            'accessories_received',
            'received_condition',
            'defect_ids',
          ].includes(k),
        ),
        'P09_UNKNOWN_FIELD',
        'config',
      );
      const body: Obj = {
        customer_name: textField(fields.customer_name, 200, true),
        customer_phone: textField(fields.customer_phone, 10, true),
        description: textField(fields.description, 2000, true),
      };
      p09Ensure(
        /^0\d{9}$/.test(String(body.customer_phone)) &&
          !String(body.customer_name).includes('*') &&
          body.customer_name !== '[ANONYMIZED]',
        'P09_CUSTOMER_VALIDATION',
        'config',
      );
      for (const [key, max] of Object.entries({
        customer_address: 500,
        reported_defect: 2000,
        accessories_received: 1000,
        received_condition: 500,
      })) {
        const v = textField(fields[key as keyof P09Customer], max);
        if (v !== undefined) body[key] = v;
      }
      if (fields.defect_ids?.length) {
        p09Ensure(fields.defect_ids.every(uuid), 'P09_DEFECT_UUID', 'config');
        body.defect_ids = [...fields.defect_ids];
      }
      if (identity.mode === 'IDENTIFIED') {
        p09Ensure(
          uuid(identity.resolved.item_id) &&
            identity.resolved.eligible_for_warranty === true &&
            identity.resolved.active_warranty_exists === false,
          'P09_ITEM_INELIGIBLE',
          'config',
        );
        body.item_id = identity.resolved.item_id;
      } else {
        p09Ensure(identity.mode === 'TEMP_ONLY', 'P09_EXPLICIT_MODE', 'config');
        body.missing_code_reason = textField(
          identity.missing_code_reason,
          500,
          true,
        );
        body.manual_product_description = textField(
          identity.manual_product_description,
          2000,
          true,
        );
      }
      return command('CREATE', body);
    },
    prepareUpdate(current: P09Case, values: P09Update) {
      caseData(current, undefined, scope().permissions);
      p09Ensure(
        !['RETURNED', 'CANCELLED'].includes(current.status),
        'P09_CASE_CLOSED',
        'blocked_by_gate',
      );
      p09Ensure(
        Object.keys(values).every(k =>
          ['status', 'note', 'confirmed_defect', 'cancel_reason'].includes(k),
        ),
        'P09_UPDATE_FIELDS',
        'config',
      );
      const body: Obj = {};
      if (values.status !== undefined) {
        p09Ensure(
          P09_STATUSES.includes(values.status) &&
            String(values.status) !== 'RETURNED',
          'P09_HANDOVER_OWNER',
          'blocked_by_gate',
        );
        body.status = values.status;
      }
      for (const [key, max] of Object.entries({
        note: 2000,
        confirmed_defect: 2000,
        cancel_reason: 1000,
      })) {
        const v = textField(values[key as keyof P09Update], max);
        if (v !== undefined) body[key] = v;
      }
      p09Ensure(Object.keys(body).length, 'P09_EMPTY_UPDATE', 'config');
      return command('UPDATE', body, current.warranty_case_id, current.version);
    },
    prepareHandover(current: P09Case, values: P09Handover) {
      caseData(current, undefined, scope().permissions);
      p09Ensure(
        current.status === 'COMPLETED',
        'P09_HANDOVER_REQUIRES_COMPLETED',
        'blocked_by_gate',
      );
      return command(
        'UPDATE',
        handoverBody(values),
        current.warranty_case_id,
        current.version,
      );
    },
    async send(c: P09Command) {
      p09Ensure(issued.has(c), 'P09_UNOWNED_COMMAND', 'blocked_by_gate');
      p09Ensure(
        !checkOnly.has(c),
        'P09_RECOVERY_CHECK_ONLY',
        'blocked_by_gate',
      );
      same(c.scope, true);
      await verifyRuntime(c.scope);
      same(c.scope, true);
      p09Ensure(
        !Object.keys(c.headers).some(k =>
          k.toLowerCase().startsWith('x-draft-'),
        ),
        'P09_P03_LINK_PENDING',
        'blocked_by_gate',
      );
      const r = await client.request<unknown>({
        method: c.method,
        path: c.path,
        query: { ...c.query },
        body: c.body,
        headers: { ...c.headers },
        receiptTransport: 'p09',
      });
      same(c.scope);
      p09Ensure(object(r.data) && object(r.data.data));
      if (object(r.data.meta))
        p09Ensure(
          r.data.meta.contract === P09_CONTRACT &&
            r.data.meta.warehouse_id === c.scope.warehouseId,
        );
      return receiptData(r.data.data.receipt, c);
    },
    async reconcile(c: P09Command) {
      p09Ensure(issued.has(c), 'P09_UNOWNED_COMMAND', 'blocked_by_gate');
      same(c.scope);
      await verifyRuntime(c.scope);
      const r = await client.request<unknown>({
        method: 'GET',
        path: P09_BASE + '/warranty-requests/' + c.requestId,
        query: { warehouse_id: c.scope.warehouseId },
        receiptTransport: 'p09',
      });
      same(c.scope);
      p09Ensure(object(r.data) && object(r.data.data));
      if (object(r.data.meta))
        p09Ensure(
          r.data.meta.contract === P09_CONTRACT &&
            r.data.meta.warehouse_id === c.scope.warehouseId,
        );
      return receiptData(r.data.data.receipt, c);
    },
  };
}
export type P09Service = ReturnType<typeof createP09Service>;
// Default is deliberately unable to acquire a user/context or open the release.
export const lockedP09Service = createP09Service(() => ({
  session: getActiveSession(),
}));

/** Compare the originally reviewed concurrency token without modifying either command. */
export function p09SameReviewedVersion(
  a: P09Command,
  b: P09Command | undefined,
): boolean {
  return a.headers['If-Match'] === b?.headers['If-Match'];
}

/** UI asks about a reviewed case, never formats or parses transport headers. */
export function p09CommandReviewsCase(
  command: P09Command | undefined,
  current: P09Case,
): boolean {
  return (
    command?.operation === 'UPDATE' &&
    command.target === current.warranty_case_id &&
    command.headers['If-Match'] === '"' + current.version + '"'
  );
}
