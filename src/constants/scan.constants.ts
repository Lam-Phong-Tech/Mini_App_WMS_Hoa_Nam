import type { ScanContext, ScanContextConfig } from "@/types/scan.types";

export const SCAN_DEBOUNCE_MS = 1800;

export const SCAN_CONTEXT_CONFIG: Record<ScanContext, ScanContextConfig> = {
  RECEIPT: {
    context: "RECEIPT",
    title: "Nhập kho",
    shortTitle: "Nhập",
    description: "Quét hàng nhập",
    icon: "package-plus",
    requiresQuantity: true,
    endpoint: (documentId = "draft") =>
      `/api/v1/inbound-documents/${documentId}/scan`,
  },
  OUTBOUND: {
    context: "OUTBOUND",
    title: "Xuất kho",
    shortTitle: "Xuất",
    description: "Quét theo phiếu",
    icon: "package-minus",
    requiresQuantity: true,
    endpoint: (documentId = "draft") =>
      `/api/v1/outbound-documents/${documentId}/scans`,
  },
  WARRANTY_ITEM: {
    context: "WARRANTY_ITEM",
    title: "Tiếp nhận bảo hành",
    shortTitle: "Bảo hành",
    description: "Tiếp nhận sản phẩm",
    icon: "shield-check",
    requiresQuantity: false,
    endpoint: () => "/api/v1/inventory/trace",
  },
  WARRANTY_COMPONENT: {
    context: "WARRANTY_COMPONENT",
    title: "Xuất linh kiện bảo hành",
    shortTitle: "Linh kiện",
    description: "Quét linh kiện xuất cho phiếu bảo hành.",
    icon: "wrench",
    requiresQuantity: true,
    endpoint: (documentId = "draft") =>
      `/api/v1/warranty-component-issues/${documentId}/scans`,
  },
  INVENTORY_LOOKUP: {
    context: "INVENTORY_LOOKUP",
    title: "Tra cứu sản phẩm",
    shortTitle: "Tra cứu",
    description: "Tìm SKU / Serial",
    icon: "search",
    requiresQuantity: false,
    endpoint: () => "/api/v1/inventory/trace",
  },
};

export const MOCK_SCAN_CODES = [
  "VALID-001",
  "NOT-FOUND",
  "DUPLICATE",
  "WRONG-SKU",
  "LINE-FULL",
  "NETWORK-ERROR",
  "TIMEOUT",
] as const;
