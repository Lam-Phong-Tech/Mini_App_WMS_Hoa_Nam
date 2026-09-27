import type { UiIconName } from "@/components/ui-icon";

export const getCategoryIcon = (code: string): UiIconName => {
  const categorySpecificIcons: Record<string, UiIconName> = {
    PT_AIR: "wind",
    PT_CLEANING: "sparkles",
    PT_COMBO_KIT: "package",
    PT_CONCRETE: "hammer",
    PT_DRILL_DRIVER: "drill",
    PT_GARDEN: "tree",
    PT_GENERATOR: "zap",
    PT_GRINDING: "sparkles",
    PT_IMPACT: "wrench",
    PT_MEASURE_LIGHT: "ruler",
    PT_PUMP: "droplets",
    PT_SAW: "construction",
    PT_WELDING: "zap",
    PT_WOODWORK: "construction",
    GARDEN_HAND_TOOLS: "tree",
    HYDRAULIC_TOOLS: "wrench",
    MECHANICAL_TOOLS: "construction",
    PAINTING_WALL_TOOLS: "paintbrush",
    SOCKETS: "package",
    STORAGE_TOOLS: "package",
  };
  if (categorySpecificIcons[code]) return categorySpecificIcons[code];
  // The approved product-group-browser maps `electrical` to Lucide PlugZap.
  // Only this matching public category changes; batteries/lights keep Zap.
  if (code === "ELECTRICAL_TOOLS") return "plugZap";
  if (/CLAMPING|CONCRETE/.test(code)) return "hammer";
  if (/CUTTING|MEASURING/.test(code)) return "ruler";
  if (/ELECTRICAL|BATTERY|LIGHT/.test(code)) return "zap";
  if (/FASTENING|WRENCH|SOCKET/.test(code)) return "wrench";
  if (/DRILL|IMPACT/.test(code)) return "drill";
  return "sliders";
};
