// Portable contract guards shared with the approved HTML P05 implementation.
const structuredClone = value => JSON.parse(JSON.stringify(value));
// mini-app-p05-v1 source-linked only. No legacy create/Post fallback.
export const P05_CONTRACT = 'mini-app-p05-v1',
  P03_CONTRACT = 'mini-app-p03-v1';
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export class P05ApiError extends Error {
  constructor(
    code,
    message = code,
    { status = 0, unknown = false, traceId = null } = {},
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.unknown = unknown;
    this.traceId = traceId;
  }
}
const fail = message => {
  throw new P05ApiError('CONTRACT_INVALID', message, { unknown: true });
};
export const obj = v => v && typeof v === 'object' && !Array.isArray(v);
const timestamp = v =>
  Date.parse(
    typeof v === 'string'
      ? v.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
      : v,
  );
const integer = v => Number.isSafeInteger(v) && v > 0;
// ETag is response metadata for the numeric draft version. Weak validators are
// accepted only for that same version; If-Match requests stay strong/explicit.
export function draftEtagMatches(etag, version) {
  if (!integer(version)) return false;
  if (etag === undefined || etag === null) return true;
  if (typeof etag !== 'string') return false;
  const match = /^(?:W\/)?"([1-9][0-9]*)"$/.exec(etag.trim());
  return !!match && match[1] === String(version);
}
export function envelope(response, contract, statuses = [200]) {
  const b = response.body;
  if (
    !statuses.includes(response.status) ||
    !obj(b) ||
    b.success !== true ||
    !obj(b.meta) ||
    b.meta.contract !== contract ||
    !Object.hasOwn(b, 'data')
  )
    fail('Phản hồi không khớp contract ' + contract);
  return b;
}
export function parseContext(b, scope) {
  const d = b.data;
  if (
    !obj(d) ||
    d.actor_id !== scope.actorId ||
    d.auth_session_id !== scope.authSessionId ||
    !obj(d.warehouse_context) ||
    !obj(d.permissions) ||
    !['read', 'save', 'cancel', 'record'].every(
      k => typeof d.permissions[k] === 'boolean',
    ) ||
    !Array.isArray(d.available_warehouses)
  )
    fail('Context chưa xác minh đúng actor/phiên.');
  if (
    d.warehouse_context.status !== 'READY' ||
    d.active_warehouse_id !== scope.warehouseId
  )
    throw new P05ApiError(
      'WAREHOUSE_CONTEXT_REQUIRED',
      'Kho chưa READY hoặc không khớp phiên.',
    );
  const w = d.available_warehouses.find(
    candidate => candidate.warehouse_id === scope.warehouseId,
  );
  if (!w || w.status !== 'ACTIVE')
    throw new P05ApiError('WAREHOUSE_INACTIVE', 'Kho chưa xác nhận ACTIVE.');
  if (!d.permissions.read)
    throw new P05ApiError(
      'P05_OPERATION_DENIED',
      'Không có quyền đọc nguồn xuất kho.',
    );
  if (
    d.record?.reconcile_mode !== 'P03_LINKED' ||
    d.address_contract?.format !== 'TEXT' ||
    d.address_contract.structured_codes_supported !== false
  )
    fail('Context P05 không hỗ trợ source-linked/TEXT.');
  return structuredClone(d);
}
export function parseSource(d, scope, now = Date.now()) {
  if (
    !obj(d) ||
    d.source_kind !== 'WMS_OUTBOUND_DOCUMENT' ||
    !UUID.test(d.source_document_id || '') ||
    d.document_id !== d.source_document_id ||
    !integer(d.source_version) ||
    d.warehouse_id !== scope.warehouseId ||
    !UUID.test(d.outbound_request_id || '') ||
    d.status !== 'DRAFT' ||
    !integer(d.planned_total_qty) ||
    d.planned_total_qty > 1000 ||
    !Array.isArray(d.lines) ||
    !d.lines.length ||
    !obj(d.recipient) ||
    typeof d.doc_no !== 'string' ||
    !d.doc_no ||
    d.address_format !== 'TEXT' ||
    d.address_dataset_version !== null
  )
    fail('Phiếu nguồn không khớp contract.');
  const expiry = timestamp(d.expires_at),
    created = timestamp(d.created_at);
  if (!Number.isFinite(expiry) || !Number.isFinite(created) || expiry <= now)
    throw new P05ApiError(
      'OUTBOUND_SOURCE_NOT_SELECTABLE',
      'Phiếu nguồn đã hết hạn hoặc chưa xác minh thời hạn.',
    );
  if (
    d.lines.some(
      l =>
        !obj(l) ||
        !UUID.test(l.line_id || '') ||
        !UUID.test(l.sku_id || '') ||
        !integer(l.planned_qty) ||
        l.scanned_qty !== 0 ||
        typeof l.sku_code !== 'string' ||
        !l.sku_code ||
        typeof l.sku_name !== 'string',
    ) ||
    new Set(d.lines.map(l => l.line_id)).size !== d.lines.length ||
    d.lines.reduce((n, l) => n + l.planned_qty, 0) !== d.planned_total_qty
  )
    fail('Kế hoạch nguồn không hợp lệ.');
  for (const key of ['name', 'address', 'phone'])
    if (d.recipient[key] !== null && typeof d.recipient[key] !== 'string')
      fail('Metadata người nhận không hợp lệ.');
  return structuredClone(d);
}
export function parseDraft(d, scope, id, scan) {
  if (
    !obj(d) ||
    d.document_kind !== 'STAGING_DRAFT' ||
    d.document_id !== id ||
    d.scan_session_id !== scan ||
    d.auth_session_id !== scope.authSessionId ||
    d.warehouse_id !== scope.warehouseId ||
    d.operation !== 'OUTBOUND' ||
    !integer(d.version) ||
    !['DRAFT', 'CANCELLED', 'RECORDED'].includes(d.status) ||
    d.stock_effect !== 'NONE' ||
    d.codes_validated !== false ||
    !Array.isArray(d.codes) ||
    d.codes.some(
      c =>
        !obj(c) ||
        typeof c.raw_code !== 'string' ||
        !c.raw_code.trim() ||
        !['MANUAL', 'CAMERA', 'SCANNER', 'HARDWARE'].includes(c.scan_source) ||
        (c.quantity !== undefined && c.quantity !== 1),
    ) ||
    !obj(d.form)
  )
    fail('Nháp P03 sai identity/scope.');
  return structuredClone(d);
}
export function parseReceipt(r, request) {
  if (
    !obj(r) ||
    r.request_id !== request.key ||
    r.document_id !== request.draftId ||
    r.scan_session_id !== request.scanSessionId ||
    r.warehouse_id !== request.body.warehouse_id ||
    r.operation !== 'OUTBOUND' ||
    r.command !== request.command ||
    r.outcome !== 'SUCCEEDED' ||
    !integer(r.version) ||
    !Number.isFinite(timestamp(r.committed_at))
  )
    fail('Receipt không khớp thao tác đã gửi.');
  return structuredClone(r);
}
export function verifyRecord(b, request, scope) {
  const d = b.data,
    linked = b.meta?.p03_draft;
  if (
    !obj(d) ||
    d.document_id !== request.body.source_document_id ||
    d.source_document_id !== d.document_id ||
    d.source_version !== request.body.source_version ||
    d.src_warehouse_id !== scope.warehouseId ||
    d.status !== 'SCANNING' ||
    d.record_status !== 'RECORDED' ||
    d.posted !== false ||
    d.source_created !== false ||
    d.wms_document_created !== false ||
    d.movement_created !== false ||
    d.stock_effect !== 'NONE' ||
    d.expected_total_qty !== request.body.expected_total_qty ||
    d.scanned_total_qty !== request.body.items.length ||
    !integer(d.version) ||
    !obj(linked)
  )
    fail('Chưa xác minh được record đúng source, chưa ghi sổ.');
  const receipt = parseReceipt(linked.receipt, request),
    draft = parseDraft(
      linked.document,
      scope,
      request.draftId,
      request.scanSessionId,
    );
  if (
    draft.status !== 'RECORDED' ||
    draft.business_document_id !== d.document_id ||
    draft.form.p05_source?.document_id !== d.document_id ||
    draft.form.p05_source?.version !== request.body.source_version ||
    JSON.stringify(
      draft.codes.map(c => ({
        raw_code: c.raw_code,
        scan_source: c.scan_source,
      })),
    ) !== JSON.stringify(request.body.items) ||
    draft.codes.some(c => c.quantity !== undefined && c.quantity !== 1) ||
    draft.version !== receipt.version
  )
    fail('Nháp chưa được liên kết RECORDED.');
  return { result: structuredClone(d), receipt, draft };
}
