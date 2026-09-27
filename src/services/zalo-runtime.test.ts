import { afterEach, describe, expect, it, vi } from "vitest";

import { isZaloNativeHost, loadNativeZaloSdk } from "@/services/zalo-runtime";

describe("Zalo runtime boundary", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
    vi.restoreAllMocks();
  });

  it("does not evaluate the native SDK in a normal browser", async () => {
    expect(isZaloNativeHost()).toBe(false);
    await expect(loadNativeZaloSdk()).resolves.toBeNull();
  });

  it("recognizes the native bridge before native-only SDK work", () => {
    Object.assign(globalThis, { window: { ZJSBridge: { callCustomAction: vi.fn() } } });
    expect(isZaloNativeHost()).toBe(true);
  });
});
