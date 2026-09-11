import { createSafeFailure } from "@/services/api-client";
import { PublicApiAdapter } from "@/services/public-api";
import {
  ApiEnvelope,
  ApiFailure,
  QuoteAcceptedDto,
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
    }))
    // Presentation order must not change the request meaning or its key.
    .sort((left, right) => `${left.product_id}\u0000${left.variant_id ?? ""}`.localeCompare(`${right.product_id}\u0000${right.variant_id ?? ""}`));

/** A canonical, non-sensitive representation used only in memory for idempotency. */
export const getQuoteFingerprint = (input: QuoteRequestInput): string => JSON.stringify({
  ...input,
  items: normalizeQuoteItems(input.items),
  full_name: input.full_name.trim(),
  phone: normalizeVietnamesePhone(input.phone),
  note: normalizeNote(input.note),
  privacy_version: input.privacy_version.trim(),
});

export const validateQuoteDraft = (draft: QuoteDraftInput): QuoteValidationResult => {
  const errors: QuoteFieldErrors = {};
  const fullName = draft.full_name.trim();
  const normalizedPhone = normalizeVietnamesePhone(draft.phone);
  const note = normalizeNote(draft.note);
  const privacyVersion = draft.privacy_version.trim();
  const items = normalizeQuoteItems(draft.items);
  const itemProductIds = new Set<string>();

  if (!items.length || items.length > 20) errors.items = ["Chọn từ 1 đến 20 sản phẩm."];
  items.forEach((item, index) => {
    if (!item.product_id) errors[`items.${index}.product_id`] = ["Thiếu sản phẩm cần tư vấn."];
    if (item.product_id && itemProductIds.has(item.product_id)) {
      errors.items = ["Không thể chọn trùng sản phẩm trong một yêu cầu."];
    }
    itemProductIds.add(item.product_id);
    if (item.quantity !== null && item.quantity !== undefined && (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 9_999)) {
      errors[`items.${index}.quantity`] = ["Số lượng cần là số nguyên từ 1 đến 9.999."];
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
): Promise<ApiEnvelope<QuoteAcceptedDto>> => {
  const validation = validateQuoteDraft(draft);
  if (!validation.valid || !validation.value) return validationFailure(validation.errors);
  if (!/^[A-Za-z0-9._~-]{16,128}$/.test(idempotencyKey)) {
    return validationFailure({ idempotency_key: ["Idempotency-Key chưa hợp lệ."] });
  }

  try {
    return await api.createQuoteRequest(validation.value, idempotencyKey);
  } catch {
    return createSafeFailure("UPSTREAM_UNAVAILABLE");
  }
};

export const createQuoteSubmissionGuard = () => {
  let inFlight: Promise<ApiEnvelope<QuoteAcceptedDto>> | null = null;

  return {
    submit: (
      api: PublicApiAdapter,
      draft: QuoteDraftInput,
      idempotencyKey: string,
    ): Promise<ApiEnvelope<QuoteAcceptedDto>> => {
      if (inFlight) return inFlight;
      inFlight = submitQuoteWithRetry(api, draft, idempotencyKey);
      inFlight.then(
        () => { inFlight = null; },
        () => { inFlight = null; },
      );
      return inFlight;
    },
  };
};
