import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const style = readFileSync(new URL("./uat-dev6-tc-ui03.scss", import.meta.url), "utf8");

describe("UAT_Dev_6 TC_UI_03 product-card action treatment", () => {
  it("keeps Save and Compare as separate rounded controls without a split divider", () => {
    expect(style).toMatch(/\.product-card__actions\s*\{[^}]*display: flex;[^}]*gap: 6px;[^}]*border-top: 0;/);
    expect(style).toMatch(/\.product-card__actions > button,\s*\.product-card__actions > button \+ button\s*\{[^}]*border: 0;[^}]*border-radius: 8px;/);
  });

  it("uses the approved active state for both saved and compared products", () => {
    expect(style).toMatch(/button:is\(\.is-saved, \.is-compared\)\s*\{[^}]*color: #087b91;[^}]*background: #e5f6f8;/);
    expect(style).toMatch(/\.product-card__actions > button\.is-saved svg\s*\{\s*fill: currentColor;/);
  });

  it("keeps both active labels inside their pills at the narrow mobile breakpoint", () => {
    expect(style).toMatch(/@media \(max-width: 359px\)[\s\S]*?gap: 2px;[\s\S]*?font-size: 10px !important;/);
    expect(style).toMatch(/\.product-card__actions > :is\(\.product-card__save, \.product-card__compare\) svg\s*\{\s*width: 15px !important;\s*height: 15px !important;/);
  });
});
