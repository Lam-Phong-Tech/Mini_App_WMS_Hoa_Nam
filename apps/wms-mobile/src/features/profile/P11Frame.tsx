import {HN_UI} from '../../theme/uiKitV3';
import {ScannerNativeText as NativeText} from '../../ui/ScannerNativeText';
import {SCANNER_ARIAL_FAMILY} from '../../theme/scannerTypography';
/** Native port of locked docs/flows/security/style.css (494×950, P11 r03). */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, Modal, type TextStyle} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { useHardwareBack } from '../../app/useHardwareBack';
import {
  KeyboardViewportContext,
  type KeyboardViewportTarget,
} from '../../ui/Page';
import { HN_OPERATIONS } from '../../ui/hnHomeTokens';
import {SCANNER_COLORS} from '../../ui/ScannerPalette';
import {
  webFocusDocument,
  type WebFocusTarget,
  type WebFocusKey,
} from '../../ui/webFocus';

const Scale = createContext(1);
const DialogHost = createContext<(content: ReactNode) => void>(() => {});
export const useP11Scale = () => useContext(Scale);
const baseText = {
  fontFamily: SCANNER_ARIAL_FAMILY,
  includeFontPadding: false,
  color: HN_UI.textPrimary,
} as const;
export function P11Text({
  children,
  size = 19,
  line = 1.45,
  weight = '400',
  color = HN_UI.textPrimary,
  style,
  ...props
}: {
  children?: ReactNode;
  size?: number;
  line?: number;
  weight?: TextStyle['fontWeight'];
  color?: string;
  style?: TextStyle;
  accessibilityRole?: 'header';
  accessibilityLiveRegion?: 'polite';
}) {
  const s = useP11Scale();
  return (
    <NativeText
      {...props}
      style={[
        baseText,
        {
          fontSize: size * s,
          lineHeight: size * line * s,
          fontWeight: weight,
          color,
        },
        style,
      ]}
    >
      {children}
    </NativeText>
  );
}
export type P11IconName =
  | 'back'
  | 'arrow'
  | 'lock'
  | 'eye'
  | 'eye-off'
  | 'info'
  | 'check'
  | 'user'
  | 'house'
  | 'calendar'
  | 'phone'
  | 'laptop'
  | 'pin'
  | 'clock'
  | 'globe'
  | 'logout'
  | 'shield'
  | 'reload';
const paths: Partial<Record<P11IconName, string>> = {
  back: 'm12 19-7-7 7-7M5 12h14',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  lock: 'M6 10V7a6 6 0 0 1 12 0v3M4 10h16v12H4V10z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7',
  'eye-off':
    'M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49M14.084 14.158a3 3 0 0 1-4.242-4.242M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143m-4.264-4.509 20 20',
  check: 'm6 12 4 4 8-8',
  user: 'M20 21v-2a7 7 0 0 0-14 0v2',
  house: 'm3 10 9-7 9 7v11h-6v-8H9v8H3V10',
  calendar:
    'M8 2v4m8-4v4M3 9h18M3 4h18v18H3V4m4 9h.01M12 13h.01M17 13h.01M7 17h.01M12 17h.01M17 17h.01',
  laptop:
    'M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2zM20.054 15.987H3.946',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z',
  clock: 'M12 8v4l3 2',
  globe: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20',
  logout: 'M9 21H3V3h6m7 4 5 5-5 5M21 12H9',
  shield: 'M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7l-9-4z',
  reload:
    'M20 7v5h-5M4 17v-5h5M6.1 6.1a8 8 0 0 1 13.2 3M4.7 14.9a8 8 0 0 0 13.2 3',
};
export function P11Icon({
  name,
  size = 28,
  color = HN_UI.textPrimary,
  stroke = 1.8,
}: {
  name: P11IconName;
  size?: number;
  color?: string;
  stroke?: number;
}) {
  const s = useP11Scale();
  return (
    <Svg
      accessible={false}
      width={size * s}
      height={size * s}
      viewBox="0 0 24 24"
      fill="none"
      style={{ flexShrink: 0, position: 'relative' }}
    >
      {['info', 'clock', 'globe'].includes(name) ? (
        <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={stroke} />
      ) : null}
      {name === 'info' ? (
        <>
          <Path
            d="M12 11v6"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          <Circle cx="12" cy="7" r=".9" fill={color} />
        </>
      ) : null}
      {name === 'phone' ? (
        <>
          <Rect
            x="5"
            y="2"
            width="14"
            height="20"
            rx="2"
            stroke={color}
            strokeWidth={stroke}
          />
          <Path d="M12 18h.01" stroke={color} strokeWidth={stroke} />
        </>
      ) : null}
      {name === 'user' ? (
        <Circle cx="13" cy="7" r="4" stroke={color} strokeWidth={stroke} />
      ) : null}
      {name === 'pin' ? (
        <Circle cx="12" cy="10" r="3" stroke={color} strokeWidth={stroke} />
      ) : null}
      {name === 'eye' ? (
        <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={stroke} />
      ) : null}
      {paths[name] ? (
        <Path
          d={paths[name]}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </Svg>
  );
}
export function P11Tile({ icon }: { icon: P11IconName }) {
  const s = useP11Scale();
  return (
    <View
      style={{
        width: 56 * s,
        height: 56 * s,
        borderRadius: 12 * s,
        backgroundColor: HN_OPERATIONS.documents.soft,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <P11Icon name={icon} color={HN_OPERATIONS.documents.ink} />
    </View>
  );
}
export function P11Gradient({
  kind = 'header',
}: {
  kind?: 'header' | 'button' | 'success';
}) {
  const id = React.useId().replace(/:/g, '');
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 494 88"
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient
            id={id}
            x1="0%"
            y1="0%"
            x2="100%"
            y2={kind === 'header' ? '46%' : '27%'}
          >
            <Stop
              offset="0"
              stopColor={
                kind === 'header'
                  ? HN_UI.textPrimary
                  : kind === 'success'
                  ? HN_UI.success
                  : SCANNER_COLORS.primary
              }
            />
            <Stop
              offset="1"
              stopColor={
                kind === 'header'
                  ? HN_UI.textLink
                  : kind === 'success'
                  ? HN_UI.success
                  : SCANNER_COLORS.primary
              }
            />
          </LinearGradient>
        </Defs>
        <Rect width="494" height="88" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
export function P11Button({
  label,
  onPress,
  disabled = false,
  busy = false,
  variant = 'primary',
  arrow = false,
  accessibilityLabel,
  small = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'revoke';
  arrow?: boolean;
  accessibilityLabel?: string;
  small?: boolean;
}) {
  const s = useP11Scale(),
    solid = variant === 'primary' || variant === 'danger',
    visualDisabled=disabled&&!busy,
    foreground=visualDisabled?HN_UI.disabledForeground:solid?HN_UI.onBrand:variant==='revoke'?HN_UI.danger:HN_UI.secondaryForeground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={{
        minHeight: (small ? 56 : variant === 'revoke' ? 62 : 72) * s,
        paddingVertical: 14 * s,
        paddingHorizontal: 20 * s,
        borderWidth: 1 * s,
        borderColor:
          visualDisabled?HN_UI.border:variant === 'revoke'
            ? HN_UI.danger
            : variant === 'secondary'
            ? HN_UI.selected
            : variant === 'danger'
            ? HN_UI.danger
            : HN_UI.textLink,
        borderRadius: 12 * s,
        overflow: 'hidden',
        opacity: 1,
        backgroundColor: visualDisabled?HN_UI.disabled:variant === 'danger' ? HN_UI.danger : HN_UI.surface,
        flexDirection: 'row',
        gap: 14 * s,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {variant === 'primary'&&!visualDisabled ? <P11Gradient kind="button" /> : null}
      {variant === 'revoke' ? <P11Icon name="logout" color={foreground} /> : null}
      <P11Text
        size={20}
        line={1.4}
        weight="600"
        color={foreground}
      >
        {busy ? 'Đang xử lý…' : label}
      </P11Text>
      {arrow ? <P11Icon name="arrow" color={foreground} /> : null}
    </Pressable>
  );
}
export function P11Hint({
  children,
  marginTop = 50,
  padding = 18,
}: {
  children: ReactNode;
  marginTop?: number;
  padding?: number;
}) {
  const s = useP11Scale();
  return (
    <View
      style={{
        marginTop: marginTop * s,
        padding: padding * s,
        borderRadius: 12 * s,
        backgroundColor: HN_UI.canvas,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 16 * s,
      }}
    >
      <P11Icon name="info" color={HN_UI.textLink} />
      <P11Text size={17} line={1.55} color={HN_UI.textLink} style={{ flex: 1 }}>
        {children}
      </P11Text>
    </View>
  );
}
export function P11Frame({
  title,
  onBack,
  footer,
  children,
  panel,
  center = false,
}: {
  title: string;
  onBack?: () => void;
  footer?: ReactNode;
  children: ReactNode;
  panel: string;
  center?: boolean;
}) {
  const [width, setWidth] = useState(494),
    [modal, setModal] = useState<ReactNode>(null),
    insets = useSafeAreaInsets();
  const s = Math.min(1, Math.max(1, width) / 494),
    scroll = useRef<React.ComponentRef<typeof ScrollView>>(null),
    scrollY = useRef(0),
    keyboardTop = useRef(Infinity),
    frames = useRef(new Set<number>());
  const alive = useRef(true);
  const reveal = useCallback(
    (input: KeyboardViewportTarget | null) => {
      if (!input) return;
      const id = requestAnimationFrame(() => {
        frames.current.delete(id);
        if (!alive.current) return;
        input.measureInWindow((_x, y, _w, h) => {
          const covered = y + h - keyboardTop.current + 20 * s;
          if (covered > 0)
            scroll.current?.scrollTo({
              y: scrollY.current + covered,
              animated: false,
            });
        });
      });
      frames.current.add(id);
    },
    [s],
  );
  useEffect(() => {
    alive.current = true;
    const pendingFrames = frames.current;
    const show = Keyboard.addListener('keyboardDidShow', e => {
        keyboardTop.current = e.endCoordinates.screenY;
      }),
      hide = Keyboard.addListener('keyboardDidHide', () => {
        keyboardTop.current = Infinity;
      });
    return () => {
      alive.current = false;
      show.remove();
      hide.remove();
      pendingFrames.forEach(cancelAnimationFrame);
      pendingFrames.clear();
    };
  }, []);
  const setDialog = useCallback((node: ReactNode) => setModal(node), []);
  return (
    <Scale.Provider value={s}>
      <DialogHost.Provider value={setDialog}>
        <View
          testID={`p11-${panel}-frame`}
          onLayout={e => setWidth(e.nativeEvent.layout.width)}
          style={{
            flex: 1,
            minHeight: 0,
            backgroundColor: HN_UI.shell,
            paddingTop: Platform.OS === 'web' ? 0 : insets.top,
          }}
        >
          <View
            pointerEvents={modal ? 'none' : 'auto'}
            accessibilityElementsHidden={!!modal}
            importantForAccessibility={modal ? 'no-hide-descendants' : 'auto'}
            style={{ flex: 1, minHeight: 0 }}
          >
            <View
              testID="p11-locked-header"
              style={{
                height: 88 * s,
                paddingTop: 14 * s,
                paddingBottom: 26 * s,
                paddingHorizontal: 20 * s,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 18 * s,
              }}
            >
              <P11Gradient />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Quay lại"
                onPress={onBack}
                disabled={!onBack}
                style={{
                  width: 42 * s,
                  height: 44 * s,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <P11Icon name="back" color="white" />
              </Pressable>
              <P11Text
                accessibilityRole="header"
                size={25}
                line={1.3}
                weight="600"
                color="white"
                style={{ flex: 1, textAlign: 'center', paddingRight: 60 * s }}
              >
                {title}
              </P11Text>
            </View>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={{
                flex: 1,
                minHeight: 0,
                marginTop: -12 * s,
                borderTopLeftRadius: 24 * s,
                borderTopRightRadius: 24 * s,
                backgroundColor: 'white',
                overflow: 'hidden',
              }}
            >
              <KeyboardViewportContext.Provider value={reveal}>
                <ScrollView
                  testID="p11-locked-scroll"
                  ref={scroll}
                  scrollEnabled={!modal}
                  style={{ flex: 1, minHeight: 0 }}
                  keyboardShouldPersistTaps="handled"
                  automaticallyAdjustKeyboardInsets
                  showsVerticalScrollIndicator={false}
                  onScroll={e => {
                    scrollY.current = e.nativeEvent.contentOffset.y;
                  }}
                  scrollEventThrottle={32}
                  contentContainerStyle={{
                    flexGrow: 1,
                    paddingTop: (panel === 'S04' ? 18 : center ? 20 : 26) * s,
                    paddingHorizontal: (panel === 'S04' ? 18 : 24) * s,
                    paddingBottom:
                      (center ? 20 : panel === 'S04' ? 18 : 22) * s,
                  }}
                >
                  {center ? (
                    <View
                      style={{
                        flexGrow: 1,
                        justifyContent: 'center',
                        gap: 20 * s,
                      }}
                    >
                      {children}
                    </View>
                  ) : (
                    children
                  )}
                </ScrollView>
              </KeyboardViewportContext.Provider>
              {footer ? (
                <View
                  testID="p11-locked-footer"
                  style={{
                    paddingTop: 18 * s,
                    paddingHorizontal: 24 * s,
                    paddingBottom:
                      28 * s + (Platform.OS === 'web' ? 0 : insets.bottom),
                    backgroundColor: 'white',
                  }}
                >
                  {footer}
                </View>
              ) : null}
            </KeyboardAvoidingView>
          </View>
          {modal}
        </View>
      </DialogHost.Provider>
    </Scale.Provider>
  );
}
export function P11ActionDialog({
  visible,
  title,
  message,
  onDismiss,
  children,
  dismissible = true,
  tone = 'default',
}: {
  visible: boolean;
  title: string;
  message?: string;
  onDismiss: () => void;
  children: ReactNode;
  dismissible?: boolean;
  tone?: 'default' | 'success' | 'error';
}) {
  const host = useContext(DialogHost),
    s = useP11Scale(),
    ref = useRef<React.ComponentRef<typeof View>>(null),
    previousFocus = useRef<WebFocusTarget | null>(null);
  useHardwareBack(() => {
    if (!visible) return false;
    if (dismissible) onDismiss();
    return true;
  });
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    previousFocus.current = webFocusDocument()?.activeElement ?? null;
    const id = requestAnimationFrame(() => {
      const node = ref.current as unknown as WebFocusTarget | null;
      node?.querySelector?.('[role="button"]')?.focus?.();
    });
    return () => {
      cancelAnimationFrame(id);
      if (previousFocus.current?.isConnected !== false)
        previousFocus.current?.focus?.();
    };
  }, [visible]);
  const keyboard = useCallback(
    (event: unknown) => {
      if (Platform.OS !== 'web') return;
      const e = event as WebFocusKey;
      if (e.key === 'Escape') {
        e.preventDefault?.();
        if (dismissible) onDismiss();
      } else if (e.key === 'Tab') {
        const buttons = (
          ref.current as unknown as WebFocusTarget | null
        )?.querySelectorAll?.('[role="button"]:not([aria-disabled="true"])');
        if (!buttons?.length) return;
        const first = buttons[0],
          last = buttons[buttons.length - 1],
          active = webFocusDocument()?.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault?.();
          last.focus?.();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault?.();
          first.focus?.();
        }
      }
    },
    [dismissible, onDismiss],
  );
  const node = useMemo(
    () =>
      visible ? (
        <View
          testID="p11-dialog-backdrop"
          style={[
            StyleSheet.absoluteFill,
            {
              zIndex: 50,
              backgroundColor: HN_UI.scrim,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24 * s,
            },
          ]}
        >
          <View
            ref={ref}
            accessibilityRole="alert"
            accessibilityViewIsModal
            onKeyDown={keyboard}
            style={{
              width: '100%',
              maxWidth: 446 * s,
              maxHeight: '90%',
              borderRadius: 18 * s,
              backgroundColor: 'white',
              overflow: 'hidden',
              padding: 24 * s,
            }}
          >
            {tone !== 'default' ? (
              <View
                style={{
                  alignSelf: 'center',
                  width: 64 * s,
                  height: 64 * s,
                  borderRadius: 32 * s,
                  backgroundColor: tone === 'success' ? HN_UI.successSoft : HN_UI.dangerSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 18 * s,
                }}
              >
                <P11Icon
                  name={tone === 'success' ? 'check' : 'info'}
                  size={34}
                  color={tone === 'success' ? HN_UI.success : HN_UI.danger}
                />
              </View>
            ) : null}
            <P11Text
              size={24}
              line={1.3}
              weight="700"
              color={HN_UI.textPrimary}
              style={{
                marginBottom: 14 * s,
                textAlign: tone === 'success' ? 'center' : 'left',
              }}
            >
              {title}
            </P11Text>
            <ScrollView style={{ flexShrink: 1 }}>
              <P11Text
                size={18}
                line={1.6}
                color={HN_UI.textSecondary}
                style={{ textAlign: tone === 'success' ? 'center' : 'left' }}
              >
                {message}
              </P11Text>
            </ScrollView>
            <View
              style={{ flexDirection: 'row', gap: 12 * s, marginTop: 24 * s }}
            >
              {children}
            </View>
          </View>
        </View>
      ) : null,
    [visible, s, keyboard, tone, title, message, children],
  );
  useEffect(() => {
    if (Platform.OS === 'web') {
      host(node);
      return () => host(null);
    }
  }, [host, node]);
  return Platform.OS === 'web' ? null : (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (dismissible) onDismiss();
      }}
    >
      {node}
    </Modal>
  );
}
