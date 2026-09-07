import { describe, expect, it } from "vitest";

import { getContactTargets, getPublicHotline } from "@/services/contact-config";
import { PublicConfigDto } from "@/types/public-api";

const config = (tel: string, oa: string): PublicConfigDto => ({
  config_version: "test",
  hotline: { display: tel, tel },
  zalo_oa: { id: "oa-test", chat_url: oa },
  support_hours: null,
  privacy_policy_url: null,
  maintenance: { enabled: false, message: null, estimated_end_at: null },
  min_supported_app_version: null,
  feature_flags: {},
});

describe("config-driven contact actions", () => {
  it("changes hotline/OA targets from runtime config without rebuild", () => {
    const first = getContactTargets(config("0901 234 567", "https://zalo.me/oa-one"));
    const second = getContactTargets(config("028-1234-5678", "https://zalo.me/oa-two"));
    expect(first).toEqual({ hotlineHref: "tel:0901234567", oaUrl: "https://zalo.me/oa-one" });
    expect(second).toEqual({ hotlineHref: "tel:02812345678", oaUrl: "https://zalo.me/oa-two" });
  });

  it("uses the configured fallback hotline when the primary is absent", () => {
    const fallback = getContactTargets({
      ...config("0901 234 567", "https://zalo.me/oa-one"),
      hotline: null,
      hotline_fallback: { display: "1800 0000", tel: "1800 0000" },
    });
    expect(fallback.hotlineHref).toBe("tel:18000000");
    expect(getPublicHotline({
      ...config("0901 234 567", "https://zalo.me/oa-one"),
      hotline: null,
      hotline_fallback: { display: "1800 0000", tel: "1800 0000" },
    })).toEqual({ display: "1800 0000", tel: "1800 0000" });
  });
});
