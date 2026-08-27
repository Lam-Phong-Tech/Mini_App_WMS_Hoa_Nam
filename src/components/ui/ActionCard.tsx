import { Link } from "react-router-dom";
import { Icon, type IconName } from "@/components/ui/Icon";

export function ActionCard({
  to,
  icon,
  title,
  description,
  full = false,
  badge,
  emphasized = false,
}: {
  to: string;
  icon: IconName;
  title: string;
  description: string;
  full?: boolean;
  badge?: string;
  emphasized?: boolean;
}) {
  if (emphasized) {
    const badgeLabel = badge ? `${badge} phiếu` : undefined;

    return (
      <Link
        className={`wms-action-card group overflow-hidden p-4 ${
          full ? "col-span-2" : ""
        }`}
        to={to}
      >
        <div className="flex items-center gap-3">
          <span className="wms-action-icon shrink-0">
            <Icon name={icon} size={20} strokeWidth={2.6} />
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="block text-[15px] font-semibold text-[var(--wms-text-strong)]">
                {title}
              </span>
              {badgeLabel && (
                <span className="shrink-0 rounded-full bg-[var(--wms-success-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--wms-success-text)]">
                  {badgeLabel}
                </span>
              )}
            </span>
            <span className="mt-0.5 line-clamp-2 block text-[12px] font-medium leading-5 text-[var(--wms-text-muted)]">
              {description}
            </span>
          </span>

          <span className="wms-action-arrow shrink-0">
            <Icon name="chevron-right" size={18} strokeWidth={2.8} />
          </span>
        </div>
      </Link>
    );
  }

  return (
    <Link
      className={`wms-action-card group overflow-hidden p-3 ${
        full ? "col-span-2" : ""
      }`}
      to={to}
    >
      <div className="flex items-center gap-2.5">
        <span className="wms-action-icon h-9 w-9 shrink-0">
          <Icon name={icon} size={19} strokeWidth={2.5} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="block text-[13px] font-semibold">{title}</span>
            {badge && (
              <span className="rounded-full bg-[var(--wms-success-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--wms-success-text)]">
                {badge}
              </span>
            )}
          </span>
          <span className="mt-0.5 line-clamp-2 block text-[11px] font-medium leading-4 text-[var(--wms-text-muted)]">
            {description}
          </span>
        </span>
        {(full || emphasized) && (
          <Icon
            className="mt-2 shrink-0 text-[var(--wms-text-muted)]"
            name="chevron-right"
            size={18}
          />
        )}
      </div>
    </Link>
  );
}
