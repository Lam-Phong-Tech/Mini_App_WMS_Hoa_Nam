import {HN_UI} from '../../theme/uiKitV3';
/** Geometry from locked P06/M06 HTML frame494. Values are source CSS, not board tracing. */
import React, { createContext, useContext, useId, type ReactNode } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Rect,
  Stop,
  SvgXml,
} from 'react-native-svg';
import { HnHomeIcon, type HnHomeIconName } from '../../ui/HnHomeIcon';
import { SCANNER_ARIAL_FAMILY } from '../../theme/scannerTypography';

export const P06_FRAME = 494;
const color = {
  ink: HN_UI.textPrimary,
  muted: HN_UI.textSecondary,
  blue: HN_UI.textLink,
  paper: HN_UI.canvas,
  line: HN_UI.border,
};
export function p06Design(width = P06_FRAME) {
  const scale = Math.min(1, Math.max(1, width) / P06_FRAME),
    px = (n: number) => n * scale;
  const font = {
    fontFamily: SCANNER_ARIAL_FAMILY,
    includeFontPadding: false,
  };
  // R2 Android rendered600 with a regular-looking hierarchy. Use native bold
  // for emphasized copy while keeping the locked Arial600 web typography.
  const emphasizedWeight = Platform.OS === 'android' ? '700' : '600';
  const s = StyleSheet.create({
    screen: {
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      backgroundColor: color.paper,
    },
    header: {
      height: px(92),
      flexDirection: 'row',
      alignItems: 'center',
      gap: px(20),
      paddingHorizontal: px(20),
      paddingTop: px(16),
      paddingBottom: px(22),
      backgroundColor: HN_UI.primary,
    },
    headerCopy: { flex: 1, minWidth: 0 },
    back: {
      width: px(44),
      height: px(44),
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: px(12),
    },
    headerScan: { backgroundColor: HN_UI.border },
    title: {
      ...font,
      color: HN_UI.onBrand,
      fontSize: px(24),
      lineHeight: px(30),
      fontWeight: emphasizedWeight,
    },
    subtitle: {
      ...font,
      color: HN_UI.selected,
      fontSize: px(16),
      lineHeight: px(22),
      marginTop: px(3),
    },
    body: {
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      borderTopLeftRadius: px(24),
      borderTopRightRadius: px(24),
      overflow: 'hidden',
      marginTop: px(-10),
      marginBottom: px(24),
      backgroundColor: color.paper,
    },
    scroll: { flex: 1, minWidth: 0, minHeight: 0 },
    content: {
      paddingHorizontal: px(18),
      paddingTop: px(18),
      paddingBottom: px(20),
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 0,
      gap: px(12),
    },
    fill: { flex: 1, minWidth: 0 },
    text: { ...font, color: color.ink, fontSize: px(18), lineHeight: px(24) },
    meta: {
      ...font,
      color: color.muted,
      fontSize: px(16),
      lineHeight: px(21),
      flexShrink: 1,
    },
    small: {
      ...font,
      color: HN_UI.textSecondary,
      fontSize: px(14),
      lineHeight: px(20),
      flexShrink: 1,
    },
    h2: {
      ...font,
      color: color.ink,
      fontSize: px(20),
      lineHeight: px(25),
      fontWeight: '700',
      marginBottom: px(5),
    },
    searchRow: { flexDirection: 'row', gap: px(12), marginBottom: px(14) },
    search: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      height: px(48),
      paddingHorizontal: px(12),
      gap: px(10),
      borderWidth: 1,
      borderColor: HN_UI.borderControl,
      borderRadius: px(14),
      backgroundColor: HN_UI.canvas,
    },
    input: {
      ...font,
      flex: 1,
      minWidth: 0,
      color: color.ink,
      fontSize: px(15),
      height: px(44),
      padding: 0,
    },
    clear: {
      width: px(32),
      height: px(40),
      justifyContent: 'center',
      alignItems: 'center',
    },
    filter: {
      width: px(50),
      height: px(48),
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: px(13),
      backgroundColor: HN_UI.primary,
      overflow: 'hidden',
    },
    tabs: { flexDirection: 'row', gap: px(8), marginBottom: px(14) },
    tab: {
      flex: 1,
      minWidth: 0,
      height: px(42),
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: px(12),
      backgroundColor: HN_UI.canvas,
    },
    tabText: {
      ...font,
      color: HN_UI.textLink,
      fontSize: px(18),
      lineHeight: px(24),
      textAlign: 'center',
    },
    selected: { backgroundColor: color.blue },
    selectedText: { color: HN_UI.onBrand, fontWeight: emphasizedWeight },
    searchContext: { marginBottom: px(12), gap: px(4) },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: px(13),
      minHeight: px(118),
      paddingHorizontal: px(11),
      paddingVertical: px(8),
      borderWidth: 1,
      borderColor: HN_UI.border,
      borderRadius: px(14),
      backgroundColor: HN_UI.surface,
      marginBottom: px(8),
    },
    firstCard: { borderColor: HN_UI.border },
    cardTop: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: px(5),
    },
    cardCode: {
      maxWidth: '100%',
      minWidth: 0,
      ...font,
      color: color.ink,
      fontSize: px(20),
      lineHeight: px(24),
      fontWeight: '700',
      flexShrink: 1,
    },
    cardName: {
      ...font,
      color: color.ink,
      fontSize: px(17),
      lineHeight: px(20),
      fontWeight: '500',
      marginVertical: px(1),
    },
    cardMeta: {
      ...font,
      color: color.muted,
      fontSize: px(14),
      lineHeight: px(18),
    },
    photo: {
      borderRadius: px(12),
      backgroundColor: HN_UI.canvas,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    photoText: {
      ...font,
      color: HN_UI.textMuted,
      fontSize: px(13),
      lineHeight: px(17),
      textAlign: 'center',
      paddingHorizontal: px(6),
    },
    chip: {
      alignSelf: 'flex-start',
      maxWidth: '100%',
      borderRadius: px(12),
      paddingVertical: px(4),
      paddingHorizontal: px(9),
      backgroundColor: HN_UI.successSoft,
    },
    chipText: {
      ...font,
      color: HN_UI.success,
      fontSize: px(14),
      lineHeight: px(19),
    },
    cardChip: { paddingVertical: px(3) },
    cardChipText: { lineHeight: px(18) },
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: px(110),
      gap: px(18),
      borderRadius: px(13),
      marginBottom: px(12),
      backgroundColor: HN_UI.canvas,
    },
    heroCode: {
      maxWidth: '100%',
      minWidth: 0,
      ...font,
      color: color.ink,
      fontSize: px(24),
      lineHeight: px(32.4),
      fontWeight: '700',
      marginVertical: px(4),
    },
    heroName: {
      ...font,
      color: color.ink,
      fontSize: px(19),
      lineHeight: px(25.65),
      fontWeight: '700',
    },
    shortcuts: {
      flexDirection: 'row',
      gap: px(10),
      marginTop: px(0),
      marginBottom: px(16),
    },
    shortcut: {
      flex: 1,
      minWidth: 0,
      minHeight: px(56),
      flexDirection: 'row',
      alignItems: 'center',
      gap: px(8),
      padding: px(12),
      borderWidth: 1,
      borderColor: HN_UI.border,
      borderRadius: px(12),
      backgroundColor: HN_UI.canvas,
    },
    shortcutText: {
      ...font,
      flex: 1,
      minWidth: 0,
      color: HN_UI.textLink,
      fontSize: px(16),
      lineHeight: px(22),
      fontWeight: emphasizedWeight,
    },
    actions: { flexDirection: 'row', gap: px(12), marginBottom: px(12) },
    action: {
      flex: 1,
      minWidth: 0,
      minHeight: px(90),
      alignItems: 'center',
      justifyContent: 'center',
      gap: px(5),
      paddingHorizontal: px(6),
      borderRadius: px(14),
      backgroundColor: HN_UI.canvas,
    },
    actionText: {
      ...font,
      color: HN_UI.textLink,
      fontSize: px(17),
      lineHeight: px(23),
      textAlign: 'center',
    },
    section: {
      borderWidth: 1,
      borderColor: color.line,
      borderRadius: px(13),
      paddingHorizontal: px(10),
      paddingVertical: px(7),
      marginBottom: px(12),
      backgroundColor: color.paper,
    },
    pair: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: px(3),
      paddingHorizontal: px(4),
      borderTopWidth: 1,
      borderTopColor: HN_UI.border,
    },
    pairLabel: {
      ...font,
      width: '42%',
      color: color.muted,
      fontSize: px(16),
      lineHeight: px(19),
    },
    pairValue: {
      ...font,
      flex: 1,
      minWidth: 0,
      color: color.ink,
      fontSize: px(16),
      lineHeight: px(19),
    },
    stockValue: {
      ...font,
      flex: 1,
      color: color.ink,
      fontSize: px(20),
      lineHeight: px(22),
      fontWeight: '700',
      textAlign: 'center',
    },
    warehouse: {
      borderWidth: 1,
      borderColor: HN_UI.border,
      borderRadius: px(14),
      overflow: 'hidden',
      marginBottom: px(14),
    },
    warehouseHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: px(24),
      paddingVertical: px(14),
      paddingHorizontal: px(16),
      backgroundColor: HN_UI.canvas,
    },
    warehouseName: {
      ...font,
      color: color.ink,
      fontSize: px(22),
      lineHeight: px(29.7),
      fontWeight: '700',
    },
    strip: { flexDirection: 'row', paddingVertical: px(13) },
    stockCell: {
      flex: 1,
      minWidth: 0,
      paddingHorizontal: px(8),
      alignItems: 'center',
      gap: px(4),
    },
    stockLabel: {
      ...font,
      color: color.muted,
      fontSize: px(14),
      lineHeight: px(18),
      textAlign: 'center',
    },
    stockLabelSlot: {
      minHeight: px(36),
      flexGrow: 1,
      alignSelf: 'stretch',
      justifyContent: 'center',
    },
    quantity: {
      ...font,
      color: HN_UI.textLink,
      fontSize: px(28),
      lineHeight: px(36),
      fontWeight: '700',
      textAlign: 'center',
    },
    info: {
      padding: px(14),
      borderRadius: px(12),
      backgroundColor: HN_UI.canvas,
      gap: px(5),
      marginTop: px(12),
    },
    warning: { backgroundColor: HN_UI.warningSoft },
    gallery: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: px(12),
      marginTop: px(8),
    },
    galleryButton: {
      width: px(96),
      height: px(72),
      borderRadius: px(10),
      overflow: 'hidden',
      backgroundColor: HN_UI.canvas,
    },
    historyFilters: { flexDirection: 'row', gap: px(10), marginBottom: px(10) },
    historyFilter: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: px(5),
      paddingHorizontal: px(9),
      minHeight: px(46),
      borderWidth: 1,
      borderColor: HN_UI.border,
      borderRadius: px(11),
      backgroundColor: HN_UI.canvas,
    },
    event: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: px(79),
      gap: px(10),
      paddingVertical: px(12),
      borderTopWidth: 1,
      borderTopColor: HN_UI.border,
    },
    eventIcon: {
      width: px(52),
      height: px(52),
      borderRadius: px(13),
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: HN_UI.canvas,
    },
    eventTop: {
      flexDirection: 'row',
      flexWrap: 'nowrap',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: px(5),
    },
    eventName: {
      maxWidth: '100%',
      minWidth: 0,
      flex: 1,
      ...font,
      color: color.ink,
      fontSize: px(19),
      lineHeight: px(25),
      fontWeight: '700',
    },
    eventTime: {
      flexShrink: 0,
      ...font,
      color: color.muted,
      fontSize: px(13),
      lineHeight: px(19),
    },
    eventDescription: { marginTop: px(7), minWidth: 0 },
    eventResult: { width: px(112), flexShrink: 0, minWidth: 0, alignItems: 'flex-end' },
    eventQty: {
      ...font,
      fontSize: px(21),
      lineHeight: px(28),
      fontWeight: '700',
      color: color.ink,
    },
    button: {
      minHeight: Math.max(36, px(44)),
      paddingVertical: px(8),
      paddingHorizontal: px(12),
      borderRadius: px(10),
      backgroundColor: HN_UI.canvas,
      borderWidth: 1,
      borderColor: HN_UI.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: px(6),
    },
    buttonText: {
      ...font,
      color: HN_UI.textLink,
      fontSize: px(16),
      lineHeight: px(22),
      textAlign: 'center',
    },
    state: {
      borderWidth: 1,
      borderColor: HN_UI.border,
      borderRadius: px(12),
      padding: px(14),
      backgroundColor: HN_UI.canvas,
      marginBottom: px(12),
      gap: px(6),
    },
    recents: { marginBottom: px(16) },
    recent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: px(10),
      minHeight: px(56),
      padding: px(8),
      borderWidth: 1,
      borderColor: HN_UI.border,
      borderRadius: px(10),
      backgroundColor: HN_UI.canvas,
      marginBottom: px(6),
    },
    disabled: { opacity: 1,backgroundColor:HN_UI.disabled,borderColor:HN_UI.border },
    selectedBorder: { borderColor: HN_UI.borderControl, borderWidth: 1 },
    note: { marginTop: px(10), marginBottom: px(10) },
  });
  return { s, px, width, scale, color };
}
type Design = ReturnType<typeof p06Design>;
const context = createContext<Design>(p06Design());
export const useP06Design = () => useContext(context);
export function P06DesignProvider({
  width,
  children,
}: {
  width: number;
  children: ReactNode;
}) {
  return (
    <context.Provider value={p06Design(width)}>{children}</context.Provider>
  );
}
const paths: Record<string, string> = {
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  filter:
    '<path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"/>',
  search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  printer:
    '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  warehouse:
    '<path d="M10 12h4M10 8h4M14 21v-3a2 2 0 0 0-4 0v3M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/>',
  calendar:
    '<path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M8 13h.01"/><path d="M12 13h.01"/><path d="M16 13h.01"/><path d="M8 17h.01"/><path d="M12 17h.01"/><path d="M16 17h.01"/>',
  pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
};
export function P06Icon({
  name,
  size = 28,
  color = HN_UI.textLink,
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  const p = paths[name];
  if (!p)
    return (
      <HnHomeIcon
        name={(name === 'warranty' ? 'tool' : name) as HnHomeIconName}
        size={size}
        color={color}
        strokeWidth={2}
      />
    );
  return (
    <SvgXml
      style={{position: 'relative'}}
      width={size}
      height={size}
      accessible={false}
      xml={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`}
    />
  );
}
export function P06HeaderGradient() {
  const { width, px } = useP06Design(),
    h = px(92),
    dx = Math.sin((115 * Math.PI) / 180),
    dy = -Math.cos((115 * Math.PI) / 180),
    length = width * Math.abs(dx) + h * Math.abs(dy);
  return (
    <Svg style={StyleSheet.absoluteFill} width={width} height={h}>
      <Defs>
        <LinearGradient
          id="p06-header-gradient"
          gradientUnits="userSpaceOnUse"
          x1={width / 2 - (dx * length) / 2}
          y1={h / 2 - (dy * length) / 2}
          x2={width / 2 + (dx * length) / 2}
          y2={h / 2 + (dy * length) / 2}
        >
          <Stop offset="0" stopColor={HN_UI.shell} />
          <Stop offset="1" stopColor={HN_UI.shell} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#p06-header-gradient)" />
    </Svg>
  );
}
/** Reproduce source CSS gradients without importing a board raster. */
export function P06SurfaceGradient({
  width,
  height,
  angle,
  from,
  to,
}: {
  width: number;
  height: number;
  angle: number;
  from: string;
  to: string;
}) {
  const id = 'p06-surface-' + useId().replace(/[^a-z0-9_-]/gi, ''),
    dx = Math.sin((angle * Math.PI) / 180),
    dy = -Math.cos((angle * Math.PI) / 180),
    length = width * Math.abs(dx) + height * Math.abs(dy);
  return (
    <Svg
      accessible={false}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
    >
      <Defs>
        <LinearGradient
          id={id}
          gradientUnits="userSpaceOnUse"
          x1={width / 2 - (dx * length) / 2}
          y1={height / 2 - (dy * length) / 2}
          x2={width / 2 + (dx * length) / 2}
          y2={height / 2 + (dy * length) / 2}
        >
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
