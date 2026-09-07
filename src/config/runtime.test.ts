import { describe, expect, it } from "vitest";

import { createRuntimeSettings } from "@/config/runtime";

describe("runtime settings", () => {
  it("uses the empty DEV mock by default during a DEV build", () => {
    expect(createRuntimeSettings({ DEV: true })).toMatchObject({
      environment: "DEV",
      useDevMock: true,
      apiBaseUrl: "",
    });
  });

  it("routes an explicit DEV mock opt-out through the local API proxy", () => {
    expect(
      createRuntimeSettings({
        DEV: true,
        VITE_USE_DEV_MOCK: "false",
        VITE_PUBLIC_API_BASE_URL: "https://public.example/",
      }),
    ).toMatchObject({
      useDevMock: false,
      apiBaseUrl: "",
    });
  });

  it("keeps the configured public API origin in a deployed build", () => {
    expect(
      createRuntimeSettings({
        DEV: false,
        VITE_USE_DEV_MOCK: "false",
        VITE_PUBLIC_API_BASE_URL: "https://public.example/",
      }),
    ).toMatchObject({
      useDevMock: false,
      apiBaseUrl: "https://public.example",
    });
  });

  it("allows an explicitly labelled DEV preview build to use the fixture after deployment", () => {
    expect(
      createRuntimeSettings({
        DEV: false,
        VITE_APP_ENV: "DEV",
        VITE_USE_DEV_MOCK: "true",
        VITE_APP_VERSION: "0.0.0-dev-preview",
      }),
    ).toMatchObject({
      environment: "DEV",
      useDevMock: true,
      appVersion: "0.0.0-dev-preview",
    });
  });

  it("never enables the DEV fixture in UAT or Production", () => {
    expect(
      createRuntimeSettings({
        DEV: true,
        VITE_APP_ENV: "UAT",
        VITE_USE_DEV_MOCK: "true",
      }).useDevMock,
    ).toBe(false);
  });
});
