import { ownerUuid, type OwnerDocumentTarget } from '../../app/ownerNavigation';
import {parseQueueProjection,type QueueProjection} from './p13QueueProjection';
import {parsePersistedWebHandoff,readHandoffPostedAt,type PersistedWebHandoff} from './persistedWebHandoff';
import { mixedQuery, mixedSources } from '../../features/documents/p12/mixed';
import type { Query, Scope } from '../../features/documents/p12/contract';
import {
  compareDocumentTimestamps,
  parseDocumentTimestamp,
  isDocumentTimestampMetadata,
} from './documentTimestamps';
import {
  explicitRead,
  readAssert,
  readBoolean,
  readInstant,
  readInteger,
  readObject,
  readString,
  type ReadField,
} from './explicitReadFields';

export const P13_QUEUE_CONTRACT = 'p13-web-post-queue-v1';
export interface WebQueueQuery extends Query {
  web_queue: 'ALL' | 'WAITING_WEB_POST';
}
export interface WebHandoff {
  state: 'WAITING_WEB_POST' | 'POSTED' | 'CANCELLED' | 'UNKNOWN';
  submitted: ReadField<string>;
  reviewed: ReadField<string>;
  posted: ReadField<string>;
  versionAtRecord: number;
  current?:PersistedWebHandoff;
}
export interface WebQueueRow {
  key: string;
  target: OwnerDocumentTarget;
  number: ReadField<string>;
  created: ReadField<string>;
  status: ReadField<string>;
  handoff: ReadField<WebHandoff>;
  projection?:QueueProjection;
}
export interface WebQueuePage {
  items: WebQueueRow[];
  total: number;
  nextCursor?: string;
  facets: Record<string, ReadField<number>>;
  coverage: string;
  statuses: { value: string; label: string }[];
}
export function webQueueQuery(
  input: Partial<WebQueueQuery> = {},
): WebQueueQuery {
  const { web_queue = 'WAITING_WEB_POST', ...rest } = input;
  readAssert(
    ['ALL', 'WAITING_WEB_POST'].includes(web_queue),
    'WEB_QUEUE_QUERY_INVALID',
  );
  return { ...mixedQuery(rest as Query), web_queue };
}
export function parseWebQueue(
  value: unknown,
  scope: Scope,
  input: WebQueueQuery,
): WebQueuePage {
  const q = webQueueQuery(input),
    r = explicitRead(value, 'p12-mixed-documents-v3'),
    m = r.meta,
    context = readObject(m.warehouse_context),
    normalized = readObject(m.query),
    web = readObject(m.web_post_queue);
  readAssert(
    Array.isArray(r.body.data) &&
      m.warehouse_id === scope.warehouseId &&
      context.status === 'READY' &&
      context.source === 'CONFIRMED_SERVER_SESSION' &&
      m.source === q.source &&
      web.contract === P13_QUEUE_CONTRACT &&
      web.scope === 'AUTHORIZED_WAREHOUSE' &&
      web.coverage === 'EXPLICIT_RECORD_HANDOFFS_ONLY_NO_LEGACY_BACKFILL' &&
      web.warranty === 'NOT_APPLICABLE' &&
      web.current_state ===
        'PERSISTED_HANDOFF_INTENT_AND_CANONICAL_DOCUMENT_STATUS' &&
      web.date_and_sort_field === 'stock_documents.created_at' &&
      web.snapshot_semantics === 'SAME_AS_P12',
    'WEB_QUEUE_SCOPE_INVALID',
  );
  readAssert(
    normalized.source === q.source &&
      normalized.status === q.status &&
      normalized.web_queue === q.web_queue &&
      normalized.q_applied === (typeof q.q === 'string' && q.q.trim() !== ''),
    'WEB_QUEUE_QUERY_MISMATCH',
  );
  for (const name of ['date_from', 'date_to'] as const) {
    const f = r.field('/meta/query/' + name, readString);
    readAssert(
      q[name] === undefined
        ? !f.supplied && f.status === 'FILTER_NOT_APPLIED'
        : f.supplied && f.value === q[name],
      'WEB_QUEUE_DATE_MISMATCH',
    );
  }
  readAssert(
    isDocumentTimestampMetadata(m) &&
      m.cursor_version === 3 &&
      m.pagination_mode === 'KEYSET' &&
      m.count_unit === 'DOCUMENT_LIST_RECORD' &&
      readInteger(m.total) &&
      m.per_page === q.per_page &&
      m.returned_count === r.body.data.length &&
      r.body.data.length <= Number(q.per_page) &&
      typeof m.hasMore === 'boolean' &&
      m.has_more === m.hasMore &&
      m.snapshot_consistent === false &&
      m.cross_request_snapshot === false &&
      m.consistency ===
        'SINGLE_RESPONSE_SNAPSHOT_LIVE_KEYSET_BETWEEN_REQUESTS' &&
      m.cursor_ttl_seconds === 900 &&
      readInstant(m.cursor_expires_at) &&
      readInstant(m.upper_bound_created_at) &&
      m.source_failure_policy === 'FAIL_CLOSED_NO_PARTIAL_DATA_OR_TOTAL' &&
      m.facet_scope ===
        'AUTHORIZED_FILTERED_BEFORE_SOURCE_SELECTION_AND_CURSOR' &&
      m.cache_policy === 'NO_INTERNAL_RESULT_CACHE' &&
      m.date_field === 'created_at' &&
      m.timezone === 'Asia/Ho_Chi_Minh' &&
      m.sort === q.sort &&
      m.null_created_at === 'LAST_UNLESS_EXCLUDED_BY_DATE_FILTER' &&
      JSON.stringify(m.tie_break) ===
        JSON.stringify({ source_rank: 'asc', id: 'asc' }) &&
      JSON.stringify(m.source_rank) ===
        JSON.stringify({ INBOUND: 1, OUTBOUND: 2, WARRANTY: 3 }) &&
      Array.isArray(m.write_operations) &&
      m.write_operations.length === 0,
    'WEB_QUEUE_PAGING_INVALID',
  );
  const next = r.field('/meta/nextCursor', readString),
    nextSnake = r.field('/meta/next_cursor', readString);
  readAssert(
    m.hasMore
      ? next.supplied &&
          nextSnake.supplied &&
          next.value === nextSnake.value &&
          next.value.length > 0 &&
          next.value.length <= 4096 &&
          r.body.data.length === Number(q.per_page)
      : !next.supplied &&
          !nextSnake.supplied &&
          next.status === 'END_OF_RESULTS' &&
          nextSnake.status === 'END_OF_RESULTS',
    'WEB_QUEUE_CURSOR_INVALID',
  );
  const allowed = m.allowed_sources;
  readAssert(
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
      ) &&
      (q.source === 'ALL' || allowed.includes(q.source)) &&
      m.coverage ===
        (allowed.length === 3 ? 'ALL_SOURCES' : 'AUTHORIZED_SOURCES_ONLY'),
    'WEB_QUEUE_RIGHTS_INVALID',
  );
  const facets: WebQueuePage['facets'] = {};
  let sum = 0;
  for (const source of ['ALL', ...mixedSources]) {
    const f = readObject(readObject(m.source_facets)[source]),
      ready = source === 'ALL' || allowed.includes(source),
      total = r.field('/meta/source_facets/' + source + '/total', readInteger);
    readAssert(
      f.availability === (ready ? 'READY' : 'DENIED') &&
        (ready
          ? total.supplied
          : !total.supplied && total.status === 'UNSPECIFIED_BY_OWNER'),
      'WEB_QUEUE_FACET_INVALID',
    );
    facets[source] = total;
    if (source !== 'ALL' && total.supplied) sum += total.value;
  }
  readAssert(
    facets.ALL.supplied &&
      facets.ALL.value === sum &&
      facets[String(q.source)].supplied &&
      (facets[String(q.source)] as { supplied: true; value: number }).value ===
        m.total,
    'WEB_QUEUE_TOTAL_INVALID',
  );
  const options = readObject(m.filter_options);
  readAssert(
    options.display_mapping_approval === 'APPROVED' &&
      Array.isArray(options.status),
    'WEB_QUEUE_STATUS_INVALID',
  );
  const statuses = options.status.map(raw => {
    const option = readObject(raw);
    readAssert(
      readString(option.value) &&
        readString(option.display_label) &&
        option.display_label.trim() &&
        (option.value === 'ALL' ||
          allowed.some(
            s =>
              option.value === s + ':' + option.source_status &&
              option.source === s &&
              option.label_availability === 'APPROVED',
          )),
      'WEB_QUEUE_STATUS_INVALID',
    );
    return { value: option.value, label: option.display_label };
  });
  readAssert(
    statuses[0]?.value === 'ALL' &&
      new Set(statuses.map(s => s.value)).size === statuses.length &&
      JSON.stringify(statuses.map(s => s.value)) ===
        JSON.stringify(m.status_filter_keys),
    'WEB_QUEUE_STATUS_INVALID',
  );
  const rank = { inbound: 1, outbound: 2, warranty: 3 };
  const items = r.body.data.map((raw, index): WebQueueRow => {
    const row = readObject(raw),
      p = '/data/' + index,
      source = row.source,
      kind = String(source).toLowerCase() as OwnerDocumentTarget['kind'];
    readAssert(
      allowed.includes(source) &&
        ownerUuid(row.id) &&
        row.warehouse_id === scope.warehouseId &&
        row.row_key === source + ':' + row.id &&
        (q.source === 'ALL' || q.source === source) &&
        row.resource_type ===
          (source === 'WARRANTY' ? 'WARRANTY_CASE' : 'STOCK_DOCUMENT'),
      'WEB_QUEUE_IDENTITY_INVALID',
    );
    const target = readObject(row.read_target),
      tq = readObject(target.query),
      resource = kind === 'warranty' ? 'warranty-cases' : kind + '-documents';
    readAssert(
      target.method === 'GET' &&
        target.path === '/api/v1/mini-app/' + resource + '/' + row.id &&
        Object.keys(tq).length === 1 &&
        tq.warehouse_id === scope.warehouseId,
      'WEB_QUEUE_TARGET_INVALID',
    );
    const created = r.field(p + '/created_at', readInstant),
      status = r.field(p + '/source_status', readString),
      number = r.field(p + '/document_no', readString);
    readAssert(
      row.time_status === (created.supplied ? 'RECORDED' : 'NOT_RECORDED') &&
        row.timestamp_source ===
          (source === 'WARRANTY' ? 'warranty_case' : 'stock_documents') +
            '.created_at' &&
        (q.status === 'ALL' ||
          (status.supplied && q.status === source + ':' + status.value)),
      'WEB_QUEUE_ROW_STATE_INVALID',
    );
    const ownerTarget={id:row.id as string,kind,warehouseId:scope.warehouseId};
    const projection=parseQueueProjection(row.queue_projection,ownerTarget,{field:<T,>(relative:string,valid:(v:unknown)=>v is T)=>r.field(p+'/queue_projection'+relative,valid)});
    const handoffField = r.field(
      p + '/web_post_handoff',
      (v): v is Record<string, unknown> =>
        Boolean(v && typeof v === 'object' && !Array.isArray(v)),
    );
    let handoff: ReadField<WebHandoff>;
    if (handoffField.supplied) {
      const h = handoffField.value,
        hp = p + '/web_post_handoff',
        waiting = r.field(hp + '/current_waiting_for_web', readBoolean);
      readAssert(
        source !== 'WARRANTY' &&
          h.contract === P13_QUEUE_CONTRACT &&
          row.web_post_handoff_availability === 'RECORDED' &&
          h.source === 'mini_app_web_post_handoffs+stock_documents.status' &&
          h.warehouse_id === scope.warehouseId &&
          ['WAITING_WEB_POST', 'POSTED', 'CANCELLED', 'UNKNOWN'].includes(
            String(h.state),
          ) &&
          readInteger(h.document_version_at_record) &&
          h.document_version_at_record > 0 &&
          h.reviewed_status === 'NOT_RECORDED' &&
          h.stock_effect === 'READ_ONLY_PROJECTION' &&
          (h.state === 'UNKNOWN'
            ? !waiting.supplied
            : waiting.supplied &&
              waiting.value === (h.state === 'WAITING_WEB_POST')) &&
          (q.web_queue !== 'WAITING_WEB_POST' ||
            h.state === 'WAITING_WEB_POST') &&
          (h.state === 'WAITING_WEB_POST'
            ? status.supplied && ['DRAFT', 'SCANNING'].includes(status.value)
            : h.state === 'UNKNOWN' ||
              (status.supplied && status.value === h.state)),
        'WEB_QUEUE_HANDOFF_INVALID',
      );
      const current=parsePersistedWebHandoff(h,ownerTarget,{field:<T,>(relative:string,valid:(v:unknown)=>v is T)=>r.field(hp+relative,valid),expectedVersion:projection?.available?projection.version:undefined,expectedCanonical:projection?.available?projection.currentStatus:status.supplied?status.value:undefined});
      handoff = {
        supplied: true,
        value: {
          state: h.state as WebHandoff['state'],
          submitted: r.field(hp + '/submitted_at', readInstant),
          reviewed: r.field(hp + '/reviewed_at', readInstant),
          posted: r.field(hp + '/posted_at', readHandoffPostedAt),
          versionAtRecord: h.document_version_at_record,
          ...(current?{current}:{}),
        },
      };
    } else {
      readAssert(
        q.web_queue === 'ALL' &&
          handoffField.status === row.web_post_handoff_availability &&
          ['NOT_APPLICABLE', 'NOT_ESTABLISHED', 'SOURCE_UNAVAILABLE'].includes(
            handoffField.status,
          ),
        'WEB_QUEUE_HANDOFF_INVALID',
      );
      handoff = handoffField;
    }
    return {
      key: String(row.row_key),
      target: { id: row.id, kind, warehouseId: scope.warehouseId },
      number,
      created,
      status,
      handoff,
      projection,
    };
  });
  const compare = (a: WebQueueRow, b: WebQueueRow) => {
    if (a.created.supplied !== b.created.supplied)
      return a.created.supplied ? -1 : 1;
    if (a.created.supplied && b.created.supplied) {
      const order = compareDocumentTimestamps(
        parseDocumentTimestamp(a.created.value),
        parseDocumentTimestamp(b.created.value),
      );
      if (order) return order * (q.sort === 'created_at_asc' ? 1 : -1);
    }
    return (
      rank[a.target.kind] - rank[b.target.kind] ||
      a.target.id.localeCompare(b.target.id)
    );
  };
  readAssert(
    new Set(items.map(i => i.key)).size === items.length &&
      items.length <= m.total &&
      items.every((row, i) => i === 0 || compare(items[i - 1], row) < 0) &&
      (q.cursor !== 'start' || m.total === 0 || items.length > 0),
    'WEB_QUEUE_ORDER_INVALID',
  );
  return {
    items,
    total: m.total,
    nextCursor: next.supplied ? next.value : undefined,
    facets,
    coverage: String(m.coverage),
    statuses,
  };
}
