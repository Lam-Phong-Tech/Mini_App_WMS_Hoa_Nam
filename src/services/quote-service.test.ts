import { describe, expect, it, vi } from "vitest";

import { createSafeFailure } from "@/services/api-client";
import {
  createQuoteIdempotencyKeyTracker,
  createQuoteSubmissionGuard,
  getQuoteFingerprint,
  getVietnamesePhoneValidationError,
  normalizeVietnamesePhone,
  submitQuoteWithRetry,
  validateQuoteDraft,
} from "@/services/quote-service";
import { PublicApiAdapter } from "@/services/public-api";
import { ApiSuccess, QuoteAcceptedDto } from "@/types/public-api";

const accepted = (requestId = "req-1"): ApiSuccess<QuoteAcceptedDto> => ({
  success: true,
  message: "Đã tiếp nhận",
  data: { request_id: requestId, status: "RECEIVED" },
  meta: { request_id: requestId },
  error_code: null,
  errors: null,
});

const validDraft = () => ({
  items: [{ product_id: "product-1", variant_id: "variant-1", quantity: 1 }],
  full_name: "Nguyễn Văn A",
  phone: "0912345678",
  note: "Tư vấn giúp tôi phiên bản phù hợp",
  consent: true,
  privacy_version: "2026-08",
});

const apiWith = (createQuoteRequest: PublicApiAdapter["createQuoteRequest"]): PublicApiAdapter =>
  ({ createQuoteRequest } as unknown as PublicApiAdapter);

describe("G4 quote validation and submission", () => {
  it("validates required fields and normalizes a Vietnamese phone", () => {
    const result = validateQuoteDraft(validDraft());
    expect(result.valid).toBe(true);
    expect(result.value?.phone).toBe("+84912345678");
    expect(normalizeVietnamesePhone(" (+84) 912.345-678 ")).toBe("+84912345678");
  });

  it("validates formatted local and +84 Vietnamese mobile input", () => {
    expect(getVietnamesePhoneValidationError("0912345678")).toBeNull();
    expect(getVietnamesePhoneValidationError("+84912345678")).toBeNull();
    expect(getVietnamesePhoneValidationError("0912 345 678")).toBeNull();
    expect(getVietnamesePhoneValidationError("(+84) 912.345-678")).toBeNull();
    expect(getVietnamesePhoneValidationError("0212345678")).toBeTruthy();
    expect(getVietnamesePhoneValidationError("091234567")).toBeTruthy();
    expect(getVietnamesePhoneValidationError("0912abc678")).toBeTruthy();
    expect(getVietnamesePhoneValidationError("+840912345678")).toBeTruthy();
  });

  it("returns field-level errors for name, phone, note, consent and privacy", () => {
    const result = validateQuoteDraft({
      ...validDraft(),
      full_name: " ",
      phone: "0123 ext 4",
      note: "x".repeat(1_001),
      consent: false,
      privacy_version: "",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toMatchObject({
      full_name: expect.any(Array),
      phone: expect.any(Array),
      note: expect.any(Array),
      consent: expect.any(Array),
      privacy_version: expect.any(Array),
    });
  });

  it("accepts a happy-path response with request_id and RECEIVED", async () => {
    const create = vi.fn().mockResolvedValue(accepted("req-happy"));
    const response = await submitQuoteWithRetry(apiWith(create), validDraft(), "key-happy-000001");
    expect(response).toEqual(expect.objectContaining({ success: true }));
    if (response.success) expect(response.data).toEqual({ request_id: "req-happy", status: "RECEIVED" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ phone: "+84912345678" }), "key-happy-000001");
  });

  it("prevents double tap and sends only one underlying request", async () => {
    let resolveRequest: ((value: ApiSuccess<QuoteAcceptedDto>) => void) | undefined;
    const create = vi.fn().mockImplementation(() => new Promise<ApiSuccess<QuoteAcceptedDto>>((resolve) => { resolveRequest = resolve; }));
    const guard = createQuoteSubmissionGuard();
    const first = guard.submit(apiWith(create), validDraft(), "key-double-000001");
    const second = guard.submit(apiWith(create), validDraft(), "key-double-000001");
    expect(create).toHaveBeenCalledTimes(1);
    resolveRequest?.(accepted("req-double"));
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it("does not automatically retry an unavailable upstream", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce(createSafeFailure("UPSTREAM_UNAVAILABLE"));
    const response = await submitQuoteWithRetry(apiWith(create), validDraft(), "key-retry-000001");
    expect(response.success).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("maps a rejected network call to a safe error without submitting again", async () => {
    const create = vi.fn()
      .mockRejectedValueOnce(new Error("private upstream detail"));
    const response = await submitQuoteWithRetry(apiWith(create), validDraft(), "key-network-00001");
    expect(response.success).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("does not retry rate limits and preserves safe error code", async () => {
    const create = vi.fn().mockResolvedValue(createSafeFailure("RATE_LIMITED", { retry_after_seconds: 10 }));
    const response = await submitQuoteWithRetry(apiWith(create), validDraft(), "key-rate-0000001");
    expect(response.success).toBe(false);
    if (!response.success) expect(response.error_code).toBe("RATE_LIMITED");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("uses one key for a canonical product order and a new key when content changes", () => {
    const tracker = createQuoteIdempotencyKeyTracker(vi.fn()
      .mockReturnValueOnce("key-canonical-0001")
      .mockReturnValueOnce("key-changed-000002"));
    const first = validateQuoteDraft({
      ...validDraft(),
      items: [
        { product_id: "product-b", variant_id: null, quantity: 1 },
        { product_id: "product-a", variant_id: null, quantity: 1 },
      ],
    }).value;
    const reordered = validateQuoteDraft({
      ...validDraft(),
      items: [
        { product_id: "product-a", variant_id: null, quantity: 1 },
        { product_id: "product-b", variant_id: null, quantity: 1 },
      ],
    }).value;
    const changed = validateQuoteDraft({
      ...validDraft(),
      items: [{ product_id: "product-a", variant_id: null, quantity: 2 }],
    }).value;
    if (!first || !reordered || !changed) throw new Error("Expected valid drafts");

    expect(getQuoteFingerprint(first)).toBe(getQuoteFingerprint(reordered));
    expect(tracker.getKey(first)).toBe("key-canonical-0001");
    expect(tracker.getKey(reordered)).toBe("key-canonical-0001");
    expect(tracker.getKey(changed)).toBe("key-changed-000002");
  });

  it("rejects duplicate products and accepts 1,000-character notes", () => {
    expect(validateQuoteDraft({ ...validDraft(), note: "x".repeat(1_000) }).valid).toBe(true);
    const duplicate = validateQuoteDraft({
      ...validDraft(),
      items: [
        { product_id: "product-1", variant_id: null },
        { product_id: "product-1", variant_id: "variant-2" },
      ],
    });
    expect(duplicate.valid).toBe(false);
    expect(duplicate.errors.items).toBeDefined();
  });

  it("allows at most twenty unique products in one request", () => {
    const twenty = Array.from({ length: 20 }, (_, index) => ({ product_id: `product-${index + 1}` }));
    const twentyOne = [...twenty, { product_id: "product-21" }];

    expect(validateQuoteDraft({ ...validDraft(), items: twenty }).valid).toBe(true);
    expect(validateQuoteDraft({ ...validDraft(), items: twentyOne })).toMatchObject({
      valid: false,
      errors: { items: expect.any(Array) },
    });
  });
});
