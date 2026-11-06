import {HN_UI} from '../../theme/uiKitV3';
import {SCANNER_ARIAL_FAMILY} from '../../theme/scannerTypography';
import React, { useId, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '../../ui/Text';
import { AppIcon, type AppIconName } from '../../ui/AppIcon';
import { HN_OPERATIONS } from '../../ui/hnHomeTokens';
import {SCANNER_COLORS} from '../../ui/ScannerPalette';

export const p17Styles = StyleSheet.create({
  text: {
    color: HN_UI.textPrimary,
    fontSize: 16,
    lineHeight: 24,
    fontFamily: SCANNER_ARIAL_FAMILY,
  },
  heading: {
    color: HN_UI.textPrimary,
    fontSize: 19,
    lineHeight: 27,
    fontWeight: '700',
  },
  muted: { color: HN_UI.textMuted },
  card: {
    padding: 18,
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 14,
    backgroundColor: HN_UI.surface,
  },
  cardCompact: { padding: 14 },
  compactHeading: { marginBottom: 10 },
  compactRow: { marginBottom: 8 },
  fill: { flex: 1, minWidth: 0 },
  cardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  tile: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  rowLast: { marginBottom: 0 },
  label: { width: '39%', color: HN_UI.textMuted, fontSize: 16, lineHeight: 24 },
  value: { flex: 1, minWidth: 0 },
  readable: { position: 'relative', minWidth: 0 },
  measurement: { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 },
  more: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  moreText: {
    color: HN_UI.textLink,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  action: {
    minHeight: 56,
    padding: 12,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  actionSecondary: { borderColor: HN_UI.border, backgroundColor: HN_UI.surface },
  actionDisabled: { backgroundColor: HN_UI.disabled, borderColor: 'transparent' },
  actionLabel: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
  },
  info: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: HN_UI.canvas,
  },
  infoText: { flex: 1, minWidth: 0, color: HN_UI.textPrimary },
  warning: {
    flexDirection: 'row',
    gap: 16,
    padding: 20,
    borderRadius: 14,
    backgroundColor: HN_UI.warningSoft,
  },
  warningSymbol: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HN_UI.warning,
  },
  warningTitle: { color: HN_UI.danger, marginBottom: 6 },
  compactSymbol: { width: 32, height: 32, borderRadius: 16 },
  symbolText: {
    color: HN_UI.onBrand,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
  },
  compactSymbolText: { fontSize: 24, lineHeight: 30 },
});

export interface P17ReadRequest {
  title: string;
  value: string;
  restoreFocus: () => void;
}
export type P17Read = (request: P17ReadRequest) => void;
export const p17Text = (value: string | null | undefined): string =>
  typeof value === 'string' && value.trim() ? value : 'Chưa xác định';

/** Same source string for measured preview and full reader; never truncates data. */
export function P17Readable({
  label,
  value,
  lines = 2,
  onRead,
  muted = false,
  textStyle,
}: {
  label: string;
  value?: string | null;
  lines?: 2 | 3;
  onRead: P17Read;
  muted?: boolean;
  textStyle?: StyleProp<TextStyle>;
}) {
  const [height, setHeight] = useState(0);
  const trigger = useRef<React.ComponentRef<typeof Pressable>>(null);
  const text = p17Text(value);
  return (
    <View style={p17Styles.readable}>
      <Text
        testID={'P17.measure.' + label}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[p17Styles.text, textStyle, p17Styles.measurement]}
        onLayout={event => setHeight(event.nativeEvent.layout.height)}
      >
        {text}
      </Text>
      <Text
        numberOfLines={lines}
        style={[p17Styles.text, muted && p17Styles.muted, textStyle]}
      >
        {text}
      </Text>
      {height > lines * 24 + 1 && (
        <Pressable
          ref={trigger}
          style={p17Styles.more}
          accessibilityRole="button"
          accessibilityLabel={'Xem đầy đủ ' + label}
          onPress={() =>
            onRead({
              title: label,
              value: text,
              restoreFocus: () => trigger.current?.focus(),
            })
          }
        >
          <Text style={p17Styles.moreText}>Xem đầy đủ</Text>
        </Pressable>
      )}
    </View>
  );
}

export function P17Gradient({ start, end }: { start: string; end: string }) {
  const id = 'p17-' + useId().replace(/:/g, '');
  return (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      accessible={false}
    >
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={start} />
          <Stop offset="1" stopColor={end} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={'url(#' + id + ')'} />
    </Svg>
  );
}

/** Ref guard in the caller handles single flight even before React repaints. */
export function P17Action({
  label,
  icon,
  secondary,
  disabled,
  busy,
  onPress,
  testID,
}: {
  label: string;
  icon?: AppIconName;
  secondary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const inactive = disabled || busy;
  const color = inactive ? HN_UI.textMuted : secondary ? HN_UI.textPrimary : HN_UI.onBrand;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={!!inactive}
      onPress={() => {
        if (!inactive) onPress();
      }}
      style={[
        p17Styles.action,
        secondary && p17Styles.actionSecondary,
        inactive && p17Styles.actionDisabled,
      ]}
    >
      {!secondary && !inactive && <P17Gradient start={SCANNER_COLORS.primary} end={SCANNER_COLORS.primary} />}
      {busy ? (
        <ActivityIndicator color={color} />
      ) : (
        icon && <AppIcon name={icon} size={24} color={color} />
      )}
      <Text style={[p17Styles.text, p17Styles.actionLabel, { color }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function P17Tile({
  operation,
  icon,
}: {
  operation: keyof typeof HN_OPERATIONS;
  icon: AppIconName;
}) {
  const tone = HN_OPERATIONS[operation];
  return (
    <View style={[p17Styles.tile, { backgroundColor: tone.soft }]}>
      <AppIcon name={icon} color={tone.ink} size={20} />
    </View>
  );
}

export function P17Card({
  title,
  icon,
  operation = 'documents',
  compact,
  children,
}: {
  title: string;
  icon?: AppIconName;
  operation?: keyof typeof HN_OPERATIONS;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={[p17Styles.card, compact && p17Styles.cardCompact]}>
      <View
        style={[p17Styles.cardHeading, compact && p17Styles.compactHeading]}
      >
        {icon && <P17Tile operation={operation} icon={icon} />}
        <Text
          accessibilityRole="header"
          style={[p17Styles.text, p17Styles.heading, p17Styles.fill]}
        >
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

export function P17Row({
  label,
  value,
  onRead,
  last,
  compact,
}: {
  label: string;
  value?: string | null;
  onRead: P17Read;
  last?: boolean;
  compact?: boolean;
}) {
  return (
    <View
      style={[
        p17Styles.row,
        compact && p17Styles.compactRow,
        last && p17Styles.rowLast,
      ]}
    >
      <Text style={[p17Styles.text, p17Styles.label]}>{label}</Text>
      <View style={p17Styles.value}>
        <P17Readable label={label} value={value} onRead={onRead} />
      </View>
    </View>
  );
}

export function P17Info({ children }: { children: ReactNode }) {
  return (
    <View style={p17Styles.info}>
      <AppIcon name="info" size={24} color={HN_UI.textLink} />
      <Text style={[p17Styles.text, p17Styles.infoText]}>{children}</Text>
    </View>
  );
}

export function P17Warning({
  title,
  message,
  style,
  compact,
}: {
  title?: string;
  message: string;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  return (
    <View style={[p17Styles.warning, style]}>
      <View
        style={[p17Styles.warningSymbol, compact && p17Styles.compactSymbol]}
      >
        <Text
          style={[p17Styles.symbolText, compact && p17Styles.compactSymbolText]}
        >
          !
        </Text>
      </View>
      <View style={p17Styles.fill}>
        {title && (
          <Text
            accessibilityRole="header"
            style={[p17Styles.text, p17Styles.heading, p17Styles.warningTitle]}
          >
            {title}
          </Text>
        )}
        <Text style={[p17Styles.text, p17Styles.muted]}>{message}</Text>
      </View>
    </View>
  );
}
