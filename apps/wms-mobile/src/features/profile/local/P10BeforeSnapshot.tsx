/** Frozen before snapshot for local visual evidence only; never app entry. */
import { registerProfileExitGuard } from '../profileNavigation';
/**
 * Prompt 10 — Cá nhân.
 *
 * Board có bốn panel: overview, chỉnh hồ sơ, công việc/quyền và bảo mật. Màn
 * này chỉ nối dữ liệu/API đã được xác nhận; avatar upload, công việc được giao
 * và kết thúc ca không có contract nên không tạo hành động giả.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { APP_VERSION } from '../../../api/userAgent';
import {
  getSession,
  updateSessionIdentity,
  captureSessionScope,
  isSessionScopeCurrent,
  subscribeSession,
} from '../../../auth/session';
import { useHardwareBack } from '../../../app/useHardwareBack';
import { getCurrentEnvironment } from '../../../config/env';
import {
  messageForUser,
  toAppError,
  type AppError,
} from '../../../errors/AppError';
import { logout } from '../../../services/wms/auth';
import {
  fetchCurrentProfile,
  profileCommandBlocked,
  isProfileUnknown,
  changeProfilePassword,
  fetchProfileSessions,
  profileErrorMessage,
  revokeProfileSession,
  updateCurrentProfile,
} from '../../../services/wms/profile';
import type { CurrentUser } from '../../../services/wms/types';
import { P11PasswordScreen, P11SessionsScreen } from '../P11SecurityScreens';
import { HnHomeIcon, type HnHomeIconName } from '../../../ui/HnHomeIcon';
import { HN_OPERATIONS } from '../../../ui/hnHomeTokens';
import { AppIcon, type AppIconName } from '../../../ui/AppIcon';
import { Badge } from '../../../ui/Badge';
import { Banner } from '../../../ui/Banner';
import { Box } from '../../../ui/Box';
import { Button } from '../../../ui/Button';
import { DefinitionRow } from '../../../ui/DefinitionRow';
import { Input } from '../../../ui/Input';
import { Page } from '../../../ui/Page';
import { Sheet } from '../../../ui/Sheet';
import { Text } from '../../../ui/Text';
import { useTheme } from '../../../theme/ThemeProvider';

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { overflow: 'hidden' },
  heroTitle: { color: '#ffffff' },
  heroHeading: { color: '#ffffff', textAlign: 'center' },
  groupGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  groupTile: {
    width: '31%',
    minHeight: 118,
    borderRadius: 12,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  heroBody: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRound: { borderRadius: 36 },
  avatarFallback: { borderRadius: 36, borderWidth: 2, borderColor: '#ffffff' },
  avatarText: { color: '#ffffff', fontWeight: '700' },
  heroInfo: { flex: 1, minWidth: 0 },
  heroMeta: { color: 'rgba(255,255,255,0.82)' },
  menuRow: { flexDirection: 'row', alignItems: 'center' },
  menuIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBody: { flex: 1, minWidth: 0 },
  menuLabel: { fontWeight: '700' },
  sectionTitle: { fontWeight: '700' },
  permission: { flexDirection: 'row', alignItems: 'flex-start' },
  permissionText: { flex: 1, minWidth: 0 },
  footer: { textAlign: 'center' },
  sessionHead: { flexDirection: 'row', alignItems: 'flex-start' },
  sessionBody: { flex: 1, minWidth: 0 },
});

type ProfileView =
  | 'overview'
  | 'edit'
  | 'access'
  | 'security'
  | 'password'
  | 'sessions';

function initials(name: string | undefined): string {
  if (name === undefined || name.trim() === '') return '··';
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

function shown(
  value: string | null | undefined,
  fallback = 'WMS chưa cung cấp',
): string {
  return value == null || value.trim() === '' ? fallback : value;
}

function warehouseScope(user: CurrentUser | undefined): string {
  if (user?.warehouse_context?.status === 'READY' && user.active_warehouse_id) {
    const warehouse = user.available_warehouses?.find(
      w => w.warehouse_id === user.active_warehouse_id,
    );
    return warehouse?.name ?? user.active_warehouse_id;
  }
  return user?.warehouse_context
    ? 'Ngữ cảnh kho: ' +
        user.warehouse_context.status +
        (user.warehouse_context.error_code
          ? ' · ' + user.warehouse_context.error_code
          : '')
    : 'WMS chưa cung cấp phạm vi kho';
}

function formatTime(value: string | null | undefined): string {
  if (value == null) return 'Chưa xác định';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSessionStartedAt(value: number | undefined): string {
  return value === undefined
    ? 'Chưa xác định'
    : formatTime(new Date(value).toISOString());
}

function getDeviceLabel(): string {
  const detail = String(Platform.Version ?? '').trim();
  const label = Platform.OS === 'android' ? 'Android' : Platform.OS;
  return detail ? label + ' · ' + detail : label;
}

interface ProfileMenuRowProps {
  icon: AppIconName;
  label: string;
  description: string;
  onPress?: () => void;
  disabled?: boolean;
  danger?: boolean;
}

function ProfileMenuRow({
  icon,
  label,
  description,
  onPress,
  disabled = false,
  danger = false,
}: ProfileMenuRowProps): React.ReactElement {
  const theme = useTheme();
  const inactive = disabled || onPress === undefined;
  const color = danger ? theme.colors.danger : theme.colors.primary;
  return (
    <Pressable
      accessibilityRole={inactive ? undefined : 'button'}
      accessibilityLabel={label + '. ' + description}
      accessibilityState={{ disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        {
          gap: theme.spacing.md,
          minHeight: 68,
          padding: theme.spacing.md,
          borderRadius: theme.radius.control,
          borderWidth: 1,
          borderColor: danger ? theme.colors.dangerSoft : theme.colors.divider,
          backgroundColor: danger
            ? theme.colors.dangerSoft
            : theme.colors.surface,
          opacity: inactive ? 0.58 : pressed ? 0.78 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.menuIcon,
          {
            borderRadius: theme.radius.control,
            backgroundColor: danger
              ? theme.colors.surface
              : theme.colors.primarySoft,
          },
        ]}
      >
        <AppIcon name={icon} color={color} size={24} />
      </View>
      <View style={[styles.menuBody, { gap: theme.spacing.xs }]}>
        <Text
          variant="body"
          style={[
            styles.menuLabel,
            {
              color: danger ? theme.colors.dangerText : theme.colors.textStrong,
            },
          ]}
        >
          {label}
        </Text>
        <Text variant="caption" tone="muted">
          {description}
        </Text>
      </View>
      {inactive ? (
        <Badge label="Chưa áp dụng" tone="neutral" />
      ) : (
        <AppIcon
          name="chevron-right"
          color={danger ? theme.colors.danger : theme.colors.textMuted}
          size={18}
        />
      )}
    </Pressable>
  );
}

export interface ProfileScreenProps {
  onBack?: () => void;
  onLogoutStarted?: () => void;
  onLoggedOut?: () => void;
  fetchUser?: () => Promise<CurrentUser>;
  logoutFn?: typeof logout;
  updateProfileFn?: typeof updateCurrentProfile;
  changePasswordFn?: typeof changeProfilePassword;
  fetchSessionsFn?: typeof fetchProfileSessions;
  revokeSessionFn?: typeof revokeProfileSession;
}

export function ProfileScreen({
  onBack,
  onLogoutStarted,
  onLoggedOut,
  fetchUser = fetchCurrentProfile,
  logoutFn = logout,
  updateProfileFn = updateCurrentProfile,
  changePasswordFn = changeProfilePassword,
  fetchSessionsFn = fetchProfileSessions,
  revokeSessionFn = revokeProfileSession,
}: ProfileScreenProps): React.ReactElement {
  const theme = useTheme();
  const environment = getCurrentEnvironment();
  const [session, setCurrentSession] = useState(getSession);
  useEffect(() => subscribeSession(setCurrentSession), []);
  const sessionUserId = session?.userId;
  const sessionFamily = session?.authSessionId;
  const sessionWarehouse = session?.activeWarehouseId;
  const loadSequence = useRef(0);
  const [view, setView] = useState<ProfileView>('overview');
  const [user, setUser] = useState<CurrentUser | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | undefined>();
  const [confirming, setConfirming] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutInFlight = useRef(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const load = useCallback(async () => {
    // A confirmed password response tears auth down. Never hydrate /me with
    // that revoked token while AppShell switches to the non-secret result.
    if (getSession() === undefined) {
      loadSequence.current++;
      setUser(undefined);
      setLoading(false);
      return;
    }
    const scope = captureSessionScope(),
      sequence = ++loadSequence.current;
    setLoading(true);
    setUser(undefined);
    setError(undefined);
    try {
      const next = await fetchUser();
      if (
        sequence !== loadSequence.current ||
        !isSessionScopeCurrent(scope) ||
        next.id !== scope.userId
      )
        return;
      setUser(next);
      setAvatarFailed(false);
      updateSessionIdentity({
        userId: next.id,
        userName: next.name ?? next.email,
        avatarUrl: next.avatar_url,
      });
    } catch (cause) {
      if (sequence === loadSequence.current && isSessionScopeCurrent(scope))
        setError(toAppError(cause));
    } finally {
      if (sequence === loadSequence.current && isSessionScopeCurrent(scope))
        setLoading(false);
    }
  }, [fetchUser]);

  useEffect(() => {
    setView('overview');
    load().catch(() => undefined);
    const requests = loadSequence;
    return () => {
      requests.current++;
    };
  }, [load, sessionUserId, sessionFamily, sessionWarehouse]);

  const goBack = useCallback(() => {
    if (view === 'password' || view === 'sessions') setView('security');
    else if (view !== 'overview') setView('overview');
    else onBack?.();
  }, [onBack, view]);

  useHardwareBack(() => {
    if (view === 'overview' || view === 'edit') return false;
    goBack();
    return true;
  });

  const handleLogout = useCallback(async () => {
    // Ref chặn đồng bộ hai lần tap trong cùng một frame, trước khi React kịp
    // commit state `loggingOut=true`.
    if (logoutInFlight.current) return;
    logoutInFlight.current = true;
    setLoggingOut(true);
    setConfirming(false);
    const logoutOperation = logoutFn();
    onLogoutStarted?.();
    logoutOperation.catch(() => undefined);
    setTimeout(() => {
      setLoggingOut(false);
      logoutInFlight.current = false;
      if (getSession() === undefined) onLoggedOut?.();
    }, 800);
  }, [logoutFn, onLoggedOut, onLogoutStarted]);

  const logoutDialog = (
    <Sheet
      visible={confirming}
      onDismiss={() => {
        if (!loggingOut) setConfirming(false);
      }}
      title="Đăng xuất khỏi WMS?"
      message="Phiên trên thiết bị này sẽ bị xóa. Bạn cần đăng nhập lại để tiếp tục."
    >
      <Button
        label="Đăng xuất"
        variant="danger"
        loading={loggingOut}
        onPress={() => {
          handleLogout().catch(() => undefined);
        }}
      />
      <Button
        label="Huỷ"
        variant="secondary"
        disabled={loggingOut}
        onPress={() => setConfirming(false)}
      />
    </Sheet>
  );

  if (loading && user === undefined) {
    return (
      <Page scroll={false}>
        <View style={styles.loading}>
          <Box card padding="xl" align="center" gap="md">
            <ActivityIndicator />
            <Text variant="body" tone="muted">
              Đang tải hồ sơ WMS...
            </Text>
          </Box>
        </View>
      </Page>
    );
  }

  if (error !== undefined && user === undefined) {
    return (
      <Page title="Cá nhân" scroll={false}>
        <View style={styles.loading}>
          <Box card padding="xl" gap="lg">
            <Banner
              tone="danger"
              title="Không tải được hồ sơ"
              message={messageForUser(error)}
            />
            <Button
              label="Thử lại"
              onPress={() => {
                load().catch(() => undefined);
              }}
            />
            <Button
              label="Đăng xuất trên thiết bị"
              variant="danger"
              onPress={() => setConfirming(true)}
            />
          </Box>
        </View>
        {logoutDialog}
      </Page>
    );
  }

  const displayName = shown(user?.name ?? user?.email, 'Chưa có tên hiển thị');
  const role = shown(user?.role, 'WMS chưa cung cấp vai trò');
  const avatar =
    !avatarFailed && user?.avatar_url ? (
      <Image
        accessibilityLabel={'Ảnh đại diện ' + displayName}
        source={{ uri: user.avatar_url }}
        onError={() => setAvatarFailed(true)}
        style={[styles.avatar, styles.avatarRound]}
      />
    ) : (
      <View
        style={[
          styles.avatar,
          styles.avatarFallback,
          { backgroundColor: theme.colors.primary },
        ]}
      >
        <Text variant="cardTitle" style={styles.avatarText}>
          {initials(displayName)}
        </Text>
      </View>
    );

  if (view === 'edit') {
    return (
      <ProfileEditScreen
        fetchUser={fetchUser}
        user={user}
        avatar={avatar}
        onBack={goBack}
        onUpdated={next => {
          setUser(next);
          updateSessionIdentity({
            userId: next.id,
            userName: next.name ?? next.email,
            avatarUrl: next.avatar_url,
          });
        }}
        updateProfileFn={updateProfileFn}
      />
    );
  }
  if (view === 'access') return <AccessScreen user={user} onBack={goBack} />;
  if (view === 'security')
    return (
      <SecurityScreen
        user={user}
        onBack={goBack}
        onPassword={() => setView('password')}
        onSessions={() => setView('sessions')}
      />
    );
  if (view === 'password')
    return (
      <P11PasswordScreen
        user={user}
        fetchUser={fetchUser}
        onBack={goBack}
        changePasswordFn={changePasswordFn}
      />
    );
  if (view === 'sessions')
    return (
      <P11SessionsScreen
        onBack={goBack}
        fetchSessionsFn={fetchSessionsFn}
        revokeSessionFn={revokeSessionFn}
      />
    );

  return (
    <Page scroll>
      <Box
        padding="lg"
        gap="lg"
        style={[
          styles.hero,
          {
            borderRadius: theme.radius.card,
            backgroundColor: theme.colors.primaryStrong,
          },
        ]}
      >
        <Text variant="screenTitle" style={styles.heroHeading}>
          Tài khoản của tôi
        </Text>
        <View style={[styles.heroBody, { gap: theme.spacing.lg }]}>
          {avatar}
          <View style={[styles.heroInfo, { gap: theme.spacing.xs }]}>
            <Text variant="cardTitle" style={styles.heroTitle}>
              {displayName}
            </Text>
            <Text variant="caption" style={styles.heroMeta}>
              {role}
            </Text>
            <Text variant="caption" style={styles.heroMeta}>
              {warehouseScope(user)}
            </Text>
          </View>
        </View>
      </Box>

      <Box gap="sm">
        <ProfileMenuRow
          icon="user"
          label="Chỉnh sửa hồ sơ"
          description="Cập nhật tên hiển thị và số điện thoại"
          onPress={() => setView('edit')}
        />
        <ProfileMenuRow
          icon="document"
          label="Công việc & quyền"
          description="Xem vai trò, phạm vi kho và quyền truy cập"
          onPress={() => setView('access')}
        />
        <ProfileMenuRow
          icon="shield-check"
          label="Tài khoản & bảo mật"
          description="Đổi mật khẩu và quản lý phiên đăng nhập"
          onPress={() => setView('security')}
        />
        <ProfileMenuRow
          icon="clock"
          label="Kết thúc ca"
          description="Chức năng ca làm việc chưa áp dụng"
          disabled
        />
        <ProfileMenuRow
          icon="logout"
          label="Đăng xuất"
          description="Thoát khỏi tài khoản hiện tại"
          danger
          onPress={() => setConfirming(true)}
        />
      </Box>

      <Text variant="caption" tone="muted" style={styles.footer}>
        Phiên bản {APP_VERSION}
        {'\n'}WMS Hoa Nam Scanner · {environment.label}
      </Text>

      {logoutDialog}
    </Page>
  );
}

function ProfileEditScreen({
  user,
  avatar,
  onBack,
  onUpdated,
  updateProfileFn,
  fetchUser,
}: {
  user: CurrentUser | undefined;
  avatar: React.ReactNode;
  onBack: () => void;
  onUpdated: (user: CurrentUser) => void;
  updateProfileFn: typeof updateCurrentProfile;
  fetchUser: () => Promise<CurrentUser>;
}): React.ReactElement {
  const [base, setBase] = useState(user);
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const latch = useRef(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const [review, setReview] = useState<CurrentUser>();
  const [leaving, setLeaving] = useState(false);
  const [unknown, setUnknown] = useState(() =>
    profileCommandBlocked('profile'),
  );
  const dirty =
    name.trim() !== (base?.name ?? '') || phone !== (base?.phone ?? '');
  const pendingExit = useRef<(() => void) | undefined>(undefined);
  const exitGuard = useRef<(proceed: () => void) => void>(() => undefined);
  exitGuard.current = proceed => {
    if (saving || dirty) {
      pendingExit.current = proceed;
      setLeaving(true);
    } else proceed();
  };
  useEffect(
    () => registerProfileExitGuard(proceed => exitGuard.current(proceed)),
    [],
  );
  const back = () => exitGuard.current(onBack);
  useHardwareBack(() => {
    back();
    return true;
  });
  const save = async () => {
    if (latch.current || unknown || conflict || !dirty) return;
    latch.current = true;
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    const scope = captureSessionScope();
    try {
      const next = await updateProfileFn(
        {
          ...(name.trim() === (base?.name ?? '') ? {} : { displayName: name }),
          ...(phone === (base?.phone ?? '')
            ? {}
            : { phone: phone === '' ? null : phone }),
        },
        base,
      );
      if (
        !alive.current ||
        !isSessionScopeCurrent(scope) ||
        next.id !== scope.userId
      )
        return;
      onUpdated(next);
      setBase(next);
      setName(next.name ?? '');
      setPhone(next.phone ?? '');
      setNotice('Đã cập nhật hồ sơ.');
    } catch (cause) {
      if (!alive.current || !isSessionScopeCurrent(scope)) return;
      setError(profileErrorMessage(cause));
      setUnknown(isProfileUnknown(cause));
      if (
        [412, 428].includes(toAppError(cause).status ?? 0) ||
        ['STALE_VERSION', 'PRECONDITION_REQUIRED'].includes(
          toAppError(cause).code ?? '',
        )
      )
        setConflict(true);
    } finally {
      latch.current = false;
      if (alive.current) setSaving(false);
    }
  };
  const reload = async () => {
    const scope = captureSessionScope();
    try {
      const next = await fetchUser();
      if (alive.current && isSessionScopeCurrent(scope)) setReview(next);
    } catch (cause) {
      if (alive.current && isSessionScopeCurrent(scope))
        setError(profileErrorMessage(cause));
    }
  };
  return (
    <Page title="Chỉnh sửa hồ sơ" onBack={back} scroll>
      {notice ? <Banner tone="success" message={notice} /> : null}
      {error ? (
        <Banner
          tone="danger"
          title={unknown ? 'Chưa xác định kết quả' : 'Không lưu được hồ sơ'}
          message={error}
        />
      ) : null}
      {conflict ? (
        <Button
          label="Tải hồ sơ mới để xem xét"
          onPress={() => {
            reload().catch(() => undefined);
          }}
        />
      ) : null}
      {review ? (
        <Box card padding="lg" gap="md">
          <Text>Hồ sơ hiện tại trên WMS</Text>
          <DefinitionRow label="Họ và tên" value={review.name} />
          <DefinitionRow
            label="Số điện thoại"
            value={review.phone ?? 'Chưa có'}
          />
          <Text>
            Thông tin đang nhập vẫn giữ nguyên. Xem xét trước khi lưu lại.
          </Text>
          <Button
            label="Đã xem xét, tiếp tục chỉnh sửa"
            onPress={() => {
              setBase(review);
              setReview(undefined);
              setConflict(false);
            }}
          />
        </Box>
      ) : null}
      <Box card padding="lg" align="center" gap="sm">
        {avatar}
        <Text variant="caption" tone="muted">
          Chưa hỗ trợ thay ảnh đại diện và biệt danh
        </Text>
      </Box>
      <Box card padding="lg" gap="md">
        <Input
          label="Họ và tên"
          value={name}
          onChangeText={setName}
          maxLength={255}
          editable={!saving}
        />
        <Input
          label="Số điện thoại"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={10}
          editable={!saving}
          helperText="Để trống để xóa số điện thoại"
        />
        <Input
          label="Email tài khoản"
          value={user?.email ?? ''}
          editable={false}
          helperText="Do quản trị viên quản lý"
        />
        <DefinitionRow label="Vai trò" value={user?.role} />
        <DefinitionRow label="Phạm vi kho" value={warehouseScope(user)} last />
      </Box>
      <Button
        label="Lưu thay đổi"
        loading={saving}
        disabled={
          unknown ||
          conflict ||
          !dirty ||
          base?.version === undefined ||
          name.trim() === ''
        }
        onPress={() => {
          save().catch(() => undefined);
        }}
      />
      <Text variant="caption" tone="muted" style={styles.footer}>
        Chỉ tên hiển thị và số điện thoại được phép cập nhật.
      </Text>
      <Sheet
        visible={leaving}
        onDismiss={() => setLeaving(false)}
        title="Thông tin chưa lưu"
        message={
          saving
            ? 'Đang xử lý yêu cầu. Vui lòng chờ kết quả.'
            : 'Rời màn hình sẽ bỏ nội dung đang chỉnh sửa; không tự lưu.'
        }
      >
        <Button label="Tiếp tục chỉnh sửa" onPress={() => setLeaving(false)} />
        <Button
          label="Bỏ thay đổi"
          disabled={saving}
          onPress={() => {
            const proceed = pendingExit.current ?? onBack;
            pendingExit.current = undefined;
            setLeaving(false);
            proceed();
          }}
        />
      </Sheet>
    </Page>
  );
}

const profileGroups: ReadonlyArray<{
  label: string;
  icon: HnHomeIconName;
  tone: keyof typeof HN_OPERATIONS;
}> = [
  { label: 'Nhập kho', icon: 'box', tone: 'inbound' },
  { label: 'Xuất kho', icon: 'up', tone: 'outbound' },
  { label: 'Bảo hành', icon: 'tool', tone: 'warranty' },
  { label: 'Thẻ NFC', icon: 'nfc', tone: 'nfc' },
  { label: 'Chứng từ', icon: 'document', tone: 'documents' },
  { label: 'Tra cứu', icon: 'scan', tone: 'lookup' },
];

function AccessScreen({
  user,
  onBack,
}: {
  user: CurrentUser | undefined;
  onBack: () => void;
}): React.ReactElement {
  const theme = useTheme();
  const permissions = user?.permissions ?? [];
  const [showPermissions, setShowPermissions] = useState(false);
  return (
    <Page title="Công việc & quyền" onBack={onBack} scroll>
      <Box card padding="lg" gap="sm">
        <Text variant="caption" tone="muted">
          Vai trò hiện tại
        </Text>
        <Text variant="cardTitle" tone="strong">
          {shown(user?.role)}
        </Text>
        <Text variant="caption" tone="muted">
          Vai trò và quyền do quản trị viên WMS cấp.
        </Text>
      </Box>
      <Box card padding="lg">
        <Text variant="caption" tone="muted">
          Kho làm việc
        </Text>
        <DefinitionRow label="Phạm vi" value={warehouseScope(user)} last />
      </Box>
      <Box card padding="lg" gap="md">
        <Text variant="body" tone="strong" style={styles.sectionTitle}>
          Quyền truy cập chức năng
        </Text>
        <View style={styles.groupGrid}>
          {profileGroups.map(group => (
            <View
              key={group.label}
              style={[
                styles.groupTile,
                { backgroundColor: HN_OPERATIONS[group.tone].soft },
              ]}
              accessible
              accessibilityLabel={
                group.label + '. Quyền theo nhóm chờ xác nhận'
              }
            >
              {group.tone === 'lookup' ? (
                <AppIcon
                  name="search"
                  size={28}
                  color={HN_OPERATIONS[group.tone].ink}
                />
              ) : (
                <HnHomeIcon
                  name={group.icon}
                  size={28}
                  strokeWidth={1.7}
                  color={HN_OPERATIONS[group.tone].ink}
                />
              )}
              <Text variant="caption" tone="strong">
                {group.label}
              </Text>
              <Text variant="caption" tone="muted">
                Chờ xác nhận
              </Text>
            </View>
          ))}
        </View>
        <Text variant="caption" tone="muted">
          Quyền theo nhóm đang chờ xác nhận. Quyền truy cập vẫn do WMS quản lý.
        </Text>
        <Button
          label={showPermissions ? 'Ẩn quyền chi tiết' : 'Xem quyền chi tiết'}
          variant="secondary"
          onPress={() => setShowPermissions(value => !value)}
        />
        {showPermissions ? (
          permissions.length === 0 ? (
            <Text variant="caption" tone="muted">
              WMS chưa cung cấp danh sách quyền chi tiết cho tài khoản này.
            </Text>
          ) : (
            permissions.map(permission => (
              <View
                key={permission}
                style={[styles.permission, { gap: theme.spacing.sm }]}
              >
                <AppIcon
                  name="check-circle"
                  color={theme.colors.success}
                  size={18}
                />
                <Text variant="caption" style={styles.permissionText}>
                  {permission}
                </Text>
              </View>
            ))
          )
        ) : null}
      </Box>
      <Banner
        tone="info"
        title="Công việc được giao"
        message="Chưa áp dụng. App không tạo danh sách công việc khi nghiệp vụ và API chưa được BA xác nhận."
      />
    </Page>
  );
}

function SecurityScreen({
  user,
  onBack,
  onPassword,
  onSessions,
}: {
  user: CurrentUser | undefined;
  onBack: () => void;
  onPassword: () => void;
  onSessions: () => void;
}): React.ReactElement {
  const session = getSession();
  const environment = getCurrentEnvironment();
  const [showInfo, setShowInfo] = useState(false);
  return (
    <Page title="Tài khoản & bảo mật" onBack={onBack} scroll>
      <Box gap="sm">
        <ProfileMenuRow
          icon="shield-check"
          label="Đổi mật khẩu"
          description="Cập nhật mật khẩu đăng nhập WMS"
          onPress={onPassword}
        />
        <ProfileMenuRow
          icon="clock"
          label="Phiên đăng nhập"
          description="Xem và thu hồi các thiết bị đã đăng nhập"
          onPress={onSessions}
        />
        <ProfileMenuRow
          icon="info"
          label="Thông tin bảo mật"
          description="Xem thông tin tài khoản và phiên hiện tại"
          onPress={() => setShowInfo(true)}
        />
      </Box>
      <Sheet
        visible={showInfo}
        onDismiss={() => setShowInfo(false)}
        title="Thông tin bảo mật"
      >
        <Box padding="lg">
          <DefinitionRow label="Tài khoản" value={user?.email ?? user?.name} />
          <DefinitionRow label="Thiết bị" value={getDeviceLabel()} />
          <DefinitionRow
            label="Lần xác thực gần nhất"
            value={formatSessionStartedAt(session?.issuedAtMs)}
          />
          <DefinitionRow label="Môi trường" value={environment.label} />
          <DefinitionRow label="Phiên bản" value={APP_VERSION} last />
        </Box>
        <Button label="Đóng" onPress={() => setShowInfo(false)} />
      </Sheet>
      <Banner
        tone="info"
        title="Bảo vệ tài khoản"
        message="Không chia sẻ mật khẩu. Thu hồi phiên lạ và báo quản trị viên nếu phát hiện thiết bị không nhận ra."
      />
    </Page>
  );
}
