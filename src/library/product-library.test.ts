import { describe, expect, it } from "vitest";

import { orderProductsByIds, putProductIdFirst, readProductIds, removeMissingProductIds, toggleProductId, writeProductIds } from "@/library/product-library";

const first = "01a07c56-2f4b-737b-9170-0bf423e9ffb1";
const second = "01a07c56-2f54-72ac-9302-7ea66f02aa80";

const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
};

describe("ID-only recent and saved product storage", () => {
  it("persists only normalized UUID IDs and safely ignores corrupt state", () => {
    const target = storage();
    expect(writeProductIds(target, "saved", [first, "bad", first.toUpperCase()], 100)).toBe(true);
    expect(readProductIds(target, "saved", 100)).toEqual([first]);
    target.setItem("hn-product-library-v1:recent", "not-json");
    expect(readProductIds(target, "recent", 30)).toEqual([]);
  });

  it("moves recent IDs to the front and toggles saved without metadata", () => {
    expect(putProductIdFirst([second, first], first, 30)).toEqual([first, second]);
    expect(toggleProductId([first], first, 100)).toEqual([]);
    expect(toggleProductId([], second, 100)).toEqual([second]);
  });

  it("removes only successful missing IDs and keeps PREORDER/current records ordered", () => {
    expect(removeMissingProductIds([second, first], [first])).toEqual([second]);
    const products = [
      { product_id: first, name: "A" },
      { product_id: second, name: "B" },
    ] as never[];
    expect(orderProductsByIds([second, first], products)).toEqual([products[1], products[0]]);
  });
});
