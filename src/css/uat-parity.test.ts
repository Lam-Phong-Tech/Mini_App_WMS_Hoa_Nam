import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reference = readFileSync(new URL("./uat-reference.scss", import.meta.url), "utf8");
const legacy = readFileSync(new URL("./hoa-nam-theme.scss", import.meta.url), "utf8");
const quote = readFileSync(new URL("./uat-quote-contact.scss", import.meta.url), "utf8");
const shell = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");

describe("UAT responsive regression guards", () => {
  it("does not let a fixed mobile navigation override erase the safe bottom inset", () => {
    expect(legacy).not.toMatch(/\.hn-bottom-navigation\s*\{[^}]*height:\s*64px\s*!important/);
    expect(reference).toContain("min-height: calc(64px + var(--hn-safe-bottom))");
    expect(reference).toContain("padding: 4px 16px max(4px, var(--hn-safe-bottom))");
  });

  it("keeps search focus on the outer surface and suppresses the duplicate native clear icon", () => {
    expect(reference).toContain(".hn-topbar-search--input:focus-within");
    expect(reference).toMatch(/input:is\(:focus, :focus-visible\)[\s\S]*?outline: 0;[\s\S]*?box-shadow: none;/);
    expect(reference).toMatch(/::-webkit-search-cancel-button[\s\S]*?display: none;/);
  });

  it("allows a highlighted bottom tab to leave a child route", () => {
    expect(shell).toContain("if (location.pathname !== item.path) navigate(item.path");
    expect(shell).not.toContain("if (activeKey !== item.key) navigate");
  });

  it("lets quote item names wrap instead of inheriting legacy nowrap clipping", () => {
    expect(quote).toMatch(/\.quote-selected-item__copy\s*\{[^}]*white-space: normal;/);
    expect(quote).toMatch(/\.quote-selected-item__copy\s*\{[^}]*overflow: visible;/);
  });

  it("keeps the comparison notice visible after choosing a card lower in a scrolled grid", () => {
    expect(reference).toMatch(/\.compare-notice\s*\{[^}]*position: fixed;[^}]*z-index: 75;[^}]*top: calc\(var\(--hn-safe-top\) \+ 144px\);/);
    expect(reference).toMatch(/\.compare-notice\s*\{[^}]*width: min\(calc\(100% - 32px\), 1280px\);/);
    expect(reference).toMatch(/\.compare-notice\s*\{[^}]*background: var\(--hn-surface\);/);
  });
});
