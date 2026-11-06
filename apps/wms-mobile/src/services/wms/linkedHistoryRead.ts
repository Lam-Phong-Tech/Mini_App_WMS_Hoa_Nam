/** Product GET adapters for P21/P22/P23. Headers remain local to each owner. */
import { apiClient, type ApiResponse } from '../../api/client';
import { captureSessionScope, isSessionScopeCurrent } from '../../auth/session';
import { getCurrentEnvironment } from '../../config/env';
import { BUILD_PROFILE } from '../../config/buildProfile';
import { isDevRuntimeIdentity } from '../../config/runtimePolicy';
import { AppError } from '../../errors/AppError';
import { p08Scope, type P08Context } from './p08History';
import { p09Scope } from './p09Warranty';
import { ownerUuid } from '../../app/ownerNavigation';
import {
  P23_CONTRACT,
  p23Batch,
  p23Counts,
  p23ListMeta,
  type P23LatestEvent,
} from './p23Projection';
type Row = Record<string, unknown>;
export const readObject = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Row)
    : {};
const required = (ok: unknown, code = 'OWNER_READ_INVALID'): void => {
  if (!ok)
    throw new AppError({
      kind: 'parse',
      code,
      message: 'Nguồn đọc chưa xác minh đúng hợp đồng hoặc định danh.',
    });
};
const count = (v: unknown) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const positive = (v: unknown) => count(v) && Number(v) > 0;
const validDay = (v: unknown) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v + 'T00:00:00Z')) &&
  new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
/** Reject foreign-owner paging/identity fields before any network call. */
export function linkedHistoryQuery(
  owner: 'P21' | 'P22' | 'P23',
  q: Record<string, string | number>,
  summary = false,
) {
  const allowed =
    owner === 'P21'
      ? ['page', 'per_page', 'status', 'warranty_case_id']
      : owner === 'P22'
      ? [
          'keyword',
          'type',
          'status',
          'date_mode',
          'date',
          'from',
          'to',
          ...(summary ? [] : ['limit', 'cursor']),
        ]
      : [
          'keyword',
          'source_type',
          'status',
          'date_mode',
          'date_field',
          'date',
          'from',
          'to',
          'page',
          'per_page',
          'cursor',
        ];
  required(
    Object.keys(q).every(k => allowed.includes(k)) &&
      !(q.page !== undefined && q.cursor !== undefined),
    'OWNER_QUERY_INVALID',
  );
  if (q.page !== undefined)
    required(
      positive(q.page) && Number(q.page) <= 100000,
      'OWNER_PAGE_INVALID',
    );
  for (const field of ['limit', 'per_page'])
    if (q[field] !== undefined)
      required(
        positive(q[field]) && Number(q[field]) <= 100,
        'OWNER_PAGE_SIZE_INVALID',
      );
  if (q.cursor !== undefined)
    required(
      typeof q.cursor === 'string' && q.cursor.length > 0,
      'OWNER_CURSOR_INVALID',
    );
  if (q.keyword !== undefined)
    required(
      typeof q.keyword === 'string' && q.keyword.length <= 200,
      'OWNER_SEARCH_INVALID',
    );
  if (owner === 'P21') {
    if (q.status !== undefined)
      required(
        ['DRAFT', 'RECORDED', 'CANCELLED'].includes(String(q.status)),
        'OWNER_STATUS_INVALID',
      );
    if (q.warranty_case_id !== undefined)
      required(ownerUuid(q.warranty_case_id), 'OWNER_CASE_INVALID');
  } else {
    const mode = q.date_mode ?? 'ALL';
    required(
      ['ALL', 'DATE', 'RANGE'].includes(String(mode)),
      'OWNER_DATE_INVALID',
    );
    required(
      mode === 'ALL'
        ? q.date === undefined &&
            q.from === undefined &&
            q.to === undefined &&
            q.date_field === undefined
        : mode === 'DATE'
        ? validDay(q.date) && q.from === undefined && q.to === undefined
        : validDay(q.from) &&
          validDay(q.to) &&
          String(q.from) <= String(q.to) &&
          q.date === undefined,
      'OWNER_DATE_INVALID',
    );
    if (owner === 'P23' && mode !== 'ALL')
      required(q.date_field === 'created_at', 'OWNER_DATE_FIELD_INVALID');
    if (owner === 'P22' && q.type !== undefined)
      required(
        ['ASSIGN', 'REPLACE', 'REVOKE', 'UNKNOWN'].includes(String(q.type)),
        'OWNER_TYPE_INVALID',
      );
  }
  return { ...q };
}
export const readText = (v: unknown): string | null =>
  typeof v === 'string' ? v : null;
export interface LinkedPage<T> {
  items: T[];
  total: number | null;
  availableTotal: number | null;
  hasMore: boolean;
  nextCursor: string | null;
  nextPage: number | null;
  meta: Row;
}
export interface NfcHistoryEvent {
  recordId: string;
  activityId: string;
  eventId: string;
  type: string;
  status: string | null;
  time: string | null;
  uid: string | null;
  previousUid: string | null;
  serial: string | null;
  product: string | null;
  warehouse: string | null;
  actor: string | null;
  reason: string | null;
  tagStatus: string | null;
  statusSource: string;
}
export interface ScanSessionRow {
  id: string;
  number: string | null;
  sourceType: string | null;
  status: string | null;
  createdAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  counts: Row;
  timezone?: string | null;
  latestEvent?: P23LatestEvent | null;
  latestEventStatus?: string | null;
}
export interface ResumeTask {
  localOnly?: boolean;
  id: string;
  scanSessionId: string;
  caseId: string;
  version: number;
  status: string;
  policy: string;
  businessId: string | null;
  businessVersion: number | null;
  number: string | null;
  postedAt: string | null;
  canOpenBusiness: boolean;
  quantity: number | null;
  codeCount: number;
  codes: Row[];
  lastKey: string | null;
  lastCommand: string | null;
}
const pageMeta = (meta: Row, offset = false) => {
  const more = offset ? meta.has_more : meta.hasMore,
    next = offset ? null : meta.nextCursor;
  required(
    (meta.total === null || count(meta.total)) && typeof more === 'boolean',
  );
  if (offset)
    required(
      count(meta.total) &&
        positive(meta.page) &&
        positive(meta.per_page) &&
        count(meta.last_page),
    );
  if (!offset) required(next === null || (typeof next === 'string' && !!next));
  if (more && !offset)
    required((typeof next === 'string' && !!next) || positive(meta.nextPage));
  return {
    total: meta.total as number | null,
    availableTotal: count(meta.availableTotal)
      ? (meta.availableTotal as number)
      : null,
    hasMore: more as boolean,
    nextCursor: typeof next === 'string' ? next : null,
    nextPage: offset
      ? more
        ? Number(meta.page) + 1
        : null
      : count(meta.nextPage)
      ? (meta.nextPage as number)
      : null,
    meta,
  };
};
export function createLinkedHistoryRead(
  getContext: () => P08Context,
  client: Pick<typeof apiClient, 'get'> = apiClient,
) {
  function scope(owner: 'P21' | 'P22' | 'P23') {
    const e = getCurrentEnvironment();
    if (
      BUILD_PROFILE !== 'dev-test' ||
      e.expectedTier !== 'dev-test' ||
      !e.environmentClassVerified ||
      e.apiBaseUrl !== 'https://khohoanamdev.lptech.info.vn'
    )
      throw new AppError({
        kind: 'blocked_by_gate',
        code: 'DIRECT_READ_DEV_ONLY',
        message: 'Luồng đọc này chỉ mở trên bản DEV/TEST đã xác minh.',
      });
    const s = owner === 'P21' ? p09Scope(getContext()) : p08Scope(getContext());
    const allowed =
      owner === 'P21'
        ? s.permissions.includes('warranty.component_issue')
        : owner === 'P22'
        ? s.permissions.some(p =>
            ['physical_code.assign_rfid', 'inventory.trace'].includes(p),
          )
        : s.permissions.includes('inventory.view');
    if (!allowed)
      throw new AppError({
        kind: 'http',
        status: 403,
        code: 'OWNER_READ_FORBIDDEN',
        message: 'Chưa có quyền đọc nguồn này.',
      });
    return s;
  }
  async function read(
    owner: 'P21' | 'P22' | 'P23',
    path: string,
    query: Record<string, string | number> = {},
    signal?: AbortSignal,
  ): Promise<{ data: unknown; meta: Row }> {
    const s = scope(owner),
      session = captureSessionScope(),
      key = JSON.stringify(s);
    const current = () => {
      if (
        !isSessionScopeCurrent(session) ||
        JSON.stringify(scope(owner)) !== key
      )
        throw new AppError({
          kind: 'cancelled',
          code: 'OWNER_STALE_SCOPE',
          message: 'Phiên, kho hoặc quyền đã thay đổi.',
        });
    };
    const health = await client.get<unknown>('/api/v1/health', { signal });
    current();
    required(
      health.status === 200 &&
        isDevRuntimeIdentity(
          readObject(readObject(readObject(health.data).data).build).sha,
          health.header?.('X-WMS-Deployment-Tier'),
        ),
      'OWNER_RUNTIME_CHANGED',
    );
    const header: Record<string, string> | undefined =
      owner === 'P21'
        ? { 'X-Component-Resume-Contract': 'p21-component-resume-v1' }
        : owner === 'P22'
        ? { 'X-NFC-History-Contract': 'p22-nfc-history-v1' }
        : undefined;
    const r: ApiResponse<unknown> = await client.get<unknown>(path, {
      signal,
      query: { ...query, warehouse_id: s.warehouseId },
      headers: header,
    });
    current();
    const b = readObject(r.data),
      meta = readObject(b.meta);
    required(
      r.status === 200 && b.success === true && Object.hasOwn(b, 'data'),
    );
    if (owner === 'P21')
      required(
        meta.contract === 'mini-app-p03-v1' &&
          meta.resume_contract === 'p21-component-resume-v1' &&
          meta.warehouse_id === s.warehouseId &&
          meta.actor_id === s.actorId &&
          meta.auth_session_id === s.authSessionId &&
          meta.mutation_exposed === false,
      );
    else if (owner === 'P22')
      required(
        meta.contract === 'p22-nfc-history-v1' &&
          meta.owner === 'P08' &&
          meta.warehouseId === s.warehouseId &&
          meta.countUnit === 'EVENT' &&
          meta.source === 'NFC' &&
          meta.coveragePolicy === 'ONLY_PERSISTED_EVENT_SNAPSHOTS' &&
          meta.legacyPolicy === 'EXCLUDE_UNPROVEN_EVENT_WAREHOUSE' &&
          meta.resultPolicy === 'OWNER_RESULT_SNAPSHOT_NO_STORAGE_DEFAULTS' &&
          meta.paginationConsistency ===
            'KEYSET_UPPER_BOUND_NOT_FROZEN_SNAPSHOT' &&
          meta.exportAvailable === false &&
          meta.currentTagLookupPerformed === false &&
          meta.isConfirmationReceipt === false,
      );
    else if (path.startsWith('/api/v1/mini-app/history/scan-sessions/'))
      required(
        meta.contract === 'mini-app-p08-v1' &&
          meta.warehouseId === s.warehouseId &&
          readObject(readObject(b.data).p23).contract === P23_CONTRACT,
      );
    else
      required(
        meta.contract === P23_CONTRACT &&
          meta.warehouseId === s.warehouseId &&
          meta.countUnit === 'SCAN_SESSION',
      );
    if (owner === 'P23' && path === '/api/v1/mini-app/scan-sessions')
      p23ListMeta(meta);
    return { data: b.data, meta };
  }
  function nfc(value: unknown): NfcHistoryEvent {
    const v = readObject(value),
      s = scope('P22'),
      w = readObject(v.warehouse);
    required(
      ownerUuid(v.eventId) &&
        ownerUuid(v.physical_code_id) &&
        v.recordId === 'NFC:' + v.physical_code_id &&
        v.activityId === 'NFC:' + v.eventId &&
        w.warehouse_id === s.warehouseId &&
        v.source === 'NFC' &&
        v.identity_source === 'PERSISTED_NFC_AUDIT_SNAPSHOT' &&
        v.raw_content === null &&
        v.raw_content_status === 'NOT_EXPOSED_MAY_CONTAIN_SECRETS' &&
        v.current_tag_status === null &&
        v.isConfirmationReceipt === false &&
        v.mutation_available === false,
    );
    required(
      ['PERMITTED', 'REDACTED'].includes(String(v.audit_details_status)) &&
        (v.audit_details_status === 'PERMITTED'
          ? s.permissions.includes('audit_log.view')
          : v.actor === null && v.reason === null) &&
        (v.time === null
          ? v.timeStatus === 'NOT_RECORDED'
          : typeof v.time === 'string' && v.timeStatus === 'AUDIT_CREATED_AT'),
      'P22_EVENT_PRIVACY_INVALID',
    );
    required(
      v.status === null
        ? v.status_source === 'NOT_RECORDED'
        : typeof v.status === 'string' &&
            v.status_source === 'PERSISTED_OWNER_RESULT',
    );
    required(
      ['ASSIGN', 'REPLACE', 'REVOKE', 'UNKNOWN'].includes(String(v.type)),
    );
    if (v.type === 'REPLACE')
      required(
        ownerUuid(v.previous_physical_code_id) &&
          v.previous_physical_code_id !== v.physical_code_id &&
          typeof v.previous_hardware_uid === 'string' &&
          !!v.previous_hardware_uid &&
          typeof v.hardware_uid === 'string' &&
          !!v.hardware_uid &&
          v.previous_hardware_uid !== v.hardware_uid,
        'P22_REPLACEMENT_EVIDENCE_REQUIRED',
      );
    return {
      recordId: String(v.recordId),
      activityId: String(v.activityId),
      eventId: String(v.eventId),
      type: readText(v.type_label) ?? 'Chưa xác minh',
      status: readText(v.status),
      time: readText(v.time),
      uid: readText(v.hardware_uid),
      previousUid: readText(v.previous_hardware_uid),
      serial: readText(v.serial_number),
      product: readText(readObject(v.sku).sku_name),
      warehouse: readText(w.name),
      actor: readText(readObject(v.actor).display_name),
      reason: readText(v.reason),
      tagStatus: readText(v.tag_status_at_event),
      statusSource: String(v.status_source),
    };
  }
  function task(value: unknown): ResumeTask {
    const v = readObject(value),
      s = scope('P21'),
      summary = readObject(v.summary);
    required(
      ownerUuid(v.document_id) &&
        ownerUuid(v.scan_session_id) &&
        ownerUuid(v.warranty_case_id) &&
        v.actor_id === s.actorId &&
        v.auth_session_id === s.authSessionId &&
        v.warehouse_id === s.warehouseId &&
        v.operation === 'COMPONENT_ISSUE' &&
        v.document_kind === 'STAGING_DRAFT' &&
        positive(v.version) &&
        v.codes_validated === false &&
        v.scan_evidence_persisted === false &&
        v.mutation_exposed === false &&
        ['DRAFT', 'RECORDED', 'CANCELLED'].includes(String(v.status)) &&
        v.owner_revalidation_required === true &&
        v.stock_effect === 'NONE' &&
        v.read_stock_effect === 'NONE' &&
        readObject(readObject(v.form).p19).contract ===
          'p19-component-issue-linked-v1' &&
        readObject(readObject(v.form).p19).warranty_case_id ===
          v.warranty_case_id &&
        typeof v.business_link_present === 'boolean' &&
        typeof v.can_open_business === 'boolean' &&
        Array.isArray(v.codes) &&
        summary.code_count === (v.codes as unknown[]).length &&
        summary.basis === 'UNVALIDATED_PERSONAL_SNAPSHOT',
    );
    const codes = (v.codes as unknown[]).map(readObject);
    const shapeValid = codes.every(
      code =>
        typeof code.raw_code === 'string' &&
        code.raw_code.length > 0 &&
        positive(code.quantity) &&
        Number(code.quantity) <= 100000 &&
        ['CAMERA', 'SCANNER', 'HARDWARE', 'MANUAL'].includes(
          String(code.scan_source),
        ),
    );
    const quantity = shapeValid
      ? codes.reduce((sum, code) => sum + Number(code.quantity), 0)
      : null;
    const canOpen = v.can_open_business === true;
    required(
      v.snapshot_shape_valid === shapeValid &&
        summary.quantity_total === quantity &&
        v.case_allows_issue ===
          ['CHECKING', 'REPAIRING'].includes(String(v.case_status)) &&
        (canOpen
          ? s.permissions.includes('documents.read') &&
            v.business_link_present === true &&
            ownerUuid(v.business_document_id) &&
            positive(v.business_version) &&
            typeof v.business_status === 'string' &&
            v.business_detail_path ===
              '/api/v1/mini-app/warranty-component-issues/' +
                v.business_document_id
          : [
              v.business_document_id,
              v.business_version,
              v.business_status,
              v.business_detail_path,
              v.document_no,
              v.posted_at,
            ].every(field => field === null)),
      'P21_SNAPSHOT_OR_BUSINESS_INVALID',
    );
    const policy =
      v.status === 'RECORDED'
        ? canOpen
          ? 'OPEN_EXISTING_RESULT'
          : 'RECORDED_RESULT_UNAVAILABLE'
        : v.status === 'CANCELLED'
        ? 'READ_ONLY_CANCELLED'
        : !shapeValid
        ? 'READ_ONLY_INCOMPLETE_SNAPSHOT'
        : !v.case_allows_issue
        ? 'READ_ONLY_CASE_STATE'
        : v.business_link_present
        ? 'READ_ONLY_LINK_CONFLICT'
        : 'OWNER_PREFLIGHT_REQUIRED';
    required(
      v.resume_policy === policy &&
        (v.last_request_id === null || ownerUuid(v.last_request_id)) &&
        (v.last_command === null ||
          ['SAVE', 'RECORD', 'CANCEL'].includes(String(v.last_command))),
      'P21_POLICY_INVALID',
    );
    return {
      id: String(v.document_id),
      scanSessionId: String(v.scan_session_id),
      caseId: String(v.warranty_case_id),
      version: Number(v.version),
      status: String(v.status),
      policy: String(v.resume_policy),
      businessId: ownerUuid(v.business_document_id)
        ? v.business_document_id
        : null,
      businessVersion: count(v.business_version)
        ? (v.business_version as number)
        : null,
      number: readText(v.document_no),
      postedAt: readText(v.posted_at),
      canOpenBusiness: v.can_open_business === true,
      quantity: summary.quantity_total as number | null,
      codeCount: Number(summary.code_count),
      codes: codes.map(code => ({
        raw_code: typeof code.raw_code === 'string' ? code.raw_code : null,
        quantity:
          typeof code.quantity === 'number' || typeof code.quantity === 'string'
            ? code.quantity
            : null,
        scan_source:
          typeof code.scan_source === 'string' ? code.scan_source : null,
      })),
      lastKey: ownerUuid(v.last_request_id) ? v.last_request_id : null,
      lastCommand: readText(v.last_command),
    };
  }
  return {
    scopeKey: (owner: 'P21' | 'P22' | 'P23') => {
      try {
        return JSON.stringify(scope(owner));
      } catch {
        return '';
      }
    },
    async nfcList(
      query: Record<string, string | number> = {},
      signal?: AbortSignal,
    ): Promise<LinkedPage<NfcHistoryEvent>> {
      const r = await read(
        'P22',
        '/api/v1/mini-app/history/records',
        { source: 'NFC', limit: 20, ...linkedHistoryQuery('P22', query) },
        signal,
      );
      required(Array.isArray(r.data));
      required(
        count(r.meta.total) &&
          (r.data as unknown[]).length <= Number(r.meta.total) &&
          (!r.meta.hasMore ||
            ((r.data as unknown[]).length > 0 &&
              typeof r.meta.nextCursor === 'string' &&
              !!r.meta.nextCursor)),
        'P22_PAGE_INVALID',
      );
      return { items: (r.data as unknown[]).map(nfc), ...pageMeta(r.meta) };
    },
    async nfcDetail(
      recordId: string,
      activityId: string,
      signal?: AbortSignal,
    ) {
      required(
        /^NFC:[0-9a-f-]{36}$/i.test(recordId) &&
          /^NFC:[0-9a-f-]{36}$/i.test(activityId),
      );
      const r = await read(
          'P22',
          '/api/v1/mini-app/history/records/' + encodeURIComponent(recordId),
          { source: 'NFC', activityId },
          signal,
        ),
        v = readObject(r.data),
        selected = nfc(v.selectedActivity);
      required(
        v.recordId === recordId &&
          selected.recordId === recordId &&
          selected.activityId === activityId &&
          Array.isArray(v.events) &&
          v.events.length === 1 &&
          r.meta.total === 1 &&
          JSON.stringify(nfc(v.events[0])) === JSON.stringify(selected),
      );
      return selected;
    },
    async nfcEvent(eventId: string, signal?: AbortSignal) {
      required(ownerUuid(eventId));
      const r = await read(
        'P22',
        '/api/v1/mini-app/history/records',
        { source: 'NFC', event_id: eventId },
        signal,
      );
      required(Array.isArray(r.data) && r.data.length === 1);
      const selected = nfc((r.data as unknown[])[0]);
      required(selected.eventId === eventId);
      const exact = await this.nfcDetail(
        selected.recordId,
        selected.activityId,
        signal,
      );
      required(
        exact.eventId === selected.eventId &&
          exact.recordId === selected.recordId &&
          exact.activityId === selected.activityId,
        'P22_DIRECT_DETAIL_MISMATCH',
      );
      return exact;
    },
    async nfcSummary(
      query: Record<string, string | number> = {},
      signal?: AbortSignal,
    ) {
      const r = await read(
          'P22',
          '/api/v1/mini-app/history/summary',
          {
            source: 'NFC',
            date_mode: 'ALL',
            ...linkedHistoryQuery('P22', query, true),
          },
          signal,
        ),
        d = readObject(r.data);
      required(
        count(d.grandTotal) &&
          count(d.availableTotal) &&
          d.countUnit === 'EVENT' &&
          Array.isArray(d.statusTotals),
      );
      const statusTotals = (d.statusTotals as unknown[]).map(value => {
        const item = readObject(value);
        required(
          (item.status === null ||
            (typeof item.status === 'string' && !!item.status.trim())) &&
            count(item.total),
        );
        return {
          status: item.status as string | null,
          total: item.total as number,
        };
      });
      required(
        new Set(statusTotals.map(item => item.status)).size ===
          statusTotals.length &&
          statusTotals.reduce((sum, item) => sum + item.total, 0) ===
            d.grandTotal,
        'P22_STATUS_TOTALS_INVALID',
      );
      return {
        grandTotal: d.grandTotal as number,
        availableTotal: d.availableTotal as number,
        statusTotals,
      };
    },
    async sessions(
      query: Record<string, string | number> = {},
      signal?: AbortSignal,
    ): Promise<LinkedPage<ScanSessionRow>> {
      const r = await read(
        'P23',
        '/api/v1/mini-app/scan-sessions',
        { per_page: 20, ...linkedHistoryQuery('P23', query) },
        signal,
      );
      required(Array.isArray(r.data));
      const s = scope('P23');
      return {
        items: (r.data as unknown[]).map(value => {
          return {
            ...p23Batch(value, s.warehouseId),
            timezone: readText(r.meta.timezone),
          };
        }),
        ...pageMeta(r.meta),
      };
    },
    async session(id: string, cursor?: string, signal?: AbortSignal) {
      required(ownerUuid(id));
      const r = await read(
          'P23',
          '/api/v1/mini-app/history/scan-sessions/' + id,
          { limit: 20, ...(cursor ? { cursor } : {}) },
          signal,
        ),
        d = readObject(r.data),
        p23 = readObject(d.p23),
        batch = readObject(p23.batch),
        counts = p23Counts(p23.counts);
      required(d.sessionId === id && Array.isArray(d.events));
      const batchProjection =
        p23.batch === null
          ? undefined
          : p23Batch(batch, scope('P23').warehouseId, p23.counts);
      if (batchProjection) required(batchProjection.id === id);
      const events = (d.events as unknown[]).map(raw => {
        const event = readObject(raw);
        required(
          event.recordId === 'SCAN:' + id &&
            ownerUuid(event.eventId) &&
            event.activityId === 'SCAN:' + event.eventId &&
            event.rawCode === null &&
            event.quantity === null &&
            event.isConfirmationReceipt === false,
        );
        return {
          id: String(event.activityId),
          eventId: String(event.eventId),
          status: readText(event.status),
          action: readText(event.action),
          time: readText(event.time),
        };
      });
      return {
        batch: {
          id,
          number: batchProjection?.number ?? null,
          sourceType: batchProjection?.sourceType ?? null,
          status: batchProjection?.status ?? null,
          createdAt: batchProjection?.createdAt ?? null,
          startedAt: batchProjection?.startedAt ?? null,
          endedAt: batchProjection?.endedAt ?? null,
          counts,
        },
        latestEvent: batchProjection?.latestEvent ?? null,
        latestEventStatus: batchProjection?.latestEventStatus ?? null,
        events,
        timezone: readText(r.meta.timezone),
        ...pageMeta(r.meta),
      };
    },
    async tasks(
      query: Record<string, string | number> = {},
      signal?: AbortSignal,
    ): Promise<LinkedPage<ResumeTask>> {
      const r = await read(
        'P21',
        '/api/v1/mini-app/drafts',
        {
          operation: 'COMPONENT_ISSUE',
          page: 1,
          per_page: 20,
          ...linkedHistoryQuery('P21', query),
        },
        signal,
      );
      required(Array.isArray(r.data));
      return {
        items: (r.data as unknown[]).map(task),
        ...pageMeta(r.meta, true),
      };
    },
    async task(id: string, scanId: string, signal?: AbortSignal) {
      required(ownerUuid(id) && ownerUuid(scanId));
      const r = await read(
        'P21',
        '/api/v1/mini-app/drafts/' + id,
        { operation: 'COMPONENT_ISSUE', scan_session_id: scanId },
        signal,
      );
      const t = task(r.data);
      required(t.id === id && t.scanSessionId === scanId);
      return t;
    },
    async taskRequest(
      t: ResumeTask,
      key: string,
      command: 'SAVE' | 'RECORD' | 'CANCEL',
      signal?: AbortSignal,
    ) {
      required(
        ownerUuid(key) &&
          ownerUuid(t.id) &&
          ownerUuid(t.scanSessionId) &&
          ['SAVE', 'RECORD', 'CANCEL'].includes(command),
      );
      const r = await read(
          'P21',
          '/api/v1/mini-app/drafts/' + t.id + '/requests/' + key,
          {
            operation: 'COMPONENT_ISSUE',
            scan_session_id: t.scanSessionId,
            command,
          },
          signal,
        ),
        d = readObject(r.data),
        receipt = readObject(d.receipt);
      required(
        ['SUCCEEDED', 'UNKNOWN'].includes(String(d.outcome)) &&
          d.p21_recovery_policy === 'CHECK_ONLY' &&
          d.may_create_new_request === false,
      );
      if (d.outcome === 'SUCCEEDED')
        required(
          receipt.request_id === key &&
            receipt.document_id === t.id &&
            receipt.scan_session_id === t.scanSessionId &&
            receipt.warehouse_id === scope('P21').warehouseId &&
            receipt.operation === 'COMPONENT_ISSUE' &&
            receipt.command === command &&
            receipt.outcome === 'SUCCEEDED' &&
            positive(receipt.version),
        );
      else required(d.receipt === null && d.response === null);
      return {
        outcome: d.outcome as 'SUCCEEDED' | 'UNKNOWN',
        receipt: d.receipt === null ? null : receipt,
      };
    },
  };
}
export type LinkedHistoryRead = ReturnType<typeof createLinkedHistoryRead>;
