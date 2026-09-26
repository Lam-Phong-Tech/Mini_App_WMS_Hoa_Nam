import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const style = readFileSync(new URL("./uat-dev6-tc-ui04.scss", import.meta.url), "utf8");
const home = readFileSync(new URL("../pages/index.tsx", import.meta.url), "utf8");

describe("UAT_Dev_v6 TC_UI_04 home catalogue counter", () => {
  it("keeps the dynamic product count beside the availability controls", () => {
    expect(home).toMatch(/home-catalogue-toolbar[\s\S]*?AvailabilityFilter[\s\S]*?visibleFeaturedProducts\.length} sản phẩm/);
    expect(style).toMatch(/\.home-catalogue-toolbar \.availability-filter__options\s*\{\s*flex-wrap: nowrap;\s*gap: 4px;/);
  });

  it("uses compact controls at 375px and a narrower fallback below 360px", () => {
    expect(style).toMatch(/@media \(max-width: 700px\)[\s\S]*?min-height: 40px;[\s\S]*?font-size: 12px;/);
    expect(style).toMatch(/@media \(max-width: 359px\)[\s\S]*?font-size: 10px;/);
  });
});
