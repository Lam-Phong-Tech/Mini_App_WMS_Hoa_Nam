import {parseDocumentTimestamp,isDocumentTimestampMetadata} from '../../../services/wms/documentTimestamps';
import {parseQueueProjection,parseQueueDisplay} from '../../../services/wms/p13QueueProjection';
import {parsePartnerSnapshot} from './partnerSnapshot';
import {parsePersistedWebHandoff} from '../../../services/wms/persistedWebHandoff';
import {parseOwnerProjection} from './ownerProjection';
import {P12_TIMELINE_CONTRACT, parseHandoffMilestone} from './timelineHandoff';
const clone = value => JSON.parse(JSON.stringify(value));
function documentCreatedTimestamp(row) {
  const parsed = parseDocumentTimestamp(row.created_at);
  requireValue(parsed.status !== 'INVALID', 'DOCUMENT_TIMESTAMP_INVALID');
  return parsed;
}
function timestampMetadata(meta) {
  requireValue(isDocumentTimestampMetadata(meta), 'DOCUMENT_TIMESTAMP_CONTRACT_MISMATCH');
}
// Port of pinned ScannerHNApp P12 contract, SHAeaa8fd2f. Runtime DTO guards are shared with HTML.
// Pinned BE revision 2. Metadata does not establish cross-source workflow labels.
export const P12_RELEASE = Object.freeze({
  commit: 'eaa8fd2fd4ffb4013e6b72da0fa1384e80ef0154',
  contract: 'p12-documents-read-v2',
  scanContract: 'p12-scan-evidence-v2',
  status: 'SOURCE_IMPLEMENTED_PENDING_BA_AND_LIVE_TEST',
  fullActivation: false,
});
export class P12ReadError extends Error {
  constructor(code, message, status = null) {
    super(message);
    this.name = 'P12ReadError';
    this.code = code;
    this.status = status;
  }
}
export const requireValue = (
  ok,
  code = 'INVALID_RESPONSE',
  message = 'Nguồn dữ liệu chưa được xác minh.',
) => {
  if (!ok) throw new P12ReadError(code, message);
};
export const uuid = s =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export const object = v => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (n, min, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(n) && n >= min && n <= max;
const date = s =>
  typeof s === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(+new Date(s + 'T00:00:00Z')) &&
  new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
export const SOURCE_PATHS = Object.freeze({
  inbound: '/api/v1/mini-app/inbound-documents',
  outbound: '/api/v1/mini-app/outbound-documents',
  warranty: '/api/v1/mini-app/warranty-cases',
});
export function sourcePath(type, id = null) {
  requireValue(Object.hasOwn(SOURCE_PATHS, type), 'INVALID_SOURCE');
  if (id !== null) requireValue(uuid(id), 'CANONICAL_ID_REQUIRED');
  return SOURCE_PATHS[type] + (id ? '/' + id : '');
}
const owners = { inbound: 'P04', outbound: 'P05', warranty: 'P09' };
const countUnit = type =>
  type === 'warranty' ? 'WARRANTY_CASE' : 'STOCK_DOCUMENT';
const sourceText = v => (typeof v === 'string' && v.trim() !== '' ? v : null);
const sourceUuid = v => (uuid(v) ? v.toLowerCase() : null);
export function parseP12Metadata(meta, type) {
  const p = meta?.p12;
  requireValue(
    object(p) &&
      p.contract === P12_RELEASE.contract &&
      p.source === type.toUpperCase() &&
      p.owner === owners[type] &&
      p.count_unit === countUnit(type) &&
      p.all_sources_aggregate === false &&
      p.cross_source_mapping === 'PENDING_BA' &&
      p.query_contract ===
        (type === 'warranty'
          ? 'P09_WITH_P23_DATE_EXTENSION'
          : 'P12_STOCK_CREATED_DATE_OFFSET') &&
      Array.isArray(p.write_operations) &&
      p.write_operations.length === 0,
    'P12_METADATA_MISMATCH',
  );
  return clone(p);
}
// A target is data, never an arbitrary navigation URL. Null persisted scope is
// retained in parsing; a scoped caller must separately refuse to open it.
export function validateReadTarget(
  target,
  type,
  id,
  warehouseId,
  { origin = null, context = null } = {},
) {
  requireValue(
    object(target) &&
      target.method === 'GET' &&
      typeof target.path === 'string' &&
      object(target.query),
    'READ_TARGET_MISMATCH',
  );
  const expected = sourcePath(type, id),
    base = origin ?? 'https://p12.invalid',
    url = new URL(target.path, base);
  requireValue(
    url.origin === new URL(base).origin &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === expected &&
      (target.path === expected || target.path === url.href),
    'READ_TARGET_MISMATCH',
  );
  requireValue(
    Object.keys(target.query).every(k => k === 'warehouse_id') &&
      (warehouseId === null
        ? Object.keys(target.query).length === 0
        : target.query.warehouse_id === warehouseId),
    'READ_TARGET_SCOPE_MISMATCH',
  );
  if (context)
    requireValue(
      warehouseId !== null && warehouseId === context.warehouseId,
      'SCOPE_MISMATCH',
    );
  return clone(target);
}
export function parseTimeline(timeline, type, row, options = {}) {
  const optedIn = options.timelineContract === P12_TIMELINE_CONTRACT;
  requireValue(
    options.timelineContract === undefined || optedIn,
    'TIMELINE_CONTRACT_MISMATCH',
  );
  requireValue(
    object(timeline) &&
      timeline.coverage === 'PARTIAL' &&
      timeline.is_workflow_state === false &&
      object(timeline.milestones),
    'TIMELINE_CONTRACT_MISMATCH',
  );
  requireValue(
    optedIn
      ? ['inbound', 'outbound'].includes(type) &&
          options.timelineDiscovery === P12_TIMELINE_CONTRACT &&
          timeline.contract === P12_TIMELINE_CONTRACT
      : timeline.contract === undefined && options.timelineDiscovery === undefined,
    'TIMELINE_CONTRACT_MISMATCH',
  );
  const result = {coverage: 'PARTIAL', is_workflow_state: false, milestones: {}};
  if (optedIn) result.contract = P12_TIMELINE_CONTRACT;
  const table = type === 'warranty' ? 'warranty_case' : 'stock_documents';
  for (const key of ['created', 'checked', 'sent_to_web', 'posted']) {
    const m = timeline.milestones[key];
    requireValue(
      object(m) && m.event_id === null,
      'TIMELINE_CONTRACT_MISMATCH',
    );
    if (key === 'sent_to_web' && optedIn) {
      result.milestones[key] = parseHandoffMilestone(m, row, type);
      continue;
    }
    if (
      key === 'checked' ||
      key === 'sent_to_web' ||
      (key === 'posted' && type === 'warranty')
    ) {
      requireValue(
        m.availability ===
          (key === 'posted' ? 'NOT_APPLICABLE' : 'SOURCE_MAPPING_PENDING') &&
          m.occurred_at === null &&
          m.timestamp_source === null,
        'TIMELINE_CONTRACT_MISMATCH',
      );
    } else {
      const field = key === 'created' ? 'created_at' : 'posted_at',
        at = sourceText(row[field]);
      requireValue(
        m.availability === (at === null ? 'NOT_RECORDED' : 'RECORDED') &&
          m.occurred_at === at &&
          m.timestamp_source === table + '.' + field,
        'TIMELINE_TIMESTAMP_MISMATCH',
      );
    }
    result.milestones[key] = {
      availability: m.availability,
      occurred_at: m.occurred_at,
      timestamp_source: m.timestamp_source,
      event_id: null,
    };
  }
  return result;
}
export function parseP12Record(
  row,
  type,
  { detail = false, origin = null, timelineContract, timelineDiscovery } = {},
) {
  const p = row?.p12,
    identity = p?.identity,
    id = sourceUuid(row?.[type === 'warranty' ? 'warranty_case_id' : 'id']);
  const warehouseId = sourceUuid(
    row?.[
      type === 'inbound'
        ? 'dst_warehouse_id'
        : type === 'outbound'
        ? 'src_warehouse_id'
        : 'warehouse_id'
    ],
  );
  requireValue(
    object(p) &&
      object(identity) &&
      id !== null &&
      identity.source === type.toUpperCase() &&
      identity.resource_type === countUnit(type) &&
      identity.id === id &&
      identity.warehouse_id === warehouseId,
    'P12_IDENTITY_MISMATCH',
  );
  validateReadTarget(p.read_target, type, id, warehouseId, { origin });
  // Owner JSON middleware can reserialize an empty readiness object as []. Only
  // the empty shape is accepted; raw serialization stays intact. Nonempty arrays fail.
  const status = p.status;
  requireValue(
    object(status) &&
      status.canonical === sourceText(row.status) &&
      status.mini_app === sourceText(row.mini_app_status) &&
      (object(status.readiness) ||
        (Array.isArray(status.readiness) && status.readiness.length === 0)) &&
      status.mini_app_semantics ===
        (type === 'inbound'
          ? 'LEGACY_SCAN_READINESS_NOT_HANDOFF_PROOF'
          : 'OWNER_DEFINED') &&
      status.waiting_for_web === null &&
      status.waiting_for_web_evidence ===
        'NOT_ESTABLISHED_BY_STATUS_OR_READINESS',
    'P12_STATUS_MISMATCH',
  );
  const readinessKeys = [
    'ready_for_post',
    'ready_for_issue',
    'can_post',
    'product_info_complete',
  ].filter(k => Object.hasOwn(row, k));
  requireValue(
    Object.keys(status.readiness).length === readinessKeys.length &&
      readinessKeys.every(
        k =>
          status.readiness[k] === (typeof row[k] === 'boolean' ? row[k] : null),
      ),
    'P12_STATUS_MISMATCH',
  );
  const result = clone(p);
  // Only a detail parser with verified discovery/identity may expose these fields.
  delete result.owner_projection;
  if (detail) {
    try {
      result.timeline = parseTimeline(p.timeline, type, row, {timelineContract, timelineDiscovery});
    } catch (error) {
      result.timeline = null;
      result.timelineError = { code: error.code, message: error.message };
    }
  }
  return result;
}
function fields(input, allowed) {
  requireValue(
    object(input) && Object.keys(input).every(k => allowed.includes(k)),
    'UNSUPPORTED_QUERY',
    'Bộ lọc không thuộc contract của nguồn này.',
  );
}
function paging(input, max) {
  const per_page = input.per_page ?? 20;
  requireValue(integer(per_page, 1, max), 'INVALID_QUERY');
  return { per_page };
}
export function stockListQuery(type, input = {}) {
  requireValue(
    ['inbound', 'outbound'].includes(type),
    'ALL_POLICY_PENDING',
    'Tab Tất cả chưa có contract tổng hợp.',
  );
  fields(input, [
    'warehouse_id',
    'keyword',
    'status',
    'ready_for_post',
    'ready_for_issue',
    'date_from',
    'date_to',
    'timezone',
    'sort_order',
    'page',
    'per_page',
  ]);
  const query = {
    ...paging(input, 200),
    page: input.page ?? 1,
    sort_order: input.sort_order ?? 'desc',
    timezone: input.timezone ?? 'Asia/Ho_Chi_Minh',
  };
  requireValue(
    integer(query.page, 1) && ['asc', 'desc'].includes(query.sort_order),
    'INVALID_QUERY',
  );
  try {
    const formatter = new Intl.DateTimeFormat('en', {
      timeZone: query.timezone,
    });
    formatter.resolvedOptions();
  } catch {
    throw new P12ReadError('INVALID_QUERY', 'Múi giờ không hợp lệ.');
  }
  for (const key of ['date_from', 'date_to'])
    if (input[key] !== undefined && input[key] !== null && input[key] !== '') {
      requireValue(date(input[key]), 'INVALID_QUERY');
      query[key] = input[key];
    }
  requireValue(
    !query.date_from || !query.date_to || query.date_from <= query.date_to,
    'INVALID_QUERY',
  );
  if (input.warehouse_id !== undefined) {
    requireValue(uuid(input.warehouse_id), 'INVALID_QUERY');
    query.warehouse_id = input.warehouse_id;
  }
  if (input.keyword !== undefined) {
    requireValue(typeof input.keyword === 'string', 'INVALID_QUERY');
    query.keyword = input.keyword;
  }
  if (
    input.status !== undefined &&
    input.status !== null &&
    input.status !== ''
  ) {
    requireValue(
      [
        'DRAFT',
        'SCANNING',
        'POSTED',
        'CANCELLED',
        ...(type === 'inbound' ? ['WAITING_APPROVAL'] : []),
      ].includes(input.status),
      'STATUS_MAPPING_PENDING',
    );
    query.status = input.status;
  }
  for (const key of ['ready_for_post', 'ready_for_issue'])
    if (input[key] !== undefined) {
      requireValue(
        typeof input[key] === 'boolean' &&
          (type === 'inbound'
            ? key === 'ready_for_post'
            : key === 'ready_for_issue'),
        'INVALID_QUERY',
      );
      query[key] = input[key];
    }
  return query;
}
export function evidenceQuery(input = {}) {
  fields(input, ['status', 'page', 'per_page']);
  const q = {
    ...paging(input, 200),
    page: input.page ?? 1,
    status: input.status ?? 'ACTIVE',
  };
  requireValue(
    integer(q.page, 1) && ['ACTIVE', 'REMOVED', 'ALL'].includes(q.status),
    'INVALID_QUERY',
  );
  return q;
}
export function attachmentQuery(input = {}) {
  fields(input, ['page', 'per_page']);
  const q = { ...paging(input, 200), page: input.page ?? 1 };
  requireValue(integer(q.page, 1), 'INVALID_QUERY');
  return q;
}
export function supplierQuery(input = {}) {
  fields(input, ['q', 'status', 'page', 'per_page']);
  const q = {
    q: input.q ?? '',
    status: input.status ?? 'ACTIVE',
    page: input.page ?? 1,
    ...paging(input, 100),
  };
  requireValue(
    typeof q.q === 'string' &&
      Array.from(q.q).length <= 200 &&
      q.status === 'ACTIVE' &&
      integer(q.page, 1),
    'INVALID_QUERY',
  );
  return q;
}
export function warrantyQuery(resource, input = {}) {
  const allowed =
    resource === 'list'
      ? [
          'warehouse_id',
          'search',
          'status',
          'sort',
          'per_page',
          'page',
          'cursor',
        ]
      : resource === 'detail'
      ? ['warehouse_id']
      : [
          'warehouse_id',
          'per_page',
          'page',
          'cursor',
          ...(resource === 'events' ? ['sort'] : []),
        ];
  fields(input, allowed);
  const q = { ...input };
  if (q.warehouse_id !== undefined)
    requireValue(uuid(q.warehouse_id), 'INVALID_QUERY');
  if (resource === 'detail') return q;
  Object.assign(q, paging(input, 100));
  requireValue(
    !(Object.hasOwn(input, 'page') && Object.hasOwn(input, 'cursor')),
    'WARRANTY_PAGING_CONFLICT',
  );
  if (input.page !== undefined)
    requireValue(integer(input.page, 1, 100000), 'INVALID_QUERY');
  if (input.cursor !== undefined)
    requireValue(
      typeof input.cursor === 'string' &&
        input.cursor.length > 0 &&
        input.cursor.length <= 4096,
      'INVALID_QUERY',
    );
  if (resource === 'list') {
    if (input.search !== undefined) {
      requireValue(
        typeof input.search === 'string' &&
          Array.from(input.search).length <= 200,
        'INVALID_QUERY',
      );
      if (input.search.trim() === '') delete q.search;
    }
    if (input.status !== undefined)
      requireValue(
        [
          'ALL',
          'RECEIVED',
          'CHECKING',
          'REPAIRING',
          'COMPLETED',
          'RETURNED',
          'CANCELLED',
        ].includes(input.status),
        'INVALID_QUERY',
      );
    q.sort = input.sort ?? 'created_at_desc';
    requireValue(
      ['created_at_desc', 'created_at_asc'].includes(q.sort),
      'INVALID_QUERY',
    );
  }
  if (resource === 'events') {
    q.sort = input.sort ?? 'event_at_asc';
    requireValue(
      ['event_at_asc', 'event_at_desc'].includes(q.sort),
      'INVALID_QUERY',
    );
  }
  return q;
}
export function pageEnvelope(body, query) {
  requireValue(
    object(body) &&
      body.success === true &&
      Array.isArray(body.data) &&
      object(body.meta),
  );
  const m = body.meta;
  requireValue(
    integer(m.total, 0) &&
      integer(m.current_page, 1) &&
      integer(m.per_page, 1, 200) &&
      integer(m.last_page, 1) &&
      m.current_page === query.page &&
      m.per_page === query.per_page &&
      m.last_page === Math.max(1, Math.ceil(m.total / m.per_page)) &&
      body.data.length <= m.per_page,
  );
  requireValue(['from', 'to'].every(k => m[k] === null || integer(m[k], 1)));
  return {
    items: body.data,
    paging: {
      total: m.total,
      page: m.current_page,
      perPage: m.per_page,
      lastPage: m.last_page,
      from: m.from,
      to: m.to,
      links: body.links ?? null,
      snapshotConsistent: false,
    },
    meta: m,
  };
}
function ids(rows, key) {
  requireValue(rows.every(r => object(r) && uuid(r[key])));
  requireValue(
    new Set(rows.map(r => r[key])).size === rows.length,
    'DUPLICATE_PAGE_ID',
  );
}
function typeOf(type) {
  return type === 'inbound' ? 'INBOUND' : 'OUTBOUND';
}
export function parseStockList(body, type, query, options = {}) {
  const p = pageEnvelope(body, query),
    c = p.meta.read_contract;
  timestampMetadata(p.meta);
  requireValue(
    object(c) &&
      c.source === typeOf(type) &&
      c.date_field === 'created_at' &&
      c.timezone === query.timezone &&
      (c.date_from ?? null) === (query.date_from ?? null) &&
      (c.date_to ?? null) === (query.date_to ?? null) &&
      c.sort?.created_at === query.sort_order &&
      c.sort?.id === query.sort_order &&
      c.pagination_mode === 'offset' &&
      c.snapshot_consistent === false &&
      c.all_sources_aggregate === false,
    'READ_CONTRACT_MISMATCH',
  );
  ids(p.items, 'id');
  const p12 = parseP12Metadata(p.meta, type);
  return {
    ...p,
    p12,
    items: p.items.map(d => parseStockDocument(d, type, null, options)),
    contract: c,
  };
}
export function parseStockDocument(d, type, id = null, options = {}) {
  requireValue(
    object(d) &&
      uuid(d.id) &&
      (!id || d.id === id) &&
      d.doc_type === (type === 'inbound' ? 'receipt' : 'issue'),
    'PARENT_MISMATCH',
  );
  requireValue(
    ['DRAFT', 'SCANNING', 'POSTED', 'CANCELLED'].includes(d.status) &&
      Number.isSafeInteger(d.version),
    'INVALID_DOCUMENT',
  );
  requireValue(
    d.note === undefined || d.note === null || typeof d.note === 'string',
    'INVALID_NOTE',
  );
  const source=clone(d);
  if(object(source.p12))delete source.p12.owner_projection;
  const document = {
    type,
    id: d.id,
    number: d.doc_no ?? null,
    warehouseId:
      (type === 'inbound' ? d.dst_warehouse_id : d.src_warehouse_id) ?? null,
    rawStatus: d.status,
    miniAppStatus: d.mini_app_status ?? null,
    readiness: {
      readyForPost: d.ready_for_post ?? null,
      readyForIssue: d.ready_for_issue ?? null,
    },
    version: d.version,
    ...(Object.hasOwn(d, 'created_at') ? {createdAt: d.created_at} : {}),
    createdTimestamp: documentCreatedTimestamp(d),
    note: d.note ?? null,
    p12: parseP12Record(d, type, options),
    source,
  };
  const target={kind:type,id:document.id,warehouseId:document.warehouseId};
  const queueProjection=parseQueueProjection(d.queue_projection,target,{mode:'owner',rights:options.rights??[],ownerVersion:d.version,ownerStatus:d.status,currentStatus:d.display_status?.canonical_status});
  const displayStatus=parseQueueDisplay(d.display_status,queueProjection,target);
  const partnerSnapshot=parsePartnerSnapshot(d.partner,target,{mode:'owner',expectedVersion:queueProjection?.available?queueProjection.version:d.version});
  const webHandoff=parsePersistedWebHandoff(d.p13?.current_handoff,target,{expectedVersion:queueProjection?.available?queueProjection.version:d.version,expectedCanonical:queueProjection?.available?queueProjection.currentStatus:d.status});
  return {...document,...(queueProjection?{queueProjection}:{}),...(displayStatus?{displayStatus}:{}),...(partnerSnapshot?{partnerSnapshot}:{}),...(webHandoff?{webHandoff}:{})};
}
export function parseStockDetail(body, type, id, warehouse, options = {}) {
  requireValue(body?.success === true);
  timestampMetadata(body.meta);
  const p12 = parseP12Metadata(body.meta, type),
    d = parseStockDocument(body.data, type, id, options);
  requireValue(d.warehouseId === warehouse, 'SCOPE_MISMATCH');
  d.p12 = parseP12Record(body.data, type, {
    ...options,
    detail: true,
    timelineDiscovery: body.meta?.p12?.timeline_contract,
  });
  // The public projection is validated/allowlisted above. Do not retain an
  // unverified extension payload in the raw-source copy exposed to readers.
  if (object(d.source.p12)) delete d.source.p12.timeline;
  d.meta = clone(body.meta);
  d.metadata = p12;
  Object.assign(d,parseOwnerProjection(body.data.p12?.owner_projection,body.meta?.p12?.owner_projection_contract,d,options.rights??[]));
  return d;
}
const numeric = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export function parseScans(body, type, id, query) {
  const p = pageEnvelope(body, query),
    m = p.meta,
    s = m.summary;
  requireValue(
    m.contract === P12_RELEASE.scanContract &&
      m.document_id === id &&
      m.scan_status === query.status &&
      m.pagination_mode === 'offset' &&
      m.snapshot_consistent === false &&
      m.sort?.created_at === 'desc' &&
      m.sort?.id === 'desc',
    'SCAN_CONTRACT_MISMATCH',
  );
  ids(p.items, 'id');
  requireValue(
    object(s) &&
      s.scope === 'FILTERED_DOCUMENT_SCAN_ENTRIES' &&
      ['entry_count', 'sku_count', 'item_count', 'resolved_serial_count'].every(
        k => integer(s[k], 0),
      ) &&
      s.entry_count === m.total &&
      ['sku_count', 'item_count', 'resolved_serial_count'].every(
        k => s[k] <= s.entry_count,
      ) &&
      Array.isArray(s.quantity_by_unit) &&
      ['CURRENT_QUERY', 'LEGACY_CACHE_PENDING_REFRESH'].includes(s.coverage),
    'INVALID_SCAN_SUMMARY',
  );
  const groups = s.quantity_by_unit;
  requireValue(
    groups.every(
      g => object(g) && (g.unit === null || typeof g.unit === 'string'),
    ) && new Set(groups.map(g => g.unit)).size === groups.length,
    'INVALID_SCAN_SUMMARY',
  );
  if (s.coverage === 'LEGACY_CACHE_PENDING_REFRESH') {
    // BE deliberately removes quantities from an old cached projection.
    // Pending read only: no v1 fallback, null-to-zero or invalid empty result.
    requireValue(
      s.quantity_total === null &&
        [
          'quantity_complete',
          'missing_quantity_count',
          'unit_complete',
          'unknown_unit_entry_count',
          'mixed_units',
        ].every(k => s[k] === null) &&
        groups.every(g =>
          [
            'quantity',
            'known_quantity',
            'entry_count',
            'missing_quantity_count',
          ].every(k => g[k] === null),
        ),
      'INVALID_SCAN_SUMMARY',
    );
  } else {
    requireValue(
      groups.every(
        g =>
          integer(g.entry_count, 1) &&
          integer(g.missing_quantity_count, 0, g.entry_count) &&
          (g.known_quantity === null || numeric(g.known_quantity)) &&
          (g.missing_quantity_count === g.entry_count
            ? g.known_quantity === null
            : numeric(g.known_quantity)) &&
          (g.missing_quantity_count > 0
            ? g.quantity === null
            : numeric(g.quantity) && g.quantity === g.known_quantity),
      ),
      'INVALID_SCAN_SUMMARY',
    );
    const entries = groups.reduce((n, g) => n + g.entry_count, 0),
      missing = groups.reduce((n, g) => n + g.missing_quantity_count, 0),
      unknown = groups
        .filter(g => !g.unit?.trim())
        .reduce((n, g) => n + g.entry_count, 0),
      knownUnits = groups.filter(g => g.unit?.trim()).length;
    requireValue(
      entries === s.entry_count &&
        s.missing_quantity_count === missing &&
        s.quantity_complete === (missing === 0) &&
        s.unknown_unit_entry_count === unknown &&
        s.unit_complete === (unknown === 0) &&
        s.mixed_units === knownUnits > 1,
      'INVALID_SCAN_SUMMARY',
    );
    const total =
      entries === 0
        ? 0
        : groups.length === 1 && unknown === 0 && missing === 0
        ? groups[0].quantity
        : null;
    requireValue(
      s.quantity_total === total &&
        (entries !== 0 ||
          (s.sku_count === 0 &&
            s.item_count === 0 &&
            s.resolved_serial_count === 0)),
      'INVALID_SCAN_SUMMARY',
    );
  }
  requireValue(
    p.items.every(
      r =>
        r.document_id === id &&
        uuid(r.line_id) &&
        ['sku_id', 'item_id', 'container_id'].every(
          k => r[k] === null || r[k] === undefined || uuid(r[k]),
        ) &&
        (r.quantity === null || numeric(r.quantity)) &&
        (r.unit === null || typeof r.unit === 'string') &&
        ['raw_code', 'serial_number', 'candidate_serial_number'].every(
          k => r[k] === undefined || r[k] === null || typeof r[k] === 'string',
        ),
    ),
    'SCAN_PARENT_MISMATCH',
  );
  return {
    ...p,
    type,
    id,
    summary: clone(s),
    refreshRequired: s.coverage === 'LEGACY_CACHE_PENDING_REFRESH',
    items: p.items.map(r => ({
      ...r,
      raw_code: r.raw_code ?? null,
      serial_number: r.serial_number ?? null,
      scan_source: r.scan_source ?? null,
    })),
  };
}
export function parseAttachments(body, type, id, query) {
  const p = pageEnvelope(body, query),
    m = p.meta;
  requireValue(
    m.document_id === id &&
      m.document_type === typeOf(type) &&
      typeof m.requires_evidence === 'boolean' &&
      typeof m.evidence_status === 'string',
    'ATTACHMENT_PARENT_MISMATCH',
  );
  ids(p.items, 'id');
  requireValue(
    p.items.every(
      r =>
        r.document_id === id &&
        r.document_type === typeOf(type) &&
        !['storage_key', 'storage_path', 'storage_disk', 'url'].some(k =>
          Object.hasOwn(r, k),
        ) &&
        typeof r.file_name === 'string' &&
        typeof r.content_type === 'string' &&
        integer(r.file_size_bytes, 0) &&
        ['ACTIVE', 'QUARANTINED'].includes(r.status),
    ),
    'INVALID_ATTACHMENT',
  );
  return { ...p, type, id, items: clone(p.items) };
}
export function parseSuppliers(body, query) {
  requireValue(body?.success === true && Array.isArray(body.data));
  const m = body.meta;
  requireValue(
    m?.contract === 'mini-app-p04-v1' &&
      m.scope === 'GLOBAL' &&
      m.source === 'inbound_suppliers' &&
      integer(m.total, 0) &&
      m.page === query.page &&
      m.per_page === query.per_page &&
      integer(m.last_page, 1),
    'SUPPLIER_CONTRACT_MISMATCH',
  );
  ids(body.data, 'id');
  requireValue(
    body.data.every(
      r =>
        r.status === 'ACTIVE' &&
        typeof r.name === 'string' &&
        Number.isSafeInteger(r.version) &&
        typeof r.updated_at === 'string',
    ),
  );
  return {
    items: clone(body.data),
    paging: {
      total: m.total,
      page: m.page,
      perPage: m.per_page,
      lastPage: m.last_page,
    },
    meta: m,
  };
}
export function parseWarranty(body, resource, id, context, options = {}) {
  const m = body?.meta;
  requireValue(
    body?.success === true &&
      m?.contract === 'mini-app-p09-v1' &&
      m.warehouse_id === context.warehouseId,
    'WARRANTY_SCOPE_MISMATCH',
  );
  if (resource === 'detail') {
    timestampMetadata(m);
    requireValue(
      object(body.data) &&
        body.data.warranty_case_id === id &&
        body.data.warehouse_id === context.warehouseId &&
        !Object.hasOwn(body.data, 'receipt'),
      'CANONICAL_CASE_REQUIRED',
    );
    return {
      type: 'warranty',
      id,
      warehouseId: body.data.warehouse_id,
      ...(Object.hasOwn(body.data,'created_at') ? {createdAt: body.data.created_at} : {}),
      createdTimestamp: documentCreatedTimestamp(body.data),
      p12: parseP12Record(body.data, 'warranty', { ...options, detail: true }),
      metadata: parseP12Metadata(m, 'warranty'),
      source: clone(body.data),
      meta: clone(m),
    };
  }
  requireValue(
    Array.isArray(body.data) &&
      integer(m.total, 0) &&
      ['OFFSET', 'KEYSET'].includes(m.pagination) &&
      typeof m.hasMore === 'boolean' &&
      integer(m.per_page, 1, 100) &&
      body.data.length <= m.per_page &&
      ['nextPage', 'nextCursor'].every(k => Object.hasOwn(m, k)),
  );
  requireValue(
    m.pagination === 'OFFSET'
      ? integer(m.page, 1) &&
          (m.hasMore ? m.nextPage === m.page + 1 : m.nextPage === null) &&
          m.nextCursor === null
      : m.page === null &&
          m.nextPage === null &&
          (m.hasMore
            ? typeof m.nextCursor === 'string' && m.nextCursor.length > 0
            : m.nextCursor === null),
    'WARRANTY_PAGING_MISMATCH',
  );
  const key =
    resource === 'list'
      ? 'warranty_case_id'
      : resource === 'events'
      ? 'event_id'
      : 'attachment_id';
  ids(body.data, key);
  if (resource === 'list') {
      timestampMetadata(m);
    parseP12Metadata(m, 'warranty');
    requireValue(
      body.data.every(r => r.warehouse_id === context.warehouseId),
      'WARRANTY_SCOPE_MISMATCH',
    );
    for (const r of body.data) parseP12Record(r, 'warranty', options);
  }
  if (resource === 'attachments')
    requireValue(
      body.data.every(
        r =>
          typeof r.can_download === 'boolean' &&
          (r.download_url === null || typeof r.download_url === 'string') &&
          (r.file_name === null || typeof r.file_name === 'string'),
      ),
      'INVALID_WARRANTY_FILE',
    );
  if (resource !== 'list')
    requireValue(
      body.data.every(r => r.warranty_case_id === id),
      'WARRANTY_PARENT_MISMATCH',
    );
  return {
    type: 'warranty',
    id,
    items: clone(body.data),
    meta: m,
    paging: {
      total: m.total,
      perPage: m.per_page,
      page: m.page,
      hasMore: m.hasMore,
      nextCursor: m.nextCursor,
      nextPage: m.nextPage,
      mode: m.pagination,
      snapshotConsistent: false,
    },
  };
}
export function stockHistory(document) {
  const rows = document.source.status_history;
  requireValue(
    Array.isArray(rows),
    'HISTORY_UNAVAILABLE',
    'Chưa có nguồn lịch sử trạng thái.',
  );
  requireValue(
    rows.every(
      r => object(r) && uuid(r.id) && r.stock_document_id === document.id,
    ),
    'HISTORY_PARENT_MISMATCH',
  );
  return {
    items: rows.map(r => ({
      id: r.id,
      fromStatus: r.from_status ?? null,
      toStatus: r.to_status ?? null,
      label: r.action ?? null,
      actorId: r.changed_by ?? null,
      at: r.created_at ?? null,
      message: r.note ?? null,
    })),
    order: 'SOURCE_ORDER',
    complete: null,
    milestones: 'PENDING_BE_04',
  };
}
export function preserveNote(value) {
  requireValue(value === null || typeof value === 'string', 'INVALID_NOTE');
  return value;
}
export function p04Seed({ supplierId, note, docDate }) {
  requireValue(
    supplierId === null || uuid(supplierId),
    'SUPPLIER_UUID_REQUIRED',
  );
  requireValue(
    typeof note === 'string' && Array.from(note).length <= 1000,
    'P04_NOTE_LIMIT',
  );
  requireValue(docDate === undefined || (date(docDate) && docDate >= '2000-01-01'), 'P04_DOCUMENT_DATE_INVALID');
  return { supplierId, note, ...(docDate === undefined ? {} : {docDate}) };
}

export function parseWarrantyReceipt(
  body,
  requestId,
  context,
  { origin = null } = {},
) {
  const m = body?.meta,
    data = body?.data,
    r = data?.receipt;
  requireValue(
    body?.success === true &&
      m?.contract === 'mini-app-p09-v1' &&
      m.warehouse_id === context.warehouseId &&
      object(r) &&
      r.request_id === requestId &&
      ['UNKNOWN', 'PROCESSING', 'FAILED', 'SUCCEEDED'].includes(r.state) &&
      typeof r.may_create_new_request === 'boolean',
    'WARRANTY_RECEIPT_MISMATCH',
  );
  const p12 = parseP12Metadata(m, 'warranty'),
    confirmed =
      r.state === 'SUCCEEDED' &&
      uuid(r.warranty_case_id) &&
      r.warranty_case_id === data.warranty_case_id;
  requireValue(
    p12.receipt_state === r.state &&
      p12.detail_required === confirmed &&
      p12.receipt_is_detail === false &&
      p12.recovery_owner === 'P09',
    'WARRANTY_RECEIPT_MISMATCH',
  );
  if (confirmed)
    validateReadTarget(
      p12.read_target,
      'warranty',
      r.warranty_case_id,
      m.warehouse_id,
      { origin, context },
    );
  else requireValue(p12.read_target === null, 'WARRANTY_RECEIPT_MISMATCH');
  return {
    requestId,
    receipt: clone(r),
    source: clone(data),
    meta: clone(m),
    p12,
    readTarget: confirmed ? clone(p12.read_target) : null,
    caseId: confirmed ? r.warranty_case_id : null,
  };
}
