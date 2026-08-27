import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppButton } from "@/components/ui/Button";
import { WmsFlowSteps } from "@/components/ui/FlowSteps";
import { Icon } from "@/components/ui/Icon";
import {
  WmsCard,
  WmsField,
  WmsInput,
  WmsNotice,
  WmsPageHeader,
} from "@/components/ui/WmsRuntime";
import {
  getReceiptErrorMessage,
  getReceiptWarehouses,
  type ReceiptWarehouseOption,
} from "@/services/receipt-flow.service";
import { mergeWmsLinkContext } from "@/services/wms-link-context";
import { useReceiptSessionStore } from "@/stores/receipt-session.store";
import { generateClientScanId } from "@/utils/generateClientScanId";

export default function ReceiptCreatePage() {
  const navigate = useNavigate();
  const upsertSession = useReceiptSessionStore((state) => state.upsertSession);
  const idempotencyKeyRef = useRef(generateClientScanId());
  const [name, setName] = useState("");
  const [warehouses, setWarehouses] = useState<ReceiptWarehouseOption[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let mounted = true;
    setIsLoadingOptions(true);

    void getReceiptWarehouses()
      .then((warehouseItems) => {
        if (!mounted) return;
        setWarehouses(warehouseItems);
        setSelectedWarehouseId(
          (current) => current || warehouseItems[0]?.id || "",
        );
      })
      .catch((requestError) => {
        if (mounted) setError(getReceiptErrorMessage(requestError));
      })
      .finally(() => {
        if (mounted) setIsLoadingOptions(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const selectedWarehouse = useMemo(
    () => warehouses.find((warehouse) => warehouse.id === selectedWarehouseId),
    [selectedWarehouseId, warehouses],
  );

  const formError = useMemo(() => {
    if (!name.trim()) return "Tên phiếu không được để trống.";
    if (!selectedWarehouseId) return "Chưa lấy được kho nhận từ WMS.";
    return undefined;
  }, [name, selectedWarehouseId]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);

    if (formError) {
      setError(formError);
      return;
    }

    setIsSubmitting(true);

    try {
      const localReceiptId = `local-${idempotencyKeyRef.current}`;

      upsertSession({
        receiptId: localReceiptId,
        receiptName: name.trim(),
        warehouseId: selectedWarehouseId,
        warehouseName: selectedWarehouse?.name,
        expectedQty: 0,
        scanDriven: true,
        status: "scanning",
        items: [],
        scanRows: [],
        createdAt: new Date().toISOString(),
      });
      mergeWmsLinkContext({
        documentId: localReceiptId,
        warehouseId: selectedWarehouseId,
      });
      const scannerParams = new URLSearchParams({
        documentId: localReceiptId,
        receiptName: name.trim(),
        warehouseId: selectedWarehouseId,
      });

      if (selectedWarehouse?.name) {
        scannerParams.set("warehouseName", selectedWarehouse.name);
      }

      navigate(`/scanner/RECEIPT?${scannerParams.toString()}`);
    } catch (requestError) {
      setError(getReceiptErrorMessage(requestError));
      idempotencyKeyRef.current = generateClientScanId();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="wms-flow-page px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+28px)]">
      <div className="mx-auto max-w-md space-y-4">
        <WmsPageHeader
          eyebrow="Nhập kho"
          title="Tạo phiếu nhập"
          onBack={() => navigate(-1)}
        />

        <WmsFlowSteps
          current={1}
          labels={["Thông tin", "Quét mã", "Kiểm tra", "Gửi duyệt"]}
        />

        <WmsNotice
          tone="info"
          title="Luồng nhập theo mã quét thực tế"
          description="Không cần chọn SKU hoặc nhập số lượng trước. Mini App gom các mã cùng SKU sau khi quét."
        />

        <form className="space-y-4" onSubmit={handleSubmit}>
          <WmsCard className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="wms-action-icon h-12 w-12 text-[var(--wms-primary)]">
                <Icon name="package-plus" size={22} />
              </span>
              <div>
                <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[var(--wms-text-strong)]">
                  Tạo phiếu nhập mới
                </h2>
                <p className="mt-0.5 text-[12px] font-medium text-[#69758A]">
                  Tạo phiên nhập, sau đó quét mã để WMS tự xác định SKU
                </p>
              </div>
            </div>

            <WmsField label="Tên phiếu" required>
              <WmsInput
                value={name}
                placeholder="VD: Nhập lô hàng sáng"
                onChange={(event) => setName(event.target.value)}
              />
            </WmsField>

            <div className="rounded-[var(--wms-radius-card)] border border-[var(--wms-divider)] bg-[var(--wms-surface-subtle)] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--wms-text-muted)]">
                Kho nhận
              </p>
              <p className="mt-1 truncate text-[13px] font-semibold text-[var(--wms-text-strong)]">
                {selectedWarehouse?.name || "Đang lấy kho mặc định..."}
              </p>
            </div>
          </WmsCard>

          <WmsNotice
            tone="warning"
            title="Chưa tăng tồn ở bước quét"
            description="Scan chỉ lưu danh sách mã tạm. Khi bấm Ghi nhận nhập, app tạo phiếu WMS, ghi scan evidence và chuyển sang chờ duyệt."
          />

          {error && (
            <WmsNotice
              tone="danger"
              title="Chưa thể tạo phiếu"
              description={error}
            />
          )}

          <AppButton
            fullWidth
            type="submit"
            icon="scan"
            loading={isSubmitting}
            disabled={Boolean(formError) || isLoadingOptions}
          >
            TIẾP TỤC QUÉT
          </AppButton>
        </form>
      </div>
    </main>
  );
}
