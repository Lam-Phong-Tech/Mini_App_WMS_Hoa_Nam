import {
  ApiClientError,
  deleteJson,
  getBlobWithMeta,
  getJsonWithMeta,
  postFormDataWithMeta,
  postJsonWithMeta,
} from "@/services/api-client";
import {
  getWmsApiBaseUrl,
  getWmsAuthHeaders,
} from "@/services/wms-link-context";
import { generateClientScanId } from "@/utils/generateClientScanId";

interface WmsEnvelope<TData = unknown> {
  success: boolean;
  message?: string;
  data?: TData;
  error_code?: string;
  code?: string;
  error?: string | { code?: string; details?: unknown };
  meta?: {
    request_id?: string;
    timestamp?: string;
  };
}

export type WarrantyEligibilityCode =
  | "ELIGIBLE"
  | "ITEM_NOT_FOUND"
  | "ITEM_NOT_ISSUED"
  | "ACTIVE_WARRANTY_EXISTS"
  | string;

export type WarrantyRecommendedFlow = "IDENTIFIED" | "TEMP_ONLY" | string;

export type WarrantyCaseStatus =
  | "RECEIVED"
  | "CHECKING"
  | "REPAIRING"
  | "COMPLETED"
  | "RETURNED"
  | "CANCELLED"
  | string;

export interface WarrantyResolveResult {
  raw_code: string;
  item_code?: string;
  item_id?: string;
  sku_id?: string;
  sku_code?: string;
  sku_name?: string;
  product_id?: string;
  product_name?: string;
  serial_number?: string;
  resolved: boolean;
  eligible_for_warranty: boolean;
  eligibility_code: WarrantyEligibilityCode;
  recommended_flow: WarrantyRecommendedFlow;
  stock_effect?: "NONE" | string;
  wms_case_created?: boolean;
  message?: string;
}

export interface WarrantyCaseInput {
  item_code?: string;
  customer_name: string;
  customer_phone: string;
  customer_address?: string;
  description: string;
  defect_ids?: string[];
  accessories_received?: string;
  received_condition?: string;
  missing_code_reason?: string;
  manual_product_description?: string;
}

export interface WarrantyDefectOption {
  defect_id: string;
  defect_code?: string;
  defect_name: string;
  description?: string;
  status?: string;
}

export interface WarrantyCaseSummary {
  id: string;
  case_no?: string;
  status?: WarrantyCaseStatus;
  item_code?: string;
  sku_code?: string;
  product_name?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  description?: string;
  reported_defect?: string;
  missing_code_reason?: string;
  manual_product_description?: string;
  received_condition?: string;
  accessories_received?: string;
  created_at?: string;
  updated_at?: string;
  version?: string | number;
  pii_masked?: boolean;
}

export interface WarrantyCaseListResult {
  cases: WarrantyCaseSummary[];
}

export interface WarrantyEvent {
  id?: string | number;
  event_type?: string;
  status?: string;
  message?: string;
  note?: string;
  created_at?: string;
  actor_name?: string;
}

export interface WarrantyAttachment {
  id: string;
  warranty_case_id?: string;
  file_name?: string;
  name?: string;
  mime_type?: string;
  content_type?: string;
  size?: number;
  file_size_bytes?: number;
  checksum?: string;
  attachment_type?: WarrantyAttachmentType;
  media_kind?: "IMAGE" | "VIDEO" | string;
  duration_seconds?: number;
  status?: string;
  created_at?: string;
}

export type WarrantyAttachmentType =
  | "INTAKE"
  | "DIAGNOSTIC"
  | "RETURN"
  | "OTHER";

const WARRANTY_ATTACHMENT_TYPES = new Set<WarrantyAttachmentType>([
  "INTAKE",
  "DIAGNOSTIC",
  "RETURN",
  "OTHER",
]);

const MINI_APP_WARRANTY_PREFIX = "/api/v1/mini-app";

export async function resolveWarrantyCode(rawCode: string) {
  const code = rawCode.trim();

  if (!code) {
    throw userFacingError("Vui lòng nhập hoặc quét mã sản phẩm bảo hành.");
  }

  const response = await postJsonWithMeta<
    { raw_code: string },
    WmsEnvelope<unknown>
  >(
    `${MINI_APP_WARRANTY_PREFIX}/warranty/resolve-code`,
    { raw_code: code },
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );

  if (!response.data.success) {
    throw userFacingError(
      response.data.message || "Backend không resolve được mã bảo hành.",
    );
  }

  return mapWarrantyResolve(response.data.data, code, response.data.message);
}

export async function createWarrantyCase(input: WarrantyCaseInput) {
  const payload = normalizeWarrantyCasePayload(input);

  const response = await postJsonWithMeta<
    typeof payload,
    WmsEnvelope<unknown>
  >(`${MINI_APP_WARRANTY_PREFIX}/warranty-cases`, payload, {
    baseUrl: getWmsApiBaseUrl(),
    headers: {
      ...getWmsAuthHeaders(),
      "Idempotency-Key": generateClientScanId(),
    },
  });

  if (!response.data.success || !response.data.data) {
    throw userFacingError(
      response.data.message || "Không tạo được hồ sơ bảo hành.",
    );
  }

  const warrantyCase = mapWarrantyCase(extractWarrantyCase(response.data.data));

  if (!warrantyCase?.id) {
    throw userFacingError("Backend chưa trả mã hồ sơ bảo hành.");
  }

  return {
    case: warrantyCase,
    ifMatch:
      normalizeIfMatch(response.headers.get("ETag")) ||
      normalizeIfMatch(warrantyCase.version),
  };
}

export async function getWarrantyCases(status: WarrantyCaseStatus = "RECEIVED") {
  const query = new URLSearchParams();
  query.set("status", status);
  query.set("per_page", "25");

  const response = await getJsonWithMeta<WmsEnvelope<unknown>>(
    `${MINI_APP_WARRANTY_PREFIX}/warranty-cases?${query.toString()}`,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );

  return {
    cases: extractCollection(response.data.data)
      .map(mapWarrantyCase)
      .filter(Boolean) as WarrantyCaseSummary[],
  } satisfies WarrantyCaseListResult;
}

export async function getActiveWarrantyDefects(keyword = "") {
  const query = new URLSearchParams({
    status: "ACTIVE",
    page: "1",
    per_page: "100",
  });

  if (keyword.trim()) query.set("keyword", keyword.trim());

  const response = await getJsonWithMeta<WmsEnvelope<unknown>>(
    `/api/v1/defects?${query.toString()}`,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );

  if (!response.data.success) {
    throw userFacingError(
      response.data.message || "Không tải được danh mục bệnh/lỗi.",
    );
  }

  return extractCollection(response.data.data)
    .map(mapWarrantyDefect)
    .filter(Boolean) as WarrantyDefectOption[];
}

export async function getWarrantyCaseDetail(caseId: string) {
  const response = await getJsonWithMeta<WmsEnvelope<unknown>>(
    `${MINI_APP_WARRANTY_PREFIX}/warranty-cases/${encodeURIComponent(caseId)}`,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );
  const warrantyCase = mapWarrantyCase(extractWarrantyCase(response.data.data));

  if (!warrantyCase?.id) {
    throw userFacingError("Không tìm thấy hồ sơ bảo hành.");
  }

  return {
    case: warrantyCase,
    ifMatch:
      normalizeIfMatch(response.headers.get("ETag")) ||
      normalizeIfMatch(warrantyCase.version),
  };
}

export async function updateWarrantyCaseStatus({
  caseId,
  status,
  ifMatch,
  note,
  confirmedDefect,
}: {
  caseId: string;
  status: WarrantyCaseStatus;
  ifMatch?: string;
  note?: string;
  confirmedDefect?: string;
}) {
  const payload = {
    status,
    note: note?.trim() || undefined,
    confirmed_defect: confirmedDefect?.trim() || undefined,
  };

  const response = await postJsonWithMeta<
    typeof payload,
    WmsEnvelope<unknown>
  >(
    `${MINI_APP_WARRANTY_PREFIX}/warranty-cases/${encodeURIComponent(
      caseId,
    )}/status`,
    payload,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: {
        ...getWmsAuthHeaders(),
        "If-Match": ifMatch,
        "Idempotency-Key": generateClientScanId(),
      },
    },
  );

  if (!response.data.success) {
    throw userFacingError(
      response.data.message || "Không chuyển được trạng thái bảo hành.",
    );
  }

  const warrantyCase = mapWarrantyCase(extractWarrantyCase(response.data.data));

  return {
    case: warrantyCase,
    ifMatch:
      normalizeIfMatch(response.headers.get("ETag")) ||
      normalizeIfMatch(warrantyCase?.version),
  };
}

export async function getWarrantyCaseEvents(caseId: string) {
  const response = await getJsonWithMeta<WmsEnvelope<unknown>>(
    `${MINI_APP_WARRANTY_PREFIX}/warranty-cases/${encodeURIComponent(
      caseId,
    )}/events`,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );

  return extractCollection(response.data.data) as WarrantyEvent[];
}

export async function getWarrantyCaseAttachments(caseId: string) {
  const response = await getJsonWithMeta<WmsEnvelope<unknown>>(
    `${MINI_APP_WARRANTY_PREFIX}/warranty-cases/${encodeURIComponent(
      caseId,
    )}/attachments`,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );

  return extractCollection(response.data.data)
    .map(mapWarrantyAttachment)
    .filter(Boolean) as WarrantyAttachment[];
}

export async function uploadWarrantyCaseAttachment({
  caseId,
  file,
  attachmentType = "INTAKE",
}: {
  caseId: string;
  file: File;
  attachmentType?: WarrantyAttachmentType;
}) {
  const payload = new FormData();
  payload.append("file", file, file.name);
  payload.append("attachment_type", attachmentType);

  const response = await postFormDataWithMeta<WmsEnvelope<unknown>>(
    `${MINI_APP_WARRANTY_PREFIX}/warranty-cases/${encodeURIComponent(
      caseId,
    )}/attachments`,
    payload,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
      timeoutMs: 5 * 60 * 1000,
    },
  );

  if (!response.data.success || !response.data.data) {
    throw userFacingError(
      response.data.message || "Không tải được ảnh/video lên hồ sơ bảo hành.",
    );
  }

  const attachment = mapWarrantyAttachment(
    extractWarrantyAttachment(response.data.data),
  );

  if (!attachment?.id) {
    throw userFacingError("Backend chưa trả mã file đính kèm.");
  }

  return attachment;
}

export async function downloadWarrantyAttachmentBlob(attachmentId: string) {
  const response = await getBlobWithMeta(
    `${MINI_APP_WARRANTY_PREFIX}/warranty-attachments/${encodeURIComponent(
      attachmentId,
    )}/download`,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
      timeoutMs: 5 * 60 * 1000,
    },
  );

  return response.data;
}

export async function deleteWarrantyAttachment(attachmentId: string) {
  return deleteJson<WmsEnvelope<unknown>>(
    `${MINI_APP_WARRANTY_PREFIX}/warranty-attachments/${encodeURIComponent(
      attachmentId,
    )}`,
    {
      baseUrl: getWmsApiBaseUrl(),
      headers: getWmsAuthHeaders(),
    },
  );
}

export function getWarrantyAttachmentDownloadUrl(attachmentId: string) {
  return `${getWmsApiBaseUrl()}${MINI_APP_WARRANTY_PREFIX}/warranty-attachments/${encodeURIComponent(
    attachmentId,
  )}/download`;
}

export function getWarrantyErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "Phiên đăng nhập WMS đã hết hạn. Vui lòng đăng nhập lại.";
    if (error.status === 403) return "Bạn không có quyền thao tác hồ sơ bảo hành.";
    const errorMessages: Record<string, string> = {
      WARRANTY_DIAGNOSIS_REQUIRED:
        "Vui lòng nhập Kết quả kiểm tra trước khi chuyển trạng thái.",
      WARRANTY_TREATMENT_RESULT_REQUIRED:
        "Vui lòng nhập ghi chú kết quả xử lý trước khi hoàn tất.",
      WARRANTY_HANDOVER_NOTE_REQUIRED:
        "Vui lòng nhập biên bản/ghi chú bàn giao trước khi trả khách.",
      CANCEL_REASON_REQUIRED: "Vui lòng nhập lý do hủy hồ sơ bảo hành.",
      EMPTY_UPDATE: "Chưa có thông tin nào để cập nhật.",
      ATTACHMENT_LIMIT_EXCEEDED:
        "Hồ sơ đã đạt giới hạn ảnh hoặc video đang hoạt động.",
      ATTACHMENT_CONTENT_TYPE_INVALID:
        "Chỉ nhận ảnh JPG, PNG, WEBP hoặc video MP4, MOV, WEBM.",
      ATTACHMENT_TOO_LARGE:
        "File vượt dung lượng cho phép: ảnh tối đa 10MB, video tối đa 300MB.",
      ATTACHMENT_VIDEO_TOO_LONG:
        "Video vượt quá thời lượng tối đa 5 phút.",
      ATTACHMENT_MALWARE_DETECTED:
        "File đính kèm không an toàn nên không được lưu.",
      STATE_CONFLICT:
        "Trạng thái hồ sơ đã thay đổi. Vui lòng tải lại trước khi thao tác.",
    };
    if (error.errorCode && errorMessages[error.errorCode]) {
      return errorMessages[error.errorCode];
    }
    const validationMessage = formatValidationErrors(error.payload);
    if (validationMessage) return validationMessage;
    return error.userMessage || "Không xử lý được yêu cầu bảo hành.";
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return "Backend phản hồi quá lâu. Vui lòng thử lại.";
  }

  if (error instanceof TypeError) {
    return "Không kết nối được backend quản lý kho.";
  }

  return error instanceof Error && error.message
    ? error.message
    : "Không xử lý được yêu cầu bảo hành.";
}

function normalizeWarrantyCasePayload(input: WarrantyCaseInput) {
  const base = {
    customer_name: input.customer_name.trim(),
    customer_phone: input.customer_phone.trim(),
    customer_address: input.customer_address?.trim() || undefined,
    description: input.description.trim(),
    defect_ids: input.defect_ids?.filter(Boolean).length
      ? Array.from(new Set(input.defect_ids.filter(Boolean)))
      : undefined,
  };

  if (input.item_code?.trim()) {
    return {
      ...base,
      item_code: input.item_code.trim(),
      accessories_received: input.accessories_received?.trim() || undefined,
      received_condition: input.received_condition?.trim() || undefined,
    };
  }

  return {
    ...base,
    missing_code_reason: input.missing_code_reason?.trim() || "Mất tem/mã",
    manual_product_description:
      input.manual_product_description?.trim() || undefined,
  };
}

function mapWarrantyDefect(data: unknown): WarrantyDefectOption | undefined {
  const record = extractWarrantyRecord(data);
  const defectId =
    stringValue(record.defect_id) ||
    stringValue(record.id) ||
    stringValue(record.uuid);
  const defectName =
    stringValue(record.defect_name) ||
    stringValue(record.name) ||
    stringValue(record.title);

  if (!defectId || !defectName) return undefined;

  return {
    defect_id: defectId,
    defect_code: stringValue(record.defect_code) || stringValue(record.code),
    defect_name: defectName,
    description: stringValue(record.description),
    status: stringValue(record.status),
  };
}

function mapWarrantyResolve(
  data: unknown,
  fallbackCode: string,
  message?: string,
): WarrantyResolveResult {
  const record = extractWarrantyRecord(data);
  const resolved = booleanValue(record.resolved) ?? Boolean(record.item_id || record.item_code);
  const recommendedFlow =
    stringValue(record.recommended_flow) ||
    (resolved ? "IDENTIFIED" : "TEMP_ONLY");
  const eligibilityCode =
    stringValue(record.eligibility_code) ||
    (resolved ? "ELIGIBLE" : "ITEM_NOT_FOUND");

  return {
    raw_code: stringValue(record.raw_code) || fallbackCode,
    item_code:
      stringValue(record.item_code) ||
      stringValue(record.item_unique) ||
      stringValue(record.serial_number) ||
      fallbackCode,
    item_id: stringValue(record.item_id),
    sku_id: stringValue(record.sku_id),
    sku_code: stringValue(record.sku_code),
    sku_name: stringValue(record.sku_name),
    product_id: stringValue(record.product_id),
    product_name: stringValue(record.product_name) || stringValue(record.name),
    serial_number: stringValue(record.serial_number),
    resolved,
    eligible_for_warranty:
      booleanValue(record.eligible_for_warranty) ??
      eligibilityCode === "ELIGIBLE",
    eligibility_code: eligibilityCode,
    recommended_flow: recommendedFlow,
    stock_effect: stringValue(record.stock_effect) || "NONE",
    wms_case_created: booleanValue(record.wms_case_created) ?? false,
    message,
  };
}

function mapWarrantyCase(data: unknown): WarrantyCaseSummary | undefined {
  const record = extractWarrantyRecord(data);
  const id =
    stringValue(record.id) ||
    stringValue(record.case_id) ||
    stringValue(record.warranty_case_id);

  if (!id) return undefined;

  return {
    id,
    case_no:
      stringValue(record.case_no) ||
      stringValue(record.document_no) ||
      stringValue(record.code),
    status: stringValue(record.status),
    item_code:
      stringValue(record.item_code) ||
      stringValue(record.item_unique) ||
      stringValue(record.serial_number),
    sku_code: stringValue(record.sku_code),
    product_name:
      stringValue(record.product_name) ||
      stringValue(record.sku_name) ||
      stringValue(record.manual_product_description),
    customer_name: stringValue(record.customer_name),
    customer_phone: stringValue(record.customer_phone),
    customer_address: stringValue(record.customer_address),
    description: stringValue(record.description),
    reported_defect: stringValue(record.reported_defect),
    missing_code_reason: stringValue(record.missing_code_reason),
    manual_product_description: stringValue(record.manual_product_description),
    received_condition: stringValue(record.received_condition),
    accessories_received: stringValue(record.accessories_received),
    created_at: stringValue(record.created_at),
    updated_at: stringValue(record.updated_at),
    version: stringValue(record.version) || numberValue(record.version),
    pii_masked: booleanValue(record.pii_masked),
  };
}

function mapWarrantyAttachment(data: unknown): WarrantyAttachment | undefined {
  const record = extractWarrantyRecord(data);
  const id =
    stringValue(record.id) ||
    stringValue(record.attachment_id) ||
    stringValue(record.warranty_attachment_id);

  if (!id) return undefined;

  return {
    id,
    warranty_case_id: stringValue(record.warranty_case_id),
    file_name: stringValue(record.file_name) || stringValue(record.filename),
    name: stringValue(record.name),
    mime_type:
      stringValue(record.mime_type) || stringValue(record.content_type),
    content_type:
      stringValue(record.content_type) || stringValue(record.mime_type),
    size: numberValue(record.size) || numberValue(record.file_size_bytes),
    file_size_bytes:
      numberValue(record.file_size_bytes) || numberValue(record.size),
    checksum: stringValue(record.checksum),
    attachment_type: warrantyAttachmentTypeValue(record.attachment_type),
    media_kind:
      stringValue(record.media_kind) || inferMediaKind(record.content_type),
    duration_seconds: numberValue(record.duration_seconds),
    status: stringValue(record.status),
    created_at: stringValue(record.created_at),
  };
}

function extractWarrantyAttachment(data: unknown) {
  if (!data || typeof data !== "object") return data;
  const record = data as Record<string, unknown>;

  return record.attachment || record.warranty_attachment || record.item || record;
}

function inferMediaKind(contentType: unknown) {
  const normalized = stringValue(contentType)?.toLowerCase();
  if (normalized?.startsWith("video/")) return "VIDEO";
  if (normalized?.startsWith("image/")) return "IMAGE";
  return undefined;
}

function warrantyAttachmentTypeValue(
  value: unknown,
): WarrantyAttachmentType | undefined {
  const attachmentType = stringValue(value)?.toUpperCase();

  return attachmentType && WARRANTY_ATTACHMENT_TYPES.has(attachmentType as WarrantyAttachmentType)
    ? (attachmentType as WarrantyAttachmentType)
    : undefined;
}

function extractWarrantyCase(data: unknown) {
  if (!data || typeof data !== "object") return data;
  const record = data as Record<string, unknown>;

  return (
    record.case ||
    record.warranty_case ||
    record.warrantyCase ||
    record.item ||
    record
  );
}

function extractCollection(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;

  for (const key of ["data", "items", "results", "cases", "events", "attachments"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      const nested = extractCollection(value);
      if (nested.length > 0) return nested;
    }
  }

  return [];
}

function extractWarrantyRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

function normalizeIfMatch(value: unknown) {
  if (value === null || value === undefined) return undefined;
  const normalized = String(value).trim().replace(/^W\//, "").replace(/^"|"$/g, "");
  return normalized || undefined;
}

function formatValidationErrors(payload?: Record<string, unknown>) {
  const errors = payload?.errors;
  if (!errors || typeof errors !== "object") return undefined;

  return Object.entries(errors as Record<string, unknown>)
    .map(([field, value]) => {
      if (Array.isArray(value)) return `${field}: ${value.join(", ")}`;
      if (typeof value === "string") return `${field}: ${value}`;
      return `${field}: ${JSON.stringify(value)}`;
    })
    .join("\n");
}

function userFacingError(message: string) {
  return new Error(message);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    if (["true", "1", "yes"].includes(value.toLowerCase())) return true;
    if (["false", "0", "no"].includes(value.toLowerCase())) return false;
  }
  return undefined;
}
