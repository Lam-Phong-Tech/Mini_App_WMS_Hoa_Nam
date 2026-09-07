import { useEffect } from "react";
import { useNavigate } from "zmp-ui";

import { AppShell } from "@/components/app-shell";
import { SystemStatePanel } from "@/components/system-state-panel";
import { getFoundationRoute } from "@/routes";
import { useAppContext } from "@/state/app-context";
import { createLoadingState } from "@/state/system-state";

const launchRoute = getFoundationRoute("launch");

export const LaunchPage = () => {
  const navigate = useNavigate();
  const { phase, systemState, refresh } = useAppContext();

  useEffect(() => {
    if (phase === "ready" && !systemState) {
      navigate("/home", { replace: true, animate: false });
    }
  }, [navigate, phase, systemState]);

  return (
    <AppShell route={launchRoute} showNavigation={false}>
      <SystemStatePanel
        state={phase === "loading" ? createLoadingState() : systemState ?? createLoadingState()}
        onRetry={phase === "ready" && systemState ? () => void refresh() : undefined}
      />
    </AppShell>
  );
};
