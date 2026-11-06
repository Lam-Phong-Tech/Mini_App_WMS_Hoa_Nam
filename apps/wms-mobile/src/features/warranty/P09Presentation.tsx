import {HN_UI} from '../../theme/uiKitV3';
import { ScannerNativeText as Text } from '../../ui/ScannerNativeText';
import {SCANNER_COLORS} from '../../ui/ScannerPalette';
import { SCANNER_ARIAL_FAMILY } from '../../theme/scannerTypography';
// Geometry from ScannerHNApp P09 r12 actual; S02 reuses P04/P05's compact header.
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { HnHomeIcon } from '../../ui/HnHomeIcon';
import { AppIcon } from '../../ui/AppIcon';
import { P04Icon } from '../inbound/P04Icon';
import { P04Frame } from '../inbound/P04Frame';
import { Button, type ButtonProps } from '../../ui/Button';
import { Dialog, type DialogProps } from '../../ui/Dialog';
import type { P09Case } from '../../services/wms/p09Warranty';
import { displayPii } from './warrantyPolicy';
import { colors } from '../../theme/tokens';
import { HN_OPERATIONS } from '../../ui/hnHomeTokens';
import { useTheme } from '../../theme/ThemeProvider';
import { p09Date } from './p09Date';

const FrameBounds = createContext<
  { left: number; top: number; width: number; height: number } | undefined
>(undefined);
export const P09FrameBounds = FrameBounds;
export function P09Dialog(props: DialogProps) {
  const bounds = useContext(FrameBounds);
  const { visible, dismissible, onDismiss } = props;
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const doc = (
      globalThis as unknown as {
        document?: {
          addEventListener: (
            type: string,
            listener: (e: {
              key: string;
              preventDefault: () => void;
              stopImmediatePropagation: () => void;
            }) => void,
            capture: boolean,
          ) => void;
          removeEventListener: (
            type: string,
            listener: (e: {
              key: string;
              preventDefault: () => void;
              stopImmediatePropagation: () => void;
            }) => void,
            capture: boolean,
          ) => void;
        };
      }
    ).document;
    const escape = (event: {
      key: string;
      preventDefault: () => void;
      stopImmediatePropagation: () => void;
    }) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (dismissible !== false) onDismiss();
    };
    doc?.addEventListener('keydown', escape, true);
    return () => doc?.removeEventListener('keydown', escape, true);
  }, [visible, dismissible, onDismiss]);

  return (
    <Dialog
      {...props}
      bounds={props.bounds ?? bounds}
      panelMaxWidth={
        props.panelMaxWidth ?? (props.placement === 'bottom' ? undefined : 450)
      }
      dismissOnBackdrop={false}
    />
  );
}

export const p09 = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: HN_UI.shell },
  header: {
    height: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    paddingBottom: 20,
    paddingHorizontal: 18,
  },
  back: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
    color: HN_UI.onBrand,
    flex: 1,
  },
  body: {
    flex: 1,
    minHeight: 0,
    marginTop: -12,
    backgroundColor: HN_UI.canvas,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 24,
    gap: 12,
  },
  footer: {
    flexShrink: 0,
    gap: 12,
    padding: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderColor: HN_UI.border,
    backgroundColor: HN_UI.surface,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  fill: { flex: 1, minWidth: 0 },
  card: {
    backgroundColor: HN_UI.surface,
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  heading: {
    color: HN_UI.textSecondary,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600',
  },
  text: {
    color: HN_UI.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: SCANNER_ARIAL_FAMILY,
  },
  small: {
    color: HN_UI.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: SCANNER_ARIAL_FAMILY,
  },
  label: { color: HN_UI.textMuted, fontSize: 13, lineHeight: 20 },
  divider: {
    borderBottomWidth: 1,
    borderColor: HN_UI.border,
    paddingVertical: 8,
  },
  tile: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HN_OPERATIONS.documents.soft,
  },
  photo: {
    width: 60,
    height: 64,
    borderRadius: 10,
    backgroundColor: HN_UI.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    flexShrink: 1,
  },
  badgeText: { fontSize: 12, lineHeight: 18 },
  tabs: {
    flexDirection: 'row',
    gap: 6,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    backgroundColor: HN_UI.canvas,
    borderBottomWidth: 2,
    borderColor: 'transparent',
  },
  tabActive: { backgroundColor: HN_UI.surface, borderBottomColor: HN_UI.border },
  count: {
    backgroundColor: HN_UI.canvas,
    borderRadius: 6,
    paddingHorizontal: 6,
    fontSize: 12,
    lineHeight: 22,
    color: HN_UI.textMuted,
  },
});

export function p09Status(status?: string): string {
  return (
    (
      {
        RECEIVED: 'Đã tiếp nhận',
        CHECKING: 'Đang kiểm tra',
        REPAIRING: 'Đang sửa',
        COMPLETED: 'Chờ bàn giao',
        RETURNED: 'Đã trả khách',
        CANCELLED: 'Đã hủy',
        ALL: 'Tất cả trạng thái',
      } as Record<string, string>
    )[status ?? ''] ?? 'Chưa xác minh'
  );
}
export { p09Date };
export function p09ActorName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  return name &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      name,
    )
    ? name
    : 'Chưa có dữ liệu người thực hiện';
}
export function P09Status({ status }: { status?: string }) {
  const tone =
    status === 'COMPLETED'
      ? [colors.warningSoft, colors.warningText]
      : ['RETURNED', 'CANCELLED'].includes(status ?? '')
      ? [colors.successSoft, HN_UI.textLink]
      : [HN_UI.selected, HN_UI.textLink];
  return (
    <View style={[p09.badge, { backgroundColor: tone[0] }]}>
      <Text style={[p09.badgeText, { color: tone[1] }]}>
        {p09Status(status)}
      </Text>
    </View>
  );
}
export function P09Photo({
  source,
  compact = false,
}: {
  source?: ImageSourcePropType;
  compact?: boolean;
}) {
  return (
    <View style={[p09.photo, compact && { width: 54, height: 62 }]}>
      {source ? (
        <Image
          source={source}
          resizeMode="contain"
          style={{ width: compact ? 54 : 60, height: compact ? 62 : 64 }}
          accessibilityLabel="Ảnh thiết bị"
        />
      ) : (
        <P04Icon name="box" color={HN_UI.textMuted} size={26} />
      )}
    </View>
  );
}
export function P09Tile({
  name,
  warranty = false,
  large = false,
}: {
  name: string;
  warranty?: boolean;
  large?: boolean;
}) {
  return (
    <View
      style={[
        p09.tile,
        large && { width: 44, height: 44, borderRadius: 12 },
        warranty && { backgroundColor: HN_UI.canvas },
      ]}
    >
      {name === 'check' ? (
        <AppIcon name="check-circle" size={20} color={HN_UI.success} />
      ) : name === 'clock' ? (
        <HnHomeIcon
          name="clock"
          size={20}
          color={HN_OPERATIONS.documents.ink}
          strokeWidth={2}
        />
      ) : (
        <P04Icon
          name={name}
          size={20}
          color={warranty ? HN_UI.textSecondary : HN_OPERATIONS.documents.ink}
        />
      )}
    </View>
  );
}
export function P09Action(props: ButtonProps) {
  const theme = useTheme();
  return (
    <Button
      {...props}
      style={[
        {
          minHeight: 54,
          borderRadius: 8,
          backgroundColor:
            props.variant === 'secondary'
              ? HN_UI.selected
              : props.variant === 'danger'
              ? colors.danger
              : SCANNER_COLORS.primary,
          borderColor: HN_UI.border,
        },
        props.style,
      ]}
      labelStyle={[
        {
          fontSize: 16,
          lineHeight: 23,
          fontWeight: '600',
          fontFamily:
            Platform.OS === 'web'
              ? theme.typography.fontFamily
              : SCANNER_ARIAL_FAMILY,
          textAlign: 'center',
          flexShrink: 1,
        },
        props.variant === 'secondary' && { color: HN_UI.textLink },
        props.labelStyle,
      ]}
    />
  );
}
export function P09Frame({
  panel,
  children,
  onBack,
  footer,
  headerRight,
  initialScrollY = 0,
  onScrollPositionChange,
  onEndReached,
  scrollKey,
}: {
  panel: 1 | 2 | 3 | 4;
  children: ReactNode;
  onBack?: () => void;
  footer?: ReactNode;
  headerRight?: ReactNode;
  initialScrollY?: number;
  onScrollPositionChange?: (y: number) => void;
  onEndReached?: () => void;
  scrollKey?: string;
}) {
  const surface = useRef<React.ComponentRef<typeof View>>(null),
    [bounds, setBounds] = React.useState<{
      left: number;
      top: number;
      width: number;
      height: number;
    }>();
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null),
    pending = useRef(initialScrollY > 0 ? initialScrollY : undefined);
  useEffect(() => {
    pending.current = initialScrollY > 0 ? initialScrollY : undefined;
    scroll.current?.scrollTo({ y: initialScrollY, animated: false });
    // Scroll positions are restored on navigation, not on each scroll notification.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, scrollKey]);
  if (panel === 2)
    return (
      <FrameBounds.Provider value={bounds}>
        <View
          ref={surface}
          testID="P09.S02"
          style={{ flex: 1, minHeight: 0 }}
          onLayout={() =>
            surface.current?.measureInWindow((left, top, width, height) =>
              setBounds({ left, top, width, height }),
            )
          }
        >
          <P04Frame
            title="Tiếp nhận bảo hành"
            headerRight={
              <Text style={{ color: HN_UI.onBrand, fontSize: 16, lineHeight: 32 }}>
                Bước 1/2
              </Text>
            }
            onBack={onBack}
            footer={footer}
            revealWithinScroll
            contentStyle={{ gap: 14 }}
          >
            {children}
          </P04Frame>
        </View>
      </FrameBounds.Provider>
    );
  return (
    <FrameBounds.Provider value={bounds}>
      <View
        ref={surface}
        style={{ flex: 1, minHeight: 0 }}
        onLayout={() =>
          surface.current?.measureInWindow((left, top, width, height) =>
            setBounds({ left, top, width, height }),
          )
        }
      >
        <SafeAreaView
          edges={['top', 'bottom']}
          style={p09.screen}
          testID={`P09.S0${panel}`}
        >
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <SvgXml
              width="100%"
              height="100%"
              xml={
                `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><defs><linearGradient id="p09-brand" x1="0" y1="0" x2="1" y2="0.5"><stop offset="0" stop-color="${HN_UI.shell}"/><stop offset="1" stop-color="${HN_UI.shell}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#p09-brand)"/></svg>`
              }
            />
          </View>
          <View style={p09.header}>
            {onBack && (
              <Pressable
                style={p09.back}
                accessibilityRole="button"
                accessibilityLabel="Quay lại"
                onPress={onBack}
                disabled={!onBack}
              >
                <P04Icon name="arrow-left" size={24} color={HN_UI.onBrand} />
              </Pressable>
            )}
            <Text
              style={p09.title}
              accessibilityRole="header"
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {panel === 1
                ? 'Bảo hành'
                : panel === 3
                ? 'Hồ sơ bảo hành'
                : 'Kết quả sửa chữa'}
            </Text>
            {headerRight}
          </View>
          <KeyboardAvoidingView
            style={p09.body}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              ref={scroll}
              style={{ flex: 1 }}
              contentContainerStyle={[
                p09.content,
                panel === 1 && { paddingTop: 16, gap: 14 },
              ]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              scrollEventThrottle={64}
              onContentSizeChange={() => {
                if (pending.current !== undefined)
                  scroll.current?.scrollTo({
                    y: pending.current,
                    animated: false,
                  });
              }}
              onScroll={e => {
                const { contentOffset, contentSize, layoutMeasurement } =
                  e.nativeEvent;
                const y = contentOffset.y;
                if (pending.current !== undefined) {
                  if (Math.abs(y - pending.current) > 1) return;
                  pending.current = undefined;
                }
                onScrollPositionChange?.(y);
                if (y + layoutMeasurement.height >= contentSize.height - 120)
                  onEndReached?.();
              }}
            >
              {children}
            </ScrollView>
            {footer && (
              <View
                style={
                  panel === 1
                    ? { flexShrink: 0 }
                    : [p09.footer, panel === 4 && { gap: 10 }]
                }
              >
                {footer}
              </View>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </FrameBounds.Provider>
  );
}
export function P09Card({
  title,
  children,
  style,
  icon,
  subtitle,
  headerDivider = true,
}: {
  title?: string;
  icon?: string;
  subtitle?: string;
  /** Intake sections use the open heading from the approved S02 form. */
  headerDivider?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[p09.card, { gap: 0 }, style]}>
      {title &&
        (icon ? (
          <View
            style={[
              p09.row,
              {
                paddingBottom: headerDivider ? 14 : 0,
                marginBottom: 16,
                borderBottomWidth: headerDivider ? 1 : 0,
                borderColor: HN_UI.border,
              },
            ]}
          >
            <P09Tile name={icon} warranty />
            <View style={p09.fill}>
              <Text style={[p09.heading, { fontSize: 17 }]}>{title}</Text>
              {subtitle && (
                <Text style={[p09.small, { fontSize: 13 }]}>{subtitle}</Text>
              )}
            </View>
          </View>
        ) : (
          <Text style={[p09.heading, { marginBottom: 12 }]}>{title}</Text>
        ))}
      {children}
    </View>
  );
}
export function P09Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={p09.heading}>
        {title}
      </Text>
      {children}
    </View>
  );
}
export function P09Value({
  label,
  value,
  long = false,
  icon,
  compact = false,
  inline = false,
  table = false,
}: {
  label: string;
  value?: string | null;
  long?: boolean;
  icon?: string;
  compact?: boolean;
  /** Keep long, readable values in the Note table's label/value columns. */
  inline?: boolean;
  /** Opt-in Note layout; shared P19 recovery rows retain their prior geometry. */
  table?: boolean;
}) {
  const [full, setFull] = React.useState(false),
    [truncated, setTruncated] = React.useState(false);
  const output = displayPii(value) ?? 'Chưa có dữ liệu';
  const stacked = long && !inline;
  return (
    <View
      style={[p09.divider, { paddingVertical: compact ? 6 : table ? 8 : 12 }]}
    >
      <View
        style={
          stacked
            ? { gap: table ? 6 : 10 }
            : { flexDirection: 'row', gap: 10, alignItems: 'flex-start' }
        }
      >
        <View
          style={
            stacked
              ? undefined
              : {
                  width: table
                    ? compact
                      ? '38%'
                      : '32%'
                    : compact
                    ? '36%'
                    : '28%',
                  flexDirection: 'row',
                  gap: 8,
                  alignItems: 'center',
                }
          }
        >
          {icon && <P09Tile name={icon} />}
          <Text
            style={[
              p09.label,
              !table && { fontSize: 14, lineHeight: 21 },
              !stacked && { flex: 1, minWidth: 0 },
              compact && {
                fontSize: table ? 13 : 16,
                lineHeight: table ? 20 : 24,
              },
            ]}
          >
            {label}
          </Text>
        </View>
        <View style={stacked ? undefined : p09.fill}>
          <Text
            selectable
            style={[p09.text, !table && { fontSize: 16, lineHeight: 24 }]}
            numberOfLines={long ? 3 : undefined}
            onTextLayout={e => {
              if (long && e.nativeEvent.lines.length > 3) setTruncated(true);
            }}
          >
            {output}
          </Text>
          {long &&
            (truncated ||
              output.length > 200 ||
              output.split('\n').length > 3) && (
              <P09Action
                label="Xem đầy đủ"
                variant="secondary"
                onPress={() => setFull(true)}
                style={{ marginTop: 8, minHeight: 44 }}
              />
            )}
        </View>
      </View>
      {full && (
        <P09Dialog
          visible
          title={label}
          onDismiss={() => setFull(false)}
          dismissOnBackdrop={false}
          footer={<P09Action label="Đóng" onPress={() => setFull(false)} />}
        >
          <Text
            selectable
            style={[p09.text, !table && { fontSize: 16, lineHeight: 24 }]}
          >
            {output}
          </Text>
        </P09Dialog>
      )}
    </View>
  );
}
export function P09Hero({
  row,
  image,
}: {
  row: P09Case;
  image?: ImageSourcePropType;
}) {
  return (
    <P09Card style={{ padding: 0, overflow: 'hidden', borderRadius: 14 }}>
      <View style={[p09.row, { padding: 12, alignItems: 'flex-start' }]}>
        <P09Photo source={image} />
        <View style={p09.fill}>
          <View style={p09.between}>
            <Text
              style={[p09.heading, p09.fill, { fontSize: 18, lineHeight: 24 }]}
            >
              {row.warranty_case_code ?? row.warranty_case_id}
            </Text>
            <P09Status status={row.status} />
          </View>
          <Text style={p09.text}>
            {row.sku_name ??
              displayPii(row.manual_product_description) ??
              'Sản phẩm chưa xác định'}
          </Text>
          <View style={[p09.row, { gap: 12, flexWrap: 'wrap' }]}>
            <Text style={p09.small}>
              Serial: {row.serial_number ?? 'Chưa có dữ liệu'}
            </Text>
          </View>
        </View>
      </View>
      <View
        style={[
          p09.row,
          {
            padding: 12,
            borderTopWidth: 1,
            borderColor: HN_UI.border,
            backgroundColor: HN_UI.canvas,
            alignItems: 'flex-start',
          },
        ]}
      >
        {[
          ['Ngày tiếp nhận', row.received_at ?? row.created_at, 'calendar'],
          ['Cập nhật gần nhất', row.updated_at, 'clock'],
        ].map(([label, value, name]) => (
          <View key={label} style={[p09.row, p09.fill, { gap: 8 }]}>
            <P09Tile name={name!} />
            <View style={p09.fill}>
              <Text style={[p09.small, { fontSize: 12, lineHeight: 18 }]}>
                {label}
              </Text>
              <Text style={[p09.text, { fontSize: 13, lineHeight: 20 }]}>
                {p09Date(value)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </P09Card>
  );
}
