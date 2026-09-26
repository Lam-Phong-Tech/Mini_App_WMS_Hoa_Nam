import { beforeEach, describe, expect, it } from "vitest";

import {
  advanceCatalogueGeneration,
  clearProductListCache,
  getCatalogueGeneration,
  getProductListCache,
  getProductViewCount,
  getRememberedScrollPosition,
  rememberScrollPosition,
  setProductListCache,
  setProductViewCount,
} from "@/catalogue/catalogue-session";

const dataPage = { products: [], nextCursor: "next-page", hasMore: true, totalCount: 933 };

describe("catalogue data cache and per-screen presentation", () => {
  beforeEach(() => { advanceCatalogueGeneration(); });

  it("shares data without allowing a four-card Search to reduce Products below its own 20-card start", () => {
    setProductListCache("query", dataPage);
    setProductViewCount("query", "search", 4);
    expect(getProductListCache("query")).toBe(dataPage);
    expect(getProductViewCount("query", "search", 4)).toBe(4);
    expect(getProductViewCount("query", "products", 20)).toBe(20);
  });

  it("does not expose a Home scan of 100 records as the new Products view's rendered count", () => {
    setProductListCache("domain=POWER_TOOLS", dataPage);
    setProductViewCount("domain=POWER_TOOLS", "home", 100);
    expect(getProductViewCount("domain=POWER_TOOLS", "home", 20)).toBe(100);
    expect(getProductViewCount("domain=POWER_TOOLS", "products", 20)).toBe(20);
    expect(getProductViewCount("domain=POWER_TOOLS", "search", 4)).toBe(4);
  });

  it("restores the same view's intentional reveal count without mixing queries or other screens", () => {
    setProductViewCount("one", "products", 40);
    setProductViewCount("one", "search", 8);
    expect(getProductViewCount("one", "products", 20)).toBe(40);
    expect(getProductViewCount("one", "search", 4)).toBe(8);
    expect(getProductViewCount("two", "products", 20)).toBe(20);
  });

  it("successful refresh advances once and invalidates old public data plus presentation counts", () => {
    const previous = getCatalogueGeneration();
    setProductListCache("query", dataPage, previous);
    setProductViewCount("query", "products", 80, previous);
    const current = advanceCatalogueGeneration();
    expect(current).toBe(previous + 1);
    expect(getProductListCache("query", current)).toBeUndefined();
    expect(getProductViewCount("query", "products", 20, current)).toBe(20);
  });

  it("ignores responses and view counts from requests started before a refresh", () => {
    const stale = getCatalogueGeneration();
    const current = advanceCatalogueGeneration();
    setProductListCache("query", dataPage, stale);
    setProductViewCount("query", "products", 100, stale);
    expect(getProductListCache("query", current)).toBeUndefined();
    expect(getProductViewCount("query", "products", 20, current)).toBe(20);

    const refreshed = { ...dataPage, nextCursor: "fresh-cursor", totalCount: 934 };
    setProductListCache("query", refreshed, current);
    expect(getProductListCache("query", current)).toBe(refreshed);
    expect(getProductListCache("query", stale)).toBeUndefined();
  });

  it("a local query retry clears only that query's data and view counters", () => {
    setProductListCache("one", dataPage);
    setProductListCache("two", dataPage);
    setProductViewCount("one", "products", 40);
    setProductViewCount("one", "search", 8);
    setProductViewCount("two", "products", 60);
    clearProductListCache("one");
    expect(getProductListCache("one")).toBeUndefined();
    expect(getProductListCache("two")).toBe(dataPage);
    expect(getProductViewCount("one", "products", 20)).toBe(20);
    expect(getProductViewCount("one", "search", 4)).toBe(4);
    expect(getProductViewCount("two", "products", 20)).toBe(60);
  });

  it("does not invalidate independent scroll history or accept invalid reveal counts", () => {
    rememberScrollPosition("products:query", 450);
    setProductViewCount("query", "products", Number.NaN);
    expect(getProductViewCount("query", "products", 20)).toBe(20);
    advanceCatalogueGeneration();
    expect(getRememberedScrollPosition("products:query")).toBe(450);
  });
});
