import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { runtimeSettings } from "@/config/runtime";
import { advanceCatalogueGeneration, getCatalogueGeneration } from "@/catalogue/catalogue-session";
import { createSafeFailure } from "@/services/api-client";
import { createPublicApiAdapter, PublicApiAdapter } from "@/services/public-api";
import { BootstrapState, markBootstrapOffline, resolveBootstrapState } from "@/state/bootstrap-state";
import { HomeDto, PublicConfigDto, isApiSuccess } from "@/types/public-api";

interface AppContextValue extends BootstrapState {
  api: PublicApiAdapter;
  catalogueGeneration: number;
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

const isBrowserOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;

interface AppProviderProps {
  children: ReactNode;
  adapter?: PublicApiAdapter;
}

export const AppProvider = ({ children, adapter }: AppProviderProps) => {
  const api = useMemo(() => adapter ?? createPublicApiAdapter(), [adapter]);
  const requestGeneration = useRef(0);
  const [catalogueGeneration, setCatalogueGeneration] = useState(getCatalogueGeneration);
  const [state, setState] = useState<BootstrapState>(() => {
    const cached = readBootstrapCache() ?? initialState;
    return isBrowserOnline() ? cached : markBootstrapOffline(cached);
  });

  const refresh = useCallback(async () => {
    const generation = ++requestGeneration.current;
    if (!isBrowserOnline()) {
      setState(markBootstrapOffline);
      return;
    }

    setState((current) => ({
      ...current,
      // Keep the error surface until revalidation succeeds. In particular,
      // Retry/online must not briefly reveal stale Home data while pending.
      phase: current.home || current.systemState ? "ready" : "loading",
    }));

    const transportFailure = () => createSafeFailure("UPSTREAM_UNAVAILABLE", { transport_error: true });
    const [configResult, homeResult] = await Promise.all([
      Promise.resolve().then(() => api.getConfig()).catch(transportFailure),
      Promise.resolve().then(() => api.getHome()).catch(transportFailure),
    ]);
    // Going offline, retrying, changing adapters or unmounting invalidates the
    // previous request; a late success must not restore old catalogue content.
    if (generation !== requestGeneration.current) return;

    // Successful refresh/reconnect publishes exactly one catalogue refresh.
    // This state is not a dependency of refresh, so it cannot start a loop.
    if (isApiSuccess(homeResult) && isBrowserOnline()) {
      setCatalogueGeneration(advanceCatalogueGeneration());
    }

    setState((current) => {
      if (generation !== requestGeneration.current) return current;
      const next = resolveBootstrapState(current, configResult, homeResult, runtimeSettings.appVersion, isBrowserOnline());

      if (next.home && !next.systemState && isApiSuccess(homeResult)) {
        writeBootstrapCache(next.config, next.home);
      }

      return next;
    });
  }, [api]);

  useEffect(() => {
    const onOffline = () => {
      requestGeneration.current += 1;
      setState(markBootstrapOffline);
    };
    const onOnline = () => { void refresh(); };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    void refresh();

    return () => {
      requestGeneration.current += 1;
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [refresh]);

  const value = useMemo<AppContextValue>(
    () => ({ ...state, api, catalogueGeneration, refresh }),
    [api, catalogueGeneration, refresh, state],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = (): AppContextValue => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
};
