import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ApprovalBottomAction,
  ApprovalDocumentCard,
  ApprovalDocumentTabs,
  ApprovalFilters,
  ApprovalHeader,
  ApprovalSyncBar,
  InventoryPostNotice,
  ReadySelectBar,
  type ApprovalFilter,
  type ApprovalFolder,
} from "@/components/approval/ApprovalQueueUI";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/LoadingState";
import { AppButton } from "@/components/ui/Button";
import { PageContainer } from "@/components/ui/Page";
import { WmsCard, WmsNotice } from "@/components/ui/WmsRuntime";
import { DEFAULT_WAREHOUSE } from "@/constants/default-warehouse";
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
  const [selectedInboundReceiptIds, setSelectedInboundReceiptIds] = useState<
    string[]
  >([]);
  const [selectedOutboundDocumentIds, setSelectedOutboundDocumentIds] =
    useState<string[]>([]);
  const [isBatchApproving, setIsBatchApproving] = useState(false);
  const [error, setError] = useState<string>();
  const [approveError, setApproveError] = useState<string>();
  const [approveSuccess, setApproveSuccess] = useState<string>();
  const [activeFolder, setActiveFolder] = useState<ApprovalFolder>(() =>
    searchParams.get("folder") === "OUTBOUND" ? "OUTBOUND" : "INBOUND",
  );
  const [activeFilter, setActiveFilter] = useState<ApprovalFilter>("READY");
  const [inboundPage, setInboundPage] = useState(1);
  const [outboundPage, setOutboundPage] = useState(1);
  const [hasMoreInbound, setHasMoreInbound] = useState(false);
  const [hasMoreOutbound, setHasMoreOutbound] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
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

      try {
        const result = await getApprovalQueueDocuments({
          force: Boolean(options?.force),
          folder: targetFolder,
        });
        if (!mountedRef.current || activeLoadIdRef.current !== loadId) return;

        if (result.folder === "INBOUND") {
          const nextSessions = result.approvalSessions || [];
          setApprovalSessions(nextSessions);
          setSelectedInboundReceiptIds((current) =>
            current.filter((receiptId) =>
              nextSessions.some(
                (session) =>
                  session.receiptId === receiptId &&
                  isInboundReadyForApproval(session),
              ),
            ),
          );
          setInboundPage(1);
          setHasMoreInbound(result.hasMore);
        } else {
          const nextDocuments = result.outboundApprovals || [];
          setOutboundApprovals(nextDocuments);
          setSelectedOutboundDocumentIds((current) =>
            current.filter((documentId) =>
              nextDocuments.some(
                (document) =>
                  getOutboundDocumentId(document) === documentId &&
                  isOutboundReadyForApproval(document),
              ),
            ),
          );
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
  const inboundApprovalRows = useMemo(
    () =>
      approvalSessions.map((session) => ({
        session,
        id: session.receiptId,
        ready: isInboundReadyForApproval(session),
      })),
    [approvalSessions],
  );
  const outboundApprovalRows = useMemo(
    () =>
      outboundApprovalDocuments
        .map((document) => ({
          document,
          id: getOutboundDocumentId(document),
          ready: isOutboundReadyForApproval(document),
        }))
        .filter((row): row is typeof row & { id: string } => Boolean(row.id)),
    [outboundApprovalDocuments],
  );
  const activeRows =
    activeFolder === "INBOUND" ? inboundApprovalRows : outboundApprovalRows;
  const activeFolderCount = activeRows.length;
  const readyRows = activeRows.filter((row) => row.ready);
  const needsAttentionRows = activeRows.filter((row) => !row.ready);
  const visibleRows = activeRows.filter((row) =>
    activeFilter === "READY"
      ? row.ready
      : activeFilter === "NEEDS_ATTENTION"
        ? !row.ready
        : true,
  );
  const visibleInboundRows = inboundApprovalRows.filter((row) =>
    activeFilter === "READY"
      ? row.ready
      : activeFilter === "NEEDS_ATTENTION"
        ? !row.ready
        : true,
  );
  const visibleOutboundRows = outboundApprovalRows.filter((row) =>
    activeFilter === "READY"
      ? row.ready
      : activeFilter === "NEEDS_ATTENTION"
        ? !row.ready
        : true,
  );
  const selectableActiveIds = readyRows.map((row) => row.id);
  const activeSelectedCount =
    activeFolder === "INBOUND"
      ? selectedInboundReceiptIds.filter((receiptId) =>
          selectableActiveIds.includes(receiptId),
        ).length
      : selectedOutboundDocumentIds.filter((documentId) =>
          selectableActiveIds.includes(documentId),
        ).length;
  const isAllActiveSelected =
    selectableActiveIds.length > 0 &&
    activeSelectedCount === selectableActiveIds.length;

  const approveInbound = useCallback(async (session: ReceiptSession) => {
    await approveInboundReceipt(session.receiptId);
    invalidateApprovalQueueCache("INBOUND");
    setApprovalSessions((current) =>
      current.filter((item) => item.receiptId !== session.receiptId),
    );
    setSelectedInboundReceiptIds((current) =>
      current.filter((receiptId) => receiptId !== session.receiptId),
    );
  }, []);

  const approveOutbound = useCallback(
    async (document: OutboundDocumentSummary) => {
      const documentId = getOutboundDocumentId(document);
      if (!documentId) {
        throw new Error("Thiếu mã phiếu xuất để duyệt.");
      }

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
      setSelectedOutboundDocumentIds((current) =>
        current.filter((selectedId) => selectedId !== documentId),
      );
    },
    [clearOutboundSession],
  );

  const toggleActiveSelection = (id: string) => {
    if (activeFolder === "INBOUND") {
      setSelectedInboundReceiptIds((current) =>
        current.includes(id)
          ? current.filter((selectedId) => selectedId !== id)
          : [...current, id],
      );
      return;
    }

    setSelectedOutboundDocumentIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    );
  };

  const toggleSelectAllActive = () => {
    if (activeFolder === "INBOUND") {
      setSelectedInboundReceiptIds(
        isAllActiveSelected ? [] : selectableActiveIds,
      );
      return;
    }

    setSelectedOutboundDocumentIds(
      isAllActiveSelected ? [] : selectableActiveIds,
    );
  };

  const handleBatchApprove = async () => {
    const selectedInbound = inboundApprovalRows
      .filter((row) => row.ready && selectedInboundReceiptIds.includes(row.id))
      .map((row) => row.session);
    const selectedOutbound = outboundApprovalRows
      .filter(
        (row) => row.ready && selectedOutboundDocumentIds.includes(row.id),
      )
      .map((row) => row.document);
    const selectedCount =
      activeFolder === "INBOUND"
        ? selectedInbound.length
        : selectedOutbound.length;

    if (selectedCount === 0) return;

    setApproveError(undefined);
    setApproveSuccess(undefined);
    setIsBatchApproving(true);
    const failures: string[] = [];
    let approvedCount = 0;

    // Post tuần tự để mỗi chứng từ lấy ETag mới nhất và tránh dồn transaction tồn kho.
    if (activeFolder === "INBOUND") {
      for (const session of selectedInbound) {
        try {
          await approveInbound(session);
          approvedCount += 1;
        } catch (requestError) {
          failures.push(
            `${session.documentNo || session.receiptId}: ${getReceiptErrorMessage(requestError)}`,
          );
        }
      }
    } else {
      for (const document of selectedOutbound) {
        try {
          await approveOutbound(document);
          approvedCount += 1;
        } catch (requestError) {
          failures.push(
            `${getOutboundDocumentCode(document)}: ${getOutboundApprovalErrorMessage(requestError)}`,
          );
        }
      }
    }

    if (approvedCount > 0) {
      setApproveSuccess(
        `Đã duyệt ${approvedCount}/${selectedCount} phiếu ${
          activeFolder === "INBOUND" ? "nhập" : "xuất"
        }.`,
      );
    }
    if (failures.length > 0) {
      setApproveError(
        `Chưa duyệt được ${failures.length} phiếu. ${failures.slice(0, 3).join(" · ")}`,
      );
    }
    setIsBatchApproving(false);
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
    <PageContainer className="approval-page">
      <ApprovalHeader />

      <ApprovalDocumentTabs
        activeFolder={activeFolder}
        inboundCount={approvalSessions.length}
        outboundCount={outboundApprovalDocuments.length}
        onChange={(folder) => {
          setActiveFolder(folder);
          setActiveFilter("READY");
        }}
      />

      <InventoryPostNotice />

      <ApprovalSyncBar
        isSyncing={isLoading}
        pendingCount={pendingCount}
        onSync={() => void loadQueue({ force: true })}
      />

      <section className="approval-content">
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

        {approveSuccess && (
          <div className="mb-3">
            <WmsNotice
              tone="success"
              title="Duyệt phiếu thành công"
              description={approveSuccess}
            />
          </div>
        )}

        {activeFolderCount > 0 && (
          <>
            <ApprovalFilters
              activeFilter={activeFilter}
              allCount={activeRows.length}
              needsAttentionCount={needsAttentionRows.length}
              readyCount={readyRows.length}
              onChange={setActiveFilter}
            />

            <ReadySelectBar
              checked={isAllActiveSelected}
              disabled={selectableActiveIds.length === 0 || isBatchApproving}
              selectedCount={activeSelectedCount}
              onToggle={toggleSelectAllActive}
            />
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
        ) : !isLoading && visibleRows.length === 0 ? (
          <WmsCard className="py-8">
            <EmptyState
              icon={activeFilter === "READY" ? "check-circle" : "wrench"}
              title={
                activeFilter === "READY"
                  ? "Chưa có phiếu sẵn sàng"
                  : "Không có phiếu cần xử lý"
              }
              description="Đổi bộ lọc để xem các phiếu còn lại trong folder này."
            />
          </WmsCard>
        ) : (
          <div className="approval-document-list">
            {activeFolder === "INBOUND" ? (
              <>
                {visibleInboundRows.map((row) => {
                  const session = row.session;

                  return (
                    <ApprovalDocumentCard
                      code={session.documentNo || session.receiptId}
                      createdAt={session.submittedAt || session.createdAt}
                      key={session.receiptId}
                      ready={row.ready}
                      scannedQty={session.scannedQty ?? session.items.length}
                      onOpen={() =>
                        navigate(
                          `/receipt-review/${encodeURIComponent(session.receiptId)}?from=approvals`,
                        )
                      }
                      selected={selectedInboundReceiptIds.includes(
                        session.receiptId,
                      )}
                      onSelect={() => toggleActiveSelection(session.receiptId)}
                      selectionDisabled={isBatchApproving || !row.ready}
                      expectedQty={session.expectedQty || 0}
                      title={session.receiptName || "Phiếu nhập kho"}
                      warehouseName={getWarehouseDisplayName({
                        fallback: "Kho nhận WMS",
                        id: session.warehouseId,
                        name: session.warehouseName,
                      })}
                    />
                  );
                })}
              </>
            ) : (
              <>
                {visibleOutboundRows.map((row) => {
                  const document = row.document;
                  const documentId = row.id;

                  return (
                    <ApprovalDocumentCard
                      code={getOutboundDocumentCode(document)}
                      createdAt={getOutboundCreatedAt(document)}
                      key={documentId || getOutboundDocumentCode(document)}
                      ready={row.ready}
                      onOpen={() =>
                        documentId &&
                        navigate(
                          `/approvals/outbound/${encodeURIComponent(documentId)}?from=approvals&folder=OUTBOUND`,
                        )
                      }
                      onSelect={() =>
                        documentId && toggleActiveSelection(documentId)
                      }
                      selectionDisabled={isBatchApproving || !row.ready}
                      expectedQty={getOutboundExpectedQty(document)}
                      scannedQty={getOutboundScannedQty(document)}
                      selected={selectedOutboundDocumentIds.includes(
                        documentId,
                      )}
                      title={getOutboundDocumentTitle(document)}
                      warehouseName={getWarehouseDisplayName({
                        fallback: "Kho xuất WMS",
                        id: getOutboundWarehouseId(document),
                        name: getOutboundWarehouseName(document),
                      })}
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

      {activeFolderCount > 0 && (
        <ApprovalBottomAction
          isApproving={isBatchApproving}
          needsAttentionCount={needsAttentionRows.length}
          selectedCount={activeSelectedCount}
          onApprove={() => void handleBatchApprove()}
        />
      )}
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

function isInboundReadyForApproval(session: ReceiptSession) {
  const scannedQty = Math.max(0, session.scannedQty ?? session.items.length);
  const expectedQty = Math.max(0, session.expectedQty || 0);

  return expectedQty === 0 || scannedQty >= expectedQty;
}

function isOutboundReadyForApproval(document: OutboundDocumentSummary) {
  const expectedQty = getOutboundExpectedQty(document);
  const scannedQty = getOutboundScannedQty(document);

  return expectedQty === 0 || scannedQty >= expectedQty;
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
    created_at: session.submittedAt || session.createdAt,
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

function getOutboundDocumentTitle(document: OutboundDocumentSummary) {
  const record = document as OutboundDocumentSummary & Record<string, unknown>;
  const value =
    record.name ||
    record.document_name ||
    record.title ||
    record.purpose ||
    record.recipient_name;

  return typeof value === "string" && value.trim() ? value : "Phiếu xuất kho";
}

function getOutboundCreatedAt(document: OutboundDocumentSummary) {
  const record = document as OutboundDocumentSummary & Record<string, unknown>;
  const value = record.created_at || record.submitted_at || record.updated_at;

  return typeof value === "string" ? value : undefined;
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
  const name = record.src_warehouse_name || record.warehouse_name;

  return typeof name === "string" ? name : undefined;
}

function getOutboundWarehouseId(document: OutboundDocumentSummary) {
  const record = document as OutboundDocumentSummary & Record<string, unknown>;
  const id = record.src_warehouse_id || record.warehouse_id;

  return typeof id === "string" ? id : undefined;
}

function getWarehouseDisplayName({
  fallback,
  id,
  name,
}: {
  fallback: string;
  id?: string;
  name?: string;
}) {
  const normalizedName = name?.trim();
  if (normalizedName && normalizedName !== DEFAULT_WAREHOUSE.id) {
    return normalizedName;
  }

  if (id === DEFAULT_WAREHOUSE.id || normalizedName === DEFAULT_WAREHOUSE.id) {
    return DEFAULT_WAREHOUSE.name;
  }

  return fallback;
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getOutboundApprovalErrorMessage(error: unknown) {
  return getReceiptErrorMessage(error).replace(/nhập kho/g, "xuất kho");
}
