import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import EmptyState from "@/components/EmptyState";
import ScanResultCard from "@/components/ScanResultCard";
import StatusBadge from "@/components/StatusBadge";
import { AppButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { InfoRow } from "@/components/ui/InfoRow";
import { PageContainer } from "@/components/ui/Page";
import { WmsCard, WmsNotice, WmsPageHeader } from "@/components/ui/WmsRuntime";
import { useScanSessionStore } from "@/stores/scan-session.store";
import type { ScanContext, ScanHistoryItem } from "@/types/scan.types";

const resultMeta: Record<
  ScanContext,
  {
    confirmTitle: string;
    finalTitle: string;
    operation: string;
    finalSuccess: string;
    finalDescription: string;
    continueLabel: string;
    chip: string;
  }
> = {
  RECEIPT: {
    confirmTitle: "Xác nhận hàng nhập",
    finalTitle: "Kết quả nhập kho",
    operation: "Nhập kho",
    finalSuccess: "Đã ghi nhận hàng nhập",
    finalDescription: "Yêu cầu đã được tạo và đang chờ duyệt.",
    continueLabel: "Quét tiếp hàng nhập",
    chip: "Nhập kho",
  },
  OUTBOUND: {
    confirmTitle: "Xác nhận hàng xuất",
    finalTitle: "Kết quả xuất kho",
    operation: "Xuất kho",
    finalSuccess: "Đã ghi nhận hàng xuất",
    finalDescription:
      "Mã đã được ghi nhận theo chứng từ xuất và đang chờ duyệt.",
    continueLabel: "Quét tiếp hàng xuất",
    chip: "Xuất kho",
  },
  WARRANTY_ITEM: {
    confirmTitle: "Xác nhận bảo hành",
    finalTitle: "Kết quả bảo hành",
    operation: "Bảo hành",
    finalSuccess: "Đã ghi nhận tra cứu bảo hành",
    finalDescription: "Hồ sơ đã được ghi nhận theo ngữ cảnh bảo hành.",
    continueLabel: "Quét tiếp bảo hành",
    chip: "Bảo hành",
  },
  WARRANTY_COMPONENT: {
    confirmTitle: "Xác nhận linh kiện",
    finalTitle: "Kết quả linh kiện",
    operation: "Linh kiện bảo hành",
    finalSuccess: "Đã ghi nhận linh kiện",
    finalDescription: "Mã linh kiện đã được ghi nhận.",
    continueLabel: "Quét tiếp linh kiện",
    chip: "Linh kiện",
  },
  INVENTORY_LOOKUP: {
    confirmTitle: "Xác nhận tra cứu",
    finalTitle: "Kết quả tra cứu",
    operation: "Tra cứu",
    finalSuccess: "Đã ghi nhận tra cứu",
    finalDescription: "Mã đã được xử lý.",
    continueLabel: "Quét tiếp",
    chip: "Tra cứu",
  },
};

export default function ScanResultPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const item = useScanSessionStore((state) =>
    id ? state.getById(id) : undefined,
  );
  const markConfirmed = useScanSessionStore((state) => state.markConfirmed);
  const [checked, setChecked] = useState(false);

  if (!item) {
    return (
      <PageContainer className="space-y-5">
        <WmsPageHeader
          eyebrow="Đã kiểm tra mã"
          title="Kết quả quét"
          onBack={() => navigate(-1)}
        />
        <EmptyState
          icon="search"
          title="Không tìm thấy kết quả"
          description="Kết quả chỉ được giữ trong phiên làm việc hiện tại của app."
        />
      </PageContainer>
    );
  }

  if (item.status !== "SUCCESS") {
    return (
      <PageContainer className="space-y-5">
        <WmsPageHeader
          eyebrow="Đã kiểm tra mã"
          title="Kết quả quét"
          onBack={() => navigate(-1)}
        />
        <ScanResultCard item={item} />
      </PageContainer>
    );
  }

  if (item.request.scan_context === "INVENTORY_LOOKUP") {
    return (
      <InventoryLookupResultPage item={item} onBack={() => navigate(-1)} />
    );
  }

  if (!item.confirmed_at) {
    return (
      <OperationConfirmPage
        checked={checked}
        item={item}
        onBack={() => navigate(-1)}
        onCheckedChange={setChecked}
        onConfirm={() => markConfirmed(item.id)}
      />
    );
  }

  return <OperationFinalPage item={item} onBack={() => navigate(-1)} />;
}

function InventoryLookupResultPage({
  item,
  onBack,
}: {
  item: ScanHistoryItem;
  onBack: () => void;
}) {
  const details = getResultDetails(item);
  const product = item.response?.data?.product;

  return (
    <PageContainer className="space-y-3">
      <WmsPageHeader
        eyebrow="Tra cứu từ QR/Barcode"
        title="Chi tiết sản phẩm"
        onBack={onBack}
      />

      <WmsNotice
        tone="success"
        title="Đã nhận diện sản phẩm"
        description="Thông tin dưới đây được lấy trực tiếp từ backend WMS và không làm thay đổi tồn kho."
      />

      <WmsCard>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#69758A]">
              Sản phẩm
            </p>
            <h1 className="mt-1 break-words text-[20px] font-black leading-7 tracking-[-0.04em] text-[#06142A]">
              {details.title}
            </h1>
            {product?.brand_name && (
              <p className="mt-1 text-[12px] font-semibold text-[#69758A]">
                {product.brand_name}
                {product.model ? ` · ${product.model}` : ""}
              </p>
            )}
          </div>
          <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-black text-[#0F73DC]">
            TRA CỨU
          </span>
        </div>

        <div className="mt-3 divide-y divide-[#E6ECF3]">
          <InfoRow label="Mã QR" value={item.request.code} copyable />
          <InfoRow label="SKU" value={details.sku} copyable />
          <InfoRow label="Mã item" value={product?.item_code} copyable />
          <InfoRow label="Serial" value={details.serial} copyable />
          <InfoRow label="Nhóm" value={product?.category_name} />
          <InfoRow label="Đơn vị" value={product?.unit_name} />
          <InfoRow label="Kho" value={details.warehouse} />
          <InfoRow
            label="Trạng thái"
            value={product?.stock_status || product?.object_status}
          />
        </div>
      </WmsCard>

      <ProductTextCard
        title="Công dụng"
        value={product?.purpose || product?.usage}
        empty="Backend chưa khai báo công dụng cho sản phẩm này."
      />

      {product?.purpose &&
        product?.usage &&
        product.purpose !== product.usage && (
          <ProductTextCard title="Hướng dẫn sử dụng" value={product.usage} />
        )}

      <ProductTextCard
        title="Mô tả sản phẩm"
        value={product?.description}
        empty="Backend chưa khai báo mô tả cho sản phẩm này."
      />

      {product?.technical_specifications && (
        <ProductTextCard
          title="Thông số sản phẩm"
          value={product.technical_specifications}
        />
      )}

      <div className="grid grid-cols-2 gap-2">
        <Link to="/">
          <AppButton fullWidth variant="secondary">
            Trang chủ
          </AppButton>
        </Link>
        <Link to="/scanner/INVENTORY_LOOKUP">
          <AppButton fullWidth icon="scan">
            Quét mã khác
          </AppButton>
        </Link>
      </div>
    </PageContainer>
  );
}

function ProductTextCard({
  title,
  value,
  empty,
}: {
  title: string;
  value?: string;
  empty?: string;
}) {
  return (
    <WmsCard className="space-y-2">
      <h2 className="text-[14px] font-black text-[#182B45]">{title}</h2>
      <p className="whitespace-pre-wrap text-[13px] font-medium leading-6 text-[#526178]">
        {value || empty || "Chưa có thông tin."}
      </p>
    </WmsCard>
  );
}

function OperationConfirmPage({
  item,
  checked,
  onCheckedChange,
  onConfirm,
  onBack,
}: {
  item: ScanHistoryItem;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const meta = resultMeta[item.request.scan_context];
  const details = getResultDetails(item);

  return (
    <PageContainer className="space-y-3">
      <WmsPageHeader
        eyebrow="Kiểm tra trước khi gửi"
        title={meta.confirmTitle}
        onBack={onBack}
      />

      <section className="rounded-[18px] border border-blue-100 bg-blue-50 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#637188]">
              Nghiệp vụ
            </p>
            <p className="mt-1 truncate text-[14px] font-black text-[#06142A]">
              {meta.operation}
              {details.warehouse ? ` · ${details.warehouse}` : ""}
            </p>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-[#0F73DC]">
            {meta.chip.toUpperCase()}
          </span>
        </div>
      </section>

      <WmsCard>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#69758A]">
              Sản phẩm đã nhận diện
            </p>
            <h2 className="mt-1 line-clamp-2 text-[18px] font-black leading-6 tracking-[-0.04em]">
              {details.title}
            </h2>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700">
            ✓ Hợp lệ
          </span>
        </div>

        <div className="divide-y divide-[#E6ECF3]">
          <InfoRow label="Mã đã quét" value={item.request.code} copyable />
          <InfoRow label="SKU" value={details.sku} copyable />
          <InfoRow label="Serial" value={details.serial} copyable />
          <InfoRow label="Kho" value={details.warehouse} />
        </div>
      </WmsCard>

      <WmsNotice
        tone="warning"
        title="Chưa cộng tồn kho"
        description="Xác nhận chỉ ghi nhận yêu cầu nhập/xuất/bảo hành. Tồn chỉ thay đổi sau đúng approval/Post từ backend."
      />

      <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-[#D6E0EC] bg-white px-3 text-[12px] font-medium text-[#44536A]">
        <span
          className={`grid h-6 w-6 place-items-center rounded-md border ${
            checked
              ? "border-[#0F73DC] bg-[#0F73DC] text-white"
              : "border-[#B8C4D6] bg-white"
          }`}
        >
          {checked && <Icon name="check-circle" size={16} strokeWidth={3} />}
        </span>
        <input
          checked={checked}
          className="sr-only"
          type="checkbox"
          onChange={(event) => onCheckedChange(event.target.checked)}
        />
        Tôi đã đối chiếu đúng sản phẩm, serial và kho/ngữ cảnh.
      </label>

      <div className="wms-sticky-action grid grid-cols-[0.78fr_1.22fr] gap-2">
        <Link to={getScannerUrl(item)}>
          <AppButton fullWidth variant="secondary">
            Quét lại
          </AppButton>
        </Link>
        <AppButton fullWidth disabled={!checked} onClick={onConfirm}>
          Xác nhận ghi nhận
        </AppButton>
      </div>
    </PageContainer>
  );
}

function OperationFinalPage({
  item,
  onBack,
}: {
  item: ScanHistoryItem;
  onBack: () => void;
}) {
  const meta = resultMeta[item.request.scan_context];
  const details = getResultDetails(item);

  return (
    <PageContainer className="space-y-3">
      <WmsPageHeader
        eyebrow="Đã ghi nhận mã"
        title={meta.finalTitle}
        onBack={onBack}
      />

      <section className="rounded-[20px] border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
            <Icon name="check-circle" size={26} strokeWidth={3} />
          </span>
          <div className="min-w-0">
            <p className="text-[16px] font-black">{meta.finalSuccess}</p>
            <p className="mt-1 text-[12px] font-medium leading-5 opacity-85">
              {meta.finalDescription}
            </p>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-black uppercase tracking-[0.08em] text-[#69758A]">
          Trạng thái nghiệp vụ
        </p>
        <StatusBadge
          status={item.response?.data?.approval_status || "PENDING_APPROVAL"}
        />
      </div>

      <WmsCard>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#69758A]">
              Sản phẩm
            </p>
            <h2 className="mt-1 line-clamp-2 text-[18px] font-black leading-6 tracking-[-0.04em]">
              {details.title}
            </h2>
          </div>
          <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-black text-[#0F73DC]">
            {meta.chip}
          </span>
        </div>

        <div className="divide-y divide-[#E6ECF3]">
          <InfoRow
            label="Mã yêu cầu"
            value={item.response?.data?.document_id || item.id}
            copyable
          />
          <InfoRow label="SKU" value={details.sku} copyable />
          <InfoRow label="Serial" value={details.serial} copyable />
          <InfoRow label="Kho" value={details.warehouse} />
        </div>
      </WmsCard>

      <WmsNotice
        title="Tồn kho chưa thay đổi"
        description="Chỉ hiển thị “Đã nhập/xuất kho” sau khi backend trả trạng thái đã duyệt/Post thành công."
      />

      {item.request.scan_context === "OUTBOUND" && item.request.document_id && (
        <Link
          to={`/approvals/outbound/${encodeURIComponent(
            item.request.document_id,
          )}?from=approvals&folder=OUTBOUND`}
        >
          <AppButton fullWidth>Kiểm tra phiếu xuất</AppButton>
        </Link>
      )}

      <div className="wms-sticky-action grid grid-cols-[0.78fr_1.22fr] gap-2">
        <Link to="/history">
          <AppButton fullWidth variant="secondary">
            Lịch sử
          </AppButton>
        </Link>
        <Link to={getScannerUrl(item)}>
          <AppButton fullWidth icon="scan">
            {meta.continueLabel}
          </AppButton>
        </Link>
      </div>
    </PageContainer>
  );
}

function getResultDetails(item: ScanHistoryItem) {
  const data = item.response?.data;
  const product = data?.product;

  return {
    title:
      product?.product_name ||
      product?.sku_code ||
      product?.item_code ||
      data?.raw_code ||
      item.request.code,
    sku: product?.sku_code || data?.sku_id,
    serial:
      product?.serial_no ||
      product?.item_code ||
      data?.item_id ||
      data?.raw_code,
    warehouse:
      product?.warehouse_name ||
      product?.current_location?.warehouse_name ||
      undefined,
  };
}

function getScannerUrl(item: ScanHistoryItem) {
  return `/scanner/${item.request.scan_context}${
    item.request.document_id
      ? `?documentId=${encodeURIComponent(item.request.document_id)}`
      : ""
  }`;
}
