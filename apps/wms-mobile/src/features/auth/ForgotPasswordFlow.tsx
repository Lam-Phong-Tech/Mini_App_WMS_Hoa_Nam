/**
 * Khôi phục tài khoản — ba bước theo Authentication API của WMS:
 * forgot-password → verify-otp → reset-password.
 *
 * OTP và reset_token chỉ tồn tại trong state bộ nhớ của flow, không ghi vào
 * MMKV/Keystore/log. Không tự gửi request khi mở màn; chỉ gọi khi người dùng
 * bấm đúng CTA của từng bước.
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Banner } from '../../ui/Banner';
import { AppIcon } from '../../ui/AppIcon';
import { useTheme } from '../../theme/ThemeProvider';
import {
  forgotPassword,
  resetPassword,
  verifyPasswordOtp,
  type PasswordRecoveryDeps,
} from '../../services/wms/auth';
import { toAppError } from '../../errors/AppError';

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headBody: { flex: 1 },
  step: { color: '#ffffff', fontWeight: '600' },
});

type RecoveryStep = 0 | 1 | 2;

export interface ForgotPasswordFlowProps {
  onBack: () => void;
  onDone: () => void;
  deps?: PasswordRecoveryDeps;
}

export function ForgotPasswordFlow({ onBack, onDone, deps }: ForgotPasswordFlowProps): React.ReactElement {
  const theme = useTheme();
  const [step, setStep] = useState<RecoveryStep>(0);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [completed, setCompleted] = useState(false);

  const run = async (task: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await task();
    } catch (cause) {
      setError(toAppError(cause).message);
    } finally {
      setBusy(false);
    }
  };

  const title = completed ? 'Đặt lại mật khẩu thành công' : 'Khôi phục tài khoản';
  const stepLabel = completed ? undefined : 'Bước ' + String(step + 1) + '/3';

  return (
    <Page
      title={title}
      onBack={completed ? undefined : onBack}
      scroll
      headerVariant="brand"
      headerRight={stepLabel === undefined ? undefined : <Text variant="caption" style={styles.step}>{stepLabel}</Text>}
    >
      {completed ? (
        <Box card padding="xl" gap="lg">
          <AppIcon name="check-circle" color={theme.colors.success} size={56} />
          <Text variant="screenTitle" tone="strong">Mật khẩu đã được cập nhật</Text>
          <Text variant="caption" tone="muted">
            Bạn có thể dùng mật khẩu mới để đăng nhập lại. Các phiên đăng nhập cũ đã được thu hồi.
          </Text>
          <Button label="Về đăng nhập" onPress={onDone} />
        </Box>
      ) : (
        <>
          <Box card padding="lg" gap="md">
            <View style={[styles.head, { gap: theme.spacing.md }]}>
              <View style={styles.headBody}>
                <Text variant="cardTitle" tone="strong">
                  {step === 0 ? 'Nhập email tài khoản' : step === 1 ? 'Xác thực mã OTP' : 'Đặt mật khẩu mới'}
                </Text>
                <Text variant="caption" tone="muted">
                  {step === 0
                    ? 'WMS sẽ gửi mã OTP đặt lại mật khẩu về email được cấp.'
                    : step === 1
                      ? 'Nhập mã OTP bạn nhận được để lấy quyền đặt mật khẩu mới.'
                      : 'Mật khẩu mới phải có ít nhất 8 ký tự và nhập lại chính xác.'}
                </Text>
              </View>
              <AppIcon name="shield-check" color={theme.colors.primary} size={24} />
            </View>
          </Box>

          {error === undefined ? null : <Banner tone="danger" title="Không thể tiếp tục" message={error} />}

          {step === 0 ? (
            <Box card padding="lg" gap="lg">
              <Input
                label="Email tài khoản*"
                placeholder="Ví dụ: nhanvien@hoanam.vn"
                value={email}
                onChangeText={value => setEmail(value)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                returnKeyType="go"
                onSubmitEditing={() => run(async () => {
                  await forgotPassword(email, deps);
                  setStep(1);
                })}
                leftAdornment={<AppIcon name="profile" color={theme.colors.primary} size={18} />}
              />
              <Button
                label="Gửi mã OTP"
                loading={busy}
                disabled={busy}
                onPress={() => run(async () => {
                  await forgotPassword(email, deps);
                  setStep(1);
                })}
              />
            </Box>
          ) : null}

          {step === 1 ? (
            <Box card padding="lg" gap="lg">
              <Text variant="caption" tone="muted">Mã đã gửi tới: {email}</Text>
              <Input
                label="Mã OTP*"
                placeholder="Nhập mã OTP"
                value={otp}
                onChangeText={value => setOtp(value.replace(/\s/g, ''))}
                editable={!busy}
                keyboardType="number-pad"
                autoCorrect={false}
                autoCapitalize="none"
                maxLength={8}
                returnKeyType="go"
                onSubmitEditing={() => run(async () => {
                  const verified = await verifyPasswordOtp(email, otp, deps);
                  setResetToken(verified.reset_token ?? verified.token ?? '');
                  setStep(2);
                })}
              />
              <Button
                label="Xác nhận OTP"
                loading={busy}
                disabled={busy}
                onPress={() => run(async () => {
                  const verified = await verifyPasswordOtp(email, otp, deps);
                  setResetToken(verified.reset_token ?? verified.token ?? '');
                  setStep(2);
                })}
              />
              <Button
                label="Gửi lại mã OTP"
                variant="secondary"
                loading={busy}
                disabled={busy}
                onPress={() => run(() => forgotPassword(email, deps))}
              />
            </Box>
          ) : null}

          {step === 2 ? (
            <Box card padding="lg" gap="lg">
              <Input
                label="Mật khẩu mới*"
                placeholder="Ít nhất 8 ký tự"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                editable={!busy}
                leftAdornment={<AppIcon name="shield-check" color={theme.colors.primary} size={18} />}
              />
              <Input
                label="Nhập lại mật khẩu mới*"
                placeholder="Nhập lại mật khẩu mới"
                value={confirmation}
                onChangeText={setConfirmation}
                secureTextEntry
                editable={!busy}
                leftAdornment={<AppIcon name="shield-check" color={theme.colors.primary} size={18} />}
              />
              <Button
                label="Đặt mật khẩu mới"
                loading={busy}
                disabled={busy}
                onPress={() => run(async () => {
                  await resetPassword({
                    email,
                    resetToken,
                    newPassword,
                    newPasswordConfirmation: confirmation,
                  }, deps);
                  setCompleted(true);
                })}
              />
            </Box>
          ) : null}
        </>
      )}
    </Page>
  );
}
