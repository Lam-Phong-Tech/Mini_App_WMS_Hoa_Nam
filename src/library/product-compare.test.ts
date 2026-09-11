import { describe, expect, it } from "vitest";

import { ComparisonItem, toggleComparisonProduct } from "@/library/product-compare";
import { DomainCode, ProductCardDto } from "@/types/public-api";

const product = (id: string, domain: DomainCode = "HAND_TOOLS", categoryCode = "CLAMPING_TOOLS"): ProductCardDto => ({
  product_id: id,
  slug: `product-${id}`,
  name: `Product ${id}`,
  brand: { code: "BRAND", display_name: "Brand" },
  domain,
  category: { code: categoryCode, display_name: "Category", domain, parent_code: null, path: [domain, categoryCode], sort_order: 1 },
  availability: "IN_STOCK",
  updated_at: "2026-09-10T00:00:00+07:00",
});

describe("G4 product comparison selection", () => {
  it("adds, removes and limits comparison to three products", () => {
    const first = toggleComparisonProduct([], product("one"));
    const second = toggleComparisonProduct(first.items, product("two"));
    const third = toggleComparisonProduct(second.items, product("three"));
    const limited = toggleComparisonProduct(third.items, product("four"));
    const removed = toggleComparisonProduct(third.items, product("two"));

    expect(first.outcome).toBe("added");
    expect(second.items).toHaveLength(2);
    expect(limited).toEqual({ outcome: "limit", items: third.items });
    expect(removed.outcome).toBe("removed");
    expect(removed.items.map((item) => item.product_id)).toEqual(["one", "three"]);
  });

  it("refuses cross-domain or cross-category selection", () => {
    const selected: ComparisonItem[] = [{ product_id: "one", slug: "product-one", domain: "HAND_TOOLS", category_code: "CLAMPING_TOOLS" }];
    expect(toggleComparisonProduct(selected, product("two", "POWER_TOOLS", "PT_DRILL_DRIVER")).outcome).toBe("category");
    expect(toggleComparisonProduct(selected, product("three", "HAND_TOOLS", "WRENCHES")).outcome).toBe("category");
  });
});
