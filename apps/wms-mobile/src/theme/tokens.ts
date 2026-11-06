import {HN_UI,UI_KIT_COLORS} from './uiKitV3';
/**
 * Design tokens.
 *
 * Nguồn: HoaNam Unified UI Kit v3.0.1, Ocean/Light, theo yêu cầu04/11/2026.
 * Màu được khóa tập trung trong uiKitV3.ts.
 * Các token này dùng chung cho Web và React Native; nghiệp vụ/API không phụ
 * thuộc vào chúng.
 */

import { Platform } from 'react-native';
import { SCANNER_ARIAL_FAMILY } from './scannerTypography';
import {SCANNER_COLORS} from '../ui/ScannerPalette';

export const colors = {
  surfaceCanvas: HN_UI.canvas,
  surface: HN_UI.surface,
  surfaceSubtle: HN_UI.surfaceSunken,

  primary: SCANNER_COLORS.primary,
  primaryStrong: HN_UI.primaryPressed,
  primarySoft: HN_UI.selected,

  textStrong: HN_UI.textPrimary,
  text: HN_UI.textSecondary,
  textMuted: HN_UI.textMuted,
  divider: HN_UI.border,

  success: HN_UI.success,
  successSoft: HN_UI.successSoft,
  successText: HN_UI.success,

  danger: HN_UI.danger,
  dangerSoft: HN_UI.dangerSoft,
  dangerText: HN_UI.danger,

  warning: HN_UI.warning,
  warningSoft: HN_UI.warningSoft,
  warningText: HN_UI.warning,

  info: HN_UI.info,
  infoSoft: HN_UI.infoSoft,
  infoText: HN_UI.info,
} as const;

export const field = {
  height: 48,
  radius: 8,
  paddingX: 14,
  border: HN_UI.borderControl,
  borderHover: UI_KIT_COLORS['input.hoverBorder'],
  borderFocus: colors.primary,
  borderError: colors.danger,
  background: HN_UI.input,
  readonlyBackground: UI_KIT_COLORS['input.readonlyBg'],
  disabledText: UI_KIT_COLORS['action.disabled.fg'],
  disabledBorder: UI_KIT_COLORS['action.disabled.border'],
  placeholder: UI_KIT_COLORS['input.placeholder'],
  helperColor: UI_KIT_COLORS['text.secondary'],
  disabledBackground: HN_UI.disabled,
  labelSize: 14,
  helperSize: 12,
} as const;

export const radius = {
  card: 12,
  control: 8,
  sheet: 20,
} as const;

/** Thang khoảng cách — ui-system-x-vuexy.md §2 "Khoảng cách và hình khối". */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/**
 * Đổ bóng.
 *
 * CSS gốc: card `0 3px 10px rgba(18,75,101,0.02)`, floating
 * `0 -12px 36px rgba(7,59,82,0.15)`.
 * Android không nhận `shadow*` của RN mà dùng `elevation`; giá trị elevation
 * dưới đây lấy theo độ lệch dọc của bóng gốc (4px → 4, 8px → 8).
 */
export const elevation = {
  card: 4,
  floating: 8,
} as const;

/**
 * Typography — ui-system-x-vuexy.md §2 "Chữ".
 *
 * Web retains the existing Public Sans default; locked board overrides use
 * Arial. Android ships the licensed Arimo faces to avoid system-font metric
 * drift. Exact native rasterization remains part of visual review.
 */
export const typography = {
  fontFamily: SCANNER_ARIAL_FAMILY as string | undefined,
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 18, fontWeight: '400' },
  cardTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  metric: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  screenTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
} as const;

/**
 * Kích thước vùng chạm tối thiểu.
 * ui-system-x-vuexy.md §2: "Input/button: cao tối thiểu 44–48px".
 */
export const touchTarget = {
  min: 48,
  comfortable: 48,
} as const;

/**
 * Breakpoint cho PDA và điện thoại (Prompt 2 §3).
 *
 * `contentMax = 448` lấy từ `max-w-md` mà Mini App dùng ở `App.tsx:60`.
 * `compact = 360` là ngưỡng dưới của máy PDA màn hẹp; audit đã đo bố cục không
 * tràn ở 320px.
 */
export const breakpoints = {
  compact: 360,
  contentMax: 448,
} as const;

export const motion = {
  fast: 140,
  normal: 220,
} as const;

export const tokens = {
  colors,
  field,
  radius,
  spacing,
  elevation,
  typography,
  touchTarget,
  breakpoints,
  motion,
} as const;

export type Tokens = typeof tokens;
Object.freeze(colors);Object.freeze(field);Object.freeze(tokens);
