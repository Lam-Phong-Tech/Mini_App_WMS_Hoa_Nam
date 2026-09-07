import { Button, Spinner } from "zmp-ui";

import { SafeSystemState } from "@/state/system-state";
import { UiIcon, UiIconName } from "@/components/ui-icon";

interface SystemStatePanelProps {
  state: SafeSystemState;
  onRetry?: () => void;
}

const STATE_ICONS: Record<Exclude<SafeSystemState["kind"], "loading">, UiIconName> = {
  empty: "info",
  "no-network": "wifiOff",
  "api-error": "alert",
  "rate-limited": "clock",
  maintenance: "construction",
  unavailable: "packageX",
  "update-required": "alert",
};

export const SystemStatePanel = ({ state, onRetry }: SystemStatePanelProps) => (
  <section className={`system-state system-state--${state.kind}`} aria-live="polite">
    {state.kind === "loading" ? <Spinner /> : <span className="system-state__icon"><UiIcon name={STATE_ICONS[state.kind]} size={20} /></span>}
    <h2>{state.title}</h2>
    <p>{state.message}</p>
    {state.retryAfterSeconds ? (
      <p className="system-state__hint">Có thể thử lại sau khoảng {state.retryAfterSeconds} giây.</p>
    ) : null}
    {onRetry && state.kind !== "maintenance" && state.kind !== "update-required" ? (
      <Button variant="primary" onClick={onRetry}>Thử lại</Button>
    ) : null}
  </section>
);
