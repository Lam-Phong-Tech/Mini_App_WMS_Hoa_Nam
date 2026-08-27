import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/LoadingState";
import { AppButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageContainer, SectionHeader } from "@/components/ui/Page";
import { WmsCard, WmsNotice, WmsPageHeader } from "@/components/ui/WmsRuntime";
import {
  getWarrantyCases,
  getWarrantyErrorMessage,
  type WarrantyCaseStatus,
  type WarrantyCaseSummary,
} from "@/services/warranty-flow.service";

const warrantyStatusTabs: Array<{
  value: WarrantyCaseStatus;
  label: string;
}> = [
  { value: "RECEIVED", label: "Tiếp nhận" },
  { value: "CHECKING", label: "Kiểm tra" },
  { value: "REPAIRING", label: "Sửa chữa" },
  { value: "COMPLETED", label: "Hoàn tất" },
  { value: "RETURNED", label: "Đã trả" },
  { value: "CANCELLED", label: "Đã hủy" },
];

const WARRANTY_CASE_CACHE_TTL_MS = 30_000;
const warrantyCaseCache = new Map<
  string,
  { cases: WarrantyCaseSummary[]; loadedAt: number }
>();
const warrantyCasesInFlight = new Map<
  string,
  Promise<WarrantyCaseSummary[]>
>();

export default function WarrantyPage() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<WarrantyCaseSummary[]>([]);
  const [activeStatus, setActiveStatus] =
    useState<WarrantyCaseStatus>("RECEIVED");
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string>();
  const activeLoadIdRef = useRef(0);

  const loadCases = useCallback(async () => {
    const status = String(activeStatus);
    const loadId = activeLoadIdRef.current + 1;
    activeLoadIdRef.current = loadId;
    const cached = getCachedWarrantyCases(status);

    setError(undefined);
    if (cached) {
      setCases(cached);
      setIsInitialLoading(false);
      setIsRefreshing(true);
    } else {
      setCases([]);
      setIsInitialLoading(true);
      setIsRefreshing(false);
    }

    try {
      const nextCases = await loadWarrantyCases(status);
      if (activeLoadIdRef.current !== loadId) return;
      setCases(nextCases);
    } catch (requestError) {
      if (activeLoadIdRef.current !== loadId) return;
      setError(getWarrantyErrorMessage(requestError));
      if (!cached) setCases([]);
    } finally {
      if (activeLoadIdRef.current === loadId) {
        setIsInitialLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [activeStatus]);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  return (
    <PageContainer className="space-y-4">
      <WmsPageHeader
        eyebrow="Mini App · Bảo hành"
        title="Tiếp nhận bảo hành"
        onBack={() => navigate("/")}
      />

      <section className="grid grid-cols-2 gap-3">
        <KpiCard
          icon="shield-check"
          label={warrantyStatusLabel(activeStatus)}
          value={cases.length}
          tone="emerald"
        />
        <KpiCard
          icon="scan"
          label="Luồng tiếp nhận"
          value={2}
          helper="Có mã · mất mã"
          tone="blue"
        />
      </section>

      <WmsCard className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
            <Icon name="shield-check" size={21} strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[17px] font-black tracking-[-0.04em] text-[#06142A]">
              Nhận sản phẩm bảo hành
            </h2>
            <p className="mt-1 text-[12px] font-medium leading-5 text-[#69758A]">
              Quét/nhập mã để kiểm tra trước. Nếu mất tem/mã, tạo hồ sơ tạm.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <AppButton
            fullWidth
            icon="scan"
            onClick={() => navigate("/scanner/WARRANTY_ITEM")}
          >
            Quét mã
          </AppButton>
          <AppButton
            fullWidth
            variant="secondary"
            icon="keyboard"
            onClick={() => navigate("/warranty/receive")}
          >
            Nhập tay
          </AppButton>
        </div>

        <AppButton
          fullWidth
          variant="secondary"
          icon="shield-check"
          onClick={() => navigate("/warranty/receive?tempOnly=1")}
        >
          Mất tem/mã · Tạo hồ sơ tạm
        </AppButton>
      </WmsCard>

      {error && (
        <WmsNotice
          tone="danger"
          title="Không tải được danh sách bảo hành"
          description={error}
        />
      )}

      <section>
        <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {warrantyStatusTabs.map((tab) => (
            <button
              className={`wms-status min-h-9 shrink-0 px-3 transition ${
                activeStatus === tab.value
                  ? "wms-status--pending-approval shadow-none"
                  : "border border-[var(--wms-divider)] bg-white text-[var(--wms-text-muted)]"
              }`}
              key={tab.value}
              type="button"
              onClick={() => setActiveStatus(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <SectionHeader
          title={`Hồ sơ ${
            warrantyStatusTabs.find((tab) => tab.value === activeStatus)
              ?.label || activeStatus
          }`}
          action={
            <button
              className="wms-status wms-status--pending-approval min-h-9 px-3"
              type="button"
              onClick={() => void loadCases()}
            >
              Đồng bộ
            </button>
          }
        />

        {isInitialLoading && (
          <LoadingState label="Đang tải hồ sơ bảo hành..." />
        )}

        {isRefreshing && cases.length > 0 && (
          <p aria-live="polite" className="px-1 text-[12px] font-medium text-[var(--wms-text-muted)]">
            Đang đồng bộ hồ sơ mới…
          </p>
        )}

        {!isInitialLoading && cases.length === 0 ? (
          <WmsCard className="py-7">
            <EmptyState
              icon="shield-check"
              title={`Chưa có hồ sơ ${warrantyStatusLabel(activeStatus)}`}
              description="Chọn trạng thái khác hoặc đồng bộ lại danh sách."
            />
          </WmsCard>
        ) : (
          <div className="space-y-3">
            {cases.map((item) => (
              <button
                className="wms-action-card w-full p-4 text-left"
                key={item.id}
                type="button"
                onClick={() =>
                  navigate(`/warranty/${encodeURIComponent(item.id)}`)
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#69758A]">
                      {item.case_no || item.id}
                    </p>
                    <h3 className="mt-1 break-words text-[16px] font-black tracking-[-0.04em] text-[#06142A]">
                      {item.product_name ||
                        item.item_code ||
                        "Sản phẩm bảo hành"}
                    </h3>
                    <p className="mt-1 line-clamp-1 text-[12px] font-semibold text-[#69758A]">
                      {item.customer_name || "Khách hàng"} ·{" "}
                      {item.customer_phone || "Chưa có SĐT"}
                    </p>
                  </div>
                  <span className="wms-status wms-status--success shrink-0 px-3 py-1.5">
                    {warrantyStatusLabel(item.status)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </PageContainer>
  );
}

function warrantyStatusLabel(status?: string) {
  const normalized = String(status || "RECEIVED").toUpperCase();
  const labels: Record<string, string> = {
    RECEIVED: "Đã tiếp nhận",
    CHECKING: "Đang kiểm tra",
    REPAIRING: "Đang sửa",
    COMPLETED: "Hoàn tất",
    RETURNED: "Đã trả khách",
    CANCELLED: "Đã hủy",
  };

  return labels[normalized] || status || "Đã tiếp nhận";
}

function getCachedWarrantyCases(status: string) {
  const cached = warrantyCaseCache.get(status);

  if (!cached || Date.now() - cached.loadedAt > WARRANTY_CASE_CACHE_TTL_MS) {
    return undefined;
  }

  return cached.cases;
}

function loadWarrantyCases(status: string) {
  const inFlight = warrantyCasesInFlight.get(status);
  if (inFlight) return inFlight;

  const request = getWarrantyCases(status)
    .then((response) => {
      warrantyCaseCache.set(status, {
        cases: response.cases,
        loadedAt: Date.now(),
      });
      return response.cases;
    })
    .finally(() => {
      warrantyCasesInFlight.delete(status);
    });

  warrantyCasesInFlight.set(status, request);
  return request;
}
