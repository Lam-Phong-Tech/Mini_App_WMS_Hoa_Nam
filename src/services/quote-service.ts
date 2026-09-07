import { createSafeFailure } from "@/services/api-client";
import { PublicApiAdapter } from "@/services/public-api";
import {
  ApiEnvelope,
  ApiFailure,
  QuoteAcceptedDto,
  QuoteRequestInput,
} from "@/types/public-api";

export interface QuoteDraftInput {
  product_id: string;
  variant_id?: string | null;
  full_name: string;
  phone: string;
  province_code?: string | null;
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

const validationFailure = (
  errors: QuoteFieldErrors,
): ApiFailure => ({
  ...createSafeFailure("VALIDATION_ERROR", {}, errors),
  message: "Vui lòng kiểm tra lại thông tin yêu cầu tư vấn.",
});

export const normalizeVietnamesePhone = (phone: string): string => {
  const trimmed = phone.trim();
  if (trimmed.startsWith("0")) return `+84${trimmed.slice(1)}`;
  return trimmed;
};

export const validateQuoteDraft = (draft: QuoteDraftInput): QuoteValidationResult => {
  const errors: QuoteFieldErrors = {};
  const fullName = draft.full_name.trim();
  const phone = draft.phone.trim();
  const normalizedPhone = normalizeVietnamesePhone(phone);
  const provinceCode = draft.province_code?.trim().toUpperCase() || null;
  const note = draft.note?.trim() || null;
  const privacyVersion = draft.privacy_version.trim();

  if (!draft.product_id.trim()) errors.product_id = ["Thiếu sản phẩm cần tư vấn."];
  if (fullName.length < 2 || fullName.length > 80) errors.full_name = ["Họ tên cần từ 2 đến 80 ký tự."];
  if (!/^(?:0(?:3|5|7|8|9)\d{8}|\+84(?:3|5|7|8|9)\d{8})$/.test(phone)) {
    errors.phone = ["Số điện thoại Việt Nam chưa đúng định dạng."];
  }
  if (provinceCode && !/^[A-Z0-9_-]{1,32}$/.test(provinceCode)) errors.province_code = ["Mã tỉnh/thành chưa đúng định dạng."];
  if (note && note.length > 500) errors.note = ["Ghi chú tối đa 500 ký tự."];
  if (draft.consent !== true) errors.consent = ["Bạn cần đồng ý với chính sách dữ liệu."];
  if (!privacyVersion || privacyVersion.length > 64 || !/^[ -~]+$/.test(privacyVersion)) {
    errors.privacy_version = ["Chính sách dữ liệu chưa sẵn sàng."];
  }

  const valid = Object.keys(errors).length === 0;
  return {
    valid,
    value: valid
      ? {
          product_id: draft.product_id.trim(),
          variant_id: draft.variant_id?.trim() || null,
          full_name: fullName,
          phone: normalizedPhone,
          province_code: provinceCode,
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

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
  new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(undefined as T), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      () => {
        clearTimeout(timeout);
        resolve(undefined as T);
      },
    );
  });

export const submitQuoteWithRetry = async (
  api: PublicApiAdapter,
  draft: QuoteDraftInput,
  idempotencyKey: string,
  timeoutMs = 8000,
): Promise<ApiEnvelope<QuoteAcceptedDto>> => {
  const validation = validateQuoteDraft(draft);
  if (!validation.valid || !validation.value) return validationFailure(validation.errors);
  if (!/^[A-Za-z0-9._~-]{16,128}$/.test(idempotencyKey)) {
    return validationFailure({ idempotency_key: ["Idempotency-Key chưa hợp lệ."] });
  }

  const first = await withTimeout(api.createQuoteRequest(validation.value, idempotencyKey), timeoutMs);
  if (first && first.success) return first;
  if (first && first.error_code !== "UPSTREAM_UNAVAILABLE") return first;

  const retry = await withTimeout(api.createQuoteRequest(validation.value, idempotencyKey), timeoutMs);
  return retry ?? createSafeFailure("UPSTREAM_UNAVAILABLE");
};

export const createQuoteSubmissionGuard = () => {
  let inFlight: Promise<ApiEnvelope<QuoteAcceptedDto>> | null = null;

  return {
    submit: (
      api: PublicApiAdapter,
      draft: QuoteDraftInput,
      idempotencyKey: string,
      timeoutMs?: number,
    ): Promise<ApiEnvelope<QuoteAcceptedDto>> => {
      if (inFlight) return inFlight;
      inFlight = submitQuoteWithRetry(api, draft, idempotencyKey, timeoutMs);
      inFlight.then(
        () => { inFlight = null; },
        () => { inFlight = null; },
      );
      return inFlight;
    },
  };
};
