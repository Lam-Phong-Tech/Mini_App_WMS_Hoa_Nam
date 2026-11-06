import {UI_KIT_COLORS} from '../../theme/uiKitV3';
import {HN_UI} from '../../theme/uiKitV3';
import {ScannerNativeText as Text} from '../../ui/ScannerNativeText';
import {SCANNER_ARIAL_FAMILY} from '../../theme/scannerTypography';
/** P03 surface: scanner-dialogs r08 + priority-touch/readable rules + TC19 S01.
 * No business state or API fallback lives in this presentation component.
 */
import React, { useEffect, useRef, useState } from 'react';
import {Modal, Platform, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { BottomNav } from '../../ui/BottomNav';
import { HnHomeIcon, type HnHomeIconName } from '../../ui/HnHomeIcon';
import { homeScale, HN_OPERATIONS } from '../../ui/hnHomeTokens';
import {Dialog} from '../../ui/Dialog';
import {Button} from '../../ui/Button';
import {SCANNER_COLORS} from '../../ui/ScannerPalette';

export type P03Panel = 'S01' | 'S02' | 'S03' | 'S04';
export type P03Choice = 'inbound' | 'outbound' | 'warranty' | 'lookup';
export type P03Action = {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'neutral' | 'danger' | 'danger-outline' | 'text';
  disabled?: boolean;
};
export const P03_COPY = {
  S01: ['Chọn tác vụ quét', 'Mã sẽ được kiểm tra theo nghiệp vụ bạn chọn.'],
  S02: [
    'Bạn đang có phiếu chưa hoàn tất',
    'Các dữ liệu đã quét sẽ được giữ nếu bạn tiếp tục phiếu hiện tại. Bạn có thể tiếp tục, lưu nháp hoặc bỏ phiếu.',
  ],
  S03: [
    'Kho tạm dừng',
    'Các thao tác trong kho đang tạm dừng.\nLiên hệ quản trị viên.',
  ],
  S04: [
    'Xác nhận bỏ phiếu',
    'Dữ liệu chưa lưu sẽ bị xóa.\nBạn có chắc chắn muốn bỏ phiếu này?',
  ],
} as const;
const operations: readonly {
  key: P03Choice;
  icon: HnHomeIconName;
  title: string;
  description: string;
}[] = [
  {
    key: 'inbound',
    icon: 'box',
    title: 'Nhập kho',
    description: 'Nhận hàng và kiểm đếm vào kho',
  },
  {
    key: 'outbound',
    icon: 'up',
    title: 'Xuất kho',
    description: 'Soạn hàng theo yêu cầu xuất',
  },
  {
    key: 'warranty',
    icon: 'tool',
    title: 'Bảo hành',
    description: 'Quét máy để tra cứu hoặc tiếp nhận bảo hành',
  },
  {
    key: 'lookup',
    icon: 'document',
    title: 'Tra cứu sản phẩm',
    description: 'Xem tồn kho, lịch sử và bảo hành',
  },
];
// User reference03/11: the same semantic operation palette as Home.
const pickerPalette: Record<P03Choice, { soft: string; ink: string }> = {
  inbound: HN_OPERATIONS.inbound,
  outbound: HN_OPERATIONS.outbound,
  warranty: HN_OPERATIONS.warranty,
  lookup: HN_OPERATIONS.lookup,
};
const paths = {
  hand: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  alert:
    '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
};
function Icon({
  name,
  size,
  color,
  stroke = 2,
}: {
  name: keyof typeof paths;
  size: number;
  color: string;
  stroke?: number;
}) {
  return (
    <SvgXml
      accessible={false}
      width={size}
      height={size}
      xml={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`}
    />
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: HN_UI.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: HN_UI.shell,
    flexShrink: 0,
  },
  back: { alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: HN_UI.onBrand, fontWeight: '600' },
  body: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    position: 'relative',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: UI_KIT_COLORS['overlay.scrim'],
    borderRadius: 0,
  },
  pickerBackdrop: { backgroundColor: HN_UI.canvas },
  host: { flexShrink: 1, minHeight: 0 },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '100%',
    backgroundColor: HN_UI.surface,
  },
  modal: { backgroundColor: HN_UI.surfaceRaised, flexShrink: 1 },
  title: { color: HN_UI.textLink, fontWeight: '600' },
  description: { color: HN_UI.textLink },
  center: { textAlign: 'center' },
  font: {
    fontFamily: SCANNER_ARIAL_FAMILY,
    includeFontPadding: false,
  },
  grip: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: HN_UI.surfaceSunken,
  },
  close: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHeading: { flexDirection: 'row', alignItems: 'center' },
  headingCopy: { flex: 1, minWidth: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: HN_UI.border,
    backgroundColor: HN_UI.surface,
  },
  tile: { alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0 },
  emblem: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: { alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { fontWeight: '600', textAlign: 'center' },
  footer: { backgroundColor: HN_UI.surface, flexShrink: 0 },
});
const colors = {
  primary: {
    backgroundColor: SCANNER_COLORS.primary,
    borderColor: SCANNER_COLORS.primary,
    color: HN_UI.onBrand,
  },
  neutral: {
    backgroundColor: SCANNER_COLORS.secondary,
    borderColor: SCANNER_COLORS.secondaryBorder,
    color: SCANNER_COLORS.primary,
  },
  danger: { backgroundColor: HN_UI.danger, borderColor: HN_UI.danger, color: HN_UI.onBrand },
  'danger-outline': {
    backgroundColor: HN_UI.dangerSoft,
    borderColor: HN_UI.danger,
    color: HN_UI.danger,
  },
  text: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    color: HN_UI.textLink,
  },
};
export interface P03SurfaceProps {
  panel: P03Panel;
  actions?: readonly P03Action[];
  onChoose?: (choice: P03Choice) => void;
  disabledChoices?: readonly P03Choice[];
  onBack: () => void;
  busy?: boolean;
  message?: string;
  serverLinked?: boolean;
  footer?: React.ReactNode;
}
export function P03Surface({
  panel,
  actions = [],
  onChoose,
  disabledChoices = [],
  onBack,
  busy = false,
  message,
  footer,
}: P03SurfaceProps) {
  const [contactOpen,setContactOpen]=useState(false);
  useEffect(()=>setContactOpen(false),[panel]);
  const visibleActions:readonly P03Action[]=panel==='S03'&&!actions.some(a=>a.label==='Liên hệ quản trị')
    ? [...actions,{label:'Liên hệ quản trị',kind:'neutral' as const,onPress:()=>setContactOpen(true)}]
    : actions;
  // Only the S01 picker follows the mobile Note proportions. Keep existing
  // S02–S04 confirmation geometry and destructive-action containment intact.
  const [width, setWidth] = useState(494),
    scale =
      panel === 'S01'
        ? Math.min(1, Math.max(1, width) / 390)
        : homeScale(width),
    px = (n: number) => n * scale;
  const sheet = panel === 'S01',
    unfinished = panel === 'S02',
    trap = panel === 'S04';
  // priority-touch.css reserves actual layout space; it does not overlay a
  // larger hitSlop on the heading or neighbouring operation controls.
  const touchSize = Math.max(44, px(44)),
    headerHeight = Math.max(px(47), touchSize);
  const [focusedControl, setFocusedControl] = useState<string>();
  const focusEvents = (key: string) =>
    Platform.OS === 'web'
      ? {
          onFocus: (event: { currentTarget?: unknown }) => {
            const target = event.currentTarget as
              | { matches?: (selector: string) => boolean }
              | undefined;
            setFocusedControl(
              target?.matches?.(':focus-visible') === false ? undefined : key,
            );
          },
          onBlur: () =>
            setFocusedControl(current =>
              current === key ? undefined : current,
            ),
        }
      : {};
  const focusStyle = (key: string) =>
    Platform.OS === 'web'
      ? {
          outlineStyle: 'solid' as const,
          outlineColor: HN_UI.focus,
          outlineOffset: 3,
          outlineWidth: focusedControl === key ? 2 : 0,
        }
      : undefined;
  const initialControl = sheet
    ? operations.find(op => !busy && !disabledChoices.includes(op.key))?.key
    : visibleActions.find(action => !busy && !action.disabled)?.label;
  const focus = useRef<React.ComponentRef<typeof Pressable>>(null);
  const initiallyFocusedPanel = useRef<P03Panel | undefined>(undefined);
  useEffect(() => {
    // Native accessibility traversal is restricted for the confirmation. Web
    // Modal handles containment; start with the safe action, never discard.
    if (
      Platform.OS === 'web' &&
      initialControl !== undefined &&
      initiallyFocusedPanel.current !== panel
    ) {
      (focus.current as unknown as { focus?: () => void })?.focus?.();
      initiallyFocusedPanel.current = panel;
    }
  }, [panel, initialControl]);
  // S04 là xác nhận hủy: nội dung phải luôn là bản chuẩn, không để message
  // trạng thái của luồng lấn át lời xác nhận.
  const description =
    panel === 'S04' ? P03_COPY.S04[1] : (message ?? P03_COPY[panel][1]);
  const heading = (
    <Text
      accessibilityRole="header"
      style={[
        styles.font,
        styles.title,
        !sheet && styles.center,
        {
          fontSize: px(sheet || unfinished ? 20 : 21),
          lineHeight: px(sheet ? 26 : unfinished ? 25 : 26),
          letterSpacing: sheet ? 0 : px(-0.55),
          marginTop: px(sheet ? 0 : unfinished ? 11 : 12),
          marginBottom: px(sheet ? 3 : 6),
        },
      ]}
    >
      {P03_COPY[panel][0]}
    </Text>
  );
  const descriptionText = (
    <Text
      accessibilityLiveRegion="polite"
      style={[
        styles.font,
        styles.description,
        !sheet && styles.center,
        {
          color: trap ? HN_UI.textLink : HN_UI.textLink,
          fontSize: px(sheet ? 14 : unfinished ? 16 : 17),
          // shared/readable-text.css overrides the old21/24px modal leading.
          lineHeight: px(sheet ? 20 : (unfinished ? 16 : 17) * 1.5),
        },
      ]}
    >
      {description}
    </Text>
  );
  return (
    <SafeAreaView
      edges={['top']}
      testID={`P03.${panel}`}
      style={styles.root}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
    >
      <View
        testID="p03-header"
        pointerEvents={trap || busy ? 'none' : 'auto'}
        accessibilityElementsHidden={trap}
        importantForAccessibility={trap ? 'no-hide-descendants' : 'auto'}
        style={[
          styles.header,
          { height: headerHeight, paddingHorizontal: px(18), gap: px(23) },
        ]}
      >
        <SvgXml
          accessible={false}
          // Native SVG percentage width resolves against the padded content
          // box. Use the measured outer width to avoid the right-hand stripe.
          width={width}
          height={headerHeight}
          style={StyleSheet.absoluteFill}
          xml={
            `<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="h"><stop stop-color="${HN_UI.shell}"/><stop offset="1" stop-color="${HN_UI.shell}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#h)"/></svg>`
          }
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          disabled={trap || busy || panel === 'S03'}
          onPress={onBack}
          {...focusEvents('back')}
          style={[
            styles.back,
            {
              width: touchSize,
              height: touchSize,
              opacity: panel === 'S03' ? 0.6 : 1,
            },
            focusStyle('back'),
          ]}
        >
          <Icon name="back" size={px(29)} color={HN_UI.onBrand} />
        </Pressable>
        <Text
          style={[
            styles.font,
            styles.headerTitle,
            { fontSize: px(22), lineHeight: px(28), paddingTop: px(5) },
          ]}
        >
          Quét mã
        </Text>
      </View>
      <View
        testID="p03-stage"
        style={[
          styles.body,
          sheet && {
            borderTopLeftRadius: px(17),
            borderTopRightRadius: px(17),
            overflow: 'hidden',
          },
        ]}
      >
        {/* Decorative, non-dismissible sibling. It never owns navigation. */}
        <View
          testID="p03-backdrop"
          style={[styles.backdrop, trap && styles.pickerBackdrop]}
          onStartShouldSetResponder={() => true}
          onResponderRelease={() => undefined}
        />
        <View
          testID={sheet ? 'p03-sheet' : 'p03-confirmation'}
          accessibilityViewIsModal={trap}
          style={
            sheet
              ? [
                  styles.sheet,
                  { borderTopLeftRadius: px(17), borderTopRightRadius: px(17) },
                ]
              : [
                  styles.host,
                  {
                    marginHorizontal: px(8),
                    marginTop: px(16),
                    marginBottom: px(32),
                  },
                ]
          }
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={
              !sheet ? [styles.modal, { borderRadius: px(14) }] : undefined
            }
            contentContainerStyle={{
              paddingHorizontal: px(20),
              paddingTop: px(sheet ? 33 : unfinished ? 12 : 20),
              paddingBottom: px(sheet ? 32 : unfinished ? 13 : 20),
            }}
          >
            {sheet ? (
              <>
                <View
                  style={[
                    styles.grip,
                    {
                      top: px(10),
                      width: px(48),
                      height: px(5),
                      borderRadius: px(5),
                    },
                  ]}
                />
                <View
                  testID="p03-sheet-heading"
                  style={[styles.sheetHeading, { gap: px(10) }]}
                >
                  <View style={styles.headingCopy}>
                    {heading}
                    {descriptionText}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Đóng chọn tác vụ quét"
                    disabled={busy}
                    onPress={onBack}
                    {...focusEvents('close')}
                    style={[
                      styles.close,
                      { width: touchSize, height: touchSize },
                      focusStyle('close'),
                    ]}
                  >
                    <Icon name="x" size={px(20)} color={HN_UI.textLink} stroke={1.5} />
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View
                  style={[
                    styles.emblem,
                    {
                      width: px(unfinished ? 57 : 76),
                      height: px(unfinished ? 57 : 76),
                      borderRadius: px(38),
                      backgroundColor: unfinished ? HN_UI.warningSoft : HN_UI.dangerSoft,
                    },
                  ]}
                >
                  <Icon
                    name={
                      unfinished ? 'alert' : panel === 'S03' ? 'hand' : 'trash'
                    }
                    size={px(unfinished ? 44 : 36)}
                    color={unfinished ? HN_UI.warning : HN_UI.danger}
                    stroke={unfinished ? 1.7 : 2}
                  />
                </View>
                {heading}
                {descriptionText}
              </>
            )}
            {sheet ? (
              <View style={{ gap: px(7), marginTop: px(13) }}>
                {operations.map(op => {
                  const palette = pickerPalette[op.key],
                    disabled = busy || disabledChoices.includes(op.key);
                  return (
                    <Pressable
                      key={op.key}
                      ref={op.key === initialControl ? focus : undefined}
                      testID={`p03-choice-${op.key}`}
                      accessibilityRole="button"
                      accessibilityLabel={op.title}
                      accessibilityState={{ disabled }}
                      disabled={disabled}
                      onPress={() => {
                        if (!disabled) onChoose?.(op.key);
                      }}
                      {...focusEvents(op.key)}
                      style={[
                        styles.row,
                        {
                          gap: px(18),
                          minHeight: px(65),
                          borderWidth: px(1),
                          borderRadius: px(10),
                          paddingVertical: px(6),
                          paddingHorizontal: px(8),
                          opacity: 1,
                          ...(disabled?{backgroundColor:HN_UI.disabled,borderColor:HN_UI.border}:{}),
                        },
                        focusStyle(op.key),
                      ]}
                    >
                      <View
                        style={[
                          styles.tile,
                          {
                            width: px(50),
                            height: px(50),
                            borderRadius: px(11),
                            backgroundColor: disabled?HN_UI.disabled:palette.soft,
                          },
                        ]}
                      >
                        {op.key === 'lookup' ? (
                          <Icon
                            name="search"
                            size={px(32)}
                            color={disabled?HN_UI.disabledForeground:palette.ink}
                            stroke={2}
                          />
                        ) : (
                          <HnHomeIcon
                            name={op.icon}
                            size={px(32)}
                            color={disabled?HN_UI.disabledForeground:palette.ink}
                            strokeWidth={2}
                          />
                        )}
                      </View>
                      <View style={styles.rowBody}>
                        <Text
                          style={[
                            styles.font,
                            styles.title,
                            {
                              fontSize: px(17),
                              lineHeight: px(22),
                              letterSpacing: px(-0.45),
                              ...(disabled?{color:HN_UI.disabledForeground}:{}),
                            },
                          ]}
                        >
                          {op.title}
                        </Text>
                        <Text
                          style={[
                            styles.font,
                            styles.description,
                            {
                              fontSize: px(13),
                              lineHeight: px(18),
                              letterSpacing: px(-0.35),
                              marginTop: px(1),
                              color: disabled?HN_UI.disabledForeground:HN_UI.textSecondary,
                            },
                          ]}
                        >
                          {op.description}
                        </Text>
                      </View>
                      <HnHomeIcon
                        name="chevron"
                        size={px(15)}
                        color={disabled?HN_UI.disabledForeground:HN_UI.textLink}
                        strokeWidth={2}
                      />
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View
                style={{
                  gap: px(unfinished ? 7 : trap ? 10 : 9),
                  marginTop: px(unfinished ? 14 : trap ? 21 : 20),
                }}
              >
                {visibleActions.map(action => {
                  const palette = colors[action.kind ?? 'neutral'],
                    disabled = busy || !!action.disabled;
                  return (
                    <Pressable
                      key={action.label}
                      ref={action.label === initialControl ? focus : undefined}
                      accessibilityRole="button"
                      accessibilityLabel={action.label}
                      disabled={disabled}
                      accessibilityState={{ disabled, busy }}
                      onPress={() => {
                        if (!disabled) action.onPress();
                      }}
                      {...focusEvents(action.label)}
                      style={[
                        styles.button,
                        {
                          minHeight: Math.max(44, px(unfinished ? 48 : 49)),
                          borderWidth: action.kind === 'text' ? 0 : px(1),
                          borderRadius: px(8),
                          paddingVertical: px(unfinished ? 9 : 10),
                          paddingHorizontal: px(unfinished ? 9 : 12),
                          backgroundColor: disabled?HN_UI.disabled:palette.backgroundColor,
                          borderColor: disabled?HN_UI.border:palette.borderColor,
                          opacity: 1,
                        },
                        focusStyle(action.label),
                      ]}
                    >
                      <Text
                        style={[
                          styles.font,
                          styles.buttonLabel,
                          {
                            fontSize: px(18),
                            lineHeight: px(23),
                            color: disabled?HN_UI.disabledForeground:palette.color,
                          },
                        ]}
                      >
                        {action.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {sheet && actions.length > 0 ? (
              <View style={{ gap: px(8), marginTop: px(12) }}>
                {actions.map(action => (
                  <Pressable
                    key={action.label}
                    accessibilityRole="button"
                    accessibilityLabel={action.label}
                    disabled={busy || action.disabled}
                    onPress={() => {
                      if (!busy && !action.disabled) action.onPress();
                    }}
                    {...focusEvents(action.label)}
                    style={[
                      styles.button,
                      { minHeight: touchSize },
                      focusStyle(action.label),
                    ]}
                  >
                    <Text
                      style={[
                        styles.buttonLabel,
                        { color: HN_UI.textLink, fontSize: px(16) },
                      ]}
                    >
                      {action.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
      {footer && (
        <View
          pointerEvents={trap || busy ? 'none' : 'auto'}
          accessibilityElementsHidden={trap}
          importantForAccessibility={trap ? 'no-hide-descendants' : 'auto'}
          style={styles.footer}
        >
          {footer}
        </View>
      )}
      <Dialog visible={contactOpen&&panel==='S03'} title="Liên hệ quản trị" onDismiss={()=>setContactOpen(false)}
        footer={<Button label="Đóng" onPress={()=>setContactOpen(false)}/>}>
        <Text style={[styles.font,styles.description]}>Liên hệ quản trị kho để kiểm tra trạng thái hoạt động và quyền tài khoản. Ứng dụng chưa có số điện thoại hoặc email quản trị được cấu hình.</Text>
      </Dialog>
    </SafeAreaView>
  );
}
export function P03Dialog({
  visible,
  onSelectTab,
  activeKey = 'scan',
  ...props
}: P03SurfaceProps & {
  visible: boolean;
  onSelectTab?: (key: string) => void;
  activeKey?: string;
}) {
  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="none"
      onRequestClose={() => {
        if (!props.busy && props.panel !== 'S03') props.onBack();
      }}
    >
      <P03Surface
        {...props}
        footer={
          <BottomNav
            activeKey={activeKey}
            disabled={props.busy || props.panel === 'S04'}
            onSelect={key => {
              if (!props.busy && props.panel !== 'S04') onSelectTab?.(key);
            }}
          />
        }
      />
    </Modal>
  );
}
