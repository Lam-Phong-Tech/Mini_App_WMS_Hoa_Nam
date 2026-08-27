import { useCallback, useEffect, useState } from "react";
import {
  getApprovedProducts,
  getWarehouseDashboard,
} from "@/services/scan.service";
import { getErrorMessage } from "@/constants/error-messages";
import {
  getCachedWarehouseDashboard,
  setCachedWarehouseDashboard,
  WAREHOUSE_DASHBOARD_INVALIDATED_EVENT,
} from "@/services/warehouse-dashboard-cache";
import type {
  ApprovedProductItem,
  WarehouseDashboardResponse,
} from "@/types/scan.types";

interface DashboardLoadPayload {
  dashboard: WarehouseDashboardResponse;
  approvedProducts: ApprovedProductItem[];
}

const dashboardInFlight = new Map<string, Promise<DashboardLoadPayload>>();

export function useWarehouseDashboard(zaloUserId?: string, enabled = true) {
  const [dashboard, setDashboard] = useState<WarehouseDashboardResponse>();
  const [approvedProducts, setApprovedProducts] = useState<ApprovedProductItem[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>();

  const refresh = useCallback(
    async (force = false) => {
      if (!enabled) {
        setDashboard(undefined);
        setApprovedProducts([]);
        setIsLoading(false);
        return;
      }

      if (!force) {
        const cached = getCachedWarehouseDashboard(zaloUserId);

        if (cached) {
          setDashboard(cached.dashboard);
          setApprovedProducts(cached.approvedProducts);
          setLastUpdatedAt(cached.cachedAt);
          setIsLoading(false);
          setError(undefined);
          return;
        }
      }

      const cacheKey = zaloUserId || "guest";

      setIsLoading(true);
      setError(undefined);

      try {
        const payload = await getDashboardPayload(cacheKey, zaloUserId);

        setDashboard(payload.dashboard);
        setApprovedProducts(payload.approvedProducts);
        setLastUpdatedAt(Date.now());
        setCachedWarehouseDashboard(
          zaloUserId,
          payload.dashboard,
          payload.approvedProducts,
        );
      } catch (refreshError) {
        setError(
          refreshError instanceof Error
            ? getErrorMessage(refreshError.message)
            : "Không tải được dữ liệu dashboard.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [enabled, zaloUserId],
  );

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const refreshFromServer = () => {
      void refresh(true);
    };

    const refreshFromCacheFirst = () => {
      void refresh(false);
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh(false);
      }
    };

    window.addEventListener(
      WAREHOUSE_DASHBOARD_INVALIDATED_EVENT,
      refreshFromServer,
    );
    window.addEventListener("focus", refreshFromCacheFirst);
    window.addEventListener("pageshow", refreshFromCacheFirst);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.removeEventListener(
        WAREHOUSE_DASHBOARD_INVALIDATED_EVENT,
        refreshFromServer,
      );
      window.removeEventListener("focus", refreshFromCacheFirst);
      window.removeEventListener("pageshow", refreshFromCacheFirst);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [enabled, refresh]);

  return {
    dashboard,
    approvedProducts,
    isLoading,
    error,
    lastUpdatedAt,
    refresh,
  };
}

function getDashboardPayload(cacheKey: string, zaloUserId?: string) {
  const inFlight = dashboardInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const request = Promise.all([
    getWarehouseDashboard(zaloUserId),
    getApprovedProducts(),
  ])
    .then(([dashboardResponse, approvedProductsResponse]) => ({
      dashboard: dashboardResponse,
      approvedProducts: approvedProductsResponse.items,
    }))
    .finally(() => {
      dashboardInFlight.delete(cacheKey);
    });

  dashboardInFlight.set(cacheKey, request);
  return request;
}
