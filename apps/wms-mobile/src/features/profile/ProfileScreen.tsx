/**
 * Màn Cá nhân.
 *
 * 🎨 Nguồn: ảnh **08–10** của bộ 47 ảnh.
 *
 * Ba nhóm, đúng thứ tự và đúng nhãn IN HOA trong ảnh:
 * `TÀI KHOẢN` → `KẾT NỐI WMS` → `PHIÊN & BẢO MẬT`, rồi nút **Đăng xuất** viền đỏ.
 *
 * ✅ Đọc thật: `GET /api/v1/auth/me` — một trong 11 endpoint đã kiểm chứng trả
 * 200 (§4e.2). Đăng xuất cũng chạy thật qua ngoại lệ `GATE_WMS §2c`.
 *
 * ⚠️ Ảnh 09 hiển thị `Thiết bị: Windows` vì bản chụp chạy trên trình duyệt máy
 * tính. Trên app native, giá trị đúng phải là chuỗi định danh app —
 * `WMSHoaNam-Android/<version>` — chính là `User-Agent` mà Cloudflare đang
 * allowlist. Hiện chuỗi đó ở đây có ích thật: khi thủ kho báo lỗi 403, người hỗ
 * trợ đọc ngay được app đang khai danh tính gì (§4j).
 *
 * ⚠️ Ảnh 09 còn có liên kết *"Xem auth screens"* — đó là **công cụ nội bộ** để
 * chụp ảnh (ảnh 01), không phải chức năng nghiệp vụ. Không port; app mới đã có
 * màn Chẩn đoán riêng.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, View } from 'react-native';
import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Banner } from '../../ui/Banner';
import { Sheet } from '../../ui/Sheet';
import { DefinitionRow } from '../../ui/DefinitionRow';
import { useTheme } from '../../theme/ThemeProvider';
import { messageForUser, toAppError, type AppError } from '../../errors/AppError';
import { APP_VERSION } from '../../api/userAgent';
import { getCurrentEnvironment } from '../../config/env';
import { getSession } from '../../auth/session';
import { fetchCurrentUser } from '../../services/wms/queries';
import { logout } from '../../services/wms/auth';
import type { CurrentUser } from '../../services/wms/types';

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: '700',
  },
  headBody: {
    flex: 1,
  },
  groupLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});

function initials(name: string | undefined): string {
  if (name === undefined || name.trim() === '') {
    return '··';
  }
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

export interface ProfileScreenProps {
  onBack?: () => void;
  /** Báo AppShell hiện trạng thái xoá phiên giống Mini App trước khi vào login. */
  onLogoutStarted?: () => void;
  onLoggedOut?: () => void;
  /** Tiêm để test không cần mạng. */
  fetchUser?: typeof fetchCurrentUser;
  logoutFn?: typeof logout;
}

export function ProfileScreen({
  onBack,
  onLogoutStarted,
  onLoggedOut,
  fetchUser = fetchCurrentUser,
  logoutFn = logout,
}: ProfileScreenProps): React.ReactElement {
  const theme = useTheme();
  const environment = getCurrentEnvironment();
  const session = getSession();

  const [user, setUser] = useState<CurrentUser | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | undefined>();
  const [confirming, setConfirming] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setUser(await fetchUser());
    } catch (cause) {
      setError(toAppError(cause));
    } finally {
      setLoading(false);
    }
  }, [fetchUser]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const handleLogout = useCallback(async () => {
    // Chống double submit: bấm hai lần không gọi đăng xuất hai lần.
    if (loggingOut) {
      return;
    }
    setLoggingOut(true);
    setConfirming(false);
    onLogoutStarted?.();
    // Mini App chuyển sang màn "Đang đăng xuất..." ngay lập tức và không bắt
    // người dùng chờ mạng trả lời. Vẫn gửi logout ngầm để thu hồi phía server.
    logoutFn().catch(() => undefined);
    setTimeout(() => {
      setLoggingOut(false);
      onLoggedOut?.();
    }, 800);
  }, [loggingOut, logoutFn, onLoggedOut, onLogoutStarted]);

  const sessionStart = formatSessionStartedAt(session?.issuedAtMs);
  const displayName = user?.name || 'Chưa đăng nhập';
  const role = user?.role || 'Warehouse Operator';
  const device = getDeviceLabel();

  if (loading && user === undefined) {
    return (
      <Page scroll={false}>
        <View style={styles.loading}>
          <Box card padding="xl" align="center" gap="md">
            <ActivityIndicator />
            <Text variant="body" tone="muted">
              Đang kiểm tra phiên WMS...
            </Text>
          </Box>
        </View>
      </Page>
    );
  }

  return (
    <Page title="Cá nhân" eyebrow="Tài khoản & bảo mật" onBack={onBack} scroll>
      {error === undefined ? null : (
        <Banner
          tone="danger"
          title="Không kiểm tra được phiên"
          message={messageForUser(error)}
        >
          <Button
            label="Thử lại"
            variant="secondary"
            onPress={() => {
              load().catch(() => undefined);
            }}
          />
        </Banner>
      )}

      <Box card padding="lg" gap="md">
        <View style={[styles.head, { gap: theme.spacing.md }]}>
          {user?.avatar_url ? (
            <Image
              accessibilityLabel={displayName}
              source={{ uri: user.avatar_url }}
              style={[styles.avatar, { borderRadius: theme.radius.card }]}
            />
          ) : (
            <View
              style={[
                styles.avatar,
                {
                  borderRadius: theme.radius.card,
                  backgroundColor: theme.colors.primary,
                },
              ]}
            >
              <Text variant="cardTitle" style={styles.avatarText}>
                {initials(displayName)}
              </Text>
            </View>
          )}
          <View style={styles.headBody}>
            <Text variant="cardTitle" tone="strong">
              {displayName}
            </Text>
            <Text variant="caption" tone="muted">
              {role + ' · ' + (session === undefined ? 'Chưa đăng nhập' : 'Đã đăng nhập')}
            </Text>
          </View>
          <Badge label="✓ Hoạt động" tone="success" />
        </View>
      </Box>

      <Box card padding="lg">
        <Text variant="caption" tone="muted" style={styles.groupLabel}>
          Tài khoản
        </Text>
        <DefinitionRow label="Tên đăng nhập" value={user?.name} />
        <DefinitionRow label="Vai trò" value={role} />
        <DefinitionRow
          label="Ngữ cảnh"
          value="Theo phân quyền tài khoản"
          last
        />
      </Box>

      <Box card padding="lg">
        <Text variant="caption" tone="muted" style={styles.groupLabel}>
          Kết nối WMS
        </Text>
        <DefinitionRow label="Tài khoản" value={user?.name} />
        <DefinitionRow
          label="Trạng thái"
          value={session === undefined ? 'Chưa đăng nhập' : 'Đã xác thực'}
        />
      </Box>

      <Box card padding="lg">
        <Text variant="caption" tone="muted" style={styles.groupLabel}>
          Phiên & bảo mật
        </Text>
        <DefinitionRow label="Thiết bị" value={device} />
        <DefinitionRow label="Bắt đầu phiên" value={sessionStart} />
        <DefinitionRow label="Environment" value={environment.label} />
        <DefinitionRow label="Version" value={APP_VERSION} last />
      </Box>

      <Button
        label="Đăng xuất"
        variant="danger"
        onPress={() => setConfirming(true)}
      />

      <Sheet
        visible={confirming}
        onDismiss={() => setConfirming(false)}
        title="Đăng xuất khỏi WMS?"
        message="Bạn sẽ cần đăng nhập lại để tiếp tục sử dụng hệ thống."
      >
        {/* Thứ tự nút bám ảnh 10: hành động nguy hiểm ở TRÊN, Huỷ ở dưới. */}
        <Button
          label="Đăng xuất"
          variant="danger"
          loading={loggingOut}
          onPress={handleLogout}
        />
        <Button
          label="Huỷ"
          variant="secondary"
          onPress={() => setConfirming(false)}
        />
      </Sheet>
    </Page>
  );
}

function formatSessionStartedAt(value: number | undefined): string {
  if (value === undefined) return 'Chưa xác định';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Chưa xác định';
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDeviceLabel(): string {
  const detail = String(Platform.Version ?? '').trim();
  const label = Platform.OS === 'android' ? 'Android' : Platform.OS;
  return detail ? label + ' · ' + detail : label;
}
