import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppButton } from "@/components/ui/Button";
import { WmsFlowSteps } from "@/components/ui/FlowSteps";
import { Icon } from "@/components/ui/Icon";
import { WmsCard, WmsNotice, WmsPageHeader } from "@/components/ui/WmsRuntime";
import {
  getOutboundDocumentDetail,
  type OutboundDocumentDetail,
} from "@/services/scan.service";
import {
  type OutboundSession,
  useOutboundSessionStore,
} from "@/stores/outbound-session.store";

export default function OutboundSuccessPage() {
  const { documentId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const localId = searchParams.get("localId") || "";
  const getSession = useOutboundSessionStore((state) => state.getSession);
  const [session] = useState<OutboundSession | undefined>(() =>
    localId ? getSession(localId) : undefined,
  );
  const [document, setDocument] = useState<OutboundDocumentDetail>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!documentId) return;
    let mounted = true;

    void getOutboundDocumentDetail(documentId)
      .then((detail) => {
        if (mounted) setDocument(detail);
      })
      .catch((requestError) => {
        if (!mounted) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Không tải lại được chi tiết phiếu xuất.",
        );
      });

    return () => {
      mounted = false;
    };
  }, [documentId]);

  const documentNo =
    document?.doc_no ||
    document?.document_no ||
    session?.backendDocumentId ||
    documentId;
  const itemCount =
    Number(document?.scanned_total_qty) ||
    Number(document?.scanned_qty) ||
    session?.items.length ||
    0;

  return (
    <main className="wms-flow-page px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+28px)]">
      <div className="mx-auto max-w-md space-y-4">
        <WmsPageHeader eyebrow="Đã ghi nhận mã" title="Kết quả xuất kho" />
        <WmsFlowSteps
          current={4}
          labels={["Thông tin", "Quét mã", "Kiểm tra", "Gửi duyệt"]}
        />

        <section className="wms-card p-6 text-center">
          <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[var(--wms-success-soft)] text-[var(--wms-success-text)]">
            <Icon name="check-circle" size={40} strokeWidth={2.5} />
          </span>
          <h1 className="mt-5 text-[24px] font-semibold tracking-[-0.03em] text-[var(--wms-text-strong)]">
            Đã gửi duyệt phiếu xuất
          </h1>
          <p className="mt-2 text-[14px] font-normal leading-6 text-[var(--wms-text-muted)]">
            Phiếu đã được lưu trên backend và chuyển sang chờ duyệt/Post Issue.
          </p>
        </section>

        {error && (
          <WmsNotice
            tone="warning"
            title="Chưa tải lại được chi tiết phiếu"
            description={error}
          />
        )}

        <WmsCard>
          <InfoRow
            label="Tên phiếu"
            value={session?.outboundName || "Phiếu xuất"}
          />
          <InfoRow label="Mã phiếu" value={documentNo} />
          <InfoRow
            label="Người nhận"
            value={
              session?.recipientName ||
              document?.recipient_name ||
              "Theo phiếu WMS"
            }
          />
          <InfoRow label="Số lượng" value={`${itemCount} sản phẩm`} />
          <InfoRow label="Trạng thái" value="Chờ duyệt xuất kho" />
        </WmsCard>

        <WmsCard className="border-amber-100 bg-amber-50">
          <p className="text-[13px] font-black text-amber-800">
            Chưa trừ tồn kho
          </p>
          <p className="mt-1 text-[12px] font-semibold leading-5 text-amber-800/85">
            Bước này chỉ tạo phiếu xuất và lưu mã đã quét. Tồn kho chỉ giảm sau
            khi duyệt/Post Issue.
          </p>
        </WmsCard>

        <div className="grid grid-cols-2 gap-3">
          <AppButton
            fullWidth
            variant="secondary"
            icon="home"
            onClick={() => navigate("/")}
          >
            TRANG CHỦ
          </AppButton>
          <AppButton
            fullWidth
            icon="package-minus"
            onClick={() => navigate("/documents/OUTBOUND")}
          >
            XUẤT KHO TIẾP
          </AppButton>
        </div>
      </div>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--wms-divider)] py-3 last:border-b-0">
      <span className="text-[12px] font-medium text-[var(--wms-text-muted)]">
        {label}
      </span>
      <span className="min-w-0 break-words text-right text-[13px] font-semibold text-[var(--wms-text-strong)]">
        {value}
      </span>
    </div>
  );
}
