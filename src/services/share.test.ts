import { beforeEach, describe, expect, it, vi } from "vitest";

const { openShareSheet } = vi.hoisted(() => ({ openShareSheet: vi.fn() }));
vi.mock("zmp-sdk", () => ({ openShareSheet }));

import { buildProductDeepLink, getShareDescription, shareProduct } from "@/services/share";

describe("product share/deep link", () => {
  beforeEach(() => {
    openShareSheet.mockReset();
    openShareSheet.mockResolvedValue(undefined);
  });

  it("builds a slug link and preserves the selected variant", () => {
    expect(buildProductDeepLink("may-khoan/20v", "solo-1", "https://mini.example")).toBe(
      "https://mini.example/products/may-khoan%2F20v?variant_id=solo-1",
    );
  });

  it("shares only the public product link through Zalo SDK", async () => {
    const result = await shareProduct({ slug: "may-khoan", name: "Máy khoan", variantId: "kit-1" });
    expect(result).toBe("shared");
    expect(openShareSheet).toHaveBeenCalledWith({
      type: "link",
      data: { link: expect.stringContaining("/products/may-khoan?variant_id=kit-1"), chatOnly: false },
    });
    expect(getShareDescription({ slug: "may-khoan", name: "Máy khoan", model: "M20" })).toBe("Máy khoan · M20");
  });
});
