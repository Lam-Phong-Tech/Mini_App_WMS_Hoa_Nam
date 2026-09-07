import { describe, expect, it, vi } from "vitest";

import { createSafeFailure } from "@/services/api-client";
import {
  createQuoteSubmissionGuard,
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
  product_id: "product-1",
  variant_id: "variant-1",
  full_name: "Nguyễn Văn A",
  phone: "0912345678",
  province_code: "HCM",
  note: "Tư vấn giúp tôi phiên bản phù hợp",
  consent: true,
  privacy_version: "2026-08",
});

const apiWith = (createQuoteRequest: PublicApiAdapter["createQuoteRequest"]): PublicApiAdapter =>
  ({ createQuoteRequest } as unknown as PublicApiAdapter);

describe("G3 quote validation and submission", () => {
  it("validates required fields and normalizes a Vietnamese phone", () => {
    const result = validateQuoteDraft(validDraft());
    expect(result.valid).toBe(true);
    expect(result.value?.phone).toBe("+84912345678");
    expect(normalizeVietnamesePhone(" +84912345678 ")).toBe("+84912345678");
  });

  it("returns field-level errors for name, phone, note, consent and privacy", () => {
    const result = validateQuoteDraft({
      ...validDraft(),
      full_name: "A",
      phone: "0123",
      note: "x".repeat(501),
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

  it("retries an unavailable upstream with the same idempotency key", async () => {
    const create = vi.fn()
      .mockResolvedValueOnce(createSafeFailure("UPSTREAM_UNAVAILABLE"))
      .mockResolvedValueOnce(accepted("req-retry"));
    const response = await submitQuoteWithRetry(apiWith(create), validDraft(), "key-retry-000001");
    expect(response.success).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls.map((call) => call[1])).toEqual(["key-retry-000001", "key-retry-000001"]);
  });

  it("maps a rejected network call to a safe error and retries once", async () => {
    const create = vi.fn()
      .mockRejectedValueOnce(new Error("private upstream detail"))
      .mockResolvedValueOnce(accepted("req-network"));
    const response = await submitQuoteWithRetry(apiWith(create), validDraft(), "key-network-00001");
    expect(response.success).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls.every((call) => call[1] === "key-network-00001")).toBe(true);
  });

  it("does not retry rate limits and preserves safe error code", async () => {
    const create = vi.fn().mockResolvedValue(createSafeFailure("RATE_LIMITED", { retry_after_seconds: 10 }));
    const response = await submitQuoteWithRetry(apiWith(create), validDraft(), "key-rate-0000001");
    expect(response.success).toBe(false);
    if (!response.success) expect(response.error_code).toBe("RATE_LIMITED");
    expect(create).toHaveBeenCalledTimes(1);
  });
});
