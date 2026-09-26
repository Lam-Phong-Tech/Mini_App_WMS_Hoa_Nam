import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const list = readFileSync(new URL("../pages/product-list.tsx", import.meta.url), "utf8");
const style = readFileSync(new URL("./uat-dev6-tc-ui17.scss", import.meta.url), "utf8");

describe("UAT_Dev_v6 TC_UI_17 empty product category", () => {
  it("shows the approved no-results copy and reset-filter recovery", () => {
    expect(list).toContain("Chưa tìm thấy sản phẩm phù hợp");
    expect(list).toContain("Thử từ khóa khác hoặc xóa bộ lọc để xem thêm sản phẩm.");
    expect(list).toContain("Xem tất cả sản phẩm");
    expect(list).not.toContain('<EmptyCatalogue onRetry={() => void results.reload()} />');
  });

  it("keeps the empty state legible and actionable at phone width", () => {
    expect(style).toMatch(/\.catalogue-empty-category\s*\{[^}]*justify-items: center;[^}]*border-radius: 16px;/);
    expect(style).toMatch(/\.catalogue-empty-category button\s*\{[^}]*background: var\(--hn-gradient-primary\);/);
  });
});
