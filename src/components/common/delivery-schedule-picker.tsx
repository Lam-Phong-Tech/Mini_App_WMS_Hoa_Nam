import { useMemo } from "react";
import { cn } from "@/utils/cn";

const TIME_SLOTS = [
  "08:00 - 10:00",
  "10:00 - 12:00",
  "12:00 - 14:00",
  "14:00 - 16:00",
  "16:00 - 18:00",
  "18:00 - 20:00",
];

interface DateOption {
  value: string;
  label: string;
  weekday: string;
}

function buildDateOptions(days: number): DateOption[] {
  const formatter = new Intl.DateTimeFormat("vi-VN", { weekday: "short" });
  return Array.from({ length: days }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const value = date.toISOString().slice(0, 10);
    const label = i === 0 ? "Hôm nay" : i === 1 ? "Ngày mai" : `${date.getDate()}/${date.getMonth() + 1}`;
    return { value, label, weekday: formatter.format(date) };
  });
}

interface DeliverySchedulePickerProps {
  dateLabel: string;
  timeSlotLabel: string;
  selectedDate: string;
  selectedTimeSlot: string;
  onDateChange: (date: string) => void;
  onTimeSlotChange: (slot: string) => void;
  daysAhead?: number;
  className?: string;
}

export default function DeliverySchedulePicker({
  dateLabel,
  timeSlotLabel,
  selectedDate,
  selectedTimeSlot,
  onDateChange,
  onTimeSlotChange,
  daysAhead = 5,
  className,
}: DeliverySchedulePickerProps) {
  const dateOptions = useMemo(() => buildDateOptions(daysAhead), [daysAhead]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-2">
        <div className="text-small-m text-text-primary">{dateLabel}</div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {dateOptions.map((option) => {
            const isSelected = option.value === selectedDate;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onDateChange(option.value)}
                className={cn(
                  "flex flex-shrink-0 flex-col items-center gap-0.5 rounded-lg border px-3 py-1.5",
                  isSelected
                    ? "border-primary bg-primary text-white"
                    : "border-border-primary bg-white text-text-secondary",
                )}
              >
                <span className="text-xsmall">{option.label}</span>
                <span
                  className={cn(
                    "text-xxxsmall",
                    isSelected ? "text-white/80" : "text-text-disabled",
                  )}
                >
                  {option.weekday}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-small-m text-text-primary">{timeSlotLabel}</div>
        <div className="grid grid-cols-3 gap-2">
          {TIME_SLOTS.map((slot) => {
            const isSelected = slot === selectedTimeSlot;
            return (
              <button
                key={slot}
                type="button"
                onClick={() => onTimeSlotChange(slot)}
                className={cn(
                  "rounded-lg border px-2 py-2 text-xsmall",
                  isSelected
                    ? "border-primary bg-primary text-white"
                    : "border-border-primary bg-white text-text-secondary",
                )}
              >
                {slot}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
