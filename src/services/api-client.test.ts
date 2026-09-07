import { describe, expect, it } from "vitest";

import { requestEnvelope } from "@/services/api-client";
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
  });
});
