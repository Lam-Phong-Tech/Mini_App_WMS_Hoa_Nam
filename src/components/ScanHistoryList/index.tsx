import { Link } from "react-router-dom";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import { SCAN_CONTEXT_CONFIG } from "@/constants/scan.constants";
import type { ScanHistoryItem } from "@/types/scan.types";
import { formatDateTime } from "@/utils/formatDateTime";

function compactText(value?: string | number | null, maxLength = 28) {
  if (value === undefined || value === null || value === "") return "—";
  const text = String(value).replace(/\s+/g, " ").trim();
  const chars = Array.from(text);
  if (chars.length <= maxLength) return text;
  return `${chars.slice(0, 17).join("")}...${chars.slice(-8).join("")}`;
}

export default function ScanHistoryList({ items }: { items: ScanHistoryItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon="history"
        title="Chưa có lịch sử"
        description="Mã vừa quét sẽ hiển thị ở đây sau khi hệ thống phản hồi."
      />
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const productName = item.response?.data?.product?.product_name;
        const serialNo = item.response?.data?.product?.serial_no;
        const warehouseName = item.response?.data?.product?.warehouse_name;

        return (
          <Link
            key={item.id}
            to={`/result/${item.id}`}
            className="block rounded-[18px] border border-[#D6E0EC] bg-white p-3 shadow-[0_12px_28px_rgba(15,23,42,0.05)] active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="break-all text-[15px] font-black leading-5 text-[#06142A]">
                  {compactText(item.request.code, 34)}
                </p>
                <p className="mt-1 line-clamp-1 text-[13px] font-medium text-[#44536A]">
                  {productName ||
                    (item.status === "ERROR"
                      ? "Không xử lý được mã"
                      : "Mã đã được xử lý")}
                </p>
                <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-[#69758A]">
                  <span className="font-black text-[#0F73DC]">
                    {SCAN_CONTEXT_CONFIG[item.request.scan_context].shortTitle}
                  </span>
                  <span>•</span>
                  <span>{formatDateTime(item.request.scanned_at)}</span>
                </div>
              </div>
              <div className="shrink-0">
                <StatusBadge status={item.status} />
              </div>
            </div>
            <div className="mt-3 border-t border-[#E6ECF3] pt-2 text-[11px] font-medium text-[#69758A]">
              <span>{serialNo || item.response?.message || "—"}</span>
              {warehouseName && <span className="float-right">{warehouseName}</span>}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
