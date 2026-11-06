import * as m from './p12Protocol';
const names = ['INBOUND', 'OUTBOUND', 'WARRANTY'];
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
const rank = { INBOUND: 1, OUTBOUND: 2, WARRANTY: 3 };
export function row(
  source = 'INBOUND',
  n = 10,
  at = '2026-10-10T17:00:00.123000Z',
) {
  const r =
      source === 'WARRANTY'
        ? m.record(
            { ...m.warranty().data, warranty_case_id: m.id(n) },
            'warranty',
          )
        : m.stock(source.toLowerCase(), n),
    p = r.p12;
  return {
    id: m.id(n),
    row_key: source + ':' + m.id(n),
    source,
    resource_type: source === 'WARRANTY' ? 'WARRANTY_CASE' : 'STOCK_DOCUMENT',
    document_no:
      source === 'INBOUND'
        ? 'PN-MOCK-' + n
        : source === 'OUTBOUND'
        ? 'PX-MOCK-' + n
        : 'BH-MOCK',
    warehouse_id: m.warehouse,
    created_at: at,
    timestamp_source:
      (source === 'WARRANTY' ? 'warranty_case' : 'stock_documents') +
      '.created_at',
    time_status: at === null ? 'NOT_RECORDED' : 'RECORDED',
    status: source === 'WARRANTY' ? 'COMPLETED' : 'SCANNING',
    source_status: source === 'WARRANTY' ? 'COMPLETED' : 'SCANNING',
    status_key:
      source + ':' + (source === 'WARRANTY' ? 'COMPLETED' : 'SCANNING'),
    mini_app_status: null,
    readiness: null,
    display_status: {
      value: null,
      label: null,
      availability: 'PENDING_BA_MAPPING',
      source:
        (source === 'WARRANTY' ? 'warranty_case' : 'stock_documents') +
        '.status',
    },
    partner: {
      display_name: source === 'WARRANTY' ? null : 'Đối tác ' + n,
      availability:
        source === 'WARRANTY' ? 'WITHHELD_IN_AGGREGATE' : 'RECORDED',
      redacted: source === 'WARRANTY',
    },
    p12: {
      ...p,
      status: {
        canonical: source === 'WARRANTY' ? 'COMPLETED' : 'SCANNING',
        mini_app: null,
        readiness: {},
        mini_app_semantics:
          source === 'INBOUND'
            ? 'LEGACY_SCAN_READINESS_NOT_HANDOFF_PROOF'
            : 'OWNER_DEFINED',
        waiting_for_web: null,
        waiting_for_web_evidence: 'NOT_ESTABLISHED_BY_STATUS_OR_READINESS',
      },
    },
    read_target: p.read_target,
  };
}
export const defaultRows = () => [
  row('OUTBOUND', 11, '2026-10-11T00:00:00.000000Z'),
  row('INBOUND', 10, '2026-10-10T00:00:00.000000Z'),
  row('WARRANTY', 12, '2026-10-09T00:00:00.000000Z'),
];
export function response(q = {}, rows = defaultRows(), allowed = names) {
  const source = q.source ?? 'ALL',
    status = q.status ?? 'ALL',
    sort = q.sort ?? 'created_at_desc',
    per_page = Number(q.per_page ?? 20);
  let filtered = rows.filter(
    r =>
      allowed.includes(r.source) &&
      (status === 'ALL' || r.status_key === status),
  );
  if (q.q)
    filtered = filtered.filter(r =>
      (r.document_no + ' ' + r.source + ' ' + (r.partner.display_name ?? ''))
        .normalize('NFC')
        .toLowerCase()
        .includes(String(q.q).trim().normalize('NFC').toLowerCase()),
    );
  if (q.date_from)
    filtered = filtered.filter(
      r =>
        r.created_at &&
        r.created_at.slice(0, 10) >= q.date_from &&
        r.created_at.slice(0, 10) <= q.date_to,
    );
  const facets = { ALL: { availability: 'READY', total: filtered.length } };
  for (const s of names)
    facets[s] = {
      availability: allowed.includes(s) ? 'READY' : 'DENIED',
      total: allowed.includes(s)
        ? filtered.filter(r => r.source === s).length
        : null,
    };
  const selected = filtered
    .filter(r => source === 'ALL' || r.source === source)
    .sort((a, b) => {
      if (a.created_at === null || b.created_at === null) {
        if (a.created_at !== b.created_at)
          return a.created_at === null ? 1 : -1;
      } else if (a.created_at !== b.created_at)
        return (
          (a.created_at < b.created_at ? -1 : 1) *
          (sort === 'created_at_asc' ? 1 : -1)
        );
      return rank[a.source] - rank[b.source] || a.id.localeCompare(b.id);
    });
  const offset = q.cursor && q.cursor !== 'start' ? Number(String(q.cursor).split(':').at(-1)) : 0,
    data = selected.slice(offset, offset + per_page),
    hasMore = offset + per_page < selected.length,
    nextCursor = hasMore ? 'mock:cursor:' + String(offset + per_page) : null;
  const options = [
    {
      value: 'ALL',
      label: 'Tất cả',
      source: null,
      source_status: null,
      display_label: null,
      label_availability: 'SOURCE_SPEC',
    },
    ...allowed.flatMap(s =>
      statuses[s].map(v => ({
        value: s + ':' + v,
        label: v,
        source: s,
        source_status: v,
        label_availability: 'CANONICAL_ONLY_PENDING_BA_LABEL',
        display_label: null,
        status_source:
          (s === 'WARRANTY' ? 'warranty_case' : 'stock_documents') + '.status',
      })),
    ),
  ];
  return {
    success: true,
    data,
    meta: {
      ...m.timestampMeta(),
      cursor_version:3,
      contract: 'p12-mixed-documents-v2',
      warehouse_id: m.warehouse,
      warehouse_context: {
        status: 'READY',
        source: 'CONFIRMED_SERVER_SESSION',
      },
      source,
      total: selected.length,
      count_unit: 'DOCUMENT_LIST_RECORD',
      per_page,
      returned_count: data.length,
      pagination_mode: 'KEYSET',
      hasMore,
      nextCursor,
      has_more: hasMore,
      next_cursor: nextCursor,
      cursor_ttl_seconds: 900,
      cursor_expires_at: '2026-10-12T10:15:00.000000Z',
      upper_bound_created_at: '2026-10-12T10:00:00.000000Z',
      snapshot: {},
      snapshot_consistent: false,
      cross_request_snapshot: false,
      consistency: 'SINGLE_RESPONSE_SNAPSHOT_LIVE_KEYSET_BETWEEN_REQUESTS',
      source_facets: facets,
      allowed_sources: allowed,
      facet_scope: 'AUTHORIZED_FILTERED_BEFORE_SOURCE_SELECTION_AND_CURSOR',
      coverage:
        allowed.length === 3 ? 'ALL_SOURCES' : 'AUTHORIZED_SOURCES_ONLY',
      source_failure_policy: 'FAIL_CLOSED_NO_PARTIAL_DATA_OR_TOTAL',
      date_field: 'created_at',
      timezone: 'Asia/Ho_Chi_Minh',
      query: {
        source,
        status,
        date_from: q.date_from ?? null,
        date_to: q.date_to ?? null,
        q_applied: !!String(q.q ?? '').trim(),
      },
      sort,
      tie_break: { source_rank: 'asc', id: 'asc' },
      source_rank: rank,
      null_created_at: 'LAST_UNLESS_EXCLUDED_BY_DATE_FILTER',
      warranty_customer_search: 'NOT_SUPPORTED',
      status_filter_keys: options.map(o => o.value),
      filter_options: {
        status: options,
        display_mapping_approval: 'PENDING_BA',
      },
      cache_policy: 'NO_INTERNAL_RESULT_CACHE',
      write_operations: [],
    },
  };
}
