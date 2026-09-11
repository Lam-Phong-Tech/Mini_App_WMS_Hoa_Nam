/**
 * Design tokens.
 *
 * Nguồn duy nhất: bộ thiết kế Scanner v2 do người dùng chấp thuận,
 * `ScannerHNApp@90b0032` (palette trong `flows/warranty-components/style.css`).
 * Các token này dùng chung cho Web và React Native; nghiệp vụ/API không phụ
 * thuộc vào chúng.
 */

import { Platform } from 'react-native';

export const colors = {
  surfaceCanvas: '#f3f8fb',
  surface: '#ffffff',
  surfaceSubtle: '#eaf5fa',

  primary: '#0c6286',
  primaryStrong: '#0c5d7d',
  primarySoft: '#eaf5fa',

  textStrong: '#12384e',
  text: '#355a6c',
  textMuted: '#527186',
  divider: '#dce9ef',

  success: '#168657',
  successSoft: '#e1f5ea',
  successText: '#168657',

  danger: '#c63c43',
  dangerSoft: '#fff0f0',
  dangerText: '#c63c43',

  warning: '#a4640c',
  warningSoft: '#fff5e3',
  warningText: '#a4640c',

  info: '#0c6286',
  infoSoft: '#eaf5fa',
  infoText: '#0c6286',
} as const;

export const field = {
  height: 50,
  radius: 9,
  paddingX: 14,
  border: '#dce9ef',
  borderHover: '#a9c6d3',
  borderFocus: colors.primary,
  borderError: colors.danger,
  background: colors.surface,
  disabledBackground: '#edf3f5',
  labelSize: 12,
  helperSize: 12,
} as const;

export const radius = {
  card: 12,
  control: 9,
  sheet: 23,
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
 * ⚠️ Font `Public Sans` CHƯA được nhúng vào app (cần file font và bước link
 * asset, không thuộc phạm vi Prompt 2). `fontFamily: undefined` = dùng font hệ
 * thống làm fallback, đúng như spec cho phép ("fallback về font hệ thống").
 */
export const typography = {
  // Web nạp Public Sans cục bộ từ `src/web/global.css`. Native tiếp tục dùng
  // font hệ thống cho tới khi font được đăng ký qua Android/iOS asset pipeline.
  fontFamily: (Platform.OS === 'web' ? 'Public Sans' : undefined) as string | undefined,
  body: { fontSize: 14, lineHeight: 21, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 18, fontWeight: '400' },
  cardTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  metric: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  screenTitle: { fontSize: 20, lineHeight: 27, fontWeight: '700' },
} as const;

/**
 * Kích thước vùng chạm tối thiểu.
 * ui-system-x-vuexy.md §2: "Input/button: cao tối thiểu 44–48px".
 */
export const touchTarget = {
  min: 44,
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
