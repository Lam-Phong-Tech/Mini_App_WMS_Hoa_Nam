/**
 * Design tokens.
 *
 * Nguồn duy nhất: khối `:root` trong `src/css/app.scss` của Mini App — được
 * GATE_01 Q7 chốt là "the only visual source of truth for migrated WMS UI",
 * bổ sung typography từ `docs/ui-system-x-vuexy.md §2`.
 *
 * ❌ Không sáng tạo lại nhận diện thương hiệu (Prompt 2 §3). Mọi giá trị dưới
 * đây đều copy nguyên từ hai nguồn trên; phần suy ra được ghi chú rõ.
 */

export const colors = {
  surfaceCanvas: '#f8f7fa',
  surface: '#ffffff',
  surfaceSubtle: '#f8f7fa',

  primary: '#7367f0',
  primaryStrong: '#5e54d8',
  primarySoft: '#efedff',

  textStrong: '#2f2b3d',
  text: 'rgba(47, 43, 61, 0.78)',
  textMuted: 'rgba(47, 43, 61, 0.42)',
  divider: 'rgba(47, 43, 61, 0.12)',

  success: '#28c76f',
  successSoft: 'rgba(40, 199, 111, 0.12)',
  successText: '#167a45',

  danger: '#ea5455',
  dangerSoft: 'rgba(234, 84, 85, 0.12)',
  dangerText: '#b52f3b',

  warning: '#ff9f43',
  warningSoft: 'rgba(255, 159, 67, 0.14)',
  warningText: '#98520e',

  info: '#00cfe8',
  infoSoft: 'rgba(0, 207, 232, 0.12)',
  infoText: '#087c90',
} as const;

export const field = {
  height: 50,
  radius: 8,
  paddingX: 14,
  border: 'rgba(47, 43, 61, 0.2)',
  borderHover: 'rgba(47, 43, 61, 0.34)',
  borderFocus: colors.primary,
  borderError: colors.danger,
  background: colors.surface,
  disabledBackground: 'rgba(47, 43, 61, 0.05)',
  labelSize: 12,
  helperSize: 12,
} as const;

export const radius = {
  card: 8,
  control: 8,
  sheet: 18,
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
 * CSS gốc: card `0 4px 18px rgba(47,43,61,0.10)`, floating `0 8px 24px rgba(47,43,61,0.14)`.
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
  fontFamily: undefined as string | undefined,
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  caption: { fontSize: 13, lineHeight: 20, fontWeight: '400' },
  cardTitle: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  metric: { fontSize: 22, lineHeight: 30, fontWeight: '600' },
  screenTitle: { fontSize: 21, lineHeight: 28, fontWeight: '700' },
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
