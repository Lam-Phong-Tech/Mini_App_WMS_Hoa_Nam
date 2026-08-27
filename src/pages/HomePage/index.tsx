import { useEffect } from "react";
import { Link } from "react-router-dom";
import { scheduleHomeRoutePrefetch } from "@/app/route-modules";
import EmptyState from "@/components/EmptyState";
import ScanModeSelector from "@/components/ScanModeSelector";
import { AppButton } from "@/components/ui/Button";
import { ActionCard } from "@/components/ui/ActionCard";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageContainer, SectionHeader } from "@/components/ui/Page";
import { WmsCard, WmsNotice } from "@/components/ui/WmsRuntime";
import AuthStatePage from "@/pages/AuthStatePage";
import { useZaloAuth } from "@/hooks/use-zalo-auth";
import { useWarehouseDashboard } from "@/hooks/useWarehouseDashboard";
import { getWmsLinkContext } from "@/services/wms-link-context";

export default function HomePage() {
  const {
    staff,
    isLoading: isAuthLoading,
    isAuthorized,
    error: authError,
  } = useZaloAuth();
  const {
    dashboard,
    approvedProducts,
    isLoading,
    error,
    lastUpdatedAt,
    refresh,
  } = useWarehouseDashboard(staff?.zalo_user_id, Boolean(staff));
  const wmsContext = getWmsLinkContext();
  const isLinkedToInbound = Boolean(wmsContext.documentId);

  useEffect(() => {
    if (!staff || !dashboard) return;

    return scheduleHomeRoutePrefetch();
  }, [dashboard, staff]);

  if (isAuthLoading && !staff) return <AuthStatePage mode="loading" />;
  if (!staff) return <AuthStatePage mode={authError ? "failed" : "login"} />;

  const staffName = dashboard?.warehouse_staff.name || staff.name;
  const staffRole = dashboard?.warehouse_staff.role || staff.role;
  return (
    <PageContainer className="space-y-6">
      <header className="min-w-0 pt-0.5">
        <p className="text-[12px] font-medium text-[var(--wms-text-muted)]">
          Ca làm việc hiện tại
        </p>
        <h1 className="mt-1 truncate text-[22px] font-semibold tracking-[-0.03em] text-[var(--wms-text-strong)]">
          Chào {compactName(staffName)}
        </h1>
      </header>

      <section className="flex min-h-11 items-center justify-between gap-2 rounded-[var(--wms-radius-control)] border border-[var(--wms-divider)] bg-[var(--wms-surface)] px-3 text-[11px] shadow-[var(--wms-shadow-card)]">
        <span className="truncate font-medium text-[var(--wms-text)]">
          {isLinkedToInbound
            ? `Phiếu nhập ${wmsContext.documentId}`
            : `Theo phiên WMS · ${staffRole}`}
        </span>
        <span className="shrink-0 rounded-full bg-[var(--wms-primary-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--wms-primary-strong)]">
          {isAuthorized || staff.zalo_user_id ? "Đã xác thực ✓" : "Đã đồng bộ"}
        </span>
      </section>

      {isLoading && !dashboard ? (
        <DashboardSkeleton />
      ) : (
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-[var(--wms-text-strong)]">
              Cần xử lý
            </h2>
            <button
              className="min-h-11 px-1 text-[12px] font-medium text-[var(--wms-primary)]"
              type="button"
              onClick={() => refresh(true)}
            >
              {lastUpdatedAt
                ? `Cập nhật ${new Date(lastUpdatedAt).toLocaleTimeString(
                    "vi-VN",
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  )}`
                : "Làm mới"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard
              icon="clock"
              label="Chờ duyệt"
              value={dashboard?.pending_approval_count ?? 0}
              tone="amber"
              helper="Cần xử lý"
            />
            <KpiCard
              icon="check-circle"
              label="Đã duyệt hôm nay"
              value={dashboard?.approved_count ?? 0}
              tone="emerald"
              helper="Hoàn tất"
            />
          </div>
        </section>
      )}

      <section>
        <SectionHeader
          title="Tác vụ kho"
          action={
            <span className="text-[12px] font-medium text-[var(--wms-text-muted)]">
              Chọn nghiệp vụ để quét
            </span>
          }
        />
        <ScanModeSelector />
      </section>

      <section>
        <ActionCard
          full
          emphasized
          badge={`${dashboard?.pending_approval_count ?? 0}`}
          to="/approvals"
          icon="list-check"
          title="Duyệt phiếu"
          description="Kiểm tra phiếu đã ghi nhận, phê duyệt/Post theo đúng quyền nhân viên."
        />
      </section>

      {isLoading && dashboard && (
        <p
          aria-live="polite"
          className="text-center text-[12px] font-medium text-[var(--wms-text-muted)]"
        >
          Đang đồng bộ số liệu mới…
        </p>
      )}

      {error && (
        <section className="space-y-3">
          <WmsNotice
            tone="danger"
            title="Không tải được dashboard"
            description={error}
          />
          <AppButton
            className="w-full"
            variant="secondary"
            icon="database"
            onClick={() => refresh(true)}
          >
            Tải lại
          </AppButton>
        </section>
      )}

      <section>
        <SectionHeader
          title="Sản phẩm đã duyệt"
          action={
            <Link
              className="inline-flex min-h-11 items-center text-[12px] font-semibold text-[var(--wms-primary)]"
              to="/history"
            >
              Xem tất cả
            </Link>
          }
        />

        {approvedProducts.length === 0 ? (
          <WmsCard className="py-7">
            <EmptyState
              icon="list-check"
              title="Chưa có sản phẩm mới"
              description="Kéo để làm mới hoặc bắt đầu quét mã."
            />
          </WmsCard>
        ) : (
          <div className="space-y-2">
            {approvedProducts.slice(0, 4).map((product, index) => (
              <WmsCard
                key={product.id || `${product.code}-${index}`}
                className="p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-[15px] font-semibold text-[var(--wms-text-strong)]">
                      {product.product_name || product.code}
                    </p>
                    <p className="mt-1 line-clamp-1 text-[12px] font-normal text-[var(--wms-text-muted)]">
                      {product.sku_code || "Chưa có SKU"} ·{" "}
                      {product.serial_no || "Chưa có serial"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[var(--wms-success-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--wms-success-text)]">
                    ✓ Thành công
                  </span>
                </div>
              </WmsCard>
            ))}
          </div>
        )}
      </section>
    </PageContainer>
  );
}

function DashboardSkeleton() {
  return (
    <section
      aria-label="Đang tải chỉ số kho"
      className="space-y-3"
      role="status"
    >
      <div className="flex items-center justify-between">
        <div className="wms-skeleton h-5 w-24" />
        <div className="wms-skeleton h-4 w-16" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map((item) => (
          <div className="wms-card space-y-3 p-4" key={item}>
            <div className="flex items-start justify-between">
              <div className="wms-skeleton h-4 w-16" />
              <div className="wms-skeleton h-9 w-9" />
            </div>
            <div className="wms-skeleton h-7 w-11" />
            <div className="wms-skeleton h-3 w-20" />
          </div>
        ))}
      </div>
    </section>
  );
}

function compactName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 2 ? parts.slice(-2).join(" ") : name;
}
