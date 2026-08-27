import { getErrorMessage } from "@/constants/error-messages";
import { Icon } from "@/components/ui/Icon";

export default function ErrorState({
  errorCode,
  description,
}: {
  errorCode?: string;
  description?: string;
}) {
  return (
    <div className="wms-error-state p-4">
      <div className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-[var(--wms-danger-text)]">
        <Icon name="alert-triangle" size={18} />
        <span>Không thể tiếp tục</span>
      </div>
      <p className="text-sm leading-6 text-[var(--wms-danger-text)]">
        {getErrorMessage(errorCode, description)}
      </p>
      {errorCode && (
        <p className="mt-2 text-xs text-[var(--wms-danger-text)] opacity-75">
          Mã lỗi: {errorCode}
        </p>
      )}
    </div>
  );
}
