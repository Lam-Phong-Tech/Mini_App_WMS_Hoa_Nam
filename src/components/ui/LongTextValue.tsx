import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

function compactText(value?: string | number | null, maxLength = 42) {
  if (value === undefined || value === null || value === "") return "—";
  const text = String(value).replace(/\s+/g, " ").trim();
  const chars = Array.from(text);
  if (chars.length <= maxLength) return text;
  const head = Math.max(14, Math.floor(maxLength * 0.58));
  const tail = Math.max(8, maxLength - head - 3);
  return `${chars.slice(0, head).join("")}...${chars.slice(-tail).join("")}`;
}

export function LongTextValue({
  value,
  maxLength = 42,
  align = "right",
}: {
  value?: string | number | null;
  maxLength?: number;
  align?: "left" | "right";
}) {
  const fullValue = value === undefined || value === null ? "" : String(value);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!fullValue) return;
    try {
      await navigator.clipboard?.writeText(fullValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <span
      className={`inline-flex w-full min-w-0 max-w-full items-center gap-1.5 ${
        align === "right" ? "justify-end text-right" : "justify-start text-left"
      }`}
    >
      <button
        className={`block min-w-0 max-w-full text-inherit ${
          expanded ? "whitespace-normal break-all" : "truncate"
        }`}
        onClick={() => fullValue && setExpanded((value) => !value)}
        title={fullValue}
        type="button"
      >
        {expanded ? fullValue || "—" : compactText(value, maxLength)}
      </button>
      {fullValue && (
        <button
          aria-label={copied ? "Đã sao chép" : "Sao chép"}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--wms-radius-control)] text-[var(--wms-text-muted)] active:bg-[var(--wms-primary-soft)]"
          onClick={copy}
          type="button"
        >
          <Icon name={copied ? "check-circle" : "copy"} size={15} />
        </button>
      )}
    </span>
  );
}
