import { describe, expect, it } from "vitest";

import { AVAILABILITY_PRESENTATION } from "@/catalogue/availability-presentation";

describe("availability presentation", () => {
  it("uses the same clock semantic for every preorder surface", () => {
    expect(AVAILABILITY_PRESENTATION.PREORDER).toEqual({ label: "Đặt trước", icon: "clock", tone: "preorder" });
    expect(AVAILABILITY_PRESENTATION.IN_STOCK).toEqual({ label: "Sẵn hàng", icon: "checkCircle", tone: "success" });
  });
});
