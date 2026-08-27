import { Icon, type IconName } from "@/components/ui/Icon";

export default function EmptyState({
  title,
  description,
  icon = "package",
}: {
  title: string;
  description?: string;
  icon?: IconName;
}) {
  return (
    <div className="wms-empty p-5 text-center">
      <div className="wms-empty-icon mx-auto mb-3 h-11 w-11 bg-[var(--wms-primary-soft)] text-[var(--wms-primary)]">
        <Icon name={icon} size={24} />
      </div>
      <p className="text-[15px] font-semibold text-[var(--wms-text-strong)]">
        {title}
      </p>
      {description && (
        <p className="mt-1 text-[12px] font-normal leading-5 text-[var(--wms-text-muted)]">
          {description}
        </p>
      )}
    </div>
  );
}
