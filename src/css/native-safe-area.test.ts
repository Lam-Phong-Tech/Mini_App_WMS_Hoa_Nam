import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const native = readFileSync(new URL("./uat-native-safe-area.scss", import.meta.url), "utf8");
const entry = readFileSync(new URL("../app.ts", import.meta.url), "utf8");
const legacy = readFileSync(new URL("./hoa-nam-theme.scss", import.meta.url), "utf8");

describe("native capsule clearance regression guards", () => {
  it("scopes every new declaration to the native host so browser parity is unaffected", () => {
    const rules = Array.from(native.matchAll(/([^\n{}]+)\{([^{}]*)\}/g));
    expect(rules.length).toBeGreaterThanOrEqual(5);
    rules.forEach((rule) => expect(rule[1].trim().startsWith('[data-host="zalo"]')).toBe(true));
    expect(native).not.toContain('[data-host="browser"]');
  });

  it("reserves the measured capsule rail plus the hardware right inset", () => {
    expect(native).toMatch(/@media \(max-width: 700px\)[\s\S]*?padding-right: calc\(104px \+ env\(safe-area-inset-right, 0px\)\);/);
    const measuredCapsuleRail = (1440 - 1115) / (560 / 160);
    expect(104 - measuredCapsuleRail).toBeGreaterThanOrEqual(8);
  });

  it("moves the native comparison remove-action centre clear of the host debug overlay without changing browser cards", () => {
    expect(native).toMatch(/\[data-host="zalo"\] \.compare-card\s*\{\s*grid-template-columns: minmax\(0, 1fr\) 72px;/);
    expect(native).toMatch(/\[data-host="zalo"\] \.compare-roster \.compare-remove\s*\{\s*width: 72px;/);
  });

  it("lets the native wordmark fit the narrow grid without shrinking the 44px action targets", () => {
    expect(native).toMatch(/@media \(max-width: 380px\)[\s\S]*?\.hn-wordmark__logo\s*\{[^}]*min-width: 36px;[^}]*flex: 0 1 60px;/);
    expect(native).toMatch(/\.hn-wordmark__copy\s*\{\s*flex: 0 0 auto;/);
    expect(native).toMatch(/@media \(max-width: 340px\)[\s\S]*?gap: 3px;/);
    expect(native).not.toMatch(/\.hn-header-action\s*\{/);
    expect(legacy).toMatch(/\.hn-header--zalo-capsule-safe \.hn-header-action\s*\{\s*width: 44px;\s*height: 44px;/);
  });

  it("imports native compensation after every visual reference stylesheet", () => {
    const imports = Array.from(entry.matchAll(/import "([^"\n]+\.(?:scss|css))";/g), (match) => match[1]);
    const nativeIndex = imports.indexOf("@/css/uat-native-safe-area.scss");
    for (const visual of ["@/css/uat-reference.scss", "@/css/uat-quote-contact.scss", "@/css/uat-detail-reference.scss"]) {
      expect(nativeIndex).toBeGreaterThan(imports.indexOf(visual));
    }
    expect(imports.slice(nativeIndex + 1)).toEqual([
      "@/css/native-keyboard.scss",
      "@/css/uat-dev6-tc-ui03.scss",
      "@/css/uat-dev6-tc-ui04.scss",
      "@/css/uat-dev6-tc-ui05.scss",
      "@/css/uat-dev6-tc-ui06.scss",
      "@/css/uat-dev6-tc-ui07.scss",
      "@/css/uat-dev6-tc-ui08.scss",
      "@/css/uat-dev6-tc-ui16.scss",
      "@/css/uat-dev6-tc-ui17.scss",
    ]);
  });
});
