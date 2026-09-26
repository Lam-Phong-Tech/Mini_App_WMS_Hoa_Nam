import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { getFocusedFieldScrollDelta, isNativeKeyboardVisible } from "@/hooks/use-native-keyboard";

describe("native keyboard visibility and focused field clearance", () => {
  const viewport = { native: true, editableFocused: true, baselineHeight: 889, viewportHeight: 584 };

  it("detects the measured native keyboard shrink, not focus alone", () => {
    expect(isNativeKeyboardVisible(viewport)).toBe(true);
    expect(isNativeKeyboardVisible({ ...viewport, viewportHeight: 889 })).toBe(false);
    expect(isNativeKeyboardVisible({ ...viewport, viewportHeight: 840 })).toBe(false);
    expect(isNativeKeyboardVisible({ ...viewport, editableFocused: false })).toBe(false);
  });

  it("does not alter browser, hardware keyboard or pinch-zoom layouts", () => {
    expect(isNativeKeyboardVisible({ ...viewport, native: false })).toBe(false);
    expect(isNativeKeyboardVisible({ ...viewport, scale: 1.5 })).toBe(false);
    expect(isNativeKeyboardVisible({ ...viewport, viewportHeight: 0 })).toBe(false);
  });

  it("stays hidden through focus hand-off and restores navigation when the keyboard closes", () => {
    expect(isNativeKeyboardVisible({ ...viewport, editableFocused: false, wasOpen: true })).toBe(true);
    expect(isNativeKeyboardVisible({ ...viewport, wasOpen: true, viewportHeight: 889 })).toBe(false);
  });

  it("moves the observed clipped name field above the keyboard with a safety margin", () => {
    const delta = getFocusedFieldScrollDelta(543.4, 593.1, 100, 584);
    expect(delta).toBeCloseTo(21.1);
    expect(593.1 - delta).toBeCloseTo(572);
    expect(getFocusedFieldScrollDelta(300, 350, 100, 584)).toBe(0);
  });

  it("clears a sticky header, supports long fields and ignores invalid geometry", () => {
    expect(getFocusedFieldScrollDelta(90, 140, 100, 584)).toBe(-22);
    expect(getFocusedFieldScrollDelta(130, 900, 100, 584)).toBe(18);
    expect(getFocusedFieldScrollDelta(NaN, 140, 100, 584)).toBe(0);
    expect(getFocusedFieldScrollDelta(300, 350, 100, 110)).toBe(0);
  });

  it("keeps keyboard styling scoped to native open state and leaves form children mounted", () => {
    const css = readFileSync(new URL("../css/native-keyboard.scss", import.meta.url), "utf8");
    const shell = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");
    expect(css).not.toContain('[data-host="browser"]');
    expect(css).toContain('[data-host="zalo"] .hn-page.hn-page--keyboard-open');
    expect(shell).toContain("showNavigation && !keyboardOpen");
    expect(shell).not.toContain("keyboardOpen ? null : children");
  });
});
