import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reference = readFileSync(new URL("./uat-reference.scss", import.meta.url), "utf8");

describe("native Home approved-surface parity guards", () => {
  it("removes only legacy search, Home-domain and product-card shadows while retaining focus feedback", () => {
    expect(reference).toMatch(/\.hn-theme :is\(\.hn-topbar-search, \.product-card\),\s*\.hn-page--home \.domain-card\s*\{\s*box-shadow: none;\s*\}/);
    expect(reference).toMatch(/\.hn-topbar-search--input:focus-within\s*\{[^}]*box-shadow: var\(--hn-focus-ring\)/);
  });

  it("uses the approved mobile Home domain-icon box and glyph dimensions", () => {
    expect(reference).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.hn-page--home \.domain-icon\s*\{\s*width: 40px;\s*height: 40px;\s*border-radius: 9\.6px;\s*\}/);
    expect(reference).toMatch(/\.hn-page--home \.domain-icon svg\s*\{\s*width: 20\.8px;\s*height: 20\.8px;\s*\}/);
  });
});
