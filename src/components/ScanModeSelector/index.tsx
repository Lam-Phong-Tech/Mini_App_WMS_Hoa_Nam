import { SCAN_CONTEXT_CONFIG } from "@/constants/scan.constants";
import type { ScanContext } from "@/types/scan.types";
import { ActionCard } from "@/components/ui/ActionCard";

const primaryContexts: ScanContext[] = [
  "INVENTORY_LOOKUP",
  "RECEIPT",
  "OUTBOUND",
  "WARRANTY_ITEM",
];

export default function ScanModeSelector() {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {primaryContexts.map((context) => {
        const config = SCAN_CONTEXT_CONFIG[context];

        return (
          <ActionCard
            key={context}
            to={
              context === "INVENTORY_LOOKUP"
                ? `/scanner/${context}`
                : context === "WARRANTY_ITEM"
                  ? "/warranty"
                : `/documents/${context}`
            }
            icon={config.icon}
            title={context === "WARRANTY_ITEM" ? "Bảo hành" : config.shortTitle}
            description={config.description}
          />
        );
      })}
    </div>
  );
}
