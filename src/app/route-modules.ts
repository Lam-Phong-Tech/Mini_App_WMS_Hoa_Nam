type IdleCallbackWindow = Window & {
  cancelIdleCallback?: (handle: number) => void;
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number },
  ) => number;
};

export const loadDocumentContextPage = () => import("@/pages/DocumentContextPage");
export const loadManualCodePage = () => import("@/pages/ManualCodePage");
export const loadApprovalQueuePage = () => import("@/pages/ApprovalQueuePage");
export const loadOutboundDocumentDetailPage = () =>
  import("@/pages/OutboundDocumentDetailPage");
export const loadOutboundReviewPage = () => import("@/pages/OutboundReviewPage");
export const loadOutboundSuccessPage = () => import("@/pages/OutboundSuccessPage");
export const loadProfilePage = () => import("@/pages/ProfilePage");
export const loadReceiptCreatePage = () => import("@/pages/ReceiptCreatePage");
export const loadReceiptReviewPage = () => import("@/pages/ReceiptReviewPage");
export const loadReceiptSuccessPage = () => import("@/pages/ReceiptSuccessPage");
export const loadScanHistoryPage = () => import("@/pages/ScanHistoryPage");
export const loadScanResultPage = () => import("@/pages/ScanResultPage");
export const loadScannerPage = () => import("@/pages/ScannerPage");
export const loadWarrantyDetailPage = () => import("@/pages/WarrantyDetailPage");
export const loadWarrantyPage = () => import("@/pages/WarrantyPage");
export const loadWarrantyReceivePage = () => import("@/pages/WarrantyReceivePage");

type HomePrefetchRoute = "approvals" | "history";

const homeRouteLoaders: Record<HomePrefetchRoute, () => Promise<unknown>> = {
  approvals: loadApprovalQueuePage,
  history: loadScanHistoryPage,
};
const prefetchedRoutes = new Set<HomePrefetchRoute>();

/**
 * Chỉ nạp sẵn hai route có xác suất truy cập cao sau khi Home đã ổn định.
 * Không prefetch scanner/ZXing, warranty hay media để tránh chiếm RAM và data.
 */
export function scheduleHomeRoutePrefetch() {
  if (!canPrefetchRoutes()) return () => undefined;

  const view = window as IdleCallbackWindow;
  const handles: Array<{ idle?: number; timeout?: number }> = [];

  (Object.keys(homeRouteLoaders) as HomePrefetchRoute[]).forEach((routeId) => {
    if (prefetchedRoutes.has(routeId)) return;

    const load = () => {
      prefetchedRoutes.add(routeId);
      void homeRouteLoaders[routeId]().catch(() => {
        prefetchedRoutes.delete(routeId);
      });
    };

    if (view.requestIdleCallback) {
      handles.push({ idle: view.requestIdleCallback(load, { timeout: 1_800 }) });
      return;
    }

    handles.push({ timeout: window.setTimeout(load, 700) });
  });

  return () => {
    handles.forEach(({ idle, timeout }) => {
      if (idle !== undefined) view.cancelIdleCallback?.(idle);
      if (timeout !== undefined) window.clearTimeout(timeout);
    });
  };
}

function canPrefetchRoutes() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  }).connection;
  const effectiveType = connection?.effectiveType;

  return !(
    connection?.saveData ||
    effectiveType === "slow-2g" ||
    effectiveType === "2g"
  );
}
