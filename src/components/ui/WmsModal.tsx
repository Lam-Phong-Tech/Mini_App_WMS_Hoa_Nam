import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

let activeModalCount = 0;

type WmsModalProps = {
  open: boolean;
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
  onClose?: () => void;
  /** Chỉ bật với popup có thể hủy an toàn khi chạm vùng nền. */
  closeOnBackdrop?: boolean;
};

/**
 * Lớp modal dùng chung cho Mini App.
 *
 * Backdrop được render qua portal để luôn nằm trên navigation, camera và các
 * phần tử fixed của từng màn hình. Nó đồng thời khóa cuộn/click nền khi mở.
 */
export function WmsModal({
  open,
  children,
  ariaLabel,
  className = "",
  onClose,
  closeOnBackdrop = false,
}: WmsModalProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    activeModalCount += 1;
    document.documentElement.classList.add("wms-modal-open");
    document.body.classList.add("wms-modal-open");

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onCloseRef.current) {
        event.preventDefault();
        onCloseRef.current();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
      activeModalCount = Math.max(0, activeModalCount - 1);

      if (activeModalCount === 0) {
        document.documentElement.classList.remove("wms-modal-open");
        document.body.classList.remove("wms-modal-open");
      }

      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const dismissFromBackdrop = () => {
    if (closeOnBackdrop) onClose?.();
  };

  return createPortal(
    <div className="wms-modal-layer">
      <div
        aria-hidden="true"
        className="wms-modal-backdrop"
        onClick={dismissFromBackdrop}
      />
      <section
        aria-label={ariaLabel || "Hộp thoại"}
        aria-modal="true"
        className={`wms-modal-panel ${className}`}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}
