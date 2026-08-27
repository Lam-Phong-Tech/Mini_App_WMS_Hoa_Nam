import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/LoadingState";
import { AppButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageContainer, SectionHeader } from "@/components/ui/Page";
import { WmsCard, WmsNotice, WmsPageHeader } from "@/components/ui/WmsRuntime";
import {
  approveInboundReceipt,
  getMiniAppInboundApprovalQueue,
  getReceiptErrorMessage,
} from "@/services/receipt-flow.service";
import {
  getOutboundDocumentDetailWithMeta,
  getOutboundDocuments,
  postIssueOutboundDocument,
  type OutboundDocumentSummary,
} from "@/services/scan.service";
import {
  type OutboundSession,
  useOutboundSessionStore,
} from "@/stores/outbound-session.store";
import type { ReceiptSession } from "@/stores/receipt-session.store";

type OutboundApprovalDocument = OutboundDocumentSummary & {
  local_outbound_id?: string;
};

type ApprovalFolder = "INBOUND" | "OUTBOUND";
const APPROVAL_QUEUE_CACHE_TTL_MS = 10_000;
const APPROVAL_QUEUE_PAGE_SIZE = 10;

interface ApprovalQueueLoadResult {
  folder: ApprovalFolder;
  approvalSessions?: ReceiptSession[];
  outboundApprovals?: OutboundApprovalDocument[];
  errors: string[];
  hasMore: boolean;
}

const approvalQueueCache: Partial<
  Record<
    ApprovalFolder,
    ApprovalQueueLoadResult & {
      loadedAt: number;
    }
  >
> = {};
const approvalQueueInFlight: Partial<
  Record<ApprovalFolder, Promise<ApprovalQueueLoadResult>>
> = {};

export default function ApprovalQueuePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const outboundSessions = useOutboundSessionStore((state) => state.sessions);
  const clearOutboundSession = useOutboundSessionStore(
    (state) => state.clearSession,
  );
  const [approvalSessions, setApprovalSessions] = useState<ReceiptSession[]>(
    [],
  );
  const [outboundApprovals, setOutboundApprovals] = useState<
    OutboundApprovalDocument[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [approvingId, setApprovingId] = useState<string>();
  const [approvingOutboundId, setApprovingOutboundId] = useState<string>();
  const [error, setError] = useState<string>();
  const [approveError, setApproveError] = useState<string>();
  const [activeFolder, setActiveFolder] = useState<ApprovalFolder>(() =>
    searchParams.get("folder") === "OUTBOUND" ? "OUTBOUND" : "INBOUND",
  );
  const [inboundPage, setInboundPage] = useState(1);
  const [outboundPage, setOutboundPage] = useState(1);
  const [hasMoreInbound, setHasMoreInbound] = useState(false);
  const [hasMoreOutbound, setHasMoreOutbound] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedInboundIds, setSelectedInboundIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedOutboundIds, setSelectedOutboundIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isBatchApproving, setIsBatchApproving] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
  }>();
  const [batchSuccess, setBatchSuccess] = useState<string>();
  const mountedRef = useRef(true);
  const activeLoadIdRef = useRef(0);

  const loadQueue = useCallback(
    async (options?: { force?: boolean; folder?: ApprovalFolder }) => {
      const targetFolder = options?.folder || activeFolder;
      const loadId = activeLoadIdRef.current + 1;
      activeLoadIdRef.current = loadId;
      setIsLoading(true);
      setError(undefined);
      setApproveError(undefined);
      setBatchSuccess(undefined);

      try {
        const result = await getApprovalQueueDocuments({
          force: Boolean(options?.force),
          folder: targetFolder,
        });
        if (!mountedRef.current || activeLoadIdRef.current !== loadId) return;

        if (result.folder === "INBOUND") {
          setApprovalSessions(result.approvalSessions || []);
          setInboundPage(1);
          setHasMoreInbound(result.hasMore);
        } else {
          setOutboundApprovals(result.outboundApprovals || []);
          setOutboundPage(1);
          setHasMoreOutbound(result.hasMore);
        }
        setError(
          result.errors.length > 0 ? result.errors.join(" · ") : undefined,
        );
      } finally {
        if (mountedRef.current && activeLoadIdRef.current === loadId) {
          setIsLoading(false);
        }
      }
    },
    [activeFolder],
  );

  useEffect(() => {
    mountedRef.current = true;
    void loadQueue();
    return () => {
      mountedRef.current = false;
    };
  }, [loadQueue]);

  const localOutboundApprovals = useMemo(
    () =>
      Object.values(outboundSessions)
        .filter(isLocalOutboundWaitingApproval)
        .map(sessionToOutboundApprovalDocument),
    [outboundSessions],
  );
  const outboundApprovalDocuments = useMemo(
    () =>
      dedupeOutboundDocuments([
        ...outboundApprovals,
        ...localOutboundApprovals,
      ]),
    [localOutboundApprovals, outboundApprovals],
  );
  const pendingCount =
    approvalSessions.length + outboundApprovalDocuments.length;
  const activeFolderCount =
    activeFolder === "INBOUND"
      ? approvalSessions.length
      : outboundApprovalDocuments.length;
  const activeSelectedCount =
    activeFolder === "INBOUND"
      ? approvalSessions.filter((session) =>
          selectedInboundIds.has(session.receiptId),
        ).length
      : outboundApprovalDocuments.filter((document) =>
          selectedOutboundIds.has(getOutboundDocumentId(document)),
        ).length;
  const isAllActiveSelected =
    activeFolderCount > 0 && activeSelectedCount === activeFolderCount;
  const scannedTotal = useMemo(
    () =>
      approvalSessions.reduce(
        (total, session) =>
          total + Math.max(0, session.scannedQty ?? session.items.length),
        0,
      ) +
      outboundApprovalDocuments.reduce(
        (total, document) => total + getOutboundScannedQty(document),
        0,
      ),
    [approvalSessions, outboundApprovalDocuments],
  );

  const approveInbound = async (session: ReceiptSession) => {
    await approveInboundReceipt(session.receiptId);
    invalidateApprovalQueueCache("INBOUND");
    setApprovalSessions((current) =>
      current.filter((item) => item.receiptId !== session.receiptId),
    );
    setSelectedInboundIds((current) => {
      const next = new Set(current);
      next.delete(session.receiptId);
      return next;
    });
  };

  const approveOutbound = async (document: OutboundDocumentSummary) => {
    const documentId = getOutboundDocumentId(document);
    if (!documentId) throw new Error("Không xác định được mã phiếu xuất.");

    const latest = await getOutboundDocumentDetailWithMeta(documentId);
    await postIssueOutboundDocument({
      documentId,
      ifMatch: latest.ifMatch || latest.document?.version || document.version,
    });
    if ((document as OutboundApprovalDocument).local_outbound_id) {
      clearOutboundSession(
        (document as OutboundApprovalDocument).local_outbound_id || "",
      );
    }
    invalidateApprovalQueueCache("OUTBOUND");
    setOutboundApprovals((current) =>
      current.filter((item) => getOutboundDocumentId(item) !== documentId),
    );
    setSelectedOutboundIds((current) => {
      const next = new Set(current);
      next.delete(documentId);
      return next;
    });
  };

  const handleApproveInbound = async (session: ReceiptSession) => {
    if (isBatchApproving) return;
    setApproveError(undefined);
    setBatchSuccess(undefined);
    setApprovingId(session.receiptId);

    try {
      await approveInbound(session);
    } catch (requestError) {
      setApproveError(getReceiptErrorMessage(requestError));
    } finally {
      setApprovingId(undefined);
    }
  };

  const handleApproveOutbound = async (document: OutboundDocumentSummary) => {
    const documentId = getOutboundDocumentId(document);
    if (!documentId || isBatchApproving) return;

    setApproveError(undefined);
    setBatchSuccess(undefined);
    setApprovingOutboundId(documentId);

    try {
      await approveOutbound(document);
    } catch (requestError) {
      setApproveError(getOutboundApprovalErrorMessage(requestError));
    } finally {
      setApprovingOutboundId(undefined);
    }
  };

  const toggleActiveSelection = (id: string) => {
    if (isBatchApproving) return;

    const update = (current: Set<string>) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    };

    if (activeFolder === "INBOUND") setSelectedInboundIds(update);
    else setSelectedOutboundIds(update);
  };

  const toggleSelectAllActive = () => {
    if (isBatchApproving) return;
    const shouldSelectAll = !isAllActiveSelected;

    if (activeFolder === "INBOUND") {
      setSelectedInboundIds(
        shouldSelectAll
          ? new Set(approvalSessions.map((session) => session.receiptId))
          : new Set(),
      );
      return;
    }

    setSelectedOutboundIds(
      shouldSelectAll
        ? new Set(
            outboundApprovalDocuments
              .map(getOutboundDocumentId)
              .filter(Boolean),
          )
        : new Set(),
    );
  };

  const handleBatchApprove = async () => {
    const inboundBatch = approvalSessions.filter((session) =>
      selectedInboundIds.has(session.receiptId),
    );
    const outboundBatch = outboundApprovalDocuments.filter((document) =>
      selectedOutboundIds.has(getOutboundDocumentId(document)),
    );
    const selectedDocuments =
      activeFolder === "INBOUND" ? inboundBatch : outboundBatch;
    if (selectedDocuments.length === 0 || isBatchApproving) return;

    setApproveError(undefined);
    setBatchSuccess(undefined);
    setIsBatchApproving(true);
    setBatchProgress({ current: 0, total: selectedDocuments.length });
    const failures: string[] = [];
    let completed = 0;

    for (const document of selectedDocuments) {
      setBatchProgress({
        current: completed + 1,
        total: selectedDocuments.length,
      });

      try {
        if (activeFolder === "INBOUND") {
          const session = document as ReceiptSession;
          setApprovingId(session.receiptId);
          await approveInbound(session);
        } else {
          const outbound = document as OutboundDocumentSummary;
          setApprovingOutboundId(getOutboundDocumentId(outbound));
          await approveOutbound(outbound);
        }
        completed += 1;
      } catch (requestError) {
        const documentName =
          activeFolder === "INBOUND"
            ? (document as ReceiptSession).documentNo ||
              (document as ReceiptSession).receiptName
            : getOutboundDocumentCode(document as OutboundDocumentSummary);
        const message =
          activeFolder === "INBOUND"
            ? getReceiptErrorMessage(requestError)
            : getOutboundApprovalErrorMessage(requestError);
        failures.push(`${documentName}: ${message}`);
      } finally {
        setApprovingId(undefined);
        setApprovingOutboundId(undefined);
      }
    }

    setIsBatchApproving(false);
    setBatchProgress(undefined);
    if (completed > 0) {
      setBatchSuccess(
        `Đã phê duyệt ${completed}/${selectedDocuments.length} phiếu ${
          activeFolder === "INBOUND" ? "nhập" : "xuất"
        }.`,
      );
    }
    if (failures.length > 0) {
      setApproveError(
        `Không duyệt được ${failures.length} phiếu. ${failures.join(" · ")}`,
      );
    }
  };

  const handleLoadMoreActiveFolder = async () => {
    setIsLoadingMore(true);
    setApproveError(undefined);

    try {
      if (activeFolder === "INBOUND") {
        const nextPage = inboundPage + 1;
        const result = await getMiniAppInboundApprovalQueue({
          page: nextPage,
          perPage: APPROVAL_QUEUE_PAGE_SIZE,
        });
        setApprovalSessions((current) =>
          dedupeReceiptSessions([...current, ...result.sessions]),
        );
        setInboundPage(nextPage);
        setHasMoreInbound(result.sessions.length >= APPROVAL_QUEUE_PAGE_SIZE);
      } else {
        const nextPage = outboundPage + 1;
        const result = await getMiniAppOutboundApprovalQueue({
          page: nextPage,
          perPage: APPROVAL_QUEUE_PAGE_SIZE,
        });
        setOutboundApprovals((current) =>
          dedupeOutboundDocuments([...current, ...result]),
        );
        setOutboundPage(nextPage);
        setHasMoreOutbound(result.length >= APPROVAL_QUEUE_PAGE_SIZE);
      }
    } catch (requestError) {
      setApproveError(
        activeFolder === "INBOUND"
          ? getReceiptErrorMessage(requestError)
          : getOutboundApprovalErrorMessage(requestError),
      );
    } finally {
      setIsLoadingMore(false);
    }
  };

  const hasMoreActiveFolder =
    activeFolder === "INBOUND" ? hasMoreInbound : hasMoreOutbound;

  const openCreateDocument = () => {
    navigate("/documents/OUTBOUND");
  };

  return (
    <PageContainer className="space-y-4">
      <div>
        <WmsPageHeader
          eyebrow="Duyệt phiếu"
          title="Phiếu chờ duyệt"
          action={
            <button
              aria-label="Tạo phiếu xuất"
              className="grid h-11 w-11 place-items-center rounded-[var(--wms-radius-control)] bg-[var(--wms-primary-soft)] text-[var(--wms-primary-strong)]"
              type="button"
              onClick={openCreateDocument}
            >
              <Icon name="package-minus" size={20} />
            </button>
          }
        />
        <p className="mt-2 text-[13px] font-normal text-[var(--wms-text-muted)]">
          Kiểm tra lại hàng đã ghi nhận trước khi phê duyệt/Post trên WMS.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3">
        <KpiCard
          icon="list-check"
          label="Chờ duyệt"
          tone="amber"
          value={pendingCount}
        />
        <KpiCard
          icon="scan"
          label="Mã ghi nhận"
          tone="blue"
          value={scannedTotal}
        />
      </section>

      <section>
        <SectionHeader
          title="Danh sách phiếu"
          action={
            <button
              className="min-h-11 rounded-full bg-[var(--wms-primary-soft)] px-3 text-[12px] font-semibold text-[var(--wms-primary-strong)]"
              type="button"
              onClick={() => void loadQueue({ force: true })}
            >
              Đồng bộ
            </button>
          }
        />

        {isLoading && <LoadingState label="Đang tải phiếu chờ duyệt..." />}

        {error && (
          <div className="mb-3">
            <WmsNotice
              tone="danger"
              title="Không tải được queue backend"
              description={error}
            />
          </div>
        )}

        {approveError && (
          <div className="mb-3">
            <WmsNotice
              tone="danger"
              title="Không thể duyệt phiếu"
              description={approveError}
            />
          </div>
        )}

        {batchSuccess && (
          <div className="mb-3">
            <WmsNotice
              tone="success"
              title="Duyệt hàng loạt hoàn tất"
              description={batchSuccess}
            />
          </div>
        )}

        <div className="mb-3 grid grid-cols-2 gap-2">
          <FolderButton
            active={activeFolder === "INBOUND"}
            count={approvalSessions.length}
            icon="package-plus"
            label="Phiếu nhập chờ duyệt"
            tone="inbound"
            onClick={() => setActiveFolder("INBOUND")}
          />
          <FolderButton
            active={activeFolder === "OUTBOUND"}
            count={outboundApprovalDocuments.length}
            icon="package-minus"
            label="Phiếu xuất chờ duyệt"
            tone="outbound"
            onClick={() => setActiveFolder("OUTBOUND")}
          />
        </div>

        {activeFolderCount > 0 && (
          <>
            <div className="mb-3">
              <WmsNotice
                tone="info"
                title="Duyệt mới cập nhật tồn"
                description="Phiếu nhập chỉ cộng tồn sau Post Receipt; phiếu xuất chỉ trừ tồn sau Post Issue."
              />
            </div>
            <section className="mb-3 rounded-[var(--wms-radius-card)] border border-[var(--wms-divider)] bg-[var(--wms-surface)] p-3 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 text-[13px] font-semibold text-[var(--wms-text-strong)]">
                  <input
                    aria-label={`Chọn tất cả phiếu ${activeFolder === "INBOUND" ? "nhập" : "xuất"} đang hiển thị`}
                    checked={isAllActiveSelected}
                    className="h-5 w-5 shrink-0 rounded border-[var(--wms-divider)] accent-[var(--wms-primary)]"
                    disabled={isBatchApproving}
                    type="checkbox"
                    onChange={toggleSelectAllActive}
                  />
                  <span>Chọn tất cả ({activeFolderCount})</span>
                </label>
                {activeSelectedCount > 0 && (
                  <span className="shrink-0 rounded-full bg-[var(--wms-primary-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--wms-primary-strong)]">
                    Đã chọn {activeSelectedCount}
                  </span>
                )}
              </div>
              <AppButton
                className="mt-2"
                disabled={activeSelectedCount === 0}
                fullWidth
                icon="check-circle"
                loading={isBatchApproving}
                onClick={handleBatchApprove}
              >
                {batchProgress
                  ? `Đang duyệt ${batchProgress.current}/${batchProgress.total}`
                  : `Duyệt ${activeSelectedCount} phiếu ${activeFolder === "INBOUND" ? "nhập" : "xuất"}`}
              </AppButton>
            </section>
          </>
        )}

        {!isLoading && activeFolderCount === 0 ? (
          <WmsCard className="py-8">
            <EmptyState
              icon={
                activeFolder === "INBOUND" ? "package-plus" : "package-minus"
              }
              title={
                activeFolder === "INBOUND"
                  ? "Chưa có phiếu nhập chờ duyệt"
                  : "Chưa có phiếu xuất chờ duyệt"
              }
              description="Chọn folder còn lại hoặc bấm Đồng bộ để tải lại danh sách từ WMS."
            />
            {activeFolder === "OUTBOUND" && (
              <AppButton
                className="mt-5"
                fullWidth
                icon="package-minus"
                onClick={openCreateDocument}
              >
                Tạo phiếu xuất
              </AppButton>
            )}
          </WmsCard>
        ) : (
          <div className="space-y-3">
            {activeFolder === "INBOUND" ? (
              <>
                <SectionHeader title="Phiếu nhập chờ duyệt" />
                {approvalSessions.map((session) => (
                  <ApprovalCard
                    key={session.receiptId}
                    session={session}
                    onOpen={() =>
                      navigate(
                        `/receipt-review/${encodeURIComponent(session.receiptId)}?from=approvals`,
                      )
                    }
                    onApprove={() => handleApproveInbound(session)}
                    isApproving={approvingId === session.receiptId}
                    isSelected={selectedInboundIds.has(session.receiptId)}
                    isBatchApproving={isBatchApproving}
                    onToggleSelect={() =>
                      toggleActiveSelection(session.receiptId)
                    }
                  />
                ))}
              </>
            ) : (
              <>
                <SectionHeader title="Phiếu xuất chờ duyệt" />
                {outboundApprovalDocuments.map((document) => {
                  const documentId = getOutboundDocumentId(document);

                  return (
                    <OutboundApprovalCard
                      key={documentId || getOutboundDocumentCode(document)}
                      document={document}
                      onOpen={() =>
                        documentId &&
                        navigate(
                          `/approvals/outbound/${encodeURIComponent(documentId)}?from=approvals&folder=OUTBOUND`,
                        )
                      }
                      onApprove={() => handleApproveOutbound(document)}
                      isApproving={approvingOutboundId === documentId}
                      isSelected={selectedOutboundIds.has(documentId)}
                      isBatchApproving={isBatchApproving}
                      onToggleSelect={() =>
                        documentId && toggleActiveSelection(documentId)
                      }
                    />
                  );
                })}
              </>
            )}
            {hasMoreActiveFolder && (
              <AppButton
                fullWidth
                variant="secondary"
                loading={isLoadingMore}
                icon="refresh"
                onClick={handleLoadMoreActiveFolder}
              >
                Tải thêm phiếu
              </AppButton>
            )}
          </div>
        )}
      </section>
    </PageContainer>
  );
}

async function getApprovalQueueDocuments(options: {
  force?: boolean;
  folder: ApprovalFolder;
}): Promise<ApprovalQueueLoadResult> {
  const now = Date.now();
  const cached = approvalQueueCache[options.folder];
  const inFlight = approvalQueueInFlight[options.folder];

  if (
    !options.force &&
    cached &&
    now - cached.loadedAt < APPROVAL_QUEUE_CACHE_TTL_MS
  ) {
    return cached;
  }

  if (!options.force && inFlight) {
    return inFlight;
  }

  const request = fetchApprovalQueueDocuments(options.folder).then((result) => {
    approvalQueueCache[options.folder] = {
      ...result,
      loadedAt: Date.now(),
    };
    return result;
  });
  approvalQueueInFlight[options.folder] = request;

  try {
    return await request;
  } finally {
    if (approvalQueueInFlight[options.folder] === request) {
      approvalQueueInFlight[options.folder] = undefined;
    }
  }
}

async function fetchApprovalQueueDocuments(
  folder: ApprovalFolder,
): Promise<ApprovalQueueLoadResult> {
  if (folder === "INBOUND") {
    try {
      const result = await getMiniAppInboundApprovalQueue({
        perPage: APPROVAL_QUEUE_PAGE_SIZE,
      });

      return {
        folder,
        approvalSessions: result.sessions,
        errors: [],
        hasMore: result.sessions.length >= APPROVAL_QUEUE_PAGE_SIZE,
      };
    } catch (requestError) {
      return {
        folder,
        approvalSessions: [],
        errors: [`Nhập: ${getReceiptErrorMessage(requestError)}`],
        hasMore: false,
      };
    }
  }

  try {
    const result = await getMiniAppOutboundApprovalQueue({
      perPage: APPROVAL_QUEUE_PAGE_SIZE,
    });

    return {
      folder,
      outboundApprovals: result,
      errors: [],
      hasMore: result.length >= APPROVAL_QUEUE_PAGE_SIZE,
    };
  } catch (requestError) {
    return {
      folder,
      outboundApprovals: [],
      errors: [`Xuất: ${getOutboundApprovalErrorMessage(requestError)}`],
      hasMore: false,
    };
  }
}

function invalidateApprovalQueueCache(folder: ApprovalFolder) {
  approvalQueueCache[folder] = undefined;
  approvalQueueInFlight[folder] = undefined;
}

async function getMiniAppOutboundApprovalQueue(
  params: {
    page?: number;
    perPage?: number;
  } = {},
): Promise<OutboundApprovalDocument[]> {
  const readyDocuments = await getOutboundDocuments({
    readyForPost: true,
    readyForIssue: true,
    page: params.page,
    perPage: params.perPage || APPROVAL_QUEUE_PAGE_SIZE,
  }).catch(() => []);

  return dedupeOutboundDocuments(readyDocuments).filter(
    isOutboundWaitingApproval,
  );
}

function FolderButton({
  active,
  count,
  icon,
  label,
  tone,
  onClick,
}: {
  active: boolean;
  count: number;
  icon: "package-plus" | "package-minus";
  label: string;
  tone: "inbound" | "outbound";
  onClick: () => void;
}) {
  const activeClass =
    tone === "inbound"
      ? "border-[var(--wms-primary)] bg-[var(--wms-primary-soft)] text-[var(--wms-primary-strong)]"
      : "border-[rgba(255,159,67,0.38)] bg-[var(--wms-warning-soft)] text-[var(--wms-warning-text)]";
  const iconClass =
    tone === "inbound"
      ? "bg-[var(--wms-primary-soft)] text-[var(--wms-primary-strong)]"
      : "bg-[var(--wms-warning-soft)] text-[var(--wms-warning-text)]";

  return (
    <button
      className={`min-h-[92px] rounded-[var(--wms-radius-card)] border p-3 text-left shadow-sm transition active:scale-[0.99] ${
        active
          ? activeClass
          : "border-[var(--wms-divider)] bg-[var(--wms-surface)] text-[var(--wms-text-strong)]"
      }`}
      type="button"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${iconClass}`}
        >
          <Icon name={icon} size={20} strokeWidth={2.5} />
        </span>
        <span className="rounded-full bg-[var(--wms-surface)] px-2.5 py-1 text-[12px] font-semibold text-[var(--wms-text-strong)] shadow-sm">
          {count}
        </span>
      </div>
      <p className="mt-3 text-[13px] font-semibold leading-4">{label}</p>
    </button>
  );
}

function OutboundApprovalCard({
  document,
  onOpen,
  onApprove,
  isApproving,
  isSelected,
  isBatchApproving,
  onToggleSelect,
}: {
  document: OutboundDocumentSummary;
  onOpen: () => void;
  onApprove: () => void;
  isApproving: boolean;
  isSelected: boolean;
  isBatchApproving: boolean;
  onToggleSelect: () => void;
}) {
  const expectedQty = getOutboundExpectedQty(document);
  const scannedQty = getOutboundScannedQty(document);
  const progress = expectedQty
    ? Math.min(100, (scannedQty / expectedQty) * 100)
    : 100;

  return (
    <article className="wms-card p-4">
      <ApprovalSelection
        checked={isSelected}
        disabled={isBatchApproving}
        label="Chọn phiếu xuất"
        onChange={onToggleSelect}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--wms-warning-text)]">
            {getOutboundDocumentCode(document)}
          </p>
          <h2 className="mt-1 break-words text-[17px] font-semibold tracking-[-0.03em] text-[var(--wms-text-strong)]">
            Phiếu xuất kho
          </h2>
          <p className="mt-1 line-clamp-1 text-[12px] font-semibold text-[#69758A]">
            {getOutboundWarehouseName(document) || "Kho xuất WMS"}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1.5 text-[11px] font-black text-amber-700">
          Chờ duyệt xuất
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between text-[12px] font-bold text-[#69758A]">
        <span>Đã quét {scannedQty}</span>
        <span>Cần {expectedQty || "--"}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E8EEF6]">
        <div
          className="h-full rounded-full bg-[var(--wms-warning)]"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <AppButton fullWidth variant="secondary" onClick={onOpen}>
          Kiểm tra
        </AppButton>
        <AppButton
          fullWidth
          icon="package-minus"
          disabled={isBatchApproving}
          loading={isApproving}
          onClick={onApprove}
        >
          Duyệt xuất
        </AppButton>
      </div>
    </article>
  );
}

function ApprovalCard({
  session,
  onOpen,
  onApprove,
  isApproving,
  isSelected,
  isBatchApproving,
  onToggleSelect,
}: {
  session: ReceiptSession;
  onOpen: () => void;
  onApprove: () => void;
  isApproving: boolean;
  isSelected: boolean;
  isBatchApproving: boolean;
  onToggleSelect: () => void;
}) {
  const scannedQty = session.scannedQty ?? session.items.length;
  const expectedQty = session.expectedQty || 0;
  const progress = expectedQty
    ? Math.min(100, (scannedQty / expectedQty) * 100)
    : 100;

  return (
    <article className="wms-card p-4">
      <ApprovalSelection
        checked={isSelected}
        disabled={isBatchApproving}
        label="Chọn phiếu nhập"
        onChange={onToggleSelect}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#69758A]">
            {session.documentNo || session.receiptId}
          </p>
          <h2 className="mt-1 break-words text-[17px] font-semibold tracking-[-0.03em] text-[var(--wms-text-strong)]">
            {session.receiptName}
          </h2>
          <p className="mt-1 line-clamp-1 text-[12px] font-semibold text-[#69758A]">
            {session.warehouseName || "Kho nhận WMS"}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1.5 text-[11px] font-black text-amber-700">
          Chờ duyệt
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between text-[12px] font-bold text-[#69758A]">
        <span>Đã quét {scannedQty}</span>
        <span>Cần {expectedQty || "--"}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E8EEF6]">
        <div
          className="h-full rounded-full bg-emerald-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <AppButton fullWidth variant="secondary" onClick={onOpen}>
          Kiểm tra
        </AppButton>
        <AppButton
          fullWidth
          icon="check-circle"
          disabled={isBatchApproving}
          loading={isApproving}
          onClick={onApprove}
        >
          Phê duyệt
        </AppButton>
      </div>
    </article>
  );
}

function ApprovalSelection({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="mb-3 flex min-h-6 w-fit cursor-pointer items-center gap-2 text-[12px] font-medium text-[var(--wms-text-muted)]">
      <input
        checked={checked}
        className="h-5 w-5 rounded border-[var(--wms-divider)] accent-[var(--wms-primary)]"
        disabled={disabled}
        type="checkbox"
        onChange={onChange}
      />
      <span>{label}</span>
    </label>
  );
}

function dedupeOutboundDocuments(documents: OutboundApprovalDocument[]) {
  const seen = new Set<string>();

  return documents.filter((document) => {
    const key =
      getOutboundDocumentId(document) || getOutboundDocumentCode(document);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeReceiptSessions(sessions: ReceiptSession[]) {
  const seen = new Set<string>();

  return sessions.filter((session) => {
    if (!session.receiptId || seen.has(session.receiptId)) return false;
    seen.add(session.receiptId);
    return true;
  });
}

function isOutboundWaitingApproval(document: OutboundDocumentSummary) {
  const record = document as OutboundDocumentSummary & Record<string, unknown>;
  const status = String(
    record.mini_app_status || record.status || record.approval_status || "",
  ).toUpperCase();
  const expectedQty = getOutboundExpectedQty(document);
  const scannedQty = getOutboundScannedQty(document);
  const fullScan =
    Boolean(record.full_scan) ||
    Boolean(record.ready_for_post) ||
    Boolean(record.ready_for_issue) ||
    (expectedQty > 0 && scannedQty >= expectedQty);

  if (
    ["POSTED", "COMPLETED", "CLOSED", "CANCELLED", "CANCELED"].includes(status)
  ) {
    return false;
  }

  return (
    fullScan ||
    [
      "READY_TO_ISSUE",
      "WAITING_APPROVAL",
      "PENDING_APPROVAL",
      "PENDING",
      "SUBMITTED",
    ].includes(status)
  );
}

function isLocalOutboundWaitingApproval(session: OutboundSession) {
  return (
    session.status === "pending_approval" && Boolean(session.backendDocumentId)
  );
}

function sessionToOutboundApprovalDocument(
  session: OutboundSession,
): OutboundApprovalDocument {
  return {
    id: session.backendDocumentId,
    document_id: session.backendDocumentId,
    doc_no: session.outboundName || session.backendDocumentId,
    status: "WAITING_APPROVAL",
    warehouse_id: session.warehouseId,
    warehouse_name: session.warehouseName,
    expected_total_qty: session.expectedQty,
    scanned_total_qty: session.items.length,
    local_outbound_id: session.outboundId,
  };
}

function getOutboundDocumentId(document: OutboundDocumentSummary) {
  return document.id || document.document_id || "";
}

function getOutboundDocumentCode(document: OutboundDocumentSummary) {
  return (
    document.doc_no ||
    document.document_no ||
    getOutboundDocumentId(document) ||
    "Phiếu xuất"
  );
}

function getOutboundExpectedQty(document: OutboundDocumentSummary) {
  const record = document as OutboundDocumentSummary & Record<string, unknown>;
  return (
    numberValue(record.expected_total_qty) ||
    numberValue(record.required_total_qty) ||
    numberValue(record.required_total) ||
    numberValue(record.required_quantity) ||
    numberValue(record.total_qty) ||
    0
  );
}

function getOutboundScannedQty(document: OutboundDocumentSummary) {
  const record = document as OutboundDocumentSummary & Record<string, unknown>;
  return (
    numberValue(record.scanned_total_qty) ||
    numberValue(record.scanned_qty) ||
    numberValue(record.scanned_quantity) ||
    numberValue(record.matched_count) ||
    0
  );
}

function getOutboundWarehouseName(document: OutboundDocumentSummary) {
  const record = document as OutboundDocumentSummary & Record<string, unknown>;
  const name =
    record.src_warehouse_name ||
    record.warehouse_name ||
    record.src_warehouse_id ||
    record.warehouse_id;

  return typeof name === "string" ? name : undefined;
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getOutboundApprovalErrorMessage(error: unknown) {
  return getReceiptErrorMessage(error).replace(/nhập kho/g, "xuất kho");
}
