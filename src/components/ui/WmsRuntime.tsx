import { forwardRef } from "react";
import type {
  ComponentPropsWithoutRef,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

export function WmsBrand() {
  return (
    <div className="flex items-center gap-3">
      <div className="wms-brand-mark shrink-0 text-[16px] font-semibold">
        HN
      </div>
      <div className="min-w-0">
        <h1 className="wms-brand-title truncate text-[17px] font-semibold tracking-[-0.02em]">
          WMS HOA NAM
        </h1>
        <p className="mt-0.5 text-[11px] font-medium text-[var(--wms-text-muted)]">
          Quản lý vận hành kho
        </p>
      </div>
    </div>
  );
}

export function WmsPageHeader({
  eyebrow,
  title,
  onBack,
  action,
  dark = false,
}: {
  eyebrow?: string;
  title: string;
  onBack?: () => void;
  action?: ReactNode;
  dark?: boolean;
}) {
  return (
    <header className="flex items-center gap-3">
      {onBack && (
        <button
          aria-label="Quay lại"
          className={`wms-page-back shrink-0 text-sm font-semibold ${
            dark ? "wms-glass-control text-white" : ""
          }`}
          onClick={onBack}
          type="button"
        >
          <Icon name="chevron-left" size={20} strokeWidth={3} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p
            className={`wms-page-header__eyebrow text-[11px] font-medium ${
              dark ? "text-white/72" : ""
            }`}
          >
            {eyebrow}
          </p>
        )}
        <h1
          className={`wms-page-header__title truncate text-[23px] font-semibold tracking-[-0.03em] ${
            dark ? "text-white" : ""
          }`}
        >
          {title}
        </h1>
      </div>
      {action}
    </header>
  );
}

export function WmsCard({
  children,
  className = "",
  ...props
}: {
  children: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<"section">, "children" | "className">) {
  return (
    <section {...props} className={`wms-card p-4 ${className}`}>
      {children}
    </section>
  );
}

export function WmsNotice({
  tone = "info",
  title,
  description,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title: string;
  description?: string;
}) {
  const icon: IconName =
    tone === "success"
      ? "check-circle"
      : tone === "danger"
        ? "alert-triangle"
        : tone === "warning"
          ? "clock"
          : "shield-check";

  return (
    <section className={`wms-notice wms-notice--${tone} p-3`}>
      <div className="flex items-start gap-3">
        <span className="wms-notice-icon shrink-0">
          <Icon name={icon} size={18} strokeWidth={2.6} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          {description && (
            <p className="mt-0.5 text-xs font-normal leading-5 opacity-85">
              {description}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function WmsField({
  label,
  required = false,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className={`wms-field block${error ? " wms-field--error" : ""}`}>
      <span className="wms-field-label mb-2 flex items-center justify-between text-[12px] font-semibold">
        {label}
        {required && <span className="text-[var(--wms-danger)]">Bắt buộc</span>}
      </span>
      {children}
      {error && (
        <span
          className="mt-1.5 block text-[11px] font-medium text-[var(--wms-danger)]"
          role="alert"
        >
          {error}
        </span>
      )}
    </label>
  );
}

export const WmsInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }
>(function WmsInput({ error = false, className = "", ...props }, ref) {
  return (
    <input
      className={`wms-field-control wms-field-control--outlined wms-input px-3.5 ${
        error ? "wms-input--error" : ""
      } ${className}`}
      ref={ref}
      {...props}
    />
  );
});

export const WmsTextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }
>(function WmsTextArea({ error = false, className = "", ...props }, ref) {
  return (
    <textarea
      className={`wms-field-control wms-field-control--outlined wms-textarea px-3.5 py-3 ${
        error ? "wms-input--error" : ""
      } ${className}`}
      ref={ref}
      {...props}
    />
  );
});

export const WmsSelect = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }
>(function WmsSelect(
  { error = false, className = "", children, ...props },
  ref,
) {
  return (
    <select
      className={`wms-field-control wms-field-control--outlined wms-select px-3.5 ${error ? "wms-input--error" : ""} ${className}`}
      ref={ref}
      {...props}
    >
      {children}
    </select>
  );
});
