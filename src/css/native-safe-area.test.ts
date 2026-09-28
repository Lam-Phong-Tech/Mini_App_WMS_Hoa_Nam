import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const native = readFileSync(new URL("./uat-native-safe-area.scss", import.meta.url), "utf8");
const entry = readFileSync(new URL("../app.ts", import.meta.url), "utf8");
const legacy = readFileSync(new URL("./hoa-nam-theme.scss", import.meta.url), "utf8");

describe("native safe-area regression guards", () => {
  it("uses native status-bar reservation plus a responsive Zalo capsule rail", () => {
    expect(native).toContain("configAppView plus `env(safe-area-inset-*)`");
    expect(legacy).toContain("--hn-safe-top: env(safe-area-inset-top, 0px)");
    expect(legacy).toContain("--hn-safe-bottom: env(safe-area-inset-bottom, 0px)");
    expect(legacy).toContain("--hn-zalo-capsule-clearance: clamp(88px, 23vw, 104px)");
    expect(legacy).toContain("var(--hn-zalo-capsule-clearance)");
    expect(legacy).not.toMatch(/--hn-safe-top:\s*max\(24px/);
    expect(legacy).not.toMatch(/--hn-safe-bottom:\s*max\(8px/);
  });

  it("lets the narrow wordmark fit without shrinking the 44px action targets", () => {
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
      "@/css/uat-dev8-tc-ui06.scss",
    ]);
  });

  it("keeps the iOS bottom safe area native-managed", () => {
    expect(entry).toContain('sdk?.configAppView({');
    expect(entry).toContain('statusBarType: "normal"');
    expect(entry).toContain("hideIOSSafeAreaBottom: false");
  });
});
