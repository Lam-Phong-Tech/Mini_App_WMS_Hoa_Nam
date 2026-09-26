import { describe, expect, it } from "vitest";

import { createProductSelectionSnapshot, getProductModelLabel } from "@/catalogue/product-identity";

describe("selected product model identity", () => {
  it("distinguishes products sharing a model series using their public codes", () => {
    const products = ["DCPL04-8", "DCPL16-162", "DCPL165"].map((primary_code) => ({
      product_id: `test-${primary_code}`,
      name: `Máy khoan ${primary_code}`,
      model: "DongCheng sê-ri DCPL",
      primary_code,
    }));

    expect(products.map(getProductModelLabel)).toEqual(["DCPL04-8", "DCPL16-162", "DCPL165"]);
    expect(products.map(createProductSelectionSnapshot).map(getProductModelLabel))
      .toEqual(["DCPL04-8", "DCPL16-162", "DCPL165"]);
  });

  it("normalizes visible text and falls back only when public identifiers are missing", () => {
    expect(getProductModelLabel({ primary_code: " DCPL04-8 ", model: "DCPL", name: "Máy khoan" }))
      .toBe("DCPL04-8");
    expect(getProductModelLabel({ primary_code: "n/a", model: " MODEL-A ", name: "Máy khoan" }))
      .toBe("MODEL-A");
    expect(getProductModelLabel({ primary_code: "-", model: "null", name: " Máy khoan " }))
      .toBe("Máy khoan");
    expect(getProductModelLabel({ model: "undefined", name: "" })).toBe("Sản phẩm đã chọn");
  });

  it("does not retain additional or private product fields in a quote snapshot", () => {
    const product = {
      product_id: "test-product",
      name: "Máy khoan",
      primary_code: "DCPL04-8",
      model: "DCPL",
      internal_cost: 123,
      barcode: "private-test-code",
    };
    expect(createProductSelectionSnapshot(product)).toEqual({
      product_id: "test-product",
      name: "Máy khoan",
      model: "DCPL04-8",
    });
  });
});
