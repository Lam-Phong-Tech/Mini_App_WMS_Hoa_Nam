import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../pages/compare.tsx", import.meta.url), "utf8");
const style = readFileSync(new URL("./uat-dev6-tc-ui06.scss", import.meta.url), "utf8");

describe("UAT_Dev_v6 TC_UI_06 empty comparison flow", () => {
  it("lets the customer choose a category and a first model instead of showing a dead-end empty state", () => {
    expect(page).toContain("Danh mục so sánh");
    expect(page).toContain("Chọn model đầu tiên");
    expect(page).toContain("Danh sách model có thể so sánh");
    expect(page).not.toContain('aria-label="Chưa chọn sản phẩm để so sánh"');
  });

  it("keeps the first-model controls spacious and visible on the compare screen", () => {
    expect(style).toMatch(/\.compare-screen\s*\{\s*width: min\(100%, 960px\);\s*max-width: 960px;/);
    expect(style).toMatch(/\.compare-picker__list > button\s*\{[^}]*min-height: 88px;[^}]*grid-template-columns: 68px minmax\(0, 1fr\) 28px;/);
  });

  it("keeps a one-model selection focused until a second model is chosen", () => {
    expect(page).toMatch(/items\.length === 1 && phase === "ready"[\s\S]*Chọn thêm một model cùng danh mục để bắt đầu đối chiếu/);
    expect(page).toMatch(/products\.length >= 2 \? \([\s\S]*compare-features/);
    expect(page).toMatch(/products\.length \? \([\s\S]*Tư vấn \{products\.length\} sản phẩm/);
  });
});
