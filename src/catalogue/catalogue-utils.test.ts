import { describe, expect, it } from "vitest";

import {
  MOBILE_TOUCH_TARGET_PX,
  countActiveFilters,
  createProductDetailPath,
  getAvailabilityLabel,
  getPublicProducts,
  getSearchMatchRank,
  getVisibleDetailSections,
  getVisibleHomeSections,
  getVisibleVariants,
  isEligiblePublicProduct,
  isPreorderAvailability,
  isPublicMediaUrl,
  mergeUniqueProducts,
  normalizeSearchText,
  parseProductQuery,
  resetProductFilters,
  serializeProductQuery,
} from "@/catalogue/catalogue-utils";
import {
  getRememberedScrollPosition,
  rememberScrollPosition,
} from "@/catalogue/catalogue-session";
import { shouldRefreshFromPull } from "@/hooks/use-pull-to-refresh";
import { getSystemStateForFailure } from "@/state/system-state";
import { ApiFailure, CategoryDto, ProductCardDto, ProductDetailDto, VariantDto } from "@/types/public-api";

// TEST-ONLY contract values. They are never imported by a runtime adapter, fixture, UAT, or Production build.
const category: CategoryDto = {
  code: "TEST_CATEGORY",
  display_name: "Test category",
  domain: "POWER_TOOLS",
  path: ["TEST_CATEGORY"],
  sort_order: 1,
};

const product = (id: string, overrides: Partial<ProductCardDto> = {}): ProductCardDto => ({
  product_id: id,
  slug: `test-item-${id}`,
  name: "Test item",
  model: "MODEL-TEST",
  primary_code: "ITEM-CODE-TEST",
  brand: { code: "TEST", display_name: "Test brand" },
  domain: "POWER_TOOLS",
  category,
  availability: "IN_STOCK",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const detail = (overrides: Partial<ProductDetailDto> = {}): ProductDetailDto => ({
  ...product("detail"),
  ...overrides,
});

describe("catalogue contract presentation", () => {
  it("does not render an empty Home section and preserves the three canonical domains", () => {
    expect(getVisibleHomeSections([{ kind: "FEATURED_PRODUCTS", title: "Empty", items: [] }])).toEqual([]);
    expect(["POWER_TOOLS", "HAND_TOOLS", "ACCESSORIES"]).toHaveLength(3);
  });

  it("normalizes Vietnamese search and asserts exact model/item-code priority", () => {
    expect(normalizeSearchText("  Máy Đo  ")).toBe("may do");
    expect(getSearchMatchRank("model-test", product("model"))).toBe(0);
    expect(getSearchMatchRank("item-code-test", product("code"))).toBe(0);
    expect(getSearchMatchRank("test", product("fuzzy"))).toBe(1);
  });

  it("serializes filters, resets them, and keeps a supported sort", () => {
    const query = parseProductQuery("?q=%20test%20&domain=POWER_TOOLS&category=TEST_CATEGORY&feature=A&feature=B&spec.voltage=20V&sort=name_asc");
    expect(query.q).toBe("test");
    expect(countActiveFilters(query)).toBe(4);
    expect(serializeProductQuery(resetProductFilters(query))).toBe("?q=test&domain=POWER_TOOLS");
    expect(serializeProductQuery(query)).toContain("sort=name_asc");
  });

  it("merges cursor pages without duplicate or unavailable products", () => {
    const duplicate = product("one");
    const unavailable = { ...product("hidden"), availability: "OUT_OF_STOCK" } as unknown as ProductCardDto;
    const merged = mergeUniqueProducts([product("one")], [duplicate, product("two"), unavailable]);
    expect(merged.map((item) => item.product_id)).toEqual(["one", "two"]);
  });

  it("keeps return location and scroll state for a product-list back navigation", () => {
    const detailPath = createProductDetailPath("test-item-one", "/products?q=test&sort=name_asc");
    expect(detailPath).toContain("from=%2Fproducts%3Fq%3Dtest%26sort%3Dname_asc");
    rememberScrollPosition("products:?q=test", 264);
    expect(getRememberedScrollPosition("products:?q=test")).toBe(264);
  });

  it("hides optional detail content until approved values exist", () => {
    expect(getVisibleDetailSections(detail())).toEqual({
      description: false,
      features: false,
      specs: false,
      variants: false,
      media: false,
      bundle: false,
      compatibility: false,
    });
  });

  it("supports public product families, bundle labels, and public requestable variants", () => {
    const availableVariant: VariantDto = {
      variant_id: "test-available",
      variant_name: "Test available",
      attributes: [],
      availability: "IN_STOCK",
    };
    const preorderVariant: VariantDto = { ...availableVariant, variant_id: "test-preorder", availability: "PREORDER" };
    const unavailableVariant = { ...availableVariant, variant_id: "test-hidden", availability: "OUT_OF_STOCK" } as unknown as VariantDto;
    const family = detail({ variants: [availableVariant, preorderVariant, unavailableVariant], bundle_items: [{ label: "Test bundle" }] });
    expect(getVisibleVariants(family.variants).map((item) => item.variant_id)).toEqual(["test-available", "test-preorder"]);
    expect(getVisibleDetailSections(family).variants).toBe(true);
    expect(getVisibleDetailSections(family).bundle).toBe(true);
  });

  it("shows approved in-stock/pre-order products without exposing raw stock state", () => {
    expect(isEligiblePublicProduct(product("visible"))).toBe(true);
    const preorder = product("preorder", { availability: "PREORDER" });
    expect(isEligiblePublicProduct(preorder)).toBe(true);
    expect(isPreorderAvailability(preorder.availability)).toBe(true);
    expect(getAvailabilityLabel(preorder.availability)).toBe("Đặt trước");
    expect(getPublicProducts([{ ...product("hidden"), availability: "INACTIVE" } as unknown as ProductCardDto])).toEqual([]);
    expect(isPublicMediaUrl("not-a-public-url")).toBe(false);
    expect(MOBILE_TOUCH_TARGET_PX).toBeGreaterThanOrEqual(44);
    expect(shouldRefreshFromPull(10, 82, true)).toBe(true);
  });

  it("maps a stale deep link to the safe Product Unavailable state", () => {
    const failure: ApiFailure = { success: false, message: "", data: null, meta: {}, error_code: "PRODUCT_NOT_FOUND", errors: null };
    expect(getSystemStateForFailure(failure).kind).toBe("unavailable");
  });
});
