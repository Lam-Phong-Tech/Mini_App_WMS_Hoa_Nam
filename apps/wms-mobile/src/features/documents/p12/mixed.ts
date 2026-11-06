import {
  requireValue,
  uuid,
  validateReadTarget,
  type Document,
  type Page,
  type Query,
  type Raw,
  type Scope,
  type Source,
} from './contract';
import {parseQueueProjection,parseQueueDisplay} from '../../../services/wms/p13QueueProjection';
import {parsePartnerSnapshot} from './partnerSnapshot';
import {parsePersistedWebHandoff} from '../../../services/wms/persistedWebHandoff';
import {
  parseDocumentTimestamp,
  compareDocumentTimestamps,
  isDocumentTimestampMetadata,
} from '../../../services/wms/documentTimestamps';
export const MIXED_CONTRACT = 'p12-mixed-documents-v3';
const MIXED_LEGACY_CONTRACT = 'p12-mixed-documents-v2';
export const MIXED_SOURCE_PIN = '1b58c6a4982d737c3ea4a27c9281f15d7fb299d6';
export const mixedSources = ['INBOUND', 'OUTBOUND', 'WARRANTY'] as const;
export type MixedSource = (typeof mixedSources)[number];
export interface MixedStatus {
  value: string;
  label: string;
  source: MixedSource | null;
  source_status: string | null;
}
export interface MixedPage extends Page<Document> {
  mixed: {
    facets: Record<
      'ALL' | MixedSource,
      { availability: 'READY' | 'DENIED'; total: number | null }
    >;
    options: MixedStatus[];
    coverage: 'ALL_SOURCES' | 'AUTHORIZED_SOURCES_ONLY';
    expiresAt: string;
    upperBound: string;
    cursorVersion: 3;
  };
}
const statuses = {
  INBOUND: ['DRAFT', 'SCANNING', 'POSTED', 'CANCELLED'],
  OUTBOUND: ['DRAFT', 'SCANNING', 'POSTED', 'CANCELLED'],
  WARRANTY: [
    'RECEIVED',
    'CHECKING',
    'REPAIRING',
    'COMPLETED',
    'RETURNED',
    'CANCELLED',
  ],
};
const rank = { inbound: 1, outbound: 2, warranty: 3 };
const obj = (v: unknown): Raw => {
  requireValue(
    v && typeof v === 'object' && !Array.isArray(v),
    'MIXED_OBJECT_MISMATCH',
  );
  return v as Raw;
};
const integer = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) >= 0;
const day = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v + 'T00:00:00Z')) &&
  new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
const instant = (v: unknown): v is string =>
  parseDocumentTimestamp(v).status === 'RECORDED';
export function compareMixed(a: Document, b: Document, sort: string) {
  if (a.createdAt == null || b.createdAt == null) {
    if (a.createdAt !== b.createdAt) return a.createdAt == null ? 1 : -1;
  } else {
    const order = compareDocumentTimestamps(
      a.createdTimestamp ?? parseDocumentTimestamp(a.createdAt),
      b.createdTimestamp ?? parseDocumentTimestamp(b.createdAt),
    );
    if (order) return order * (sort === 'created_at_asc' ? 1 : -1);
  }
  return (
    rank[a.type] - rank[b.type] || (a.id === b.id ? 0 : a.id < b.id ? -1 : 1)
  );
}
export function mixedQuery(input: Query = {}): Query {
  requireValue(
    Object.keys(input).every(k =>
      [
        'source',
        'q',
        'status',
        'date_from',
        'date_to',
        'timezone',
        'sort',
        'per_page',
        'cursor',
        'warehouse_id',
      ].includes(k),
    ),
    'MIXED_QUERY_UNSUPPORTED',
  );
  const source = input.source ?? 'ALL',
    status = input.status ?? 'ALL',
    sort = input.sort ?? 'created_at_desc',
    per_page = input.per_page ?? 20;
  requireValue(
    ['ALL', ...mixedSources].includes(String(source)) &&
      ['created_at_asc', 'created_at_desc'].includes(String(sort)) &&
      integer(per_page) &&
      per_page >= 1 &&
      per_page <= 100,
    'MIXED_QUERY_INVALID',
  );
  const q = input.q ?? '';
  requireValue(
    typeof q === 'string' &&
      Array.from(q).length <= 600 &&
      Array.from(q.trim().normalize('NFC').toLowerCase()).length <= 200,
    'MIXED_QUERY_INVALID',
  );
  const keys = mixedSources.flatMap(s => statuses[s].map(v => s + ':' + v));
  requireValue(
    status === 'ALL' ||
      (keys.includes(String(status)) &&
        (source === 'ALL' || String(status).startsWith(source + ':'))),
    'MIXED_QUERY_INVALID',
  );
  requireValue(
    input.timezone === undefined || input.timezone === 'Asia/Ho_Chi_Minh',
    'MIXED_QUERY_INVALID',
  );
  requireValue(
    (input.date_from === undefined && input.date_to === undefined) ||
      (day(input.date_from) &&
        day(input.date_to) &&
        input.date_from <= input.date_to),
    'MIXED_DATE_PAIR_REQUIRED',
  );
  if (input.cursor !== undefined)
    requireValue(
      typeof input.cursor === 'string' &&
        input.cursor.length > 0 &&
        input.cursor.length <= 4096,
      'MIXED_QUERY_INVALID',
    );
  if (input.warehouse_id !== undefined)
    requireValue(uuid(input.warehouse_id), 'MIXED_QUERY_INVALID');
  return {
    ...input,
    source,
    status,
    sort,
    per_page,
    cursor: input.cursor ?? 'start',
    timezone: 'Asia/Ho_Chi_Minh',
    ...(q.trim() ? { q } : {}),
  };
}
export function parseMixed(
  body: unknown,
  input: Query,
  scope: Scope,
  origin: string,
): MixedPage {
  const q = mixedQuery(input),
    b = obj(body),
    m = obj(b.meta),
    isV3 = m.contract === MIXED_CONTRACT;
  requireValue(
    isDocumentTimestampMetadata(m),
    'DOCUMENT_TIMESTAMP_CONTRACT_MISMATCH',
  );
  requireValue(m.cursor_version === 3, 'MIXED_CURSOR_VERSION_MISMATCH');
  requireValue(
    b.success === true && Array.isArray(b.data),
    'MIXED_BODY_MISMATCH',
  );
  requireValue(
    (m.contract === MIXED_CONTRACT || m.contract === MIXED_LEGACY_CONTRACT) &&
      m.warehouse_id === scope.warehouseId &&
      obj(m.warehouse_context).status === 'READY' &&
      obj(m.warehouse_context).source === 'CONFIRMED_SERVER_SESSION' &&
      m.source === q.source,
    'MIXED_SCOPE_MISMATCH',
  );
  requireValue(
    m.count_unit === 'DOCUMENT_LIST_RECORD' &&
      integer(m.total) &&
      m.per_page === q.per_page &&
      m.returned_count === b.data.length &&
      b.data.length <= Number(q.per_page) &&
      m.pagination_mode === 'KEYSET' &&
      typeof m.hasMore === 'boolean' &&
      m.has_more === m.hasMore &&
      m.next_cursor === m.nextCursor &&
      (m.hasMore
        ? typeof m.nextCursor === 'string' &&
          m.nextCursor.length > 0 &&
          m.nextCursor.length <= 4096
        : m.nextCursor === null),
    'MIXED_PAGING_MISMATCH',
  );
  requireValue(
    m.snapshot_consistent === false &&
      m.cross_request_snapshot === false &&
      m.consistency ===
        'SINGLE_RESPONSE_SNAPSHOT_LIVE_KEYSET_BETWEEN_REQUESTS' &&
      m.cursor_ttl_seconds === 900 &&
      instant(m.cursor_expires_at) &&
      instant(m.upper_bound_created_at),
    'MIXED_PAGING_MISMATCH',
  );
  requireValue(
    m.date_field === 'created_at' &&
      m.timezone === 'Asia/Ho_Chi_Minh' &&
      m.sort === q.sort &&
      JSON.stringify(m.tie_break) ===
        JSON.stringify({ source_rank: 'asc', id: 'asc' }) &&
      JSON.stringify(m.source_rank) ===
        JSON.stringify({ INBOUND: 1, OUTBOUND: 2, WARRANTY: 3 }) &&
      m.null_created_at === 'LAST_UNLESS_EXCLUDED_BY_DATE_FILTER',
    'MIXED_ORDER_MISMATCH',
  );
  const normalized = obj(m.query);
  requireValue(
    normalized.source === q.source &&
      normalized.status === q.status &&
      normalized.date_from === (q.date_from ?? null) &&
      normalized.date_to === (q.date_to ?? null) &&
      normalized.q_applied === (typeof q.q === 'string' && q.q.trim() !== ''),
    'MIXED_QUERY_MISMATCH',
  );
  requireValue(
    m.facet_scope === 'AUTHORIZED_FILTERED_BEFORE_SOURCE_SELECTION_AND_CURSOR',
    'MIXED_FACET_SCOPE_MISMATCH',
  );
  requireValue(
    m.source_failure_policy === 'FAIL_CLOSED_NO_PARTIAL_DATA_OR_TOTAL',
    'MIXED_SOURCE_FAILURE_POLICY_MISMATCH',
  );
  requireValue(
    m.cache_policy === 'NO_INTERNAL_RESULT_CACHE',
    'MIXED_CACHE_POLICY_MISMATCH',
  );
  requireValue(
    isV3
      ? m.write_operations === null ||
          (Array.isArray(m.write_operations) && m.write_operations.length === 0)
      : Array.isArray(m.write_operations) && m.write_operations.length === 0,
    'MIXED_WRITE_OPERATIONS_MISMATCH',
  );
  requireValue(
    isV3
      ? m.warranty_customer_search === null ||
          m.warranty_customer_search === 'NOT_SUPPORTED' ||
          (typeof m.warranty_customer_search === 'string' &&
            m.warranty_customer_search.includes('REDACTED'))
      : m.warranty_customer_search === 'NOT_SUPPORTED',
    'MIXED_PRIVACY_METADATA_MISMATCH',
  );
  const allowed = m.allowed_sources;
  requireValue(
    Array.isArray(allowed) &&
      allowed.length > 0 &&
      new Set(allowed).size === allowed.length &&
      allowed.every(
        s =>
          mixedSources.includes(s) &&
          (s === 'WARRANTY'
            ? scope.rights.some(
                p => p === 'warranty.view' || p === 'warranty.manage',
              )
            : scope.rights.includes(String(s).toLowerCase() + '.view')),
      ),
    'MIXED_SCOPE_MISMATCH',
  );
  const facetRaw = obj(m.source_facets),
    facets = {} as MixedPage['mixed']['facets'];
  let sum = 0;
  for (const source of ['ALL', ...mixedSources] as const) {
    const f = obj(facetRaw[source]),
      ready = source === 'ALL' || allowed.includes(source);
    requireValue(
      f.availability === (ready ? 'READY' : 'DENIED') &&
        (ready ? integer(f.total) : f.total === null),
      'MIXED_FACET_MISMATCH',
    );
    facets[source] = {
      availability: ready ? 'READY' : 'DENIED',
      total: f.total as number | null,
    };
    if (source !== 'ALL' && ready) sum += Number(f.total);
  }
  requireValue(
    facets.ALL.total === sum &&
      m.total === facets[q.source as 'ALL' | MixedSource].total &&
      m.coverage ===
        (allowed.length === 3 ? 'ALL_SOURCES' : 'AUTHORIZED_SOURCES_ONLY'),
    'MIXED_FACET_MISMATCH',
  );
  const optionsRaw = obj(m.filter_options);
  requireValue(
    (isV3
      ? optionsRaw.display_mapping_approval === 'APPROVED'
      : optionsRaw.display_mapping_approval === 'PENDING_BA') &&
      Array.isArray(optionsRaw.status) &&
      Array.isArray(m.status_filter_keys),
    'MIXED_STATUS_MISMATCH',
  );
  const options: MixedStatus[] = optionsRaw.status.map(v => {
    const o = obj(v);
    if (o.value === 'ALL') {
      requireValue(
        o.source === null &&
          o.source_status === null &&
          (isV3
            ? typeof o.display_label === 'string'
            : o.display_label === null),
        'MIXED_STATUS_MISMATCH',
      );
      return {
        value: 'ALL',
        label: String(o.label),
        source: null,
        source_status: null,
      };
    }
    const s = o.source as MixedSource;
    requireValue(
      allowed.includes(s) &&
        statuses[s]?.includes(String(o.source_status)) &&
        o.value === s + ':' + o.source_status &&
        (isV3
          ? typeof o.label === 'string' &&
            o.label_availability === 'APPROVED' &&
            typeof o.display_label === 'string'
          : o.label === o.source_status &&
            o.label_availability === 'CANONICAL_ONLY_PENDING_BA_LABEL' &&
            o.display_label === null),
      'MIXED_STATUS_MISMATCH',
    );
    return {
      value: String(o.value),
      label: String(isV3 ? o.display_label : o.label),
      source: s,
      source_status: String(o.source_status),
    };
  });
  requireValue(
    options[0]?.value === 'ALL' &&
      new Set(options.map(o => o.value)).size === options.length &&
      JSON.stringify(options.map(o => o.value)) ===
        JSON.stringify(m.status_filter_keys),
    'MIXED_STATUS_MISMATCH',
  );
  const items: Document[] = b.data.map(v => {
    const r = obj(v),
      source = r.source as MixedSource,
      type = String(source).toLowerCase() as Source;
    requireValue(
      allowed.includes(source) &&
        uuid(r.id) &&
        r.row_key === source + ':' + r.id &&
        r.warehouse_id === scope.warehouseId &&
        r.resource_type ===
          (source === 'WARRANTY' ? 'WARRANTY_CASE' : 'STOCK_DOCUMENT') &&
        (r.document_no === null || typeof r.document_no === 'string') &&
        (r.source_status === null ||
          statuses[source]?.includes(String(r.source_status))) &&
        r.status === r.source_status &&
        r.status_key ===
          (r.source_status === null ? null : source + ':' + r.source_status),
      'MIXED_IDENTITY_MISMATCH',
    );
    const createdTimestamp = parseDocumentTimestamp(r.created_at);
    requireValue(
      r.created_at === null || createdTimestamp.status === 'RECORDED',
      'MIXED_TIME_MISMATCH',
    );
    requireValue(
      r.time_status === (r.created_at === null ? 'NOT_RECORDED' : 'RECORDED') &&
        r.timestamp_source ===
          (source === 'WARRANTY' ? 'warranty_case' : 'stock_documents') +
            '.created_at',
      'MIXED_TIME_MISMATCH',
    );
    const p = obj(r.p12),
      identity = obj(p.identity),
      status = obj(p.status),
      display = obj(r.display_status),
      partner = obj(r.partner);
    requireValue(
      identity.source === source &&
        identity.id === r.id &&
        identity.warehouse_id === scope.warehouseId &&
        identity.resource_type === r.resource_type &&
        status.canonical === (isV3 ? r.canonical_status : r.source_status) &&
        (isV3
          ? status.mini_app === r.mini_app_status
          : status.mini_app === null) &&
        status.waiting_for_web === null &&
        status.waiting_for_web_evidence ===
          'NOT_ESTABLISHED_BY_STATUS_OR_READINESS' &&
        (isV3
          ? obj(status.readiness).state === obj(r.readiness).state &&
            obj(status.readiness).applicable === obj(r.readiness).applicable &&
            obj(status.readiness).source === obj(r.readiness).source
          : // Legacy v2 has no projected readiness/status mapping in the aggregate.
            ((Array.isArray(status.readiness) &&
              status.readiness.length === 0) ||
              (!Array.isArray(status.readiness) &&
                Object.keys(obj(status.readiness)).length === 0)) &&
            r.mini_app_status === null &&
            r.readiness === null),
      'MIXED_IDENTITY_MISMATCH',
    );
    requireValue(
      isV3
        ? display.value === r.mini_app_status &&
            typeof display.label === 'string' &&
            display.label.trim().length > 0 &&
            display.availability === 'MAPPED' &&
            display.mapping_contract === 'p12-p13-p16-status-v1'
        : display.value === null &&
            display.label === null &&
            display.availability === 'PENDING_BA_MAPPING',
      'MIXED_STATUS_MISMATCH',
    );
    requireValue(
      source === 'WARRANTY'
        ? partner.display_name === null &&
            partner.redacted === true &&
            partner.availability === 'WITHHELD_IN_AGGREGATE'
        : partner.redacted === false &&
            (partner.display_name === null ||
              typeof partner.display_name === 'string') &&
            partner.availability ===
              (partner.display_name === null ? 'NOT_RECORDED' : 'RECORDED'),
      'MIXED_PRIVACY_MISMATCH',
    );
    validateReadTarget(r.read_target as never, type, r.id, scope.warehouseId, {
      origin,
      context: scope,
    });
    validateReadTarget(p.read_target as never, type, r.id, scope.warehouseId, {
      origin,
      context: scope,
    });
    if (q.source !== 'ALL')
      requireValue(source === q.source, 'MIXED_QUERY_MISMATCH');
    if (q.status !== 'ALL')
      requireValue(r.status_key === q.status, 'MIXED_QUERY_MISMATCH');
    const queueProjection=parseQueueProjection(r.queue_projection,{kind:type,id:r.id as string,warehouseId:scope.warehouseId},{currentStatus:r.canonical_status as string|null});
    const observedDisplay=parseQueueDisplay(display,queueProjection,{kind:type,id:r.id as string,warehouseId:scope.warehouseId});
    const partnerSnapshot=parsePartnerSnapshot(partner,{kind:type,id:r.id as string,warehouseId:scope.warehouseId},{mode:'aggregate',contract:m.partner_contract,revision:m.partner_revision,expectedVersion:queueProjection?.available?queueProjection.version:undefined});
    const webHandoff=parsePersistedWebHandoff(r.web_post_handoff,{kind:type,id:r.id as string,warehouseId:scope.warehouseId},{expectedVersion:queueProjection?.available?queueProjection.version:partnerSnapshot?.documentVersion??undefined,expectedCanonical:queueProjection?.available?queueProjection.currentStatus:(isV3?r.canonical_status:r.source_status) as string|null});
    return {
      type,
      id: r.id,
      rowKey: r.row_key as string,
      number: r.document_no as string | null,
      warehouseId: scope.warehouseId,
      createdAt: r.created_at as string | null,
      createdTimestamp,
      rawStatus: r.source_status as string,
      displayStatus: observedDisplay??{
        availability: isV3 ? 'MAPPED' : 'PENDING_BA_MAPPING',
        label: isV3 ? String(display.label) : null,
        value: isV3 ? (display.value as string | null) : null,
      },
      queueProjection,
      ...(partnerSnapshot?{partnerSnapshot}:{}),
      ...(webHandoff?{webHandoff}:{}),
      p12: p as unknown as Document['p12'],
      source: r,
    };
  });
  requireValue(
    new Set(items.map(d => d.type + ':' + d.id)).size === items.length &&
      items.every(
        (d, i) => i === 0 || compareMixed(items[i - 1], d, String(q.sort)) < 0,
      ),
    'MIXED_ORDER_MISMATCH',
  );
  requireValue(
    !m.hasMore || items.length === Number(q.per_page),
    'MIXED_PAGING_MISMATCH',
  );
  requireValue(
    items.length <= Number(m.total) &&
      (q.cursor !== 'start' || Number(m.total) === 0 || items.length > 0),
    'MIXED_PAGING_MISMATCH',
  );
  return {
    items,
    meta: m,
    paging: {
      total: m.total as number,
      page: null,
      perPage: Number(q.per_page),
      hasMore: m.hasMore as boolean,
      nextCursor: m.nextCursor as string | null,
      mode: 'KEYSET',
      snapshotConsistent: false,
    },
    mixed: {
      facets,
      options,
      coverage: m.coverage as MixedPage['mixed']['coverage'],
      expiresAt: m.cursor_expires_at as string,
      upperBound: m.upper_bound_created_at as string,
      cursorVersion: 3,
    },
  };
}
