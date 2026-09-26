import { describe, expect, it } from "vitest";

import { needsHomeDomainCandidates, selectHomeCatalogue } from "@/catalogue/home-catalogue";
import { ProductCardDto } from "@/types/public-api";

const product = (id: string, domain: ProductCardDto["domain"], availability: ProductCardDto["availability"]): ProductCardDto => ({
  product_id: id,
  slug: `test-${id}`,
  name: `Sản phẩm thử ${id}`,
  primary_code: id,
  domain,
  category: { code: "TEST", display_name: "Danh mục thử", domain, path: ["TEST"], sort_order: 1 },
  brand: { code: "TEST", display_name: "Thương hiệu thử" },
  availability,
  updated_at: "2026-09-23T00:00:00Z",
});

const batch = (count: number, domain: ProductCardDto["domain"], availability: ProductCardDto["availability"]) =>
  Array.from({ length: count }, (_, index) => product(`${domain}-${availability}-${index}`, domain, availability));

describe("Home real-stock catalogue selection", () => {
  it("continues past a full all-in-stock page to find real preorder records", () => {
    const firstPage = batch(20, "POWER_TOOLS", "IN_STOCK");
    expect(needsHomeDomainCandidates(firstPage, "POWER_TOOLS")).toBe(true);
    expect(needsHomeDomainCandidates([...firstPage, ...batch(4, "POWER_TOOLS", "PREORDER")], "POWER_TOOLS")).toBe(false);
  });

  it("selects exactly 20 products in the approved domain and availability mix when available", () => {
    const power = [...batch(20, "POWER_TOOLS", "IN_STOCK"), ...batch(8, "POWER_TOOLS", "PREORDER")];
    const hand = [...batch(20, "HAND_TOOLS", "IN_STOCK"), ...batch(8, "HAND_TOOLS", "PREORDER")];
    const result = selectHomeCatalogue(power, hand);
    expect(result).toHaveLength(20);
    expect(result.filter((item) => item.domain === "POWER_TOOLS")).toHaveLength(14);
    expect(result.filter((item) => item.domain === "HAND_TOOLS")).toHaveLength(6);
    expect(result.filter((item) => item.availability === "IN_STOCK")).toHaveLength(14);
    expect(result.filter((item) => item.availability === "PREORDER")).toHaveLength(6);
    expect(result.every((item) => power.includes(item) || hand.includes(item))).toBe(true);
  });

  it("keeps 20 real products when a domain genuinely has no preorders without changing statuses", () => {
    const power = [...batch(20, "POWER_TOOLS", "IN_STOCK"), ...batch(4, "POWER_TOOLS", "PREORDER")];
    const hand = batch(20, "HAND_TOOLS", "IN_STOCK");
    const result = selectHomeCatalogue(power, hand);
    expect(result).toHaveLength(20);
    expect(result.filter((item) => item.availability === "PREORDER")).toHaveLength(4);
    expect(result.filter((item) => item.domain === "HAND_TOOLS").every((item) => item.availability === "IN_STOCK")).toBe(true);
  });

  it("deduplicates identities, ignores other domains and does not fabricate missing products", () => {
    const power = batch(3, "POWER_TOOLS", "IN_STOCK");
    const hand = batch(2, "HAND_TOOLS", "PREORDER");
    const result = selectHomeCatalogue([...power, ...power, ...hand], [...hand, ...power]);
    expect(result).toHaveLength(5);
    expect(new Set(result.map((item) => item.product_id)).size).toBe(5);
  });
});
