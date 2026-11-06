export const queueTarget = {
  kind: 'inbound' as const,
  id: '11111111-1111-4111-8111-111111111111',
  warehouseId: '22222222-2222-4222-8222-222222222222',
};
export function queueProjection() {
  return {
    contract: 'p13-queue-projection-v1',
    revision: 'be04-r1-20261104',
    availability: 'RECORDED',
    document_version: 0,
    version_availability: 'RECORDED',
    version_source: 'stock_documents.version',
    as_of: '2026-11-04T04:00:00.000000Z',
    read_target_semantics:
      'CURRENT_OWNER_GET_COMPARE_DOCUMENT_VERSION_NOT_HISTORICAL_VERSION_PIN',
    read_target: {
      method: 'GET',
      path: '/api/v1/mini-app/inbound-documents/' + queueTarget.id,
      query: { warehouse_id: queueTarget.warehouseId },
    },
    line_count: 2,
    line_count_unit: 'LINE',
    quantity_summary: {
      availability: 'RECORDED',
      source: 'stock_document_lines.qty_planned+scanned_qty',
      unit_source: 'sku.unit',
      unit_semantics: 'CURRENT_SOURCE_SKU_UNIT_NOT_HISTORICAL_SNAPSHOT',
      unit_availability: 'RECORDED',
      unit_complete: true,
      unknown_unit_line_count: 0,
      mixed_units: false,
      unknown_unit_policy: 'NOT_COMPARABLE_WITHOUT_UNIT',
      by_unit: [
        {
          unit: 'Cái',
          sku_id_when_unit_unknown: null,
          line_count: 2,
          planned_quantity: 0,
          scanned_quantity: null,
          planned_quantity_complete: true,
          scanned_quantity_complete: false,
        },
      ],
      cross_unit_total: null,
      count_semantics:
        'SOURCE_LINE_QUANTITIES_NOT_PRODUCT_COMPONENT_OR_SCAN_ENTRY_COUNT',
    },
    creator: {
      actor_id: '33333333-3333-4333-8333-333333333333',
      actor_id_source: 'stock_documents.created_by',
      availability: 'HISTORICAL_SNAPSHOT_NOT_RECORDED',
      display_name: null,
      job_title: null,
      display_name_availability: 'NOT_RECORDED',
      job_title_availability: 'NOT_RECORDED',
      snapshot_source: null,
      event_id: null,
      captured_at: null,
      job_title_semantics: 'BUSINESS_TITLE_SNAPSHOT_NOT_IAM_ROLE',
      current_directory_substitution: false,
    },
  };
}
