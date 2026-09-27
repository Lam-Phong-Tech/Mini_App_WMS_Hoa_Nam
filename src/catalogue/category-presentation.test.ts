import { describe, expect, it } from "vitest";

import { DOMAIN_PRESENTATION, HOME_CATEGORY_SHORTCUTS } from "@/catalogue/category-presentation";

describe("customer-facing category presentation", () => {
  it("maps every public domain to approved customer copy and an icon", () => {
    expect(DOMAIN_PRESENTATION.POWER_TOOLS).toMatchObject({ tabLabel: "Máy công cụ", title: "Máy và thiết bị động lực", icon: "drill" });
    expect(DOMAIN_PRESENTATION.HAND_TOOLS).toMatchObject({ tabLabel: "Dụng cụ cầm tay", description: "Kẹp, siết, đo, cắt", icon: "wrench" });
    expect(DOMAIN_PRESENTATION.ACCESSORIES).toMatchObject({ tabLabel: "Phụ kiện", title: "Phụ tùng và phụ kiện", icon: "zap" });
  });

  it("keeps Home shortcuts in one presentation mapping", () => {
    expect(HOME_CATEGORY_SHORTCUTS.map((item) => item.label)).toEqual([
      "Dụng cụ kẹp giữ", "Bê tông và xây dựng", "Dụng cụ cắt", "Khoan và siết/vặn",
    ]);
  });
});
