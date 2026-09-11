import { UiIcon } from "@/components/ui-icon";

export type AvailabilityFilterValue = "ALL" | "IN_STOCK" | "PREORDER";

interface AvailabilityFilterProps {
  value: AvailabilityFilterValue;
  onChange: (value: AvailabilityFilterValue) => void;
}

const OPTIONS: Array<{ value: AvailabilityFilterValue; label: string; icon: "checkCircle" | "clock" }> = [
  { value: "ALL", label: "Tất cả", icon: "checkCircle" },
  { value: "IN_STOCK", label: "Sẵn hàng", icon: "checkCircle" },
  { value: "PREORDER", label: "Đặt trước", icon: "clock" },
];

/**
 * Availability is intentionally a client-side presentation filter. The public
 * product API does not advertise an availability query parameter, so keeping
 * this state outside ProductQuery avoids sending unsupported filters upstream.
 */
export const AvailabilityFilter = ({ value, onChange }: AvailabilityFilterProps) => (
  <section className="availability-filter" aria-label="Trạng thái hàng">
    <span className="availability-filter__label">Trạng thái hàng</span>
    <div className="availability-filter__options">
      {OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={active ? "is-active" : ""}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
          >
            {option.value === "ALL" ? null : <UiIcon name={option.icon} size={16} />}
            {option.label}
          </button>
        );
      })}
    </div>
  </section>
);
