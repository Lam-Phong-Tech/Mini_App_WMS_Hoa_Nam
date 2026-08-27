import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function AppButton({
  children,
  variant = "primary",
  fullWidth = false,
  loading = false,
  icon,
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  fullWidth?: boolean;
  loading?: boolean;
  icon?: IconName;
}) {
  return (
    <button
      className={[
        "wms-button inline-flex items-center justify-center gap-2",
        `wms-button--${variant}`,
        fullWidth ? "w-full" : "",
        className,
      ].join(" ")}
      disabled={disabled || loading}
      type="button"
      {...props}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : icon ? (
        <Icon name={icon} size={18} />
      ) : null}
      <span>{loading ? "Đang xử lý..." : children}</span>
    </button>
  );
}
