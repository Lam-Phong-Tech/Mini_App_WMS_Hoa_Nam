import { FormEvent, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import QuantityInput from "@/components/QuantityInput";
import { AppButton } from "@/components/ui/Button";
import { PageContainer } from "@/components/ui/Page";
import {
  WmsCard,
  WmsField,
  WmsInput,
  WmsNotice,
  WmsPageHeader,
  WmsTextArea,
} from "@/components/ui/WmsRuntime";
import { SCAN_CONTEXT_CONFIG } from "@/constants/scan.constants";
import { useScanRequest } from "@/hooks/useScanRequest";
import type { ScanContext } from "@/types/scan.types";
import { normalizeScanCode } from "@/utils/normalizeScanCode";

const validContexts = Object.keys(SCAN_CONTEXT_CONFIG) as ScanContext[];

export default function ManualCodePage() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const context = validContexts.includes(params.context as ScanContext)
    ? (params.context as ScanContext)
    : "RECEIPT";
  const config = SCAN_CONTEXT_CONFIG[context];
  const documentId = searchParams.get("documentId") || undefined;
  const [code, setCode] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const { submitCode } = useScanRequest();

  const normalizedCode = useMemo(() => normalizeScanCode(code), [code]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);

    if (!normalizedCode) {
      setError("Code bắt buộc, không được để trống.");
      return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError("Quantity phải là số nguyên dương.");
      return;
    }

    const result = await submitCode({
      code: normalizedCode,
      quantity: config.requiresQuantity ? quantity : 1,
      method: "MANUAL",
      context,
      documentId,
    });

    if (!result.accepted) {
      setError(result.reason);
      return;
    }

    if (result.id) {
      navigate(`/result/${result.id}`);
    }
  };

  return (
    <PageContainer className="space-y-4">
      <WmsPageHeader
        eyebrow={config.title}
        title="Nhập mã thủ công"
        onBack={() => navigate(-1)}
      />

      <form className="space-y-4" onSubmit={handleSubmit}>
        <WmsCard className="space-y-4">
          <WmsField label="Mã QR / Barcode" required>
            <WmsInput
              autoCapitalize="characters"
              autoComplete="off"
              value={code}
              placeholder="VD: VALID-001"
              onChange={(event) => setCode(event.target.value)}
            />
          </WmsField>
          {normalizedCode && (
            <p className="text-xs font-normal text-[var(--wms-text-muted)]">
              Mã chuẩn hóa: {normalizedCode}
            </p>
          )}

          {config.requiresQuantity && (
            <QuantityInput value={quantity} onChange={setQuantity} />
          )}

          <WmsField label="Ghi chú tùy chọn">
            <WmsTextArea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="min-h-24"
              placeholder="Ghi chú nội bộ trong phiên test..."
            />
            {note && (
              <p className="mt-1 text-xs font-normal text-[var(--wms-text-muted)]">
                Ghi chú đang chỉ dùng cho UI phase này.
              </p>
            )}
          </WmsField>

          {error && (
            <WmsNotice
              tone="danger"
              title="Không thể xử lý mã"
              description={error}
            />
          )}
        </WmsCard>

        <div className="wms-sticky-action grid grid-cols-2 gap-2">
          <AppButton
            fullWidth
            type="button"
            variant="secondary"
            onClick={() => navigate(`/scanner/${context}`)}
          >
            Hủy
          </AppButton>
          <AppButton fullWidth type="submit">
            Xác nhận
          </AppButton>
        </div>
      </form>
    </PageContainer>
  );
}
