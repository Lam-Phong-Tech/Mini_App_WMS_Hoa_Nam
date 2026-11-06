// Synthetic protocol examples for regression tests only; never a runtime fallback.
export function releasePartner(
  target: { id: string; warehouseId: string },
  version = 3,
) {
  return {
    display_name: 'NCC TEST snapshot',
    availability: 'RECORDED',
    redacted: false,
    role: 'SUPPLIER',
    source: 'mini_app_inbound_record_metadata',
    supplier_snapshot: {
      status: 'SNAPSHOT_RECORDED',
      id: '33333333-3333-4333-8333-333333333333',
      name: 'NCC TEST snapshot',
      name_status: 'SNAPSHOT_RECORDED',
      version: 1,
      recorded_at: '2026-11-04T05:00:00+00:00',
      source: 'mini_app_inbound_record_metadata',
    },
    provenance: {
      contract: 'p12-partner-snapshot-v1',
      revision: 'p12-partner-snapshot-r1-20261104',
      document_id: target.id,
      warehouse_id: target.warehouseId,
      document_version: version,
      semantics: 'RECORD_SNAPSHOT_NOT_DOCUMENT_TITLE_OR_CURRENT_DIRECTORY',
    },
  };
}
export function releaseHandoff(
  target: { id: string; warehouseId: string },
  currentVersion = 3,
  submittedVersion = 2,
) {
  return {
    contract: 'p13-web-post-queue-v1',
    revision: 'p13-web-post-queue-r2-20261104',
    state: 'WAITING_WEB_POST',
    document_id: target.id,
    warehouse_id: target.warehouseId,
    canonical_status: 'SCANNING',
    current_document_version: currentVersion,
    document_version_at_record: submittedVersion,
    document_version_match: currentVersion === submittedVersion,
    semantics: 'PERSISTED_SUBMISSION_INTENT_NOT_WEB_DELIVERY_ACK',
    display_status: {
      value: 'WAITING_WEB_POST',
      label: 'Chờ xử lý trên Web',
      mapping_contract: 'p13-web-post-queue-v1',
      mapping_revision: 'p13-web-post-queue-r2-20261104',
    },
    current_waiting_for_web: true,
    source: 'mini_app_web_post_handoffs+stock_documents.status',
    submitted_at: '2026-11-03T12:16:58.344021Z',
    reviewed_at: null,
    reviewed_status: 'NOT_RECORDED',
    posted_at: null,
    stock_effect: 'READ_ONLY_PROJECTION',
  };
}
