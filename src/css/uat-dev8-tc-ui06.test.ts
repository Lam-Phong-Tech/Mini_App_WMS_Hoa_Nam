import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const style = readFileSync(new URL("./uat-dev8-tc-ui06.scss", import.meta.url), "utf8");

describe("UAT_Dev_v8 TC_UI_06 empty comparison picker geometry", () => {
  it("matches the approved mobile gutter, selector panel, and compact model rows", () => {
    expect(style).toMatch(/\.hn-page--compare \.hn-content\s*\{[^}]*padding: 20px 16px calc\(76px \+ var\(--hn-safe-bottom\)\);/);
    expect(style).toMatch(/\.hn-page--compare \.compare-picker\s*\{[^}]*gap: 12px;[^}]*padding: 16px;[^}]*border-radius: 14px;/);
    expect(style).toMatch(/\.hn-page--compare \.compare-picker__list > button\s*\{[^}]*min-height: 84px;[^}]*grid-template-columns: 60px minmax\(0, 1fr\) 24px;/);
  });
});
