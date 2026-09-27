import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync(new URL("./app-shell.tsx", import.meta.url), "utf8");

describe("app shell logo asset", () => {
  it("resolves the approved logo from the module host for Zalo Device mode", () => {
    expect(shell).toContain('new URL("/hoa-nam-logo.png", import.meta.url).href');
    expect(shell).toContain('<img src={hoaNamLogoUrl} alt="" />');
    expect(shell).not.toContain('<img src="/hoa-nam-logo.png" alt="" />');
  });
});
