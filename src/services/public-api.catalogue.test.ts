import { afterEach, describe, expect, it } from "vitest";

import { HttpPublicApiAdapter, normalizeProductIdsLookup } from "@/services/public-api";

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

  it("uses the isolated D13 ids[] mode without pagination or catalogue filters", async () => {
    let requestedUrl = "";
    const first = "01a07c56-2f4b-737b-9170-0bf423e9ffb1";
    const second = "01a07c56-2f54-72ac-9302-7ea66f02aa80";
    const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
      requestedUrl = String(input);
      return new Response(successEnvelope({ items: [], missing_ids: [] }), { status: 200 });
    };
    globalThis.fetch = fetcher as typeof fetch;
    const api = new HttpPublicApiAdapter("https://public.example");

    await api.getProductsByIds([second, first, second]);

    expect(requestedUrl).toBe(`https://public.example/api/v1/public/products?ids%5B%5D=${second}&ids%5B%5D=${first}`);
  });

  it("rejects corrupted, empty and oversized ID-only library lookups before network access", () => {
    const valid = "01a07c56-2f4b-737b-9170-0bf423e9ffb1";
    expect(normalizeProductIdsLookup([valid, valid.toUpperCase()])).toEqual([valid]);
    expect(normalizeProductIdsLookup([])).toBeNull();
    expect(normalizeProductIdsLookup(["not-a-uuid"])).toBeNull();
    expect(normalizeProductIdsLookup(Array.from({ length: 51 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`))).toBeNull();
  });
});
