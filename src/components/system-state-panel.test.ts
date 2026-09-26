import { createElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SystemStatePanel } from "@/components/system-state-panel";
import { createNoNetworkState } from "@/state/system-state";
import { PublicConfigDto } from "@/types/public-api";

const { mockUseAppContext } = vi.hoisted(() => ({ mockUseAppContext: vi.fn() }));
vi.mock("@/state/app-context", () => ({ useAppContext: mockUseAppContext }));
vi.mock("zmp-ui", () => ({
  Button: ({ children }: { children: ReactNode }) => createElement("button", { type: "button" }, children),
  Spinner: () => createElement("span", { className: "test-spinner" }),
}));

const config: PublicConfigDto = {
  config_version: "test",
  hotline: { display: "090 123 4567", tel: "090 123 4567" },
  zalo_oa: null,
  support_hours: null,
  privacy_policy_url: null,
  privacy_version: null,
  maintenance: { enabled: false, message: null, estimated_end_at: null },
  min_supported_app_version: null,
  feature_flags: {},
};

describe("offline system-state controls", () => {
  beforeEach(() => mockUseAppContext.mockReturnValue({ config }));

  it("renders one Retry with refresh icon and the configured hotline below it", () => {
    const html = renderToStaticMarkup(createElement(SystemStatePanel, { state: createNoNetworkState(), onRetry: vi.fn() }));
    expect(html).toContain("system-state__actions");
    expect(html).toContain("lucide-refresh-cw");
    expect(html).toContain('href="tel:0901234567"');
    expect(html.match(/Thử lại/g)).toHaveLength(1);
    expect(html.match(/Gọi hotline/g)).toHaveLength(1);
    expect(html.indexOf("Thử lại")).toBeLessThan(html.indexOf("Gọi hotline"));
  });

  it("prefers the configured fallback and can still call the approved public hotline on a cold offline visit", () => {
    mockUseAppContext.mockReturnValue({ config: { ...config, hotline: null, hotline_fallback: { display: "1800 0000", tel: "1800 0000" } } });
    expect(renderToStaticMarkup(createElement(SystemStatePanel, { state: createNoNetworkState() }))).toContain('href="tel:18000000"');

    mockUseAppContext.mockReturnValue({ config: null });
    expect(renderToStaticMarkup(createElement(SystemStatePanel, { state: createNoNetworkState() }))).toContain('href="tel:0986366675"');
  });

  it("does not render an offline hotline for an API error", () => {
    const html = renderToStaticMarkup(createElement(SystemStatePanel, {
      state: { kind: "api-error", title: "Không thể tải dữ liệu", message: "Vui lòng thử lại sau ít phút." },
      onRetry: vi.fn(),
    }));
    expect(html).toContain("Thử lại");
    expect(html).not.toContain("Gọi hotline");
    expect(html).not.toContain("tel:");
  });
});
