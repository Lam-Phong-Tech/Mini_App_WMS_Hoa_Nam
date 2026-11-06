import {HN_UI} from '../../theme/uiKitV3';
import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { Text } from '../../ui/Text';
import {SCANNER_COLORS} from '../../ui/ScannerPalette';
import { HnHomeIcon, type HnHomeIconName } from '../../ui/HnHomeIcon';
import { HN_HOME, HN_OPERATIONS } from '../../ui/hnHomeTokens';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import type { NotificationItem } from '../../services/wms/notifications';
import { notificationKind, notificationTime } from './p13Presentation';

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: HN_HOME.line,
    gap: 24,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  selectedTab: { borderBottomColor: HN_UI.borderControl },
  tabText: { color: HN_HOME.muted, fontSize: 18, lineHeight: 27 },
  selectedTabText: { color: HN_UI.textLink, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: HN_HOME.line,
    backgroundColor: HN_UI.surface,
    alignItems: 'flex-start',
  },
  unreadDot: {
    position: 'absolute',
    left: -12,
    top: 24,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: HN_UI.danger,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  copy: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    color: HN_HOME.ink,
  },
  time: { fontSize: 14, lineHeight: 21, color: HN_HOME.muted, marginTop: 5 },
  message: { marginTop: 6, fontSize: 16, lineHeight: 24, color: HN_HOME.muted },
  detail: { flexGrow: 1, backgroundColor: HN_UI.surface, gap: 24 },
  detailHead: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  detailTitle: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
    color: HN_HOME.ink,
  },
  detailTime: {
    fontSize: 15,
    lineHeight: 22.5,
    color: HN_HOME.muted,
    marginTop: 6,
  },
  source: { marginTop: 8, fontSize: 16, lineHeight: 24, color: HN_HOME.muted },
  heading: {
    fontSize: 18,
    lineHeight: 27,
    fontWeight: '600',
    color: HN_HOME.ink,
    marginBottom: 10,
  },
  bodyText: { fontSize: 16, lineHeight: 24, color: HN_HOME.ink },
  relatedNumber: {
    fontSize: 19,
    lineHeight: 28.5,
    fontWeight: '700',
    color: HN_HOME.ink,
  },
  muted: { fontSize: 16, lineHeight: 24, color: HN_HOME.muted },
  disclosure: { borderTopWidth: 1, borderTopColor: HN_HOME.line },
  summary: {
    minHeight: 52,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
  },
  summaryText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    color: HN_HOME.muted,
  },
  metadata: { gap: 16, paddingVertical: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  metaLabel: { width: 112, fontSize: 16, lineHeight: 24, color: HN_HOME.muted },
  metaValue: { fontSize: 16, lineHeight: 24, color: HN_HOME.ink },
  primary: { minHeight: 54, borderRadius: 11, backgroundColor: SCANNER_COLORS.primary },
  primaryText: { fontSize: 14, lineHeight: 20 },
  link: {
    minHeight: 44,
    borderWidth: 0,
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  linkText: { color: HN_UI.textLink, fontSize: 16, lineHeight: 24 },
  actions: { gap: 10 },
  measure: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 },
  reader: { fontSize: 18, lineHeight: 28.8, color: HN_HOME.ink },
  measuredContainer: { minWidth: 0 },
});

/** Local RN measurement adapter; the shared Dialog owns modal/Back/scroll.
 * Source strings are never shortened, persisted or sent by this presenter.
 */
export function P13ReadableText({
  text,
  label,
  lines = 3,
  style,
  testID,
}: {
  text: string;
  label: string;
  lines?: number;
  style?: StyleProp<TextStyle>;
  testID?: string;
}) {
  const [truncated, setTruncated] = useState(false);
  const [open, setOpen] = useState(false);
  const trigger = useRef<React.ComponentRef<typeof Pressable>>(null);
  useEffect(() => {
    setOpen(false);
  }, [text]);
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus?.());
  };
  return (
    <View style={styles.measuredContainer}>
      <Text testID={testID} selectable numberOfLines={lines} style={style}>
        {text}
      </Text>
      <Text
        testID={testID ? testID + '.measure' : undefined}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[style, styles.measure]}
        onLayout={event =>
          setTruncated(
            event.nativeEvent.layout.height >
              (StyleSheet.flatten(style)?.lineHeight ?? 27) * lines + 1,
          )
        }
        onTextLayout={event =>
          setTruncated(event.nativeEvent.lines.length > lines)
        }
      >
        {text}
      </Text>
      {truncated ? (
        <Pressable
          ref={trigger}
          accessibilityRole="button"
          accessibilityLabel={'Xem đầy đủ ' + label}
          style={styles.summary}
          onPress={() => setOpen(true)}
        >
          <Text style={styles.linkText}>Xem đầy đủ</Text>
        </Pressable>
      ) : null}
      {open ? (
        <Dialog
          visible
          title={label}
          dismissOnBackdrop={false}
          onDismiss={close}
          footer={<Button label="Đóng" onPress={close} />}
        >
          <Text selectable style={styles.reader}>
            {text}
          </Text>
        </Dialog>
      ) : null}
    </View>
  );
}

export function P13OperationIcon({ kind }: { kind?: string | null }) {
  const operation =
    kind === 'inbound' ||
    kind === 'outbound' ||
    kind === 'warranty' ||
    kind === 'nfc'
      ? kind
      : 'documents';
  const palette = HN_OPERATIONS[operation];
  const name: HnHomeIconName =
    operation === 'inbound'
      ? 'down'
      : operation === 'outbound'
      ? 'up'
      : operation === 'warranty'
      ? 'tool'
      : operation === 'nfc'
      ? 'nfc'
      : 'document';
  return (
    <View style={[styles.icon, { backgroundColor: palette.soft }]}>
      <HnHomeIcon name={name} size={24} color={palette.ink} />
    </View>
  );
}
const business = (item: NotificationItem) =>
  notificationKind(item).label === '—'
    ? null
    : String(item.subject?.business_type ?? '').toLowerCase();

export function P13NotificationFilters({
  unread,
  count,
  busy,
  onSelect,
}: {
  unread: boolean;
  count: number | null;
  busy: boolean;
  onSelect(value: boolean): void;
}) {
  return (
    <View style={styles.tabs}>
      {[true, false].map(value => (
        <Pressable
          key={String(value)}
          accessibilityRole="button"
          accessibilityLabel={value ? 'Lọc thông báo chưa đọc' : 'Tất cả'}
          accessibilityValue={
            value
              ? {
                  text: `${
                    count ?? 'Chưa xác minh'
                  } thông báo chưa đọc toàn tài khoản`,
                }
              : undefined
          }
          accessibilityState={{ selected: unread === value, disabled: busy }}
          disabled={busy}
          onPress={() => onSelect(value)}
          style={[styles.tab, unread === value && styles.selectedTab]}
        >
          <Text
            style={[styles.tabText, unread === value && styles.selectedTabText]}
          >
            {value
              ? `Chưa đọc (${
                  count === null ? '—' : count > 99 ? '99+' : count
                })`
              : 'Tất cả'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function P13NotificationRow({
  item,
  busy,
  onPress,
}: {
  item: NotificationItem;
  busy: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      testID={'P13.recipient.' + item.id}
      accessibilityRole="button"
      accessibilityLabel={item.title ?? 'Thông báo chưa có tiêu đề'}
      accessibilityHint={
        (item.read ? 'Đã đọc. ' : 'Chưa đọc. ') +
        notificationTime(item.createdAt) +
        (item.message ? '. ' + item.message : '')
      }
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={styles.row}
    >
      {!item.read ? <View style={styles.unreadDot} accessible={false} /> : null}
      <P13OperationIcon kind={business(item)} />
      <View style={styles.copy}>
        <Text numberOfLines={2} style={styles.rowTitle}>
          {item.title ?? 'Thông báo chưa có tiêu đề'}
        </Text>
        <Text style={styles.time}>{notificationTime(item.createdAt)}</Text>
        <Text numberOfLines={3} style={styles.message}>
          {item.message ?? 'Chưa có nội dung được phép đọc.'}
        </Text>
      </View>
    </Pressable>
  );
}

export function P13NotificationActions({
  busy,
  canOpen,
  onOpen,
  onOpenQueue,
}: {
  item: NotificationItem;
  busy: boolean;
  canOpen: boolean;
  unknown: boolean;
  onOpen(): void;
  onMark(): void;
  onOpenQueue?(): void;
}) {
  return (
    <View style={styles.actions}>
      {canOpen ? (
        <Button
          label="Xem chứng từ"
          accessibilityLabel="Xem chứng từ liên quan"
          disabled={busy}
          onPress={onOpen}
          leading={<HnHomeIcon name="document" size={24} color={HN_UI.onBrand} />}
          style={styles.primary}
          labelStyle={styles.primaryText}
        />
      ) : null}
      {onOpenQueue ? (
        <Button
          label="Các phiếu chờ Web"
          variant="secondary"
          disabled={busy}
          onPress={onOpenQueue}
          style={styles.link}
          labelStyle={styles.linkText}
        />
      ) : null}
    </View>
  );
}

export function P13NotificationDetail({
  item,
  warehouseName,
  busy,
  canOpen,
  unknown,
  onOpen,
  onMark,
  showActions = true,
  expanded,
  onExpandedChange,
}: {
  item: NotificationItem;
  warehouseName?: string | null;
  actorRole?: string | null;
  busy: boolean;
  canOpen: boolean;
  unknown: boolean;
  onOpen(): void;
  onMark(): void;
  showActions?: boolean;
  expanded?: boolean;
  onExpandedChange?(value: boolean): void;
}) {
  const [localExpanded, setLocalExpanded] = useState(false);
  useEffect(() => setLocalExpanded(false), [item.id]);
  const isExpanded = expanded ?? localExpanded;
  const kind = notificationKind(item);
  const sourceWarehouse =
    item.warehouseNameSnapshot?.trim() || warehouseName?.trim() || '—';
  const fields = [
    { label: 'Loại thông báo', value: kind.label, id: 'kind' },
    { label: 'Người tạo', value: item.actorName ?? '—', id: 'actor' },
    { label: 'Kho', value: sourceWarehouse, id: 'warehouse' },
  ];
  return (
    <View style={styles.detail}>
      <View style={styles.detailHead}>
        <P13OperationIcon kind={business(item)} />
        <View style={styles.copy}>
          <Text accessibilityRole="header" style={styles.detailTitle}>
            {item.title ?? 'Chưa có tiêu đề'}
          </Text>
          <Text style={styles.detailTime}>
            {notificationTime(item.createdAt)}
          </Text>
          <P13ReadableText
            text={
              [item.actorName, sourceWarehouse !== '—' ? sourceWarehouse : null]
                .filter(Boolean)
                .join(' · ') || 'Chưa có dữ liệu'
            }
            label="Nguồn thông báo"
            lines={2}
            style={styles.source}
          />
        </View>
      </View>
      <View testID="P13.detail.content">
        <Text style={styles.heading}>Nội dung thông báo</Text>
        <P13ReadableText
          text={item.message ?? 'Chưa có nội dung được phép đọc.'}
          label="Nội dung thông báo"
          style={styles.bodyText}
          testID="P13.detail.message"
        />
      </View>
      {item.documentNo ? (
        <View testID="P13.detail.related">
          <Text style={styles.heading}>Chứng từ liên quan</Text>
          <P13ReadableText
            text={item.documentNo}
            label="Số chứng từ"
            lines={2}
            style={styles.relatedNumber}
          />
          <Text style={styles.muted}>{kind.label}</Text>
        </View>
      ) : null}
      <View style={styles.disclosure}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Thông tin chi tiết"
          accessibilityState={{ expanded: isExpanded }}
          style={styles.summary}
          onPress={() => {
            const next = !isExpanded;
            setLocalExpanded(next);
            onExpandedChange?.(next);
          }}
        >
          <Text style={styles.summaryText}>Thông tin chi tiết</Text>
          <View
            style={{ transform: [{ rotate: isExpanded ? '-90deg' : '90deg' }] }}
          >
            <HnHomeIcon name="chevron" size={20} color={HN_HOME.muted} />
          </View>
        </Pressable>
        {isExpanded ? (
          <View testID="P13.detail.metadata" style={styles.metadata}>
            {fields.map(field => (
              <View key={field.id} style={styles.metaRow}>
                <Text style={styles.metaLabel}>{field.label}</Text>
                <View style={styles.copy}>
                  <P13ReadableText
                    text={field.value}
                    label={field.label}
                    lines={2}
                    style={styles.metaValue}
                    testID={'P13.detail.' + field.id}
                  />
                  {field.id === 'actor' ? (
                    <Text style={styles.muted}>
                      {item.actorJobTitleSnapshot?.trim() || '—'}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      {showActions ? (
        <P13NotificationActions
          {...{ item, busy, canOpen, unknown, onOpen, onMark }}
        />
      ) : null}
    </View>
  );
}
