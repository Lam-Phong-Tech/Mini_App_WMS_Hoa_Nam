import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const comparison = readFileSync(new URL("../state/compare-context.tsx", import.meta.url), "utf8");
const style = readFileSync(new URL("./uat-dev6-tc-ui05.scss", import.meta.url), "utf8");

describe("UAT_Dev_v6 TC_UI_05 cross-category comparison notice", () => {
  it("shows the approved actionable guidance and keeps the comparison link available", () => {
    expect(comparison).toContain("Hãy chọn các sản phẩm cùng danh mục để so sánh. Bạn có thể xóa lựa chọn hiện tại để đổi danh mục.");
    expect(comparison).toMatch(/result\.outcome === "category"[\s\S]*?canOpenComparison: true/);
  });

  it("uses the pale-blue notice surface from the approved sample", () => {
    expect(style).toMatch(/\.compare-notice\s*\{\s*background: #eef4f4;/);
  });

  it("preserves message space at phone width rather than expanding the action link", () => {
    expect(style).toMatch(/@media \(max-width: 700px\)[\s\S]*?padding: 10px 12px;[\s\S]*?font-size: 13px;/);
    expect(style).toMatch(/\.compare-notice > button:not\(:last-child\)\s*\{\s*min-height: 34px;\s*padding-right: 2px;\s*padding-left: 2px;/);
  });
});
