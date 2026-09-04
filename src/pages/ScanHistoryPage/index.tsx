import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/LoadingState";
import { AppButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PageContainer } from "@/components/ui/Page";
import { WmsModal } from "@/components/ui/WmsModal";
import {
  WmsCard,
  WmsField,
  WmsInput,
  WmsPageHeader,
} from "@/components/ui/WmsRuntime";
import { getErrorMessage } from "@/constants/error-messages";
import {
  getMiniAppInboundDocuments,
  getOutboundDocuments,
  type InboundDocumentSummary,
  type OutboundDocumentSummary,
} from "@/services/scan.service";
import { clearWarehouseDashboardCache } from "@/services/warehouse-dashboard-cache";
import {
  type ReceiptSession,
  useReceiptSessionStore,
} from "@/stores/receipt-session.store";

type DocumentHistoryContext = "ALL" | "RECEIPT" | "OUTBOUND";
type DocumentHistoryStatus =
  "ALL" | "PENDING" | "APPROVED" | "POSTED" | "DRAFT";

const HISTORY_PAGE_SIZE = 25;
const HISTORY_CACHE_TTL_MS = 12_000;

interface HistoryLoadResult {
  inboundDocuments: InboundDocumentSummary[];
  outboundDocuments: OutboundDocumentSummary[];
  errors: string[];
}

let historyCache:
  | (HistoryLoadResult & {
      loadedAt: number;
    })
  | undefined;
let historyInFlight: Promise<HistoryLoadResult> | undefined;

interface DocumentHistoryItem {
  id: string;
  code: string;
  title: string;
  context: Exclude<DocumentHistoryContext, "ALL">;
  status?: string;
  warehouseName?: string;
  createdAt?: string;
  scannedQty?: number;
  expectedQty?: number;
  href: string;
}

export default function ScanHistoryPage() {
  const receiptSessions = useReceiptSessionStore((state) => state.sessions);
  const clearReceiptSessions = useReceiptSessionStore(
    (state) => state.clearAll,
  );
  const [inboundDocuments, setInboundDocuments] = useState<
    InboundDocumentSummary[]
  >([]);
  const [outboundDocuments, setOutboundDocuments] = useState<
    OutboundDocumentSummary[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [keyword, setKeyword] = useState("");
  const [contextFilter, setContextFilter] =
    useState<DocumentHistoryContext>("ALL");
  const [statusFilter, setStatusFilter] =
    useState<DocumentHistoryStatus>("ALL");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const mountedRef = useRef(true);
  const activeLoadIdRef = useRef(0);

  const loadDocuments = useCallback(async (options?: { force?: boolean }) => {
    const loadId = activeLoadIdRef.current + 1;
    activeLoadIdRef.current = loadId;
    setIsLoading(true);
    setError(undefined);

    try {
      const result = await getHistoryDocuments({
        force: Boolean(options?.force),
      });
      if (!mountedRef.current || activeLoadIdRef.current !== loadId) return;

      setInboundDocuments(result.inboundDocuments);
      setOutboundDocuments(result.outboundDocuments);
      setError(
        result.errors.length > 0 ? result.errors.join(" · ") : undefined,
      );
    } finally {
      if (mountedRef.current && activeLoadIdRef.current === loadId) {
        setIsLoading(false);
      }
    }
  }, []);

  const handleClearLocalHistory = async () => {
    setIsClearing(true);
    setError(undefined);
    setNotice(undefined);

    try {
      clearReceiptSessions();
      clearWarehouseDashboardCache();
      setNotice(
        "Đã xóa lịch sử phiếu cục bộ. Phiếu/audit trên WMS vẫn giữ nguyên.",
      );
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? getErrorMessage(clearError.message)
          : "Không xóa được lịch sử cục bộ.",
      );
    } finally {
      setIsClearing(false);
      setShowClearConfirm(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    void loadDocuments();
    return () => {
      mountedRef.current = false;
    };
  }, [loadDocuments]);

  const documentHistory = useMemo(() => {
    const localReceiptSessions =
      receiptSessions && typeof receiptSessions === "object"
        ? Object.values(receiptSessions)
        : [];

    return mergeDocumentHistory([
      ...toArray(localReceiptSessions).map(mapReceiptSessionToHistory),
      ...toArray(inboundDocuments).map(mapInboundDocumentToHistory),
      ...toArray(outboundDocuments).map(mapOutboundDocumentToHistory),
    ]);
  }, [inboundDocuments, outboundDocuments, receiptSessions]);

  const filteredHistory = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return documentHistory.filter((item) => {
      const matchedContext =
        contextFilter === "ALL" || item.context === contextFilter;
      const matchedStatus =
        statusFilter === "ALL" ||
        normalizeStatusGroup(item.status) === statusFilter;
      const haystack = [
        item.code,
        item.title,
        item.status,
        item.warehouseName,
        item.context === "RECEIPT" ? "nhập kho" : "xuất kho",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        matchedContext &&
        matchedStatus &&
        (!normalizedKeyword || haystack.includes(normalizedKeyword))
      );
    });
  }, [contextFilter, documentHistory, keyword, statusFilter]);

  return (
    <PageContainer className="space-y-4">
      <WmsPageHeader eyebrow="Theo phiếu" title="Lịch sử chứng từ" />

      <WmsField label="Tìm kiếm phiếu">
        <span className="relative block">
          <WmsInput
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="Mã phiếu, tên phiếu hoặc kho"
            className="wms-field-control--with-leading"
          />
          <Icon
            name="search"
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--wms-text-muted)]"
          />
        </span>
      </WmsField>

      <section className="space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            ["ALL", "Tất cả"],
            ["RECEIPT", "Nhập kho"],
            ["OUTBOUND", "Xuất kho"],
          ].map(([value, label]) => (
            <FilterButton
              key={value}
              active={contextFilter === value}
              onClick={() => setContextFilter(value as DocumentHistoryContext)}
            >
              {label}
            </FilterButton>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            ["ALL", "Mọi trạng thái"],
            ["DRAFT", "Đang xử lý"],
            ["PENDING", "Chờ duyệt"],
            ["APPROVED", "Đã duyệt"],
            ["POSTED", "Đã post"],
          ].map(([value, label]) => (
            <FilterButton
              key={value}
              active={statusFilter === value}
              onClick={() => setStatusFilter(value as DocumentHistoryStatus)}
            >
              {label}
            </FilterButton>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 text-[12px]">
          <button
            type="button"
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#D6E0EC] bg-white px-3.5 font-black text-[#44536A]"
            onClick={() => void loadDocuments({ force: true })}
          >
            <Icon name="refresh" size={15} />
            Đồng bộ WMS
          </button>
          <span className="font-medium text-[#69758A]">
            {filteredHistory.length} phiếu · lấy theo chứng từ
          </span>
        </div>
      </section>

      {isLoading && filteredHistory.length === 0 && (
        <LoadingState label="Đang tải lịch sử phiếu..." />
      )}

      {isLoading && filteredHistory.length > 0 && (
        <section className="rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2 text-[12px] font-bold text-[#0F73DC]">
          Đang đồng bộ thêm phiếu từ WMS...
        </section>
      )}

      {notice && (
        <section className="rounded-3xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
          {notice}
        </section>
      )}

      {error && (
        <section className="rounded-3xl bg-rose-50 p-4 text-rose-700">
          <p className="font-semibold">Không xử lý được lịch sử</p>
          <p className="mt-1 text-sm">{error}</p>
        </section>
      )}

      <DocumentHistoryList items={filteredHistory} />

      <button
        className="mx-auto block min-h-11 px-4 text-[12px] font-black text-[#CF2E14]"
        type="button"
        onClick={() => setShowClearConfirm(true)}
      >
        Xóa lịch sử cục bộ
      </button>

      <WmsModal
        ariaLabel="Xác nhận xóa lịch sử cục bộ"
        className="wms-modal-sheet p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
        closeOnBackdrop={!isClearing}
        open={showClearConfirm}
        onClose={() => {
          if (!isClearing) setShowClearConfirm(false);
        }}
      >
        <h2 className="text-[20px] font-black text-[#06142A]">
          Xóa lịch sử cục bộ?
        </h2>
        <p className="mt-2 text-sm font-medium leading-5 text-[#69758A]">
          Chỉ xóa phiếu tạm/lưu trên thiết bị. Phiếu thật trên WMS không bị xóa.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <AppButton
            fullWidth
            variant="secondary"
            onClick={() => setShowClearConfirm(false)}
          >
            Hủy
          </AppButton>
          <AppButton
            fullWidth
            variant="danger"
            loading={isClearing}
            icon="trash"
            onClick={handleClearLocalHistory}
          >
            Xóa
          </AppButton>
        </div>
      </WmsModal>
    </PageContainer>
  );
}

async function getHistoryDocuments(options: { force?: boolean } = {}) {
  const now = Date.now();

  if (
    !options.force &&
    historyCache &&
    now - historyCache.loadedAt < HISTORY_CACHE_TTL_MS
  ) {
    return historyCache;
  }

  if (!options.force && historyInFlight) {
    return historyInFlight;
  }

  historyInFlight = fetchHistoryDocuments().then((result) => {
    historyCache = {
      ...result,
      loadedAt: Date.now(),
    };
    return result;
  });

  try {
    return await historyInFlight;
  } finally {
    historyInFlight = undefined;
  }
}

async function fetchHistoryDocuments(): Promise<HistoryLoadResult> {
  const errors: string[] = [];
  const [inboundResult, outboundResult] = await Promise.allSettled([
    getMiniAppInboundDocuments({ perPage: HISTORY_PAGE_SIZE }),
    getOutboundDocuments({ perPage: HISTORY_PAGE_SIZE }),
  ]);

  const inboundDocuments =
    inboundResult.status === "fulfilled" ? toArray(inboundResult.value) : [];
  const outboundDocuments =
    outboundResult.status === "fulfilled" ? toArray(outboundResult.value) : [];

  if (inboundResult.status === "rejected") {
    errors.push(
      `Nhập: ${
        inboundResult.reason instanceof Error
          ? getErrorMessage(inboundResult.reason.message)
          : "Không tải được lịch sử phiếu nhập."
      }`,
    );
  }

  if (outboundResult.status === "rejected") {
    errors.push(
      `Xuất: ${
        outboundResult.reason instanceof Error
          ? getErrorMessage(outboundResult.reason.message)
          : "Không tải được lịch sử phiếu xuất."
      }`,
    );
  }

  return {
    inboundDocuments,
    outboundDocuments,
    errors,
  };
}

function DocumentHistoryList({ items }: { items?: DocumentHistoryItem[] }) {
  const safeItems = toArray(items);

  if (safeItems.length === 0) {
    return (
      <WmsCard className="py-8">
        <EmptyState
          icon="history"
          title="Chưa có lịch sử phiếu"
          description="Phiếu nhập/xuất sau khi tạo hoặc đồng bộ từ WMS sẽ hiển thị ở đây."
        />
      </WmsCard>
    );
  }

  return (
    <div className="space-y-3">
      {safeItems.map((item) => (
        <Link
          key={`${item.context}-${item.id}`}
          to={item.href}
          className="block rounded-[22px] border border-[#D6E0EC] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)] active:scale-[0.99]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#69758A]">
                {item.context === "RECEIPT" ? "Phiếu nhập" : "Phiếu xuất"}
              </p>
              <h2 className="mt-1 break-words text-[16px] font-black tracking-[-0.03em] text-[#06142A]">
                {item.code}
              </h2>
              <p className="mt-1 line-clamp-2 text-[12px] font-semibold text-[#69758A]">
                {item.title}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black ${getStatusClass(item.status)}`}
            >
              {getStatusLabel(item.status)}
            </span>
          </div>

          <div className="mt-4 flex items-center justify-between text-[12px] font-bold text-[#69758A]">
            <span className="min-w-0 truncate">
              {item.warehouseName || "Theo phiếu WMS"}
            </span>
            <span className="shrink-0 text-right">
              {getQuantityLabel(item)}
            </span>
          </div>
          {hasExpectedQty(item) ? (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E8EEF6]">
              <div
                className="h-full rounded-full bg-[#0F73DC]"
                style={{ width: `${getProgress(item)}%` }}
              />
            </div>
          ) : (
            <p className="mt-2 text-[11px] font-semibold text-[#9AA6B7]">
              Phiếu scan-driven, số lượng lấy theo mã đã quét.
            </p>
          )}
        </Link>
      ))}
    </div>
  );
}

function mapReceiptSessionToHistory(
  session: ReceiptSession,
): DocumentHistoryItem {
  return {
    id: session.receiptId,
    code: session.documentNo || session.receiptId,
    title: session.receiptName || "Phiếu nhập tạm",
    context: "RECEIPT",
    status: session.status,
    warehouseName: session.warehouseName,
    createdAt: session.createdAt,
    scannedQty: session.scannedQty ?? session.items.length,
    expectedQty: session.expectedQty,
    href: `/receipt-review/${encodeURIComponent(session.receiptId)}?from=history`,
  };
}

function mapInboundDocumentToHistory(
  document: InboundDocumentSummary,
): DocumentHistoryItem {
  const id = getDocumentId(document);

  return {
    id,
    code: getDocumentCode(document),
    title: document.purpose || document.doc_no || "Phiếu nhập WMS",
    context: "RECEIPT",
    status: document.mini_app_status || document.status,
    warehouseName:
      document.warehouse_name ||
      document.dst_warehouse_id ||
      document.warehouse_id,
    createdAt: document.updated_at || document.created_at,
    scannedQty:
      document.scanned_total_qty ||
      document.scanned_qty ||
      document.scanned_quantity,
    expectedQty:
      document.expected_total_qty ||
      document.required_total_qty ||
      document.required_total ||
      document.required_qty ||
      document.required_quantity ||
      document.total_qty,
    href: `/receipt-review/${encodeURIComponent(id)}?from=history`,
  };
}

function mapOutboundDocumentToHistory(
  document: OutboundDocumentSummary,
): DocumentHistoryItem {
  const id = getDocumentId(document);

  return {
    id,
    code: getDocumentCode(document),
    title: document.purpose || document.doc_no || "Phiếu xuất WMS",
    context: "OUTBOUND",
    status: document.status,
    warehouseName:
      document.warehouse_name ||
      document.src_warehouse_id ||
      document.dst_warehouse_id ||
      document.warehouse_id,
    createdAt: document.updated_at || document.created_at,
    scannedQty:
      document.matched_count ||
      document.scanned_total_qty ||
      document.scanned_qty ||
      document.scanned_quantity,
    expectedQty:
      document.expected_total_qty ||
      document.required_total ||
      document.required_total_qty ||
      document.required_qty ||
      document.required_quantity ||
      document.total_qty,
    href: `/history/OUTBOUND/${encodeURIComponent(id)}`,
  };
}

function mergeDocumentHistory(items: DocumentHistoryItem[]) {
  const seen = new Set<string>();

  return toArray(items)
    .filter((item) => {
      if (!item.id) return false;
      const key = `${item.context}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => getSortTime(b.createdAt) - getSortTime(a.createdAt));
}

function toArray<TItem>(value: TItem[] | undefined | null): TItem[] {
  return Array.isArray(value) ? value : [];
}

function getDocumentId(
  document: InboundDocumentSummary | OutboundDocumentSummary,
) {
  return (
    document.id ||
    document.document_id ||
    document.doc_no ||
    document.document_no ||
    ""
  );
}

function getDocumentCode(
  document: InboundDocumentSummary | OutboundDocumentSummary,
) {
  return (
    document.doc_no ||
    document.document_no ||
    getDocumentId(document) ||
    "Phiếu"
  );
}

function getProgress(item: DocumentHistoryItem) {
  if (!item.expectedQty) return item.scannedQty ? 100 : 0;
  return Math.min(100, ((item.scannedQty || 0) / item.expectedQty) * 100);
}

function hasExpectedQty(item: DocumentHistoryItem) {
  return Number(item.expectedQty) > 0;
}

function getQuantityLabel(item: DocumentHistoryItem) {
  const scannedQty = Math.max(0, Number(item.scannedQty) || 0);
  const expectedQty = Math.max(0, Number(item.expectedQty) || 0);

  if (expectedQty > 0) return `${scannedQty}/${expectedQty}`;
  if (scannedQty > 0) return `Đã quét ${scannedQty}`;
  return "Chưa có mã";
}

function normalizeStatusGroup(status?: string): DocumentHistoryStatus {
  const normalized = String(status || "").toUpperCase();
  if (["APPROVED"].includes(normalized)) return "APPROVED";
  if (["POSTED", "COMPLETED", "CLOSED"].includes(normalized)) return "POSTED";
  if (
    [
      "READY_TO_ISSUE",
      "WAITING_APPROVAL",
      "PENDING_APPROVAL",
      "PENDING",
      "SUBMITTED",
    ].includes(normalized)
  ) {
    return "PENDING";
  }
  return "DRAFT";
}

function getStatusLabel(status?: string) {
  const normalized = String(status || "").toUpperCase();
  const group = normalizeStatusGroup(status);
  if (normalized === "SCANNING") return "Đang quét";
  if (normalized === "DRAFT") return "Đang xử lý";
  if (normalized === "CANCELLED" || normalized === "CANCELED") return "Đã hủy";
  if (group === "APPROVED") return "Đã duyệt";
  if (group === "POSTED") return "Hoàn tất";
  if (group === "PENDING") return "Chờ duyệt";
  return status || "Đang xử lý";
}

function getStatusClass(status?: string) {
  const group = normalizeStatusGroup(status);
  if (group === "APPROVED" || group === "POSTED") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (group === "PENDING") return "bg-amber-50 text-amber-700";
  if (["CANCELLED", "CANCELED"].includes(String(status || "").toUpperCase())) {
    return "bg-rose-50 text-rose-700";
  }
  return "bg-blue-50 text-[#0F73DC]";
}

function getSortTime(value?: string) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-black ${
        active
          ? "border-blue-200 bg-blue-50 text-[#0F73DC]"
          : "border-[#D6E0EC] bg-white text-[#44536A]"
      }`}
    >
      {children}
    </button>
  );
}
