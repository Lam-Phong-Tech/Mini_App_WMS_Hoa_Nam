import { describe, expect, it } from "vitest";

import {
  createContactUnavailableState,
  createEmptyState,
  getBootstrapSystemState,
  getSystemStateForFailure,
  isUpdateRequired,
} from "@/state/system-state";
import { ApiErrorCode, ApiFailure, PublicConfigDto } from "@/types/public-api";

const failure = (errorCode: ApiErrorCode): ApiFailure => ({
  success: false,
  message: "safe message",
  data: null,
  meta: { retry_after_seconds: 30 },
  error_code: errorCode,
  errors: null,
});

const publicConfig: PublicConfigDto = {
  config_version: "test",
  hotline: null,
  zalo_oa: null,
  support_hours: null,
  privacy_policy_url: null,
  privacy_version: null,
  maintenance: { enabled: false, message: null, estimated_end_at: null },
  min_supported_app_version: null,
  feature_flags: {},
};

describe("safe system states", () => {
  it("classifies rate-limit, maintenance, unavailable, and no-network failures", () => {
    expect(getSystemStateForFailure(failure("RATE_LIMITED")).kind).toBe("rate-limited");
    expect(getSystemStateForFailure(failure("MAINTENANCE")).kind).toBe("maintenance");
    expect(getSystemStateForFailure(failure("PRODUCT_NOT_AVAILABLE")).kind).toBe("unavailable");
    expect(getSystemStateForFailure(failure("UPSTREAM_UNAVAILABLE")).kind).toBe("no-network");
    expect(getSystemStateForFailure(failure("IDEMPOTENCY_CONFLICT")).message).toContain("không khớp");
    expect(getSystemStateForFailure(failure("VALIDATION_ERROR")).message).toContain("trường");
  });

  it("gives maintenance and required updates precedence over normal content", () => {
    expect(
      getBootstrapSystemState(
        { ...publicConfig, maintenance: { enabled: true, message: null, estimated_end_at: null } },
        null,
        "1.0.0",
      )?.kind,
    ).toBe("maintenance");
    expect(
      getBootstrapSystemState(
        { ...publicConfig, min_supported_app_version: "1.1.0" },
        null,
        "1.0.0",
      )?.kind,
    ).toBe("update-required");
    expect(isUpdateRequired("1.2.0", "1.1.0")).toBe(false);
  });

  it("keeps contact configuration and catalogue empty copy as distinct states", () => {
    expect(createContactUnavailableState().title).toContain("liên hệ");
    expect(createEmptyState().title).toContain("sản phẩm");
    expect(createEmptyState().message).not.toMatch(/publish|duyệt/i);
  });
});
