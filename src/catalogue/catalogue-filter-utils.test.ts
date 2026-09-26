import { describe, expect, it } from "vitest";

import { getCatalogueCountCopy, getCategoryFilterLabel, getCategoryProductTotal } from "@/catalogue/catalogue-filter-utils";
import { CategoryDto } from "@/types/public-api";

const category = (code: string, product_count?: number, domain: CategoryDto["domain"] = "HAND_TOOLS"): CategoryDto => ({
  code,
  display_name: code === "MEASURING_TOOLS" ? "Dụng cụ đo lường" : `Nhãn ${code}`,
  domain,
  path: [domain, code],
  sort_order: 1,
  product_count,
});

describe("catalogue filter labels and exact public counts", () => {
  const categories = [category("MEASURING_TOOLS", 59), category("CLAMPING_TOOLS", 71), category("DRILL", 10, "POWER_TOOLS")];

  it("uses API taxonomy labels for every category rather than a short hardcoded map", () => {
    expect(getCategoryFilterLabel("MEASURING_TOOLS", categories)).toBe("Dụng cụ đo lường");
    expect(getCategoryFilterLabel("UNMAPPED_INTERNAL_CODE", [])).toBe("Danh mục đã chọn");
  });

  it("gets exact category and domain counts from published category counts", () => {
    expect(getCategoryProductTotal({ domain: "HAND_TOOLS", category: "MEASURING_TOOLS" }, categories)).toBe(59);
    expect(getCategoryProductTotal({ domain: "HAND_TOOLS" }, categories)).toBe(130);
    expect(getCategoryProductTotal({}, categories)).toBe(140);
    expect(getCategoryProductTotal({ domain: "ACCESSORIES" }, [])).toBe(0);
  });

  it("does not fabricate totals for unknown categories, missing counts or narrowed searches", () => {
    expect(getCategoryProductTotal({ category: "UNKNOWN" }, categories)).toBeNull();
    expect(getCategoryProductTotal({}, [category("UNKNOWN")])).toBeNull();
    expect(getCategoryProductTotal({}, [category("INVALID", -1)])).toBeNull();
    expect(getCategoryProductTotal({ q: "thước" }, categories)).toBeNull();
    expect(getCategoryProductTotal({ power_source: "BATTERY" }, categories)).toBeNull();
    expect(getCategoryProductTotal({ feature: ["LASER"] }, categories)).toBeNull();
    expect(getCategoryProductTotal({ spec: { weight: "200g" } }, categories)).toBeNull();
  });

  it("does not add a parent category count on top of its child count", () => {
    expect(getCategoryProductTotal({}, [category("PARENT", 20), { ...category("CHILD", 10), parent_code: "PARENT" }])).toBeNull();
  });

  it("does not claim the first 20 cards are the whole 59-product catalogue", () => {
    expect(getCatalogueCountCopy(20, 59, true)).toEqual({ result: "59 sản phẩm", progress: "Đã hiển thị 20/59 sản phẩm" });
    expect(getCatalogueCountCopy(40, 59, true).progress).toBe("Đã hiển thị 40/59 sản phẩm");
    expect(getCatalogueCountCopy(59, 59, false).progress).toBe("Đã hiển thị 59/59 sản phẩm");
  });

  it("keeps cursor-backed unknown totals honest, including a stale too-small API count", () => {
    expect(getCatalogueCountCopy(20, null, true)).toEqual({ result: "20 sản phẩm đã hiển thị", progress: "Đã hiển thị 20 sản phẩm · Còn sản phẩm" });
    expect(getCatalogueCountCopy(20, 20, true).progress).not.toBe("Đã hiển thị 20/20 sản phẩm");
    expect(getCatalogueCountCopy(7, null, false).progress).toBe("Đã hiển thị 7/7 sản phẩm");
  });
});
