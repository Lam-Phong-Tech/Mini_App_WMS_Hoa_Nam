import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppButton } from "@/components/ui/Button";
import { WmsFlowSteps } from "@/components/ui/FlowSteps";
import { Icon } from "@/components/ui/Icon";
import { WmsCard, WmsNotice, WmsPageHeader } from "@/components/ui/WmsRuntime";
import {
  getReceiptErrorMessage,
  loadInboundReceiptItems,
  loadInboundReceiptSession,
} from "@/services/receipt-flow.service";
import type { ReceiptSession } from "@/stores/receipt-session.store";

export default function ReceiptSuccessPage() {
  const { receiptId = "" } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<ReceiptSession>();
  const [itemCount, setItemCount] = useState(0);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!receiptId) return;
    let mounted = true;

    void Promise.all([
      loadInboundReceiptSession(receiptId),
      loadInboundReceiptItems(receiptId).catch(() => []),
    ])
      .then(([loadedSession, items]) => {
        if (!mounted) return;
        setSession(loadedSession);
        setItemCount(items.length || loadedSession.items.length);
      })
      .catch((requestError) => {
        if (mounted) setError(getReceiptErrorMessage(requestError));
      });

    return () => {
      mounted = false;
    };
  }, [receiptId]);

  return (
    <main className="wms-flow-page px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+28px)]">
      <div className="mx-auto max-w-md space-y-4">
        <WmsPageHeader eyebrow="Đã ghi nhận mã" title="Kết quả nhập kho" />
        <WmsFlowSteps
          current={4}
          labels={["Thông tin", "Quét mã", "Kiểm tra", "Gửi duyệt"]}
        />

        <section className="rounded-[28px] border border-emerald-100 bg-white p-6 text-center shadow-[0_16px_38px_rgba(16,24,40,0.08)]">
          <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <Icon name="check-circle" size={40} strokeWidth={2.5} />
          </span>
          <h1 className="mt-5 text-[24px] font-black tracking-[-0.05em] text-[#06142A]">
            Đã ghi nhận hàng nhập
          </h1>
          <p className="mt-2 text-[14px] font-semibold leading-6 text-[#69758A]">
            Phiếu đã được lưu trên backend và chuyển sang chờ duyệt.
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
            value={session?.receiptName || "Phiếu nhập"}
          />
          <InfoRow label="Mã phiếu" value={session?.documentNo || receiptId} />
          <InfoRow label="Số lượng" value={`${itemCount} sản phẩm`} />
          <InfoRow label="Trạng thái" value="Chờ duyệt nhập kho" />
        </WmsCard>

        <WmsCard className="border-blue-100 bg-blue-50">
          <p className="text-[13px] font-black text-[#0F73DC]">
            Chưa tăng tồn kho
          </p>
          <p className="mt-1 text-[12px] font-semibold leading-5 text-[#315A86]">
            Bước này chỉ tạo phiếu WMS và lưu scan evidence. Tồn kho chỉ tăng
            sau khi duyệt/Post Receipt.
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
            icon="scan"
            onClick={() => navigate("/documents/RECEIPT")}
          >
            NHẬP KHO TIẾP
          </AppButton>
        </div>
      </div>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#E6ECF3] py-3 last:border-b-0">
      <span className="text-[12px] font-semibold text-[#69758A]">{label}</span>
      <span className="min-w-0 break-words text-right text-[13px] font-black text-[#06142A]">
        {value}
      </span>
    </div>
  );
}
