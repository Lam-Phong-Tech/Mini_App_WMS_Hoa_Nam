import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const style = readFileSync(new URL("./hoa-nam-theme.scss", import.meta.url), "utf8");
const productList = readFileSync(new URL("../pages/product-list.tsx", import.meta.url), "utf8");

describe("UAT_Dev_v7 TC_UI_21 catalogue filter controls", () => {
  it("shows every active customer-visible filter and a framed clear control", () => {
    expect(productList).toContain('getActiveCatalogueFilterCount(query, availability)');
    expect(productList).toContain('className="catalogue-active-filters__clear"');
    expect(style).toMatch(/\.catalogue-active-filters > button\.catalogue-active-filters__clear\s*\{[^}]*border-color: var\(--hn-primary\);[^}]*background: var\(--hn-surface\);/);
  });
});
