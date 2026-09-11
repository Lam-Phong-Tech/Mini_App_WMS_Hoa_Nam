import { describe, expect, it } from "vitest";

import {
  BOTTOM_NAVIGATION,
  FOUNDATION_ROUTES,
  getBottomNavigationKey,
} from "@/routes";

describe("foundation routing", () => {
  it("exposes only the three agreed bottom-navigation destinations", () => {
    expect(BOTTOM_NAVIGATION).toEqual([
      { key: "home", label: "Trang chủ", path: "/home" },
      { key: "categories", label: "Danh mục", path: "/categories" },
      { key: "contact", label: "Liên hệ", path: "/contact" },
    ]);
  });

  it("keeps foundation screens addressable without adding account or commerce routes", () => {
    expect(FOUNDATION_ROUTES.map((route) => route.path)).toEqual([
      "/",
      "/home",
      "/categories",
      "/products",
      "/search",
      "/filters",
      "/products/:slug",
      "/products/:slug/gallery",
      "/products/:slug/quote",
      "/contact",
      "/recent",
      "/saved",
      "/selection",
      "/compare",
      "/requests",
      "/help",
      "/system",
    ]);
    expect(getBottomNavigationKey("/products/example")).toBe("categories");
    expect(getBottomNavigationKey("/contact")).toBe("contact");
  });
});
