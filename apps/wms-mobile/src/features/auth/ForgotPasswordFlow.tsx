import {HN_UI} from '../../theme/uiKitV3';
/**
 * Khôi phục tài khoản — ba bước theo Authentication API của WMS:
 * forgot-password → verify-otp → reset-password.
 *
 * OTP và reset_token chỉ tồn tại trong state bộ nhớ của flow, không ghi vào
 * MMKV/Keystore/log. Không tự gửi request khi mở màn; chỉ gọi khi người dùng
 * bấm đúng CTA của từng bước.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../ui/Text';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { useHardwareBack } from '../../app/useHardwareBack';
import { AppIcon } from '../../ui/AppIcon';
import { P14RecoveryIcon } from './P14RecoveryIcon';
import { SixDigitOtpInput } from './SixDigitOtpInput';
import {ScannerTextInput as SecurityTextInput} from '../../ui/ScannerTextInput';
import {P11Frame,P11Button,P11Text} from '../profile/P11Frame';
import {P11FormContent,P11PasswordField} from '../profile/P11Presentation';
import {
  forgotPassword,
  FORGOT_PASSWORD_PATH,
  RESET_PASSWORD_PATH,
  resetPassword,
  VERIFY_OTP_PATH,
  verifyPasswordOtp,
  type PasswordRecoveryDeps,
} from '../../services/wms/auth';
import { messageForUser, toAppError } from '../../errors/AppError';

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: 0, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center' },
  surface: { backgroundColor: HN_UI.surface, overflow: 'hidden' },
  fieldLabel: { fontWeight: '700', color: HN_UI.textPrimary },
  bodyText: { color: HN_UI.textMuted, fontWeight: '400' },
  step: { color: HN_UI.onBrand, fontWeight: '600' },
});

type RecoveryStep = 0 | 1 | 2;
type Cooldown = { route: string; untilMs: number } | null;

export interface ForgotPasswordFlowProps {
  onBack: () => void;
  onDone: () => void;
  deps?: PasswordRecoveryDeps;
}

export function ForgotPasswordFlow({
  onBack,
  onDone,
  deps,
}: ForgotPasswordFlowProps): React.ReactElement {
  const { width } = useWindowDimensions();
  const s = Math.min(1, width / 494);
  const alive = useRef(true),
    sending = useRef(false);
  const [step, setStep] = useState<RecoveryStep>(0);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [resetFieldErrors,setResetFieldErrors]=useState<{newPassword?:string;confirmation?:string}>({});
  const [resetVisible,setResetVisible]=useState({password:false,confirmation:false});
  const resetPasswordRef=useRef<React.ComponentRef<typeof SecurityTextInput>|null>(null);
  const resetConfirmationRef=useRef<React.ComponentRef<typeof SecurityTextInput>|null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [completed, setCompleted] = useState(false);
  const [cooldown, setCooldown] = useState<Cooldown>(null);
  const [clockMs, setClockMs] = useState(() => Date.now());

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useHardwareBack(() => {
    if (sending.current) return true;
    if (error) {
      setError(undefined);
      return true;
    }
    if (completed) onDone();
    else onBack();
    return true;
  });

  useEffect(() => {
    if (cooldown === null) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setClockMs(now);
      if (now >= cooldown.untilMs) setCooldown(null);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const remaining = (route: string): number =>
    cooldown?.route === route
      ? Math.max(0, Math.ceil((cooldown.untilMs - clockMs) / 1000))
      : 0;

  const errorText = (cause: unknown): string => {
    const value = toAppError(cause);
    let message = value.message;
    if (value.status === 422 && value.route === VERIFY_OTP_PATH)
      message = 'Mã OTP không đúng hoặc đã hết hạn.';
    if (value.status === 422 && value.route === RESET_PASSWORD_PATH)
      message = value.fieldErrors?.new_password?.[0] ??
        value.fieldErrors?.new_password_confirmation?.[0] ??
        'Yêu cầu đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.';
    if (value.status === 429) {
      const seconds = Math.max(1, value.retryAfterSeconds ?? 60);
      const route = value.route ?? FORGOT_PASSWORD_PATH;
      setCooldown({ route, untilMs: Date.now() + seconds * 1000 });
      setClockMs(Date.now());
      message = `Bạn đã thao tác quá nhanh. Thử lại sau ${seconds} giây.`;
    } else if (value.kind === 'network' || value.kind === 'timeout') {
      message = messageForUser(value);
    }
    return (
      message + (value.requestId ? `\nMã yêu cầu: ${value.requestId}` : '')
    );
  };

  const run = async (task: () => Promise<void>): Promise<void> => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await task();
    } catch (cause) {
      if (alive.current) {
        const value=toAppError(cause);
        if(step===2&&value.route===RESET_PASSWORD_PATH&&value.status===422&&
          (value.fieldErrors?.new_password?.length||value.fieldErrors?.new_password_confirmation?.length)) {
          const trace=value.requestId?'\nMã yêu cầu: '+value.requestId:'';
          setResetFieldErrors({
            newPassword:value.fieldErrors?.new_password?.[0]?value.fieldErrors.new_password[0]+trace:undefined,
            confirmation:value.fieldErrors?.new_password_confirmation?.[0]?value.fieldErrors.new_password_confirmation[0]+trace:undefined,
          });
        } else setError(errorText(cause));
      }
    } finally {
      sending.current = false;
      if (alive.current) setBusy(false);
    }
  };

  // S01/S02 support-request fields are not supplied by the OTP API. Keep the
  // real three-step owner and copy; only the presentation follows P14 geometry.
  const title = completed ? 'Đặt lại mật khẩu thành công' : 'Quên mật khẩu';
  const heading = completed
    ? 'Mật khẩu đã được cập nhật'
    : step === 0
    ? 'Nhập email tài khoản'
    : step === 1
    ? 'Xác thực mã OTP'
    : 'Đặt mật khẩu mới';
  const hint = completed
    ? 'Bạn có thể dùng mật khẩu mới để đăng nhập lại. Các phiên đăng nhập cũ đã được thu hồi.'
    : step === 0
    ? 'WMS sẽ gửi mã OTP đặt lại mật khẩu về email được cấp.'
    : step === 1
    ? 'Nhập mã OTP bạn nhận được để lấy quyền đặt mật khẩu mới.'
    : 'Dùng 8–128 ký tự, gồm chữ thường, chữ hoa, ký tự đặc biệt và nhập lại chính xác.';
  const submit = () => {
    if(step===2&&newPassword!==confirmation) {
      setResetFieldErrors({confirmation:'Mật khẩu xác nhận chưa khớp.'});
      resetConfirmationRef.current?.focus();
      return Promise.resolve();
    }
    return run(async () => {
      if (step === 0) {
        await forgotPassword(email, deps);
        if (alive.current) setStep(1);
      } else if (step === 1) {
        const verified = await verifyPasswordOtp(email, otp, deps);
        if (!alive.current) return;
        setResetToken(verified.reset_token);
        setStep(2);
      } else {
        await resetPassword(
          {
            email,
            resetToken,
            newPassword,
            newPasswordConfirmation: confirmation,
          },
          deps,
        );
        if (!alive.current) return;
        setEmail('');
        setOtp('');
        setResetToken('');
        setNewPassword('');
        setConfirmation('');
        setCompleted(true);
      }
    });
  };
  const route =
    step === 0
      ? FORGOT_PASSWORD_PATH
      : step === 1
      ? VERIFY_OTP_PATH
      : RESET_PASSWORD_PATH;
  const wait = remaining(route);
  const submitLabel =
    wait > 0
      ? `Thử lại sau ${wait}s`
      : step === 0
      ? 'Gửi mã OTP'
      : step === 1
      ? 'Xác nhận OTP'
      : 'Đặt mật khẩu mới';
  const submitDisabled = busy || wait > 0 || (step === 1 && otp.length !== 6);
  const fieldPresentation = {
    fieldHeight: 58 * s,
    labelStyle: [styles.fieldLabel, { fontSize: 18 * s, lineHeight: 27 * s }],
    fieldStyle: {
      borderRadius: 14 * s,
      paddingHorizontal: 16 * s,
      backgroundColor: HN_UI.surface,
    },
    inputStyle: { fontSize: 18 * s, color: HN_UI.textPrimary },
    containerStyle: { gap: 8 * s },
  };
  const buttonPresentation = {
    style: { minHeight: 56 * s, borderRadius: 12 * s, paddingVertical: 12 * s },
    labelStyle: {
      fontSize: 18 * s,
      lineHeight: 27 * s,
      fontWeight: '600' as const,
    },
  };

  const recoveryDialog=<Dialog
    visible={error!==undefined} title="Không thể tiếp tục" message={error}
    dismissOnBackdrop={false} dismissible={!busy} onDismiss={()=>setError(undefined)}
    footer={<Button label="Đóng" onPress={()=>setError(undefined)}/>}
  />;
  if(!completed&&step===2) {
    const mismatch=confirmation&&confirmation!==newPassword?'Mật khẩu xác nhận chưa khớp.':undefined;
    return <P11Frame title="Đổi mật khẩu" panel={mismatch||Object.values(resetFieldErrors).some(Boolean)?'S02':'S01'}
      onBack={busy?undefined:()=>{if(!sending.current)onBack();}} footer={<P11Button label="Lưu mật khẩu" accessibilityLabel="Đặt mật khẩu mới" arrow
        busy={busy} disabled={submitDisabled} onPress={()=>{submit().catch(()=>undefined);}}/>}>
      <P11Text size={14} color={HN_UI.textMuted} style={{marginBottom:12*s}}>Bước 3/3</P11Text>
      <P11FormContent policy={{minLength:8,maxLength:128,maxUtf8Bytes:null}} saving={busy}
        policyLoading={false} unknown={false} onReload={()=>{}}>
        <P11PasswordField label="Mật khẩu mới" value={newPassword} inputRef={resetPasswordRef}
          onChangeText={value=>{setNewPassword(value);setResetFieldErrors(current=>({...current,newPassword:undefined}));}}
          secureTextEntry={!resetVisible.password} editable={!busy} errorText={resetFieldErrors.newPassword}
          onToggleVisible={()=>setResetVisible(current=>({...current,password:!current.password}))}/>
        <P11PasswordField label="Xác nhận mật khẩu mới" value={confirmation} inputRef={resetConfirmationRef}
          onChangeText={value=>{setConfirmation(value);setResetFieldErrors(current=>({...current,confirmation:undefined}));}}
          secureTextEntry={!resetVisible.confirmation} editable={!busy} errorText={mismatch||resetFieldErrors.confirmation}
          onToggleVisible={()=>setResetVisible(current=>({...current,confirmation:!current.confirmation}))}/>
      </P11FormContent>
      {recoveryDialog}
    </P11Frame>;
  }
  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      testID="P14.recovery.frame"
      style={[
        styles.fill,
        {
          maxWidth: 494,
          width: '100%',
          alignSelf: 'center',
          backgroundColor: HN_UI.shell,
        },
      ]}
    >
      <View
        testID="P14.recovery.header"
        style={[
          styles.header,
          { minHeight: 88 * s, paddingHorizontal: 24 * s, gap: 8 * s },
        ]}
      >
        {!completed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={onBack}
            disabled={busy}
            style={{
              width: 44 * s,
              minHeight: 44 * s,
              justifyContent: 'center',
            }}
          >
            <AppIcon name="chevron-left" size={24 * s} color={HN_UI.onBrand} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontSize: 24 * s,
              lineHeight: 32 * s,
              fontWeight: '700',
              color: HN_UI.onBrand,
            }}
          >
            {title}
          </Text>
          {!completed ? (
            <Text
              style={[styles.step, { fontSize: 14 * s, lineHeight: 21 * s }]}
            >
              {'Bước ' + String(step + 1) + '/3'}
            </Text>
          ) : null}
        </View>
      </View>
      <KeyboardAvoidingView
        style={[
          styles.fill,
          styles.surface,
          { borderTopLeftRadius: 24 * s, borderTopRightRadius: 24 * s },
        ]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          testID="P14.recovery.scroll"
          style={styles.fill}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={{
            paddingHorizontal: 24 * s,
            paddingTop: 36 * s,
            paddingBottom: 24 * s,
          }}
        >
          <View testID="P14.recovery.content" style={{ gap: 28 * s }}>
            <View style={{ alignItems: 'center', gap: 16 * s }}>
              <View
                style={{
                  width: 104 * s,
                  height: 104 * s,
                  borderRadius: 52 * s,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: completed ? HN_UI.successSoft : HN_UI.selected,
                }}
              >
                <P14RecoveryIcon
                  kind={
                    completed
                      ? 'success'
                      : step === 0
                      ? 'user'
                      : 'shield'
                  }
                  size={48 * s}
                  color={completed ? HN_UI.success : HN_UI.textLink}
                />
              </View>
              <View style={{ alignSelf: 'stretch', gap: 8 * s }}>
                <Text
                  variant="cardTitle"
                  tone="strong"
                  style={{
                    fontSize: 28 * s,
                    lineHeight: 42 * s,
                    fontWeight: '700',
                    color: HN_UI.textPrimary,
                    textAlign: 'center',
                  }}
                >
                  {heading}
                </Text>
                <Text
                  style={[
                    styles.bodyText,
                    {
                      fontSize: 18 * s,
                      lineHeight: 27 * s,
                      textAlign: 'center',
                    },
                  ]}
                >
                  {hint}
                </Text>
              </View>
            </View>
            {!completed && step === 0 ? (
              <Input
                {...fieldPresentation}
                label="Email tài khoản*"
                placeholder="Ví dụ: nhanvien@hoanam.vn"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                returnKeyType="go"
                onSubmitEditing={() => {
                  if (!submitDisabled) submit();
                }}
                leftAdornment={
                  <AppIcon name="profile" color={HN_UI.textMuted} size={24 * s} />
                }
              />
            ) : null}
            {!completed && step === 1 ? (
              <View style={{ gap: 24 * s }}>
                <View
                  testID="P14.recovery.delivery"
                  style={{
                    borderWidth: 1,
                    borderColor: HN_UI.border,
                    borderRadius: 14 * s,
                    backgroundColor: HN_UI.canvas,
                    padding: 16 * s,
                    gap: 8 * s,
                  }}
                >
                  <Text
                    style={[
                      styles.fieldLabel,
                      { fontSize: 16 * s, lineHeight: 24 * s },
                    ]}
                  >
                    Nếu email hợp lệ, mã đã được gửi tới: {email}
                  </Text>
                </View>
                <SixDigitOtpInput
                  value={otp}
                  onChangeText={value => setOtp(value.replace(/\D/g, '').slice(0,6))}
                  editable={!busy}
                  scale={s}
                  onSubmit={() => {
                    if (!submitDisabled) submit();
                  }}
                />
              </View>
            ) : null}
            {!completed && step === 0 ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 14 * s,
                  padding: 16 * s,
                  backgroundColor: HN_UI.canvas,
                  borderRadius: 12 * s,
                }}
              >
                <AppIcon name="shield-check" color={HN_UI.textSecondary} size={24 * s} />
                <View style={{ flex: 1, minWidth: 0, gap: 4 * s }}>
                  <Text
                    style={{
                      fontSize: 18 * s,
                      lineHeight: 27 * s,
                      fontWeight: '600',
                      color: HN_UI.textSecondary,
                    }}
                  >
                    Khôi phục bằng email
                  </Text>
                  <Text
                    style={{
                      fontSize: 16 * s,
                      lineHeight: 24 * s,
                      color: HN_UI.textSecondary,
                    }}
                  >
                    Dùng email tài khoản đã được cấp để nhận mã xác thực.
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        </ScrollView>
        <View
          testID="P14.recovery.actions"
          style={{
            paddingHorizontal: 24 * s,
            paddingBottom: 24 * s,
            paddingTop: 12 * s,
            gap: 12 * s,
            backgroundColor: HN_UI.surface,
          }}
        >
          {completed ? (
            <Button
              {...buttonPresentation}
              label="Về đăng nhập"
              onPress={onDone}
            />
          ) : (
            <>
              <Button
                {...buttonPresentation}
                label={submitLabel}
                loading={busy}
                disabled={submitDisabled}
                onPress={submit}
              />
              {step === 1 ? (
                <Button
                  {...buttonPresentation}
                  label={
                    remaining(FORGOT_PASSWORD_PATH) > 0
                      ? `Gửi lại sau ${remaining(FORGOT_PASSWORD_PATH)}s`
                      : 'Gửi lại mã OTP'
                  }
                  variant="secondary"
                  loading={busy}
                  disabled={busy || remaining(FORGOT_PASSWORD_PATH) > 0}
                  onPress={() =>
                    run(async () => {
                      await forgotPassword(email, deps);
                      if (alive.current) setOtp('');
                    })
                  }
                />
              ) : null}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
      {recoveryDialog}
    </SafeAreaView>
  );
}
