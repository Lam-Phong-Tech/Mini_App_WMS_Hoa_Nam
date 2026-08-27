export type ScanContext =
  | "RECEIPT"
  | "OUTBOUND"
  | "WARRANTY_ITEM"
  | "WARRANTY_COMPONENT"
  | "INVENTORY_LOOKUP";

export type ScanMethod = "CAMERA" | "SCANNER" | "MANUAL";

export type ScanStatus = "PENDING" | "SUCCESS" | "ERROR";

export type ScanApprovalStatus = "PENDING_APPROVAL" | "APPROVED";

export type CameraPermissionStatus =
  | "UNKNOWN"
  | "REQUESTING"
  | "GRANTED"
  | "DENIED";

export type ActiveCamera = "BACK" | "FRONT";

export interface ScanDetectedResult {
  code: string;
  format?: string;
  detected_at: string;
}

export interface ScanRequest {
  client_scan_id: string;
  code: string;
  quantity: number;
  scan_method: ScanMethod;
  scan_context: ScanContext;
  document_id?: string;
  warehouse_staff_id?: number;
  zalo_user_id?: string;
  scanned_by_name?: string;
  scanned_at: string;
}

export interface WarehouseStaff {
  id: number;
  zalo_user_id: string;
  name: string;
  avatar_url?: string | null;
  role: string;
  zalo_verified?: boolean;
}

export interface ScanProductInfo {
  product_id?: number | string;
  sku_id?: string;
  sku_code?: string;
  product_name?: string;
  description?: string;
  purpose?: string;
  usage?: string;
  technical_specifications?: string;
  brand_name?: string;
  category_name?: string;
  unit_name?: string;
  model?: string;
  image_url?: string;
  item_id?: number | string;
  container_id?: string;
  item_code?: string;
  serial_no?: string;
  warehouse_name?: string;
  raw_code?: string;
  classification?: "ITEM" | "CONTAINER" | "SKU" | string;
  stock_status?: string;
  object_status?: string;
  resolved_source?: string;
  current_location?: {
    warehouse_id?: string;
    warehouse_code?: string;
    warehouse_name?: string;
  };
}

export interface ScanResponse {
  success: boolean;
  message: string;
  error_code?: string;
  data?: {
    scan_record_id?: number;
    approval_status?: ScanApprovalStatus;
    document_id?: string;
    line_id?: string;
    sku_id?: string;
    item_id?: string;
    quantity?: number;
    status?: string;
    stock_effect?: "NONE" | string;
    movement_created?: boolean;
    classification?: string;
    raw_code?: string;
    product?: ScanProductInfo;
    required_qty?: number;
    scanned_qty?: number;
    remaining_qty?: number;
    progress_percent?: number;
    full_scan?: boolean;
    ready_for_issue?: boolean;
    mini_app_status?: string;
    matched?: boolean;
    warehouse_staff?: WarehouseStaff | null;
  };
}

export interface ScanHistoryItem {
  id: string;
  request: ScanRequest;
  status: ScanStatus;
  response?: ScanResponse;
  error_message?: string;
  confirmed_at?: string;
}

export interface ScanContextConfig {
  context: ScanContext;
  title: string;
  shortTitle: string;
  description: string;
  icon: import("@/components/ui/Icon").IconName;
  requiresQuantity: boolean;
  endpoint: (documentId?: string) => string;
}

export interface WarehouseDashboardResponse {
  pending_approval_count: number;
  approved_count: number;
  warehouse_staff: {
    id?: number;
    zalo_user_id?: string;
    name: string;
    avatar_url?: string | null;
    role: string;
    zalo_verified?: boolean;
  };
}

export interface ApprovedProductItem {
  id: string;
  code: string;
  sku_code?: string;
  product_name?: string;
  item_code?: string;
  serial_no?: string;
  warehouse_name?: string;
  scanned_by_name?: string;
  approved_at?: string;
}
