import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detail = readFileSync(new URL("../components/catalogue/product-detail-template.tsx", import.meta.url), "utf8");
const gallery = readFileSync(new URL("../components/catalogue/product-gallery.tsx", import.meta.url), "utf8");
const style = readFileSync(new URL("./uat-dev6-tc-ui16.scss", import.meta.url), "utf8");

describe("UAT_Dev_v6 TC_UI_16 product information status", () => {
  it("renders availability as a labelled status pill with the matching icon", () => {
    expect(detail).toContain('className="detail-template__availability"');
    expect(detail).toContain('fact.state === "is-preorder" ? "clock" : "checkCircle"');
  });

  it("preserves a bordered status pill for both in-stock and preorder states", () => {
    expect(style).toMatch(/\.detail-template__classification \.detail-template__availability\s*\{[^}]*border: 1px solid var\(--hn-border\);[^}]*border-radius: 8px;/);
    expect(style).toMatch(/\.detail-template__classification dd\.is-preorder \.detail-template__availability\s*\{[^}]*border-color: var\(--hn-warning\);/);
  });

  it("uses a titled gallery surface with an explicit close control for large images", () => {
    expect(gallery).toContain("Ảnh sản phẩm");
    expect(gallery).toContain('aria-label="Đóng ảnh sản phẩm"');
    expect(style).toMatch(/\.product-gallery--full \{[^}]*border-radius: 20px;/);
    expect(style).toMatch(/\.product-gallery--full \.product-gallery__full-heading \{[^}]*border-bottom: 1px solid var\(--hn-border\);/);
  });
});
