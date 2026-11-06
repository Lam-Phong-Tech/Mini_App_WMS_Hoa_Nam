// Synthetic wire representation transcribed from delivered BE 99ffd6c6.
// Unit/UI tests only; never used as a live fallback or a physical placement seed.
import {
  project,
  id,
  scope as oldScope,
  user as oldUser,
  warehouse,
} from './beReleasedReads20261024';
export { id, warehouse };
export const target = { kind: 'BOX' as const, id: id(501) };
export const locationScope = () => ({
  ...oldScope(),
  rights: [...oldScope().rights, 'putaway.view', 'item_instance.view'].sort(),
});
export const locationUser = () => ({
  ...oldUser(),
  permissions: locationScope().rights,
});
export function locationBody(
  kind: 'ITEM' | 'BOX' = 'BOX',
  status = 'RECORDED',
) {
  const location = {
    location_id: id(502),
    location_code: 'TRAY-TEST-UI-18',
    location_label: 'TRAY-TEST-UI-18',
    location_kind: 'TRAY',
    label_semantics: 'ACTUAL_CONTAINER_CODE_NOT_SHELF_OR_BIN',
    warehouse_id: warehouse,
    placement_version: 2,
    box_version: 4,
    location_version: 3,
    effective_at: '2026-11-02T01:00:00.123456Z',
    observed_at: '2026-11-03T01:00:00.123456Z',
    provenance: {
      basis:
        kind === 'ITEM'
          ? 'ACTIVE_ITEM_MEMBERSHIP_AND_CONFIRMED_BOX_PUTAWAY'
          : 'CONFIRMED_BOX_PUTAWAY_AND_CURRENT_PARENT',
      event_id: id(503),
      event_source: 'putaway_events',
      effective_time_source: 'putaway_events.confirmed_at',
      parent_source: 'containers.parent_container_id',
      location_source: 'containers.container_id/container_code',
      receipt_id: id(504),
      ...(kind === 'ITEM'
        ? { membership_id: id(505), membership_version: 7 }
        : {}),
    },
  };
  return project({
    success: true,
    data: {
      warehouse_id: warehouse,
      warehouse_scope_basis: 'SINGLE_WAREHOUSE_REGISTER_NOT_PHYSICAL_PLACEMENT',
      identity: {
        kind,
        [kind === 'BOX' ? 'container_id' : 'item_id']: target.id,
        physical_code: kind === 'BOX' ? 'BOX-TEST-UI-18' : 'ITEM-TEST-UI-18',
        physical_code_status: 'RECORDED_PHYSICAL_CODE',
      },
      sku_id: id(506),
      sku_id_status: 'CURRENT_DIRECTORY',
      sku_code: 'COMP-TEST-18',
      sku_code_status: 'CURRENT_DIRECTORY',
      component_name: 'Linh kiện TEST UI P18',
      component_name_status: 'CURRENT_DIRECTORY',
      unit: 'Cái',
      unit_status: 'CURRENT_DIRECTORY',
      master_source: 'sku',
      master_semantics: 'CURRENT_DIRECTORY_NOT_HISTORICAL_SNAPSHOT',
      current_location: status === 'RECORDED' ? location : null,
      current_location_status: status,
      ...(kind === 'ITEM' && status === 'RECORDED'
        ? {
            parent_container_identity: {
              kind: 'BOX',
              container_id: id(510),
              physical_code: 'BOX-TEST-UI-18',
            },
          }
        : {}),
      hierarchy: null,
      hierarchy_status: 'NOT_CONFIGURED',
      capacity: null,
      capacity_status: 'NOT_CONFIGURED',
      stock_effect: 'NONE',
    },
    meta: {
      contract: 'p18-component-location-read-v1',
      revision: 'p18-component-location-read-r1',
      request_id: 'P18-UNIT-TEST-ONLY',
      timestamp_contract: 'document-timestamps-v1',
      snapshot: {
        id: id(507),
        observed_at: '2026-11-03T01:00:00.123456Z',
        consistency: 'SINGLE_RESPONSE_DATABASE_SNAPSHOT',
        cross_request_snapshot: false,
      },
      capability: {
        supported: true,
        model: 'CONFIRMED_BOX_PUTAWAY',
        direct_item_placement_supported: false,
        write_operations: [],
      },
      cache_policy: 'NO_INTERNAL_RESULT_CACHE',
      tenant_policy: 'SINGLE_TENANT_DATABASE_REQUIRED',
    },
  });
}
export const locationHeaders = {
  'Cache-Control': 'private, no-store',
  'Content-Type': 'application/json; charset=UTF-8',
  'X-Content-Type-Options': 'nosniff',
  'X-Read-Fields-Contract': 'explicit-read-fields-v1',
  'X-Request-ID': 'P18-UNIT-TEST-ONLY',
  Vary: 'Authorization, Origin, X-Component-Location-Contract, X-Read-Fields-Contract',
};
