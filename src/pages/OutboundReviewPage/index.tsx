import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppButton } from "@/components/ui/Button";
import { WmsFlowSteps } from "@/components/ui/FlowSteps";
import { Icon } from "@/components/ui/Icon";
import { WmsCard, WmsNotice, WmsPageHeader } from "@/components/ui/WmsRuntime";
import { ApiClientError } from "@/services/api-client";
import { recordOutboundBatch } from "@/services/scan.service";
import {
  createOutboundScanRows,
  type OutboundScanRow,
  type OutboundSession,
  useOutboundSessionStore,
} from "@/stores/outbound-session.store";
import { generateClientScanId } from "@/utils/generateClientScanId";
import { isUuid } from "@/utils/isUuid";

export default function OutboundReviewPage() {
  const { outboundId = "" } = useParams();
  const navigate = useNavigate();
  const getSession = useOutboundSessionStore((state) => state.getSession);
  const updateSession = useOutboundSessionStore((state) => state.updateSession);
  const clearSession = useOutboundSessionStore((state) => state.clearSession);
  const [session, setSession] = useState<OutboundSession | undefined>(() =>
    getSession(outboundId),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  const items = session?.items || [];
  const scanRows = useMemo(() => {
    if (!session) return [];
    return createOutboundScanRows(session.expectedQty, items);
  }, [items, session]);
  const scannedQty = items.length;
  const expectedQty = session?.expectedQty || 0;
  const isComplete = expectedQty > 0 && scannedQty >= expectedQty;

  const handleSubmit = async () => {
    if (!session || !isComplete || isSubmitting) return;

    const rawItems = items
      .map((item) => item.rawCode || item.code)
      .filter(Boolean);

    if (!session.warehouseId) {
      setSubmitError("Thiếu kho xuất để ghi nhận hàng xuất.");
      return;
    }

    if (!isUuid(session.warehouseId)) {
      setSubmitError(
        "Kho xuất không hợp lệ. Vui lòng tạo lại phiếu xuất từ màn Mini App để lấy đúng kho WMS.",
      );
      return;
    }

    if (!session.recipientName.trim()) {
      setSubmitError("Thiếu người nhận để ghi nhận hàng xuất.");
      return;
    }

    if (rawItems.length !== session.expectedQty) {
      setSubmitError("Danh sách mã chưa đủ để ghi nhận hàng xuất.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(undefined);

    try {
      const activeSession = session.recordIdempotencyKey
        ? session
        : {
            ...session,
            recordIdempotencyKey: generateClientScanId(),
          };

      if (!session.recordIdempotencyKey) {
        updateSession(session.outboundId, {
          recordIdempotencyKey: activeSession.recordIdempotencyKey,
        });
        setSession(activeSession);
      }

      const recordIdempotencyKey =
        activeSession.recordIdempotencyKey || generateClientScanId();
      const result = await recordOutboundBatch(
        {
          name:
            activeSession.outboundName?.trim() ||
            `Phiếu xuất ${new Date().toLocaleString("vi-VN")}`,
          warehouse_id: activeSession.warehouseId || "",
          recipient_name: activeSession.recipientName.trim(),
          recipient_address: activeSession.recipientAddress,
          recipient_contact_phone: activeSession.recipientPhone,
          note: activeSession.note,
          expected_total_qty: activeSession.expectedQty,
          items: activeSession.items.map((item) => ({
            raw_code: item.rawCode || item.code,
            scan_source: item.scanMethod === "manual" ? "MANUAL" : "CAMERA",
          })),
        },
        recordIdempotencyKey,
      );
      const documentId = result.document?.document_id || result.document?.id;

      if (!documentId) {
        throw new Error(
          "WMS đã ghi nhận nhưng chưa trả mã phiếu xuất. Vui lòng đồng bộ lịch sử để kiểm tra lại.",
        );
      }

      const submittedSession = {
        ...activeSession,
        status: "pending_approval" as const,
        submittedAt: new Date().toISOString(),
        backendDocumentId: documentId,
      };

      updateSession(activeSession.outboundId, submittedSession);
      setSession(submittedSession);
      navigate(
        `/outbound-success/${encodeURIComponent(documentId)}?localId=${encodeURIComponent(activeSession.outboundId)}`,
        { replace: true },
      );
    } catch (error) {
      if (error instanceof ApiClientError && error.status >= 500) {
        const nextIdempotencyKey = generateClientScanId();
        updateSession(session.outboundId, {
          recordIdempotencyKey: nextIdempotencyKey,
        });
        setSession((current) =>
          current
            ? { ...current, recordIdempotencyKey: nextIdempotencyKey }
            : current,
        );
      }

      setSubmitError(
        error instanceof ApiClientError
          ? buildApiErrorMessage(error)
          : error instanceof Error
            ? error.message
            : "Không ghi nhận được hàng xuất lên WMS.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearAndCreateAgain = () => {
    if (!session) return;
    clearSession(session.outboundId);
    setSession(undefined);
    navigate("/documents/OUTBOUND", { replace: true });
  };

  if (!session) {
    return (
      <main className="wms-flow-page px-4 pb-8 pt-[calc(env(safe-area-inset-top)+28px)]">
        <div className="mx-auto max-w-md space-y-4">
          <WmsPageHeader
            title="Kiểm tra phiếu xuất"
            onBack={() => navigate("/")}
          />
          <WmsFlowSteps
            current={3}
            labels={["Thông tin", "Quét mã", "Kiểm tra", "Gửi duyệt"]}
          />
          <WmsNotice
            tone="danger"
            title="Không tìm thấy phiên xuất kho"
            description="Phiên tạm có thể đã bị xoá hoặc app vừa tải lại. Vui lòng tạo phiên xuất mới."
          />
          <AppButton fullWidth onClick={() => navigate("/documents/OUTBOUND")}>
            Tạo phiên xuất kho
          </AppButton>
        </div>
      </main>
    );
  }

  return (
    <main className="wms-flow-page px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+28px)]">
      <div className="mx-auto max-w-md space-y-4">
        <WmsPageHeader
          eyebrow="OUT-RECORD"
          title="Xác nhận hàng xuất"
          onBack={() =>
            navigate(
              `/scanner/OUTBOUND?documentId=${encodeURIComponent(session.outboundId)}`,
            )
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
                {session.outboundId}
              </p>
              <h2 className="mt-1 break-words text-[20px] font-black tracking-[-0.04em]">
                {session.outboundName || "Phiếu xuất Mini App"}
              </h2>
              <p className="mt-1 text-[12px] font-medium text-[#69758A]">
                Người nhận: {session.recipientName}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-amber-50 px-3 py-2 text-[13px] font-black text-amber-700">
              {scannedQty}/{expectedQty}
            </span>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#E8EEF6]">
            <div
              className="h-full rounded-full bg-[var(--wms-primary)]"
              style={{
                width: `${expectedQty ? Math.min(100, (scannedQty / expectedQty) * 100) : 0}%`,
              }}
            />
          </div>
        </WmsCard>

        {!isComplete && (
          <WmsNotice
            tone="warning"
            title="Chưa đủ số lượng"
            description="Bạn cần quét đủ số lượng đã nhập trước khi xác nhận ghi nhận."
          />
        )}

        <WmsNotice
          tone="info"
          title="Ghi nhận chưa trừ tồn"
          description="Sau khi xác nhận, phiếu xuất chuyển sang chờ duyệt/Post Issue. Chỉ khi Post Issue thành công thì tồn kho mới giảm."
        />

        {submitError && (
          <div className="space-y-3">
            <WmsNotice
              tone="danger"
              title="Không thể ghi nhận hàng xuất"
              description={submitError}
            />
            <AppButton
              fullWidth
              variant="danger"
              onClick={handleClearAndCreateAgain}
            >
              Xoá danh sách và tạo lại phiếu xuất
            </AppButton>
          </div>
        )}

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-[var(--wms-text-strong)]">
              Danh sách sản phẩm
            </h3>
            <span className="text-[11px] font-semibold text-[#69758A]">
              {scannedQty}/{expectedQty || "--"} mã đã resolve
            </span>
          </div>

          {scanRows.map((row) => (
            <OutboundScanLineCard
              row={row}
              key={`outbound-row-${row.position}`}
            />
          ))}
        </section>

        <div className="wms-sticky-action space-y-2">
          <AppButton
            fullWidth
            icon="check-circle"
            loading={isSubmitting}
            disabled={!isComplete}
            onClick={handleSubmit}
          >
            Xác nhận ghi nhận
          </AppButton>
          <AppButton
            fullWidth
            variant="secondary"
            onClick={() =>
              navigate(
                `/scanner/OUTBOUND?documentId=${encodeURIComponent(session.outboundId)}`,
              )
            }
          >
            Quay lại quét
          </AppButton>
        </div>
      </div>
    </main>
  );
}

function buildApiErrorMessage(error: ApiClientError) {
  const parts = [
    error.userMessage,
    error.status >= 500
      ? "Bạn có thể thử ghi nhận lại; app đã đổi khóa chống gửi trùng."
      : undefined,
  ].filter(Boolean);

  return parts.join(" · ") || "Không ghi nhận được hàng xuất lên WMS.";
}

function OutboundScanLineCard({ row }: { row: OutboundScanRow }) {
  const item = row.item;

  if (!item) {
    return (
      <article className="rounded-[20px] border border-dashed border-[#CBD7E6] bg-white/70 p-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-500">
            <Icon name="clock" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-black text-[#69758A]">
              Dòng #{row.position}
            </p>
            <p className="mt-1 text-[14px] font-black text-[#06142A]">
              Chờ quét mã
            </p>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-[20px] border border-[#D6E0EC] bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-700">
          <Icon name="package-minus" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-black text-[#69758A]">
              Dòng #{row.position}
            </p>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-600">
              {item.scanMethod === "manual" ? "Nhập tay" : "Camera"}
            </span>
          </div>
          <p className="mt-1 break-all text-[14px] font-black text-[#06142A]">
            {item.itemUnique || item.itemCode || item.code}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-semibold text-[#69758A]">
            <span className="break-all">
              SKU: {item.skuCode || "BE resolve"}
            </span>
            <span className="text-right">{item.itemStatus || "eligible"}</span>
          </div>
          {item.skuName && (
            <p className="mt-1 truncate text-[11px] font-semibold text-[#69758A]">
              {item.skuName}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
