import {HN_UI} from '../../theme/uiKitV3';
import {SCANNER_ARIAL_FAMILY} from '../../theme/scannerTypography';
import { P04Text as Text } from './P04Text';
// Native rendering of ScannerHNApp/docs/flows/inbound. Business state stays in the owner.
import React, { useRef, useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Keyboard,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AppIconName } from '../../ui/AppIcon';
import { P04Icon as AppIcon } from './P04Icon';
import { Button } from '../../ui/Button';
import { HN_OPERATIONS } from '../../ui/hnHomeTokens';
import {SCANNER_COLORS} from '../../ui/ScannerPalette';
import {P04AssetContext,useP04AssetTheme,P04_ASSET,p04Asset} from './P04AssetTheme';
import {
  KeyboardViewportContext,
  type KeyboardViewportTarget,
} from '../../ui/Page';

export const p04 = StyleSheet.create({
  screen: { flex: 1, backgroundColor: HN_UI.primary },
  header: {
    height: 63,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 9,
    paddingHorizontal: 12,
    gap: 14,
  },
  back: {
    width: 36,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: HN_UI.onBrand,
    fontSize: 22,
    lineHeight: 32,
    fontWeight: '700',
  },
  step: { color: HN_UI.onBrand, fontSize: 16, lineHeight: 32, paddingRight: 8 },
  sheet: {
    flex: 1,
    minHeight: 0,
    marginTop: -14,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: HN_UI.canvas,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  content: { gap: 12, paddingBottom: 12 },
  footer: {
    gap: 10,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: HN_UI.canvas,
  },
  primary: { minHeight: 57, borderRadius: 10, backgroundColor: SCANNER_COLORS.primary },
  secondary: {
    minHeight: 57,
    borderRadius: 10,
    borderColor: HN_UI.border,
    backgroundColor: 'transparent',
  },
  heading: {
    backgroundColor: HN_UI.canvas,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 3,
  },
  h2: { color: HN_UI.textPrimary, fontSize: 18, lineHeight: 24, fontWeight: '700' },
  hint: { color: HN_UI.textSecondary, fontSize: 13, lineHeight: 21 },
  label: { color: HN_UI.textPrimary, fontSize: 14, lineHeight: 20, marginBottom: 4 },
  required: { color: HN_UI.danger },
  field: { gap: 4 },
  control: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: HN_UI.borderControl,
    borderRadius: 8,
    backgroundColor: HN_UI.surface,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  value: {
    flex: 1,
    minWidth: 0,
    color: HN_UI.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
  },
  locked: { backgroundColor: HN_UI.canvas },
  info: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: HN_UI.border,
    backgroundColor: HN_UI.canvas,
  },
  infoBody: { flex: 1, gap: 4 },
  infoActions: { alignSelf: 'stretch', gap: 8, marginTop: 8 },
  infoTitle: {
    color: HN_UI.textSecondary,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  text: { color: HN_UI.textSecondary, fontSize: 14, lineHeight: 22 },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 12,
  },
  progressItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  progressDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HN_UI.canvas,
  },
  progressText: { fontSize: 12, color: HN_UI.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 8,
    paddingHorizontal: 8,
    minHeight: 53,
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 8,
    backgroundColor: HN_UI.surface,
  },
  tile: {
    width: 43,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: HN_UI.canvas,
  },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  small: { fontSize: 13, lineHeight: 19, color: HN_UI.textSecondary },
  rowValue: {
    fontSize: 14,
    lineHeight: 20,
    color: HN_UI.textPrimary,
    fontWeight: '600',
  },
});
export function P04Frame({
  step,
  onBack,
  children,
  footer,
  title = 'Nhập kho',
  initialScrollY = 0,
  onScrollPositionChange,
  contentStyle,
  stepLabels = ['Thông tin', 'Quét mã', 'Kiểm tra'],
  revealWithinScroll = false,
  onContentViewport,
  headerRight,
  appearance = 'business',
  assetPack = false,
}: {
  step?: 1 | 2 | 3;
  onBack?: () => void;
  children: ReactNode;
  footer: ReactNode;
  title?: string;
  initialScrollY?: number;
  onScrollPositionChange?: (y: number) => void;
  contentStyle?: StyleProp<ViewStyle>;
  stepLabels?: readonly [string, string, string];
  revealWithinScroll?: boolean;
  onContentViewport?: (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
  headerRight?:ReactNode;
  appearance?: 'business' | 'attachment' | 'outbound-result';
  assetPack?: boolean;
}) {
  const inbound = title === 'Nhập kho' || title === 'Xuất kho';
  const inboundVisual = inbound || title === 'Đã gửi phiếu';
  const [frameSize, setFrameSize] = useState(Dimensions.get('window'));
  const narrow = frameSize.width < 430;
  const progressLabels = inbound
    ? ['Thông tin', 'Thêm sản phẩm', 'Kiểm tra']
    : stepLabels;
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const pendingRestore = useRef(
    initialScrollY > 0 ? initialScrollY : undefined,
  );
  const offset = useRef(initialScrollY),
    keyboardTop = useRef(Dimensions.get('window').height),
    focusedInput = useRef<KeyboardViewportTarget | null>(null);
  const reveal = useCallback(
    (input: KeyboardViewportTarget | null) => {
      if (input) focusedInput.current = input;
      focusedInput.current?.measureInWindow((_x, y, _w, height) => {
        if (revealWithinScroll && scroll.current) {
          scroll.current.measureInWindow((_sx, sy, _sw, sh) => {
            const bottom = Math.min(sy + sh, keyboardTop.current) - 20;
            const delta =
              y < sy + 12
                ? y - sy - 12
                : y + height > bottom
                ? y + height - bottom
                : 0;
            if (delta)
              scroll.current?.scrollTo({
                y: Math.max(0, offset.current + delta),
                animated: true,
              });
          });
          return;
        }
        const overlap = y + height + 20 - keyboardTop.current;
        if (overlap > 0)
          scroll.current?.scrollTo({
            y: offset.current + overlap,
            animated: true,
          });
      });
    },
    [revealWithinScroll],
  );
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', event => {
      keyboardTop.current = event.endCoordinates.screenY;
      reveal(null);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = Dimensions.get('window').height;
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [reveal]);
  return (
    <P04AssetContext.Provider value={assetPack}><SafeAreaView testID={inbound && step ? `P04.S0${step}` : undefined} edges={['top', 'bottom']} style={[p04.screen, inboundVisual && { backgroundImage: `linear-gradient(110deg,${HN_UI.shell},${HN_UI.shell})` }]}
      onLayout={event => {
        const layout = event.nativeEvent.layout;
        setFrameSize(current => layout.width === current.width && layout.height === current.height ? current : { ...current, ...layout });
      }}>
      <View testID={inboundVisual ? 'P04.header' : undefined} style={[p04.header, inboundVisual && { height: 67, paddingRight: 20, alignItems: 'center', paddingTop: 0, paddingBottom: 14 },appearance==='attachment'&&{height:76,paddingHorizontal:20},appearance==='outbound-result'&&{height:72}]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          onPress={onBack}
          disabled={!onBack}
          style={[p04.back, inboundVisual && { width: 44, height: 44 }]}
        >
            <AppIcon name={inbound ? 'arrow-left' : 'chevron-left'} size={24} color={HN_UI.onBrand} />
        </Pressable>
        <Text accessibilityRole="header" style={[p04.title,appearance==='attachment'&&{fontSize:23,lineHeight:31}]}>
          {title}
        </Text>
        {headerRight ?? (step && <Text style={p04.step}>Bước {step}/3</Text>)}
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[p04.sheet, inboundVisual && { backgroundImage: `linear-gradient(130deg,${HN_UI.surface},${HN_UI.surface})` }]}
      >
          {step && (
          <View
            accessibilityLabel={`Tiến độ ${title.toLowerCase()}, bước ${step} trên 3`}
            style={[p04.progress, inbound && {
              justifyContent: 'space-between', gap: 8,
              paddingTop: 10, paddingBottom: 12, paddingHorizontal: narrow ? 6 : 20,
              borderBottomWidth: 1,
              borderBottomColor: HN_UI.border, backgroundColor: HN_UI.surface,
            }]}
          >
            {progressLabels.map((name, i) => (
              <View key={name} style={inbound ? {
                flexDirection: 'row', alignItems: 'center', gap: 6,
                flexGrow: narrow ? 1 : 0, flexShrink: narrow ? 1 : 0,
                flexBasis: 'auto', minWidth: 0,
              } : p04.progressItem}>
                <View
                  style={[
                    p04.progressDot,
                    i + 1 <= step && { backgroundColor: HN_UI.primary },
                    inbound && {
                      width: 22, height: 22, borderRadius: 11,
                      borderWidth: 1,
                      borderColor: i + 1 === step ? HN_UI.textLink : i + 1 < step ? HN_UI.selected : HN_UI.selected,
                      backgroundColor: i + 1 === step ? HN_UI.textLink : i + 1 < step ? HN_UI.selected : HN_UI.selected,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color: inbound ? i + 1 === step ? HN_UI.onBrand : i + 1 < step ? HN_UI.textLink : HN_UI.textMuted : i + 1 <= step ? HN_UI.onBrand : HN_UI.textSecondary,
                    }}
                  >
                    {i + 1 < step ? '✓' : i + 1}
                  </Text>
                </View>
                <Text style={[p04.progressText, inbound && { fontSize: narrow ? 13 : 14, lineHeight: 20, flexShrink: 1, fontWeight: i + 1 === step ? '600' : '400', color: i + 1 === step ? HN_UI.textLink : HN_UI.textMuted }]}>{name}</Text>
              </View>
            ))}
          </View>
        )}
        <KeyboardViewportContext.Provider value={reveal}>
          <ScrollView
            ref={scroll}
            style={[{ flex: 1 }, Platform.OS === 'web' && ({ scrollbarWidth: 'thin', scrollbarColor: `${HN_UI.border} transparent` } as ViewStyle)]}
            onLayout={() => {
              if (onContentViewport)
                scroll.current?.measureInWindow((x, y, width, height) =>
                  onContentViewport({ x, y, width, height }),
                );
            }}
            contentContainerStyle={[p04.content, contentStyle]}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            onContentSizeChange={() => {
              if (pendingRestore.current !== undefined) {
                const target = pendingRestore.current;
                requestAnimationFrame(() =>
                  scroll.current?.scrollTo({ y: target, animated: false }),
                );
              }
            }}
            scrollEventThrottle={64}
            onScroll={event => {
              const y = event.nativeEvent.contentOffset.y;
              offset.current = y;
              if (pendingRestore.current !== undefined) {
                if (Math.abs(y - pendingRestore.current) > 1) return;
                pendingRestore.current = undefined;
              }
              onScrollPositionChange?.(y);
            }}
          >
            {children}
          </ScrollView>
        </KeyboardViewportContext.Provider>
        <View style={[p04.footer, inboundVisual && { paddingBottom: frameSize.height >= 847 ? 27 : 16 }, title === 'Đã gửi phiếu' && { marginBottom: 24 },appearance==='outbound-result'&&{paddingHorizontal:6,paddingBottom:21,marginBottom:0}]}>{footer}</View>
      </KeyboardAvoidingView>
    </SafeAreaView></P04AssetContext.Provider>
  );
}
export function P04Action({
  label,
  onPress,
  secondary = false,
  disabled = false,
  loading = false,
  compact = false,
  style,
  trailing,
  leading,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  trailing?: ReactNode;
  leading?: ReactNode;
  accessibilityLabel?: string;
}) {
  const assetPack=useP04AssetTheme();
  return (
    <Button
      label={label}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      variant={secondary ? 'secondary' : 'primary'}
      disabled={disabled}
      loading={loading}
      trailing={trailing}
      leading={leading}
      labelStyle={{
        fontSize: compact ? 14 : 17,
        fontFamily: SCANNER_ARIAL_FAMILY,
        lineHeight: compact ? 19 : 23,
        color: secondary ? assetPack ? P04_ASSET.primary : HN_UI.textPrimary : HN_UI.onBrand,
        textAlign: 'center',
        flexShrink: 1,
      }}
      style={[secondary ? p04.secondary : p04.primary, { paddingHorizontal: 10, paddingVertical: 10, ...(!secondary ? { backgroundImage: 'none' } : {}) }, assetPack && (secondary?p04Asset.secondary:p04Asset.primary),style]}
    />
  );
}
export function P04Heading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View style={p04.heading}>
      <Text style={p04.h2}>{title}</Text>
      <Text style={p04.hint}>{subtitle}</Text>
    </View>
  );
}
export function P04Info({
  title,
  children,
  actions,
}: {
  title: string;
  children?: ReactNode;
  /** Controls are sibling views, never inline descendants of body Text. */
  actions?: ReactNode;
}) {
  const assetPack=useP04AssetTheme();
  return (
    <View style={p04.info}>
      <AppIcon name="info" assetPack={assetPack} size={assetPack?20:23} color={assetPack?P04_ASSET.metadataInk:HN_UI.textLink} />
      <View style={p04.infoBody}>
        <Text style={p04.infoTitle}>{title}</Text>
        <Text style={p04.text}>{children}</Text>
        {actions && (
          <View testID="p04-info-actions" style={p04.infoActions}>
            {actions}
          </View>
        )}
      </View>
    </View>
  );
}
export function P04Row({
  label,
  value,
  icon = 'document',
  trailing,
  tone,
}: {
  label: string;
  value: string;
  icon?: AppIconName;
  trailing?: ReactNode;
  /** Explicit semantic palette; omitted callers retain their existing style. */
  tone?: keyof typeof HN_OPERATIONS;
}) {
  const palette = tone ? HN_OPERATIONS[tone] : undefined;
  const assetPack=useP04AssetTheme();
  return (
    <View style={[p04.row,assetPack&&p04Asset.metadataRow]}>
      <View style={[p04.tile, palette && { backgroundColor: palette.soft },assetPack&&p04Asset.metadataTile]}>
        <AppIcon name={icon} assetPack={assetPack} color={assetPack?P04_ASSET.metadataInk:palette?.ink ?? HN_UI.textLink} size={assetPack?20:24} />
      </View>
      <View style={p04.rowBody}>
        <Text style={p04.small}>{label}</Text>
        <Text selectable style={p04.rowValue}>
          {value}
        </Text>
      </View>
      {trailing}
    </View>
  );
}

