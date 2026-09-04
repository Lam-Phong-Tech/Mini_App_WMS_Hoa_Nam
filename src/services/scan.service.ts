import { SCAN_CONTEXT_CONFIG } from "@/constants/scan.constants";
import { submitMockScan } from "@/mocks/scan.mock";
import {
  ApiClientError,
  getJson,
  getJsonWithMeta,
  postJson,
  postJsonWithMeta,
} from "@/services/api-client";
import {
  getWmsApiBaseUrl,
  getWmsAuthHeaders,
  getWmsLinkContext,
} from "@/services/wms-link-context";
import { resolveWmsContext } from "@/services/wms-context.service";
import { markWarehouseDashboardChanged } from "@/services/warehouse-dashboard-cache";
import { getStoredWarehouseStaff } from "@/services/zalo-auth.service";
import { generateClientScanId } from "@/utils/generateClientScanId";
import type {
  ApprovedProductItem,
  ScanHistoryItem,
  ScanRequest,
  ScanResponse,
  WarehouseDashboardResponse,
} from "@/types/scan.types";

const useMock = import.meta.env.VITE_USE_SCAN_MOCK !== "false";
const useWmsReceiptFlow = Boolean(import.meta.env.VITE_WMS_API_BASE_URL);

type WmsScanContext =
  | "INBOUND"
  | "OUTBOUND"
  | "INVENTORY"
  | "TRACE"
  | "WARRANTY_RECEIVE"
  | "WARRANTY_TEMP_ONLY";

interface WmsEnvelope<TData = any> {
  success: boolean;
  message?: string;
  data?: TData;
  meta?: unknown;
  error_code?: string;
  code?: string;
  error?: string;
}

interface WmsClassifyData {
  raw_code: string;
  context: WmsScanContext;
  classification: "ITEM" | "CONTAINER" | "SKU" | string;
  item_id?: string | null;
  container_id?: string | null;
  sku_id?: string | null;
  product_id?: string | null;
  stock_status?: string;
  object_status?: string;
  resolved_source?: string;
  sku_code?: string | null;
  item_unique?: string | null;
  serial_number?: string | null;
  normalized_code_value?: string | null;
  stock_effect?: "NONE" | string;
  movement_created?: boolean;
  current_location?: {
    warehouse_id?: string;
    warehouse_code?: string;
    warehouse_name?: string;
  };
}

interface WmsDocumentLine {
  id?: string;
  line_id?: string;
  sku_id?: string;
  product_id?: string;
  product?: {
    id?: string;
    product_id?: string;
    code?: string;
    sku_code?: string;
    name?: string;
    product_name?: string;
  };
  sku?: {
    id?: string;
    sku_id?: string;
    code?: string;
    sku_code?: string;
    name?: string;
    sku_name?: string;
  };
  qty_planned?: number;
  expected_qty?: number;
  required_quantity?: number;
  quantity?: number;
  scanned_qty?: number;
  scanned_quantity?: number;
}

interface WmsDocumentData {
  id?: string;
  document_id?: string;
  doc_no?: string;
  document_no?: string;
  request_no?: string;
  version?: number | string;
  status?: string;
  mini_app_status?: string;
  warehouse_id?: string;
  src_warehouse_id?: string;
  dst_warehouse_id?: string;
  expected_total_qty?: number;
  required_total_qty?: number;
  required_total?: number;
  scanned_total_qty?: number;
  scanned_qty?: number;
  remaining_qty?: number;
  progress_percent?: number;
  full_scan?: boolean;
  ready_for_issue?: boolean;
  stock_effect?: "NONE" | string;
  movement_created?: boolean;
  packing_label?: OutboundPackingLabel;
  lines?: WmsDocumentLine[];
  document_lines?: WmsDocumentLine[];
  items?: WmsDocumentLine[];
}

export interface InboundDocumentSummary {
  id?: string;
  document_id?: string;
  doc_no?: string;
  document_no?: string;
  status?: string;
  mini_app_status?: string;
  warehouse_id?: string;
  src_warehouse_id?: string;
  dst_warehouse_id?: string;
  warehouse_name?: string;
  purpose?: string;
  version?: string | number;
  created_at?: string;
  updated_at?: string;
  expected_total_qty?: number;
  scanned_qty?: number;
  scanned_quantity?: number;
  required_qty?: number;
  required_quantity?: number;
  total_qty?: number;
  required_total?: number;
  matched_count?: number;
  scanned_total_qty?: number;
  required_total_qty?: number;
  remaining_qty?: number;
  progress_percent?: number;
  packing_label_count?: number;
  packing_label_applied_count?: number;
  label_printed_count?: number;
}

export type OutboundDocumentSummary = InboundDocumentSummary;

export interface OutboundDocumentLineDetail extends WmsDocumentLine {
  qty_actual?: number;
  line_no?: number;
}

export interface OutboundItemMatchDetail {
  id?: string;
  line_id?: string;
  item_id?: string;
  container_id?: string | null;
  sku_id?: string;
  item_code?: string;
  serial_number?: string;
  quantity?: number;
  status?: string;
  matched_at?: string;
  removed_at?: string | null;
  label_status?: string | null;
}

export interface OutboundDocumentDetail extends WmsDocumentData {
  doc_no?: string;
  document_no?: string;
  request_no?: string;
  status?: string;
  mini_app_status?: string;
  src_warehouse_id?: string;
  src_warehouse_name?: string;
  recipient_name?: string;
  recipient_address?: string;
  recipient_contact_phone?: string;
  expected_total_qty?: number;
  required_total_qty?: number;
  scanned_total_qty?: number;
  remaining_qty?: number;
  progress_percent?: number;
  full_scan?: boolean;
  ready_for_issue?: boolean;
  packing_label?: OutboundPackingLabel;
  created_at?: string;
  updated_at?: string;
  lines?: OutboundDocumentLineDetail[];
  item_matches?: OutboundItemMatchDetail[];
  scan_entries?: OutboundItemMatchDetail[];
  matches?: OutboundItemMatchDetail[];
}

export interface OutboundDraftLineInput {
  sku_code?: string;
  sku_id?: string;
  required_qty: number;
}

export interface OutboundDraftInput {
  warehouse_id: string;
  name?: string;
  recipient_name: string;
  recipient_address?: string;
  recipient_contact_phone?: string;
  note?: string;
  expected_total_qty: number;
  lines?: OutboundDraftLineInput[];
  idempotencyKey?: string;
}

export interface OutboundResolveCodeInput {
  warehouse_id: string;
  raw_code: string;
}

export interface OutboundResolvedCode {
  sku_id?: string;
  sku_code?: string;
  sku_name?: string;
  item_id?: string;
  item_unique?: string;
  item_status?: string;
  eligible_for_outbound?: boolean;
  eligibility_code?: string;
  available_qty?: number;
  reservation?: {
    doc_no?: string;
    status?: string;
  };
  raw_code?: string;
  code_value?: string;
}

export interface OutboundRecordBatchItemInput {
  raw_code: string;
  scan_source: "CAMERA" | "MANUAL" | "SCANNER" | "HARDWARE";
}

export interface OutboundRecordBatchInput {
  name: string;
  warehouse_id: string;
  recipient_name: string;
  recipient_address?: string;
  recipient_contact_phone?: string;
  note?: string;
  expected_total_qty: number;
  items: OutboundRecordBatchItemInput[];
}

export interface OutboundPackingLabel {
  id?: string;
  label_id?: string;
  label_no?: string;
  status?: string;
  preview_url?: string;
  pdf_url?: string;
  printed_at?: string;
  applied_at?: string;
  version?: number | string;
}

export interface WmsProductDetail {
  id?: string;
  sku_id?: string;
  product_id?: string;
  code?: string;
  sku_code?: string;
  product_code?: string;
  name?: string;
  sku_name?: string;
  sku_type?: string;
  product_name?: string;
  description?: string;
  short_description?: string;
  purpose?: string;
  usage?: string;
  usage_description?: string;
  utility?: string;
  application?: string;
  brand_name?: string;
  category_name?: string;
  unit_name?: string;
  unit?: string;
  model?: string;
  image_url?: string;
  specification?: Record<string, unknown>;
  status?: string;
}

interface WmsInboundScanData {
  document_id?: string;
  line_id?: string;
  sku_id?: string;
  item_id?: string;
  quantity?: number;
  qty?: number;
  required_quantity?: number;
  expected_qty?: number;
  scanned_quantity?: number;
  scanned_qty?: number;
  status?: string;
  stock_effect?: "NONE" | string;
  movement_created?: boolean;
  replayed?: boolean;
}

interface WmsOutboundScanData extends WmsInboundScanData {
  matched_count?: number;
  required_total?: number;
  scanned_total_qty?: number;
  required_total_qty?: number;
  remaining_qty?: number;
  progress_percent?: number;
  full_scan?: boolean;
  ready_for_issue?: boolean;
  mini_app_status?: string;
  packing_label_ready?: boolean;
  packing_label_id?: string;
  label_status?: string;
  scan_source?: string;
  scan_source_origin?: string;
  code_value?: string;
  raw_code?: string;
  classification?: string;
  progress?: {
    matched_count?: number;
    required_total?: number;
    scanned_quantity?: number;
    required_quantity?: number;
    scanned_total_qty?: number;
    required_total_qty?: number;
    remaining_qty?: number;
    progress_percent?: number;
    full_scan?: boolean;
  };
  document?: {
    id?: string;
    document_id?: string;
    version?: number | string;
    status?: string;
    mini_app_status?: string;
    scanned_total_qty?: number;
    required_total_qty?: number;
    expected_total_qty?: number;
    remaining_qty?: number;
    progress_percent?: number;
    full_scan?: boolean;
    ready_for_issue?: boolean;
  };
  matched_line?: WmsDocumentLine;
  item?: {
    id?: string;
    item_id?: string;
    item_code?: string;
    serial_number?: string;
    sku_id?: string;
    sku_code?: string;
    product_id?: string;
    product_name?: string;
    status?: string;
    stock_status?: string;
  };
}

interface WmsScanEvent {
  id?: string | number;
  event_id?: string | number;
  raw_code?: string;
  code?: string;
  code_value?: string;
  context?: string;
  scan_context?: string;
  status?: string;
  success?: boolean;
  created_at?: string;
  scanned_at?: string;
  message?: string;
  sku_code?: string;
  product_name?: string;
  item_id?: string | number;
  serial_no?: string;
  warehouse_name?: string;
}

interface WmsInventoryBalance {
  id?: string | number;
  balance_id?: string | number;
  sku_code?: string;
  product_name?: string;
  item_code?: string;
  serial_no?: string;
  warehouse_name?: string;
  code?: string;
}

export async function submitScan(
  request: ScanRequest,
  documentId?: string,
): Promise<ScanResponse> {
  if (useMock) {
    return submitMockScan(request);
  }

  if (request.scan_context === "RECEIPT" && useWmsReceiptFlow) {
    return submitWmsInboundScan(request, documentId);
  }

  if (useWmsReceiptFlow) {
    return submitWmsDirectScan(request, documentId);
  }

  const endpoint = SCAN_CONTEXT_CONFIG[request.scan_context].endpoint(documentId);
  return postJson<ScanRequest, ScanResponse>(endpoint, request);
}

async function submitWmsDirectScan(
  request: ScanRequest,
  documentId?: string,
): Promise<ScanResponse> {
  if (
    request.scan_context === "INVENTORY_LOOKUP" ||
    request.scan_context === "WARRANTY_ITEM"
  ) {
    return traceWmsInventory(request);
  }

  if (request.scan_context === "OUTBOUND") {
    return submitWmsOutboundScan(request, documentId);
  }

  if (request.scan_context === "WARRANTY_COMPONENT") {
    return submitWmsGenericDocumentScan(
      request,
      documentId,
      "warranty-component-issues",
      "MISSING_WARRANTY_DOCUMENT",
      "Thiếu documentId/If-Match phiếu bảo hành. Hãy chọn hồ sơ bảo hành từ WMS trước khi quét.",
      "scans",
    );
  }

  return failedWmsResponse(
    "WMS_FLOW_NOT_MAPPED",
    "Nghiệp vụ này chưa có endpoint ghi nhận WMS phù hợp trong Mini App.",
  );
}

async function submitWmsOutboundScan(
  request: ScanRequest,
  documentId?: string,
): Promise<ScanResponse> {
  const targetDocumentId = documentId || getWmsLinkContext().documentId;

  if (!targetDocumentId) {
    return failedWmsResponse(
      "MISSING_OUTBOUND_DOCUMENT",
      "Thiếu phiếu xuất. Hãy chọn phiếu xuất trước khi quét.",
    );
  }

  try {
    const documentDetail = await loadWmsOutboundDocument(targetDocumentId);
    const documentData = unwrapEnvelopeData<WmsDocumentData>(documentDetail.data);
    const ifMatch = formatIfMatchHeader(
      normalizeIfMatch(documentDetail.headers.get("ETag")) ||
        normalizeIfMatch(documentData?.version),
    );

    if (!ifMatch) {
      return failedWmsResponse(
        "MISSING_IF_MATCH",
        "Không lấy được version/If-Match của phiếu xuất để ghi nhận mã quét.",
      );
    }

    const scanBody = {
      quantity: Math.max(1, request.quantity || 1),
      code_value: request.code.trim(),
      scan_source:
        request.scan_method === "MANUAL"
          ? "MANUAL"
          : request.scan_method === "CAMERA"
            ? "CAMERA"
            : "SCANNER",
    };

    const response = await postJsonWithMeta<
      typeof scanBody,
      WmsEnvelope<WmsOutboundScanData>
    >(
      `/api/v1/mini-app/outbound-documents/${targetDocumentId}/scan`,
      scanBody,
      {
        baseUrl: getWmsApiBaseUrl(),
        headers: {
          ...getWmsAuthHeaders(),
          "If-Match": ifMatch,
        },
      },
    );

    if (!response.data.success) {
      return failedWmsResponse(
        getWmsErrorCode(response.data),
        response.data.message || "WMS không ghi nhận được mã xuất kho.",
      );
    }

    const data = unwrapEnvelopeData<WmsOutboundScanData>(response.data);
    const parsedCode = parseOutboundCompositeCode(request.code);
    const requiredQty =
      data?.progress?.required_total ||
      data?.progress?.required_total_qty ||
      data?.progress?.required_quantity ||
      data?.required_total ||
      data?.required_total_qty ||
      data?.document?.required_total_qty ||
      data?.document?.expected_total_qty ||
      data?.required_quantity ||
      data?.expected_qty;
    const scannedQty =
      data?.progress?.matched_count ||
      data?.progress?.scanned_total_qty ||
      data?.progress?.scanned_quantity ||
      data?.matched_count ||
      data?.scanned_total_qty ||
      data?.document?.scanned_total_qty ||
      data?.scanned_quantity ||
      data?.scanned_qty;
    const remainingQty =
      data?.progress?.remaining_qty ||
      data?.remaining_qty ||
      data?.document?.remaining_qty ||
      (typeof requiredQty === "number" && typeof scannedQty === "number"
        ? Math.max(0, requiredQty - scannedQty)
        : undefined);
    const lineId = data?.line_id || data?.matched_line?.id || data?.matched_line?.line_id;
    const itemId = data?.item_id || data?.item?.id || data?.item?.item_id;
    const fullScan =
      Boolean(data?.full_scan) ||
      Boolean(data?.progress?.full_scan) ||
      Boolean(data?.document?.full_scan) ||
      (typeof requiredQty === "number" &&
        typeof scannedQty === "number" &&
        requiredQty > 0 &&
        scannedQty >= requiredQty);

    return {
      success: true,
      message:
        response.data.message ||
        "Đã match mã vào phiếu xuất. Chưa xuất tồn kho cho tới khi Post Issue.",
      data: {
        document_id:
          data?.document_id ||
          data?.document?.id ||
          data?.document?.document_id ||
          targetDocumentId,
        line_id: lineId,
        sku_id: data?.sku_id || data?.item?.sku_id,
        item_id: itemId,
        quantity: data?.quantity || data?.qty || request.quantity || 1,
        status: data?.status || data?.document?.status || data?.label_status || "SCANNING",
        mini_app_status: data?.mini_app_status || data?.document?.mini_app_status,
        stock_effect: data?.stock_effect || "NONE",
        movement_created: data?.movement_created ?? false,
        classification: data?.classification || (parsedCode.itemCode ? "ITEM" : undefined),
        raw_code: data?.raw_code || data?.code_value || request.code,
        required_qty: requiredQty,
        scanned_qty: scannedQty,
        remaining_qty: remainingQty,
        progress_percent:
          data?.progress?.progress_percent ||
          data?.progress_percent ||
          data?.document?.progress_percent,
        full_scan: fullScan,
        ready_for_issue:
          Boolean(data?.ready_for_issue) ||
          Boolean(data?.document?.ready_for_issue) ||
          fullScan,
        matched: true,
        product: {
          product_id: data?.item?.product_id,
          product_name: data?.item?.product_name,
          sku_id: data?.sku_id || data?.item?.sku_id,
          sku_code: data?.item?.sku_code || parsedCode.skuCode,
          item_id: itemId,
          item_code: data?.item?.item_code || parsedCode.itemCode || request.code,
          serial_no:
            data?.item?.serial_number || parsedCode.itemCode || request.code,
          raw_code: data?.raw_code || data?.code_value || request.code,
          classification:
            data?.classification || (parsedCode.itemCode ? "ITEM" : undefined),
          stock_status: data?.item?.stock_status,
          object_status: data?.item?.status,
        },
      },
    };
  } catch (error) {
    return failedWmsErrorResponse(
      error,
      "WMS_OUTBOUND_SCAN_ERROR",
      "Không ghi nhận được mã xuất kho trên WMS.",
    );
  }
}

async function traceWmsInventory(request: ScanRequest): Promise<ScanResponse> {
  try {
    const lookup = await resolveInventoryLookupSource(request.code);
    const response = lookup.response;
    if (!response.success) {
      return failedWmsResponse(
        getWmsErrorCode(response),
        response.message || "Không tìm thấy sản phẩm từ mã vừa quét.",
      );
    }

    const data = lookup.data;
    const productData = objectValue(data.product);
    const skuData = objectValue(data.sku);
    const itemData = objectValue(data.item);
    const locationData = objectValue(
      data.current_location || itemData.current_location,
    );
    const productId = firstString(
      data.product_id,
      productData.id,
      productData.product_id,
    );
    const productDetail =
      lookup.productDetail ||
      (productId
        ? await getWmsProductDetail(productId).catch(() => undefined)
        : undefined);
    const specification = objectValue(productDetail?.specification);

    return {
      success: true,
      message: response.message || "Đã truy vết mã trên WMS.",
      data: {
        stock_effect: "NONE",
        movement_created: false,
        raw_code: request.code,
        product: {
          product_id: productId,
          sku_id: firstString(data.sku_id, skuData.id, skuData.sku_id),
          sku_code: firstString(
            data.sku_code,
            skuData.code,
            skuData.sku_code,
            productDetail?.sku_code,
            productDetail?.product_code,
            productDetail?.code,
          ),
          product_name: firstString(
            data.product_name,
            data.name,
            data.sku_name,
            productData.name,
            productData.product_name,
            skuData.name,
            skuData.sku_name,
            productDetail?.product_name,
            productDetail?.sku_name,
            productDetail?.name,
          ),
          description: firstString(
            data.description,
            data.short_description,
            productData.description,
            productData.short_description,
            skuData.description,
            productDetail?.description,
            productDetail?.short_description,
          ),
          purpose: firstString(
            data.purpose,
            data.utility,
            data.application,
            productData.purpose,
            productData.utility,
            productData.application,
            productDetail?.purpose,
            productDetail?.utility,
            productDetail?.application,
          ),
          usage: firstString(
            data.usage,
            data.usage_description,
            data.instructions,
            productData.usage,
            productData.usage_description,
            productData.instructions,
            productDetail?.usage,
            productDetail?.usage_description,
            specification.usage,
          ),
          technical_specifications: formatProductSpecifications(specification),
          brand_name: firstString(
            data.brand_name,
            objectValue(data.brand).name,
            productData.brand_name,
            objectValue(productData.brand).name,
            productDetail?.brand_name,
          ),
          category_name: firstString(
            data.category_name,
            objectValue(data.category).name,
            productData.category_name,
            objectValue(productData.category).name,
            productDetail?.category_name,
          ),
          unit_name: firstString(
            data.unit_name,
            data.unit,
            objectValue(data.unit).name,
            productData.unit_name,
            productDetail?.unit_name,
            productDetail?.unit,
          ),
          model: firstString(data.model, productData.model, productDetail?.model),
          image_url: firstString(
            data.image_url,
            productData.image_url,
            productDetail?.image_url,
          ),
          item_id: firstString(data.item_id, itemData.id, itemData.item_id),
          item_code:
            firstString(
              data.item_code,
              data.item_unique,
              itemData.item_code,
              itemData.item_unique,
            ) || request.code,
          serial_no: firstString(
            data.serial_no,
            data.serial_number,
            data.serial,
            itemData.serial_no,
            itemData.serial_number,
          ),
          warehouse_name: firstString(
            data.warehouse_name,
            locationData.warehouse_name,
          ),
          raw_code: request.code,
          classification: firstString(data.classification),
          stock_status: firstString(data.stock_status, itemData.stock_status),
          object_status: firstString(data.object_status, itemData.status),
          current_location: {
            warehouse_id: firstString(locationData.warehouse_id),
            warehouse_code: firstString(locationData.warehouse_code),
            warehouse_name: firstString(locationData.warehouse_name),
          },
        },
      },
    };
  } catch (error) {
    return failedWmsErrorResponse(
      error,
      "WMS_TRACE_ERROR",
      "Không truy vết được mã trên WMS.",
    );
  }
}

async function resolveInventoryLookupSource(rawCode: string): Promise<{
  response: WmsEnvelope<unknown>;
  data: Record<string, unknown>;
  productDetail?: WmsProductDetail;
}> {
  const parsedCode = parseOutboundCompositeCode(rawCode);
  const candidates = Array.from(
    new Set(
      [rawCode, parsedCode.itemCode, parsedCode.skuCode]
        .map((value) => value?.trim())
        .filter(Boolean) as string[],
    ),
  );
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      const response = await getJson<WmsEnvelope<unknown>>(
        `/api/v1/inventory/trace/${encodeURIComponent(candidate)}`,
        {
          baseUrl: getWmsApiBaseUrl(),
          headers: getWmsAuthHeaders(),
        },
      );

      if (response.success) {
        const data = extractObject<Record<string, unknown>>(response.data) || {};
        const resolvedSkuCode = firstString(
          data.sku_code,
          objectValue(data.sku).sku_code,
          objectValue(data.sku).code,
          parsedCode.skuCode,
        );
        const productDetail = resolvedSkuCode
          ? await findWmsProductBySku(resolvedSkuCode).catch(() => undefined)
          : undefined;
        return { response, data, productDetail };
      }

      lastError = new ApiClientError(
        422,
        response.message || "Không tìm thấy mã tra cứu.",
        getWmsErrorCode(response),
      );
    } catch (error) {
      lastError = error;
    }
  }

  if (parsedCode.skuCode) {
    const productDetail = await findWmsProductBySku(parsedCode.skuCode).catch(
      () => undefined,
    );

    if (productDetail) {
      const data: Record<string, unknown> = {
        product_id: productDetail.product_id || productDetail.id,
        sku_id: productDetail.sku_id || productDetail.id,
        sku_code:
          productDetail.sku_code ||
          productDetail.product_code ||
          productDetail.code ||
          parsedCode.skuCode,
        sku_name:
          productDetail.sku_name ||
          productDetail.product_name ||
          productDetail.name,
        item_code: parsedCode.itemCode,
        classification: parsedCode.itemCode ? "ITEM_CANDIDATE" : "SKU",
        stock_status: parsedCode.itemCode ? "CHƯA ĐĂNG KÝ ITEM" : undefined,
      };

      return {
        response: {
          success: true,
          message: "Đã tìm thấy SKU sản phẩm từ mã QR.",
          data,
        },
        data,
        productDetail,
      };
    }
  }

  throw (
    lastError ||
    new ApiClientError(404, "Không tìm thấy mã tra cứu.", "WMS_TRACE_ERROR")
  );
}

async function findWmsProductBySku(skuCode: string) {
  const query = new URLSearchParams({
    page: "1",
    per_page: "15",
    keyword: skuCode,
  });
  const response = await getJson<WmsEnvelope<unknown>>(
    `/api/v1/products?${query.toString()}`,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );
  const normalizedSku = skuCode.trim().toUpperCase();
  const products = extractCollection<WmsProductDetail>(response.data);

  return products.find((product) =>
    [product.sku_code, product.product_code, product.code]
      .filter(Boolean)
      .some((code) => String(code).trim().toUpperCase() === normalizedSku),
  );
}

function formatProductSpecifications(specification: Record<string, any>) {
  const labels: Record<string, string> = {
    field: "Lĩnh vực",
    power: "Công suất",
    capacity: "Khả năng làm việc",
    weight: "Khối lượng",
    audience: "Đối tượng sử dụng",
    version_code: "Phiên bản",
  };
  const ignored = new Set(["usage", "source"]);
  const lines = Object.entries(specification)
    .filter(([key, value]) => !ignored.has(key) && firstString(value))
    .map(([key, value]) => `${labels[key] || key}: ${firstString(value)}`);

  return lines.length ? lines.join("\n") : undefined;
}

async function submitWmsGenericDocumentScan(
  request: ScanRequest,
  documentId: string | undefined,
  resource: string,
  missingCode: string,
  missingMessage: string,
  scanPath = "scan",
): Promise<ScanResponse> {
  const linkContext = getWmsLinkContext();
  const targetDocumentId = documentId || linkContext.documentId;
  const ifMatch = formatIfMatchHeader(normalizeIfMatch(linkContext.ifMatch));

  if (!targetDocumentId || !ifMatch) {
    return failedWmsResponse(missingCode, missingMessage);
  }

  try {
    const response = await postJson<
      WmsGenericDocumentScanRequest,
      WmsEnvelope<WmsInboundScanData>
    >(
      `/api/v1/${resource}/${targetDocumentId}/${scanPath}`,
      {
        qty: Math.max(1, request.quantity || 1),
        code_value: request.code,
      },
      {
        baseUrl: getWmsApiBaseUrl(),
        headers: {
          ...getWmsAuthHeaders(),
          "If-Match": ifMatch,
          "Idempotency-Key": request.client_scan_id,
        },
      },
    );

    if (!response.success) {
      return failedWmsResponse(
        getWmsErrorCode(response),
        response.message || "WMS không ghi nhận được mã quét.",
      );
    }

    return {
      success: true,
      message: response.message || "Đã ghi nhận mã trên WMS.",
      data: {
        document_id: targetDocumentId,
        stock_effect: response.data?.stock_effect || "NONE",
        movement_created: response.data?.movement_created ?? false,
        raw_code: request.code,
        product: {
          item_code: request.code,
          serial_no: request.code,
          raw_code: request.code,
        },
      },
    };
  } catch (error) {
    return failedWmsErrorResponse(
      error,
      "WMS_SCAN_ERROR",
      "Không ghi nhận được mã trên WMS.",
    );
  }
}

async function submitWmsInboundScan(
  request: ScanRequest,
  documentId?: string,
): Promise<ScanResponse> {
  const linkContext = getWmsLinkContext();
  let resolvedLinkContext = linkContext;
  let inboundDocumentId = documentId || resolvedLinkContext.documentId;
  const wmsBaseUrl = getWmsApiBaseUrl();
  const authHeaders = getWmsAuthHeaders();

  if (!inboundDocumentId || !resolvedLinkContext.warehouseId) {
    const resolved = await resolveWmsContext().catch(() => undefined);
    if (resolved?.context) {
      resolvedLinkContext = resolved.context;
      inboundDocumentId = documentId || resolvedLinkContext.documentId;
    }
  }

  if (!inboundDocumentId) {
    return failedWmsResponse(
      "MISSING_INBOUND_DOCUMENT",
      "Thiếu documentId phiếu nhập. Hãy mở Mini App từ phiếu nhập kho hoặc truyền documentId trên URL.",
    );
  }

  try {
    const documentDetail = await loadWmsInboundDocument(inboundDocumentId);
    const documentData = unwrapEnvelopeData<WmsDocumentData>(documentDetail.data);
    const warehouseId =
      resolvedLinkContext.warehouseId ||
      documentData?.dst_warehouse_id ||
      documentData?.warehouse_id;

    if (!warehouseId) {
      return failedWmsResponse(
        "MISSING_WAREHOUSE",
        "Thiếu warehouseId để phân loại mã quét.",
      );
    }

    const classifyResponse = await postJson<WmsClassifyRequest, WmsEnvelope<WmsClassifyData>>(
      "/api/v1/scan/classify",
      {
        raw_code: request.code,
        context: "INBOUND",
        warehouse_id: warehouseId,
      },
      {
        baseUrl: wmsBaseUrl,
        headers: authHeaders,
      },
    );

    if (!classifyResponse.success || !classifyResponse.data) {
      return failedWmsResponse(
        getWmsErrorCode(classifyResponse),
        classifyResponse.message || "Không phân loại được mã quét.",
      );
    }

    const matchedLine = resolveInboundLine(
      documentData,
      classifyResponse.data,
      resolvedLinkContext.lineId,
    );

    if (!matchedLine?.lineId) {
      return failedWmsResponse(
        "LINE_NOT_MATCHED",
        "Không tìm thấy dòng hàng nhập phù hợp với mã vừa quét.",
        classifyResponse.data,
      );
    }

    const ifMatch = formatIfMatchHeader(
      normalizeIfMatch(resolvedLinkContext.ifMatch) ||
        normalizeIfMatch(documentDetail.headers.get("ETag")) ||
        normalizeIfMatch(documentData?.version),
    );

    if (!ifMatch) {
      return failedWmsResponse(
        "MISSING_IF_MATCH",
        "Không lấy được version/If-Match của phiếu nhập để ghi nhận mã quét.",
        classifyResponse.data,
      );
    }

    const inboundBody: WmsInboundScanRequest = {
      line_id: matchedLine.lineId,
      qty: Math.max(1, request.quantity || 1),
      code_value: classifyResponse.data.raw_code || request.code,
      item_id:
        classifyResponse.data.classification === "ITEM"
          ? classifyResponse.data.item_id || undefined
          : undefined,
      container_id:
        classifyResponse.data.classification === "CONTAINER"
          ? classifyResponse.data.container_id ||
            classifyResponse.data.item_id ||
            undefined
          : undefined,
    };

    const inboundResponse = await postJsonWithMeta<
      WmsInboundScanRequest,
      WmsEnvelope<WmsInboundScanData>
    >(`/api/v1/inbound-documents/${inboundDocumentId}/scan`, inboundBody, {
      baseUrl: wmsBaseUrl,
      headers: {
        ...authHeaders,
        "If-Match": ifMatch,
        "Idempotency-Key": request.client_scan_id,
      },
    });

    if (!inboundResponse.data.success) {
      return failedWmsResponse(
        getWmsErrorCode(inboundResponse.data),
        inboundResponse.data.message || "Không ghi nhận được mã vào phiếu nhập.",
        classifyResponse.data,
      );
    }

    return mapWmsInboundScanResponse(
      request,
      classifyResponse.data,
      unwrapEnvelopeData<WmsInboundScanData>(inboundResponse.data),
      matchedLine,
      inboundResponse.data.message,
    );
  } catch (error) {
    return failedWmsErrorResponse(
      error,
      "WMS_API_ERROR",
      "Không kết nối được backend quản lý kho.",
    );
  }
}

interface WmsClassifyRequest {
  raw_code: string;
  context: WmsScanContext;
  warehouse_id: string;
}

interface WmsInboundScanRequest {
  line_id: string;
  qty: number;
  code_value?: string;
  item_id?: string;
  container_id?: string;
}

interface WmsGenericDocumentScanRequest {
  qty: number;
  code_value: string;
}

async function loadWmsInboundDocument(documentId: string) {
  return getJsonWithMeta<WmsEnvelope<WmsDocumentData>>(
    `/api/v1/inbound-documents/${documentId}`,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );
}

async function loadWmsOutboundDocument(documentId: string) {
  return getJsonWithMeta<WmsEnvelope<WmsDocumentData>>(
    `/api/v1/mini-app/outbound-documents/${documentId}`,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );
}

function parseOutboundCompositeCode(code: string) {
  const skuCode = code.match(/(?:^|\|)SKU=([^|]+)/i)?.[1]?.trim();
  const itemCode = code.match(/(?:^|\|)ITEM=([^|]+)/i)?.[1]?.trim();

  return { skuCode, itemCode };
}

function resolveInboundLine(
  documentData: WmsDocumentData | undefined,
  classifyData: WmsClassifyData,
  preferredLineId?: string,
) {
  const lines = getInboundLines(documentData);

  if (preferredLineId) {
    const preferred = lines.find((line) => getLineId(line) === preferredLineId);
    if (preferred) {
      return {
        lineId: preferredLineId,
        line: preferred,
      };
    }

    return {
      lineId: preferredLineId,
      line: undefined,
    };
  }

  const matched = lines.find((line) => {
    const lineProductId = line.product_id || line.product?.id || line.product?.product_id;
    const lineSkuId = line.sku_id || line.sku?.id || line.sku?.sku_id;
    const matchesProduct =
      classifyData.product_id && lineProductId === classifyData.product_id;
    const matchesSku = classifyData.sku_id && lineSkuId === classifyData.sku_id;

    return (matchesProduct || matchesSku) && !isLineFull(line);
  });

  return {
    lineId: matched ? getLineId(matched) : undefined,
    line: matched,
  };
}

function resolveOutboundLine(
  documentData: WmsDocumentData | undefined,
  classifyData: WmsClassifyData,
) {
  const lines = getInboundLines(documentData);
  const matched = lines.find((line) => {
    const lineProductId = line.product_id || line.product?.id || line.product?.product_id;
    const lineSkuId = line.sku_id || line.sku?.id || line.sku?.sku_id;
    const matchesProduct =
      classifyData.product_id && lineProductId === classifyData.product_id;
    const matchesSku = classifyData.sku_id && lineSkuId === classifyData.sku_id;

    return (matchesProduct || matchesSku) && !isLineFull(line);
  });

  return {
    lineId: matched ? getLineId(matched) : undefined,
    line: matched,
  };
}

function getInboundLines(documentData: WmsDocumentData | undefined) {
  return (
    documentData?.lines ||
    documentData?.document_lines ||
    documentData?.items ||
    []
  );
}

function getLineId(line: WmsDocumentLine) {
  return line.id || line.line_id;
}

function isLineFull(line: WmsDocumentLine) {
  const expected =
    line.qty_planned ||
    line.expected_qty ||
    line.required_quantity ||
    line.quantity ||
    0;
  const scanned = line.scanned_qty || line.scanned_quantity || 0;

  return expected > 0 && scanned >= expected;
}

function unwrapEnvelopeData<TData>(envelope: WmsEnvelope<TData>): TData | undefined {
  return envelope.data;
}

function normalizeIfMatch(value?: number | string | null) {
  if (value === undefined || value === null) return undefined;

  const text = String(value).replace(/"/g, "").trim();
  return text || undefined;
}

function formatIfMatchHeader(value?: string) {
  if (!value) return undefined;
  if (value === "*" || value.startsWith("W/")) return value;
  if (value.startsWith('"') && value.endsWith('"')) return value;
  return `"${value.replace(/"/g, "")}"`;
}

function mapWmsInboundScanResponse(
  request: ScanRequest,
  classifyData: WmsClassifyData,
  inboundData: WmsInboundScanData | undefined,
  matchedLine: { lineId?: string; line?: WmsDocumentLine },
  message?: string,
): ScanResponse {
  const requiredQty =
    inboundData?.required_quantity ||
    inboundData?.expected_qty ||
    matchedLine.line?.qty_planned ||
    matchedLine.line?.expected_qty ||
    matchedLine.line?.required_quantity;
  const scannedQty = inboundData?.scanned_quantity || inboundData?.scanned_qty;
  const quantity = inboundData?.quantity || inboundData?.qty || request.quantity;

  return {
    success: true,
    message:
      message ||
      "Đã phân loại mã và ghi nhận vào phiếu nhập. Chưa tăng tồn kho.",
    data: {
      document_id: inboundData?.document_id,
      line_id: inboundData?.line_id || matchedLine.lineId,
      sku_id: inboundData?.sku_id || classifyData.sku_id || undefined,
      item_id: inboundData?.item_id || classifyData.item_id || undefined,
      quantity,
      status: inboundData?.status || "SCANNING",
      stock_effect: inboundData?.stock_effect || classifyData.stock_effect || "NONE",
      movement_created: inboundData?.movement_created ?? false,
      classification: classifyData.classification,
      raw_code: classifyData.raw_code,
      product: {
        product_id: classifyData.product_id || undefined,
        sku_id: classifyData.sku_id || undefined,
        item_id: classifyData.item_id || undefined,
        container_id: classifyData.container_id || undefined,
        item_code: classifyData.raw_code,
        serial_no: classifyData.raw_code,
        warehouse_name: classifyData.current_location?.warehouse_name,
        raw_code: classifyData.raw_code,
        classification: classifyData.classification,
        stock_status: classifyData.stock_status,
        object_status: classifyData.object_status,
        resolved_source: classifyData.resolved_source,
        current_location: classifyData.current_location,
      },
      required_qty: requiredQty,
      scanned_qty: scannedQty,
      remaining_qty:
        typeof requiredQty === "number" && typeof scannedQty === "number"
          ? Math.max(0, requiredQty - scannedQty)
          : undefined,
      matched: true,
    },
  };
}

function failedWmsResponse(
  errorCode: string,
  message: string,
  classifyData?: WmsClassifyData,
): ScanResponse {
  return {
    success: false,
    message,
    error_code: errorCode,
    data: classifyData
      ? {
          classification: classifyData.classification,
          raw_code: classifyData.raw_code,
          stock_effect: classifyData.stock_effect || "NONE",
          movement_created: false,
          product: {
            product_id: classifyData.product_id || undefined,
            sku_id: classifyData.sku_id || undefined,
            item_id: classifyData.item_id || undefined,
            container_id: classifyData.container_id || undefined,
            item_code: classifyData.raw_code,
            serial_no: classifyData.raw_code,
            warehouse_name: classifyData.current_location?.warehouse_name,
            raw_code: classifyData.raw_code,
            classification: classifyData.classification,
            stock_status: classifyData.stock_status,
            object_status: classifyData.object_status,
            resolved_source: classifyData.resolved_source,
            current_location: classifyData.current_location,
          },
        }
      : undefined,
  };
}

function failedWmsErrorResponse(
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string,
  classifyData?: WmsClassifyData,
): ScanResponse {
  if (error instanceof ApiClientError) {
    return failedWmsResponse(
      error.errorCode || fallbackCode,
      error.userMessage || fallbackMessage,
      classifyData,
    );
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return failedWmsResponse(
      "REQUEST_TIMEOUT",
      "Backend quản lý kho phản hồi quá lâu. Vui lòng thử lại.",
      classifyData,
    );
  }

  if (error instanceof TypeError) {
    return failedWmsResponse(
      "NETWORK_ERROR",
      "Không kết nối được backend quản lý kho.",
      classifyData,
    );
  }

  return failedWmsResponse(
    error instanceof Error ? error.message || fallbackCode : fallbackCode,
    fallbackMessage,
    classifyData,
  );
}

function getWmsErrorCode(envelope: WmsEnvelope) {
  return envelope.error_code || envelope.code || envelope.error || "WMS_API_ERROR";
}

export async function getWarehouseDashboard(
  _zaloUserId?: string,
): Promise<WarehouseDashboardResponse> {
  const inboundResponse = await getJson<WmsEnvelope<unknown>>(
    "/api/v1/inbound-documents?per_page=50",
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );
  const documents = extractCollection<InboundDocumentSummary>(inboundResponse.data);
  const pendingStatuses = new Set([
    "DRAFT",
    "SCANNING",
    "READY_TO_ISSUE",
    "WAITING_APPROVAL",
    "PENDING_APPROVAL",
    "PENDING",
    "SUBMITTED",
  ]);
  const approvedStatuses = new Set(["POSTED", "APPROVED", "COMPLETED"]);
  const staff = getStoredWarehouseStaff();

  return {
    pending_approval_count: documents.filter((document) =>
      pendingStatuses.has(String(document.status || "").toUpperCase()),
    ).length,
    approved_count: documents.filter((document) =>
      approvedStatuses.has(String(document.status || "").toUpperCase()),
    ).length,
    warehouse_staff: {
      name: staff?.name || "Nhân viên kho",
      role: staff?.role || "Warehouse Operator",
      zalo_verified: Boolean(staff?.zalo_verified ?? true),
    },
  };
}

export async function getInboundDocuments(params: {
  status?: string;
  search?: string;
  page?: number;
  perPage?: number;
} = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.page) query.set("page", String(params.page));
  query.set("per_page", String(params.perPage || 20));

  const response = await getJson<WmsEnvelope<unknown>>(
    `/api/v1/inbound-documents?${query.toString()}`,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );

  return extractCollection<InboundDocumentSummary>(response.data);
}

export async function getMiniAppInboundDocuments(params: {
  status?: string;
  search?: string;
  page?: number;
  perPage?: number;
  readyForPost?: boolean;
} = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("keyword", params.search);
  if (params.page) query.set("page", String(params.page));
  if (params.readyForPost) query.set("ready_for_post", "true");
  query.set("per_page", String(params.perPage || 20));

  const response = await getJson<WmsEnvelope<unknown>>(
    `/api/v1/mini-app/inbound-documents?${query.toString()}`,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
      timeoutMs: 25000,
    },
  );

  return extractCollection<InboundDocumentSummary>(response.data);
}

export async function getOutboundDocuments(params: {
  status?: string;
  search?: string;
  page?: number;
  perPage?: number;
  readyForPost?: boolean;
  readyForIssue?: boolean;
} = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("keyword", params.search);
  if (params.page) query.set("page", String(params.page));
  if (params.readyForPost) query.set("ready_for_post", "true");
  if (params.readyForIssue) query.set("ready_for_issue", "true");
  query.set("per_page", String(params.perPage || 20));

  const response = await getJson<WmsEnvelope<unknown>>(
    `/api/v1/mini-app/outbound-documents?${query.toString()}`,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );

  return extractCollection<OutboundDocumentSummary>(response.data);
}

export async function createOutboundDocumentDraft(input: OutboundDraftInput) {
  const idempotencyKey = input.idempotencyKey || generateClientScanId();
  const body: Omit<OutboundDraftInput, "idempotencyKey"> = {
    warehouse_id: input.warehouse_id,
    name: input.name,
    recipient_name: input.recipient_name,
    recipient_address: input.recipient_address,
    recipient_contact_phone: input.recipient_contact_phone,
    note: input.note,
    expected_total_qty: input.expected_total_qty,
  };

  body.lines = input.lines?.length
    ? input.lines
    : [{ required_qty: input.expected_total_qty }];

  const response = await postJsonWithMeta<
    Omit<OutboundDraftInput, "idempotencyKey">,
    WmsEnvelope<OutboundDocumentDetail>
  >(
    "/api/v1/mini-app/outbound-documents",
    body,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: {
        ...getWmsAuthHeaders(),
        "Idempotency-Key": idempotencyKey,
      },
    },
  );

  return {
    document: unwrapEnvelopeData(response.data),
    ifMatch:
      normalizeIfMatch(response.headers.get("ETag")) ||
      normalizeIfMatch(response.data.data?.version),
    idempotencyKey,
  };
}

export async function resolveOutboundCode(input: OutboundResolveCodeInput) {
  const response = await postJson<
    OutboundResolveCodeInput,
    WmsEnvelope<OutboundResolvedCode>
  >("/api/v1/mini-app/outbound/resolve-code", input, {
    baseUrl: getWmsApiBaseUrl(),
    headers: getWmsAuthHeaders(),
  });

  if (!response.success) {
    throw new ApiClientError(
      400,
      response.message || "Không xử lý được mã xuất kho.",
      getWmsErrorCode(response),
    );
  }

  return unwrapEnvelopeData(response);
}

export async function recordOutboundBatch(
  input: OutboundRecordBatchInput,
  idempotencyKey: string,
) {
  const response = await postJsonWithMeta<
    OutboundRecordBatchInput,
    WmsEnvelope<OutboundDocumentDetail>
  >("/api/v1/mini-app/outbound/record", input, {
    baseUrl: getWmsApiBaseUrl(),
    headers: {
      ...getWmsAuthHeaders(),
      "Idempotency-Key": idempotencyKey,
    },
  });

  if (!response.data.success) {
    const errorCode = getWmsErrorCode(response.data);

    throw new ApiClientError(
      response.status || 400,
      response.data.message || "Không ghi nhận được hàng xuất.",
      errorCode,
    );
  }

  return {
    document: unwrapEnvelopeData(response.data),
    ifMatch:
      normalizeIfMatch(response.headers.get("ETag")) ||
      normalizeIfMatch(response.data.data?.version),
  };
}

export async function getOutboundDocumentDetail(documentId: string) {
  const response = await getOutboundDocumentDetailWithMeta(documentId);

  return response.document;
}

export async function getOutboundDocumentDetailWithMeta(documentId: string) {
  const response = await getJsonWithMeta<WmsEnvelope<OutboundDocumentDetail>>(
    `/api/v1/mini-app/outbound-documents/${documentId}`,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );
  const document = unwrapEnvelopeData(response.data);

  return {
    document,
    ifMatch:
      normalizeIfMatch(response.headers.get("ETag")) ||
      normalizeIfMatch(document?.version),
  };
}

export async function getOutboundPackingLabel(documentId: string) {
  const response = await getOutboundPackingLabelWithMeta(documentId);

  return response.label;
}

export async function getOutboundPackingLabelWithMeta(documentId: string) {
  const response = await getJsonWithMeta<WmsEnvelope<OutboundPackingLabel>>(
    `/api/v1/mini-app/outbound-documents/${documentId}/packing-label`,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );
  const label = unwrapEnvelopeData(response.data);

  return {
    label,
    ifMatch:
      normalizeIfMatch(response.headers.get("ETag")) ||
      normalizeIfMatch(label?.version),
  };
}

export async function mutateOutboundPackingLabel({
  documentId,
  labelId,
  action,
  ifMatch,
  idempotencyKey,
  printerConfigId,
}: {
  documentId: string;
  labelId: string;
  action: "preview" | "ready" | "print" | "apply";
  ifMatch?: string | number;
  idempotencyKey?: string;
  printerConfigId?: string;
}) {
  const needsIdempotency = action === "ready" || action === "print";
  const headers: Record<string, string | undefined> = {
    ...getWmsAuthHeaders(),
  };
  const ifMatchHeader = normalizeIfMatch(ifMatch);
  const body =
    action === "print"
      ? { printer_config_id: printerConfigId }
      : {};

  if (action === "print" && !printerConfigId) {
    throw new Error("Chưa có cấu hình máy in để in Packing Label.");
  }

  if (!ifMatchHeader) {
    throw new Error("Chưa có ETag/version để gọi API Packing Label.");
  }

  headers["If-Match"] = ifMatchHeader;
  if (needsIdempotency || idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey || generateClientScanId();
  }

  const response = await postJsonWithMeta<
    typeof body,
    WmsEnvelope<OutboundPackingLabel | OutboundDocumentDetail>
  >(
    `/api/v1/mini-app/outbound-documents/${documentId}/packing-labels/${labelId}/${action}`,
    body,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers,
    },
  );

  return {
    data: unwrapEnvelopeData(response.data),
    ifMatch: normalizeIfMatch(response.headers.get("ETag")),
  };
}

export async function getMiniAppPrinterConfigs() {
  const response = await getJson<WmsEnvelope<unknown>>(
    "/api/v1/mini-app/printer-configs",
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );

  return extractCollection<Record<string, unknown>>(response.data);
}

export async function postIssueOutboundDocument({
  documentId,
  ifMatch,
  idempotencyKey,
}: {
  documentId: string;
  ifMatch?: string | number;
  idempotencyKey?: string;
}) {
  const response = await postJsonWithMeta<
    Record<string, never>,
    WmsEnvelope<OutboundDocumentDetail>
  >(
    `/api/v1/mini-app/outbound-documents/${documentId}/post-issue`,
    {},
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: {
        ...getWmsAuthHeaders(),
        "If-Match": normalizeIfMatch(ifMatch),
        "Idempotency-Key": idempotencyKey || generateClientScanId(),
      },
    },
  );

  const document = unwrapEnvelopeData(response.data);
  markWarehouseDashboardChanged();

  return {
    document,
    ifMatch:
      normalizeIfMatch(response.headers.get("ETag")) ||
      normalizeIfMatch(response.data.data?.version),
  };
}

export async function unmatchOutboundScan({
  documentId,
  matchId,
  ifMatch,
}: {
  documentId: string;
  matchId?: string;
  ifMatch?: string | number;
}) {
  const response = await postJsonWithMeta<Record<string, string | undefined>, WmsEnvelope<unknown>>(
    `/api/v1/mini-app/outbound-documents/${documentId}/unmatch`,
    { match_id: matchId },
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: {
        ...getWmsAuthHeaders(),
        "If-Match": formatIfMatchHeader(normalizeIfMatch(ifMatch)),
      },
    },
  );

  return {
    data: unwrapEnvelopeData(response.data),
    ifMatch: normalizeIfMatch(response.headers.get("ETag")),
  };
}

export async function getWmsProductDetail(productId: string) {
  const response = await getJson<WmsEnvelope<WmsProductDetail>>(
    `/api/v1/products/${productId}`,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );

  return unwrapEnvelopeData(response);
}

export async function getApprovedProducts() {
  const response = await getJson<WmsEnvelope<unknown>>(
    "/api/v1/inventory/balances?per_page=50",
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  ).catch(() => ({ success: true, data: [] }));
  const items = extractCollection<WmsInventoryBalance>(response.data).map(
    (item, index): ApprovedProductItem => ({
      id: normalizeInventoryBalanceId(item, index),
      code: String(item.code || item.item_code || item.sku_code || item.id || index + 1),
      sku_code: item.sku_code,
      product_name: item.product_name,
      item_code: item.item_code,
      serial_no: item.serial_no,
      warehouse_name: item.warehouse_name,
    }),
  );

  return { items };
}

function normalizeInventoryBalanceId(
  item: WmsInventoryBalance,
  index: number,
) {
  const sourceId = item.id ?? item.balance_id;
  const normalizedId = sourceId == null ? "" : String(sourceId).trim();

  return normalizedId || `inventory-balance-${index + 1}`;
}

export async function getWarehouseScanHistory() {
  const response = await getJson<WmsEnvelope<unknown>>(
    "/api/v1/scan/events?per_page=50",
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  ).catch(() => ({ success: true, data: [] }));
  const items = extractCollection<WmsScanEvent>(response.data).map(
    (event, index): ScanHistoryItem => {
      const code = event.raw_code || event.code || event.code_value || "—";
      const status = event.success === false || event.status === "ERROR" ? "ERROR" : "SUCCESS";

      return {
        id: String(event.id || event.event_id || `${code}-${index}`),
        status,
        request: {
          client_scan_id: String(event.id || event.event_id || `${code}-${index}`),
          code,
          quantity: 1,
          scan_method: "SCANNER",
          scan_context: mapWmsContextToScanContext(event.context || event.scan_context),
          scanned_at: event.scanned_at || event.created_at || new Date().toISOString(),
        },
        response: {
          success: status === "SUCCESS",
          message: event.message || "Sự kiện quét từ WMS.",
          data: {
            raw_code: code,
            product: {
              sku_code: event.sku_code,
              product_name: event.product_name,
              item_id: event.item_id,
              serial_no: event.serial_no,
              warehouse_name: event.warehouse_name,
              raw_code: code,
            },
          },
        },
      };
    },
  );

  return { items };
}

export function clearWarehouseScanHistory() {
  return Promise.resolve({
    success: false,
    message: "WMS không hỗ trợ xóa lịch sử quét từ Mini App.",
  });
}

function extractCollection<TItem>(data: unknown): TItem[] {
  if (Array.isArray(data)) return data as TItem[];

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const candidates = [
      record.items,
      record.warehouses,
      record.warehouse,
      record.data,
      record.rows,
      record.results,
      record.collection,
      record.records,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate as TItem[];
      const nested = extractCollection<TItem>(candidate);
      if (nested.length > 0) return nested;
    }

    if (looksLikeCollectionItem(record)) {
      return [record as TItem];
    }
  }

  return [];
}

function looksLikeCollectionItem(record: Record<string, unknown>) {
  return Boolean(
    record.id ||
      record.warehouse_id ||
      record.sku_id ||
      record.product_id ||
      record.document_id ||
      (record.code && record.name),
  );
}

function extractObject<TObject extends Record<string, unknown>>(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const record = data as Record<string, unknown>;
  if (record.user && typeof record.user === "object") return record.user as TObject;
  return record as TObject;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const normalized = stringValue(value);
    if (normalized) return normalized;
  }
  return undefined;
}

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function mapWmsContextToScanContext(context?: string): ScanRequest["scan_context"] {
  const normalized = String(context || "").toUpperCase();
  if (normalized.includes("OUTBOUND")) return "OUTBOUND";
  if (normalized.includes("WARRANTY")) return "WARRANTY_ITEM";
  if (normalized.includes("INVENTORY") || normalized.includes("TRACE")) {
    return "INVENTORY_LOOKUP";
  }
  return "RECEIPT";
}
