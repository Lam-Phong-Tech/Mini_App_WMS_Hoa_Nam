import { ButtonHTMLAttributes, ReactNode } from "react";

interface UiButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  loading?: boolean;
  variant?: "primary" | "outline";
}

/** Shared G2 button primitive with a stable loading slot and native semantics. */
export const UiButton = ({
  children,
  className = "",
  disabled,
  loading = false,
  variant = "primary",
  type = "button",
  ...props
}: UiButtonProps) => (
  <button
    {...props}
    type={type}
    className={`hn-button hn-button--${variant}${className ? ` ${className}` : ""}`}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
  >
    <span className="hn-button__loading-slot" aria-hidden="true">
      {loading ? <span className="hn-button__spinner" /> : null}
    </span>
    <span className="hn-button__content">{children}</span>
  </button>
);
