import { forwardRef, useState } from "react";
import { CloseIcon, SearchIcon } from "@/components/common/vectors";
import { WmsField, WmsInput } from "@/components/ui/WmsRuntime";

type SearchBarProps = React.InputHTMLAttributes<HTMLInputElement> & {
  clearable?: boolean;
  label?: string;
};

const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  (
    {
      clearable = false,
      label = "Tìm kiếm",
      value,
      onChange,
      className,
      placeholder,
      ...props
    },
    ref,
  ) => {
    const isControlled = value !== undefined;
    const [innerValue, setInnerValue] = useState("");

    const currentValue = isControlled ? value : innerValue;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!isControlled) setInnerValue(e.target.value);
      onChange?.(e);
    };

    const handleClear = () => {
      if (!isControlled) setInnerValue("");

      onChange?.({
        target: { value: "" },
      } as React.ChangeEvent<HTMLInputElement>);
    };

    return (
      <WmsField label={label}>
        <span className="relative block w-full">
          <WmsInput
            ref={ref}
            value={currentValue}
            onChange={handleChange}
            className={`wms-field-control--with-leading ${
              clearable ? "wms-field-control--with-trailing" : ""
            } ${className ?? ""}`}
            placeholder={placeholder ?? "Nhập từ khóa"}
            {...props}
          />

          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-icon-tertiary" />

          {clearable && currentValue && (
            <button
              aria-label="Xóa từ khóa"
              type="button"
              onClick={handleClear}
              className="absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-[var(--wms-text-muted)] transition-colors hover:text-[var(--wms-primary)]"
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--wms-primary)] text-white">
                <CloseIcon color="white" size={10} strokeWidth={3} />
              </span>
            </button>
          )}
        </span>
      </WmsField>
    );
  },
);

export default SearchBar;
