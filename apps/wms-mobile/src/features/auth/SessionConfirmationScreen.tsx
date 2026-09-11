/**
 * Xác nhận phiên sau một lượt đăng nhập mới.
 *
 * Đây là xác nhận danh tính/phiên, không phải mở ca: BE chưa cung cấp mô hình
 * ca làm. Vì vậy chỉ `GET /auth/me` và logout hiện hữu được gọi ở màn này.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSession } from '../../auth/session';
import { toAppError, messageForUser, type AppError } from '../../errors/AppError';
import { getCurrentEnvironment } from '../../config/env';
import { fetchCurrentUser } from '../../services/wms/queries';
import { logout } from '../../services/wms/auth';
import type { CurrentUser } from '../../services/wms/types';
import { Banner } from '../../ui/Banner';
import { Box } from '../../ui/Box';
import { Button } from '../../ui/Button';
import { DefinitionRow } from '../../ui/DefinitionRow';
import { Text } from '../../ui/Text';
import { useTheme } from '../../theme/ThemeProvider';
import { scannerAssets } from '../../theme/scannerAssets';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#073b52' },
  shade: { flex: 1, backgroundColor: 'rgba(3, 40, 58, 0.68)' },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 24,
  },
  brand: { flexDirection: 'row', alignItems: 'center' },
  mark: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0c6286',
    borderRadius: 14,
  },
  markText: { color: '#ffffff', fontWeight: '700' },
  brandTitle: { color: '#ffffff' },
  brandHint: { color: 'rgba(255,255,255,0.72)' },
  card: { borderRadius: 18 },
  avatar: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 32,
    backgroundColor: '#e3f5ed',
  },
  avatarText: { color: '#117252', fontWeight: '700' },
  accountHead: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  accountInfo: { flex: 1, minWidth: 0 },
  loading: { alignItems: 'center' },
  greenAction: { backgroundColor: '#0c6286' },
  footer: { color: 'rgba(255,255,255,0.62)', textAlign: 'center' },
});

function initials(value: string | undefined): string {
  if (value === undefined || value.trim() === '') return 'HN';
  return value
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

function scopeLabel(user: CurrentUser | undefined): string {
  const scopes = user?.warehouse_scope_ids ?? [];
  return scopes.length === 0 ? 'Theo phạm vi phân quyền' : scopes.join(', ');
}

export interface SessionConfirmationScreenProps {
  onContinue: () => void;
  onLoggedOut: () => void;
  fetchUser?: typeof fetchCurrentUser;
  logoutFn?: typeof logout;
}

export function SessionConfirmationScreen({
  onContinue,
  onLoggedOut,
  fetchUser = fetchCurrentUser,
  logoutFn = logout,
}: SessionConfirmationScreenProps): React.ReactElement {
  const theme = useTheme();
  const environment = getCurrentEnvironment();
  const [user, setUser] = useState<CurrentUser | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | undefined>();
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
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logoutFn();
    } finally {
      onLoggedOut();
    }
  }, [loggingOut, logoutFn, onLoggedOut]);

  const name = user?.name ?? getSession()?.userId ?? 'Tài khoản WMS';

  return (
    <ImageBackground source={scannerAssets.staffWarehouse} style={styles.root}>
    <SafeAreaView edges={['top', 'bottom']} style={styles.shade}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.brand, { gap: theme.spacing.md }]}>
          <View style={styles.mark}>
            <Text variant="cardTitle" style={styles.markText}>HN</Text>
          </View>
          <View>
            <Text variant="cardTitle" style={styles.brandTitle}>WMS HOA NAM</Text>
            <Text variant="caption" style={styles.brandHint}>Xác nhận phiên làm việc</Text>
          </View>
        </View>

        <Box card padding="lg" gap="lg" style={styles.card}>
          <View style={[styles.accountHead, { gap: theme.spacing.md }]}>
            <View style={styles.avatar}>
              <Text variant="metric" style={styles.avatarText}>{initials(name)}</Text>
            </View>
            <View style={styles.accountInfo}>
              <Text variant="screenTitle" tone="strong" numberOfLines={2}>
                {'Chào ' + name}
              </Text>
              <Text variant="caption" tone="muted">
                Kiểm tra thông tin trước khi vào ứng dụng.
              </Text>
            </View>
          </View>

          {loading ? (
            <View style={[styles.loading, { gap: theme.spacing.sm }]}>
              <ActivityIndicator />
              <Text variant="caption" tone="muted">Đang tải thông tin phiên…</Text>
            </View>
          ) : error !== undefined ? (
            <Banner tone="danger" title="Không tải được thông tin tài khoản" message={messageForUser(error)}>
              <Button label="Thử lại" variant="secondary" onPress={() => { load().catch(() => undefined); }} />
            </Banner>
          ) : (
            <View>
              <DefinitionRow label="Tài khoản" value={user?.email ?? user?.name} />
              <DefinitionRow label="Vai trò" value={user?.role} />
              <DefinitionRow label="Kho được phép" value={scopeLabel(user)} last />
            </View>
          )}

          <Banner
            tone="info"
            title="Bắt đầu ca làm việc: Chưa áp dụng"
            message="Ứng dụng chỉ xác nhận phiên đăng nhập. Không có thao tác mở ca hoặc chấm công được gửi đi."
          />

          <Button
            label="Tiếp tục vào ứng dụng"
            onPress={onContinue}
            disabled={loading || error !== undefined}
            style={styles.greenAction}
          />
          <Button
            label="Đăng xuất"
            variant="secondary"
            loading={loggingOut}
            onPress={() => { handleLogout().catch(() => undefined); }}
          />
        </Box>

        <Text variant="caption" style={styles.footer}>
          {'Môi trường ' + environment.label}
        </Text>
      </ScrollView>
    </SafeAreaView>
    </ImageBackground>
  );
}
