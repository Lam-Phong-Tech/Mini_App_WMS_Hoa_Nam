import { describe, expect, it } from "vitest";

import { formatSupportDays } from "@/services/contact-config";

describe("public contact presentation", () => {
  it("maps weekdays and groups consecutive days into Vietnamese ranges", () => {
    expect(formatSupportDays(["MON", "TUE", "WED", "THU", "FRI"])).toBe("Thứ Hai – Thứ Sáu");
    expect(formatSupportDays(["SAT"])).toBe("Thứ Bảy");
    expect(formatSupportDays(["MON", "WED", "THU", "SUN"])).toBe("Thứ Hai, Thứ Tư – Thứ Năm, Chủ Nhật");
  });
});
