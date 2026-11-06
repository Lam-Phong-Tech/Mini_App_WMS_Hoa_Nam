import {UI_KIT_COLORS} from '../../theme/uiKitV3';
import {HN_UI} from '../../theme/uiKitV3';
import {SCANNER_ARIAL_FAMILY} from '../../theme/scannerTypography';
import {SCANNER_COLORS} from '../../ui/ScannerPalette';
import { blockProfileNavigation } from './profileNavigation';
/** Native P10 layout from locked r10 CSS. No business/API behavior in this file. */
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Rect,
  SvgXml,
} from 'react-native-svg';
import { Text } from '../../ui/Text';
import { useTheme } from '../../theme/ThemeProvider';
import { Input, type InputProps } from '../../ui/Input';
import { KeyboardViewportContext } from '../../ui/Page';
import { useHardwareBack } from '../../app/useHardwareBack';
import { P10_ICONS, type P10IconName } from './p10Icons';

type P10KeyEvent = {
  key: string;
  shiftKey: boolean;
  preventDefault: () => void;
};
type P10FocusNode = { focus: () => void };
type P10Document = { activeElement: unknown };
const Scale = createContext<number | undefined>(undefined);
export function useP10Scale() {
  const inherited = useContext(Scale);
  const { width } = useWindowDimensions();
  // Panel components also use this hook before mounting P10Frame's provider.
  // Their margins and grid widths must use the same native viewport scale.
  return inherited ?? Math.min(1, width / 494);
}
export function P10Text({
  children,
  size = 18,
  line = 1.4,
  weight = '400',
  color = HN_UI.textPrimary,
  style,
  ...rest
}: React.ComponentProps<typeof Text> & {
  size?: number;
  line?: number;
  weight?: TextStyle['fontWeight'];
  color?: string;
}) {
  const s = useP10Scale();
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: SCANNER_ARIAL_FAMILY,
          fontSize: size * s,
          lineHeight: size * line * s,
          // Arial's 600 resolves to its bold face in the locked web reference.
          // Android has a separate semibold face; use bold for that emphasis
          // without inflating font sizes, line boxes or the shared type scale.
          fontWeight:
            Platform.OS === 'android' && weight === '600' ? '700' : weight,
          color,
          includeFontPadding: false,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function P10Icon({
  name,
  size = 28,
  color = HN_UI.textMuted,
}: {
  name: P10IconName;
  size?: number;
  color?: string;
}) {
  const s = useP10Scale();
  return (
    <SvgXml
      width={size * s}
      height={size * s}
      accessible={false}
      xml={
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' +
        color +
        '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        P10_ICONS[name] +
        '</svg>'
      }
    />
  );
}
export function P10Gradient({ avatar = false }: { avatar?: boolean }) {
  const [size, setSize] = useState({ width: 494, height: avatar ? 108 : 88 });
  const angle = ((avatar ? 140 : 115) * Math.PI) / 180,
    dx = Math.sin(angle),
    dy = -Math.cos(angle);
  const length = Math.abs(size.width * dx) + Math.abs(size.height * dy);
  const x1 = size.width / 2 - (dx * length) / 2,
    y1 = size.height / 2 - (dy * length) / 2;
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        setSize(current =>
          current.width === width && current.height === height
            ? current
            : { width, height },
        );
      }}
    >
      {/* Android SVG percentage bounds can retain the loading header's height
          after the profile hero mounts. Use the measured host bounds so the
          background always covers the complete header (including the hero). */}
      <Svg width={size.width} height={size.height}>
        <Defs>
          <LinearGradient
            id={avatar ? 'avatar' : 'header'}
            gradientUnits="userSpaceOnUse"
            x1={x1}
            y1={y1}
            x2={size.width - x1}
            y2={size.height - y1}
          >
            <Stop offset="0" stopColor={avatar ? HN_UI.textPrimary : HN_UI.textPrimary} />
            <Stop offset="1" stopColor={avatar ? HN_UI.textLink : HN_UI.textLink} />
          </LinearGradient>
        </Defs>
        <Rect
          width={size.width}
          height={size.height}
          fill={'url(#' + (avatar ? 'avatar' : 'header') + ')'}
        />
      </Svg>
    </View>
  );
}
export function P10Tile({
  icon,
  size = 56,
  ink = HN_UI.textMuted,
  soft = HN_UI.canvas,
}: {
  icon: P10IconName;
  size?: number;
  ink?: string;
  soft?: string;
}) {
  const s = useP10Scale();
  return (
    <View
      style={{
        width: size * s,
        height: size * s,
        borderRadius: (size === 44 ? 10 : 12) * s,
        backgroundColor: soft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <P10Icon name={icon} size={size === 44 ? 26 : 30} color={ink} />
    </View>
  );
}
export function P10Row({
  icon,
  label,
  description = '',
  onPress,
  disabled = false,
  accessibilityLabel,
  last = false,
  group = true,
}: {
  icon: P10IconName;
  label: string;
  description?: string;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  last?: boolean;
  group?: boolean;
}) {
  const s = useP10Scale();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: Math.max(44, (group ? 80 : 86) * s),
        paddingVertical: (group ? 16 : 14) * s,
        paddingHorizontal: group ? 0 : 14 * s,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16 * s,
        borderTopWidth: last ? 1 : 0,
        borderColor: HN_UI.border,
        opacity: 1,
        backgroundColor: !disabled&&pressed?HN_UI.surfaceHover:'transparent',
      })}
    >
      <P10Tile icon={icon} size={44} {...(disabled?{ink:HN_UI.disabledForeground,soft:HN_UI.disabled}:{})} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <P10Text size={20} line={1.3} weight="700" {...(disabled?{color:HN_UI.disabledForeground}:{})}>
          {label}
        </P10Text>
        {description ? (
          <P10Text
            size={17}
            line={1.45}
            color={HN_UI.textMuted}
            style={{ marginTop: 6 * s }}
          >
            {description}
          </P10Text>
        ) : null}
      </View>
      <P10Icon name="chevron" size={20} color={disabled?HN_UI.disabledForeground:HN_UI.textLink} />
    </Pressable>
  );
}
export function P10Group({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const s = useP10Scale();
  return (
    <View
      style={[
        {
          borderWidth: 1,
          borderColor: HN_UI.border,
          borderRadius: 14 * s,
          paddingHorizontal: 14 * s,
          backgroundColor: HN_UI.surface,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function P10Action({
  label,
  onPress,
  disabled = false,
  busy = false,
  danger = false,
  secondary = false,
  accessibilityLabel,
  arrow = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  danger?: boolean;
  secondary?: boolean;
  accessibilityLabel?: string;
  arrow?: boolean;
}) {
  const s = useP10Scale(),
    ink = danger ? HN_UI.danger : SCANNER_COLORS.primary,
    flatDisabled = disabled && !busy,
    foreground=flatDisabled?HN_UI.disabledForeground:secondary?HN_UI.secondaryForeground:HN_UI.onBrand;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: Math.max(44, (danger ? 56 : 60) * s),
        paddingHorizontal: 18 * s,
        paddingVertical: 12 * s,
        borderRadius: 12 * s,
        borderWidth: 1,
        borderColor: flatDisabled ? HN_UI.border : ink,
        backgroundColor: flatDisabled?HN_UI.disabled:secondary ? HN_UI.onBrand : ink,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 12 * s,
        // Explicit disabled paints keep label/icon contrast on both platforms.
        opacity: 1,
      })}
    >
      {danger ? <P10Icon name="log-out" size={24} color={foreground} /> : null}
      <P10Text
        size={19}
        weight="600"
        line={1.3}
        color={foreground}
      >
        {busy ? 'Đang lưu thay đổi…' : label}
      </P10Text>
      {arrow ? <P10Icon name="arrow" color={foreground} /> : null}
    </Pressable>
  );
}
export function P10Notice({
  title,
  message,
  compact = false,
}: {
  title: string;
  message: string;
  compact?: boolean;
}) {
  const s = useP10Scale();
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: HN_UI.border,
        borderRadius: 14 * s,
        backgroundColor: HN_UI.canvas,
        paddingHorizontal: 16 * s,
        paddingVertical: (compact ? 16 : 20) * s,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 16 * s,
      }}
    >
      <P10Icon name="info" size={34} color={HN_UI.textLink} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <P10Text size={20} weight="700">
          {title}
        </P10Text>
        <P10Text
          size={compact ? 16 : 17}
          line={compact ? 1.45 : 1.6}
          color={HN_UI.textSecondary}
          style={{ marginTop: 6 * s }}
        >
          {message}
        </P10Text>
      </View>
    </View>
  );
}
export function P10Field({
  icon,
  locked = false,
  onClear,
  required = false,
  label,
  ...props
}: InputProps & {
  icon: P10IconName;
  locked?: boolean;
  onClear?: () => void;
  required?: boolean;
}) {
  const s = useP10Scale();
  const theme = useTheme();
  // Shared Input adds theme.spacing.sm (8) around its adornments. P10's
  // locked input uses 14*s; compensate locally without changing shared Input.
  const adornmentAdjustment = 14 * s - theme.spacing.sm;
  return (
    <View style={{ gap: 4 * s, marginTop: 8 * s }}>
      {label === undefined ? null : (
        <P10Text size={17} line={22 / 17} color={HN_UI.textLink}>
          {label}
          {required ? (
            <P10Text size={17} line={22 / 17} color={HN_UI.danger}>
              {' '}
              *
            </P10Text>
          ) : null}
        </P10Text>
      )}
      <Input
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? label}
        editable={!locked && props.editable !== false}
        fieldHeight={50 * s}
        fieldStyle={{
          borderRadius: 12 * s,
          borderColor: HN_UI.borderControl,
          paddingHorizontal: 14 * s,
          backgroundColor: locked ? HN_UI.selected : HN_UI.onBrand,
        }}
        inputStyle={{
          fontFamily: SCANNER_ARIAL_FAMILY,
          fontSize: 18 * s,
          lineHeight: 24 * s,
          fontWeight: locked
            ? '400'
            : Platform.OS === 'android'
            ? '700'
            : '600',
          color: locked ? HN_UI.textSecondary : HN_UI.textLink,
          includeFontPadding: false,
        }}
        leftAdornment={
          <View style={{ marginRight: adornmentAdjustment }}>
            <P10Icon name={icon} color={HN_UI.textLink} />
          </View>
        }
        rightAdornment={
          locked ? (
            <View style={{ marginLeft: adornmentAdjustment }}>
              <P10Icon name="lock" size={21} color={HN_UI.textSecondary} />
            </View>
          ) : onClear ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Xóa số điện thoại"
              accessibilityState={{ disabled: props.editable === false }}
              disabled={props.editable === false}
              onPress={onClear}
              style={{
                minHeight: 44 * s,
                minWidth: 44 * s,
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: adornmentAdjustment,
              }}
            >
              <P10Icon name="x" size={22} color={HN_UI.textLink} />
            </Pressable>
          ) : undefined
        }
      />
    </View>
  );
}
export function P10Dialog({
  visible,
  title,
  message,
  onDismiss,
  children,
  busy = false,
}: {
  visible: boolean;
  title: string;
  message?: string;
  onDismiss: () => void;
  children?: ReactNode;
  busy?: boolean;
}) {
  const s = useP10Scale();
  const panelRef = useRef<React.ComponentRef<typeof View>>(null);
  useEffect(() => (visible ? blockProfileNavigation() : undefined), [visible]);
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const host = panelRef.current as unknown as {
      querySelectorAll: (query: string) => ArrayLike<{ focus: () => void }>;
      addEventListener: (name: string, fn: (e: P10KeyEvent) => void) => void;
      removeEventListener: (name: string, fn: (e: P10KeyEvent) => void) => void;
    } | null;
    const doc = (globalThis as unknown as { document?: P10Document }).document;
    if (!host || !doc) return;
    const previous = doc.activeElement as P10FocusNode | null;
    const controls = () =>
      Array.from(
        host.querySelectorAll(
          '[role="button"]:not([aria-disabled="true"]),input:not([disabled])',
        ),
      );
    controls()[0]?.focus();
    const key = (e: P10KeyEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!busy) onDismiss();
      }
      if (e.key === 'Tab') {
        const buttons = controls(),
          first = buttons[0],
          last = buttons[buttons.length - 1];
        if (e.shiftKey && doc.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && doc.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    host.addEventListener('keydown', key);
    return () => {
      host.removeEventListener('keydown', key);
      previous?.focus?.();
    };
  }, [visible, busy, onDismiss]);
  useHardwareBack(() => {
    if (!visible) return false;
    if (!busy) onDismiss();
    return true;
  });
  useEffect(() => {
    if (visible) Keyboard.dismiss();
  }, [visible]);
  if (!visible) return <></>;
  return (
    <View
      testID="p10-dialog"
      accessibilityViewIsModal
      style={[
        StyleSheet.absoluteFill,
        {
          zIndex: 50,
          backgroundColor: UI_KIT_COLORS['overlay.scrim'],
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20 * s,
        },
      ]}
    >
      <Pressable
        accessibilityLabel="Đóng hộp thoại"
        accessibilityRole="button"
        style={StyleSheet.absoluteFill}
        onPress={() => {
          if (!busy) onDismiss();
        }}
      />
      <View
        ref={panelRef}
        style={{
          width: '100%',
          maxWidth: 454 * s,
          maxHeight: '92%',
          backgroundColor: HN_UI.surface,
          borderRadius: 18 * s,
          padding: 24 * s,
          gap: 16 * s,
        }}
      >
        <P10Text size={24} weight="700">
          {title}
        </P10Text>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={{ flexShrink: 1 }}
          contentContainerStyle={{ gap: 12 * s }}
        >
          {message ? (
            <P10Text size={18} line={1.6}>
              {message}
            </P10Text>
          ) : null}
          {children}
        </ScrollView>
      </View>
    </View>
  );
}
export function P10Frame({
  title,
  onBack,
  hero,
  footer,
  children,
  panel,
  onScrollPositionChange,
  initialScrollY = 0,
  overlay,
}: {
  title: string;
  onBack?: () => void;
  hero?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  panel: string;
  onScrollPositionChange?: (n: number) => void;
  initialScrollY?: number;
  overlay?: ReactNode;
}) {
  const { width } = useWindowDimensions(),
    s = Math.min(1, width / 494),
    scroll = useRef<React.ComponentRef<typeof ScrollView>>(null),
    offset = useRef(0),
    pendingRestore = useRef<number | undefined>(
      initialScrollY > 0 ? initialScrollY : undefined,
    ),
    top = useRef(Dimensions.get('window').height),
    [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => {
      top.current = e.endCoordinates.screenY;
      setKeyboard(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      top.current = Dimensions.get('window').height;
      setKeyboard(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  useEffect(() => {
    pendingRestore.current = initialScrollY > 0 ? initialScrollY : undefined;
    scroll.current?.scrollTo({ y: initialScrollY, animated: false });
  }, [initialScrollY]);
  const reveal = (
    input: Parameters<
      NonNullable<React.ContextType<typeof KeyboardViewportContext>>
    >[0],
  ) => {
    if (!input) return;
    const read = () =>
      input.measureInWindow((_x, y, _w, h) => {
        const covered = y + h - (top.current - 20);
        if (covered > 0)
          scroll.current?.scrollTo({
            y: offset.current + covered,
            animated: true,
          });
      });
    requestAnimationFrame(read);
    setTimeout(read, 280);
  };
  return (
    <Scale.Provider value={s}>
      <SafeAreaView
        edges={Platform.OS === 'web' ? [] : ['top']}
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 494,
          alignSelf: 'center',
          backgroundColor: HN_UI.surface,
          minHeight: 0,
        }}
      >
        <View
          testID={'p10-' + panel}
          style={{
            flex: 1,
            minHeight: 0,
            backgroundColor: HN_UI.surface,
            position: 'relative',
          }}
        >
          <View
            style={{
              minHeight: (hero ? 227 : 88) * s,
              paddingTop: (hero ? 16 : 14) * s,
              paddingHorizontal: (hero ? 24 : 20) * s,
              paddingBottom: (hero ? 32 : 22) * s,
            }}
          >
            <P10Gradient />
            <View
              style={{
                minHeight: 48 * s,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 18 * s,
                justifyContent: hero ? 'center' : 'flex-start',
              }}
            >
              {onBack ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Quay lại"
                  onPress={onBack}
                  style={{
                    width: 44 * s,
                    height: 44 * s,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <P10Icon name="back" color={HN_UI.onBrand} />
                </Pressable>
              ) : null}
              <P10Text
                size={26}
                weight="600"
                line={1.25}
                color={HN_UI.onBrand}
                style={hero ? { textAlign: 'center' } : { flex: 1 }}
              >
                {title}
              </P10Text>
            </View>
            {hero}
          </View>
          <View
            style={{
              flex: 1,
              minHeight: 0,
              marginTop: -12 * s,
              borderTopLeftRadius: 24 * s,
              borderTopRightRadius: 24 * s,
              backgroundColor: HN_UI.surface,
              overflow: 'hidden',
            }}
          >
            <KeyboardViewportContext.Provider value={reveal}>
              <ScrollView
                ref={scroll}
                testID="p10-scroll"
                style={{ flex: 1, minHeight: 0 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                onScroll={e => {
                  offset.current = e.nativeEvent.contentOffset.y;
                  if (pendingRestore.current !== undefined) return;
                  onScrollPositionChange?.(offset.current);
                }}
                onContentSizeChange={() => {
                  if (pendingRestore.current === undefined) return;
                  scroll.current?.scrollTo({
                    y: pendingRestore.current,
                    animated: false,
                  });
                  pendingRestore.current = undefined;
                }}
                scrollEventThrottle={16}
                contentContainerStyle={{
                  paddingTop:
                    (panel === 'S02' ? 16 : panel === 'S03' ? 18 : 22) * s,
                  paddingHorizontal: 20 * s,
                  paddingBottom: Math.max(28 * s, keyboard),
                  gap: panel === 'S02' ? 0 : 0,
                }}
              >
                {children}
              </ScrollView>
              {footer ? (
                <View
                  style={{
                    paddingTop: 8 * s,
                    paddingHorizontal: 20 * s,
                    paddingBottom: 18 * s,
                    borderTopWidth: 1,
                    borderColor: HN_UI.border,
                    backgroundColor: HN_UI.surface,
                  }}
                >
                  {footer}
                </View>
              ) : null}
            </KeyboardViewportContext.Provider>
          </View>
          {overlay}
        </View>
      </SafeAreaView>
    </Scale.Provider>
  );
}
