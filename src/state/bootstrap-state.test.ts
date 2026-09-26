import { describe, expect, it } from "vitest";

import { createSafeFailure } from "@/services/api-client";
import { BootstrapState, markBootstrapOffline, resolveBootstrapState } from "@/state/bootstrap-state";
import { ApiSuccess, HomeDto, PublicConfigDto } from "@/types/public-api";

const publicConfig: PublicConfigDto = {
  config_version: "test",
  hotline: { display: "090 123 4567", tel: "0901234567" },
  zalo_oa: null,
  support_hours: null,
  privacy_policy_url: null,
  privacy_version: null,
  maintenance: { enabled: false, message: null, estimated_end_at: null },
  min_supported_app_version: null,
  feature_flags: {},
};
const previousHome: HomeDto = { domains: [{ code: "POWER_TOOLS", display_name: "Máy công cụ" }], sections: [] };
const freshHome: HomeDto = { domains: [{ code: "HAND_TOOLS", display_name: "Dụng cụ cầm tay" }], sections: [] };
const loadedState: BootstrapState = {
  phase: "ready",
  config: publicConfig,
  home: previousHome,
  systemState: null,
  usingDevMock: false,
};
const success = <T>(data: T): ApiSuccess<T> => ({ success: true, message: "", data, meta: {}, error_code: null, errors: null });
const networkFailure = () => createSafeFailure("UPSTREAM_UNAVAILABLE", { transport_error: true });

describe("bootstrap connectivity and revalidation", () => {
  it("replaces an already-loaded catalogue with the offline surface without losing contact config", () => {
    const offline = markBootstrapOffline(loadedState);
    expect(offline.phase).toBe("ready");
    expect(offline.systemState).toEqual({
      kind: "no-network",
      title: "Chưa tải được nội dung",
      message: "Vui lòng kiểm tra kết nối và thử lại.",
    });
    expect(offline.config).toBe(publicConfig);
    expect(loadedState.systemState).toBeNull();
  });

  it("does not suppress a failed Home refresh when last-good Home is cached", () => {
    const result = resolveBootstrapState(loadedState, success(publicConfig), networkFailure(), "1.0.0", true);
    expect(result.home).toBe(previousHome);
    expect(result.systemState?.kind).toBe("no-network");
  });

  it("does not treat a received API failure as a disconnected device", () => {
    const failure = createSafeFailure("UPSTREAM_UNAVAILABLE", { transport_error: false });
    const result = resolveBootstrapState(loadedState, success(publicConfig), failure, "1.0.0", true);
    expect(result.systemState?.kind).toBe("api-error");
  });

  it("keeps config independent from a successful Home response", () => {
    const result = resolveBootstrapState(loadedState, networkFailure(), success(freshHome), "1.0.0", true);
    expect(result.home).toBe(freshHome);
    expect(result.config).toBe(publicConfig);
    expect(result.systemState).toBeNull();
  });

  it("does not clear offline when a previously started request succeeds after disconnect", () => {
    const result = resolveBootstrapState(markBootstrapOffline(loadedState), success(publicConfig), success(freshHome), "1.0.0", false);
    expect(result.systemState?.kind).toBe("no-network");
  });

  it("keeps offline visible when retry cannot revalidate and restores fresh data after reconnect", () => {
    const offline = markBootstrapOffline(loadedState);
    const stillUnavailable = resolveBootstrapState(offline, networkFailure(), networkFailure(), "1.0.0", true);
    expect(stillUnavailable.systemState?.kind).toBe("no-network");
    expect(stillUnavailable.config).toBe(publicConfig);

    const recovered = resolveBootstrapState(stillUnavailable, success(publicConfig), success(freshHome), "1.0.0", true);
    expect(recovered.systemState).toBeNull();
    expect(recovered.home).toBe(freshHome);
    expect(recovered.phase).toBe("ready");
  });

  it("shows a safe cold-load failure when neither cache nor config is available", () => {
    const cold: BootstrapState = { ...loadedState, phase: "loading", home: null, config: null };
    const result = resolveBootstrapState(cold, networkFailure(), networkFailure(), "1.0.0", true);
    expect(result.phase).toBe("ready");
    expect(result.home).toBeNull();
    expect(result.systemState?.kind).toBe("no-network");
  });

  it("retains maintenance and minimum-version rules after network recovery", () => {
    const maintenanceConfig = { ...publicConfig, maintenance: { enabled: true, message: "Đang bảo trì", estimated_end_at: null } };
    const result = resolveBootstrapState(markBootstrapOffline(loadedState), success(maintenanceConfig), success(freshHome), "1.0.0", true);
    expect(result.systemState?.kind).toBe("maintenance");
  });
});
