import { createNoNetworkState, getBootstrapSystemState, SafeSystemState } from "@/state/system-state";
import { ApiEnvelope, HomeDto, PublicConfigDto, isApiSuccess } from "@/types/public-api";

export interface BootstrapState {
  phase: "loading" | "ready";
  config: PublicConfigDto | null;
  home: HomeDto | null;
  systemState: SafeSystemState | null;
  usingDevMock: boolean;
}

/** Retain public config for offline contact, but never keep catalogue visible. */
export const markBootstrapOffline = (current: BootstrapState): BootstrapState => ({
  ...current,
  phase: "ready",
  systemState: createNoNetworkState(),
});

/**
 * A last-good Home may speed up a revisit, but it must not suppress a failed
 * revalidation. Config failures remain independent from usable Home data.
 */
export const resolveBootstrapState = (
  current: BootstrapState,
  configResult: ApiEnvelope<PublicConfigDto>,
  homeResult: ApiEnvelope<HomeDto>,
  appVersion: string,
  online: boolean,
): BootstrapState => {
  const config = isApiSuccess(configResult) ? configResult.data : current.config;
  const home = isApiSuccess(homeResult) ? homeResult.data : current.home;
  const failure = isApiSuccess(homeResult) ? null : homeResult;

  return {
    ...current,
    phase: "ready",
    config,
    home,
    systemState: online
      ? getBootstrapSystemState(config, failure, appVersion)
      : createNoNetworkState(),
  };
};
