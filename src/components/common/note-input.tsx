import { copy } from "@/constants/copy";
import { WmsField, WmsTextArea } from "@/components/ui/WmsRuntime";

interface NoteInputProps {
  value?: string;
  onChange?: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  label?: string;
  hideLabel?: boolean;
  className?: string;
}

export default function NoteInput({
  value,
  onChange,
  label,
  maxLength,
  hideLabel: _hideLabel,
  placeholder,
  className,
}: NoteInputProps) {
  const MAX = maxLength ?? 40;
  return (
    <WmsField className={`m-3 ${className ?? ""}`} label={label ?? copy.product.note}>
      <WmsTextArea
        value={value}
        onChange={(e) => onChange?.(e.target.value.slice(0, MAX))}
        maxLength={MAX}
        placeholder={placeholder ?? copy.product.notePlaceholder}
        className="min-h-24"
      />
    </WmsField>
  );
}
