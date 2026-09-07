import { describe, expect, it } from "vitest";

import {
  DevMockPublicApiAdapter,
  PublicApiAdapter,
} from "@/services/public-api";
import { isApiSuccess } from "@/types/public-api";

describe("DEV public API adapter", () => {
  const adapter: PublicApiAdapter = new DevMockPublicApiAdapter();

  it("returns the clearly scoped DEV-only preview fixture", async () => {
    const [config, home, categories, products, facets] = await Promise.all([
      adapter.getConfig(),
      adapter.getHome(),
      adapter.getCategories(),
      adapter.getProducts(),
      adapter.getFacets(),
    ]);

    expect(isApiSuccess(config) && config.data.config_version).toBe("DEV-UI-PREVIEW-1");
    expect(isApiSuccess(config) && config.data.feature_flags.catalogue_enabled).toBe(true);
    expect(isApiSuccess(config) && config.data.feature_flags.quote_request_enabled).toBe(false);
    expect(isApiSuccess(home) && home.data.domains.map((domain) => domain.code)).toEqual([
      "POWER_TOOLS",
      "HAND_TOOLS",
      "ACCESSORIES",
    ]);
    expect(isApiSuccess(home) && home.data.sections.map((section) => section.kind)).toEqual([
      "CATEGORY_HIGHLIGHTS",
      "FEATURED_PRODUCTS",
    ]);
    expect(isApiSuccess(categories) && categories.data).toHaveLength(15);
    expect(isApiSuccess(products) && products.data).toHaveLength(12);
    expect(isApiSuccess(products) && products.data.every((product) => (
      product.primary_code === null && product.cover_media?.url.startsWith("/dev-wireframe-media/")
    ))).toBe(true);
    expect(isApiSuccess(facets) && facets.data[0]?.options).toHaveLength(15);
  });

  it("supports the public list contract while keeping preview data synthetic", async () => {
    const [categoryProducts, unaccentedSearch, exactModelSearch, firstPage] = await Promise.all([
      adapter.getProducts({ category: "DEV_DRILL_FASTEN" }),
      adapter.getProducts({ q: "do luong" }),
      adapter.getProducts({ q: "DCPL2045" }),
      adapter.getProducts({ limit: 2 }),
    ]);

    expect(isApiSuccess(categoryProducts) && categoryProducts.data.map((product) => product.category.code)).toEqual([
      "DEV_DRILL_FASTEN",
      "DEV_DRILL_FASTEN",
    ]);
    expect(isApiSuccess(unaccentedSearch) && unaccentedSearch.data.map((product) => product.category.code)).toEqual([
      "DEV_MEASURING",
      "DEV_HAND_MEASURING",
    ]);
    expect(isApiSuccess(exactModelSearch) && exactModelSearch.data.map((product) => product.model)).toEqual([
      "DCPL2045",
    ]);
    expect(isApiSuccess(firstPage) && firstPage.meta.next_cursor).toBe("dev-preview-offset-2");

    if (!isApiSuccess(firstPage) || !firstPage.meta.next_cursor) throw new Error("Expected a DEV preview cursor");
    const secondPage = await adapter.getProducts({ cursor: firstPage.meta.next_cursor, limit: 2 });
    expect(isApiSuccess(secondPage) && secondPage.data.map((product) => product.product_id)).not.toContain(
      firstPage.data[0]?.product_id,
    );
  });

  it("does not fabricate an unrecognised product or quote acknowledgement", async () => {
    const [product, quote] = await Promise.all([
      adapter.getProduct("not-available"),
      adapter.createQuoteRequest({} as never, "dev-contract-key-0001"),
    ]);

    expect(isApiSuccess(product) ? null : product.error_code).toBe("PRODUCT_NOT_FOUND");
    expect(isApiSuccess(quote) ? null : quote.error_code).toBe("PRODUCT_NOT_AVAILABLE");
  });
});
