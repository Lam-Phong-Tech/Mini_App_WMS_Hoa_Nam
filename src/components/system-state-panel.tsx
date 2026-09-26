import { Button, Spinner } from "zmp-ui";

import { SafeSystemState } from "@/state/system-state";
import { UiIcon, UiIconName } from "@/components/ui-icon";
import { getOfflineHotline, toTelHref } from "@/services/contact-config";
import { useAppContext } from "@/state/app-context";

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

export const SystemStatePanel = ({ state, onRetry }: SystemStatePanelProps) => {
  const { config } = useAppContext();
  const hotlineHref = state.kind === "no-network" ? toTelHref(getOfflineHotline(config).tel) : null;
  const canRetry = Boolean(onRetry) && state.kind !== "maintenance" && state.kind !== "update-required";

  return <section className={`system-state system-state--${state.kind}`} aria-live="polite">
    {state.kind === "loading" ? <Spinner /> : <span className="system-state__icon"><UiIcon name={STATE_ICONS[state.kind]} size={20} /></span>}
    <h2>{state.title}</h2>
    <p>{state.message}</p>
    {state.retryAfterSeconds ? (
      <p className="system-state__hint">Có thể thử lại sau khoảng {state.retryAfterSeconds} giây.</p>
    ) : null}
    {canRetry || (state.kind === "no-network" && hotlineHref) ? <div className="system-state__actions">
      {canRetry ? (
        <Button variant="primary" onClick={onRetry}><UiIcon name="refreshCw" size={18} />Thử lại</Button>
      ) : null}
      {state.kind === "no-network" && hotlineHref ? <a className="system-state__hotline" href={hotlineHref}><UiIcon name="phone" size={17} />Gọi hotline</a> : null}
    </div> : null}
  </section>;
};
