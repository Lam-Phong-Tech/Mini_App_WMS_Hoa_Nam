import {HN_UI} from '../../theme/uiKitV3';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {ScannerTextInput as TextInput} from '../../ui/ScannerTextInput';
import {ActivityIndicator,View} from 'react-native';
import { useHardwareBack } from '../../app/useHardwareBack';
import { AppError } from '../../errors/AppError';
import { type CurrentUser } from '../../services/wms/types';
import {
  validateSecurityPasswords,
  type PasswordInput,
  type PasswordFieldErrors,
} from '../../contracts/p11Security';
import {
  canRevokeSecuritySession,
  captureSecurityOwner,
  isSecurityOwnerCurrent,
  securityContextFromProfile,
  securityContextWithPolicy,
  securityCommandBlocked,
  subscribeSecurityCommands,
  isSecurityUnknown,
  securityFieldErrors,
  type SecurityContext,
  type SecuritySession,
  type SecuritySessionPage,
  type PasswordChangeResult,
  changeSecurityPassword,
  fetchSecuritySessions,
  revokeSecuritySession,
} from '../../services/wms/security';
import { Dialog } from '../../ui/Dialog';
import { P11Frame, P11Button, P11Text, P11Hint, useP11Scale } from './P11Frame';
import {
  P11PasswordField,
  P11FormContent,
  P11SuccessContent,
  P11SessionCard,
} from './P11Presentation';
import { formatVietnamDateTime } from '../../time/vietnamTime';

const emptyFields: PasswordInput = {
  currentPassword: '',
  newPassword: '',
  newPasswordConfirmation: '',
};
export function securityTime(value: string | null | undefined): string {
  return formatVietnamDateTime(value, {
    seconds: true,
    missing: 'Chưa có thời điểm từ WMS',
  });
}
const message = (cause: unknown) =>
  cause instanceof AppError
    ? cause.message
    : 'Không xử lý được yêu cầu bảo mật.';
export function P11PasswordScreen({
  user,
  fetchUser,
  onBack,
  changePasswordFn = changeSecurityPassword,
  initialContext,
}: {
  user: CurrentUser | undefined;
  fetchUser: () => Promise<CurrentUser>;
  onBack: () => void;
  changePasswordFn?: typeof changeSecurityPassword;
  initialContext?: SecurityContext;
}): React.ReactElement {
  const [context, setContext] = useState<SecurityContext | undefined>(
    initialContext,
  );
  const [policyLoading, setPolicyLoading] = useState(false);
  const [fields, setFields] = useState<PasswordInput>(emptyFields),
    [errors, setErrors] = useState<PasswordFieldErrors>({});
  const [visible, setVisible] = useState<
      Partial<Record<keyof PasswordInput, boolean>>
    >({}),
    [saving, setSaving] = useState(false),
    [notice, setNotice] = useState<string>();
  const [unknown, setUnknown] = useState(() =>
    securityCommandBlocked('password'),
  );
  useEffect(
    () =>
      subscribeSecurityCommands(() =>
        setUnknown(securityCommandBlocked('password')),
      ),
    [],
  );
  const alive = useRef(true),
    latch = useRef(false),
    values = useRef<PasswordInput>(emptyFields),
    owner = useRef(captureSecurityOwner()),
    sequence = useRef(0);
  const clean = () => {
    values.current = emptyFields;
    setFields(emptyFields);
    setVisible({});
  };
  const currentRef = useRef<React.ComponentRef<typeof TextInput> | null>(null),
    newRef = useRef<React.ComponentRef<typeof TextInput> | null>(null),
    confirmationRef = useRef<React.ComponentRef<typeof TextInput> | null>(null);
  const pendingErrorFocus = useRef<keyof PasswordInput | undefined>(undefined);
  useEffect(() => {
    // Server errors arrive while the fields are disabled. Wait for the render
    // that enables them again before asking the native input to take focus.
    if (saving || unknown || !pendingErrorFocus.current) return;
    const key = pendingErrorFocus.current;
    pendingErrorFocus.current = undefined;
    const ref =
      key === 'currentPassword'
        ? currentRef
        : key === 'newPassword'
        ? newRef
        : confirmationRef;
    // The native editable prop is committed asynchronously on Android. Focus
    // on the next UI frame, and cancel it if the field state changes or exits.
    const frame = requestAnimationFrame(() => ref.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [saving, unknown, errors]);
  const inputRefs = {
    currentPassword: currentRef,
    newPassword: newRef,
    newPasswordConfirmation: confirmationRef,
  };
  const focusError = (next: PasswordFieldErrors) => {
    const key = (Object.keys(next) as (keyof PasswordInput)[])[0];
    if (key) inputRefs[key].current?.focus();
  };
  useEffect(() => {
    try {
      if (user) setContext(securityContextFromProfile(user));
    } catch {
      setContext(undefined);
    }
  }, [user]);
  useEffect(() => {
    alive.current = true;
    const requests = sequence;
    return () => {
      alive.current = false;
      values.current = emptyFields;
      requests.current++;
    };
  }, []);
  const back = () => {
    if (latch.current) return;
    clean();
    onBack();
  };
  useHardwareBack(() => {
    back();
    return true;
  });
  const reloadPolicy = async () => {
    const request = ++sequence.current;
    setPolicyLoading(true);
    try {
      const next = await fetchUser();
      if (
        alive.current &&
        request === sequence.current &&
        isSecurityOwnerCurrent(owner.current)
      )
        setContext(securityContextFromProfile(next));
    } catch (cause) {
      if (alive.current && request === sequence.current)
        setNotice(message(cause));
    } finally {
      if (alive.current && request === sequence.current)
        setPolicyLoading(false);
    }
  };
  const edit = (key: keyof PasswordInput, value: string) => {
    if (latch.current || unknown) return;
    const next = { ...values.current, [key]: value };
    values.current = next;
    setFields(next);
    setErrors(current => ({
      ...current,
      [key]: undefined,
      ...(key === 'newPassword' || key === 'newPasswordConfirmation'
        ? {
            newPasswordConfirmation:
              next.newPasswordConfirmation &&
              next.newPasswordConfirmation !== next.newPassword
                ? 'Mật khẩu xác nhận chưa khớp.'
                : undefined,
          }
        : {}),
    }));
  };
  const submit = async () => {
    if (
      latch.current ||
      unknown ||
      !context ||
      !isSecurityOwnerCurrent(context.owner)
    )
      return;
    const local = validateSecurityPasswords(values.current, context.policy);
    setErrors(local);
    if (Object.keys(local).length) {
      focusError(local);
      return;
    }
    latch.current = true;
    setSaving(true);
    setNotice(undefined);
    const captured = owner.current;
    try {
      await changePasswordFn(values.current, { context });
      if (alive.current) {
        clean();
      }
    } catch (cause) {
      if (!alive.current || !isSecurityOwnerCurrent(captured)) return;
      const fieldErrors = securityFieldErrors(cause);
      setErrors(fieldErrors);
      pendingErrorFocus.current = (
        Object.keys(fieldErrors) as (keyof PasswordInput)[]
      )[0];
      if (cause instanceof AppError && cause.passwordPolicy)
        setContext(securityContextWithPolicy(context, cause.passwordPolicy));
      setUnknown(isSecurityUnknown(cause));
      if (!Object.keys(securityFieldErrors(cause)).length)
        setNotice(message(cause));
    } finally {
      latch.current = false;
      if (alive.current && isSecurityOwnerCurrent(captured)) setSaving(false);
    }
  };
  const policy = context?.policy;
  const labels: Record<keyof PasswordInput, string> = {
    currentPassword: 'Mật khẩu hiện tại',
    newPassword: 'Mật khẩu mới',
    newPasswordConfirmation: 'Xác nhận mật khẩu mới',
  };
  return (
    <P11Frame
      title="Đổi mật khẩu"
      onBack={back}
      panel={Object.values(errors).some(Boolean) ? 'S02' : 'S01'}
      footer={
        <P11Button
          label="Lưu mật khẩu"
          accessibilityLabel="Cập nhật mật khẩu"
          arrow
          disabled={!context || unknown}
          busy={saving}
          onPress={() => {
            submit().catch(() => undefined);
          }}
        />
      }
    >
      <P11FormContent
        policy={policy}
        saving={saving}
        policyLoading={policyLoading}
        unknown={unknown}
        onReload={() => {
          reloadPolicy().catch(() => undefined);
        }}
      >
        {(Object.keys(labels) as (keyof PasswordInput)[]).map(key => (
          <P11PasswordField
            key={key}
            inputRef={inputRefs[key]}
            label={labels[key]}
            value={fields[key]}
            onChangeText={value => edit(key, value)}
            secureTextEntry={!visible[key]}
            editable={!saving && !unknown}
            errorText={errors[key]}
            onToggleVisible={() => setVisible(v => ({ ...v, [key]: !v[key] }))}
          />
        ))}
      </P11FormContent>
      {unknown && !saving ? (
        <P11Button
          label="Thông tin yêu cầu đang chờ"
          variant="secondary"
          onPress={() =>
            setNotice(
              'Yêu cầu chưa rõ kết quả. Chưa có API đối chiếu; không gửi lại. Liên hệ DEV/BE để kiểm tra.',
            )
          }
        />
      ) : null}
      <Dialog
        visible={notice !== undefined}
        title={unknown ? 'Chưa xác định kết quả' : 'Thông báo bảo mật'}
        message={notice}
        dismissOnBackdrop={false}
        onDismiss={() => setNotice(undefined)}
      >
        <P11Button small label="Đóng" onPress={() => setNotice(undefined)} />
      </Dialog>
    </P11Frame>
  );
}

export function P11SessionsScreen({
  onBack,
  fetchSessionsFn = fetchSecuritySessions,
  revokeSessionFn = revokeSecuritySession,
}: {
  onBack: () => void;
  fetchSessionsFn?: typeof fetchSecuritySessions;
  revokeSessionFn?: typeof revokeSecuritySession;
}): React.ReactElement {
  const [details, setDetails] = useState<SecuritySession>();
  const [result, setResult] = useState<SecuritySessionPage>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string>(),
    [target, setTarget] = useState<SecuritySession>(),
    [revoking, setRevoking] = useState(false),
    [notice, setNotice] = useState<string>(),
    [mutationError, setMutationError] = useState<string>(),
    [unknown, setUnknown] = useState(() => securityCommandBlocked('revoke'));
  const [confirmed, setConfirmed] = useState<readonly string[]>([]);
  const latch = useRef(false),
    sequence = useRef(0),
    alive = useRef(true),
    latest = useRef<SecuritySessionPage | undefined>(undefined);
  const load = useCallback(
    async (page = 1) => {
      const owner = captureSecurityOwner(),
        request = ++sequence.current;
      setLoading(true);
      setError(undefined);
      setTarget(undefined);
      try {
        const next = await fetchSessionsFn({}, page, 20);
        if (
          alive.current &&
          request === sequence.current &&
          isSecurityOwnerCurrent(owner)
        ) {
          latest.current = next;
          setResult(next);
        }
      } catch (cause) {
        if (
          alive.current &&
          request === sequence.current &&
          isSecurityOwnerCurrent(owner)
        )
          setError(message(cause));
      } finally {
        if (
          alive.current &&
          request === sequence.current &&
          isSecurityOwnerCurrent(owner)
        )
          setLoading(false);
      }
    },
    [fetchSessionsFn],
  );
  useEffect(() => {
    alive.current = true;
    const requests = sequence;
    load().catch(() => undefined);
    return () => {
      alive.current = false;
      requests.current++;
      latest.current = undefined;
    };
  }, [load]);
  const back = () => {
    if (!latch.current) onBack();
  };
  useHardwareBack(() => {
    if (target && !revoking) {
      setTarget(undefined);
      return true;
    }
    back();
    return true;
  });
  const allowed = (item: SecuritySession) =>
    !!result &&
    !loading &&
    !error &&
    !revoking &&
    !unknown &&
    !confirmed.includes(item.stableSessionId) &&
    canRevokeSecuritySession(item, result);
  const revoke = async () => {
    const page = latest.current;
    if (
      !target ||
      !page ||
      latch.current ||
      loading ||
      error ||
      unknown ||
      confirmed.includes(target.stableSessionId) ||
      !canRevokeSecuritySession(target, page)
    )
      return;
    latch.current = true;
    setRevoking(true);
    setError(undefined);
    setDetails(undefined);
    const owner = captureSecurityOwner();
    try {
      await revokeSessionFn(target, {}, page);
      if (!alive.current || !isSecurityOwnerCurrent(owner)) return;
      setConfirmed(ids => [...ids, target.stableSessionId]);
      setTarget(undefined);
      setNotice('WMS đã xác nhận thu hồi phiên được chọn.');
      await load(page.meta.current_page);
    } catch (cause) {
      if (alive.current && isSecurityOwnerCurrent(owner)) {
        setMutationError(message(cause));
        setError('Cần tải lại danh sách trước khi chọn phiên.');
        setUnknown(isSecurityUnknown(cause));
        setTarget(undefined);
      }
    } finally {
      latch.current = false;
      if (alive.current && isSecurityOwnerCurrent(owner)) setRevoking(false);
    }
  };
  return (
    <P11Frame title="Phiên đăng nhập" onBack={back} panel="S04">
      <P11SessionList
        result={result}
        loading={loading}
        error={error}
        unknown={unknown}
        revoking={revoking}
        confirmed={confirmed}
        allowed={allowed}
        onReload={() => {
          load(result?.meta.current_page ?? 1).catch(() => undefined);
        }}
        onPage={page => {
          load(page).catch(() => undefined);
        }}
        onSelect={item => {
          if (allowed(item)) setTarget(item);
        }}
        onDetails={setDetails}
        onUnknown={() => setMutationError('Danh sách chỉ là hiện trạng; không chứng minh yêu cầu trước. Chưa thể gửi lại lệnh thu hồi. Liên hệ DEV/BE để kiểm tra.')}
      />
      <Dialog
        visible={details !== undefined}
        title="Thông tin phiên"
        dismissOnBackdrop={false}
        onDismiss={() => setDetails(undefined)}
        message={
          details
            ? [
                `Thiết bị: ${
                  details.deviceLabel ?? 'Chưa có thông tin thiết bị'
                }`,
                `IP lưu từ request, chưa xác minh: ${
                  details.ipAddress ?? 'WMS chưa cung cấp'
                }`,
                `User-Agent lưu từ request, chưa xác minh: ${
                  details.userAgent ?? 'WMS chưa cung cấp'
                }`,
              ].join('\n\n')
            : undefined
        }
      >
        <P11Button small label="Đóng" onPress={() => setDetails(undefined)} />
      </Dialog>
      <Dialog
        visible={target !== undefined}
        title="Thu hồi phiên đăng nhập?"
        message="Thu hồi đúng nhóm phiên được chọn. Phiên hiện tại vẫn giữ nguyên."
        dismissible={!revoking}
        dismissOnBackdrop={false}
        onDismiss={() => {
          if (!revoking) setTarget(undefined);
        }}
      >
        <P11Button
          small
          label="Huỷ"
          variant="secondary"
          disabled={revoking}
          onPress={() => setTarget(undefined)}
        />
        <P11Button
          small
          label="Xác nhận thu hồi"
          variant="danger"
          busy={revoking}
          onPress={() => {
            revoke().catch(() => undefined);
          }}
        />
      </Dialog>
      <Dialog
        visible={notice !== undefined}
        title="Đã thu hồi phiên"
        message={notice}
        dismissOnBackdrop={false}
        onDismiss={() => setNotice(undefined)}
      >
        <P11Button small label="Đóng" onPress={() => setNotice(undefined)} />
      </Dialog>
      <Dialog
        visible={mutationError !== undefined}
        title={
          unknown ? 'Chưa xác định kết quả thu hồi' : 'Không thu hồi được phiên'
        }
        message={mutationError}
        dismissOnBackdrop={false}
        onDismiss={() => setMutationError(undefined)}
      >
        <P11Button
          small
          label="Đóng"
          onPress={() => setMutationError(undefined)}
        />
      </Dialog>
    </P11Frame>
  );
}

function P11SessionList({
  result,
  loading,
  error,
  unknown,
  revoking,
  confirmed,
  allowed,
  onReload,
  onPage,
  onSelect,
  onDetails,
  onUnknown,
}: {
  result?: SecuritySessionPage;
  loading: boolean;
  error?: string;
  unknown: boolean;
  revoking: boolean;
  confirmed: readonly string[];
  allowed: (item: SecuritySession) => boolean;
  onReload: () => void;
  onPage: (page: number) => void;
  onSelect: (item: SecuritySession) => void;
  onDetails: (item: SecuritySession) => void;
  onUnknown: () => void;
}): React.ReactElement {
  const s = useP11Scale();
  const current =
    result?.items.filter(
      item => item.stableSessionId === result.currentStableSessionId,
    ) ?? [];
  const others =
    result?.items.filter(
      item => item.stableSessionId !== result.currentStableSessionId,
    ) ?? [];
  return (
    <>
      {loading ? <ActivityIndicator /> : null}
      {error ? (
        <P11Text size={18} color={HN_UI.danger} accessibilityLiveRegion="polite">
          {error}
        </P11Text>
      ) : null}
      {unknown ? (
        <P11Button label="Thông tin yêu cầu đang chờ" variant="secondary" onPress={onUnknown} />
      ) : null}
      <View style={{ gap: 20 * s }}>
        {[...current, ...others].map(item => (
          <P11SessionCard
            key={item.stableSessionId}
            heading={
              !result?.currentStableSessionId
                ? 'Phiên chưa xác minh'
                : item.stableSessionId === result.currentStableSessionId
                ? 'Thiết bị hiện tại'
                : 'Thiết bị khác'
            }
            current={item.stableSessionId === result?.currentStableSessionId}
            name={item.deviceLabel ?? 'Chưa có thông tin thiết bị'}
            location={item.location ?? 'Vị trí: Chưa có dữ liệu'}
            time={securityTime(item.lastActiveAt)}
            confirmed={confirmed.includes(item.stableSessionId)}
            disabled={!allowed(item)}
            onRevoke={() => onSelect(item)}
            onDetails={() => onDetails(item)}
          />
        ))}
      </View>
      {result && current.length === 0 ? (
        <P11Text size={17} color={HN_UI.textMuted} style={{ marginTop: 14 * s }}>
          {result.currentStableSessionId
            ? 'Phiên hiện tại không có trong trang này.'
            : 'Chưa xác minh được định danh phiên hiện tại.'}
        </P11Text>
      ) : null}
      {result && result.meta.total === 0 ? (
        <P11Text size={18}>
          Chưa có phiên đăng nhập trong danh sách được trả về.
        </P11Text>
      ) : null}
      {result && others.length === 0 && result.meta.last_page === 1 ? (
        <P11Text size={18} color={HN_UI.textMuted} style={{ marginTop: 14 * s }}>
          Không có phiên thiết bị khác trong danh sách này.
        </P11Text>
      ) : null}
      <P11Hint marginTop={18} padding={16}>
        Nếu phát hiện thiết bị lạ, hãy thu hồi phiên đó và đổi mật khẩu để tăng
        cường bảo mật.
      </P11Hint>
      <View style={{ marginTop: 18 * s, gap: 12 * s }}>
        {result ? (
          <P11Text size={17} color={HN_UI.textMuted}>
            {result.meta.total} nhóm phiên hoạt động · Trang{' '}
            {result.meta.current_page}/{result.meta.last_page}
          </P11Text>
        ) : null}
        <P11Button
          small
          label="Tải lại danh sách"
          variant="secondary"
          disabled={revoking || loading}
          busy={loading}
          onPress={onReload}
        />
        {result && result.meta.last_page > 1 ? (
          <View style={{ flexDirection: 'row', gap: 12 * s }}>
            <View style={{ flex: 1 }}>
              <P11Button
                small
                label="Trang trước"
                variant="secondary"
                disabled={loading || revoking || result.meta.current_page <= 1}
                onPress={() => onPage(result.meta.current_page - 1)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <P11Button
                small
                label="Trang sau"
                variant="secondary"
                disabled={
                  loading ||
                  revoking ||
                  result.meta.current_page >= result.meta.last_page
                }
                onPress={() => onPage(result.meta.current_page + 1)}
              />
            </View>
          </View>
        ) : null}
      </View>
    </>
  );
}

/** Unauthenticated S03 notice. Only supplied by a confirmed synchronous command. */
export function P11PasswordResultScreen({
  result,
  onContinue,
}: {
  result: PasswordChangeResult;
  onContinue: () => void;
}): React.ReactElement {
  useHardwareBack(() => {
    onContinue();
    return true;
  });
  return (
    <P11Frame
      title="Đã đổi mật khẩu"
      panel="S03"
      center
      onBack={onContinue}
      footer={<P11Button label="Đăng nhập lại" onPress={onContinue} />}
    >
      <P11SuccessContent
        time={securityTime(result.passwordChangedAt)}
        accountName={result.displayContext?.accountName}
        warehouseName={result.displayContext?.warehouseName}
      />
    </P11Frame>
  );
}
