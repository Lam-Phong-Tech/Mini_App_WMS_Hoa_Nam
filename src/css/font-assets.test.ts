import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheets = ["hoa-nam-theme.scss", "uat-reference.scss"];
const fontSources = stylesheets.flatMap((file) => {
  const css = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
  return Array.from(css.matchAll(/src:\s*url\("([^"\n]+\.(?:ttf|woff2))"\)/g)).map((match) => match[1]);
});

describe("deploy-safe Public Sans font assets", () => {
  it("keeps all eight font faces as imported relative assets instead of host-root public URLs", () => {
    expect(fontSources).toHaveLength(8);
    fontSources.forEach((source) => {
      expect(source.startsWith("../assets/fonts/")).toBe(true);
      expect(source.startsWith("/fonts/")).toBe(false);
    });
  });

  it("bundles byte-identical copies of the approved existing fonts", () => {
    fontSources.forEach((source) => {
      const filename = source.split("/").at(-1);
      const bundled = readFileSync(new URL(source, import.meta.url));
      const approved = readFileSync(new URL(`../../public/fonts/${filename}`, import.meta.url));
      expect(bundled.byteLength).toBeGreaterThan(1000);
      expect(createHash("sha256").update(bundled).digest("hex"))
        .toBe(createHash("sha256").update(approved).digest("hex"));
    });
  });

  it("preserves variable-weight Vietnamese, Latin extension and Latin unicode coverage", () => {
    const reference = readFileSync(new URL("./uat-reference.scss", import.meta.url), "utf8");
    expect(Array.from(reference.matchAll(/font-weight:\s*100 900;/g))).toHaveLength(3);
    expect(reference).toContain("U+1EA0-1EF9");
    expect(reference).toContain("U+100-2BA");
    expect(reference).toContain("U+0-FF");
  });

  it("inlines only the approved font directory instead of changing the global asset policy", () => {
    const config = readFileSync(new URL("../../vite.config.mts", import.meta.url), "utf8");
    expect(config).toContain('assetsInlineLimit: (filePath) => /\\/src\\/assets\\/fonts\\/[^/]+\\.(?:ttf|woff2)$/i.test(filePath.replace(/\\\\/g, "/"))');
    expect(config).not.toMatch(/assetsInlineLimit:\s*(?:Infinity|true)/);
  });
});
