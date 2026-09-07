import { afterEach, describe, expect, it } from "vitest";

import { HttpPublicApiAdapter } from "@/services/public-api";

const successEnvelope = (data: unknown) => JSON.stringify({
  success: true,
  message: "ok",
  data,
  meta: { next_cursor: null },
  error_code: null,
  errors: null,
});

describe("catalogue HTTP adapter boundary", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends the G0 search/filter/sort query unchanged at the public endpoint", async () => {
    let requestedUrl = "";
    const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
      requestedUrl = String(input);
      return new Response(successEnvelope([]), { status: 200 });
    };
    globalThis.fetch = fetcher as typeof fetch;
    const api = new HttpPublicApiAdapter("https://public.example/");

    await api.getProducts({
      q: "  model test  ",
      domain: "POWER_TOOLS",
      category: "TEST_CATEGORY",
      feature: ["FEATURE_A"],
      spec: { voltage: "20V" },
      sort: "name_asc",
      limit: 20,
    });

    expect(requestedUrl).toBe("https://public.example/api/v1/public/products?q=model+test&domain=POWER_TOOLS&category=TEST_CATEGORY&feature=FEATURE_A&spec.voltage=20V&sort=name_asc&limit=20");
  });

  it("keeps the opaque cursor on the next public page request", async () => {
    let requestedUrl = "";
    const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
      requestedUrl = String(input);
      return new Response(successEnvelope([]), { status: 200 });
    };
    globalThis.fetch = fetcher as typeof fetch;
    const api = new HttpPublicApiAdapter("https://public.example");

    await api.getProducts({ cursor: "opaque-cursor", sort: "updated_desc" });

    expect(requestedUrl).toContain("cursor=opaque-cursor");
    expect(requestedUrl).toContain("sort=updated_desc");
  });
});
