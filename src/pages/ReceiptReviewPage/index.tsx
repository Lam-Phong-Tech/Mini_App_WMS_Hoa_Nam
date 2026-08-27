import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppButton } from "@/components/ui/Button";
import { WmsFlowSteps } from "@/components/ui/FlowSteps";
import { Icon } from "@/components/ui/Icon";
import { WmsCard, WmsNotice, WmsPageHeader } from "@/components/ui/WmsRuntime";
import {
  getReceiptErrorMessage,
  loadInboundReceiptItems,
  loadInboundReceiptSession,
  submitInboundReceiptForApproval,
} from "@/services/receipt-flow.service";
import {
  type ReceiptScanUnit,
  type ReceiptSession,
  useReceiptSessionStore,
} from "@/stores/receipt-session.store";

export default function ReceiptReviewPage() {
  const { receiptId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const getReceiptSession = useReceiptSessionStore((state) => state.getSession);
  const upsertSession = useReceiptSessionStore((state) => state.upsertSession);
  const clearSession = useReceiptSessionStore((state) => state.clearSession);
  const [session, setSession] = useState<ReceiptSession | undefined>(() =>
    isLocalReceiptId(receiptId) ? getReceiptSession(receiptId) : undefined,
  );
  const [backendItems, setBackendItems] = useState<ReceiptScanUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();

  useEffect(() => {
    if (!receiptId) return;
    let mounted = true;
    const storedSession = isLocalReceiptId(receiptId)
      ? getReceiptSession(receiptId)
      : undefined;
    setIsLoading(true);
    setError(undefined);

    void Promise.all([
      storedSession
        ? Promise.resolve(storedSession)
        : loadInboundReceiptSession(receiptId),
      storedSession
        ? Promise.resolve([])
        : loadInboundReceiptItems(receiptId).catch(() => []),
    ])
      .then(([loadedSession, loadedItems]) => {
        if (!mounted) return;
        const nextSession = {
          ...loadedSession,
          status:
            storedSession?.status ||
            loadedSession.status ||
            ("review" as const),
          submittedAt: storedSession?.submittedAt || loadedSession.submittedAt,
          approvedAt: storedSession?.approvedAt || loadedSession.approvedAt,
          items:
            loadedItems.length > 0
              ? mergeItems(loadedItems, loadedSession.items)
              : loadedSession.items,
        };
        setSession(nextSession);
        setBackendItems(loadedItems);
      })
      .catch((requestError) => {
        if (mounted) setError(getReceiptErrorMessage(requestError));
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [getReceiptSession, receiptId]);

  const items = useMemo(() => {
    if (backendItems.length > 0)
      return mergeItems(backendItems, session?.items || []);
    return session?.items || [];
  }, [backendItems, session?.items]);
  const skuRows = useMemo(() => groupReceiptItemsBySku(items), [items]);
  const scannedQty = items.length;
  const isComplete = scannedQty > 0;
  const isRecorded =
    session?.status === "pending_approval" || session?.status === "approved";
  const backUrl =
    searchParams.get("from") === "history"
      ? "/history"
      : searchParams.get("from") === "approvals" || isRecorded
        ? "/approvals"
        : session
          ? `/scanner/RECEIPT?documentId=${encodeURIComponent(session.receiptId)}`
          : -1;

  const handleSubmit = async () => {
    if (!session || !isComplete || isRecorded) return;
    setSubmitError(undefined);
    setIsSubmitting(true);

    try {
      const result = await submitInboundReceiptForApproval({
        ...session,
        items,
      });
      const receiptSession =
        "receiptSession" in result ? result.receiptSession : undefined;
      const submittedSession: ReceiptSession = receiptSession || {
        ...session,
        status: "pending_approval",
        submittedAt: result.submittedAt,
        items,
      };

      clearSession(session.receiptId);
      navigate(
        `/receipt-success/${encodeURIComponent(submittedSession.receiptId)}`,
      );
    } catch (requestError) {
      setSubmitError(getReceiptErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearAndCreateAgain = () => {
    if (!session || !isLocalReceiptId(session.receiptId)) return;
    clearSession(session.receiptId);
    setSession(undefined);
    navigate("/documents/RECEIPT", { replace: true });
  };

  const handleRemoveScannedItem = (targetItem: ReceiptScanUnit) => {
    if (!session || !isLocalReceiptId(session.receiptId) || isSubmitting)
      return;

    const targetKey = getReceiptItemClientKey(targetItem);
    const nextItems = items.filter(
      (item) => getReceiptItemClientKey(item) !== targetKey,
    );
    const nextSession: ReceiptSession = {
      ...session,
      items: nextItems,
      status: "scanning",
      scanRows: [],
    };

    upsertSession(nextSession);
    setSession(nextSession);
    setBackendItems([]);
    setSubmitError(undefined);
  };

  const handleRemoveSkuScan = (row: ReceiptSkuScanRow) => {
    const targetItem = row.items.at(-1);
    if (!targetItem) return;
    handleRemoveScannedItem(targetItem);
  };

  if (isLoading) {
    return (
      <main className="wms-flow-page px-4 pb-8 pt-[calc(env(safe-area-inset-top)+28px)]">
        <div className="mx-auto max-w-md space-y-4">
          <WmsPageHeader
            title="Kiểm tra phiếu nhập"
            onBack={() => navigate(-1)}
          />
          <WmsFlowSteps
            current={3}
            labels={["Thông tin", "Quét mã", "Kiểm tra", "Gửi duyệt"]}
          />
          <WmsCard aria-busy="true" role="status">
            <span className="sr-only">Đang tải dữ liệu phiếu...</span>
            <div className="space-y-3" aria-hidden="true">
              <div className="wms-skeleton h-4 w-2/5" />
              <div className="wms-skeleton h-6 w-4/5" />
              <div className="grid grid-cols-2 gap-3">
                <div className="wms-skeleton h-16" />
                <div className="wms-skeleton h-16" />
              </div>
            </div>
          </WmsCard>
        </div>
      </main>
    );
  }

  if (error || !session) {
    return (
      <main className="wms-flow-page px-4 pb-8 pt-[calc(env(safe-area-inset-top)+28px)]">
        <div className="mx-auto max-w-md space-y-4">
          <WmsPageHeader
            title="Kiểm tra phiếu nhập"
            onBack={() => navigate(-1)}
          />
          <WmsFlowSteps
            current={3}
            labels={["Thông tin", "Quét mã", "Kiểm tra", "Gửi duyệt"]}
          />
          <WmsNotice
            tone="danger"
            title="Không tải được phiếu nhập"
            description={error || "Phiếu nhập không còn trong phiên làm việc."}
          />
          <AppButton
            fullWidth
            variant="secondary"
            onClick={() => navigate("/")}
          >
            Về trang chủ
          </AppButton>
        </div>
      </main>
    );
  }

  return (
    <main className="wms-flow-page px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+28px)]">
      <div className="mx-auto max-w-md space-y-4">
        <WmsPageHeader
          eyebrow="IN-04"
          title="Xác nhận hàng nhập"
          onBack={() =>
            typeof backUrl === "string" ? navigate(backUrl) : navigate(backUrl)
          }
        />

        <WmsFlowSteps
          current={3}
          labels={["Thông tin", "Quét mã", "Kiểm tra", "Gửi duyệt"]}
        />

        <WmsCard>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-[#69758A]">
                {session.documentNo || session.receiptId}
              </p>
              <h2 className="mt-1 break-words text-[20px] font-black tracking-[-0.04em]">
                {session.receiptName}
              </h2>
              <p className="mt-1 text-[12px] font-medium text-[#69758A]">
                {session.warehouseName || "Kho nhận theo phiếu WMS"}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-blue-50 px-3 py-2 text-[13px] font-black text-[#0F73DC]">
              {scannedQty} mã
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-blue-50 p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.06em] text-[#315A86]">
                Tổng đã quét
              </p>
              <p className="mt-1 text-[22px] font-black text-[#0F73DC]">
                {scannedQty}
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.06em] text-emerald-700">
                Số SKU
              </p>
              <p className="mt-1 text-[22px] font-black text-emerald-700">
                {skuRows.length}
              </p>
            </div>
          </div>
        </WmsCard>

        {scannedQty <= 0 && (
          <WmsNotice
            tone="warning"
            title="Chưa có mã quét"
            description="Quay lại màn camera để quét ít nhất 1 sản phẩm trước khi ghi nhận nhập."
          />
        )}

        {!isRecorded && (
          <WmsNotice
            tone="info"
            title="Chỉ Post Receipt mới tăng tồn"
            description="Danh sách dưới đây đang là dữ liệu quét tạm. Bấm Ghi nhận nhập để tạo phiếu WMS, lưu evidence và chuyển sang chờ duyệt."
          />
        )}

        {session.status === "pending_approval" && (
          <WmsNotice
            tone="success"
            title="Đã ghi nhận hàng nhập"
            description="Phiếu đang nằm trong tab Duyệt phiếu để nhân viên phê duyệt."
          />
        )}

        {session.status === "approved" && (
          <WmsNotice
            tone="success"
            title="Phiếu đã phê duyệt"
            description="Phiếu nhập đã được Post Receipt và cập nhật tồn kho."
          />
        )}

        {submitError && (
          <div className="space-y-3">
            <WmsNotice
              tone="danger"
              title="Không thể ghi nhận hàng nhập"
              description={`${submitError} Vuốt trái SKU bị lỗi để xoá 1 mã, rồi quay lại quét mã khác.`}
            />
            {isLocalReceiptId(session.receiptId) && (
              <AppButton
                fullWidth
                variant="danger"
                onClick={handleClearAndCreateAgain}
              >
                Xoá danh sách và tạo lại phiếu nhập
              </AppButton>
            )}
          </div>
        )}

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-black text-[#06142A]">
              SKU đã quét
            </h3>
            <span className="text-[11px] font-semibold text-[#69758A]">
              {isLocalReceiptId(session.receiptId) && !isRecorded
                ? "Vuốt trái để xoá"
                : `Tổng ${scannedQty} sản phẩm`}
            </span>
          </div>

          {skuRows.length > 0 ? (
            skuRows.map((row) => (
              <SkuScanCard
                row={row}
                canRemove={isLocalReceiptId(session.receiptId) && !isRecorded}
                disabled={isSubmitting}
                onRemove={() => handleRemoveSkuScan(row)}
                key={`receipt-sku-${row.skuCode}`}
              />
            ))
          ) : (
            <WmsCard className="border-dashed text-center">
              <p className="text-[13px] font-black text-[#69758A]">
                Chưa có sản phẩm nào trong phiếu.
              </p>
            </WmsCard>
          )}
        </section>

        <div className="wms-sticky-action grid grid-cols-1 gap-3">
          <AppButton
            fullWidth
            icon="check-circle"
            loading={isSubmitting}
            disabled={!isComplete || isRecorded}
            onClick={handleSubmit}
          >
            {isRecorded ? "Đã ghi nhận" : "Ghi nhận nhập"}
          </AppButton>
          <AppButton
            fullWidth
            variant="secondary"
            onClick={() =>
              typeof backUrl === "string"
                ? navigate(backUrl)
                : navigate(backUrl)
            }
          >
            {searchParams.get("from") === "history"
              ? "Quay lại lịch sử"
              : isRecorded || searchParams.get("from") === "approvals"
                ? "Quay lại duyệt phiếu"
                : "Quay lại quét"}
          </AppButton>
        </div>
      </div>
    </main>
  );
}

function SkuScanCard({
  row,
  canRemove,
  disabled,
  onRemove,
}: {
  row: ReceiptSkuScanRow;
  canRemove: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  const [offsetX, setOffsetX] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef(0);
  const startOffsetXRef = useRef(0);
  const newestItem = row.items.at(-1);
  const itemCode =
    newestItem?.itemCode || newestItem?.labelId || newestItem?.code;
  const maxSwipe = 86;

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (disabled || !canRemove) return;
    dragStartXRef.current = event.clientX;
    startOffsetXRef.current = isOpen ? -maxSwipe : 0;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!isDragging || disabled || !canRemove) return;

    const deltaX = event.clientX - dragStartXRef.current;
    const nextOffset = Math.min(
      0,
      Math.max(-maxSwipe, startOffsetXRef.current + deltaX),
    );
    setOffsetX(nextOffset);
  };

  const closeOrOpenByOffset = () => {
    setIsDragging(false);
    const shouldOpen = offsetX <= -maxSwipe / 2;
    setIsOpen(shouldOpen);
    setOffsetX(shouldOpen ? -maxSwipe : 0);
  };

  return (
    <article className="relative overflow-hidden rounded-[20px] border border-[#D6E0EC] bg-white shadow-sm">
      {canRemove && (
        <div className="absolute inset-y-0 right-0 flex w-[86px] items-center justify-center bg-red-500">
          <button
            className="h-full w-full text-[13px] font-black text-white disabled:opacity-40"
            type="button"
            disabled={disabled}
            onClick={onRemove}
          >
            Xoá 1
          </button>
        </div>
      )}
      <div
        className={`relative bg-white p-3 ${
          isDragging ? "" : "transition-transform duration-200 ease-out"
        }`}
        style={{ transform: `translateX(${canRemove ? offsetX : 0}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={closeOrOpenByOffset}
        onPointerCancel={closeOrOpenByOffset}
      >
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
            <Icon name="check-circle" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-black text-[#69758A]">SKU</p>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-[#0F73DC]">
                Đã quét {row.quantity}
              </span>
            </div>
            <p className="mt-1 break-all text-[14px] font-black text-[#06142A]">
              {row.skuCode}
            </p>
            {row.skuName && (
              <p className="mt-0.5 break-words text-[12px] font-medium text-[#69758A]">
                {row.skuName}
              </p>
            )}
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-semibold text-[#69758A]">
              <span>
                {row.manualQty > 0 ? `${row.manualQty} nhập tay` : "Camera"}
              </span>
              <span className="text-right">SL: {row.quantity}</span>
            </div>
            {canRemove && itemCode && (
              <p className="mt-1 line-clamp-1 break-all text-[11px] font-medium text-[#9AA6B7]">
                Mã mới nhất: {itemCode}
              </p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

interface ReceiptSkuScanRow {
  skuCode: string;
  skuName?: string;
  quantity: number;
  manualQty: number;
  items: ReceiptScanUnit[];
}

function groupReceiptItemsBySku(items: ReceiptScanUnit[]): ReceiptSkuScanRow[] {
  const grouped = new Map<string, ReceiptSkuScanRow>();

  for (const item of items) {
    const skuCode =
      item.skuCode ||
      parseSkuFromReceiptCode(item.code) ||
      item.itemCode ||
      item.labelId ||
      item.code;
    const key = skuCode.trim().toUpperCase();
    const current = grouped.get(key);

    if (current) {
      current.quantity += 1;
      if (item.scanMethod === "manual") current.manualQty += 1;
      current.items.push(item);
    } else {
      grouped.set(key, {
        skuCode,
        skuName: item.itemName,
        quantity: 1,
        manualQty: item.scanMethod === "manual" ? 1 : 0,
        items: [item],
      });
    }
  }

  return Array.from(grouped.values()).sort((left, right) =>
    left.skuCode.localeCompare(right.skuCode),
  );
}

function parseSkuFromReceiptCode(value?: string) {
  const match = String(value || "").match(/(?:^|\|)SKU=([^|]+)/i);
  return match?.[1]?.trim();
}

function getReceiptItemClientKey(item: ReceiptScanUnit) {
  return [item.id, item.labelId, item.itemCode, item.code, item.scannedAt]
    .filter(Boolean)
    .join("|");
}

function mergeItems(primary: ReceiptScanUnit[], fallback: ReceiptScanUnit[]) {
  const seen = new Set<string>();
  const merged: ReceiptScanUnit[] = [];

  for (const item of [...primary, ...fallback]) {
    const key = String(item.labelId || item.code || item.id)
      .trim()
      .toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged;
}

function isLocalReceiptId(receiptId?: string) {
  return Boolean(receiptId?.startsWith("local-"));
}
