/**
 * Màn Đăng nhập.
 *
 * 🎨 Nguồn: ảnh **02–05** của bộ 47 ảnh
 * ([04-design-reference.md](../../../../../docs/migration/04-design-reference.md)).
 *
 * ✅ **Luồng chạy thật**, không phải khung rỗng: `/api/v1/auth/login` nằm trong
 * ngoại lệ `GATE_WMS §2c`, nên màn này gọi máy chủ thật và lưu phiên thật.
 *
 * Bốn chi tiết bám sát ảnh, ghi ra để lần sửa sau không làm mất:
 *
 * 1. Lỗi hiện **dưới từng ô** kèm viền đỏ (ảnh 03), không gộp một câu chung.
 * 2. Khi đang gửi, **nhãn nút đổi** thành *"Đang xử lý…"* và có banner info
 *    *"Đang xác thực tài khoản / Không đóng ứng dụng trong lúc xác thực."* (ảnh 04).
 * 3. Khi thất bại, banner **đỏ** lên đầu thẻ và nhãn nút thành **"Thử lại"** (ảnh 05).
 * 4. Chân trang ghi môi trường và phiên bản (ảnh 02) — giữ lại vì đó là thứ đầu
 *    tiên hỏi thủ kho khi hỗ trợ từ xa: *"màn đăng nhập ghi môi trường gì?"*
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Banner } from '../../ui/Banner';
import { useTheme } from '../../theme/ThemeProvider';
import { BUILD_INFO, getCurrentEnvironment } from '../../config/env';
import { APP_VERSION } from '../../api/userAgent';
import { classifyLoginError, login } from '../../services/wms/auth';
import {
  beginSubmit,
  failSubmit,
  initialLoginForm,
  setEmail,
  setPassword,
  submitLabel,
  type LoginFormState,
} from './loginForm';

const styles = StyleSheet.create({
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: '700',
  },
  footer: {
    textAlign: 'center',
  },
  reveal: {
    fontWeight: '600',
  },
});

export interface LoginScreenProps {
  /** Gọi sau khi đăng nhập thành công. Màn hình không tự điều hướng. */
  onSuccess?: () => void;
  /** Tiêm để test không cần mạng. */
  loginFn?: typeof login;
}

export function LoginScreen({
  onSuccess,
  loginFn = login,
}: LoginScreenProps): React.ReactElement {
  const theme = useTheme();
  const environment = getCurrentEnvironment();
  const [form, setForm] = useState<LoginFormState>(initialLoginForm);
  const [revealed, setRevealed] = useState(false);

  const submitting = form.phase === 'submitting';

  const handleSubmit = useCallback(async () => {
    const { next, canSubmit } = beginSubmit(form);
    setForm(next);
    if (!canSubmit) {
      return;
    }
    try {
      await loginFn({
        // AuthStatePage của Mini App chuẩn hoá email trước khi gửi.
        email: next.email.trim().toLowerCase(),
        password: next.password,
      });
      // Xoá sạch form — nhất là mật khẩu — trước khi rời màn.
      setForm(initialLoginForm);
      setRevealed(false);
      onSuccess?.();
    } catch (error) {
      setForm(current => failSubmit(current, classifyLoginError(error).message));
      setRevealed(false);
    }
  }, [form, loginFn, onSuccess]);

  return (
    <Page scroll>
      <View style={[styles.brand, { gap: theme.spacing.md }]}>
        <View
          style={[
            styles.avatar,
            {
              borderRadius: theme.radius.control,
              backgroundColor: theme.colors.primary,
            },
          ]}
        >
          <Text variant="cardTitle" style={styles.avatarText}>
            HN
          </Text>
        </View>
        <View>
          <Text variant="cardTitle" tone="strong">
            WMS HOA NAM
          </Text>
          <Text variant="caption" tone="muted">
            Quản lý vận hành kho
          </Text>
        </View>
      </View>

      <Box card padding="lg" gap="lg">
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="screenTitle" tone="strong">
            Đăng nhập
          </Text>
          <Text variant="caption" tone="muted">
            Sử dụng tài khoản được cấp để tiếp tục.
          </Text>
        </View>

        {form.phase === 'failed' && form.formError !== undefined ? (
          <Banner
            tone="danger"
            title="Không thể đăng nhập"
            message={form.formError}
          />
        ) : null}

        <Input
          label="Email*"
          placeholder="admin@gmail.com"
          value={form.email}
          onChangeText={text => setForm(current => setEmail(current, text))}
          errorText={form.fieldErrors.email}
          editable={!submitting}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          // Ngoại lệ có chủ đích của quy tắc "tắt autofill" ở `ui/Input.tsx`:
          // đây là tài khoản WMS của chính người dùng, không phải dữ liệu khách.
          autoComplete="email"
          importantForAutofill="yes"
          // Bàn phím hiện nút "Tiếp" thay vì "Xong" — D-10 của app cũ là thiếu
          // đúng thuộc tính này.
          returnKeyType="next"
        />

        <Input
          label="Mật khẩu*"
          placeholder="Nhập mật khẩu"
          value={form.password}
          onChangeText={text => setForm(current => setPassword(current, text))}
          errorText={form.fieldErrors.password}
          editable={!submitting}
          secureTextEntry={!revealed}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          autoComplete="current-password"
          importantForAutofill="yes"
          // Enter ở ô cuối gửi form — D-09 của app cũ là form không phải <form>
          // thật nên Enter chỉ chạy ở ô mật khẩu. Ở RN ta nối thẳng vào submit.
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
        />

        <Text
          variant="caption"
          style={[styles.reveal, { color: theme.colors.primary }]}
          onPress={() => setRevealed(current => !current)}
          accessibilityRole="button"
          accessibilityLabel={revealed ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        >
          {revealed ? 'Ẩn' : 'Hiện'}
        </Text>

        <Button
          label={submitLabel(form.phase)}
          onPress={handleSubmit}
          loading={submitting}
          // `disabled` không đặt theo tính hợp lệ: ảnh 02 cho thấy nút **luôn
          // bấm được**, và bấm khi trống mới hiện lỗi từng ô (ảnh 03). Khoá nút
          // sẵn sẽ khiến người dùng không hiểu vì sao không bấm được.
          disabled={submitting}
        />

        {submitting ? (
          <Banner
            tone="info"
            title="Đang xác thực tài khoản"
            message="Không đóng ứng dụng trong lúc xác thực."
          />
        ) : null}
      </Box>

      <Text variant="caption" tone="muted" style={styles.footer}>
        {'WMS Hoa Nam · Môi trường ' +
          (environment.environmentClassVerified
            ? environment.label
            : 'chưa xác minh') +
          ' · v' +
          APP_VERSION +
          (BUILD_INFO.isDebug ? ' (debug)' : '')}
      </Text>
    </Page>
  );
}
