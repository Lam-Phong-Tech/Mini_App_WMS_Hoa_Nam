import { RefObject, useEffect, useState } from "react";

interface KeyboardViewport {
  native: boolean;
  editableFocused: boolean;
  baselineHeight: number;
  viewportHeight: number;
  scale?: number;
  wasOpen?: boolean;
}

/** Focus alone is not evidence of a keyboard (desktop/hardware keyboards).
 * Require a substantial native viewport loss, and ignore pinch zoom. Keep the
 * state through a focus hand-off until the keyboard viewport expands again. */
export const isNativeKeyboardVisible = ({
  native, editableFocused, baselineHeight, viewportHeight, scale = 1, wasOpen = false,
}: KeyboardViewport): boolean => native && (editableFocused || wasOpen)
  && Number.isFinite(baselineHeight) && Number.isFinite(viewportHeight)
  && baselineHeight > 0 && viewportHeight > 0 && Math.abs(scale - 1) < 0.05
  && baselineHeight - viewportHeight >= Math.max(120, baselineHeight * 0.18);

/** Minimum scroll needed to reveal a field, never an unconditional jump to
 * the page bottom. Positive values scroll down; negative values scroll up. */
export const getFocusedFieldScrollDelta = (
  fieldTop: number,
  fieldBottom: number,
  viewportTop: number,
  viewportBottom: number,
  margin = 12,
): number => {
  if (![fieldTop, fieldBottom, viewportTop, viewportBottom, margin].every(Number.isFinite)
    || fieldBottom <= fieldTop || viewportBottom <= viewportTop || margin < 0) return 0;
  const top = viewportTop + margin;
  const bottom = viewportBottom - margin;
  if (bottom <= top) return 0;
  if (fieldBottom - fieldTop > bottom - top) return fieldTop - top;
  if (fieldBottom > bottom) return fieldBottom - bottom;
  if (fieldTop < top) return fieldTop - top;
  return 0;
};

const isEditable = (element: Element | null): element is HTMLElement => {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly;
  if (!(element instanceof HTMLInputElement) || element.disabled || element.readOnly) return false;
  return !["button", "checkbox", "color", "date", "datetime-local", "file", "hidden", "image", "month", "radio", "range", "reset", "submit", "time", "week"].includes(element.type)
    && element.inputMode !== "none";
};

// ZaUI may retain routes or mount another shell while the keyboard is open.
// Reuse a previously observed closed viewport for the same device width.
const closedHeightByWidth = new Map<number, number>();

export const useNativeKeyboard = (shellRef: RefObject<HTMLElement>): boolean => {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    if (document.documentElement.dataset.host !== "zalo") return undefined;
    const shell = shellRef.current;
    if (!shell) return undefined;
    const page = shell.closest<HTMLElement>(".hn-page");
    if (!page) return undefined;
    const viewport = window.visualViewport;
    let currentWidth = Math.round(window.innerWidth);
    let baselineHeight = closedHeightByWidth.get(currentWidth) ?? window.innerHeight;
    let open = false;
    let updateFrame = 0;
    let revealFrame = 0;
    let settleTimer = 0;

    const revealFocusedField = () => {
      if (!open) return;
      const focused = document.activeElement;
      if (!isEditable(focused) || !shell.contains(focused)) return;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportBottom = Math.min(window.innerHeight, viewportTop + (viewport?.height ?? window.innerHeight));
      const topbar = shell.querySelector<HTMLElement>(".hn-topbar");
      // The search field lives in the sticky topbar itself; only its header
      // row can obscure it. Form fields must clear the entire sticky topbar.
      const obstruction = topbar?.contains(focused)
        ? shell.querySelector<HTMLElement>(".hn-header")
        : topbar;
      const usableTop = Math.max(viewportTop, obstruction?.getBoundingClientRect().bottom ?? viewportTop);
      const field = focused.getBoundingClientRect();
      const delta = getFocusedFieldScrollDelta(field.top, field.bottom, usableTop, viewportBottom);
      if (Math.abs(delta) >= 1) page.scrollTop += delta;
    };

    const update = () => {
      const width = Math.round(window.innerWidth);
      const height = Math.min(window.innerHeight, viewport?.height ?? window.innerHeight);
      const focused = document.activeElement;
      const editableFocused = isEditable(focused) && shell.contains(focused);
      // Orientation/split-width changes are not keyboard opening. Keep a
      // separate baseline per width instead of comparing landscape to portrait.
      if (Math.abs(width - currentWidth) > 40) {
        currentWidth = width;
        baselineHeight = closedHeightByWidth.get(width) ?? window.innerHeight;
        open = false;
      }
      baselineHeight = Math.max(baselineHeight, window.innerHeight, height);
      const nextOpen = isNativeKeyboardVisible({
        native: true, editableFocused, baselineHeight, viewportHeight: height,
        scale: viewport?.scale ?? 1, wasOpen: open,
      });
      if (!nextOpen && !isEditable(focused)) {
        baselineHeight = Math.max(window.innerHeight, height);
        closedHeightByWidth.set(currentWidth, baselineHeight);
      } else if (!nextOpen && height >= baselineHeight) {
        closedHeightByWidth.set(currentWidth, baselineHeight);
      }
      open = nextOpen;
      setKeyboardOpen(nextOpen);
      // React first removes the nav and its clearance; then measure the field
      // again after native resize/automatic WebView scrolling has settled.
      window.cancelAnimationFrame(revealFrame);
      revealFrame = window.requestAnimationFrame(() => {
        revealFrame = window.requestAnimationFrame(revealFocusedField);
      });
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(revealFocusedField, 180);
    };
    const schedule = () => {
      window.cancelAnimationFrame(updateFrame);
      updateFrame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("resize", schedule);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    return () => {
      window.cancelAnimationFrame(updateFrame);
      window.cancelAnimationFrame(revealFrame);
      window.clearTimeout(settleTimer);
      window.removeEventListener("resize", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
    };
  }, [shellRef]);

  return keyboardOpen;
};
