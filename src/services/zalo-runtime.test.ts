import { afterEach, describe, expect, it, vi } from "vitest";

import { isZaloNativeHost, loadNativeZaloSdk } from "@/services/zalo-runtime";

describe("Zalo runtime boundary", () => {
  afterEach(() => {
    delete (window as Window & { ZJSBridge?: unknown }).ZJSBridge;
    vi.restoreAllMocks();
  });

  it("does not evaluate the native SDK in a normal browser", async () => {
    expect(isZaloNativeHost()).toBe(false);
    await expect(loadNativeZaloSdk()).resolves.toBeNull();
  });

  it("recognizes the native bridge before native-only SDK work", () => {
    (window as Window & { ZJSBridge?: unknown }).ZJSBridge = { callCustomAction: vi.fn() };
    expect(isZaloNativeHost()).toBe(true);
  });
});
