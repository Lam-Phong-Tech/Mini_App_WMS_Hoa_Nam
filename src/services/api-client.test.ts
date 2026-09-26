import { describe, expect, it } from "vitest";

import { requestEnvelope } from "@/services/api-client";
import { getSystemStateForFailure } from "@/state/system-state";
import { isApiSuccess } from "@/types/public-api";

describe("API envelope boundary", () => {
  it("replaces malformed upstream output with a safe unavailable response", async () => {
    const result = await requestEnvelope<never>(
      "https://public.example/api/v1/public/config",
      {},
      async () => new Response("not-json", { status: 503 }),
    );

    expect(isApiSuccess(result)).toBe(false);
    expect(isApiSuccess(result) ? null : result.error_code).toBe("UPSTREAM_UNAVAILABLE");
    expect(result.meta.transport_error).toBe(false);
    expect(!isApiSuccess(result) && getSystemStateForFailure(result).kind).toBe("api-error");
  });

  it("does not surface a rejected network error", async () => {
    const result = await requestEnvelope<never>(
      "https://public.example/api/v1/public/home",
      {},
      async () => Promise.reject(new Error("internal upstream detail")),
    );

    expect(isApiSuccess(result)).toBe(false);
    expect(isApiSuccess(result) ? null : result.message).toBe(
      "Không thể tải dữ liệu lúc này. Vui lòng thử lại.",
    );
    expect(result.meta.transport_error).toBe(true);
    expect(!isApiSuccess(result) && getSystemStateForFailure(result).kind).toBe("no-network");
  });

  it("maps a timed-out request to the same safe no-network contract", async () => {
    const result = await requestEnvelope<never>(
      "https://public.example/api/v1/public/products",
      {},
      async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("timeout")));
      }),
      1,
    );

    expect(isApiSuccess(result)).toBe(false);
    expect(isApiSuccess(result) ? null : result.error_code).toBe("UPSTREAM_UNAVAILABLE");
    expect(result.meta.transport_error).toBe(true);
  });

  it("marks a well-formed server failure as an API response, not a local transport failure", async () => {
    const result = await requestEnvelope<never>(
      "https://public.example/api/v1/public/home",
      {},
      async () => new Response(JSON.stringify({
        success: false,
        message: "Unavailable",
        data: null,
        meta: { retry_after_seconds: 20, transport_error: true },
        error_code: "UPSTREAM_UNAVAILABLE",
        errors: null,
      }), { status: 503 }),
    );
    expect(result.meta).toEqual({ retry_after_seconds: 20, transport_error: false });
    expect(!isApiSuccess(result) && getSystemStateForFailure(result).kind).toBe("api-error");
  });

  it("preserves the idempotency-conflict meaning for an HTTP 409 quote replay conflict", async () => {
    const result = await requestEnvelope<never>(
      "https://public.example/api/v1/public/quote-requests",
      {},
      async () => new Response("not-json", { status: 409 }),
    );
    expect(isApiSuccess(result)).toBe(false);
    expect(isApiSuccess(result) ? null : result.error_code).toBe("IDEMPOTENCY_CONFLICT");
  });
});
