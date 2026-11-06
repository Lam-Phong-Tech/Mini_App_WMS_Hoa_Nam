import { HN_UI } from '../theme/uiKitV3';
/** Ported from locked Home CSS and shared/operation-icons.css; frame494. */
import { SCANNER_COLORS } from './ScannerPalette';
import { OPERATION_PALETTE } from '../theme/operationPalette';
export const HN_HOME = {
  width: 494,
  ink: HN_UI.textPrimary,
  muted: HN_UI.textMuted,
  blue: SCANNER_COLORS.primary,
  line: HN_UI.border,
  surface: HN_UI.surface,
  nav: HN_UI.surface,
  navSelected: HN_UI.selected,
  navInk: HN_UI.textLink,
  scan: HN_UI.textLink,
} as const;
export const HN_OPERATIONS = OPERATION_PALETTE;
export const homeScale = (width: number): number =>
  Math.min(1, Math.max(1, width) / HN_HOME.width);
export const greetingName = (name: string): string =>
  name.trim().replace(/\s+/gu, ' ');
