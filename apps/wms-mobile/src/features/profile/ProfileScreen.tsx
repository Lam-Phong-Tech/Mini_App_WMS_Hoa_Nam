import {HN_UI} from '../../theme/uiKitV3';
import {p10LegacyPermissionDescription,p10TechnicalMappingNote} from './p10TechnicalMapping';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  View,
} from 'react-native';
import { APP_VERSION } from '../../api/userAgent';
import { formatVietnamDateTime } from '../../time/vietnamTime';
import {
  getSession,
  subscribeSession,
  captureSessionScope,
  isSessionScopeCurrent,
  updateSessionIdentity,
} from '../../auth/session';
import { useHardwareBack } from '../../app/useHardwareBack';
import { getCurrentEnvironment } from '../../config/env';
import { toAppError, type AppError } from '../../errors/AppError';
import { logout } from '../../services/wms/auth';
import {
  fetchCurrentProfile,
  updateCurrentProfile,
  changeProfilePassword,
  fetchProfileSessions,
  revokeProfileSession,
  profileCommandBlocked,
  isProfileUnknown,
  profileErrorMessage,
} from '../../services/wms/profile';
import type { CurrentUser } from '../../services/wms/types';
import { P11PasswordScreen, P11SessionsScreen } from './P11SecurityScreens';
import { registerProfileExitGuard } from './profileNavigation';
import {
  P10Action,
  P10Dialog,
  P10Field,
  P10Frame,
  P10Gradient,
  P10Group,
  P10Icon,
  P10Notice,
  P10Row,
  P10Text,
  P10Tile,
  useP10Scale,
} from './P10Frame';
import { HN_OPERATIONS } from '../../ui/hnHomeTokens';
import type { P10IconName } from './p10Icons';

type ProfileView =
  | 'overview'
  | 'edit'
  | 'access'
  | 'security'
  | 'password'
  | 'sessions';
export type ProfilePanel = 'S01' | 'S02' | 'S03' | 'S04' | 'dependency';
const shown = (v: string | null | undefined, fallback = 'Chưa có dữ liệu') =>
  v?.trim() || fallback;
const initials = (v: string) =>
  v
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map(p => p[0])
    .join('')
    .toUpperCase();
function warehouseScope(user: CurrentUser | undefined): string {
  if (user?.warehouse_context?.status === 'READY' && user.active_warehouse_id) {
    const w = user.available_warehouses?.find(
      r => r.warehouse_id === user.active_warehouse_id,
    );
    return w?.name ?? user.active_warehouse_id;
  }
  return user?.warehouse_context
    ? 'Ngữ cảnh kho: ' +
        user.warehouse_context.status +
        (user.warehouse_context.error_code
          ? ' · ' + user.warehouse_context.error_code
          : '')
    : 'WMS chưa cung cấp phạm vi kho';
}
function ProfileAvatar({
  user,
  editor = false,
}: {
  user: CurrentUser | undefined;
  editor?: boolean;
}) {
  const s = useP10Scale(),
    [failed, setFailed] = useState(false),
    name = shown(user?.name ?? user?.email, 'Chưa có tên hiển thị');
  useEffect(() => setFailed(false), [user?.id, user?.avatar_url]);
  return (
    <View
      accessibilityLabel={'Ảnh đại diện ' + name}
      style={{
        width: (editor ? 88 : 108) * s,
        height: (editor ? 88 : 108) * s,
        borderRadius: 54 * s,
        overflow: 'hidden',
        borderWidth: editor ? 0 : 3 * s,
        borderColor: HN_UI.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <P10Gradient avatar />
      {!failed && user?.avatar_url ? (
        <Image
          source={{ uri: user.avatar_url }}
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <P10Text size={42} weight="600" color={HN_UI.onBrand}>
          {initials(name)}
        </P10Text>
      )}
    </View>
  );
}
function ProfileHero({
  user,
  onEdit,
}: {
  user: CurrentUser | undefined;
  onEdit: () => void;
}) {
  const s = useP10Scale();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 22 * s,
        marginTop: 22 * s,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={'Chỉnh sửa hồ sơ của ' + shown(user?.name)}
        onPress={onEdit}
      >
        <ProfileAvatar user={user} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chỉnh sửa tên hiển thị"
          onPress={onEdit}
          style={{ minHeight: 44 * s, justifyContent: 'center' }}
        >
          <P10Text
            size={28}
            line={1.2}
            weight="700"
            color={HN_UI.onBrand}
            numberOfLines={3}
          >
            {shown(user?.name ?? user?.email, 'Chưa có tên hiển thị')}
          </P10Text>
        </Pressable>
        <P10Text size={19} color={HN_UI.onBrand} style={{ marginTop: 6 * s }}>
          {shown(user?.role, 'WMS chưa cung cấp vai trò')}
        </P10Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10 * s,
            marginTop: 6 * s,
          }}
        >
          <P10Icon name="pin" size={22} color={HN_UI.onBrand} />
          <P10Text size={19} weight="600" color={HN_UI.onBrand} style={{ flex: 1 }}>
            {warehouseScope(user)}
          </P10Text>
        </View>
      </View>
    </View>
  );
}
export interface ProfileScreenProps {
  onEndShift?: (user: CurrentUser | undefined) => void;
  onBack?: () => void;
  onLogoutStarted?: () => void;
  onLoggedOut?: () => void;
  onEditorChange?: (editing: boolean) => void;
  onPasswordFormActiveChange?: (active:boolean)=>void;
  onPanelChange?: (panel: ProfilePanel) => void;
  fetchUser?: typeof fetchCurrentProfile;
  logoutFn?: typeof logout;
  updateProfileFn?: typeof updateCurrentProfile;
  changePasswordFn?: typeof changeProfilePassword;
  fetchSessionsFn?: typeof fetchProfileSessions;
  revokeSessionFn?: typeof revokeProfileSession;
}
interface ProfileScrollPosition {
  initialScrollY: number;
  onScrollPositionChange(y: number): void;
}
export function ProfileScreen({
  onEndShift,
  onBack,
  onLogoutStarted,
  onLoggedOut,
  onEditorChange,
  onPasswordFormActiveChange,
  onPanelChange,
  fetchUser = fetchCurrentProfile,
  logoutFn = logout,
  updateProfileFn = updateCurrentProfile,
  changePasswordFn = changeProfilePassword,
  fetchSessionsFn = fetchProfileSessions,
  revokeSessionFn = revokeProfileSession,
}: ProfileScreenProps): React.ReactElement {
  const [session, setCurrentSession] = useState(getSession);
  useEffect(() => subscribeSession(setCurrentSession), []);
  const sessionUserId = session?.userId;
  const sessionFamily = session?.authSessionId;
  const sessionWarehouse = session?.activeWarehouseId;
  const profileScope = JSON.stringify([
    sessionUserId,
    sessionFamily,
    sessionWarehouse,
  ]);
  const positions = useRef<{
    scope: string;
    values: Partial<Record<ProfileView, number>>;
  }>({ scope: profileScope, values: {} });
  if (positions.current.scope !== profileScope)
    positions.current = { scope: profileScope, values: {} };
  const scrollPosition = (key: ProfileView): ProfileScrollPosition => ({
    initialScrollY: positions.current.values[key] ?? 0,
    onScrollPositionChange: y => {
      if (positions.current.scope === profileScope && Number.isFinite(y))
        positions.current.values[key] = Math.max(0, y);
    },
  });
  const loadSequence = useRef(0);
  const [view, setView] = useState<ProfileView>('overview');
  const [user, setUser] = useState<CurrentUser | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | undefined>();
  const [confirming, setConfirming] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutInFlight = useRef(false);

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

  useEffect(() => {
    onEditorChange?.(view === 'edit');
    onPanelChange?.(
      view === 'overview'
        ? 'S01'
        : view === 'edit'
        ? 'S02'
        : view === 'access'
        ? 'S03'
        : view === 'security'
        ? 'S04'
        : 'dependency',
    );
    return () => onEditorChange?.(false);
  }, [view, onEditorChange, onPanelChange]);
  useLayoutEffect(()=>{onPasswordFormActiveChange?.(view==='password');return()=>onPasswordFormActiveChange?.(false);},[view,onPasswordFormActiveChange]);
  const logoutDialog = (
    <P10Dialog
      visible={confirming}
      onDismiss={() => {
        if (!loggingOut) setConfirming(false);
      }}
      title="Đăng xuất tài khoản?"
      message="Bạn sẽ trở về màn hình đăng nhập. Đăng xuất không xác nhận kết thúc ca."
      busy={loggingOut}
    >
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <P10Action
            label="Huỷ"
            secondary
            disabled={loggingOut}
            onPress={() => setConfirming(false)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <P10Action
            label="Đăng xuất"
            danger
            disabled={loggingOut}
            onPress={() => {
              handleLogout().catch(() => undefined);
            }}
          />
        </View>
      </View>
    </P10Dialog>
  );
  if (loading && user === undefined)
    return (
      <P10Frame panel="S01" title="Tài khoản của tôi">
        <View
          style={{
            minHeight: 250,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
          }}
        >
          <ActivityIndicator />
          <P10Text>Đang tải hồ sơ WMS...</P10Text>
        </View>
      </P10Frame>
    );
  if (error && user === undefined)
    return (
      <P10Frame panel="S01" title="Tài khoản của tôi" overlay={logoutDialog}>
        <View style={{ gap: 16 }}>
          <P10Notice
            title="Không tải được hồ sơ"
            message={profileErrorMessage(error)}
          />
          <P10Action
            label="Thử lại"
            onPress={() => {
              load().catch(() => undefined);
            }}
          />
          <P10Action
            label="Đăng xuất trên thiết bị"
            danger
            onPress={() => setConfirming(true)}
          />
        </View>
      </P10Frame>
    );
  if (view === 'edit')
    return (
      <ProfileEditScreen
        scroll={scrollPosition('edit')}
        user={user}
        onBack={goBack}
        fetchUser={fetchUser}
        updateProfileFn={updateProfileFn}
        onUpdated={next => {
          setUser(next);
          updateSessionIdentity({
            userId: next.id,
            userName: next.name ?? next.email,
            avatarUrl: next.avatar_url,
          });
        }}
      />
    );
  if (view === 'access')
    return (
      <AccessScreen
        user={user}
        onBack={goBack}
        scroll={scrollPosition('access')}
      />
    );
  if (view === 'security')
    return (
      <SecurityScreen
        scroll={scrollPosition('security')}
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
    <P10Frame
      panel="S01"
      {...scrollPosition('overview')}
      title="Tài khoản của tôi"
      hero={<ProfileHero user={user} onEdit={() => setView('edit')} />}
      overlay={logoutDialog}
    >
      <OverviewMenus
        onEndShift={onEndShift ? () => onEndShift(user) : undefined}
        onEdit={() => setView('edit')}
        onAccess={() => setView('access')}
        onSecurity={() => setView('security')}
        onLogout={() => setConfirming(true)}
      />
    </P10Frame>
  );
}
function OverviewMenus({
  onEndShift,
  onEdit,
  onAccess,
  onSecurity,
  onLogout,
}: {
  onEndShift?: () => void;
  onEdit: () => void;
  onAccess: () => void;
  onSecurity: () => void;
  onLogout: () => void;
}) {
  const s = useP10Scale();
  return (
    <>
      <P10Group>
        <P10Row
          icon="user"
          label="Chỉnh sửa hồ sơ"
          accessibilityLabel="Chỉnh sửa hồ sơ. Cập nhật tên hiển thị và số điện thoại"
          onPress={onEdit}
        />
        <P10Row
          icon="briefcase"
          label="Công việc & quyền"
          accessibilityLabel="Công việc & quyền. Xem vai trò, phạm vi kho và quyền truy cập"
          last
          onPress={onAccess}
        />
        <P10Row
          icon="shield-check"
          label="Tài khoản & bảo mật"
          accessibilityLabel="Tài khoản & bảo mật. Đổi mật khẩu và quản lý phiên đăng nhập"
          last
          onPress={onSecurity}
        />
      </P10Group>
      <P10Group style={{ marginTop: 20 * s, paddingHorizontal: 0 }}>
        <P10Row
          icon="power"
          label="Kết thúc ca"
          description="Kiểm tra và kết thúc ca làm việc hiện tại"
          accessibilityLabel="Kết thúc ca. Kiểm tra nháp và yêu cầu đang chờ"
          disabled={!onEndShift}
          onPress={onEndShift}
          group={false}
        />
      </P10Group>
      <View style={{ marginTop: 20 * s }}>
        <P10Action
          label="Đăng xuất"
          accessibilityLabel="Đăng xuất. Thoát khỏi tài khoản hiện tại"
          danger
          onPress={onLogout}
        />
      </View>
    </>
  );
}
function ProfileEditScreen({
  user,
  onBack,
  onUpdated,
  updateProfileFn,
  fetchUser,
  scroll,
}: {
  scroll?: ProfileScrollPosition;
  user: CurrentUser | undefined;
  onBack: () => void;
  onUpdated: (u: CurrentUser) => void;
  updateProfileFn: typeof updateCurrentProfile;
  fetchUser: typeof fetchCurrentProfile;
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [avatarInfo, setAvatarInfo] = useState(false);
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
    const localErrors: Record<string, string> = {};
    if (!name.trim()) localErrors.display_name = 'Họ tên không được để trống.';
    if (phone !== '' && !/^0[0-9]{9}$/.test(phone))
      localErrors.phone = 'Số điện thoại phải gồm 10 chữ số, bắt đầu bằng 0.';
    setFieldErrors(localErrors);
    if (Object.keys(localErrors).length) return;
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
      setLeaving(false);
      pendingExit.current = undefined;
      setFeedbackOpen(true);
    } catch (cause) {
      if (!alive.current || !isSessionScopeCurrent(scope)) return;
      const fields = toAppError(cause).fieldErrors;
      if (fields && Object.keys(fields).length)
        setFieldErrors(
          Object.fromEntries(
            Object.entries(fields).map(([k, v]) => [k, v.join(' ')]),
          ),
        );
      else {
        setError(profileErrorMessage(cause));
        setFeedbackOpen(true);
      }
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
      if (alive.current && isSessionScopeCurrent(scope)) {
        setError(profileErrorMessage(cause));
        setFeedbackOpen(true);
      }
    }
  };

  const overlay = (
    <>
      <P10Dialog
        visible={feedbackOpen}
        title={
          notice
            ? 'Đã cập nhật hồ sơ'
            : unknown
            ? 'Chưa xác định kết quả'
            : 'Không lưu được hồ sơ'
        }
        message={notice ?? error}
        onDismiss={() => setFeedbackOpen(false)}
      >
        <P10Action
          label="Đóng"
          secondary
          onPress={() => setFeedbackOpen(false)}
        />
      </P10Dialog>
      <P10Dialog
        visible={leaving && !feedbackOpen}
        title="Thông tin chưa lưu"
        message={
          saving
            ? 'Đang xử lý yêu cầu. Vui lòng chờ kết quả.'
            : 'Rời màn hình sẽ bỏ nội dung đang chỉnh sửa; không tự lưu.'
        }
        onDismiss={() => setLeaving(false)}
        busy={saving}
      >
        <P10Action
          label="Tiếp tục chỉnh sửa"
          secondary
          onPress={() => setLeaving(false)}
        />
        <P10Action
          label="Bỏ thay đổi"
          disabled={saving}
          onPress={() => {
            const proceed = pendingExit.current ?? onBack;
            pendingExit.current = undefined;
            setLeaving(false);
            proceed();
          }}
        />
      </P10Dialog>
      <P10Dialog
        visible={avatarInfo && !feedbackOpen && !leaving}
        title="Ảnh đại diện"
        message="Chưa hỗ trợ thay ảnh đại diện và biệt danh. Ảnh hiện tại được giữ nguyên."
        onDismiss={() => setAvatarInfo(false)}
      >
        <P10Action
          label="Đóng"
          secondary
          onPress={() => setAvatarInfo(false)}
        />
      </P10Dialog>
    </>
  );
  return (
    <P10Frame
      panel="S02"
      {...scroll}
      title="Chỉnh sửa hồ sơ"
      onBack={back}
      overlay={overlay}
      footer={
        <EditFooter
          dirty={dirty}
          busy={saving}
          blocked={
            unknown ||
            conflict ||
            base?.version === undefined ||
            name.trim() === ''
          }
          onSave={() => {
            save().catch(() => undefined);
          }}
        />
      }
    >
      {conflict ? (
        <View style={{ gap: 12, marginBottom: 12 }}>
          <P10Action
            label="Tải hồ sơ mới để xem xét"
            secondary
            onPress={() => {
              reload().catch(() => undefined);
            }}
          />
          {review ? (
            <View>
              <P10Text weight="700">Hồ sơ hiện tại trên WMS</P10Text>
              <P10Text>{review.name}</P10Text>
              <P10Text>{review.phone ?? 'Chưa có'}</P10Text>
              <P10Text>
                Thông tin đang nhập vẫn giữ nguyên. Xem xét trước khi lưu lại.
              </P10Text>
              <P10Action
                label="Đã xem xét, tiếp tục chỉnh sửa"
                secondary
                onPress={() => {
                  setBase(review);
                  setReview(undefined);
                  setConflict(false);
                }}
              />
            </View>
          ) : null}
        </View>
      ) : null}
      {unknown && !feedbackOpen ? (
        <P10Notice
          title="Chưa xác định kết quả"
          message="Không gửi lại yêu cầu. Đọc lại hồ sơ không chứng minh kết quả yêu cầu cũ."
        />
      ) : null}
      <EditAvatarCard user={user} onPress={() => setAvatarInfo(true)} />
      <P10Field
        label="Họ và tên"
        required
        icon="user"
        value={name}
        onChangeText={v => {
          setName(v);
          setFieldErrors(e => ({ ...e, display_name: '' }));
        }}
        maxLength={255}
        editable={!saving}
        errorText={fieldErrors.display_name || undefined}
      />
      <P10Field
        label="Biệt danh"
        icon="user"
        locked
        value=""
        placeholder="Chưa hỗ trợ"
      />
      <P10Field
        label="Số điện thoại"
        icon="phone"
        value={phone}
        onChangeText={v => {
          setPhone(v);
          setFieldErrors(e => ({ ...e, phone: '' }));
        }}
        keyboardType="phone-pad"
        maxLength={10}
        editable={!saving}
        errorText={fieldErrors.phone || undefined}
        onClear={() => {
          if (!saving) setPhone('');
        }}
      />
      <P10Field
        label="Email tài khoản"
        icon="mail"
        locked
        value={user?.email ?? ''}
        placeholder="Chưa có dữ liệu"
      />
      <AdminNote />
      <P10Field
        label="Vai trò"
        icon="user"
        locked
        value={user?.role ?? ''}
        placeholder="Chưa có dữ liệu"
      />
      <P10Field
        label="Kho làm việc"
        icon="house"
        locked
        value={warehouseScope(user)}
      />
    </P10Frame>
  );
}
function AdminNote() {
  const s = useP10Scale();
  return (
    <P10Text
      size={14}
      color={HN_UI.textSecondary}
      style={{ textAlign: 'center', marginTop: 7 * s }}
    >
      Email, vai trò và kho do quản trị viên quản lý
    </P10Text>
  );
}
function EditAvatarCard({
  user,
  onPress,
}: {
  user: CurrentUser | undefined;
  onPress: () => void;
}) {
  const s = useP10Scale();
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: HN_UI.border,
        borderRadius: 14 * s,
        paddingVertical: 10 * s,
        paddingHorizontal: 12 * s,
        backgroundColor: HN_UI.canvas,
        marginBottom: 8 * s,
      }}
    >
      <P10Text size={21} line={1.35} weight="700">
        Ảnh đại diện
      </P10Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Thay đổi ảnh đại diện"
        onPress={onPress}
        style={{ alignSelf: 'center', marginTop: 4 * s, marginBottom: 8 * s }}
      >
        <ProfileAvatar user={user} editor />
        <View
          style={{
            position: 'absolute',
            right: -6 * s,
            bottom: -5 * s,
            width: 48 * s,
            height: 48 * s,
            borderRadius: 24 * s,
            borderWidth: 3 * s,
            borderColor: HN_UI.surface,
            backgroundColor: HN_UI.primary,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <P10Icon name="camera" size={24} color={HN_UI.onBrand} />
        </View>
      </Pressable>
      <P10Text size={17} color={HN_UI.textMuted} style={{ textAlign: 'center' }}>
        Chưa hỗ trợ thay ảnh đại diện
      </P10Text>
    </View>
  );
}
function EditFooter({
  dirty,
  busy,
  blocked,
  onSave,
}: {
  dirty: boolean;
  busy: boolean;
  blocked: boolean;
  onSave: () => void;
}) {
  const s = useP10Scale();
  return (
    <>
      <P10Text
        size={16}
        color={HN_UI.textMuted}
        accessibilityLiveRegion="polite"
        style={{ minHeight: 22 * s, marginBottom: 8 * s, textAlign: 'center' }}
      >
        {busy ? 'Đang lưu thay đổi…' : dirty ? 'Có thay đổi chưa lưu' : ''}
      </P10Text>
      <P10Action
        label="Lưu thay đổi"
        arrow
        disabled={blocked || !dirty}
        busy={busy}
        onPress={onSave}
      />
    </>
  );
}
const profileGroups: ReadonlyArray<{
  label: string;
  icon: P10IconName;
  tone: keyof typeof HN_OPERATIONS;
}> = [
  { label: 'Nhập kho', icon: 'box', tone: 'inbound' },
  { label: 'Xuất kho', icon: 'up', tone: 'outbound' },
  { label: 'Bảo hành', icon: 'tool', tone: 'warranty' },
  { label: 'Thẻ NFC', icon: 'nfc', tone: 'nfc' },
  { label: 'Chứng từ', icon: 'document', tone: 'documents' },
  { label: 'Tra cứu', icon: 'search', tone: 'lookup' },
];
function WorkCard({
  title,
  icon,
  value,
  description,
}: {
  title: string;
  icon: P10IconName;
  value: string;
  description: string;
}) {
  const s = useP10Scale();
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: HN_UI.border,
        borderRadius: 14 * s,
        backgroundColor: HN_UI.canvas,
        marginBottom: 14 * s,
        overflow: 'hidden',
      }}
    >
      <P10Text
        size={20}
        line={1.35}
        weight="700"
        style={{ paddingVertical: 8 * s, paddingHorizontal: 12 * s }}
      >
        {title}
      </P10Text>
      <View
        style={{
          flexDirection: 'row',
          gap: 16 * s,
          paddingVertical: 10 * s,
          paddingHorizontal: 12 * s,
          backgroundColor: HN_UI.surface,
          alignItems: 'flex-start',
        }}
      >
        <P10Tile icon={icon} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <P10Text size={19} weight="700">
            {value}
          </P10Text>
          <P10Text
            size={15}
            line={1.4}
            color={HN_UI.textMuted}
            style={{ marginTop: 6 * s }}
          >
            {description}
          </P10Text>
        </View>
        <P10Icon name="lock" size={20} color={HN_UI.textSecondary} />
      </View>
    </View>
  );
}
function AccessScreen({
  user,
  onBack,
  scroll,
}: {
  scroll?: ProfileScrollPosition;
  user: CurrentUser | undefined;
  onBack: () => void;
}) {
  const s = useP10Scale(),
    [details, setDetails] = useState(false);
  return (
    <P10Frame
      panel="S03"
      {...scroll}
      title="Công việc & quyền"
      onBack={onBack}
      overlay={
        <P10Dialog
          visible={details}
          title="Quyền chi tiết"
          onDismiss={() => setDetails(false)}
        >
          <P10Text>
            {Array.isArray(user?.permissions)
              ? user.permissions.length
                ? user.permissions.join('\n')
                : 'WMS trả về danh sách quyền chi tiết rỗng. Chưa có mapping quyền theo nhóm chức năng.'
              : 'WMS chưa cung cấp danh sách quyền chi tiết.'}
          </P10Text>
          <P10Text>{p10TechnicalMappingNote()}</P10Text>
          <P10Action label="Đóng" secondary onPress={() => setDetails(false)} />
        </P10Dialog>
      }
    >
      <WorkCard
        title="Vai trò hiện tại"
        icon="user"
        value={shown(user?.role)}
        description="Thực hiện các nghiệp vụ kho theo phân quyền của quản trị viên."
      />
      <WorkCard
        title="Kho làm việc"
        icon="house"
        value={warehouseScope(user)}
        description={
          'Được quản lý và thao tác trên dữ liệu của ' +
          warehouseScope(user) +
          '.'
        }
      />
      <P10Text size={21} line={1.35} weight="700">
        Quyền truy cập chức năng
      </P10Text>
      <P10Text size={17} color={HN_UI.textSecondary} style={{ marginTop: 4 * s }}>
        {p10LegacyPermissionDescription(user?.permissions)}
      </P10Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 12 * s,
          marginTop: 14 * s,
          marginBottom: 8 * s,
        }}
      >
        {profileGroups.map(g => (
          <View
            key={g.label}
            accessible
            accessibilityLabel={g.label + '. Quyền theo nhóm chờ xác nhận'}
            style={{
              flexBasis: '30%',
              flexGrow: 1,
              minWidth: 0,
              paddingVertical: 10 * s,
              paddingHorizontal: 5 * s,
              gap: 6 * s,
              alignItems: 'center',
              borderRadius: 14 * s,
              backgroundColor: HN_UI.canvas,
            }}
          >
            <P10Tile
              icon={g.icon}
              ink={HN_OPERATIONS[g.tone].ink}
              soft={HN_OPERATIONS[g.tone].soft}
            />
            <P10Text size={16} weight="700">
              {g.label}
            </P10Text>
            <View
              style={{
                position: 'absolute',
                right: 6 * s,
                top: 6 * s,
                width: 24 * s,
                height: 24 * s,
                borderRadius: 12 * s,
                borderWidth: 2 * s,
                borderColor: HN_UI.surface,
                backgroundColor: HN_UI.selected,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <P10Text size={15} weight="700" color={HN_UI.textMuted}>
                —
              </P10Text>
            </View>
          </View>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Xem quyền chi tiết"
        onPress={() => setDetails(true)}
      >
        <P10Text size={15} color={HN_UI.textSecondary}>
          Chưa xác minh quyền của từng chức năng. Xem quyền chi tiết.
        </P10Text>
      </Pressable>
      <View style={{ marginTop: 16 * s }}>
        <P10Notice
          compact
          title="Quyền do quản trị viên cấp"
          message="Vui lòng liên hệ quản trị viên nếu cần thay đổi quyền truy cập."
        />
      </View>
    </P10Frame>
  );
}
function SecurityScreen({
  user,
  onBack,
  onPassword,
  onSessions,
  scroll,
}: {
  scroll?: ProfileScrollPosition;
  user: CurrentUser | undefined;
  onBack: () => void;
  onPassword: () => void;
  onSessions: () => void;
}) {
  const s = useP10Scale(),
    [info, setInfo] = useState(false),
    session = getSession(),
    env = getCurrentEnvironment();
  const time = formatVietnamDateTime(session?.issuedAtMs, {
    missing: 'Chưa xác định',
  });
  return (
    <P10Frame
      panel="S04"
      {...scroll}
      title="Tài khoản & bảo mật"
      onBack={onBack}
      overlay={
        <P10Dialog
          visible={info}
          title="Thông tin bảo mật"
          onDismiss={() => setInfo(false)}
        >
          <P10Text>
            Hãy sử dụng mật khẩu mạnh và giữ an toàn thiết bị đăng nhập để bảo
            vệ tài khoản.
          </P10Text>
          <P10Text>{'Tài khoản: ' + shown(user?.email ?? user?.name)}</P10Text>
          <P10Text>{'Thiết bị: ' + Platform.OS}</P10Text>
          <P10Text>{'Lần xác thực gần nhất: ' + time}</P10Text>
          <P10Text>{'Môi trường: ' + env.label}</P10Text>
          <P10Text>{'Phiên bản: ' + APP_VERSION}</P10Text>
          <P10Action label="Đóng" secondary onPress={() => setInfo(false)} />
        </P10Dialog>
      }
    >
      <P10Group>
        <P10Row
          icon="lock"
          label="Đổi mật khẩu"
          accessibilityLabel="Đổi mật khẩu. Cập nhật mật khẩu đăng nhập WMS"
          onPress={onPassword}
        />
        <P10Row
          icon="smartphone"
          label="Phiên đăng nhập"
          last
          accessibilityLabel="Phiên đăng nhập. Xem và thu hồi các thiết bị đã đăng nhập"
          onPress={onSessions}
        />
        <P10Row
          icon="shield-check"
          label="Thông tin bảo mật"
          last
          accessibilityLabel="Thông tin bảo mật. Xem thông tin tài khoản và phiên hiện tại"
          onPress={() => setInfo(true)}
        />
      </P10Group>
      <View style={{ marginTop: 24 * s }}>
        <P10Notice
          title="Bảo vệ tài khoản của bạn"
          message="Hãy sử dụng mật khẩu mạnh và giữ an toàn thiết bị đăng nhập để bảo vệ tài khoản."
        />
      </View>
    </P10Frame>
  );
}
