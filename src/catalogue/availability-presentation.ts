import type { UiIconName } from "@/components/ui-icon";
import type { PublicAvailability } from "@/types/public-api";

/** `ALL` is a client-side presentation choice; the remaining values are the
 * public API availability values. Keeping this alongside the presentation
 * token stops filter controls and card badges from drifting apart. */
export type AvailabilityFilterValue = "ALL" | PublicAvailability;

export interface AvailabilityPresentation {
  label: "Sẵn hàng" | "Đặt trước";
  icon: UiIconName;
  tone: "success" | "preorder";
}

/** One semantic source for filter controls, product cards and detail badges. */
export const AVAILABILITY_PRESENTATION: Record<PublicAvailability, AvailabilityPresentation> = {
  IN_STOCK: { label: "Sẵn hàng", icon: "checkCircle", tone: "success" },
  PREORDER: { label: "Đặt trước", icon: "clock", tone: "preorder" },
};
