import { ownerUuid } from '../../app/ownerNavigation';
import type { Scope } from '../../features/documents/p12/contract';
import {
  explicitRead,
  readAssert,
  readBoolean,
  readInteger,
  readObject,
  readString,
  type ReadField,
} from './explicitReadFields';

export const P18_BOX_CONTRACT = 'p18-single-warehouse-boxes-v1';
export type BoxSkuType = 'ALL' | 'COMPONENT' | 'PRODUCT';
export interface BoxQuery {
  keyword: string;
  skuType: BoxSkuType;
  page: number;
  perPage: number;
}
export interface WarehouseBox {
  id: string;
  code: string;
  warehouseId: string;
  status: string;
  version: number;
  classification: string;
  sku?: {
    id: string;
    code: string;
    name: string;
    type: string;
    unit: ReadField<string>;
    serialTracked: boolean;
    status: string;
  };
  containedQty: ReadField<number>;
  quantityStatus: string;
  location: ReadField<string>;
  parentId: ReadField<string>;
  capacity: ReadField<number>;
  available: ReadField<number>;
  reserved: ReadField<number>;
}
export interface BoxPage {
  items: WarehouseBox[];
  total: number;
  page: number;
  lastPage: number;
  perPage: number;
}
export function boxQuery(input: Partial<BoxQuery> = {}): BoxQuery {
  const q = {
    keyword: '',
    skuType: 'ALL' as BoxSkuType,
    page: 1,
    perPage: 20,
    ...input,
  };
  readAssert(
    Object.keys(q).every(k =>
      ['keyword', 'skuType', 'page', 'perPage'].includes(k),
    ) &&
      readString(q.keyword) &&
      Array.from(q.keyword).length <= 100 &&
      ['ALL', 'COMPONENT', 'PRODUCT'].includes(q.skuType) &&
      readInteger(q.page) &&
      q.page >= 1 &&
      readInteger(q.perPage) &&
      q.perPage >= 1 &&
      q.perPage <= 100,
    'BOX_QUERY_INVALID',
  );
  return { ...q, keyword: q.keyword.trim() };
}
export function parseBoxes(
  value: unknown,
  scope: Scope,
  query: BoxQuery,
  detailId?: string,
): BoxPage {
  const r = explicitRead(value, P18_BOX_CONTRACT),
    m = r.meta;
  readAssert(
    m.warehouse_id === scope.warehouseId &&
      m.model === 'SINGLE_WAREHOUSE_WITH_BOXES' &&
      m.count_unit === 'BOX' &&
      m.product_to_component_reclassification === false &&
      Array.isArray(m.write_operations) &&
      m.write_operations.length === 0 &&
      readInteger(m.total) &&
      readInteger(m.page) &&
      readInteger(m.per_page) &&
      readInteger(m.last_page) &&
      m.page === (detailId ? 1 : query.page) &&
      m.per_page === (detailId ? 20 : query.perPage) &&
      m.last_page === Math.max(1, Math.ceil(m.total / m.per_page)),
    'BOX_SCOPE_OR_PAGING_INVALID',
  );
  for (const path of ['/meta/physical_hierarchy', '/meta/capacity']) {
    const field = r.field(path, readInteger);
    readAssert(
      !field.supplied && field.status === 'NOT_CONFIGURED',
      'BOX_MODEL_INVALID',
    );
  }
  const rows = detailId ? [readObject(r.body.data)] : r.body.data;
  readAssert(
    Array.isArray(rows) && rows.length <= Number(m.per_page),
    'BOX_ROWS_INVALID',
  );
  const items = rows.map((raw, index): WarehouseBox => {
    const b = readObject(raw),
      p = detailId ? '/data' : '/data/' + index;
    const skuField = r.field(p + '/sku', (v): v is Record<string, unknown> =>
      Boolean(v && typeof v === 'object' && !Array.isArray(v)),
    );
    const qty = r.field(p + '/contained_qty', readInteger),
      loc = r.field(p + '/location_hint', readString),
      parent = r.field(p + '/parent_container_id', ownerUuid),
      capacity = r.field(p + '/capacity', readInteger),
      available = r.field(p + '/available_qty', readInteger),
      reserved = r.field(p + '/reserved_qty', readInteger);
    readAssert(
      ownerUuid(b.container_id) &&
        readString(b.container_code) &&
        b.container_code.trim() &&
        b.container_type === 'BOX' &&
        b.warehouse_id === scope.warehouseId &&
        b.warehouse_scope_basis ===
          'SINGLE_WAREHOUSE_REGISTER_NOT_PHYSICAL_PLACEMENT' &&
        readString(b.status) &&
        b.status.trim() &&
        readInteger(b.version) &&
        b.version >= 1 &&
        b.quantity_source === 'container_items.ACTIVE' &&
        b.quantity_semantics ===
          'CONTAINER_CONTENTS_NOT_WAREHOUSE_BALANCE_OR_ISSUE_ELIGIBILITY' &&
        b.location_hint_semantics ===
          'STORED_FREE_TEXT_NOT_HIERARCHY_OR_PLACEMENT_PROOF' &&
        b.capacity_status === 'NOT_CONFIGURED' &&
        !capacity.supplied &&
        capacity.status === 'NOT_CONFIGURED' &&
        !available.supplied &&
        available.status === 'NO_AUTHORITATIVE_CONTAINER_AVAILABILITY_MODEL' &&
        !reserved.supplied &&
        reserved.status === 'NO_AUTHORITATIVE_CONTAINER_AVAILABILITY_MODEL',
      'BOX_IDENTITY_OR_SEMANTICS_INVALID',
    );
    readAssert(
      qty.supplied
        ? b.quantity_status === 'RECORDED_CONTAINER_CONTENTS'
        : ['NOT_RECORDED', 'SOURCE_INCONSISTENT'].includes(
            String(b.quantity_status),
          ) && qty.status === b.quantity_status,
      'BOX_QUANTITY_INVALID',
    );
    let sku: WarehouseBox['sku'];
    if (skuField.supplied) {
      const s = skuField.value,
        component = s.type === 'COMPONENT',
        bulk = component && s.serial_tracked === false;
      readAssert(
        ownerUuid(s.id) &&
          readString(s.code) &&
          s.code.trim() &&
          readString(s.name) &&
          ['COMPONENT', 'PRODUCT'].includes(String(s.type)) &&
          readBoolean(s.serial_tracked) &&
          readString(s.status) &&
          b.classification ===
            (bulk
              ? 'COMPONENT_QUANTITY'
              : component
              ? 'COMPONENT_SERIAL'
              : 'PRODUCT') &&
          b.individual_physical_code_required === !bulk &&
          b.component_master_required === component &&
          (detailId || query.skuType === 'ALL' || s.type === query.skuType),
        'BOX_SKU_INVALID',
      );
      sku = {
        id: s.id,
        code: s.code,
        name: s.name,
        type: String(s.type),
        serialTracked: s.serial_tracked,
        status: s.status,
        unit: r.field(p + '/sku/unit', readString),
      };
    } else {
      readAssert(
        b.classification === 'UNASSIGNED' &&
          (detailId || query.skuType === 'ALL'),
        'BOX_SKU_INVALID',
      );
      readAssert(
        !r.field(p + '/individual_physical_code_required', readBoolean)
          .supplied &&
          !r.field(p + '/component_master_required', readBoolean).supplied,
        'BOX_SKU_INVALID',
      );
    }
    const target = readObject(b.read_target),
      tq = readObject(target.query),
      headers = readObject(target.headers);
    readAssert(
      target.method === 'GET' &&
        target.path === '/api/v1/containers/' + b.container_id &&
        tq.warehouse_id === scope.warehouseId &&
        Object.keys(tq).length === 1 &&
        Object.keys(headers).length === 1 &&
        headers['X-Container-Read-Contract'] === P18_BOX_CONTRACT &&
        (!detailId || b.container_id === detailId),
      'BOX_TARGET_INVALID',
    );
    return {
      id: b.container_id,
      code: b.container_code,
      warehouseId: scope.warehouseId,
      status: b.status,
      version: b.version,
      classification: String(b.classification),
      sku,
      containedQty: qty,
      quantityStatus: String(b.quantity_status),
      location: loc,
      parentId: parent,
      capacity,
      available,
      reserved,
    };
  });
  readAssert(
    new Set(items.map(b => b.id)).size === items.length &&
      items.length <= m.total &&
      (detailId
        ? items.length === 1 && m.total === 1
        : items.length ===
          Math.min(
            query.perPage,
            Math.max(0, m.total - (query.page - 1) * query.perPage),
          )),
    'BOX_PAGING_INVALID',
  );
  return {
    items,
    total: m.total,
    page: m.page,
    perPage: m.per_page,
    lastPage: m.last_page,
  };
}
