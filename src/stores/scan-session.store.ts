import { create } from "zustand";
import type { ScanContext, ScanHistoryItem, ScanStatus } from "@/types/scan.types";

interface ScanSessionState {
  history: ScanHistoryItem[];
  addPending: (item: ScanHistoryItem) => void;
  updateResult: (
    id: string,
    patch: Pick<ScanHistoryItem, "status"> &
      Partial<Pick<ScanHistoryItem, "response" | "error_message">>,
  ) => void;
  markConfirmed: (id: string) => void;
  clearHistory: () => void;
  getById: (id: string) => ScanHistoryItem | undefined;
}

export const useScanSessionStore = create<ScanSessionState>((set, get) => ({
  history: [],
  addPending: (item) =>
    set((state) => ({
      history: [item, ...state.history],
    })),
  updateResult: (id, patch) =>
    set((state) => ({
      history: state.history.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    })),
  markConfirmed: (id) =>
    set((state) => ({
      history: state.history.map((item) =>
        item.id === id
          ? { ...item, confirmed_at: item.confirmed_at || new Date().toISOString() }
          : item,
      ),
    })),
  clearHistory: () => set({ history: [] }),
  getById: (id) => get().history.find((item) => item.id === id),
}));

export function countByStatus(
  history: ScanHistoryItem[],
  status: ScanStatus,
  context?: ScanContext,
) {
  return history.filter(
    (item) =>
      item.status === status &&
      (!context || item.request.scan_context === context),
  ).length;
}
