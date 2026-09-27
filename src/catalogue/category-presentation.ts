import type { UiIconName } from "@/components/ui-icon";
import type { DomainCode } from "@/types/public-api";

export interface DomainPresentation {
  tabLabel: string;
  title: string;
  description: string;
  icon: UiIconName;
}

/** Customer-facing domain copy and icons. Keep API codes out of the render tree. */
export const DOMAIN_PRESENTATION: Record<DomainCode, DomainPresentation> = {
  POWER_TOOLS: { tabLabel: "Máy công cụ", title: "Máy và thiết bị động lực", description: "Pin, điện AC, khí nén", icon: "drill" },
  HAND_TOOLS: { tabLabel: "Dụng cụ cầm tay", title: "Dụng cụ cầm tay", description: "Kẹp, siết, đo, cắt", icon: "wrench" },
  ACCESSORIES: { tabLabel: "Phụ kiện", title: "Phụ tùng và phụ kiện", description: "Pin, sạc, mũi và lưỡi", icon: "zap" },
};

export const HOME_CATEGORY_SHORTCUTS: ReadonlyArray<{
  categoryCodes: readonly string[];
  label: string;
  icon: UiIconName;
}> = [
  { categoryCodes: ["CLAMPING_TOOLS", "DEV_CLAMPING"], label: "Dụng cụ kẹp giữ", icon: "hammer" },
  { categoryCodes: ["PT_CONCRETE", "DEV_CONCRETE"], label: "Bê tông và xây dựng", icon: "sliders" },
  { categoryCodes: ["CUTTING_TOOLS", "DEV_HAND_CUTTING"], label: "Dụng cụ cắt", icon: "ruler" },
  { categoryCodes: ["PT_DRILL_DRIVER", "DEV_DRILL_FASTEN"], label: "Khoan và siết/vặn", icon: "drill" },
];
