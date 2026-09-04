import { useMemo } from "react";
import { WmsField, WmsSelect } from "@/components/ui/WmsRuntime";

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
  className = "",
}: DeliverySchedulePickerProps) {
  const dateOptions = useMemo(() => buildDateOptions(daysAhead), [daysAhead]);

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <WmsField label={dateLabel}>
        <WmsSelect
          value={selectedDate}
          onChange={(event) => onDateChange(event.target.value)}
        >
          {dateOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} · {option.weekday}
            </option>
          ))}
        </WmsSelect>
      </WmsField>

      <WmsField label={timeSlotLabel}>
        <WmsSelect
          value={selectedTimeSlot}
          onChange={(event) => onTimeSlotChange(event.target.value)}
        >
          <option value="">Chọn khung giờ</option>
          {TIME_SLOTS.map((slot) => (
            <option key={slot} value={slot}>
              {slot}
            </option>
          ))}
        </WmsSelect>
      </WmsField>
    </div>
  );
}
