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
  reconcileNotificationRead,
  markNotificationRead,
  type NotificationItem,
} from '../../services/wms/notifications';
import {
  captureSessionScope,
  isSessionScopeCurrent,
  subscribeSession,
} from '../../auth/session';
import { useTheme } from '../../theme/ThemeProvider';
import { AppIcon } from '../../ui/AppIcon';
import { Badge, type BadgeTone } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Text } from '../../ui/Text';
import { vietnamTimeParts } from '../../time/vietnamTime';

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
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  headCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  close: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: { minHeight: 38, alignItems: 'flex-end', justifyContent: 'center' },
  list: { gap: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  unreadBar: { width: 3, alignSelf: 'stretch' },
  itemBody: { flex: 1, minWidth: 0 },
  itemHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  title: { flex: 1, fontWeight: '700' },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  itemAction: {
    minHeight: 34,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
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

function formatTime(value: string | null): string | undefined {
  if (value === null || value.trim() === '') return undefined;
  const p = vietnamTimeParts(value);
  return p ? `${p.day}/${p.month} ${p.hour}:${p.minute}` : 'Chưa xác minh thời điểm';
}

function severityTone(value: string | null): BadgeTone {
  switch (value?.trim().toLowerCase()) {
    case 'critical':
    case 'error':
    case 'danger':
      return 'danger';
    case 'warning':
    case 'warn':
      return 'warning';
    case 'success':
      return 'success';
    default:
      return 'primary';
  }
}

function severityLabel(value: string | null): string | undefined {
  switch (value?.trim().toLowerCase()) {
    case 'critical':
      return 'Khẩn';
    case 'error':
    case 'danger':
      return 'Cần xử lý';
    case 'warning':
    case 'warn':
      return 'Lưu ý';
    case 'success':
      return 'Hoàn tất';
    case 'info':
      return 'Thông tin';
    default:
      return undefined;
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
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | undefined>();
  const [busyId, setBusyId] = useState<string | undefined>();
  const [unknownId, setUnknownId] = useState<string | undefined>();
  const busy = useRef(false),
    actionVersion = useRef(0),
    visibleRef = useRef(visible);
  const scopeRef = useRef(captureSessionScope());
  visibleRef.current = visible;
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
      setTotal(page.total);
      setUnreadCount(count);
      onUnreadCountChange(count);
      setPhase('ready');
    } catch (cause) {
      if (requestVersion.current !== request) return;
      if (
        cause instanceof AppError &&
        (cause.kind === 'auth' || cause.status === 401 || cause.status === 403)
      ) {
        setItems([]);
        setTotal(null);
        setUnreadCount(null);
      }
      setError(readableError(cause));
      setPhase('error');
    }
  }, [onUnreadCountChange]);

  useEffect(
    () =>
      subscribeSession(() => {
        if (isSessionScopeCurrent(scopeRef.current)) return;
        scopeRef.current = captureSessionScope();
        requestVersion.current += 1;
        actionVersion.current += 1;
        busy.current = false;
        setItems([]);
        setTotal(null);
        setUnreadCount(null);
        setBusyId(undefined);
        setUnknownId(undefined);
        setError(undefined);
        setPhase('loading');
        if (visibleRef.current) load();
      }),
    [load],
  );

  useEffect(() => {
    if (!visible) {
      requestVersion.current += 1;
      actionVersion.current += 1;
      busy.current = false;
      setBusyId(undefined);
      return;
    }
    load();
  }, [load, visible]);

  const handleMarkRead = useCallback(
    async (item: NotificationItem) => {
      if (
        item.read ||
        busy.current ||
        unknownId !== undefined ||
        !visibleRef.current
      )
        return;
      busy.current = true;
      const owner = ++actionVersion.current,
        scope = captureSessionScope();
      setBusyId(item.id);
      setUnknownId(item.id);
      setError(undefined);
      try {
        const result = await markNotificationRead(item.id);
        if (
          actionVersion.current !== owner ||
          !visibleRef.current ||
          !isSessionScopeCurrent(scope)
        )
          return;
        setItems(current =>
          current.map(candidate =>
            candidate.id === item.id ? result.item : candidate,
          ),
        );
        setUnreadCount(result.unreadCount);
        onUnreadCountChange(result.unreadCount);
        setUnknownId(undefined);
      } catch (cause) {
        if (
          actionVersion.current !== owner ||
          !visibleRef.current ||
          !isSessionScopeCurrent(scope)
        )
          return;
        if (
          cause instanceof AppError &&
          !['timeout', 'network', 'parse'].includes(cause.kind) &&
          !(cause.status !== undefined && cause.status >= 500)
        )
          setUnknownId(undefined);
        setError(readableError(cause));
      } finally {
        if (actionVersion.current === owner) {
          busy.current = false;
          setBusyId(undefined);
        }
      }
    },
    [unknownId, onUnreadCountChange],
  );

  const handleCheck = useCallback(
    async (id: string) => {
      if (busy.current || !visibleRef.current || unknownId !== id) return;
      busy.current = true;
      const owner = ++actionVersion.current,
        scope = captureSessionScope();
      setBusyId(id);
      setError(undefined);
      try {
        const result = await reconcileNotificationRead(id);
        if (
          actionVersion.current !== owner ||
          !visibleRef.current ||
          !isSessionScopeCurrent(scope)
        )
          return;
        setItems(current =>
          current.map(item => (item.id === id ? result.item : item)),
        );
        setUnreadCount(result.unreadCount);
        onUnreadCountChange(result.unreadCount);
        setUnknownId(undefined);
      } catch (cause) {
        if (
          actionVersion.current !== owner ||
          !visibleRef.current ||
          !isSessionScopeCurrent(scope)
        )
          return;
        setError(readableError(cause));
      } finally {
        if (actionVersion.current === owner) {
          busy.current = false;
          setBusyId(undefined);
        }
      }
    },
    [unknownId, onUnreadCountChange],
  );

  if (!visible) return null;
  const top = anchor?.top ?? 82;
  const right = anchor?.right ?? 12;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng thông báo"
          onPress={onDismiss}
          style={styles.backdrop}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.panel,
            {
              top,
              right,
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.divider,
            },
          ]}
        >
          <View
            style={[
              styles.head,
              {
                gap: theme.spacing.sm,
                padding: theme.spacing.lg,
                borderBottomColor: theme.colors.divider,
              },
            ]}
          >
            <View style={[styles.headCopy, { gap: theme.spacing.sm }]}>
              <AppIcon
                name="notification"
                size={20}
                color={theme.colors.primary}
              />
              <Text
                variant="cardTitle"
                style={{ color: theme.colors.textStrong }}
              >
                Thông báo
              </Text>
              {unreadCount !== null && unreadCount > 0 ? (
                <Badge label={String(unreadCount)} tone="danger" />
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng thông báo"
              onPress={onDismiss}
              style={({ pressed }) => [
                styles.close,
                { opacity: pressed ? 0.65 : 1 },
              ]}
            >
              <Text variant="body" style={{ color: theme.colors.textStrong }}>
                ×
              </Text>
            </Pressable>
          </View>

          {error === undefined ? null : (
            <View
              style={{
                paddingHorizontal: theme.spacing.lg,
                paddingBottom: theme.spacing.md,
              }}
            >
              <Text
                variant="caption"
                style={{ color: theme.colors.dangerText }}
              >
                {error}
              </Text>
              <Button
                label="Thử lại"
                variant="secondary"
                onPress={() => {
                  load();
                }}
              />
            </View>
          )}
          {unknownId !== undefined &&
          !items.some(item => item.id === unknownId && !item.read) ? (
            <Button
              label="Kiểm tra kết quả đọc"
              variant="secondary"
              disabled={busyId !== undefined}
              onPress={() => {
                handleCheck(unknownId);
              }}
            />
          ) : null}

          {phase === 'loading' && items.length === 0 ? (
            <View
              style={[
                styles.loading,
                { gap: theme.spacing.sm, padding: theme.spacing.xl },
              ]}
            >
              <ActivityIndicator color={theme.colors.primary} />
              <Text variant="caption" tone="muted">
                Đang tải thông báo…
              </Text>
            </View>
          ) : null}

          {phase === 'ready' && items.length === 0 && total === 0 ? (
            <EmptyState
              icon={
                <AppIcon
                  name="notification"
                  size={24}
                  color={theme.colors.primary}
                />
              }
              title="Chưa có thông báo"
              hint="Các cập nhật từ WMS sẽ xuất hiện tại đây."
            />
          ) : null}
          {phase === 'ready' &&
          items.length === 0 &&
          total !== null &&
          total > 0 ? (
            <View>
              <Text>Trang thông báo rỗng nhưng tổng nguồn vẫn có dữ liệu.</Text>
              <Button
                label="Đọc lại thông báo"
                variant="secondary"
                onPress={() => {
                  load();
                }}
              />
            </View>
          ) : null}

          {items.length === 0 ? null : (
            <ScrollView
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator
            >
              {items.map(item => {
                const label = severityLabel(item.severity);
                const time = formatTime(item.createdAt);
                const canMark =
                  !item.read && busyId === undefined && unknownId === undefined;
                const canCheck = unknownId === item.id && busyId === undefined;
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.row,
                      styles.notificationRow,
                      { borderBottomColor: theme.colors.divider },
                    ]}
                  >
                    <View
                      style={[
                        styles.unreadBar,
                        {
                          backgroundColor: item.read
                            ? theme.colors.divider
                            : theme.colors.primary,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.itemBody,
                        { gap: theme.spacing.xs, padding: theme.spacing.md },
                      ]}
                    >
                      <View
                        style={[styles.itemHead, { gap: theme.spacing.sm }]}
                      >
                        <Text
                          variant="body"
                          numberOfLines={1}
                          style={[
                            styles.title,
                            { color: theme.colors.textStrong },
                          ]}
                        >
                          {item.title ?? 'Nội dung chưa khả dụng'}
                        </Text>
                        {label === undefined ? null : (
                          <Badge
                            label={label}
                            tone={severityTone(item.severity)}
                          />
                        )}
                      </View>
                      {item.message === null ? null : (
                        <Text
                          variant="caption"
                          numberOfLines={2}
                          style={{ color: theme.colors.textMuted }}
                        >
                          {item.message}
                        </Text>
                      )}
                      <View style={[styles.meta, { gap: theme.spacing.sm }]}>
                        <View
                          style={[
                            styles.dot,
                            {
                              backgroundColor: item.read
                                ? theme.colors.textMuted
                                : theme.colors.primary,
                            },
                          ]}
                        />
                        <Text variant="caption" tone="muted">
                          {item.read ? 'Đã đọc' : 'Chưa đọc'}
                        </Text>
                        {time === undefined ? null : (
                          <Text variant="caption" tone="muted">
                            · {time}
                          </Text>
                        )}
                      </View>
                      {item.read ? null : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={
                            unknownId === item.id
                              ? 'Kiểm tra kết quả đọc'
                              : 'Đánh dấu đã đọc: ' +
                                (item.title ?? 'Thông báo')
                          }
                          accessibilityState={{
                            disabled: !(canMark || canCheck),
                            busy: busyId === item.id,
                          }}
                          disabled={!(canMark || canCheck)}
                          onPress={() => {
                            if (unknownId === item.id)
                              handleCheck(item.id);
                            else handleMarkRead(item);
                          }}
                          style={({ pressed }) => [
                            styles.itemAction,
                            {
                              opacity: !(canMark || canCheck)
                                ? 0.5
                                : pressed
                                ? 0.7
                                : 1,
                            },
                          ]}
                        >
                          {busyId === item.id ? (
                            <ActivityIndicator
                              size="small"
                              color={theme.colors.primary}
                            />
                          ) : (
                            <Text
                              variant="caption"
                              style={[
                                styles.itemActionText,
                                { color: theme.colors.primary },
                              ]}
                            >
                              {unknownId === item.id
                                ? 'Kiểm tra kết quả'
                                : 'Đánh dấu đã đọc'}
                            </Text>
                          )}
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
          <View
            style={[
              styles.footer,
              {
                padding: theme.spacing.sm,
                backgroundColor: theme.colors.surfaceSubtle,
              },
            ]}
          >
            <Text variant="caption" tone="muted">
              {total === null
                ? 'Chưa xác minh tổng thông báo'
                : 'Đã tải ' + items.length + ' thông báo · Tổng ' + total}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
