import type {
  ApprovedProductItem,
  WarehouseDashboardResponse,
} from "@/types/scan.types";

const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_PREFIX = "warehouse-dashboard-cache";
const MUTATION_KEY = "warehouse-dashboard-last-mutation-at";

export const WAREHOUSE_DASHBOARD_INVALIDATED_EVENT =
  "warehouse-dashboard-invalidated";

interface WarehouseDashboardCachePayload {
  cachedAt: number;
  dashboard: WarehouseDashboardResponse;
  approvedProducts: ApprovedProductItem[];
}

function getCacheKey(zaloUserId?: string) {
  return `${CACHE_PREFIX}:${zaloUserId || "guest"}`;
}

function dispatchDashboardInvalidated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WAREHOUSE_DASHBOARD_INVALIDATED_EVENT));
}

function getLastMutationAt() {
  if (typeof window === "undefined") return 0;

  const raw = window.sessionStorage.getItem(MUTATION_KEY);
  const value = raw ? Number(raw) : 0;
  return Number.isFinite(value) ? value : 0;
}

export function markWarehouseDashboardChanged() {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(MUTATION_KEY, String(Date.now()));
  } catch {
    // Không để lỗi storage làm kẹt luồng chính của app.
  }

  dispatchDashboardInvalidated();
}

export function getCachedWarehouseDashboard(zaloUserId?: string) {
  if (typeof window === "undefined") return undefined;

  try {
    const raw = window.sessionStorage.getItem(getCacheKey(zaloUserId));
    if (!raw) return undefined;

    const payload = JSON.parse(raw) as WarehouseDashboardCachePayload;
    const lastMutationAt = getLastMutationAt();

    if (
      !payload.cachedAt ||
      Date.now() - payload.cachedAt > CACHE_TTL_MS ||
      payload.cachedAt < lastMutationAt
    ) {
      window.sessionStorage.removeItem(getCacheKey(zaloUserId));
      return undefined;
    }

    return payload;
  } catch {
    return undefined;
  }
}

export function setCachedWarehouseDashboard(
  zaloUserId: string | undefined,
  dashboard: WarehouseDashboardResponse,
  approvedProducts: ApprovedProductItem[],
) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      getCacheKey(zaloUserId),
      JSON.stringify({
        cachedAt: Date.now(),
        dashboard,
        approvedProducts,
      } satisfies WarehouseDashboardCachePayload),
    );
  } catch {
    // Không để lỗi storage làm kẹt luồng chính của app.
  }
}

export function clearWarehouseDashboardCache(options = { notify: true }) {
  if (typeof window === "undefined") return;

  try {
    Object.keys(window.sessionStorage)
      .filter((key) => key.startsWith(`${CACHE_PREFIX}:`))
      .forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Không để lỗi storage làm kẹt luồng chính của app.
  }

  if (options.notify) {
    markWarehouseDashboardChanged();
  }
}
