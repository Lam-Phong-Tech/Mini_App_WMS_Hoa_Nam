import { useEffect, useMemo, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import LoadingState from "@/components/LoadingState";
import { AppButton } from "@/components/ui/Button";
import { WmsFlowSteps } from "@/components/ui/FlowSteps";
import { Icon } from "@/components/ui/Icon";
import { InfoRow } from "@/components/ui/InfoRow";
import { PageContainer } from "@/components/ui/Page";
import { WmsCard, WmsNotice, WmsPageHeader } from "@/components/ui/WmsRuntime";
import {
  getOutboundDocumentDetailWithMeta,
  type OutboundDocumentDetail,
  type OutboundDocumentLineDetail,
  type OutboundItemMatchDetail,
} from "@/services/scan.service";

export default function OutboundDocumentDetailPage() {
  const { documentId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const openedFromApprovals =
    searchParams.get("from") === "approvals" ||
    location.pathname.startsWith("/approvals/outbound/");
  const backUrl = openedFromApprovals
    ? "/approvals?folder=OUTBOUND"
    : "/history";
  const backLabel = openedFromApprovals
    ? "Quay lại duyệt phiếu xuất"
    : "Quay lại lịch sử";
  const [document, setDocument] = useState<OutboundDocumentDetail>();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();

  useEffect(() => {
    if (!documentId) return;
    let mounted = true;
    setIsLoading(true);
    setLoadError(undefined);

    void loadOutboundDetail(documentId)
      .then(({ document: loadedDocument }) => {
        if (!loadedDocument) throw new Error("Không tìm thấy phiếu xuất.");

        if (!mounted) return;
        setDocument(loadedDocument);
      })
      .catch((loadError) => {
        if (mounted) {
          setLoadError(
            loadError instanceof Error
              ? loadError.message
              : "Không tải được chi tiết phiếu xuất.",
          );
        }
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [documentId]);

  const activeMatches = useMemo(
    () =>
      getOutboundMatches(document).filter(
        (match) => String(match.status || "").toUpperCase() !== "REMOVED",
      ),
    [document],
  );
  const expectedQty = useMemo(
    () =>
      Number(document?.expected_total_qty) ||
      Number(document?.required_total_qty) ||
      (document?.lines || []).reduce((sum, line) => sum + getLineQty(line), 0),
    [document],
  );
  const scannedQty =
    Number(document?.scanned_total_qty) ||
    activeMatches.reduce(
      (sum, match) => sum + Math.max(1, Number(match.quantity) || 1),
      0,
    );
  const progressPercent =
    Number(document?.progress_percent) ||
    (expectedQty ? Math.min(100, (scannedQty / expectedQty) * 100) : 0);
  const fullScan =
    Boolean(document?.full_scan) ||
    (expectedQty > 0 && scannedQty >= expectedQty);
  const displayStatus = getOutboundDisplayStatus(document, fullScan);

  if (isLoading) {
    return (
      <PageContainer className="space-y-4">
        <WmsPageHeader
          title="Chi tiết phiếu xuất"
          onBack={() => navigate(backUrl)}
        />
        <WmsFlowSteps
          current={3}
          labels={["Thông tin", "Quét mã", "Kiểm tra", "Gửi duyệt"]}
        />
        <LoadingState label="Đang tải chi tiết phiếu..." />
      </PageContainer>
    );
  }

  if (loadError || !document) {
    return (
      <PageContainer className="space-y-4">
        <WmsPageHeader
          title="Chi tiết phiếu xuất"
          onBack={() => navigate(backUrl)}
        />
        <WmsFlowSteps
          current={3}
          labels={["Thông tin", "Quét mã", "Kiểm tra", "Gửi duyệt"]}
        />
        <WmsNotice
          tone="danger"
          title="Không tải được phiếu xuất"
          description={
            loadError || "Phiếu xuất không tồn tại hoặc ngoài phân quyền."
          }
        />
        <AppButton
          fullWidth
          variant="secondary"
          onClick={() => navigate(backUrl)}
        >
          {backLabel}
        </AppButton>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-4">
      <WmsPageHeader
        eyebrow="OUT-04"
        title="Kiểm tra hàng xuất"
        onBack={() => navigate(backUrl)}
      />

      <WmsFlowSteps
        current={3}
        labels={["Thông tin", "Quét mã", "Kiểm tra", "Gửi duyệt"]}
      />

      <WmsCard>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-[#69758A]">
              {document.doc_no || document.document_no || document.id}
            </p>
            <h2 className="mt-1 break-words text-[20px] font-black tracking-[-0.04em]">
              Phiếu xuất kho
            </h2>
            <p className="mt-1 text-[12px] font-medium text-[#69758A]">
              {document.src_warehouse_name ||
                document.src_warehouse_id ||
                "Kho xuất WMS"}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-2 text-[12px] font-black ${getStatusClass(displayStatus)}`}
          >
            {getStatusLabel(displayStatus)}
          </span>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#E8EEF6]">
          <div
            className="h-full rounded-full bg-[var(--wms-primary)]"
            style={{
              width: `${progressPercent}%`,
            }}
          />
        </div>

        <div className="mt-3 divide-y divide-[#E6ECF3]">
          <InfoRow
            label="Đã quét"
            value={`${scannedQty}/${expectedQty || "--"}`}
          />
          <InfoRow label="Trạng thái" value={getStatusLabel(displayStatus)} />
          <InfoRow label="Người nhận" value={document.recipient_name} />
          <InfoRow label="SĐT" value={document.recipient_contact_phone} />
          <InfoRow label="Địa chỉ" value={document.recipient_address} />
        </div>
      </WmsCard>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-black text-[#06142A]">
            Danh sách sản phẩm
          </h3>
          <span className="text-[11px] font-semibold text-[#69758A]">
            {document.lines?.length || 0} dòng
          </span>
        </div>

        {(document.lines || []).map((line, index) => (
          <OutboundLineCard
            key={line.id || line.line_id || index}
            line={line}
            index={index}
            matches={activeMatches.filter(
              (match) => match.line_id === (line.id || line.line_id),
            )}
          />
        ))}
      </section>

      {activeMatches.length === 0 && (
        <WmsNotice
          tone="warning"
          title="Phiếu chưa có mã xuất được quét"
          description="Lịch sử phiếu vẫn hiển thị chứng từ, nhưng danh sách mã item sẽ xuất hiện sau khi quét Barcode/QR physical."
        />
      )}

      {fullScan && (
        <WmsNotice
          tone="warning"
          title="Phiếu xuất đang chờ duyệt"
          description="Hàng xuất đã được ghi nhận lên WMS và chờ Post Issue. Tồn kho chưa giảm cho đến khi duyệt/Post Issue thành công."
        />
      )}

      <AppButton
        fullWidth
        icon="package-minus"
        onClick={() => navigate("/documents/OUTBOUND")}
      >
        Tạo phiên xuất mới
      </AppButton>
    </PageContainer>
  );
}

function OutboundLineCard({
  line,
  index,
  matches,
}: {
  line: OutboundDocumentLineDetail;
  index: number;
  matches: OutboundItemMatchDetail[];
}) {
  const expectedQty = getLineQty(line);
  const scannedQty = matches.reduce(
    (sum, match) => sum + Math.max(1, Number(match.quantity) || 1),
    0,
  );

  return (
    <article className="rounded-[20px] border border-[#D6E0EC] bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-700">
          <Icon
            name={
              scannedQty >= expectedQty && expectedQty > 0
                ? "check-circle"
                : "package-minus"
            }
            size={18}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-black text-[#69758A]">
              Dòng #{line.line_no || index + 1}
            </p>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">
              {scannedQty}/{expectedQty || "--"}
            </span>
          </div>
          <p className="mt-1 break-words text-[14px] font-black text-[#06142A]">
            {getLineDisplayName(line)}
          </p>
          <p className="mt-0.5 break-all text-[12px] font-medium text-[#69758A]">
            {getLineDisplayCode(line)}
          </p>

          <div className="mt-3 space-y-2">
            {matches.length > 0 ? (
              matches.map((match, matchIndex) => (
                <div
                  className="rounded-2xl bg-[#F3F6FA] px-3 py-2 text-[12px]"
                  key={match.id || `${match.item_id}-${matchIndex}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 break-all font-black text-[#06142A]">
                      {match.item_code || match.serial_number || match.item_id}
                    </span>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                      Đã quét
                    </span>
                  </div>
                  {match.matched_at && (
                    <p className="mt-1 text-[11px] font-semibold text-[#69758A]">
                      {formatDateTime(match.matched_at)}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-[#CBD7E6] bg-white/70 px-3 py-2 text-[12px] font-semibold text-[#69758A]">
                Chưa quét mã sản phẩm cho dòng này.
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function getLineDisplayName(line: OutboundDocumentLineDetail) {
  return (
    line.sku?.sku_name ||
    line.sku?.name ||
    line.product?.product_name ||
    line.product?.name ||
    line.sku?.sku_code ||
    line.product?.sku_code ||
    line.product_id ||
    line.sku_id ||
    "Sản phẩm"
  );
}

function getLineDisplayCode(line: OutboundDocumentLineDetail) {
  return (
    line.sku?.sku_code ||
    line.sku?.code ||
    line.product?.sku_code ||
    line.product?.code ||
    line.product_id ||
    line.sku_id ||
    "Chưa có mã SKU"
  );
}

async function loadOutboundDetail(documentId: string) {
  return getOutboundDocumentDetailWithMeta(documentId);
}

function getOutboundMatches(document?: OutboundDocumentDetail) {
  return [
    ...(document?.item_matches || []),
    ...(document?.scan_entries || []),
    ...(document?.matches || []),
  ];
}

function getLineQty(line: OutboundDocumentLineDetail) {
  return (
    Number(line.qty_planned) ||
    Number(line.required_quantity) ||
    Number(line.quantity) ||
    Number(line.qty_actual) ||
    0
  );
}

function getOutboundDisplayStatus(
  document: OutboundDocumentDetail | undefined,
  fullScan: boolean,
) {
  const rawStatus = String(document?.mini_app_status || document?.status || "");
  const normalized = rawStatus.toUpperCase();

  if (["POSTED", "COMPLETED", "CLOSED"].includes(normalized)) {
    return "POSTED";
  }

  if (["CANCELLED", "CANCELED"].includes(normalized)) {
    return "CANCELLED";
  }

  if (
    fullScan ||
    [
      "READY_TO_ISSUE",
      "WAITING_APPROVAL",
      "PENDING_APPROVAL",
      "PENDING",
      "SUBMITTED",
    ].includes(normalized)
  ) {
    return "WAITING_APPROVAL";
  }

  return rawStatus || "DRAFT";
}

function getStatusLabel(status?: string) {
  const normalized = String(status || "").toUpperCase();
  if (
    [
      "READY_TO_ISSUE",
      "WAITING_APPROVAL",
      "PENDING_APPROVAL",
      "PENDING",
      "SUBMITTED",
    ].includes(normalized)
  ) {
    return "Chờ duyệt";
  }
  if (normalized === "POSTED") return "Đã post";
  if (normalized === "SCANNING") return "Đang quét";
  if (normalized === "DRAFT") return "Đang xử lý";
  if (normalized === "CANCELLED") return "Đã hủy";
  return status || "Đang xử lý";
}

function getStatusClass(status?: string) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "POSTED") return "bg-emerald-50 text-emerald-700";
  if (normalized === "CANCELLED") return "bg-rose-50 text-rose-700";
  if (
    [
      "READY_TO_ISSUE",
      "WAITING_APPROVAL",
      "PENDING_APPROVAL",
      "PENDING",
      "SUBMITTED",
      "SCANNING",
    ].includes(normalized)
  ) {
    return "bg-amber-50 text-amber-700";
  }
  return "bg-[var(--wms-primary-soft)] text-[var(--wms-primary-strong)]";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
