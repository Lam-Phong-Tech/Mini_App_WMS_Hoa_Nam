import { getJsonWithMeta } from "@/services/api-client";
import {
  getWmsApiBaseUrl,
  getWmsAuthHeaders,
  getWmsLinkContext,
  mergeWmsLinkContext,
  type WmsLinkContext,
} from "@/services/wms-link-context";
import { isUuid } from "@/utils/isUuid";

interface WmsEnvelope<TData = unknown> {
  success: boolean;
  message?: string;
  data?: TData;
  error_code?: string;
}

interface WmsWarehouse {
  id?: string;
  uuid?: string;
  warehouse_id?: string;
  warehouse_uuid?: string;
  code?: string;
  warehouse_code?: string;
  name?: string;
  warehouse_name?: string;
  status?: string;
}

interface WmsInboundDocument {
  id?: string;
  document_id?: string;
  doc_no?: string;
  document_no?: string;
  status?: string;
  version?: number | string;
  warehouse_id?: string;
  dst_warehouse_id?: string;
  lines?: Array<{
    id?: string;
    line_id?: string;
    product_id?: string;
    sku_id?: string;
    qty_planned?: number;
    scanned_qty?: number;
    scanned_quantity?: number;
  }>;
}

export interface WmsResolvedContext {
  linked: boolean;
  context: WmsLinkContext;
  account?: unknown;
  warehouse?: WmsWarehouse;
  inboundDocument?: WmsInboundDocument;
  source: "url" | "wms" | "none";
  message?: string;
}

export async function resolveWmsContext(): Promise<WmsResolvedContext> {
  const current = getWmsLinkContext();
  const authHeaders = getWmsAuthHeaders();
  const hasLocalDocumentId = isLocalDocumentId(current.documentId);
  const currentDocumentId = hasLocalDocumentId ? undefined : current.documentId;

  if (!authHeaders.Authorization) {
    return {
      linked: Boolean(current.documentId || current.warehouseId),
      context: current,
      source: current.documentId || current.warehouseId ? "url" : "none",
      message: "Chưa có wmsToken để lấy dữ liệu từ WMS.",
    };
  }

  if (!current.documentId && !current.warehouseId) {
    return {
      linked: false,
      context: current,
      source: "none",
      message: "Không có phiếu/kho WMS cần resolve khi mở app.",
    };
  }

  const baseUrl = getWmsApiBaseUrl();
  const [warehouse, inboundDocument] = await Promise.all([
    current.warehouseId && isUuid(current.warehouseId)
      ? Promise.resolve<WmsWarehouse | undefined>(undefined)
      : fetchActiveWarehouse(baseUrl, authHeaders).catch(() => undefined),
    hasLocalDocumentId
      ? Promise.resolve<WmsInboundDocument | undefined>(undefined)
      : currentDocumentId
      ? fetchInboundDocument(baseUrl, authHeaders, currentDocumentId).catch(
          () => undefined,
        )
      : Promise.resolve<WmsInboundDocument | undefined>(undefined),
  ]);

  const resolvedWarehouseId = firstUuid(
    current.warehouseId,
    inboundDocument?.dst_warehouse_id,
    inboundDocument?.warehouse_id,
    warehouse?.id,
    warehouse?.uuid,
    warehouse?.warehouse_id,
    warehouse?.warehouse_uuid,
  );
  const resolvedDocumentId =
    current.documentId || inboundDocument?.id || inboundDocument?.document_id;
  const resolvedIfMatch = current.ifMatch || normalizeIfMatch(inboundDocument?.version);

  const context = mergeWmsLinkContext({
    warehouseId: resolvedWarehouseId,
    documentId: resolvedDocumentId,
    ifMatch: resolvedIfMatch,
  });

  return {
    linked: Boolean(context.warehouseId || context.documentId),
    context,
    warehouse,
    inboundDocument,
    source: current.documentId || current.warehouseId ? "url" : "wms",
  };
}

function isLocalDocumentId(documentId?: string) {
  return String(documentId || "").startsWith("local-");
}

function firstUuid(...values: Array<string | undefined>) {
  return values.find((value) => isUuid(value));
}

async function fetchActiveWarehouse(
  baseUrl: string,
  headers: Record<string, string | undefined>,
) {
  const response = await getJsonWithMeta<WmsEnvelope>(
    "/api/v1/warehouses?status=ACTIVE&per_page=50",
    {
      baseUrl,
      headers,
      timeoutMs: 25000,
    },
  );
  const items = extractCollection<WmsWarehouse>(response.data.data);

  return items.find((item) => item.status === "ACTIVE") || items[0];
}

async function fetchInboundDocument(
  baseUrl: string,
  headers: Record<string, string | undefined>,
  documentId: string,
) {
  const response = await getJsonWithMeta<WmsEnvelope<WmsInboundDocument>>(
    `/api/v1/inbound-documents/${documentId}`,
    {
      baseUrl,
      headers,
    },
  );
  const document = response.data.data;
  const etag = response.headers.get("ETag");

  return {
    ...(document || {}),
    version: normalizeIfMatch(etag) || document?.version,
  };
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

function normalizeIfMatch(value?: number | string | null) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).replace(/"/g, "").trim();
  return text || undefined;
}
