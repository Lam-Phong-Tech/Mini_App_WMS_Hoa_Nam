import type { P04SelectAnchor } from '../inbound/p04SelectPlacement';
export interface P05ChoiceViewport {
  width: number;
  height: number;
  top: number;
  bottom: number;
}
// Same form-viewport bounds and fixed opening height as P05 r07/r11.
export function p05ChoicePlacement(
  anchor: P04SelectAnchor,
  viewport: P05ChoiceViewport,
  desired: number,
  side?: 'above' | 'below',
) {
  const lower = viewport.height - viewport.bottom,
    gap = 6;
  if (
    anchor.width <= 0 ||
    anchor.height <= 0 ||
    lower <= viewport.top + 40 ||
    anchor.y + anchor.height <= viewport.top
  )
    return null;
  // On Android the IME shrinks the visible lower boundary while the original
  // field can remain below it. Returning null here unmounts the popup, blurs
  // its search input and immediately closes the keyboard. Pin an offscreen
  // anchor to the visible lower edge and open upward instead.
  const anchorBelow = anchor.y >= lower,
    effective = anchorBelow
      ? { ...anchor, y: lower, height: 1 }
      : anchor,
    below = Math.max(0, lower - effective.y - effective.height - gap),
    above = Math.max(0, effective.y - viewport.top - gap);
  let next = anchorBelow
    ? 'above'
    : side ?? (below >= desired || below >= above ? 'below' : 'above');
  if (
    (next === 'above' ? above : below) < 80 &&
    (next === 'above' ? below : above) > 80
  )
    next = next === 'above' ? 'below' : 'above';
  const height = Math.min(desired, next === 'above' ? above : below),
    width = Math.min(anchor.width, viewport.width);
  return {
    left: Math.max(0, Math.min(effective.x, viewport.width - width)),
    top:
      next === 'below'
        ? effective.y + effective.height + gap
        : effective.y - gap - height,
    width,
    height,
    side: next,
  };
}
