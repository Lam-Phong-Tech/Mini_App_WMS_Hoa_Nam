import { Icon, type IconName } from "@/components/ui/Icon";
import type { ScanApprovalStatus, ScanStatus } from "@/types/scan.types";

type BadgeStatus = ScanStatus | ScanApprovalStatus;

const metaByStatus: Record<
  BadgeStatus,
  { label: string; tone: string; icon: IconName }
> = {
  PENDING: {
    label: "Đang kiểm tra",
    tone: "pending",
    icon: "clock",
  },
  SUCCESS: {
    label: "Đã ghi nhận",
    tone: "success",
    icon: "check-circle",
  },
  ERROR: {
    label: "Thất bại",
    tone: "error",
    icon: "x-circle",
  },
  PENDING_APPROVAL: {
    label: "Chờ duyệt",
    tone: "pending-approval",
    icon: "clock",
  },
  APPROVED: {
    label: "Đã duyệt",
    tone: "approved",
    icon: "check-circle",
  },
};

export default function StatusBadge({ status }: { status: BadgeStatus }) {
  const meta = metaByStatus[status];

  return (
    <span className={`wms-status wms-status--${meta.tone}`}>
      <Icon name={meta.icon} size={13} />
      {meta.label}
    </span>
  );
}
