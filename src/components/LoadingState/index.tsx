export default function LoadingState({
  label = "Đang tải...",
}: {
  label?: string;
}) {
  return (
    <div
      className="wms-loading flex items-center justify-center gap-3 p-4 text-[var(--wms-text)]"
      role="status"
    >
      <span aria-hidden="true" className="wms-loading-spinner" />
      <span className="text-[15px] font-medium">{label}</span>
    </div>
  );
}
