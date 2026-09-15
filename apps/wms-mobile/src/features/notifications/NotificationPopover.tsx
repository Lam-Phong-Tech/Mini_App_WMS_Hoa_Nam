/**
 * Dropdown thông báo mở ngay dưới chuông ở Trang chủ.
 *
 * Đây là bảng nhanh, không phải một màn mới: chỉ tải năm thông báo gần nhất
 * khi người dùng mở chuông. Các thao tác đọc chỉ chạy sau nút người dùng bấm.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { AppError, messageForUser } from '../../errors/AppError';
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '../../services/wms/notifications';
import { useTheme } from '../../theme/ThemeProvider';
import { AppIcon } from '../../ui/AppIcon';
import { Badge, type BadgeTone } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Text } from '../../ui/Text';

const styles = StyleSheet.create({
  modalRoot: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill },
  panel: {
    position: 'absolute',
    width: '90%',
    maxWidth: 360,
    maxHeight: '72%',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 12,
    borderWidth: 1,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  headCopy: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  close: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  action: { minHeight: 38, alignItems: 'flex-end', justifyContent: 'center' },
  list: { gap: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  unreadBar: { width: 3, alignSelf: 'stretch' },
  itemBody: { flex: 1, minWidth: 0 },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { flex: 1, fontWeight: '700' },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  itemAction: { minHeight: 34, alignItems: 'flex-start', justifyContent: 'center' },
  itemActionText: { fontWeight: '700' },
  footer: { alignItems: 'center' },
  markAllText: { fontWeight: '700' },
  loading: { alignItems: 'center' },
  notificationRow: { borderBottomWidth: 1 },
});

export interface NotificationPopoverAnchor {
  readonly top: number;
  readonly right: number;
}

export interface NotificationPopoverProps {
  visible: boolean;
  anchor?: NotificationPopoverAnchor;
  onDismiss: () => void;
  onUnreadCountChange: (count: number) => void;
}

function formatTime(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const date = new Date(value.replace(' ', 'T'));
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function severityTone(value: string | undefined): BadgeTone {
  switch (value?.trim().toLowerCase()) {
    case 'critical': case 'error': case 'danger': return 'danger';
    case 'warning': case 'warn': return 'warning';
    case 'success': return 'success';
    default: return 'primary';
  }
}

function severityLabel(value: string | undefined): string | undefined {
  switch (value?.trim().toLowerCase()) {
    case 'critical': return 'Khẩn';
    case 'error': case 'danger': return 'Cần xử lý';
    case 'warning': case 'warn': return 'Lưu ý';
    case 'success': return 'Hoàn tất';
    case 'info': return 'Thông tin';
    default: return undefined;
  }
}

function readableError(error: unknown): string {
  return error instanceof AppError
    ? messageForUser(error)
    : 'Không tải được thông báo. Vui lòng thử lại.';
}

export function NotificationPopover({
  visible,
  anchor,
  onDismiss,
  onUnreadCountChange,
}: NotificationPopoverProps): React.ReactElement | null {
  const theme = useTheme();
  const [items, setItems] = useState<readonly NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | undefined>();
  const [busyId, setBusyId] = useState<string | undefined>();
  const [markAllBusy, setMarkAllBusy] = useState(false);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const request = requestVersion.current + 1;
    requestVersion.current = request;
    setPhase('loading');
    setError(undefined);
    try {
      const [page, count] = await Promise.all([
        fetchNotifications({ perPage: 5 }),
        fetchUnreadNotificationCount(),
      ]);
      if (requestVersion.current !== request) return;
      setItems(page.items);
      setUnreadCount(count);
      onUnreadCountChange(count);
      setPhase('ready');
    } catch (cause) {
      if (requestVersion.current !== request) return;
      setError(readableError(cause));
      setPhase('error');
    }
  }, [onUnreadCountChange]);

  useEffect(() => {
    if (!visible) {
      requestVersion.current += 1;
      return;
    }
    load();
  }, [load, visible]);

  const handleMarkRead = useCallback(async (item: NotificationItem) => {
    if (item.read || busyId !== undefined || markAllBusy) return;
    setBusyId(item.id);
    setError(undefined);
    try {
      await markNotificationRead(item.id);
      setItems(current => current.map(candidate =>
        candidate.id === item.id ? { ...candidate, read: true } : candidate,
      ));
      setUnreadCount(current => {
        const next = Math.max(0, current - 1);
        onUnreadCountChange(next);
        return next;
      });
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setBusyId(undefined);
    }
  }, [busyId, markAllBusy, onUnreadCountChange]);

  const handleMarkAll = useCallback(async () => {
    if (unreadCount === 0 || busyId !== undefined || markAllBusy) return;
    setMarkAllBusy(true);
    setError(undefined);
    try {
      await markAllNotificationsRead();
      setItems(current => current.map(item => ({ ...item, read: true })));
      setUnreadCount(0);
      onUnreadCountChange(0);
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setMarkAllBusy(false);
    }
  }, [busyId, markAllBusy, onUnreadCountChange, unreadCount]);

  if (!visible) return null;
  const top = anchor?.top ?? 82;
  const right = anchor?.right ?? 12;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng thông báo"
          onPress={onDismiss}
          style={styles.backdrop}
        />
        <View
          accessibilityViewIsModal
          style={[styles.panel, {
            top,
            right,
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.divider,
          }]}
        >
          <View style={[styles.head, { gap: theme.spacing.sm, padding: theme.spacing.lg, borderBottomColor: theme.colors.divider }]}>
            <View style={[styles.headCopy, { gap: theme.spacing.sm }]}>
              <AppIcon name="notification" size={20} color={theme.colors.primary} />
              <Text variant="cardTitle" style={{ color: theme.colors.textStrong }}>Thông báo</Text>
              {unreadCount > 0 ? <Badge label={String(unreadCount)} tone="danger" /> : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng thông báo" onPress={onDismiss} style={({ pressed }) => [styles.close, { opacity: pressed ? 0.65 : 1 }]}>
              <Text variant="body" style={{ color: theme.colors.textStrong }}>×</Text>
            </Pressable>
          </View>

          {unreadCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đánh dấu tất cả đã đọc"
              accessibilityState={{ disabled: markAllBusy || busyId !== undefined, busy: markAllBusy }}
              disabled={markAllBusy || busyId !== undefined}
              onPress={() => { handleMarkAll(); }}
              style={({ pressed }) => [styles.action, { paddingHorizontal: theme.spacing.lg, opacity: markAllBusy || busyId !== undefined ? 0.5 : pressed ? 0.7 : 1 }]}
            >
              {markAllBusy ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <Text variant="caption" style={[styles.markAllText, { color: theme.colors.primary }]}>Đánh dấu tất cả đã đọc</Text>}
            </Pressable>
          ) : null}

          {error === undefined ? null : (
            <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md }}>
              <Text variant="caption" style={{ color: theme.colors.dangerText }}>{error}</Text>
              <Button label="Thử lại" variant="secondary" onPress={() => { load(); }} />
            </View>
          )}

          {phase === 'loading' && items.length === 0 ? (
            <View style={[styles.loading, { gap: theme.spacing.sm, padding: theme.spacing.xl }]}>
              <ActivityIndicator color={theme.colors.primary} />
              <Text variant="caption" tone="muted">Đang tải thông báo…</Text>
            </View>
          ) : null}

          {phase !== 'loading' && items.length === 0 ? (
            <EmptyState
              icon={<AppIcon name="notification" size={24} color={theme.colors.primary} />}
              title="Chưa có thông báo"
              hint="Các cập nhật từ WMS sẽ xuất hiện tại đây."
            />
          ) : null}

          {items.length === 0 ? null : (
            <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator>
              {items.map(item => {
                const label = severityLabel(item.severity);
                const time = formatTime(item.createdAt);
                const canMark = !item.read && busyId === undefined && !markAllBusy;
                return (
                  <View key={item.id} style={[styles.row, styles.notificationRow, { borderBottomColor: theme.colors.divider }]}>
                    <View style={[styles.unreadBar, { backgroundColor: item.read ? theme.colors.divider : theme.colors.primary }]} />
                    <View style={[styles.itemBody, { gap: theme.spacing.xs, padding: theme.spacing.md }]}>
                      <View style={[styles.itemHead, { gap: theme.spacing.sm }]}>
                        <Text variant="body" numberOfLines={1} style={[styles.title, { color: theme.colors.textStrong }]}>{item.title}</Text>
                        {label === undefined ? null : <Badge label={label} tone={severityTone(item.severity)} />}
                      </View>
                      {item.message === undefined ? null : <Text variant="caption" numberOfLines={2} style={{ color: theme.colors.textMuted }}>{item.message}</Text>}
                      <View style={[styles.meta, { gap: theme.spacing.sm }]}>
                        <View style={[styles.dot, { backgroundColor: item.read ? theme.colors.textMuted : theme.colors.primary }]} />
                        <Text variant="caption" tone="muted">{item.read ? 'Đã đọc' : 'Chưa đọc'}</Text>
                        {time === undefined ? null : <Text variant="caption" tone="muted">· {time}</Text>}
                      </View>
                      {item.read ? null : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={'Đánh dấu đã đọc: ' + item.title}
                          accessibilityState={{ disabled: !canMark, busy: busyId === item.id }}
                          disabled={!canMark}
                          onPress={() => { handleMarkRead(item); }}
                          style={({ pressed }) => [styles.itemAction, { opacity: !canMark ? 0.5 : pressed ? 0.7 : 1 }]}
                        >
                          {busyId === item.id ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <Text variant="caption" style={[styles.itemActionText, { color: theme.colors.primary }]}>Đánh dấu đã đọc</Text>}
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
          <View style={[styles.footer, { padding: theme.spacing.sm, backgroundColor: theme.colors.surfaceSubtle }]}>
            <Text variant="caption" tone="muted">Hiển thị 5 thông báo mới nhất</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
