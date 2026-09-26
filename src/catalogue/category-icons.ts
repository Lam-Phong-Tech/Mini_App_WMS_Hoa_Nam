import type { UiIconName } from "@/components/ui-icon";

export const getCategoryIcon = (code: string): UiIconName => {
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
