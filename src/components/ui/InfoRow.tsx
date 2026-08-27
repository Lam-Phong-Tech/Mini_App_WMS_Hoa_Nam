import { LongTextValue } from "@/components/ui/LongTextValue";

export function InfoRow({
  label,
  value,
  copyable = false,
}: {
  label: string;
  value?: string | number | null;
  copyable?: boolean;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[92px_minmax(0,1fr)] gap-3 py-2.5">
      <span className="min-w-0 text-[12px] font-medium text-[var(--wms-text-muted)]">
        {label}
      </span>
      <span className="min-w-0 text-right text-[12px] font-semibold text-[var(--wms-text-strong)]">
        {copyable ? (
          <LongTextValue value={value} />
        ) : (
          <span className="line-clamp-2 break-all">{value || "—"}</span>
        )}
      </span>
    </div>
  );
}
