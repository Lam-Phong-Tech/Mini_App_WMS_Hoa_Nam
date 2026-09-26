import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../pages/search.tsx", import.meta.url), "utf8");
const style = readFileSync(new URL("./uat-dev6-tc-ui08.scss", import.meta.url), "utf8");

describe("UAT_Dev_v6 TC_UI_08 search results", () => {
  it("renders the approved single-column search list instead of the catalogue grid", () => {
    expect(page).toContain('<SearchResultList products={visibleProducts} returnPath={returnPath} />');
    expect(page).not.toContain('<ProductGrid products={visibleProducts}');
    expect(page).not.toContain('search-results-heading');
  });

  it("reports a complete displayed/total product count at the end of search results", () => {
    expect(page).toContain('Đã hiển thị {visibleProducts.length} / {displayedTotal} sản phẩm');
    expect(style).toMatch(/\.search-screen__progress\s*\{[^}]*text-align: center;/);
  });
});
