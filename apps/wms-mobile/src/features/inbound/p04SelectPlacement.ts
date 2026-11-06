export interface P04SelectAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Anchored popup, outside the form layout. Measurements are window dp. */
export function p04SelectPlacement(
  anchor: P04SelectAnchor,
  viewport: { width: number; height: number; top: number; bottom: number },
  desiredHeight: number,
) {
  const gap = 6;
  const bottom = viewport.height - viewport.bottom;
  const below = Math.max(0, bottom - anchor.y - anchor.height - gap);
  const above = Math.max(0, anchor.y - viewport.top - gap);
  const placeBelow = below >= desiredHeight || below >= above;
  const maxHeight = Math.min(desiredHeight, placeBelow ? below : above);
  const width = Math.min(anchor.width, viewport.width);
  return {
    left: Math.max(0, Math.min(anchor.x, viewport.width - width)),
    top: placeBelow
      ? anchor.y + anchor.height + gap
      : anchor.y - gap - maxHeight,
    width,
    maxHeight,
  };
}
