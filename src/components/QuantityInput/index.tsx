import { AppButton } from "@/components/ui/Button";
import { WmsInput } from "@/components/ui/WmsRuntime";

interface QuantityInputProps {
  value: number;
  onChange: (value: number) => void;
}

export default function QuantityInput({ value, onChange }: QuantityInputProps) {
  const setSafeValue = (nextValue: number) => {
    onChange(Math.max(1, Math.floor(nextValue || 1)));
  };

  return (
    <div>
      <label className="wms-field-label mb-2 block text-[12px] font-semibold">
        Số lượng
      </label>
      <div className="flex items-center gap-2">
        <AppButton
          aria-label="Giảm số lượng"
          className="h-11 w-11 shrink-0 !px-0"
          variant="secondary"
          onClick={() => setSafeValue(value - 1)}
        >
          -
        </AppButton>
        <WmsInput
          type="number"
          min={1}
          value={String(value)}
          onChange={(event) => setSafeValue(Number(event.target.value))}
          className="min-w-0 text-center"
        />
        <AppButton
          aria-label="Tăng số lượng"
          className="h-11 w-11 shrink-0 !px-0"
          variant="secondary"
          onClick={() => setSafeValue(value + 1)}
        >
          +
        </AppButton>
      </div>
    </div>
  );
}
