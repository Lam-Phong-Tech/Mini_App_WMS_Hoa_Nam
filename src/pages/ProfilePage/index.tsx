import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import LoadingState from "@/components/LoadingState";
import { AppButton } from "@/components/ui/Button";
import { InfoRow } from "@/components/ui/InfoRow";
import { PageContainer } from "@/components/ui/Page";
import { WmsCard, WmsNotice, WmsPageHeader } from "@/components/ui/WmsRuntime";
import { RUNTIME_MANIFEST } from "@/constants/runtime";
import { useZaloAuth } from "@/hooks/use-zalo-auth";
import { getMiniSessionStartedAt } from "@/services/auth-session.service";
import { getStoredWarehouseStaff } from "@/services/zalo-auth.service";
import { getClientDeviceInfo } from "@/utils/device-info";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { staff, isLoading, isAuthorized, error } = useZaloAuth();
  const localStaff = getStoredWarehouseStaff();
  const currentStaff = staff || localStaff;
  const displayName = currentStaff?.name || "Chưa đăng nhập";
  const avatarUrl = currentStaff?.avatar_url;
  const role = currentStaff?.role || "Warehouse Operator";
  const device = getClientDeviceInfo();
  const sessionStartedAt = getMiniSessionStartedAt();

  if (isLoading && !currentStaff) {
    return (
      <PageContainer>
        <LoadingState label="Đang kiểm tra phiên WMS..." />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-3">
      <WmsPageHeader
        eyebrow="Tài khoản & bảo mật"
        title="Cá nhân"
        onBack={() => navigate(-1)}
      />

      <WmsCard>
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="h-14 w-14 rounded-2xl object-cover ring-1 ring-[#D6E0EC]"
            />
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded-[var(--wms-radius-card)] bg-[var(--wms-primary)] text-sm font-semibold text-white">
              {initials(displayName)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[18px] font-black tracking-[-0.04em] text-[#06142A]">
              {displayName}
            </h1>
            <p className="mt-1 text-[12px] font-medium text-[#69758A]">
              {role} ·{" "}
              {isAuthorized || currentStaff ? "Đã đăng nhập" : "Chưa đăng nhập"}
            </p>
          </div>
          <span className="wms-status wms-status--success px-3 py-1.5">
            ✓ Hoạt động
          </span>
        </div>
      </WmsCard>

      {error && (
        <WmsNotice
          tone="danger"
          title="Không kiểm tra được phiên"
          description={error}
        />
      )}

      <ProfileSection title="Tài khoản">
        <InfoRow label="Tên đăng nhập" value={currentStaff?.name} />
        <InfoRow label="Vai trò" value={role} />
        <InfoRow label="Ngữ cảnh" value="Theo phân quyền tài khoản" />
      </ProfileSection>

      <ProfileSection title="Kết nối WMS">
        <InfoRow label="Tài khoản" value={currentStaff?.name} />
        <InfoRow
          label="Trạng thái"
          value={
            isAuthorized || currentStaff ? "Đã xác thực" : "Chưa đăng nhập"
          }
        />
      </ProfileSection>

      <ProfileSection title="Phiên & bảo mật">
        <InfoRow
          label="Thiết bị"
          value={
            device.detailLabel
              ? `${device.deviceLabel} · ${device.detailLabel}`
              : device.deviceLabel
          }
        />
        <InfoRow
          label="Bắt đầu phiên"
          value={
            sessionStartedAt
              ? formatSessionStartedAt(sessionStartedAt)
              : "Chưa xác định"
          }
        />
        <InfoRow label="Environment" value={RUNTIME_MANIFEST.env} />
        <InfoRow label="Version" value={RUNTIME_MANIFEST.version} />
      </ProfileSection>

      <WmsCard>
        <AppButton
          fullWidth
          icon="log-out"
          variant="danger"
          onClick={() => navigate("/auth/logout-confirm")}
        >
          Đăng xuất
        </AppButton>
      </WmsCard>

      {import.meta.env.DEV && (
        <button
          className="mx-auto block min-h-11 px-4 text-[12px] font-semibold text-[var(--wms-primary-strong)]"
          type="button"
          onClick={() => navigate("/auth")}
        >
          Xem auth screens
        </button>
      )}
    </PageContainer>
  );
}

function ProfileSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <WmsCard>
      <h2 className="mb-2 border-b border-[#E6ECF3] pb-2 text-[12px] font-black uppercase tracking-[0.14em] text-[#7B8798]">
        {title}
      </h2>
      <div className="divide-y divide-[#E6ECF3]">{children}</div>
    </WmsCard>
  );
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatSessionStartedAt(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Chưa xác định";

  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
