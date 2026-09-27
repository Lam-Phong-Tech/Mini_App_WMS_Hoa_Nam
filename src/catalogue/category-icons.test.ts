import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getCategoryIcon } from "@/catalogue/category-icons";
import { UiIcon } from "@/components/ui-icon";

describe("approved electrical-category icon", () => {
  it("renders Lucide PlugZap for the exact public Dụng cụ điện category", () => {
    expect(getCategoryIcon("ELECTRICAL_TOOLS")).toBe("plugZap");
    const markup = renderToStaticMarkup(createElement(UiIcon, { name: getCategoryIcon("ELECTRICAL_TOOLS"), size: 20 }));
    expect(markup).toContain("lucide-plug-zap");
    expect(markup).not.toContain('class="lucide lucide-zap"');
  });

  it("preserves the other category icons and generic fallback", () => {
    expect(getCategoryIcon("BATTERY_ACCESSORIES")).toBe("zap");
    expect(getCategoryIcon("WORK_LIGHTS")).toBe("zap");
    expect(getCategoryIcon("CLAMPING_TOOLS")).toBe("hammer");
    expect(getCategoryIcon("CUTTING_TOOLS")).toBe("ruler");
    expect(getCategoryIcon("PT_DRILL_DRIVER")).toBe("drill");
    expect(getCategoryIcon("FASTENING_TOOLS")).toBe("wrench");
    expect(getCategoryIcon("NEW_CATEGORY")).toBe("sliders");
  });

  it("uses category-specific icons for the live Power Tools catalogue", () => {
    expect(getCategoryIcon("PT_AIR")).toBe("wind");
    expect(getCategoryIcon("PT_CLEANING")).toBe("sparkles");
    expect(getCategoryIcon("PT_GARDEN")).toBe("tree");
    expect(getCategoryIcon("PT_PUMP")).toBe("droplets");
    expect(getCategoryIcon("PAINTING_WALL_TOOLS")).toBe("paintbrush");
  });
});
