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
import {
  KeyboardAvoidingView,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../ui/Text';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Banner } from '../../ui/Banner';
import { AppIcon } from '../../ui/AppIcon';
import { useTheme } from '../../theme/ThemeProvider';
import { scannerAssets } from '../../theme/scannerAssets';
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
  root: {
    flex: 1,
    backgroundColor: '#073b52',
  },
  shade: {
    flex: 1,
    backgroundColor: 'rgba(3, 48, 68, 0.62)',
  },
  keyboard: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingTop: 34,
    width: '100%',
    minWidth: 0,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
  },
  avatar: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMark: {
    borderRadius: 13,
    backgroundColor: 'rgba(9, 103, 140, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.34)',
  },
  avatarText: {
    fontWeight: '700',
  },
  brandMarkText: {
    color: '#ffffff',
  },
  brandTitle: {
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  brandSubtitle: {
    color: 'rgba(255,255,255,0.72)',
  },
  hero: {
    width: '100%',
    minWidth: 0,
    paddingHorizontal: 24,
    paddingTop: 48,
    minHeight: 183,
    justifyContent: 'flex-end',
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 31,
    lineHeight: 35,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.90)',
    fontSize: 15,
    lineHeight: 22,
  },
  formPanel: {
    alignSelf: 'stretch',
    minWidth: 0,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    marginHorizontal: 8,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 22,
    gap: 17,
    shadowColor: '#05283a',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  fieldLabel: {
    color: '#12384e',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  primaryAction: {
    minHeight: 56,
    borderRadius: 10,
    backgroundColor: '#07678d',
  },
  footer: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.62)',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  reveal: {
    fontWeight: '600',
  },
  revealButton: {
    padding: 5,
  },
  unavailable: {
    alignSelf: 'flex-end',
    maxWidth: '100%',
    textAlign: 'right',
    color: 'rgba(18,56,78,0.70)',
  },
  accessNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef8ff',
    borderRadius: 12,
    padding: 13,
  },
  accessCopy: {
    flex: 1,
    minWidth: 0,
  },
  accessTitle: {
    color: '#0c6286',
    fontWeight: '700',
  },
  accessHint: {
    color: '#527186',
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
    <ImageBackground source={scannerAssets.warehouseMain} style={styles.root}>
    <SafeAreaView edges={['top', 'bottom']} style={styles.shade}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
      <View style={[styles.brand, { gap: theme.spacing.md }]}>
        <View
          style={[
            styles.avatar,
            styles.brandMark,
          ]}
        >
          <AppIcon name="scan" size={27} color="#ffffff" />
        </View>
        <View>
          <Text variant="cardTitle" style={styles.brandTitle}>
            HOA NAM SCANNER
          </Text>
          <Text variant="caption" style={styles.brandSubtitle}>
            WMS · Vận hành chuyên nghiệp
          </Text>
        </View>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroTitle}>{'Quản lý kho\nHoa Nam'}</Text>
        <Text style={styles.heroSubtitle}>Đăng nhập để bắt đầu phiên làm việc</Text>
      </View>

      <View style={styles.formPanel}>

        {form.phase === 'failed' && form.formError !== undefined ? (
          <Banner
            tone="danger"
            title="Không thể đăng nhập"
            message={form.formError}
          />
        ) : null}

        <Input
          label="Tên đăng nhập"
          placeholder="Nhập email được cấp"
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
          leftAdornment={<AppIcon name="profile" size={21} color="#5b7c91" />}
        />

        <Input
          label="Mật khẩu"
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
          leftAdornment={<AppIcon name="shield-check" size={20} color="#5b7c91" />}
          rightAdornment={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={revealed ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              onPress={() => setRevealed(current => !current)}
              style={styles.revealButton}
            >
              <Text variant="caption" tone="primary" style={styles.reveal}>
                {revealed ? 'Ẩn' : 'Hiện'}
              </Text>
            </Pressable>
          }
        />

        <Button
          label={submitLabel(form.phase)}
          onPress={handleSubmit}
          loading={submitting}
          // `disabled` không đặt theo tính hợp lệ: ảnh 02 cho thấy nút **luôn
          // bấm được**, và bấm khi trống mới hiện lỗi từng ô (ảnh 03). Khoá nút
          // sẵn sẽ khiến người dùng không hiểu vì sao không bấm được.
          disabled={submitting}
          style={styles.primaryAction}
        />

        <View style={[styles.accessNotice, { gap: theme.spacing.md }]}>
          <AppIcon name="shield-check" size={25} color="#168657" />
          <View style={styles.accessCopy}>
            <Text variant="caption" style={styles.accessTitle}>
              Quyền truy cập theo tài khoản được cấp.
            </Text>
            <Text variant="caption" style={styles.accessHint}>
              Chỉ dành cho nhân viên được uỷ quyền.
            </Text>
          </View>
        </View>

        {submitting ? (
          <Banner
            tone="info"
            title="Đang xác thực tài khoản"
            message="Không đóng ứng dụng trong lúc xác thực."
          />
        ) : null}
        <Text variant="caption" style={styles.unavailable}>
          Khôi phục tài khoản: Chưa áp dụng
        </Text>
      </View>

      <Text variant="caption" style={styles.footer}>
        {'WMS Hoa Nam · Môi trường ' +
          (environment.environmentClassVerified
            ? environment.label
            : 'chưa xác minh') +
          ' · v' +
          APP_VERSION +
          (BUILD_INFO.isDebug ? ' (debug)' : '')}
      </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </ImageBackground>
  );
}
