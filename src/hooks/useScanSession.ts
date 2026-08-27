import { useMemo } from "react";
import { countByStatus, useScanSessionStore } from "@/stores/scan-session.store";
import type { ScanContext, ScanHistoryItem } from "@/types/scan.types";

function matchesContext(item: ScanHistoryItem, context?: ScanContext) {
  return !context || item.request.scan_context === context;
}

function countPendingApproval(history: ScanHistoryItem[], context?: ScanContext) {
  return history.filter(
    (item) =>
      matchesContext(item, context) &&
      item.response?.data?.approval_status === "PENDING_APPROVAL",
  ).length;
}

export function useScanSession(context?: ScanContext) {
  const history = useScanSessionStore((state) => state.history);
  const clearHistory = useScanSessionStore((state) => state.clearHistory);

  const scopedHistory = useMemo(
    () => history.filter((item) => matchesContext(item, context)),
    [context, history],
  );

  return {
    history,
    scopedHistory,
    latest: scopedHistory[0],
    clearHistory,
    stats: {
      success: countByStatus(history, "SUCCESS", context),
      error: countByStatus(history, "ERROR", context),
      pending: countPendingApproval(history, context),
    },
  };
}
