import { apiClient, type ApiResponse } from '../../api/client';
import { assertP08Connected, P08_CONTRACT } from '../../config/p08Release';
import {
  AppError,
  extractErrorCode,
  extractErrorMessage,
} from '../../errors/AppError';
import { assertReadOnlyPath, type ReadClient } from './readOnlyClient';
import { P08_BUSINESSES, P08_SOURCES } from './p08Types';
import { parseP08RecordTarget } from './p08RecordTarget';
import type {
  P08Batch,
  P08Business,
  P08Context,
  P08Detail,
  P08Event,
  P08HistoryService,
  P08Meta,
  P08PageMeta,
  P08Response,
  P08Scope,
  P08Source,
  P08Summary,
} from './p08Types';
export * from './p08Types';
export const P08_BASE = '/api/v1/mini-app/history';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Obj = Record<string, unknown>;
const obj = (v: unknown): v is Obj =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;
const nullableText = (v: unknown) => v === null || typeof v === 'string';
const count = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) >= 0;
function ensure(
  ok: unknown,
  code = 'P08_INVALID_RESPONSE',
  kind: 'parse' | 'config' | 'auth' = 'parse',
): asserts ok {
  if (!ok)
    throw new AppError({
      kind,
      code,
      message:
        kind === 'parse'
          ? 'Dữ liệu lịch sử chưa xác minh đúng định danh hoặc hợp đồng.'
          : 'Phiên, quyền hoặc bộ lọc lịch sử chưa hợp lệ.',
    });
}
export function p08Identity(id: string): { source: P08Source; uuid: string } {
  const parts = /^(DOCUMENT|WARRANTY|NFC|SCAN):([0-9a-f-]+)$/i.exec(id);
  ensure(parts && UUID.test(parts[2]), 'P08_INVALID_ID', 'config');
  return {
    source: parts[1].toUpperCase() as P08Source,
    uuid: parts[2].toLowerCase(),
  };
}
const canonical = (id: string) => {
  const x = p08Identity(id);
  return x.source + ':' + x.uuid;
};
export function p08Scope(context: P08Context): P08Scope {
  const { session: s, user: u } = context;
  ensure(
    s?.accessToken &&
      text(s.userId) &&
      text(s.authSessionId) &&
      (s.expiresAtMs === undefined ||
        (Number.isFinite(s.expiresAtMs) && s.expiresAtMs > Date.now())),
    'P08_AUTH_REQUIRED',
    'auth',
  );
  ensure(
    u &&
      u.id === s.userId &&
      u.auth_session_id === s.authSessionId &&
      u.active_warehouse_id === s.activeWarehouseId &&
      UUID.test(s.activeWarehouseId || '') &&
      u.warehouse_context?.status === 'READY' &&
      Array.isArray(u.available_warehouses) &&
      u.available_warehouses.some(
        w => w.warehouse_id === s.activeWarehouseId && w.status === 'ACTIVE',
      ),
    'P08_CONTEXT_REQUIRED',
    'config',
  );
  if (
    !Array.isArray(u.permissions) ||
    !u.permissions.every(text) ||
    !u.permissions.includes('history.read')
  )
    throw new AppError({
      kind: 'http',
      status: 403,
      code: 'HISTORY_READ_FORBIDDEN',
      message: 'Tài khoản chưa được cấp quyền đọc lịch sử.',
    });
  return {
    actorId: s.userId,
    authSessionId: s.authSessionId,
    warehouseId: s.activeWarehouseId!,
    permissions: [...u.permissions!].sort(),
  };
}
const permitted = (s: P08Scope, source: P08Source, business?: string) => {
  const has = (p: string) => s.permissions.includes(p);
  if (source === 'DOCUMENT')
    return business === 'INBOUND'
      ? has('inbound.view')
      : business === 'OUTBOUND'
      ? has('outbound.view')
      : has('inbound.view') || has('outbound.view');
  if (source === 'WARRANTY')
    return has('warranty.view') || has('warranty.manage');
  if (source === 'NFC')
    return has('physical_code.assign_rfid') || has('inventory.trace');
  return has('inventory.view');
};
export function p08ContextKey(context: P08Context): string {
  try {
    return JSON.stringify(p08Scope(context));
  } catch {
    return '';
  }
}
function validDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
// Both timestamp projections used by the pinned PostgreSQL/SQLite source.
function projectionTime(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m =
    /^(\d{4}-\d{2}-\d{2})[T ]([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3])(?::[0-5]\d)?)?$/.exec(
      v,
    );
  return !!m && validDate(m[1]);
}
/** Deliberately strict per-operation query bags. Nothing is forwarded blindly. */
export function p08Query(
  operation: 'records' | 'detail' | 'session' | 'summary',
  warehouseId: string,
  bag: Record<string, unknown> = {},
): string {
  ensure(UUID.test(warehouseId), 'P08_WAREHOUSE_UUID', 'config');
  const filterKeys = [
    'source',
    'business',
    'status',
    'keyword',
    'date_mode',
    'date',
    'from',
    'to',
  ];
  const allowed =
    operation === 'session'
      ? ['limit', 'cursor']
      : operation === 'detail'
      ? ['activityId', 'limit', 'cursor']
      : operation === 'summary'
      ? filterKeys
      : [...filterKeys, 'limit', 'cursor'];
  ensure(
    Object.keys(bag).every(k => allowed.includes(k)),
    'P08_QUERY_NOT_ALLOWED',
    'config',
  );
  const q = new URLSearchParams({ warehouse_id: warehouseId.toLowerCase() });
  if (operation === 'records' || operation === 'summary') {
    const mode = bag.date_mode ?? 'ALL';
    ensure(
      ['ALL', 'DATE', 'RANGE'].includes(String(mode)),
      'P08_DATE_MODE',
      'config',
    );
    ensure(
      mode === 'ALL'
        ? bag.date === undefined &&
            bag.from === undefined &&
            bag.to === undefined
        : mode === 'DATE'
        ? validDate(bag.date) && bag.from === undefined && bag.to === undefined
        : validDate(bag.from) &&
          validDate(bag.to) &&
          bag.from <= bag.to &&
          bag.date === undefined,
      'P08_DATE_RANGE',
      'config',
    );
    q.set('date_mode', String(mode));
    for (const k of ['date', 'from', 'to'])
      if (bag[k] !== undefined) q.set(k, String(bag[k]));
    ensure(
      bag.source === undefined ||
        ['ALL', ...P08_SOURCES].includes(bag.source as P08Source),
      'P08_SOURCE',
      'config',
    );
    ensure(
      bag.business === undefined ||
        ['ALL', ...P08_BUSINESSES].includes(bag.business as never),
      'P08_BUSINESS',
      'config',
    );
    q.set('source', String(bag.source ?? 'ALL'));
    q.set('business', String(bag.business ?? 'ALL'));
    for (const [key, max] of [
      ['status', 100],
      ['keyword', 200],
    ] as const) {
      ensure(
        bag[key] === undefined ||
          (typeof bag[key] === 'string' &&
            Array.from(bag[key] as string).length <= max),
        'P08_FILTER_LENGTH',
        'config',
      );
      if (text(bag[key])) q.set(key, bag[key] as string);
    }
  }
  if (operation !== 'summary') {
    const limit = bag.limit ?? 20;
    ensure(
      Number.isInteger(limit) && Number(limit) >= 1 && Number(limit) <= 100,
      'P08_LIMIT',
      'config',
    );
    q.set('limit', String(limit));
    ensure(
      bag.cursor === undefined ||
        (typeof bag.cursor === 'string' && bag.cursor.length <= 4096),
      'P08_CURSOR',
      'config',
    );
    if (text(bag.cursor)) q.set('cursor', bag.cursor);
  }
  if (bag.activityId !== undefined) {
    ensure(text(bag.activityId), 'P08_ACTIVITY_ID', 'config');
    p08Identity(bag.activityId);
    q.set('activityId', bag.activityId);
  }
  return q.toString();
}
function meta(
  response: ApiResponse<unknown>,
  scope: P08Scope,
  paged: boolean,
): { data: unknown; meta: P08Meta | P08PageMeta } {
  const body = response.data;
  if (
    response.status < 200 ||
    response.status >= 300 ||
    (obj(body) && body.success === false)
  )
    throw new AppError({
      kind: 'http',
      status: response.status,
      code: extractErrorCode(body),
      message: extractErrorMessage(body) || 'Không tải được lịch sử.',
    });
  ensure(
    obj(body) && body.success === true && obj(body.meta),
    'P08_INVALID_ENVELOPE',
  );
  const m = body.meta;
  ensure(
    m.contract === P08_CONTRACT &&
      m.warehouseId === scope.warehouseId &&
      text(m.timezone) &&
      m.countUnit === 'ACTIVITY' &&
      m.historyExportAvailable === false &&
      obj(m.sources) &&
      count(m.total) &&
      m.paginationConsistency === 'KEYSET_UPPER_BOUND_NOT_FROZEN_SNAPSHOT' &&
      projectionTime(m.asOf) &&
      obj(m.snapshot) &&
      typeof m.snapshot.id === 'string' &&
      UUID.test(m.snapshot.id) &&
      projectionTime(m.snapshot.observed_at) &&
      ['SINGLE_RESPONSE_DATABASE_SNAPSHOT', 'ENCLOSING_TRANSACTION'].includes(
        String(m.snapshot.consistency),
      ) &&
      m.snapshot.cross_request_snapshot === false &&
      (obj(m.organizationScope) ||
        (Array.isArray(m.organizationScope) &&
          m.organizationScope.length === 0)) &&
      Object.values(m.organizationScope).every(text) &&
      [
        'SINGLE_TENANT_DATABASE_REQUIRED',
        'TRUSTED_ACTOR_AND_WAREHOUSE_COLUMNS',
      ].includes(String(m.tenantIsolation)) &&
      m.scopePolicy === 'PERSISTED_OWNER_WAREHOUSE_BEFORE_DEDUP_AND_TOTAL' &&
      m.coveragePolicy ===
        'ONLY_PERSISTED_SCOPED_EVENTS_NOT_ALL_BUSINESS_RECORDS' &&
      m.nfcLegacyPolicy === 'EXCLUDED_WHEN_ASSIGNMENT_WAREHOUSE_NOT_RECORDED' &&
      nullableText(m.request_id) &&
      projectionTime(m.timestamp) &&
      ['DATE', 'RANGE', 'ALL'].includes(String(m.dateMode)),
    'P08_INVALID_META',
  );
  for (const source of P08_SOURCES) {
    const entry = m.sources[source];
    ensure(
      obj(entry) &&
        [
          'INCLUDED',
          'FORBIDDEN',
          'NOT_REQUESTED',
          'UNAVAILABLE',
          'PARTIAL',
        ].includes(String(entry.status)) &&
        (entry.adapters === undefined ||
          (obj(entry.adapters) &&
            Object.values(entry.adapters).every(v =>
              ['INCLUDED', 'UNAVAILABLE'].includes(String(v)),
            ))),
      `P08_INVALID_SOURCE_META_${source}`,
    );
    ensure(
      !['INCLUDED', 'PARTIAL'].includes(String(entry.status)) ||
        permitted(scope, source),
      `P08_INVALID_SOURCE_PERMISSION_${source}`,
    );
  }
  if (paged)
    ensure(
      count(m.limit) &&
        m.limit >= 1 &&
        m.limit <= 100 &&
        typeof m.hasMore === 'boolean' &&
        (m.hasMore ? text(m.nextCursor) : m.nextCursor === null) &&
        (!text(m.nextCursor) || m.nextCursor.length <= 4096),
      'P08_INVALID_PAGING_META',
    );
  return {
    data: body.data,
    meta: {
      ...m,
      organizationScope: Array.isArray(m.organizationScope)
        ? {}
        : m.organizationScope,
    } as unknown as P08Meta,
  };
}
/** Only exact relative owner routes from the pinned source; no host/token forwarding. */
export function p08OwnerPath(
  activity: Pick<P08Event, 'recordId' | 'source' | 'business'>,
): string | null {
  const id = p08Identity(activity.recordId);
  ensure(id.source === activity.source);
  const base = '/api/v1/mini-app/';
  if (activity.source === 'DOCUMENT')
    return activity.business === 'INBOUND'
      ? base + 'inbound-documents/' + id.uuid
      : activity.business === 'OUTBOUND'
      ? base + 'outbound-documents/' + id.uuid
      : null;
  if (activity.source === 'WARRANTY') return base + 'warranty-cases/' + id.uuid;
  if (activity.source === 'NFC') return base + 'nfc-tags/' + id.uuid;
  return null;
}
function event(v: unknown, scope: P08Scope, parent?: string): P08Event {
  ensure(
    obj(v) &&
      text(v.activityId) &&
      text(v.recordId) &&
      text(v.eventId) &&
      UUID.test(v.eventId) &&
      P08_SOURCES.includes(v.source as P08Source) &&
      text(v.sourceTable) &&
      P08_BUSINESSES.includes(v.business as P08Business),
    'P08_INVALID_EVENT_SHAPE',
  );
  const r = p08Identity(v.recordId),
    a = p08Identity(v.activityId);
  ensure(
    r.source === v.source &&
      a.source === v.source &&
      a.uuid === v.eventId.toLowerCase() &&
      (!parent || canonical(v.recordId) === canonical(parent)) &&
      permitted(scope, v.source as P08Source, v.business as string),
    'P08_INVALID_EVENT_IDENTITY',
  );
  ensure(
    nullableText(v.status) &&
      nullableText(v.action) &&
      nullableText(v.label) &&
      nullableText(v.codeId),
    'P08_INVALID_EVENT_TEXT_FIELDS',
  );
  ensure(
    nullableText(v.time) &&
      (v.time === null
        ? v.timeStatus === 'NOT_RECORDED'
        : v.timeStatus === 'SOURCE_TIMESTAMP' && projectionTime(v.time)),
    'P08_INVALID_EVENT_TIME',
  );
  ensure(
    v.rawCode === null &&
      v.quantity === null &&
      v.rawCodePolicy === 'OMITTED_MAY_CONTAIN_PII_OR_SECRETS' &&
      v.isConfirmationReceipt === false,
    'P08_INVALID_EVENT_PRIVACY',
  );
  ensure(obj(v.detail) && obj(v.attachments), 'P08_INVALID_EVENT_LINKS');
  const owner = p08OwnerPath(v as unknown as P08Event);
  ensure(
    typeof v.detail.canOpen === 'boolean' &&
      typeof v.attachments.canOpen === 'boolean' &&
      v.detail.ownerPermissionRechecked === true &&
      v.attachments.policy === 'OWNER_ENDPOINT_REAUTHORIZATION_NO_STORAGE_URL',
    'P08_INVALID_EVENT_CAPABILITY',
  );
  ensure(
    v.detail.canOpen
      ? !!owner &&
          v.detail.url === owner &&
          (v.source !== 'DOCUMENT' ||
            scope.permissions.includes('documents.read'))
      : v.detail.url === null,
    'P08_INVALID_DETAIL_OWNER',
  );
  ensure(
    v.attachments.canOpen
      ? v.detail.canOpen &&
          scope.permissions.includes('documents.read') &&
          ['DOCUMENT', 'WARRANTY'].includes(String(v.source)) &&
          v.attachments.url === owner + '/attachments'
      : v.attachments.url === null,
    'P08_INVALID_ATTACHMENT_OWNER',
  );
  // Whitelist projection. Unexpected actor/raw/PII fields never hydrate UI.
  return {
    activityId: v.activityId,
    recordId: v.recordId,
    eventId: v.eventId,
    source: v.source as P08Source,
    sourceTable: v.sourceTable,
    business: v.business as P08Business,
    status: v.status as string | null,
    action: v.action as string | null,
    label: v.label as string | null,
    codeId: v.codeId as string | null,
    time: v.time as string | null,
    timeStatus: v.timeStatus as P08Event['timeStatus'],
    rawCode: null,
    quantity: null,
    rawCodePolicy: 'OMITTED_MAY_CONTAIN_PII_OR_SECRETS',
    isConfirmationReceipt: false,
    detail: {
      canOpen: v.detail.canOpen,
      url: v.detail.url as string | null,
      ownerPermissionRechecked: true,
    },
    attachments: {
      canOpen: v.attachments.canOpen,
      url: v.attachments.url as string | null,
      policy: 'OWNER_ENDPOINT_REAUTHORIZATION_NO_STORAGE_URL',
    },
  };
}
export function p08Dedup(rows: readonly P08Event[]): P08Event[] {
  const map = new Map<string, P08Event>();
  for (const row of rows) {
    const previous = map.get(row.activityId);
    if (
      previous?.source === 'SCAN' &&
      previous.sourceTable === 'scan_events' &&
      row.sourceTable === 'scan_record_events'
    )
      continue;
    map.set(row.activityId, row);
  }
  return [...map.values()];
}
const countsObject = (v: unknown): v is Record<string, number> =>
  obj(v) && Object.values(v).every(count);
function batch(v: unknown, scope: P08Scope, id: string): P08Batch {
  // PHP serializes an empty pluck()->all() map as [] for an existing empty batch.
  const totals =
    obj(v) && Array.isArray(v.statusTotals) && !v.statusTotals.length
      ? {}
      : obj(v)
      ? v.statusTotals
      : undefined;
  ensure(
    obj(v) &&
      v.sessionId === id &&
      v.sessionType === 'SCAN_BATCH' &&
      Array.isArray(v.sourceTables) &&
      v.sourceTables.every(text) &&
      count(v.total) &&
      count(v.accepted) &&
      count(v.duplicate) &&
      count(v.other) &&
      v.total === v.accepted + v.duplicate + v.other &&
      countsObject(totals) &&
      Object.values(totals).reduce((n, x) => n + x, 0) === v.total &&
      (totals.ACCEPTED || 0) === v.accepted &&
      (totals.DUPLICATE || 0) === v.duplicate &&
      v.quantity === null &&
      v.quantityStatus === 'NOT_RECORDED_IN_SCAN_EVIDENCE' &&
      JSON.stringify(v.acceptedStatusValues) === '["ACCEPTED"]' &&
      JSON.stringify(v.duplicateStatusValues) === '["DUPLICATE"]' &&
      Array.isArray(v.events),
  );
  return {
    sessionId: id,
    sessionType: 'SCAN_BATCH',
    sourceTables: v.sourceTables as string[],
    total: v.total,
    accepted: v.accepted,
    duplicate: v.duplicate,
    other: v.other,
    statusTotals: totals,
    quantity: null,
    quantityStatus: 'NOT_RECORDED_IN_SCAN_EVIDENCE',
    acceptedStatusValues: ['ACCEPTED'],
    duplicateStatusValues: ['DUPLICATE'],
    events: p08Dedup(v.events.map(e => event(e, scope, 'SCAN:' + id))),
  };
}
function summary(v: unknown, m: P08Meta): P08Summary {
  ensure(
    obj(v) &&
      (v.grandTotal === null || count(v.grandTotal)) &&
      count(v.availableTotal) &&
      v.availableTotal === m.total &&
      v.countUnit === 'ACTIVITY' &&
      Array.isArray(v.groups) &&
      v.groups.length === P08_BUSINESSES.length &&
      v.groups.every(
        g =>
          obj(g) &&
          P08_BUSINESSES.includes(g.business as P08Business) &&
          count(g.availableTotal),
      ) &&
      new Set(v.groups.map(g => g.business)).size === P08_BUSINESSES.length &&
      Array.isArray(v.statusTotals) &&
      v.statusTotals.every(
        s =>
          obj(s) &&
          P08_SOURCES.includes(s.source as P08Source) &&
          nullableText(s.status) &&
          count(s.total),
      ) &&
      v.quantity === null &&
      v.quantityStatus === 'NOT_AN_ACTIVITY_COUNT',
  );
  const partial = Object.values(m.sources).some(s =>
    ['UNAVAILABLE', 'PARTIAL'].includes(s.status),
  );
  ensure(
    partial
      ? v.coverage === 'PARTIAL' && v.grandTotal === null
      : v.coverage === 'COMPLETE_FOR_AUTHORIZED_SUPPORTED_SCOPE' &&
          v.grandTotal === v.availableTotal,
  );
  return {
    grandTotal: v.grandTotal as number | null,
    availableTotal: v.availableTotal,
    countUnit: 'ACTIVITY',
    groups: v.groups as P08Summary['groups'],
    statusTotals: v.statusTotals as P08Summary['statusTotals'],
    coverage: v.coverage as P08Summary['coverage'],
    quantity: null,
    quantityStatus: 'NOT_AN_ACTIVITY_COUNT',
  };
}
function service(
  readContext: () => P08Context,
  client: ReadClient,
  activate: () => void,
): P08HistoryService {
  // Cursor provenance is retained in memory only, without inspecting opaque text.
  const cursors = new Map<string, string>();
  let cursorScope = '';
  const scopeKey = () => {
    const key = p08ContextKey(readContext());
    if (cursorScope !== key) cursors.clear();
    cursorScope = key;
    return key;
  };
  async function read<T>(
    operation: 'records' | 'detail' | 'session' | 'summary',
    path: string,
    bag: Record<string, unknown>,
    parse: (v: unknown, s: P08Scope, m: P08Meta) => T,
    signal?: AbortSignal,
  ): Promise<P08Response<T, P08Meta>> {
    activate();
    scopeKey();
    const scope = p08Scope(readContext()),
      key = JSON.stringify(scope);
    const first = p08Query(operation, scope.warehouseId, {
      ...bag,
      ...(operation === 'summary' ? {} : { cursor: undefined }),
    });
    const binding = key + '|' + path + '?' + first;
    if (text(bag.cursor))
      ensure(
        cursors.get(bag.cursor) === binding,
        'P08_CURSOR_SCOPE_MISMATCH',
        'config',
      );
    const url = path + '?' + p08Query(operation, scope.warehouseId, bag);
    assertReadOnlyPath(path);
    const response = await client.get<unknown>(url, { signal });
    ensure(
      !signal?.aborted && scopeKey() === key,
      'P08_CONTEXT_CHANGED',
      'auth',
    );
    const envelope = meta(response, scope, operation !== 'summary');
    ensure(envelope.meta.dateMode === (bag.date_mode ?? 'ALL'));
    if (operation !== 'summary')
      ensure((envelope.meta as P08PageMeta).limit === (bag.limit ?? 20));
    const data = parse(envelope.data, scope, envelope.meta);
    if (text((envelope.meta as P08PageMeta).nextCursor))
      cursors.set((envelope.meta as P08PageMeta).nextCursor!, binding);
    return { data, meta: envelope.meta };
  }
  return {
    scopeKey,
    records: (filters, paging = {}, signal) =>
      read(
        'records',
        P08_BASE + '/records',
        { ...filters, ...paging },
        (v, s) => {
          ensure(Array.isArray(v));
          return p08Dedup(v.map(e => event(e, s)));
        },
        signal,
      ) as Promise<P08Response<P08Event[]>>,
    detail: (recordId, activityId, paging = {}, signal) => {
      const id = canonical(recordId);
      return read(
        'detail',
        P08_BASE + '/records/' + encodeURIComponent(id),
        { ...(activityId ? { activityId } : {}), ...paging },
        (v, s, m) => {
          ensure(
            obj(v) &&
              v.recordId === id &&
              Array.isArray(v.events) &&
              (activityId
                ? obj(v.selectedActivity)
                : v.selectedActivity === null),
          );
          const selected =
            v.selectedActivity === null
              ? null
              : event(v.selectedActivity, s, id);
          ensure(!activityId || selected?.activityId === canonical(activityId));
          const hasTarget = Object.hasOwn(v, 'record_target') || m.record_target_contract !== undefined;
          if (hasTarget) ensure(m.record_target_contract === 'p08-record-target-v1' && Object.hasOwn(v, 'record_target'), 'P08_RECORD_TARGET_CONTRACT');
          return {
            recordId: id,
            ...(hasTarget ? { recordTarget: parseP08RecordTarget(v.record_target, id, s) } : {}),
            selectedActivity: selected,
            events: p08Dedup(v.events.map(e => event(e, s, id))),
          };
        },
        signal,
      ) as Promise<P08Response<P08Detail>>;
    },
    session: (batchId, paging = {}, signal) => {
      ensure(UUID.test(batchId), 'P08_BATCH_UUID', 'config');
      const id = batchId.toLowerCase();
      return read(
        'session',
        P08_BASE + '/scan-sessions/' + encodeURIComponent(id),
        { ...paging },
        (v, s, m) => {
          const data = batch(v, s, id);
          ensure(data.total === m.total);
          return data;
        },
        signal,
      ) as Promise<P08Response<P08Batch>>;
    },
    summary: (filters, signal) =>
      read(
        'summary',
        P08_BASE + '/summary',
        { ...filters },
        (v, _s, m) => summary(v, m),
        signal,
      ),
  };
}
export const createP08History = (
  readContext: () => P08Context,
): P08HistoryService => service(readContext, apiClient, assertP08Connected);
/** Explicit mock HTTP seam. Runtime caller uses createP08History, never a URL bypass. */
export const createP08MockHistory = (
  readContext: () => P08Context,
  mockHttp: ReadClient,
): P08HistoryService => service(readContext, mockHttp, () => {});
