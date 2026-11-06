/** Measure overlap in window coordinates; do not subtract an IME twice when
 * Android has already resized the modal window. */
export function sheetKeyboardSpace(
  top: number,
  height: number,
  keyboardTop: number | undefined,
) {
  const bottom = top + height;
  const overlap =
    keyboardTop === undefined
      ? 0
      : Math.max(0, Math.min(height, bottom - keyboardTop));
  return {
    bottomInset: overlap,
    availableHeight: Math.max(0, height - overlap),
  };
}
