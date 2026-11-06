export type P06IdentityType = 'SKU' | 'ITEM';
export type P06Category = 'ALL' | 'PRODUCT' | 'COMPONENT';
export type P06Source = 'ALL' | 'LEDGER' | 'WARRANTY';
export interface P06Scope {
  actorId: string;
  authSessionId: string;
  warehouseId: string;
}
export interface P06Identity {
  type: P06IdentityType;
  id: string;
}
export interface P06Snapshot {
  id: string;
  observed_at: string;
  consistency: 'SINGLE_RESPONSE_DATABASE_SNAPSHOT' | 'ENCLOSING_TRANSACTION';
  cross_request_snapshot: false;
}
export interface P06Meta {
  contract: 'mini-app-p06-v1';
  card_metadata_revision?: 'p06-card-master-r1' | 'p06-card-master-r2';
  snapshot: P06Snapshot;
  request_id: string;
  timestamp: string;
}
export interface P06Response<T, M extends P06Meta = P06Meta> {
  data: T;
  meta: M;
}
export interface P06Context {
  actor_id: string;
  auth_session_id: string;
  active_warehouse_id: string | null;
  warehouse_context: {
    status: 'READY' | 'REQUIRED' | 'UNAVAILABLE' | 'NO_SESSION';
    error_code: string | null;
  };
  available_warehouses: {
    warehouse_id: string;
    code: string;
    name: string;
    status: string;
  }[];
  warehouse_status: string | null;
  read_only: true;
  permissions: Record<
    | 'skus'
    | 'items'
    | 'stock'
    | 'ledger'
    | 'warranty_view'
    | 'warranty_manage'
    | 'label_print_permission',
    boolean
  >;
  identity_types: ['SKU', 'ITEM'];
  sku_scope: 'GLOBAL_MASTER_WITH_SELECTED_WAREHOUSE_STOCK';
  item_scope: 'SELECTED_WAREHOUSE_HISTORY_OR_PERMITTED_WARRANTY_NOT_CURRENT_LOCATION';
}
export interface P06Stock {
  sku_id: string;
  warehouse_id: string;
  status: 'CONFIRMED' | 'EMPTY' | 'INCOMPLETE' | 'MISMATCH';
  total_qty: number | null;
  available_qty: number | null;
  reserved_qty: number | null;
  unavailable_qty: number | null;
  ledger_total: number | null;
  quantity_source: 'INVENTORY_BALANCE_PROJECTION';
  reservation_basis: 'BALANCE_RESERVED_QTY_NOT_LIVE_SCAN_MATCH_COUNT';
  version: string;
  version_kind: 'CONTENT_FINGERPRINT';
  updated_at: string | null;
  ledger_event_at: string | null;
  snapshot_id: string;
  observed_at: string;
  location_level: 'WAREHOUSE';
  location_breakdown: null;
  location_breakdown_status: 'NOT_TRACKED';
  by_stock_status: {
    balance_id: string;
    stock_status: string;
    on_hand_qty: number | null;
    available_qty: number | null;
    reserved_qty: number | null;
    version: number | null;
    updated_at: string | null;
  }[];
}
export type P06MasterLabelStatus =
  | 'NOT_ASSIGNED'
  | 'REFERENCE_NOT_FOUND'
  | 'LABEL_UNAVAILABLE'
  | 'CURRENT_ACTIVE_MASTER'
  | 'CURRENT_INACTIVE_MASTER'
  | 'CURRENT_MASTER_STATUS_UNKNOWN';
export interface P06CardMetadataStatus {
  category_name: P06MasterLabelStatus;
  brand_name: P06MasterLabelStatus;
  description:
    | 'SOURCE_NOT_DEFINED'
    | 'CURRENT_PV_PROFILE'
    | 'PROFILE_NOT_FOUND'
    | 'PROFILE_AMBIGUOUS'
    | 'DESCRIPTION_UNAVAILABLE';
}
export interface P06Card {
  card_type: P06IdentityType;
  sku_id: string;
  sku_code: string;
  sku_name: string;
  sku_type: 'PRODUCT' | 'COMPONENT';
  sku_status: 'ACTIVE' | 'INACTIVE';
  /** Additive current-master fields from the same P06 owner card. Legacy cards omit them. */
  category_name?: string | null;
  brand_name?: string | null;
  description?: string | null;
  metadata_status?: P06CardMetadataStatus;
  unit: string | null;
  item_id: string | null;
  item_code: string | null;
  serial_number: string | null;
  item_status: string | null;
  item_condition: string | null;
  version: number;
  updated_at: string | null;
  current_location: null;
  current_location_status: 'NOT_ASSERTED';
}
export type P06StockAvailability =
  | 'INCLUDED'
  | 'FORBIDDEN'
  | 'USE_SKU_STOCK_ENDPOINT';
export interface P06ListCard extends P06Card {
  stock: P06Stock | null;
  stock_availability: P06StockAvailability;
}
export interface P06GalleryImage {
  image_id: string;
  owner_type: 'SKU';
  full_url: string | null;
  thumbnail_url: null;
  thumbnail_status: 'NOT_GENERATED';
  order: number;
  is_primary: boolean;
  alt_text: string | null;
  version: number | null;
  updated_at: string | null;
  access: 'PUBLIC' | 'UNKNOWN' | 'UNAVAILABLE';
  expires_at: null;
  expiry_policy: 'NO_SIGNED_EXPIRY' | 'UNKNOWN';
}
export interface P06Detail {
  card: P06Card;
  stock: P06Stock | null;
  stock_availability: P06StockAvailability;
  gallery: P06GalleryImage[];
  gallery_owner_type: 'SKU';
  capabilities: {
    warranty: {
      view_permitted: boolean;
      manage_permitted: boolean;
      target_type: 'ITEM' | null;
      target_id: string | null;
      action_exposed: false;
      reason: string;
    };
    label_print: {
      permission_granted: boolean;
      target_type: 'LABEL_SNAPSHOT';
      target_id: null;
      action_exposed: false;
      reason: string;
    };
  };
}
export interface P06PageMeta extends P06Meta {
  warehouse_id: string;
  page: number;
  per_page: number;
  total: number;
  last_page: number;
}
export interface P06ListMeta extends P06PageMeta {
  count_unit: P06IdentityType;
  tab_totals: Record<P06Category, number>;
  scope_policy:
    | 'WAREHOUSE_HISTORY_NOT_CURRENT_LOCATION'
    | 'GLOBAL_SKU_MASTER_SCOPED_STOCK';
}
export interface P06Document {
  id: string;
  type: string | null;
  number: string | null;
  current_status: string | null;
  can_open: boolean;
}
export interface P06Event {
  event_id: string;
  source_event_id: string;
  source: 'LEDGER' | 'WARRANTY';
  occurred_at: string | null;
  event_type: string;
  signed_quantity: number | null;
  quantity_applicability: 'STOCK_DELTA' | 'NOT_APPLICABLE';
  item_id: string | null;
  document: P06Document | null;
  from_status: string | null;
  to_status: string | null;
}
export interface P06TimelineMeta extends P06PageMeta {
  sources: Record<
    'LEDGER' | 'WARRANTY',
    'INCLUDED' | 'FORBIDDEN' | 'NOT_REQUESTED'
  >;
  linkage_policy: 'EXPLICIT_IDS_ONLY';
  unlinked_warranty_policy: 'EXCLUDED_NO_INFERRED_SKU_OR_ITEM';
  quantity_policy: 'LEDGER_QTY_DELTA_WARRANTY_NULL';
}
export interface P06ListQuery {
  keyword?: string;
  serial?: string;
  item_code?: string;
  sku_id?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL';
  sku_type?: P06Category;
  item_status?: string;
  page?: number;
  per_page?: number;
}
export interface P06TimelineQuery {
  source?: P06Source;
  page?: number;
  per_page?: number;
}
export type P06ListResponse = P06Response<P06ListCard[], P06ListMeta>;
export type P06TimelineResponse = P06Response<P06Event[], P06TimelineMeta>;
