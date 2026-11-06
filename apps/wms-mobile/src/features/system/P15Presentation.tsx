import {HN_UI,UI_KIT_COLORS} from '../../theme/uiKitV3';
import React, { createContext, useContext, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Text } from '../../ui/Text';
import {SCANNER_COLORS} from '../../ui/ScannerPalette';

// Geometry/copy source: approved P15 r03 style.css; the global footer is owned
// by AppShell. These are product presenters, with no transport/native effects.
export const P15_COLORS = {
  canvas: HN_UI.canvas,
  ink: HN_UI.textPrimary,
  muted: HN_UI.textMuted,
  primary: SCANNER_COLORS.primary,
  line: HN_UI.border,
  border: HN_UI.border,
  icon: HN_UI.textSecondary,
  pastel: HN_UI.canvas,
  danger: HN_UI.danger,
  success: HN_UI.success,
  white: HN_UI.onBrand,
} as const;

const ScaleContext = createContext(1);
export const useP15Scale = () => useContext(ScaleContext);

export type P15GlyphName =
  | 'wifi'
  | 'document'
  | 'lock'
  | 'clock'
  | 'alert'
  | 'back'
  | 'home'
  | 'retry'
  | 'login'
  | 'camera'
  | 'nfc'
  | 'phone'
  | 'user';
const paths: Record<P15GlyphName, string> = {
  wifi: 'M3 8a14 14 0 0 1 18 0M6 11a9 9 0 0 1 12 0M9 14a5 5 0 0 1 6 0M12 17h.01',
  document:
    'M8 3H6a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2M9 1h6v5H9V1zM8 10h.01M12 10h4M8 14h.01M12 14h4M8 18h.01',
  lock: 'M6 10V7a6 6 0 0 1 12 0v3M5 10h14a2 2 0 0 1 2 2v9H3v-9a2 2 0 0 1 2-2z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2',
  alert: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v6M12 16h.01',
  back: 'M15 5l-7 7 7 7',
  home: 'M3 11l9-8 9 8M5 10v11h5v-7h4v7h5V10',
  retry: 'M20 7a9 9 0 0 0-15-2L2 8M2 3v5h5M4 17a9 9 0 0 0 15 2l3-3M22 21v-5h-5',
  login: 'M14 8l4 4-4 4M18 12H3M10 4h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H10',
  camera: 'M8 5l2-3h4l2 3h5v15H3V5h5zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  nfc: 'M4.9 4.9a10 10 0 0 0 0 14.2M7.8 7.8a6 6 0 0 0 0 8.4M12 12h.01M16.2 7.8a6 6 0 0 1 0 8.4M19.1 4.9a10 10 0 0 1 0 14.2',
  phone: 'M6 2h12v20H6V2zM11 18h2',
  user: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 21v-3a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v3',
};

export function P15Glyph({
  name,
  size = 26,
  color = P15_COLORS.primary,
}: {
  name: P15GlyphName;
  size?: number;
  color?: string;
}) {
  return (
    <Svg
      accessible={false}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      <Path
        d={paths[name]}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export interface P15FrameProps {
  panel: 'P15.S01' | 'P15.S02' | 'P15.S03' | 'P15.S04';
  title: string;
  onBack?: () => void;
  /** AppShell supplies the existing guarded global menu; never copied here. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function P15Frame({
  panel,
  title,
  onBack,
  footer,
  children,
}: P15FrameProps) {
  const window = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number>();
  const width = Math.min(494, measuredWidth ?? window.width);
  const scale = width > 0 ? width / 494 : 1;
  const measure = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next > 0 && next !== measuredWidth) setMeasuredWidth(next);
  };
  return (
    <ScaleContext.Provider value={scale}>
      <SafeAreaView
        testID={panel}
        edges={['top', 'bottom']}
        onLayout={measure}
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 494,
          alignSelf: 'center',
          backgroundColor: P15_COLORS.canvas,
        }}
      >
        <StatusBar barStyle="light-content" />
        <View
          style={{
            minHeight: 100 * scale,
            flexShrink: 0,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14 * scale,
            paddingHorizontal: 20 * scale,
            paddingTop: 14 * scale,
            paddingBottom: 24 * scale,
            backgroundColor: HN_UI.shell,
          }}
        >
          <Svg
            accessible={false}
            width="100%"
            height="100%"
            style={StyleSheet.absoluteFill}
          >
            <Defs>
              <LinearGradient id="p15-header" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={HN_UI.shell} />
                <Stop offset="1" stopColor={HN_UI.shell} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#p15-header)" />
          </Svg>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            disabled={!onBack}
            accessibilityState={{ disabled: !onBack }}
            onPress={onBack}
            style={{
              width: Math.max(44, 44 * scale),
              minHeight: Math.max(44, 44 * scale),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <P15Glyph name="back" color={HN_UI.onBrand} size={26 * scale} />
          </Pressable>
          <Text
            accessibilityRole="header"
            style={{
              color: HN_UI.onBrand,
              fontSize: 25 * scale,
              lineHeight: 32.5 * scale,
              fontWeight: '600',
              flexShrink: 1,
            }}
          >
            {title}
          </Text>
        </View>
        <View
          style={{
            flex: 1,
            minHeight: 0,
            marginTop: -12 * scale,
            borderTopLeftRadius: 24 * scale,
            borderTopRightRadius: 24 * scale,
            paddingTop: 24 * scale,
            paddingHorizontal: 24 * scale,
            paddingBottom: 30 * scale,
            backgroundColor: P15_COLORS.canvas,
          }}
        >
          {children}
        </View>
        {footer}
      </SafeAreaView>
    </ScaleContext.Provider>
  );
}

export function P15Action({
  label,
  glyph,
  onPress,
  secondary,
  help,
  busy,
  disabled,
}: {
  label: string;
  glyph?: P15GlyphName;
  onPress: () => void;
  secondary?: boolean;
  help?: boolean;
  busy?: boolean;
  disabled?: boolean;
}) {
  const s = useP15Scale();
  const visualDisabled=disabled&&!busy;
  const color = visualDisabled ? HN_UI.disabledForeground : secondary || help ? HN_UI.secondaryForeground : HN_UI.onBrand;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: Math.max(44, (help ? 44 : 56) * s),
        paddingHorizontal: 14 * s,
        paddingVertical: (help ? 8 : 12) * s,
        borderRadius: 12 * s,
        borderWidth: help ? 0 : 1,
        borderColor: visualDisabled
          ? UI_KIT_COLORS['action.disabled.border']
          : secondary
          ? P15_COLORS.border
          : P15_COLORS.primary,
        backgroundColor: visualDisabled
          ? HN_UI.disabled
          : pressed&&!busy
          ? secondary||help?HN_UI.surfaceHover:HN_UI.primaryPressed
          : secondary || help
          ? HN_UI.onBrand
          : P15_COLORS.primary,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12 * s,
        opacity: 1,
      })}
    >
      {busy ? (
        <ActivityIndicator size="small" color={color} />
      ) : glyph ? (
        <P15Glyph name={glyph} size={26 * s} color={color} />
      ) : null}
      <Text
        style={{
          flexShrink: 1,
          textAlign: 'center',
          color,
          fontSize: (help ? 16 : 18) * s,
          lineHeight: 26 * s,
          fontWeight: help ? '400' : '600',
          textDecorationLine: help ? 'underline' : 'none',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function P15StateCard({
  glyph,
  clock,
  heading,
  message,
  extra,
  actions,
}: {
  glyph: P15GlyphName;
  clock?: boolean;
  heading: string;
  message: string;
  extra?: React.ReactNode;
  actions: React.ReactNode;
}) {
  const s = useP15Scale();
  return (
    <View
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        borderRadius: 16 * s,
        backgroundColor: HN_UI.surface,
      }}
    >
      <ScrollView
        testID="p15-content-scroll"
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingTop: 26 * s,
          paddingHorizontal: 20 * s,
          paddingBottom: 20 * s,
        }}
      >
        <View style={{ flexShrink: 0, alignItems: 'center', gap: 14 * s }}>
          <View
            style={{
              width: 112 * s,
              height: 112 * s,
              flexShrink: 0,
              marginBottom: 16 * s,
              borderRadius: 26 * s,
              backgroundColor: P15_COLORS.pastel,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <P15Glyph name={glyph} size={76 * s} color={P15_COLORS.icon} />
            <View
              style={{
                position: 'absolute',
                right: -5 * s,
                bottom: 3 * s,
                width: 40 * s,
                height: 40 * s,
                borderRadius: 20 * s,
                borderWidth: 4 * s,
                borderColor: HN_UI.surface,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: clock ? HN_UI.selected : HN_UI.dangerSoft,
              }}
            >
              <P15Glyph
                name={clock ? 'clock' : 'alert'}
                size={30 * s}
                color={clock ? HN_UI.textLink : P15_COLORS.danger}
              />
            </View>
          </View>
          <Text
            accessibilityRole="header"
            style={{
              color: P15_COLORS.ink,
              fontSize: 26 * s,
              lineHeight: 34 * s,
              fontWeight: '700',
              letterSpacing: -0.4 * s,
              textAlign: 'center',
            }}
          >
            {heading}
          </Text>
          <Text
            style={{
              maxWidth: 360 * s,
              color: P15_COLORS.muted,
              fontSize: 18 * s,
              lineHeight: 27 * s,
              textAlign: 'center',
            }}
          >
            {message}
          </Text>
        </View>
        {extra}
      </ScrollView>
      <View
        testID="p15-action-dock"
        style={{
          flexShrink: 0,
          gap: 12 * s,
          padding: 20 * s,
          borderTopWidth: 1,
          borderColor: P15_COLORS.line,
          backgroundColor: HN_UI.surface,
        }}
      >
        {actions}
      </View>
    </View>
  );
}

export function P15Hint({ children }: { children: React.ReactNode }) {
  const s = useP15Scale();
  return (
    <Text
      style={{
        flexShrink: 0,
        marginTop: 16 * s,
        fontSize: 15 * s,
        lineHeight: 23 * s,
        color: P15_COLORS.muted,
      }}
    >
      {children}
    </Text>
  );
}
