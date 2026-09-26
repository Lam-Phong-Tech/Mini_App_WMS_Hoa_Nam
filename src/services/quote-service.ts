import { createSafeFailure } from "@/services/api-client";
import { PublicApiAdapter } from "@/services/public-api";
import {
  ApiEnvelope,
  ApiFailure,
  QuoteAcceptedDto,
  PublicConfigDto,
  QuoteRequestInput,
  QuoteRequestItemInput,
} from "@/types/public-api";

export interface QuoteDraftInput {
  items: QuoteRequestItemInput[];
  full_name: string;
  phone: string;
  note?: string | null;
  consent: boolean;
  privacy_version: string;
}

export type QuoteFieldErrors = Record<string, string[]>;

export interface QuoteLimits {
  maxItems: number;
  maxQuantity: number | null;
}

export const DEFAULT_QUOTE_LIMITS: QuoteLimits = { maxItems: 20, maxQuantity: null };

export const getQuoteLimits = (config: PublicConfigDto | null | undefined): QuoteLimits => {
  const maxItems = config?.quote_request?.max_items;
  const maxQuantity = config?.quote_request?.max_quantity;
  return {
    maxItems: typeof maxItems === "number" && Number.isInteger(maxItems) && maxItems > 0 ? maxItems : DEFAULT_QUOTE_LIMITS.maxItems,
    maxQuantity: typeof maxQuantity === "number" && Number.isInteger(maxQuantity) && maxQuantity > 0 ? maxQuantity : null,
  };
};

export interface QuoteValidationResult {
  valid: boolean;
  value: QuoteRequestInput | null;
  errors: QuoteFieldErrors;
}

const validationFailure = (errors: QuoteFieldErrors): ApiFailure => ({
  ...createSafeFailure("VALIDATION_ERROR", {}, errors),
  message: "Vui lòng kiểm tra lại thông tin yêu cầu tư vấn.",
});

const PHONE_SEPARATORS = /[\s.()\-]/g;
const UNSUPPORTED_PHONE_CHARACTERS = /[^\d+\s.()\-]/;
const VIETNAMESE_MOBILE_LOCAL = /^0[35789]\d{8}$/;
const VIETNAMESE_MOBILE_CANONICAL = /^\+84[35789]\d{8}$/;

export const normalizeVietnamesePhone = (phone: string): string => {
  const raw = phone.trim();
  if (UNSUPPORTED_PHONE_CHARACTERS.test(raw)) return raw;

  const compact = raw.replace(PHONE_SEPARATORS, "");
  if (compact.startsWith("0")) return `+84${compact.slice(1)}`;
  return compact;
};

/**
 * Validates the value entered in the phone field while keeping the submitted
 * value canonical (+84xxxxxxxxx). The form uses this on blur so feedback is
 * attached to the phone field before the customer submits the request.
 */
export const getVietnamesePhoneValidationError = (phone: string): string | null => {
  const normalized = normalizeVietnamesePhone(phone);
  return (VIETNAMESE_MOBILE_LOCAL.test(phone.trim()) || VIETNAMESE_MOBILE_CANONICAL.test(normalized))
    ? null
    : "Nhập số di động Việt Nam, ví dụ 0901234567 hoặc +84901234567.";
};

const normalizeNote = (note: string | null | undefined): string | null => {
  const normalized = (note ?? "").replace(/\r\n?/g, "\n").trim();
  return normalized || null;
};

const normalizeQuoteItems = (items: QuoteRequestItemInput[]): QuoteRequestItemInput[] =>
  items
    .map((item) => ({
      product_id: item.product_id.trim(),
      variant_id: item.variant_id?.trim() || null,
      quantity: item.quantity ?? null,
    }));

/** A canonical, non-sensitive representation used only in memory for idempotency. */
export const getQuoteFingerprint = (input: QuoteRequestInput): string => JSON.stringify({
  ...input,
  items: normalizeQuoteItems(input.items),
  full_name: input.full_name.trim(),
  phone: normalizeVietnamesePhone(input.phone),
  note: normalizeNote(input.note),
  privacy_version: input.privacy_version.trim(),
});

export const validateQuoteDraft = (
  draft: QuoteDraftInput,
  limits: QuoteLimits = DEFAULT_QUOTE_LIMITS,
): QuoteValidationResult => {
  const errors: QuoteFieldErrors = {};
  const fullName = draft.full_name.trim();
  const normalizedPhone = normalizeVietnamesePhone(draft.phone);
  const note = normalizeNote(draft.note);
  const privacyVersion = draft.privacy_version.trim();
  const items = normalizeQuoteItems(draft.items);
  const itemProductIds = new Set<string>();

  if (!items.length || items.length > limits.maxItems) errors.items = [`Chọn từ 1 đến ${limits.maxItems} sản phẩm.`];
  items.forEach((item, index) => {
    if (!item.product_id) errors[`items.${index}.product_id`] = ["Thiếu sản phẩm cần tư vấn."];
    if (item.product_id && itemProductIds.has(item.product_id)) {
      errors.items = ["Không thể chọn trùng sản phẩm trong một yêu cầu."];
    }
    itemProductIds.add(item.product_id);
    const maxQuantity = limits.maxQuantity ?? 9_999;
    if (item.quantity !== null && item.quantity !== undefined && (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > maxQuantity)) {
      errors[`items.${index}.quantity`] = [`Số lượng cần là số nguyên từ 1 đến ${maxQuantity.toLocaleString("vi-VN")}.`];
    }
  });
  if (fullName.length < 1 || fullName.length > 100) errors.full_name = ["Họ tên cần từ 1 đến 100 ký tự."];
  const phoneError = getVietnamesePhoneValidationError(draft.phone);
  if (phoneError) errors.phone = [phoneError];
  if (note && note.length > 1_000) errors.note = ["Ghi chú tối đa 1.000 ký tự."];
  if (draft.consent !== true) errors.consent = ["Bạn cần đồng ý với chính sách dữ liệu."];
  if (!privacyVersion || privacyVersion.length > 64 || !/^[ -~]+$/.test(privacyVersion)) {
    errors.privacy_version = ["Chính sách dữ liệu chưa sẵn sàng."];
  }

  const valid = Object.keys(errors).length === 0;
  return {
    valid,
    value: valid
      ? {
          items,
          full_name: fullName,
          phone: normalizedPhone,
          note,
          consent: true,
          privacy_version: privacyVersion,
        }
      : null,
    errors,
  };
};

export const generateIdempotencyKey = (): string => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._~-";
  const bytes = new Uint8Array(24);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else bytes.fill(Date.now() % 255);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
};

/** Keeps a key per canonical payload for the life of the app session. */
export const createQuoteIdempotencyKeyTracker = (createKey: () => string = generateIdempotencyKey) => {
  const keysByFingerprint = new Map<string, string>();

  return {
    getKey(input: QuoteRequestInput): string {
      const fingerprint = getQuoteFingerprint(input);
      const existing = keysByFingerprint.get(fingerprint);
      if (existing) return existing;
      const key = createKey();
      keysByFingerprint.set(fingerprint, key);
      return key;
    },
  };
};

/** Sends once; after a 15-second transport timeout the customer explicitly retries. */
export const submitQuoteWithRetry = async (
  api: PublicApiAdapter,
  draft: QuoteDraftInput,
  idempotencyKey: string,
  limits: QuoteLimits = DEFAULT_QUOTE_LIMITS,
): Promise<ApiEnvelope<QuoteAcceptedDto>> => {
  const validation = validateQuoteDraft(draft, limits);
  if (!validation.valid || !validation.value) return validationFailure(validation.errors);
  if (!/^[A-Za-z0-9._~-]{16,128}$/.test(idempotencyKey)) {
    return validationFailure({ idempotency_key: ["Idempotency-Key chưa hợp lệ."] });
  }

  return sendQuotePayload(api, validation.value, idempotencyKey);
};

/**
 * Sends a previously validated submission again without rebuilding it from the
 * current form or config.  This is deliberately separate from
 * `submitQuoteWithRetry`: a customer retry after a timeout must retain the
 * original item order, privacy version and Idempotency-Key, even if the
 * public config changed while the first response was in flight.
 */
export const retryQuoteSubmission = async (
  api: PublicApiAdapter,
  payload: QuoteRequestInput,
  idempotencyKey: string,
): Promise<ApiEnvelope<QuoteAcceptedDto>> => {
  if (!/^[A-Za-z0-9._~-]{16,128}$/.test(idempotencyKey)) {
    return validationFailure({ idempotency_key: ["Idempotency-Key chưa hợp lệ."] });
  }
  return sendQuotePayload(api, payload, idempotencyKey);
};

const sendQuotePayload = async (
  api: PublicApiAdapter,
  payload: QuoteRequestInput,
  idempotencyKey: string,
): Promise<ApiEnvelope<QuoteAcceptedDto>> => {
  try {
    return await api.createQuoteRequest(payload, idempotencyKey);
  } catch {
    return createSafeFailure("UPSTREAM_UNAVAILABLE", { transport_error: true });
  }
};

export const createQuoteSubmissionGuard = () => {
  let inFlight: Promise<ApiEnvelope<QuoteAcceptedDto>> | null = null;

  const run = (request: () => Promise<ApiEnvelope<QuoteAcceptedDto>>) => {
    if (inFlight) return inFlight;
    inFlight = request();
    inFlight.then(
      () => { inFlight = null; },
      () => { inFlight = null; },
    );
    return inFlight;
  };

  return {
    submit: (
      api: PublicApiAdapter,
      draft: QuoteDraftInput,
      idempotencyKey: string,
      limits: QuoteLimits = DEFAULT_QUOTE_LIMITS,
    ): Promise<ApiEnvelope<QuoteAcceptedDto>> => {
      return run(() => submitQuoteWithRetry(api, draft, idempotencyKey, limits));
    },
    retry: (
      api: PublicApiAdapter,
      payload: QuoteRequestInput,
      idempotencyKey: string,
    ): Promise<ApiEnvelope<QuoteAcceptedDto>> => {
      return run(() => retryQuoteSubmission(api, payload, idempotencyKey));
    },
  };
};
