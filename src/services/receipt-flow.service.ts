import {
  ApiClientError,
  getJsonWithMeta,
  patchJsonWithMeta,
  postJsonWithMeta,
} from "@/services/api-client";
import {
  getWmsApiBaseUrl,
  getWmsAuthHeaders,
} from "@/services/wms-link-context";
import { DEFAULT_WAREHOUSE } from "@/constants/default-warehouse";
import type {
  ReceiptScanMethod,
  ReceiptScanUnit,
  ReceiptSession,
} from "@/stores/receipt-session.store";
import { generateClientScanId } from "@/utils/generateClientScanId";
import { markWarehouseDashboardChanged } from "@/services/warehouse-dashboard-cache";

interface WmsEnvelope<TData = unknown> {
  success: boolean;
  message?: string;
  data?: TData;
  error_code?: string;
  code?: string;
  error?: string;
}

export interface ReceiptWarehouseOption {
  id: string;
  code?: string;
  name: string;
}

export interface ReceiptProductOption {
  id: string;
  code: string;
  name: string;
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

interface WmsProduct {
  id?: string;
  sku_id?: string;
  product_id?: string;
  code?: string;
  sku_code?: string;
  product_code?: string;
  name?: string;
  sku_name?: string;
  product_name?: string;
  status?: string;
}

interface WmsDocumentLine {
  id?: string;
  line_id?: string;
  product_id?: string;
  sku_id?: string;
  product_code?: string;
  sku_code?: string;
  qty_planned?: number;
  expected_qty?: number;
  required_quantity?: number;
  scanned_qty?: number;
  scanned_quantity?: number;
  product?: WmsProduct;
  sku?: WmsProduct;
}

interface WmsDocumentData {
  id?: string;
  document_id?: string;
  doc_no?: string;
  document_no?: string;
  source_name?: string;
  source_reference?: string;
  note?: string;
  status?: string;
  mini_app_status?: string;
  ready_for_post?: boolean;
  version?: number | string;
  warehouse_id?: string;
  dst_warehouse_id?: string;
  warehouse_name?: string;
  dst_warehouse?: WmsWarehouse;
  warehouse?: WmsWarehouse;
  lines?: WmsDocumentLine[];
  document_lines?: WmsDocumentLine[];
  items?: WmsDocumentLine[];
  scan_entries?: WmsScanEntry[];
  scans?: WmsScanEntry[];
  required_total?: number;
  scanned_qty?: number;
  scanned_quantity?: number;
}

interface WmsClassifyData {
  raw_code: string;
  classification?: string;
  /**
   * Mini App inbound uses this to distinguish a QR for a new physical item
   * from a physical item that already exists in WMS.
   */
  resolution_status?: string;
  item_id?: string | null;
  container_id?: string | null;
  sku_id?: string | null;
  product_id?: string | null;
  sku_code?: string | null;
  sku_name?: string | null;
  product_name?: string | null;
  name?: string | null;
  item_unique?: string | null;
  serial_number?: string | null;
  normalized_code_value?: string | null;
  stock_status?: string;
  object_status?: string;
  current_location?: {
    warehouse_id?: string;
    warehouse_code?: string;
    warehouse_name?: string;
  };
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
  stock_effect?: "NONE" | string;
  movement_created?: boolean;
  replayed?: boolean;
  sku_code?: string;
  item_unique?: string;
  normalized_code_value?: string;
  resolution_status?: string;
}

interface WmsScanEntry {
  id?: string | number;
  inbound_line_id?: string;
  line_id?: string;
  item_id?: string;
  container_id?: string;
  candidate_item_unique?: string;
  candidate_serial_number?: string;
  quantity?: number;
  scan_source?: string;
  status?: string;
  created_at?: string;
  scanned_at?: string;
  product_id?: string;
  sku_code?: string;
  sku_name?: string;
  product_name?: string;
  name?: string;
  item_code?: string;
  item_name?: string;
  serial_number?: string;
  raw_code?: string;
  code_value?: string;
}

export interface ReceiptCreateInput {
  name: string;
  expectedQty: number;
  initialLineQty?: number;
  warehouseId: string;
  warehouseName?: string;
  product: ReceiptProductOption;
  idempotencyKey: string;
}

export interface ReceiptProcessInput {
  session: ReceiptSession;
  code: string;
  method: ReceiptScanMethod;
}

export interface ReceiptProcessResult {
  item: ReceiptScanUnit;
  receiptSession?: ReceiptSession;
  nextIfMatch?: string;
  backendScannedQty?: number;
}

export interface MiniAppInboundQueueResult {
  sessions: ReceiptSession[];
}

const MINI_APP_INBOUND_PREFIX = "/api/v1/mini-app";
const MINI_APP_INBOUND_DOCUMENTS_ENDPOINT = `${MINI_APP_INBOUND_PREFIX}/inbound-documents`;
const RECEIPT_WAREHOUSE_CACHE_TTL_MS = 5 * 60 * 1000;
let receiptWarehouseCache:
  | {
      loadedAt: number;
      warehouses: ReceiptWarehouseOption[];
    }
  | undefined;
let receiptWarehousesInFlight: Promise<ReceiptWarehouseOption[]> | undefined;

export async function getReceiptWarehouses() {
  if (
    receiptWarehouseCache &&
    Date.now() - receiptWarehouseCache.loadedAt < RECEIPT_WAREHOUSE_CACHE_TTL_MS
  ) {
    return receiptWarehouseCache.warehouses;
  }

  if (receiptWarehousesInFlight) return receiptWarehousesInFlight;

  receiptWarehousesInFlight = fetchReceiptWarehouses().finally(() => {
    receiptWarehousesInFlight = undefined;
  });

  return receiptWarehousesInFlight;
}

async function fetchReceiptWarehouses() {
  const response = await getJsonWithMeta<WmsEnvelope<unknown>>(
    "/api/v1/warehouses?status=ACTIVE&per_page=50",
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
      timeoutMs: 25000,
    },
  );

  const warehouses = extractCollection<WmsWarehouse>(response.data.data)
    .map(mapWarehouseOption)
    .filter(Boolean) as ReceiptWarehouseOption[];

  const sortedWarehouses = sortCanonicalWarehouseFirst(warehouses);
  receiptWarehouseCache = {
    loadedAt: Date.now(),
    warehouses: sortedWarehouses,
  };

  return sortedWarehouses;
}

export async function getReceiptProducts(keyword = "") {
  const query = new URLSearchParams();
  query.set("status", "ACTIVE");
  query.set("per_page", "20");
  if (keyword.trim()) query.set("keyword", keyword.trim());

  const response = await getJsonWithMeta<WmsEnvelope<unknown>>(
    `/api/v1/products?${query.toString()}`,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );

  return extractCollection<WmsProduct>(response.data.data)
    .map(mapProductOption)
    .filter(Boolean) as ReceiptProductOption[];
}

export async function createInboundReceipt(input: ReceiptCreateInput) {
  const warehouse = await resolveCanonicalInboundWarehouse(input.warehouseId);
  const payload = {
    doc_date: localDateString(),
    dst_warehouse_id: warehouse.id,
    source_name: input.name,
    source_reference: input.name,
    note: `Mini App: ${input.name}`,
    lines: [
      {
        product_id: input.product.id,
        qty_planned: input.initialLineQty || input.expectedQty,
      },
    ],
  };

  const response = await postJsonWithMeta<typeof payload, WmsEnvelope<WmsDocumentData>>(
    MINI_APP_INBOUND_DOCUMENTS_ENDPOINT,
    payload,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: {
        ...getWmsAuthHeaders(),
        "Idempotency-Key": input.idempotencyKey,
      },
    },
  );

  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.message || "Không tạo được phiếu nhập.");
  }

  const document = response.data.data;
  const receiptId = getDocumentId(document);

  if (!receiptId) {
    throw new Error("Backend chưa trả receipt_id của phiếu nhập.");
  }

  return {
    session: documentToReceiptSession(document, {
      fallbackName: input.name,
      fallbackExpectedQty: input.expectedQty,
      fallbackWarehouseId: input.warehouseId,
      fallbackWarehouseName: input.warehouseName,
      fallbackProduct: input.product,
      ifMatch: normalizeIfMatch(response.headers.get("ETag")) || "1",
    }),
    document,
  };
}

export async function loadInboundReceiptSession(receiptId: string) {
  const response = await loadMiniAppInboundDocument(receiptId).catch(() =>
    loadInboundDocument(receiptId),
  );
  const document = response.data.data;

  if (!document) {
    throw new Error("Không tìm thấy phiếu nhập.");
  }

  return documentToReceiptSession(document, {
    fallbackName: getDocumentName(document),
    fallbackExpectedQty: getExpectedQty(document),
    ifMatch:
      normalizeIfMatch(response.headers.get("ETag")) ||
      normalizeIfMatch(document.version),
  });
}

export async function processInboundReceiptScan({
  session,
  code,
  method,
}: ReceiptProcessInput): Promise<ReceiptProcessResult> {
  const rawCode = code.trim();
  if (!rawCode) {
    throw userFacingError("Mã không được để trống.");
  }

  if (!session.scanDriven && session.expectedQty > 0 && session.items.length >= session.expectedQty) {
    throw userFacingError("Phiên quét đã đủ số lượng, không thể quét thêm.");
  }

  const duplicateKey = getReceiptPhysicalDuplicateKey(rawCode);
  const exists =
    duplicateKey &&
    session.items.some((item) =>
      [item.code, item.labelId, item.id].some(
        (value) => normalizeKnownReceiptIdentity(value) === duplicateKey,
      ),
    );

  if (exists) {
    throw userFacingError("Mã này đã được quét. Vui lòng quét sản phẩm khác.");
  }

  if (isLocalReceiptSession(session)) {
    const warehouseId = session.warehouseId;

    if (!warehouseId) {
      throw userFacingError("Thiếu kho nhận để ghi nhận mã nhập.");
    }

    const classify = await resolveMiniAppInboundCode(rawCode, warehouseId);
    const composite = parseCompositeProductQr(rawCode);
    const resolvedSkuCode = classify.sku_code || composite?.skuCode;
    const classifiedProduct = resolvedSkuCode
      ? await findReceiptProductByCode(resolvedSkuCode).catch(() => undefined)
      : undefined;
    const productId = classify.product_id || classify.sku_id || classifiedProduct?.id;
    const productName =
      getClassifyProductName(classify) ||
      classifiedProduct?.name ||
      session.productName;
    const isNewItemCandidate = isInboundNewItemCandidate(classify);

    if (!productId && !resolvedSkuCode && !isNewItemCandidate) {
      throw userFacingError("Mã đã đọc được nhưng backend chưa resolve được SKU.");
    }

    const codeValue = buildInboundCodeValue({
      rawCode,
      classify,
      session,
    });
    const scannedAt = new Date().toISOString();
    const itemUnique = composite?.itemUnique || parseCompositeProductQr(codeValue)?.itemUnique;

    return {
      item: {
        id: itemUnique || `${session.receiptId}-${Date.now()}`,
        code: codeValue,
        rawCode,
        labelId: itemUnique || codeValue,
        itemCode: itemUnique || classify.raw_code || rawCode,
        itemName:
          productName ||
          resolvedSkuCode ||
          (isNewItemCandidate
            ? "Sản phẩm mới · sẽ tạo khi ghi nhận"
            : "SKU từ mã quét"),
        skuId: productId,
        skuCode: resolvedSkuCode || classifiedProduct?.code || classify.raw_code || rawCode,
        inboundDate: localDateString(new Date(scannedAt)),
        quantity: 1,
        scanMethod: method,
        scannedAt,
      },
    };
  }

  const documentResponse = await loadMiniAppInboundDocument(session.receiptId).catch(() =>
    loadInboundDocument(session.receiptId),
  );
  const document = documentResponse.data.data;
  const warehouseId =
    session.warehouseId ||
    document?.dst_warehouse_id ||
    document?.warehouse_id;

  if (!document || !warehouseId) {
    throw userFacingError("Thiếu thông tin phiếu/kho để kiểm tra mã.");
  }

  const composite = parseCompositeProductQr(rawCode);
  const compositeProduct = composite
    ? await findReceiptProductByCode(composite.skuCode)
    : undefined;
  const classify = composite
    ? ({
        raw_code: rawCode,
        classification: "SKU",
        sku_id: compositeProduct?.id,
        product_id: compositeProduct?.id,
        sku_code: composite.skuCode,
      } satisfies WmsClassifyData)
    : await classifyInboundCode(rawCode, warehouseId);

  const ifMatch =
    normalizeIfMatch(documentResponse.headers.get("ETag")) ||
    normalizeIfMatch(document.version) ||
    normalizeIfMatch(session.ifMatch);

  if (!ifMatch) {
    throw userFacingError("Không lấy được phiên bản phiếu nhập để ghi nhận mã.");
  }

  const lineContext = await ensureInboundLineReadyForScan({
    receiptId: session.receiptId,
    document,
    classify,
    ifMatch,
  });

  const codeValue = buildInboundCodeValue({
    rawCode,
    classify,
    session,
  });
  const scanBody = {
    line_id: lineContext.lineId,
    qty: 1,
    code_value: codeValue,
    item_id:
      classify.classification === "ITEM" ? classify.item_id || undefined : undefined,
    container_id:
      classify.classification === "CONTAINER"
        ? classify.container_id || classify.item_id || undefined
        : undefined,
  };

  const scanResponse = await postJsonWithMeta<
    typeof scanBody,
    WmsEnvelope<WmsInboundScanData>
  >(`${MINI_APP_INBOUND_DOCUMENTS_ENDPOINT}/${session.receiptId}/scan`, scanBody, {
    baseUrl: getWmsApiBaseUrl(),
    headers: {
      ...getWmsAuthHeaders(),
      "If-Match": lineContext.ifMatch,
      "Idempotency-Key": generateClientScanId(),
    },
  });

  if (!scanResponse.data.success) {
    throw userFacingError(
      scanResponse.data.message || "Backend không ghi nhận được mã vừa quét.",
    );
  }

  const data = scanResponse.data.data;
  const scannedAt = new Date().toISOString();
  const inboundDate = localDateString(new Date());
  const identity =
    classify.container_id ||
    classify.item_id ||
    data?.item_id ||
    data?.item_unique ||
    classify.raw_code ||
    rawCode;
  const product = getLineProduct(lineContext.line);

  return {
    item: {
      id: String(data?.item_id || identity || `${session.receiptId}-${Date.now()}`),
      code: codeValue,
      labelId: identity || undefined,
      itemCode:
        data?.item_unique ||
        classify.raw_code ||
        product?.code ||
        product?.sku_code ||
        session.productCode ||
        rawCode,
      itemName: product?.name || product?.sku_name || session.productName,
      skuId: data?.sku_id || classify.sku_id || lineContext.productId || session.productId,
      skuCode: product?.sku_code || product?.code || session.productCode,
      lineId: data?.line_id || lineContext.lineId,
      inboundDate,
      quantity: 1,
      scanMethod: method,
      scannedAt,
    },
    nextIfMatch:
      normalizeIfMatch(scanResponse.headers.get("ETag")) ||
      lineContext.ifMatch,
    backendScannedQty: data?.scanned_quantity || data?.scanned_qty,
  };
}

export async function loadInboundReceiptItems(receiptId: string) {
  const response = await getJsonWithMeta<WmsEnvelope<unknown>>(
    `${MINI_APP_INBOUND_DOCUMENTS_ENDPOINT}/${receiptId}/scan-entries?status=ACTIVE&per_page=200`,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  ).catch(() =>
    getJsonWithMeta<WmsEnvelope<unknown>>(
      `/api/v1/inbound-documents/${receiptId}/scan-entries?status=ACTIVE&per_page=200`,
      {
        baseUrl: getWmsApiBaseUrl(),
        headers: getWmsAuthHeaders(),
      },
    ),
  );

  return extractCollection<WmsScanEntry>(response.data.data).map(mapScanEntry);
}

export async function getMiniAppInboundApprovalQueue(params: {
  page?: number;
  perPage?: number;
} = {}): Promise<MiniAppInboundQueueResult> {
  const query = new URLSearchParams();
  query.set("status", "WAITING_APPROVAL");
  query.set("per_page", String(params.perPage || 50));
  if (params.page) query.set("page", String(params.page));

  const response = await getJsonWithMeta<WmsEnvelope<unknown>>(
    `${MINI_APP_INBOUND_DOCUMENTS_ENDPOINT}?${query.toString()}`,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );
  const documents = extractCollection<WmsDocumentData>(response.data.data);
  const sessions = documents.map((document) =>
    documentToReceiptSession(document, {
      fallbackName: getDocumentName(document),
      fallbackExpectedQty: getExpectedQty(document),
      fallbackScannedQty: getDocumentScannedQty(document),
      ifMatch: normalizeIfMatch(document.version),
      forcedStatus: "pending_approval",
      items: [],
    }),
  );

  return {
    sessions: sessions.sort((a, b) => getReceiptSortTime(b) - getReceiptSortTime(a)),
  };
}

export async function submitInboundReceiptForApproval(receipt: ReceiptSession | string) {
  const receiptId = typeof receipt === "string" ? receipt : receipt.receiptId;

  if (!receiptId) {
    throw userFacingError("Thiếu mã phiếu nhập để ghi nhận.");
  }

  if (typeof receipt !== "string" && isLocalReceiptSession(receipt)) {
    return submitLocalReceiptToWms(receipt);
  }

  const approved = await approveInboundReceipt(receiptId);

  return {
    ...approved,
    submittedAt: approved.approvedAt,
  };
}

async function submitLocalReceiptToWms(session: ReceiptSession) {
  const items = session.items;

  if (items.length <= 0) {
    throw userFacingError("Chưa quét sản phẩm nào để ghi nhận phiếu nhập.");
  }

  if (!session.warehouseId) {
    throw userFacingError("Thiếu kho nhận để tạo phiếu nhập WMS.");
  }

  const warehouse = await resolveCanonicalInboundWarehouse(session.warehouseId);

  const recorded = await submitLocalReceiptViaMiniAppRecord(session, items, warehouse);

  if (!recorded.data.success || !recorded.data.data) {
    throw userFacingError(recorded.data.message || "Không ghi nhận được phiếu nhập lên backend.");
  }

  const document = extractRecordDocument(recorded.data.data);

  if (!document) {
    throw userFacingError("Backend chưa trả chi tiết phiếu nhập WMS.");
  }

  const receiptId = getDocumentId(document);
  const ifMatch =
    normalizeIfMatch(recorded.headers.get("ETag")) ||
    normalizeIfMatch(document.version) ||
    "1";

  if (!receiptId) {
    throw userFacingError("Backend chưa trả mã phiếu nhập WMS.");
  }

  const submittedAt = new Date().toISOString();
  markWarehouseDashboardChanged();
  const backendItems = extractRecordScanEntries(recorded.data.data, document);
  const submittedItems = backendItems.length > 0 ? backendItems : items;

  return {
    status: "pending_approval" as const,
    stockEffect: "NONE" as const,
    movementCreated: false,
    submittedAt,
    receiptSession: {
      ...session,
      receiptId,
      documentNo: document.doc_no || document.document_no,
      ifMatch,
      status: "pending_approval" as const,
      items: submittedItems,
      submittedAt,
    } satisfies ReceiptSession,
  };
}

async function submitLocalReceiptViaMiniAppRecord(
  session: ReceiptSession,
  items: ReceiptScanUnit[],
  warehouse: ReceiptWarehouseOption,
) {
  const recordPayload = {
    name: session.receiptName,
    dst_warehouse_id: warehouse.id,
    // The live Mini App contract requires this field. It is not an input in
    // the UI: the only authoritative quantity is the number of scanned codes.
    expected_total_qty: items.length,
    doc_date: localDateString(),
    note: `Mini App scan-driven: ${session.receiptName}`,
    items: items.map((item) => ({
      // Gửi mã camera gốc để backend tạo SKU/product/item đúng mã vật lý.
      raw_code: item.rawCode || item.code,
      scan_source:
        item.scanMethod === "manual"
          ? "MANUAL"
          : "CAMERA",
    })),
  };

  const recorded = await postJsonWithMeta<
    typeof recordPayload,
    WmsEnvelope<unknown>
  >(`${MINI_APP_INBOUND_PREFIX}/inbound/record`, recordPayload, {
    baseUrl: getWmsApiBaseUrl(),
    headers: {
      ...getWmsAuthHeaders(),
      "Idempotency-Key": getLocalReceiptRecordIdempotencyKey(session),
    },
    timeoutMs: 30000,
  });

  if (!recorded.data.success) {
    throw userFacingError(
      recorded.data.message || "Không ghi nhận được phiếu nhập lên backend.",
    );
  }

  return recorded;
}

async function submitLocalReceiptViaLegacyWms(
  session: ReceiptSession,
  items: ReceiptScanUnit[],
  warehouse: ReceiptWarehouseOption,
) {
  const groupedLines = groupReceiptItemsByProduct(items);

  if (groupedLines.length === 0) {
    throw userFacingError("Chưa có dòng sản phẩm hợp lệ để tạo phiếu nhập WMS.");
  }

  const createPayload = {
    doc_date: localDateString(),
    dst_warehouse_id: warehouse.id,
    source_name: session.receiptName,
    source_reference: session.receiptName,
    note: `Mini App scan-driven: ${session.receiptName}`,
    lines: groupedLines.map((line) => ({
      ...(line.productId ? { product_id: line.productId } : {}),
      ...(line.skuCode ? { sku_code: line.skuCode } : {}),
      qty_planned: line.quantity,
    })),
  };

  const created = await postJsonWithMeta<
    typeof createPayload,
    WmsEnvelope<WmsDocumentData>
  >("/api/v1/inbound-documents", createPayload, {
    baseUrl: getWmsApiBaseUrl(),
    headers: {
      ...getWmsAuthHeaders(),
      "Idempotency-Key": generateClientScanId(),
    },
  });

  if (!created.data.success || !created.data.data) {
    throw userFacingError(created.data.message || "Không tạo được phiếu nhập WMS.");
  }

  let document = created.data.data;
  const receiptId = getDocumentId(document);
  let ifMatch =
    normalizeIfMatch(created.headers.get("ETag")) ||
    normalizeIfMatch(document.version) ||
    "1";

  if (!receiptId) {
    throw userFacingError("Backend chưa trả mã phiếu nhập WMS.");
  }

  const submittedItems: ReceiptScanUnit[] = [];

  for (const item of items) {
    const itemLabel = getReceiptScanItemLabel(item);

    try {
      const line = resolveInboundLineForReceiptItem(document, item);
      const lineId = line?.id || line?.line_id;

      if (!lineId) {
        throw userFacingError(
          `Không tìm thấy dòng WMS phù hợp cho mã ${itemLabel}.`,
        );
      }

      const scanBody = {
        line_id: lineId,
        qty: 1,
        code_value: item.code,
      };

      const scanResponse = await postJsonWithMeta<
        typeof scanBody,
        WmsEnvelope<WmsInboundScanData>
      >(`/api/v1/inbound-documents/${receiptId}/scan`, scanBody, {
        baseUrl: getWmsApiBaseUrl(),
        headers: {
          ...getWmsAuthHeaders(),
          "If-Match": ifMatch,
          "Idempotency-Key": generateClientScanId(),
        },
      });

      if (!scanResponse.data.success) {
        throw userFacingError(
          scanResponse.data.message ||
            `Backend không ghi nhận được mã ${itemLabel}.`,
        );
      }

      submittedItems.push({
        ...item,
        id: scanResponse.data.data?.item_id || item.id,
        lineId: scanResponse.data.data?.line_id || lineId,
        skuId: scanResponse.data.data?.sku_id || item.skuId,
      });

      const nextIfMatch = normalizeIfMatch(scanResponse.headers.get("ETag"));

      if (nextIfMatch) {
        ifMatch = nextIfMatch;
      } else {
        const latest = await loadInboundDocument(receiptId);
        document = latest.data.data || document;
        ifMatch =
          normalizeIfMatch(latest.headers.get("ETag")) ||
          normalizeIfMatch(document.version) ||
          ifMatch;
      }
    } catch (error) {
      const message = getReceiptErrorMessage(error);
      throw userFacingError(
        `Mã lỗi: ${itemLabel}. ${message}`,
      );
    }
  }

  const posted = await postJsonWithMeta<Record<string, never>, WmsEnvelope<unknown>>(
    `/api/v1/inbound-documents/${receiptId}/post-receipt`,
    {},
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: {
        ...getWmsAuthHeaders(),
        "If-Match": ifMatch,
        "Idempotency-Key": generateClientScanId(),
      },
      timeoutMs: 20000,
    },
  );

  if (!posted.data.success) {
    throw userFacingError(posted.data.message || "Backend không Post Receipt được phiếu nhập.");
  }

  const postedDocument = extractRecordDocument(posted.data.data) || document;
  const postedIfMatch =
    normalizeIfMatch(posted.headers.get("ETag")) ||
    normalizeIfMatch(postedDocument.version) ||
    ifMatch;

  return {
    data: {
      success: true,
      data: {
        document: postedDocument,
        scan_entries: submittedItems,
      },
    },
    headers: new Headers({
      ETag: postedIfMatch,
      "X-Mini-App-Inbound-Fallback": "legacy",
    }),
    status: created.status,
  };
}

export async function approveInboundReceipt(receiptId: string) {
  if (!receiptId) {
    throw userFacingError("Thiếu mã phiếu nhập để duyệt.");
  }

  const documentResponse = await loadMiniAppInboundDocument(receiptId).catch(() =>
    loadInboundDocument(receiptId),
  );
  const document = documentResponse.data.data;
  const ifMatch =
    normalizeIfMatch(documentResponse.headers.get("ETag")) ||
    normalizeIfMatch(document?.version);

  if (!document) {
    throw userFacingError("Không tìm thấy phiếu nhập để duyệt.");
  }

  if (!ifMatch) {
    throw userFacingError("Không lấy được phiên bản phiếu nhập để duyệt.");
  }

  const response = await postJsonWithMeta<Record<string, never>, WmsEnvelope<unknown>>(
    `${MINI_APP_INBOUND_PREFIX}/inbound-documents/${receiptId}/post-receipt`,
    {},
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: {
        ...getWmsAuthHeaders(),
        "If-Match": ifMatch,
        "Idempotency-Key": generateClientScanId(),
      },
      timeoutMs: 20000,
    },
  ).catch((error) => {
    if (shouldFallbackToLegacyInboundRecord(error)) {
      return postJsonWithMeta<Record<string, never>, WmsEnvelope<unknown>>(
        `/api/v1/inbound-documents/${receiptId}/post-receipt`,
        {},
        {
          baseUrl: getWmsApiBaseUrl(),
          headers: {
            ...getWmsAuthHeaders(),
            "If-Match": ifMatch,
            "Idempotency-Key": generateClientScanId(),
          },
          timeoutMs: 20000,
        },
      );
    }

    throw error;
  });

  if (!response.data.success) {
    throw userFacingError(response.data.message || "Backend không duyệt được phiếu nhập.");
  }

  markWarehouseDashboardChanged();

  return {
    status: "approved" as const,
    stockEffect: "RECEIPT_POSTED" as const,
    movementCreated: true,
    approvedAt: new Date().toISOString(),
  };
}

export function getReceiptErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "Phiên đăng nhập WMS đã hết hạn. Vui lòng đăng nhập lại.";
    if (error.status === 403) return "Bạn không có quyền thực hiện nhập kho tại kho này.";
    const businessMessage = formatReceiptBusinessError(error);
    if (businessMessage) return businessMessage;
    const validationMessage = formatValidationErrors(error.payload);
    if (validationMessage) return validationMessage;
    return error.userMessage || "Không xử lý được yêu cầu nhập kho.";
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return "Backend phản hồi quá lâu. Vui lòng thử lại.";
  }

  if (error instanceof TypeError) {
    return "Không kết nối được backend quản lý kho.";
  }

  return error instanceof Error && error.message
    ? error.message
    : "Không xử lý được yêu cầu nhập kho.";
}

function shouldFallbackToLegacyInboundRecord(error: unknown) {
  return (
    error instanceof ApiClientError &&
    (error.status >= 500 || error.errorCode === "INTERNAL_SERVER_ERROR")
  );
}

export function localDateString(date = new Date()) {
  const tzOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

function documentToReceiptSession(
  document: WmsDocumentData,
  fallback: {
    fallbackName?: string;
    fallbackExpectedQty?: number;
    fallbackWarehouseId?: string;
    fallbackWarehouseName?: string;
    fallbackProduct?: ReceiptProductOption;
    fallbackScannedQty?: number;
    ifMatch?: string;
    forcedStatus?: ReceiptSession["status"];
    items?: ReceiptScanUnit[];
  } = {},
): ReceiptSession {
  const receiptId = getDocumentId(document) || "";
  const line = getInboundLines(document)[0];
  const product = fallback.fallbackProduct || mapProductOption(getLineProduct(line));
  const warehouse = mapWarehouseOption(document.dst_warehouse || document.warehouse);

  return {
    receiptId,
    receiptName: fallback.fallbackName || getDocumentName(document),
    documentNo: document.doc_no || document.document_no,
    warehouseId:
      fallback.fallbackWarehouseId ||
      document.dst_warehouse_id ||
      document.warehouse_id ||
      warehouse?.id,
    warehouseName:
      fallback.fallbackWarehouseName ||
      warehouse?.name ||
      document.warehouse_name ||
      document.dst_warehouse_id ||
      document.warehouse_id,
    productId: product?.id || line?.product_id || line?.sku_id,
    productCode: product?.code,
    productName: product?.name,
    expectedQty: fallback.fallbackExpectedQty || getExpectedQty(document),
    scannedQty: fallback.fallbackScannedQty ?? getDocumentScannedQty(document),
    status: fallback.forcedStatus || getMiniAppReceiptStatus(document),
    ifMatch: fallback.ifMatch || normalizeIfMatch(document.version),
    items: fallback.items || [],
    createdAt: documentToDate(document) || new Date().toISOString(),
  };
}

function getDocumentScannedQty(document: WmsDocumentData) {
  const explicit =
    Number(document.scanned_qty) ||
    Number(document.scanned_quantity) ||
    Number((document as WmsDocumentData & { scanned_total_qty?: number }).scanned_total_qty);
  if (explicit > 0) return explicit;

  return getInboundLines(document).reduce(
    (total, line) =>
      total + Number(line.scanned_qty || line.scanned_quantity || 0),
    0,
  );
}

async function loadMiniAppInboundDocument(receiptId: string) {
  return getJsonWithMeta<WmsEnvelope<WmsDocumentData>>(
    `${MINI_APP_INBOUND_DOCUMENTS_ENDPOINT}/${receiptId}`,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );
}

async function loadInboundDocument(receiptId: string) {
  return getJsonWithMeta<WmsEnvelope<WmsDocumentData>>(
    `/api/v1/inbound-documents/${receiptId}`,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );
}

async function resolveMiniAppInboundCode(rawCode: string, warehouseId: string) {
  const response = await postJsonWithMeta<
    { raw_code: string; warehouse_id: string },
    WmsEnvelope<WmsClassifyData>
  >(
    `${MINI_APP_INBOUND_PREFIX}/inbound/resolve-code`,
    {
      raw_code: rawCode,
      warehouse_id: warehouseId,
    },
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );

  if (!response.data.success || !response.data.data) {
    throw userFacingError(
      response.data.message || "Backend không resolve được mã nhập kho.",
    );
  }

  return response.data.data;
}

async function classifyInboundCode(rawCode: string, warehouseId: string) {
  const response = await postJsonWithMeta<
    { raw_code: string; context: "INBOUND"; warehouse_id: string },
    WmsEnvelope<WmsClassifyData>
  >(
    "/api/v1/scan/classify",
    {
      raw_code: rawCode,
      context: "INBOUND",
      warehouse_id: warehouseId,
    },
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );

  if (!response.data.success || !response.data.data) {
    throw userFacingError(response.data.message || "Không phân loại được mã quét.");
  }

  return response.data.data;
}

async function findReceiptProductByCode(skuCode: string) {
  const products = await getReceiptProducts(skuCode);
  const normalized = skuCode.trim().toUpperCase();

  return products.find((product) => product.code.trim().toUpperCase() === normalized);
}

function getClassifyProductName(classify: WmsClassifyData) {
  return (
    stringValue(classify.sku_name) ||
    stringValue(classify.product_name) ||
    stringValue(classify.name)
  );
}

function isInboundNewItemCandidate(classify: WmsClassifyData) {
  const status = String(classify.resolution_status || "").toUpperCase();

  return (
    status === "NEW_ITEM_CANDIDATE" ||
    status === "NEW_SKU_CANDIDATE" ||
    status === "NEW_PRODUCT_CANDIDATE"
  );
}

function resolveInboundLine(
  document: WmsDocumentData,
  classify: WmsClassifyData,
  preferredProductId?: string,
) {
  const lines = getInboundLines(document);
  const matched =
    lines.find((line) => {
      const lineProductId = line.product_id || line.product?.id || line.product?.sku_id;
      const lineSkuId = line.sku_id || line.sku?.id || line.sku?.sku_id;

      return (
        (classify.product_id && lineProductId === classify.product_id) ||
        (classify.sku_id && (lineSkuId === classify.sku_id || lineProductId === classify.sku_id))
      );
    }) ||
    lines.find((line) => {
      const lineProductId = line.product_id || line.sku_id;
      return preferredProductId && lineProductId === preferredProductId;
    }) ||
    lines[0];

  return {
    lineId: matched?.id || matched?.line_id,
    line: matched,
  };
}

function groupReceiptItemsByProduct(items: ReceiptScanUnit[]) {
  const grouped = new Map<
    string,
    {
      productId?: string;
      skuCode?: string;
      quantity: number;
    }
  >();

  for (const item of items) {
    const productId = item.skuId;
    const skuCode =
      item.skuCode ||
      parseCompositeProductQr(item.code)?.skuCode ||
      parseCompositeProductQr(item.labelId)?.skuCode;

    if (!productId && !skuCode) {
      throw userFacingError(
        `Mã ${item.itemCode || item.code} chưa xác định được SKU/product để tạo phiếu.`,
      );
    }

    const groupKey = productId || `sku:${skuCode}`;
    const current = grouped.get(groupKey);

    if (current) {
      current.quantity += 1;
    } else {
      grouped.set(groupKey, {
        productId,
        skuCode,
        quantity: 1,
      });
    }
  }

  return Array.from(grouped.values());
}

function getReceiptScanItemLabel(item: ReceiptScanUnit) {
  return (
    item.itemCode ||
    item.labelId ||
    parseCompositeProductQr(item.code)?.itemUnique ||
    item.code
  );
}

function resolveInboundLineForReceiptItem(
  document: WmsDocumentData,
  item: ReceiptScanUnit,
) {
  const lines = getInboundLines(document);

  return lines.find((line) => {
    const productId = getLineProductId(line);
    const skuId = getLineSkuId(line);

    return Boolean(
      (item.skuId && (productId === item.skuId || skuId === item.skuId)) ||
        (item.skuCode &&
          [
            line.sku_code,
            line.product_code,
            line.product?.sku_code,
            line.product?.code,
            line.sku?.sku_code,
            line.sku?.code,
          ]
            .filter(Boolean)
            .some((code) => normalizeReceiptCode(code) === normalizeReceiptCode(item.skuCode))),
    );
  });
}

async function ensureInboundLineReadyForScan({
  receiptId,
  document,
  classify,
  ifMatch,
}: {
  receiptId: string;
  document: WmsDocumentData;
  classify: WmsClassifyData;
  ifMatch: string;
}) {
  const productId = classify.product_id || classify.sku_id;

  if (!productId) {
    throw userFacingError("Mã đã đọc được nhưng chưa xác định được SKU để thêm vào phiếu.");
  }

  const existing = resolveExactInboundLine(document, classify);
  const existingLine = existing.line;
  const plannedQty = getLinePlannedQty(existingLine);
  const scannedQty = getLineScannedQty(existingLine);
  const hasAnyScanEvidence = getInboundLines(document).some(
    (line) => getLineScannedQty(line) > 0,
  );

  if (existing.lineId && existingLine && plannedQty > scannedQty) {
    return {
      lineId: existing.lineId,
      line: existingLine,
      ifMatch,
      productId,
    };
  }

  if (!existing.lineId && hasAnyScanEvidence) {
    throw userFacingError(
      "Phiếu WMS đã có mã quét nên không thể thêm SKU mới. Với phiếu nhiều SKU, hãy quét bằng phiếu tạm Mini App rồi bấm Xác nhận ghi nhận.",
    );
  }

  const nextLines = buildPatchLines(document, {
    productId,
    lineId: existing.lineId,
    nextQty: existingLine ? Math.max(plannedQty + 1, scannedQty + 1, 1) : 1,
  });

  const patched = await patchInboundDocument(receiptId, ifMatch, {
    source_name: document.source_name,
    source_reference: document.source_reference,
    note: document.note,
    lines: nextLines,
  });
  const patchedDocument = patched.data.data;

  if (!patchedDocument) {
    throw userFacingError("Backend chưa trả lại phiếu sau khi cập nhật dòng SKU.");
  }

  const patchedLine = resolveExactInboundLine(patchedDocument, classify);

  if (!patchedLine.lineId || !patchedLine.line) {
    throw userFacingError("Không tạo được dòng hàng nhập phù hợp với mã vừa quét.");
  }

  return {
    lineId: patchedLine.lineId,
    line: patchedLine.line,
    ifMatch:
      normalizeIfMatch(patched.headers.get("ETag")) ||
      normalizeIfMatch(patchedDocument.version) ||
      ifMatch,
    productId,
  };
}

async function patchInboundDocument(
  receiptId: string,
  ifMatch: string,
  payload: Partial<WmsDocumentData> & {
    lines: Array<{
      id?: string;
      product_id: string;
      qty_planned: number;
      note?: string;
    }>;
  },
) {
  return patchJsonWithMeta<typeof payload, WmsEnvelope<WmsDocumentData>>(
    `/api/v1/inbound-documents/${receiptId}`,
    payload,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: {
        ...getWmsAuthHeaders(),
        "If-Match": ifMatch,
      },
    },
  );
}

function resolveExactInboundLine(
  document: WmsDocumentData,
  classify: WmsClassifyData,
) {
  const lines = getInboundLines(document);
  const matched = lines.find((line) => lineMatchesClassify(line, classify));

  return {
    lineId: matched?.id || matched?.line_id,
    line: matched,
  };
}

function lineMatchesClassify(line: WmsDocumentLine, classify: WmsClassifyData) {
  const lineProductId = getLineProductId(line);
  const lineSkuId = getLineSkuId(line);

  return Boolean(
    (classify.product_id && lineProductId === classify.product_id) ||
      (classify.sku_id &&
        (lineSkuId === classify.sku_id || lineProductId === classify.sku_id)),
  );
}

function buildPatchLines(
  document: WmsDocumentData,
  patch: {
    productId: string;
    lineId?: string;
    nextQty: number;
  },
) {
  const lines: Array<{
    id?: string;
    product_id: string;
    qty_planned: number;
  }> = getInboundLines(document).map((line) => {
    const lineId = line.id || line.line_id;
    const lineProductId = getLineProductId(line);

    return {
      id: lineId,
      product_id: lineProductId || patch.productId,
      qty_planned:
        lineId && patch.lineId && lineId === patch.lineId
          ? patch.nextQty
          : Math.max(getLinePlannedQty(line), getLineScannedQty(line), 1),
    };
  });

  if (!patch.lineId) {
    lines.push({
      product_id: patch.productId,
      qty_planned: patch.nextQty,
    });
  }

  return lines;
}

function getLineProductId(line?: WmsDocumentLine) {
  return line?.product_id || line?.product?.id || line?.product?.product_id || line?.sku_id;
}

function getLineSkuId(line?: WmsDocumentLine) {
  return line?.sku_id || line?.sku?.id || line?.sku?.sku_id;
}

function getLinePlannedQty(line?: WmsDocumentLine) {
  return Number(
    line?.qty_planned || line?.expected_qty || line?.required_quantity || 0,
  );
}

function getLineScannedQty(line?: WmsDocumentLine) {
  return Number(line?.scanned_qty || line?.scanned_quantity || 0);
}

function mapScanEntry(entry: WmsScanEntry): ReceiptScanUnit {
  const code =
    entry.raw_code ||
    entry.code_value ||
    entry.candidate_item_unique ||
    entry.item_code ||
    entry.serial_number ||
    entry.candidate_serial_number ||
    String(entry.item_id || entry.container_id || entry.id || "");
  const scannedAt = entry.scanned_at || entry.created_at || new Date().toISOString();

  return {
    id: String(entry.id || code || scannedAt),
    code,
    rawCode: entry.raw_code || entry.code_value || code,
    labelId:
      entry.candidate_item_unique ||
      entry.container_id ||
      entry.item_id ||
      undefined,
    itemCode: entry.item_code || entry.sku_code || code,
    itemName: entry.item_name || entry.sku_name || entry.product_name || entry.name,
    skuId: entry.product_id,
    skuCode: entry.sku_code,
    lineId: entry.inbound_line_id || entry.line_id,
    inboundDate: localDateString(new Date(scannedAt)),
    quantity: 1,
    scanMethod:
      String(entry.scan_source || "").toUpperCase() === "MANUAL"
        ? "manual"
        : "camera",
    scannedAt,
  };
}

function mapWarehouseOption(
  warehouse?: WmsWarehouse,
): ReceiptWarehouseOption | undefined {
  if (!warehouse) return undefined;
  const id = warehouse.id || warehouse.uuid || warehouse.warehouse_id || warehouse.warehouse_uuid;
  if (!id) return undefined;

  return {
    id,
    code: warehouse.code || warehouse.warehouse_code,
    name:
      warehouse.name ||
      warehouse.warehouse_name ||
      warehouse.code ||
      warehouse.warehouse_code ||
      id,
  };
}

async function resolveCanonicalInboundWarehouse(currentWarehouseId?: string) {
  const warehouses = await getReceiptWarehouses().catch(() => [DEFAULT_WAREHOUSE]);
  const canonical =
    warehouses.find(isCanonicalInboundWarehouse) ||
    warehouses.find((warehouse) => warehouse.id === DEFAULT_WAREHOUSE.id) ||
    DEFAULT_WAREHOUSE;

  if (!currentWarehouseId || !isCanonicalInboundWarehouseId(currentWarehouseId)) {
    return canonical;
  }

  return (
    warehouses.find((warehouse) => warehouse.id === currentWarehouseId) ||
    canonical
  );
}

function sortCanonicalWarehouseFirst(warehouses: ReceiptWarehouseOption[]) {
  const uniqueWarehouses = dedupeWarehouses(
    warehouses.length > 0 ? warehouses : [DEFAULT_WAREHOUSE],
  );

  return [...uniqueWarehouses].sort((left, right) => {
    if (isCanonicalInboundWarehouse(left)) return -1;
    if (isCanonicalInboundWarehouse(right)) return 1;
    return 0;
  });
}

function dedupeWarehouses(warehouses: ReceiptWarehouseOption[]) {
  const seen = new Set<string>();

  return warehouses.filter((warehouse) => {
    const key = warehouse.id || warehouse.code || warehouse.name;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isCanonicalInboundWarehouse(warehouse?: ReceiptWarehouseOption) {
  return (
    warehouse?.code === DEFAULT_WAREHOUSE.code ||
    warehouse?.id === DEFAULT_WAREHOUSE.id
  );
}

function isCanonicalInboundWarehouseId(warehouseId?: string) {
  return warehouseId === DEFAULT_WAREHOUSE.id;
}

function mapProductOption(product?: WmsProduct): ReceiptProductOption | undefined {
  if (!product) return undefined;
  const id = product.sku_id || product.product_id || product.id;
  if (!id) return undefined;

  return {
    id,
    code: product.sku_code || product.product_code || product.code || id,
    name: product.sku_name || product.product_name || product.name || "SKU WMS",
  };
}

function getDocumentId(document: WmsDocumentData) {
  return document.id || document.document_id;
}

function getDocumentName(document: WmsDocumentData) {
  return (
    document.source_reference ||
    document.source_name ||
    document.note ||
    document.doc_no ||
    document.document_no ||
    "Phiếu nhập"
  );
}

function getExpectedQty(document: WmsDocumentData) {
  const explicit =
    Number(document.required_total) ||
    Number(document.scanned_qty) ||
    Number(document.scanned_quantity);
  if (explicit > 0) return explicit;

  return getInboundLines(document).reduce((total, line) => {
    return (
      total +
      Number(
        line.qty_planned ||
          line.expected_qty ||
          line.required_quantity ||
          0,
      )
    );
  }, 0);
}

function getMiniAppReceiptStatus(document: WmsDocumentData): ReceiptSession["status"] {
  const miniStatus = String(document.mini_app_status || "").toUpperCase();
  const status = String(document.status || "").toUpperCase();

  if (status === "POSTED") return "approved";
  if (miniStatus === "WAITING_APPROVAL" || document.ready_for_post) {
    return "pending_approval";
  }
  if (status === "SCANNING") return "review";
  return "draft";
}

function extractDocumentScanEntries(document?: WmsDocumentData) {
  return [
    ...(document?.scan_entries || []),
    ...(document?.scans || []),
  ];
}

function extractRecordDocument(data: unknown): WmsDocumentData | undefined {
  if (!data || typeof data !== "object") return undefined;

  const record = data as Record<string, unknown>;
  const nested =
    record.document ||
    record.inbound_document ||
    record.receipt ||
    record.data;

  if (nested && typeof nested === "object" && getDocumentId(nested as WmsDocumentData)) {
    return nested as WmsDocumentData;
  }

  if (getDocumentId(data as WmsDocumentData)) return data as WmsDocumentData;
  return undefined;
}

function extractRecordScanEntries(data: unknown, document: WmsDocumentData) {
  const record = data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : undefined;
  const directEntries = [
    ...(Array.isArray(record?.scan_entries)
      ? (record.scan_entries as WmsScanEntry[])
      : []),
    ...(Array.isArray(record?.scans) ? (record.scans as WmsScanEntry[]) : []),
  ];
  const documentEntries = extractDocumentScanEntries(document);

  return (directEntries.length > 0 ? directEntries : documentEntries).map(mapScanEntry);
}

function documentToDate(document?: WmsDocumentData) {
  const record = document as
    | (WmsDocumentData & {
        created_at?: string;
        updated_at?: string;
        submitted_at?: string;
        posted_at?: string;
      })
    | undefined;

  return (
    record?.posted_at ||
    record?.submitted_at ||
    record?.updated_at ||
    record?.created_at
  );
}

function getReceiptSortTime(session: ReceiptSession) {
  const value =
    session.approvedAt ||
    session.submittedAt ||
    session.items.at(-1)?.scannedAt ||
    session.createdAt;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getInboundLines(document?: WmsDocumentData) {
  return document?.lines || document?.document_lines || document?.items || [];
}

function getLineProduct(line?: WmsDocumentLine): WmsProduct | undefined {
  if (!line) return undefined;
  return (
    line.product ||
    line.sku || {
      sku_id: line.sku_id || line.product_id,
      sku_code: line.sku_code || line.product_code || line.sku_id || line.product_id,
      sku_name: line.sku_code || line.product_code || line.sku_id || line.product_id,
    }
  );
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

function normalizeReceiptCode(value?: string) {
  return String(value || "").trim().toUpperCase();
}

function normalizeKnownReceiptIdentity(value?: string) {
  const physicalKey = getReceiptPhysicalDuplicateKey(value);
  return physicalKey || normalizeReceiptCode(value);
}

function getReceiptPhysicalDuplicateKey(value?: string) {
  const raw = String(value || "").trim();
  const compositeItem = raw.match(/^HN\d+\|.*(?:^|\|)ITEM=([^|]+)/i)?.[1];
  if (compositeItem) return normalizeReceiptCode(compositeItem);

  // Mã SKU/barcode thường được phép quét lặp theo số lượng nhập.
  if (!raw || /^[A-Z0-9]+(?:[-_][A-Z0-9]+)*$/i.test(raw)) return undefined;

  return normalizeReceiptCode(raw);
}

function buildInboundCodeValue({
  rawCode,
  classify,
  session,
}: {
  rawCode: string;
  classify: WmsClassifyData;
  session: ReceiptSession;
}) {
  const source = classify.raw_code || rawCode;
  if (looksCompositeProductQr(source)) return source;

  if (String(classify.classification || "").toUpperCase() !== "SKU") {
    return source;
  }

  const skuCode = classify.sku_code || classify.raw_code || session.productCode || rawCode;
  const sequence = session.items.length + 1;
  const receiptPart = session.receiptId.replace(/[^a-zA-Z0-9]/g, "").slice(-12);
  const itemUnique = `${skuCode}-${receiptPart}-${String(sequence).padStart(3, "0")}`
    .toUpperCase()
    .slice(0, 100);

  return `HN1|SKU=${skuCode}|ITEM=${itemUnique}`;
}

function looksCompositeProductQr(value?: string) {
  return /^HN\d+\|/i.test(String(value || "").trim());
}

function parseCompositeProductQr(value?: string) {
  const raw = String(value || "").trim();
  if (!looksCompositeProductQr(raw)) return undefined;

  const segments = raw.toUpperCase().split("|");
  const fields = new Map<string, string>();

  for (const segment of segments.slice(1)) {
    const [key, ...rest] = segment.split("=");
    const fieldValue = rest.join("=").trim();
    if (key && fieldValue) fields.set(key.trim(), fieldValue);
  }

  const skuCode = fields.get("SKU");
  const itemUnique = fields.get("ITEM");
  if (!skuCode || !itemUnique) return undefined;

  return {
    skuCode,
    itemUnique,
  };
}

function isLocalReceiptSession(session: ReceiptSession) {
  return session.receiptId.startsWith("local-") || !session.productId;
}

function getLocalReceiptRecordIdempotencyKey(session: ReceiptSession) {
  const stableId = session.receiptId.replace(/^local-/, "").trim();
  const key = stableId || generateClientScanId();

  return `inbound-record-${key}`.slice(0, 100);
}

function userFacingError(message: string) {
  return new Error(message);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function formatReceiptBusinessError(error: ApiClientError) {
  switch (error.errorCode) {
    case "SKU_NOT_FOUND": {
      const skuCode = getReceiptErrorDetail(error, "sku_code");
      return skuCode
        ? `SKU ${skuCode} chưa có trong master data. Backend đang chưa hỗ trợ tự tạo SKU từ QR nhập kho; chưa thể ghi nhận mã này.`
        : "SKU trong QR chưa có trong master data. Backend đang chưa hỗ trợ tự tạo SKU từ QR nhập kho; chưa thể ghi nhận mã này.";
    }
    case "ITEM_ALREADY_RECEIVING":
      return "Mã này đang nằm trong một phiếu nhập chưa duyệt/Post khác. Hãy xoá mã đó khỏi phiếu cũ hoặc quét mã khác.";
    case "DUPLICATE_ITEM_IN_BATCH":
      return "Có mã bị quét trùng trong phiếu hiện tại. Vuốt trái SKU/mã bị trùng để xoá rồi quét lại.";
    case "PHYSICAL_CODE_NOT_FOUND":
      return "Mã QR/Barcode chưa được backend nhận diện. Kiểm tra lại mã hoặc chọn mã khác.";
    case "ITEM_ALREADY_REGISTERED":
      return "Mã máy này đã được đăng ký trong hệ thống, không thể ghi nhận như hàng nhập mới.";
    case "INBOUND_WAREHOUSE_NOT_CANONICAL":
      return "Kho nhận không đúng Kho tổng Hoa Nam đang ACTIVE. Tải lại màn tạo phiếu rồi thử lại.";
    case "VALIDATION_ERROR":
    case "BUSINESS_RULE_ERROR":
      return undefined;
    default:
      return undefined;
  }
}

function getReceiptErrorDetail(error: ApiClientError, field: string) {
  const errorDetails = error.payload?.error as Record<string, unknown> | undefined;
  const sources = [error.payload?.errors, errorDetails?.details];

  for (const source of sources) {
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    const value = (source as Record<string, unknown>)[field];
    if (Array.isArray(value)) {
      const first = value.map((item) => stringValue(item)).find(Boolean);
      if (first) return first;
    }

    const normalized = stringValue(value);
    if (normalized) return normalized;
  }

  return undefined;
}

function formatValidationErrors(payload?: Record<string, unknown>) {
  const errors =
    payload?.errors ||
    (payload?.error as Record<string, unknown> | undefined)?.details;
  if (!errors || typeof errors !== "object") return undefined;

  if (Array.isArray(errors)) {
    const messages = errors.map((message) => String(message)).filter(Boolean);
    return messages.length > 0 ? messages.join(" ") : undefined;
  }

  const messages = Object.entries(errors as Record<string, unknown>)
    .flatMap(([field, value]) => {
      if (Array.isArray(value)) return value.map((message) => String(message));
      if (typeof value === "string") return [value];
      return [`${field}: dữ liệu không hợp lệ.`];
    })
    .filter(Boolean);

  return messages.length > 0 ? messages.join(" ") : undefined;
}
