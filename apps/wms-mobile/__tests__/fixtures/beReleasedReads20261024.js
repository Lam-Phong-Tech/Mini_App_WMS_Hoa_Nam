// Synthetic wire examples transcribed from the pinned BE owners; never an app fallback.
import { response as mixedResponse, row as mixedRow } from './p12Mixed';
import {
  id,
  actor,
  session,
  warehouse,
  context as oldScope,
} from './p12Protocol';
export { id, actor, session, warehouse };
export const scope = () => ({
  ...oldScope(),
  rights: [...oldScope().rights, 'container.view', 'sku.view'],
});
export const user = () => ({
  id: actor,
  status: 'ACTIVE',
  auth_session_id: session,
  active_warehouse_id: warehouse,
  permissions: scope().rights,
  warehouse_context: { status: 'READY' },
  available_warehouses: [{ warehouse_id: warehouse, status: 'ACTIVE' }],
});
export const headers = {
  'Cache-Control': 'private, no-store',
  'Content-Type': 'application/json; charset=UTF-8',
  'X-Content-Type-Options': 'nosniff',
  'X-Read-Fields-Contract': 'explicit-read-fields-v1',
  Vary: 'Authorization, Origin, X-Read-Fields-Contract',
};
export function project(raw) {
  const missing = [];
  const walk = (v, path = '') => {
    if (Array.isArray(v)) return v.map((x, i) => walk(x, path + '/' + i));
    if (!v || typeof v !== 'object') return v;
    const out = {};
    for (const [key, value] of Object.entries(v)) {
      const p = path + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1');
      if (value !== null) {
        out[key] = walk(value, p);
        continue;
      }
      let status =
        v[key + '_status'] ??
        v[key + '_availability'] ??
        'UNSPECIFIED_BY_OWNER';
      if (key === 'contained_qty') status = v.quantity_status;
      if (['available_qty', 'reserved_qty'].includes(key))
        status = 'NO_AUTHORITATIVE_CONTAINER_AVAILABILITY_MODEL';
      if (key === 'capacity' || key === 'physical_hierarchy')
        status = 'NOT_CONFIGURED';
      if (key === 'posted_at' || key === 'reviewed_at') status = 'NOT_RECORDED';
      if (['nextCursor', 'next_cursor'].includes(key) && v.hasMore === false)
        status = 'END_OF_RESULTS';
      if (path === '/meta/query' && ['date_from', 'date_to'].includes(key))
        status = 'FILTER_NOT_APPLIED';
      missing.push({
        path: p,
        status,
        source: 'AUTHORIZED_OWNER_RESPONSE',
        value_supplied: false,
      });
    }
    return out;
  };
  const result = walk(raw),
    owner = result.meta.contract;
  result.meta.contract = 'explicit-read-fields-v1';
  result.meta.read_fields = {
    contract: 'explicit-read-fields-v1',
    owner_contract: owner,
    missing_fields: missing,
    value_policy:
      'KNOWN_VALUES_UNCHANGED_ABSENT_VALUES_EXPLAINED_NO_NULL_OR_FAKE_DEFAULTS',
  };
  return result;
}
export const handoff = (state = 'WAITING_WEB_POST') => ({
  contract: 'p13-web-post-queue-v1',
  state,
  current_waiting_for_web:
    state === 'UNKNOWN' ? null : state === 'WAITING_WEB_POST',
  source: 'mini_app_web_post_handoffs+stock_documents.status',
  warehouse_id: warehouse,
  submitted_at: '2026-10-23T03:00:00.123456Z',
  document_version_at_record: 3,
  reviewed_at: null,
  reviewed_status: 'NOT_RECORDED',
  posted_at: state === 'POSTED' ? '2026-10-24T01:00:00Z' : null,
  stock_effect: 'READ_ONLY_PROJECTION',
});
export function queueRow(
  source = 'INBOUND',
  n = 10,
  state = 'WAITING_WEB_POST',
  at,
) {
  const row = mixedRow(source, n, at),
    status = state === 'WAITING_WEB_POST' ? 'SCANNING' : state;
  return {
    ...row,
    status,
    source_status: status,
    status_key: source + ':' + status,
    web_post_handoff:
      source === 'WARRANTY' || state === 'NOT_ESTABLISHED'
        ? null
        : handoff(state),
    web_post_handoff_availability:
      source === 'WARRANTY'
        ? 'NOT_APPLICABLE'
        : state === 'NOT_ESTABLISHED'
        ? 'NOT_ESTABLISHED'
        : 'RECORDED',
  };
}
export function queueBody(
  q = {},
  rows = [queueRow()],
  allowed = ['INBOUND', 'OUTBOUND', 'WARRANTY'],
) {
  const mode = q.web_queue ?? 'WAITING_WEB_POST';
  const body = mixedResponse(
    q,
    rows.filter(
      r => mode === 'ALL' || r.web_post_handoff?.state === 'WAITING_WEB_POST',
    ),
    allowed,
  );
  body.meta.contract = 'p12-mixed-documents-v3';
  body.meta.query.web_queue = mode;
  body.meta.filter_options.display_mapping_approval = 'APPROVED';
  for (const s of body.meta.filter_options.status) {
    s.display_label = s.label;
    if (s.value !== 'ALL') s.label_availability = 'APPROVED';
  }
  body.meta.web_post_queue = {
    contract: 'p13-web-post-queue-v1',
    scope: 'AUTHORIZED_WAREHOUSE',
    coverage: 'EXPLICIT_RECORD_HANDOFFS_ONLY_NO_LEGACY_BACKFILL',
    warranty: 'NOT_APPLICABLE',
    current_state: 'PERSISTED_HANDOFF_INTENT_AND_CANONICAL_DOCUMENT_STATUS',
    date_and_sort_field: 'stock_documents.created_at',
    snapshot_semantics: 'SAME_AS_P12',
  };
  return project(body);
}
export function boxRow(n = 70, type = 'COMPONENT', serial = false) {
  return {
    container_id: id(n),
    container_code: 'BOX-TEST-' + n,
    container_type: 'BOX',
    warehouse_id: warehouse,
    warehouse_scope_basis: 'SINGLE_WAREHOUSE_REGISTER_NOT_PHYSICAL_PLACEMENT',
    status: 'ACTIVE',
    version: 2,
    sku: {
      id: id(80),
      code: 'COMP-TEST-01',
      name: 'Linh kiện TEST không dùng dữ liệu thật',
      type,
      status: 'ACTIVE',
      unit: 'cái',
      serial_tracked: serial,
    },
    classification:
      type === 'COMPONENT'
        ? serial
          ? 'COMPONENT_SERIAL'
          : 'COMPONENT_QUANTITY'
        : 'PRODUCT',
    individual_physical_code_required: type !== 'COMPONENT' || serial,
    component_master_required: type === 'COMPONENT',
    contained_qty: 5,
    quantity_status: 'RECORDED_CONTAINER_CONTENTS',
    quantity_source: 'container_items.ACTIVE',
    quantity_semantics:
      'CONTAINER_CONTENTS_NOT_WAREHOUSE_BALANCE_OR_ISSUE_ELIGIBILITY',
    available_qty: null,
    reserved_qty: null,
    location_hint: 'Ghi chú TEST',
    parent_container_id: null,
    location_hint_semantics:
      'STORED_FREE_TEXT_NOT_HIERARCHY_OR_PLACEMENT_PROOF',
    capacity: null,
    capacity_status: 'NOT_CONFIGURED',
    read_target: {
      method: 'GET',
      path: '/api/v1/containers/' + id(n),
      query: { warehouse_id: warehouse },
      headers: { 'X-Container-Read-Contract': 'p18-single-warehouse-boxes-v1' },
    },
  };
}
export function boxBody(rows = [boxRow()], q = {}, detail = false) {
  return project({
    success: true,
    data: detail ? rows[0] : rows,
    meta: {
      contract: 'p18-single-warehouse-boxes-v1',
      snapshot: {},
      warehouse_id: warehouse,
      page: q.page ?? 1,
      per_page: q.perPage ?? 20,
      total: rows.length,
      last_page: 1,
      count_unit: 'BOX',
      model: 'SINGLE_WAREHOUSE_WITH_BOXES',
      physical_hierarchy: null,
      capacity: null,
      write_operations: [],
      product_to_component_reclassification: false,
    },
  });
}
