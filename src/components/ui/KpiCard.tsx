import { Icon, type IconName } from "@/components/ui/Icon";

export function KpiCard({
  icon,
  label,
  value,
  tone = "blue",
  helper,
}: {
  icon: IconName;
  label: string;
  value: number;
  tone?: "blue" | "emerald" | "amber";
  helper?: string;
}) {
  const toneName =
    tone === "blue" ? "primary" : tone === "emerald" ? "success" : "warning";

  return (
    <section className={`wms-kpi wms-kpi--${toneName} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium text-[var(--wms-text-muted)]">
            {label}
          </p>
          <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.04em] text-[var(--wms-text-strong)]">
            {value}
          </p>
          {helper && (
            <p className="mt-2 text-[11px] font-medium text-[var(--wms-text-muted)]">
              {helper}
            </p>
          )}
        </div>
        <span className="wms-kpi-icon shrink-0">
          <Icon name={icon} size={18} strokeWidth={2.2} />
        </span>
      </div>
    </section>
  );
}
