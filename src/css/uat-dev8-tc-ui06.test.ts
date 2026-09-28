import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const style = readFileSync(new URL("./uat-dev8-tc-ui06.scss", import.meta.url), "utf8");
const page = readFileSync(new URL("../pages/compare.tsx", import.meta.url), "utf8");

describe("UAT_Dev_v8 TC_UI_06 empty comparison picker geometry", () => {
  it("matches the approved mobile gutter, selector panel, and compact model rows", () => {
    expect(style).toMatch(/\.hn-page--compare \.hn-content\s*\{[^}]*padding: 20px 16px calc\(76px \+ var\(--hn-safe-bottom\)\);/);
    expect(style).toMatch(/\.hn-page--compare \.compare-picker\s*\{[^}]*gap: 12px;[^}]*padding: 16px;[^}]*border-radius: 14px;/);
    expect(style).toMatch(/\.hn-page--compare \.compare-picker__list > button\s*\{[^}]*min-height: 84px;[^}]*grid-template-columns: 60px minmax\(0, 1fr\) 24px;/);
    expect(style).toMatch(/\.hn-page--compare \.compare-picker__list \.public-image\s*\{[^}]*min-height: 50px;[^}]*height: 50px;[^}]*max-height: 50px;/);
    expect(page).toContain('<UiIcon name="listPlus" size={22} />');
    expect(page).toContain('<UiIcon name="listPlus" size={20} /> {items.length === 1');
  });
});
