import { create } from "zustand";

export type OutboundScanMethod = "camera" | "manual";
export type OutboundSessionStatus =
  | "scanning"
  | "review"
  | "pending_approval";

export interface OutboundScanUnit {
  id: string;
  code: string;
  rawCode?: string;
  itemCode: string;
  skuCode?: string;
  skuId?: string;
  skuName?: string;
  itemId?: string;
  itemUnique?: string;
  itemStatus?: string;
  eligibleForOutbound?: boolean;
  productName?: string;
  quantity: 1;
  scanMethod: OutboundScanMethod;
  scannedAt: string;
}

export interface OutboundScanRow {
  position: number;
  status: "empty" | "scanned";
  item?: OutboundScanUnit;
}

export interface OutboundSession {
  outboundId: string;
  outboundName?: string;
  warehouseId?: string;
  warehouseName?: string;
  recipientType?: string;
  recipientName: string;
  recipientAddress?: string;
  recipientPhone?: string;
  recipientProvinceCode?: number;
  recipientProvinceName?: string;
  recipientWardCode?: number;
  recipientWardName?: string;
  recipientStreetAddress?: string;
  note?: string;
  expectedQty: number;
  status: OutboundSessionStatus;
  items: OutboundScanUnit[];
  scanRows?: OutboundScanRow[];
  createdAt: string;
  recordIdempotencyKey?: string;
  submittedAt?: string;
  backendDocumentId?: string;
}

interface OutboundSessionState {
  sessions: Record<string, OutboundSession>;
  upsertSession: (session: OutboundSession) => void;
  updateSession: (
    outboundId: string,
    patch:
      | Partial<OutboundSession>
      | ((session: OutboundSession) => Partial<OutboundSession>),
  ) => void;
  clearSession: (outboundId: string) => void;
  getSession: (outboundId: string) => OutboundSession | undefined;
}

const STORAGE_KEY = "miniapp_outbound_sessions_v1";

export const useOutboundSessionStore = create<OutboundSessionState>((set, get) => ({
  sessions: readStoredSessions(),
  upsertSession: (session) =>
    set((state) =>
      persist({
        sessions: {
          ...state.sessions,
          [session.outboundId]: normalizeOutboundSessionRows(session),
        },
      }),
    ),
  updateSession: (outboundId, patch) =>
    set((state) => {
      const current = state.sessions[outboundId];
      if (!current) return state;
      const nextPatch = typeof patch === "function" ? patch(current) : patch;

      return persist({
        sessions: {
          ...state.sessions,
          [outboundId]: normalizeOutboundSessionRows({
            ...current,
            ...nextPatch,
          }),
        },
      });
    }),
  clearSession: (outboundId) =>
    set((state) => {
      const { [outboundId]: _removed, ...rest } = state.sessions;
      return persist({ sessions: rest });
    }),
  getSession: (outboundId) => get().sessions[outboundId],
}));

export function getStoredOutboundSession(outboundId: string) {
  return readStoredSessions()[outboundId];
}

export function createOutboundScanRows(
  expectedQty: number,
  items: OutboundScanUnit[] = [],
): OutboundScanRow[] {
  const count = Math.max(0, Number(expectedQty) || 0);

  return Array.from({ length: count }, (_, index) => {
    const item = items[index];

    return {
      position: index + 1,
      status: item ? "scanned" : "empty",
      item,
    };
  });
}

export function fillNextOutboundScanRow(
  session: Pick<OutboundSession, "expectedQty" | "items" | "scanRows">,
  item: OutboundScanUnit,
) {
  const rows = createOutboundScanRows(
    session.expectedQty,
    session.scanRows?.map((row) => row.item).filter(Boolean) as
      | OutboundScanUnit[]
      | undefined,
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

  return createOutboundScanRows(session.expectedQty, [...session.items, item]);
}

export function normalizeOutboundSessionRows(
  session: OutboundSession,
): OutboundSession {
  return {
    ...session,
    scanRows: createOutboundScanRows(session.expectedQty, session.items),
  };
}

function readStoredSessions(): Record<string, OutboundSession> {
  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ||
      window.sessionStorage.getItem(STORAGE_KEY);
    const sessions = raw ? (JSON.parse(raw) as Record<string, OutboundSession>) : {};

    return Object.fromEntries(
      Object.entries(sessions).map(([outboundId, session]) => [
        outboundId,
        normalizeOutboundSessionRows(session),
      ]),
    );
  } catch {
    return {};
  }
}

function persist(state: Pick<OutboundSessionState, "sessions">) {
  try {
    const payload = JSON.stringify(state.sessions);
    window.localStorage.setItem(STORAGE_KEY, payload);
    window.sessionStorage.setItem(STORAGE_KEY, payload);
  } catch {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state.sessions));
    } catch {
      // Zalo WebView có thể chặn storage; state memory vẫn dùng được trong phiên.
    }
  }

  return state;
}
