import { create } from "zustand";

export type ReceiptScanMethod = "camera" | "manual";
export type ReceiptStatus =
  | "draft"
  | "scanning"
  | "review"
  | "pending_approval"
  | "approved";

export interface ReceiptScanUnit {
  id: string;
  code: string;
  /** Mã nguyên gốc từ camera/manual, dùng để BE record và tạo SKU/item mới. */
  rawCode?: string;
  labelId?: string;
  itemCode: string;
  itemName?: string;
  skuId?: string;
  skuCode?: string;
  lineId?: string;
  inboundDate: string;
  quantity: 1;
  scanMethod: ReceiptScanMethod;
  scannedAt: string;
}

export interface ReceiptScanRow {
  position: number;
  status: "empty" | "scanned";
  item?: ReceiptScanUnit;
}

export interface ReceiptSession {
  receiptId: string;
  receiptName: string;
  documentNo?: string;
  warehouseId?: string;
  warehouseName?: string;
  productId?: string;
  productCode?: string;
  productName?: string;
  expectedQty: number;
  scannedQty?: number;
  scanDriven?: boolean;
  status: ReceiptStatus;
  ifMatch?: string;
  items: ReceiptScanUnit[];
  scanRows?: ReceiptScanRow[];
  createdAt: string;
  submittedAt?: string;
  approvedAt?: string;
}

interface ReceiptSessionState {
  sessions: Record<string, ReceiptSession>;
  upsertSession: (session: ReceiptSession) => void;
  updateSession: (
    receiptId: string,
    patch:
      | Partial<ReceiptSession>
      | ((session: ReceiptSession) => Partial<ReceiptSession>),
  ) => void;
  addItem: (receiptId: string, item: ReceiptScanUnit) => void;
  clearSession: (receiptId: string) => void;
  clearAll: () => void;
  getSession: (receiptId: string) => ReceiptSession | undefined;
}

const STORAGE_KEY = "miniapp_receipt_sessions_v1";

export const useReceiptSessionStore = create<ReceiptSessionState>((set, get) => ({
  sessions: readStoredSessions(),
  upsertSession: (session) =>
    set((state) =>
      persist({
        sessions: {
          ...state.sessions,
          [session.receiptId]: normalizeReceiptSessionRows(session),
        },
      }),
    ),
  updateSession: (receiptId, patch) =>
    set((state) => {
      const current = state.sessions[receiptId];
      if (!current) return state;
      const nextPatch = typeof patch === "function" ? patch(current) : patch;
      return persist({
        sessions: {
          ...state.sessions,
          [receiptId]: normalizeReceiptSessionRows({ ...current, ...nextPatch }),
        },
      });
    }),
  addItem: (receiptId, item) =>
    set((state) => {
      const current = state.sessions[receiptId];
      if (!current) return state;
      const exists = current.items.some((unit) => unit.code === item.code);
      const hasFixedQtyLimit = !current.scanDriven && current.expectedQty > 0;
      if (exists || (hasFixedQtyLimit && current.items.length >= current.expectedQty)) {
        return state;
      }

      return persist({
        sessions: {
          ...state.sessions,
          [receiptId]: {
            ...current,
            status:
              hasFixedQtyLimit && current.items.length + 1 >= current.expectedQty
                ? "review"
                : "scanning",
            items: [...current.items, item],
            scanRows: fillNextReceiptScanRow(current, item),
          },
        },
      });
    }),
  clearSession: (receiptId) =>
    set((state) => {
      const { [receiptId]: _removed, ...rest } = state.sessions;
      return persist({ sessions: rest });
    }),
  clearAll: () => set(() => persist({ sessions: {} })),
  getSession: (receiptId) => get().sessions[receiptId],
}));

export function getStoredReceiptSession(receiptId: string) {
  return readStoredSessions()[receiptId];
}

export function createReceiptScanRows(
  expectedQty: number,
  items: ReceiptScanUnit[] = [],
): ReceiptScanRow[] {
  const count = Math.max(items.length, Math.max(0, Number(expectedQty) || 0));

  return Array.from({ length: count }, (_, index) => {
    const item = items[index];

    return {
      position: index + 1,
      status: item ? "scanned" : "empty",
      item,
    };
  });
}

export function fillNextReceiptScanRow(
  session: Pick<ReceiptSession, "expectedQty" | "items" | "scanRows">,
  item: ReceiptScanUnit,
) {
  const rows = createReceiptScanRows(
    session.expectedQty,
    session.scanRows?.map((row) => row.item).filter(Boolean) as ReceiptScanUnit[] | undefined,
  );
  const emptyIndex = rows.findIndex((row) => row.status === "empty");

  if (emptyIndex >= 0) {
    rows[emptyIndex] = {
      position: emptyIndex + 1,
      status: "scanned",
      item,
    };
    return rows;
  }

  return createReceiptScanRows(session.expectedQty, [...session.items, item]);
}

export function normalizeReceiptSessionRows(session: ReceiptSession): ReceiptSession {
  return {
    ...session,
    scanRows: createReceiptScanRows(session.expectedQty, session.items),
  };
}

function readStoredSessions(): Record<string, ReceiptSession> {
  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ||
      window.sessionStorage.getItem(STORAGE_KEY);
    const sessions = raw ? (JSON.parse(raw) as Record<string, ReceiptSession>) : {};

    return Object.fromEntries(
      Object.entries(sessions).map(([receiptId, session]) => [
        receiptId,
        normalizeReceiptSessionRows(session),
      ]),
    );
  } catch {
    return {};
  }
}

function persist(state: Pick<ReceiptSessionState, "sessions">) {
  try {
    const payload = JSON.stringify(state.sessions);
    window.localStorage.setItem(STORAGE_KEY, payload);
    window.sessionStorage.setItem(STORAGE_KEY, payload);
  } catch {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state.sessions));
    } catch {
      // Zalo WebView có thể chặn storage tạm thời; state memory vẫn dùng được.
    }
  }

  return state;
}
