import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { runtimeSettings } from "@/config/runtime";
import { createPublicApiAdapter, PublicApiAdapter } from "@/services/public-api";
import { getBootstrapSystemState, SafeSystemState } from "@/state/system-state";
import { ApiFailure, HomeDto, PublicConfigDto, isApiSuccess } from "@/types/public-api";

interface BootstrapState {
  phase: "loading" | "ready";
  config: PublicConfigDto | null;
  home: HomeDto | null;
  systemState: SafeSystemState | null;
  usingDevMock: boolean;
}

interface AppContextValue extends BootstrapState {
  api: PublicApiAdapter;
  refresh: () => Promise<void>;
}

const initialState: BootstrapState = {
  phase: "loading",
  config: null,
  home: null,
  systemState: null,
  usingDevMock: runtimeSettings.useDevMock,
};

const BOOTSTRAP_CACHE_KEY = "hn-public-bootstrap-v1";
const BOOTSTRAP_CACHE_MAX_AGE_MS = 30_000;

interface CachedBootstrap {
  savedAt: number;
  config: PublicConfigDto | null;
  home: HomeDto;
}

/* Public config and catalogue previews contain no credentials, prices,
 * quantities or PII. A short session cache makes a revisit responsive while
 * the live request revalidates immediately in the background. */
const readBootstrapCache = (): BootstrapState | null => {
  if (runtimeSettings.useDevMock || typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(BOOTSTRAP_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Partial<CachedBootstrap>;
    if (
      typeof cached.savedAt !== "number"
      || Date.now() - cached.savedAt > BOOTSTRAP_CACHE_MAX_AGE_MS
      || !cached.home
      || typeof cached.home !== "object"
    ) {
      return null;
    }

    return {
      phase: "ready",
      config: cached.config && typeof cached.config === "object" ? cached.config as PublicConfigDto : null,
      home: cached.home as HomeDto,
      systemState: null,
      usingDevMock: false,
    };
  } catch {
    return null;
  }
};

const writeBootstrapCache = (config: PublicConfigDto | null, home: HomeDto) => {
  if (runtimeSettings.useDevMock || typeof window === "undefined") return;

  try {
    const cached: CachedBootstrap = { savedAt: Date.now(), config, home };
    window.sessionStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Storage can be unavailable in an embedded browser. Network data remains usable.
  }
};

const AppContext = createContext<AppContextValue | null>(null);

/**
 * /config and /home are intentionally independent in the public contract.
 * A temporary contact/config failure must not hide an otherwise usable
 * catalogue; unavailable contact actions keep their safe fallback state.
 */
const getBootstrapFailure = (
  homeResult: Awaited<ReturnType<PublicApiAdapter["getHome"]>>,
): ApiFailure | null => (!isApiSuccess(homeResult) ? homeResult : null);

interface AppProviderProps {
  children: ReactNode;
  adapter?: PublicApiAdapter;
}

export const AppProvider = ({ children, adapter }: AppProviderProps) => {
  const api = useMemo(() => adapter ?? createPublicApiAdapter(), [adapter]);
  const [state, setState] = useState<BootstrapState>(() => readBootstrapCache() ?? initialState);

  const refresh = useCallback(async () => {
    setState((current) => ({
      ...current,
      phase: current.home ? "ready" : "loading",
      systemState: null,
    }));

    const [configResult, homeResult] = await Promise.all([api.getConfig(), api.getHome()]);
    setState((current) => {
      const config = isApiSuccess(configResult) ? configResult.data : current.config;
      const home = isApiSuccess(homeResult) ? homeResult.data : current.home;
      const failure = home ? null : getBootstrapFailure(homeResult);

      if (home && isApiSuccess(homeResult)) {
        writeBootstrapCache(config, home);
      }

      return {
        phase: "ready",
        config,
        home,
        systemState: getBootstrapSystemState(config, failure, runtimeSettings.appVersion),
        usingDevMock: runtimeSettings.useDevMock,
      };
    });
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AppContextValue>(
    () => ({ ...state, api, refresh }),
    [api, refresh, state],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = (): AppContextValue => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
};
