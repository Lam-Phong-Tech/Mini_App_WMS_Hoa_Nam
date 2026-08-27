import { Link } from "react-router-dom";
import { getErrorMessage } from "@/constants/error-messages";
import StatusBadge from "@/components/StatusBadge";
import { AppButton } from "@/components/ui/Button";
import { InfoRow } from "@/components/ui/InfoRow";
import { WmsCard, WmsNotice } from "@/components/ui/WmsRuntime";
import type { ScanHistoryItem } from "@/types/scan.types";

export default function ScanResultCard({
  item,
  compact = false,
}: {
  item: ScanHistoryItem;
  compact?: boolean;
}) {
  const product = item.response?.data?.product;
  const isError = item.status === "ERROR";
  const approvalStatus = item.response?.data?.approval_status;
  const data = item.response?.data;
  const isWarranty = item.request.scan_context.includes("WARRANTY");
  const isOutbound = item.request.scan_context === "OUTBOUND";
  const isLookup = item.request.scan_context === "INVENTORY_LOOKUP";
  const productTitle =
    product?.product_name ||
    product?.sku_code ||
    (isError
      ? isWarranty
        ? "Không tìm thấy hồ sơ bảo hành"
        : "Không xác định được sản phẩm"
      : item.request.code);
  const warehouseName =
    product?.warehouse_name || product?.current_location?.warehouse_name;

  if (compact) {
    return (
      <WmsCard className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-all text-sm font-black text-[#06142A]">
              {item.request.code}
            </p>
            <p className="mt-1 line-clamp-1 text-[12px] font-medium text-[#69758A]">
              {product?.product_name || item.response?.message || "Đang xử lý"}
            </p>
          </div>
          <StatusBadge status={item.status} />
        </div>
      </WmsCard>
    );
  }

  return (
    <div className="space-y-3">
      <WmsNotice
        tone={isError ? "danger" : "success"}
        title={
          isError
            ? isWarranty
              ? "Không tìm thấy hồ sơ bảo hành"
              : "Không xử lý được mã"
            : isWarranty
              ? "Đã tìm thấy hồ sơ bảo hành"
              : "Quét thành công"
        }
        description={
          isError
            ? getErrorMessage(item.response?.error_code, item.error_message)
            : "Yêu cầu đã được ghi nhận, chưa làm thay đổi tồn kho."
        }
      />

      {!isError && approvalStatus && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] font-black uppercase tracking-[0.08em] text-[#69758A]">
            Trạng thái duyệt
          </span>
          <StatusBadge status={approvalStatus} />
        </div>
      )}

      <WmsCard>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-black uppercase tracking-[0.12em] text-[#69758A]">
              {isWarranty ? "Hồ sơ bảo hành" : "Sản phẩm"}
            </p>
            <h2 className="mt-1 line-clamp-2 text-[18px] font-black leading-6 tracking-[-0.04em] text-[#06142A]">
              {productTitle}
            </h2>
          </div>
          <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-black text-[#0F73DC]">
            {isWarranty
              ? "Bảo hành"
              : isOutbound
                ? "Xuất kho"
                : isLookup
                  ? "Tra cứu"
                  : "Nhập kho"}
          </span>
        </div>

        <div className="divide-y divide-[#E6ECF3]">
          <InfoRow
            label="Mã đã quét"
            value={item.request.code}
            copyable
          />
          <InfoRow label="SKU" value={product?.sku_code || data?.sku_id} copyable />
          <InfoRow
            label={isWarranty ? "Hồ sơ / Item" : "Item code"}
            value={product?.item_code || data?.item_id || data?.raw_code}
            copyable
          />
          <InfoRow label="Serial" value={product?.serial_no} copyable />
          {warehouseName && <InfoRow label="Kho" value={warehouseName} />}
          {data?.document_id && (
            <InfoRow label="Phiếu" value={data.document_id} copyable />
          )}
          {data?.stock_effect && (
            <InfoRow label="Tác động tồn" value={data.stock_effect} />
          )}
          {typeof data?.movement_created === "boolean" && (
            <InfoRow
              label="Movement"
              value={data.movement_created ? "Đã tạo" : "Chưa tạo"}
            />
          )}
        </div>
      </WmsCard>

      {!isError && isWarranty && (
        <WmsNotice
          title="Không tác động tồn bán được"
          description="Sản phẩm bảo hành chỉ được theo dõi theo hồ sơ và trạng thái riêng."
        />
      )}

      {isError && (
        <div className="grid grid-cols-2 gap-2">
          <Link
            to={`/scanner/${item.request.scan_context}?retry=${encodeURIComponent(
              item.request.code,
            )}`}
          >
            <AppButton fullWidth>Quét lại</AppButton>
          </Link>
          <Link to={`/manual/${item.request.scan_context}`}>
            <AppButton fullWidth variant="secondary">
              Mã khác
            </AppButton>
          </Link>
        </div>
      )}
    </div>
  );
}
