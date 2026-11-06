import {UI_KIT_COLORS,uiColorAlpha} from '../../theme/uiKitV3';
import {HN_UI} from '../../theme/uiKitV3';
import {FIELD_FOCUS} from '../../theme/fieldFocus';
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

import React, { useCallback, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { Text } from '../../ui/Text';
import { SCANNER_ARIAL_FAMILY } from '../../theme/scannerTypography';
import {SCANNER_COLORS} from '../../ui/ScannerPalette';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Banner } from '../../ui/Banner';
import { Dialog } from '../../ui/Dialog';
import { P01Icon } from './P01Icon';
import { scannerAssets } from '../../theme/scannerAssets';
import {
  classifyLoginError,
  isMfaRequiredError,
  login,
  verifyMfaLogin,
} from '../../services/wms/auth';
import { webPreviewHostProblem } from '../../api/webPreviewHost';
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
    backgroundColor: HN_UI.canvas,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
  },
  shade: {
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 10,
    width: '100%',
    minWidth: 0,
  },
  composition: { flexGrow: 1 },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMark: {
    borderRadius: 13,
    backgroundColor: HN_UI.primary,
  },
  avatarText: {
    fontWeight: '700',
  },
  brandMarkText: {
    color: HN_UI.onBrand,
  },
  brandTitle: {
    color: HN_UI.onBrand,
    letterSpacing: 0.3,
  },
  brandSubtitle: {
    color: HN_UI.onBrand,
  },
  hero: {
    // Horizontal margins define the available width. A second `width: 100%`
    // makes RN Web add the margins on top of the viewport width and clips the
    // right-side motto on narrow screens (TC_UI_01).
    alignSelf: 'stretch',
    minWidth: 0,
    position: 'relative',
  },
  heroLead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  heroTitle: {
    color: HN_UI.onBrand,
    fontSize: 31,
    lineHeight: 35,
    fontWeight: '700',
    letterSpacing: -0.6,
    flex: 1,
    minWidth: 0,
  },
  heroSubtitle: {
    color: HN_UI.onBrand,
    fontSize: 15,
    lineHeight: 22,
  },
  formPanel: {
    alignSelf: 'stretch',
    minWidth: 0,
    backgroundColor: HN_UI.surface,
    borderRadius: 15,
    shadowColor: HN_UI.textPrimary,
    shadowOpacity: 0.06,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  fieldLabel: {
    fontFamily: SCANNER_ARIAL_FAMILY,
    color: HN_UI.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  primaryAction: {
    borderRadius: 11,
    backgroundColor: SCANNER_COLORS.primary,
  },
  footer: {
    textAlign: 'center',
    color: HN_UI.textMuted,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  reveal: {
    fontWeight: '600',
  },
  revealButton: {
    padding: 5,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    fontWeight: '700',
  },
  forgotButton: { minHeight: 44, justifyContent: 'center' },
  unavailable: {
    alignSelf: 'flex-end',
    maxWidth: '100%',
    textAlign: 'right',
    color: UI_KIT_COLORS['text.muted'],
  },
  accessNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: HN_UI.canvas,
    borderRadius: 12,
    padding: 13,
  },
  accessCopy: {
    flex: 1,
    minWidth: 0,
  },
  accessTitle: {
    color: HN_UI.textLink,
    fontWeight: '400',
  },
  accessHint: {
    color: HN_UI.textSecondary,
  },
  heroBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: UI_KIT_COLORS['overlay.photo'],
  },
  lowerSurface: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: HN_UI.canvas,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  brandCopy: { flex: 1 },
  motto: { flexShrink: 0 },
  mottoText: { color: HN_UI.textSecondary, fontSize: 10, lineHeight: 20 },
  mottoLine: {
    width: 26,
    height: 2,
    backgroundColor: HN_UI.primary,
    marginTop: 10,
  },
  footerGroup: {
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 'auto',
  },
  footerBrand: {
    color: HN_UI.textMuted,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  // Keep the separator visible at every supported width. `flex: 1` with a
  // max-width can resolve to zero when the caption is long.
  footerRule: {
    width: 28,
    flexGrow: 0,
    flexShrink: 0,
    height: 1,
    backgroundColor: HN_UI.surfaceSunken,
  },
  footerCaption: { color: HN_UI.textMuted, textAlign: 'center', flexShrink: 1 },
  actionTrailing: { position: 'absolute', right: 17 },
  actionLabel: { fontWeight: '700', fontFamily: SCANNER_ARIAL_FAMILY },
  fieldBackground: { backgroundColor: HN_UI.input, borderRadius: 8 },
  // Locked P01 .input-wrap:focus-within: soft ring around the whole control.
  fieldFocused: { outlineWidth: FIELD_FOCUS.width, outlineColor: FIELD_FOCUS.soft, outlineStyle: 'solid', outlineOffset: FIELD_FOCUS.offset },
});

export interface LoginScreenProps {
  /** Gọi sau khi đăng nhập thành công. Màn hình không tự điều hướng. */
  onSuccess?: () => void;
  /** Tiêm để test không cần mạng. */
  loginFn?: typeof login;
  /** Bước 2 MFA; tiêm riêng để test không gửi mã thật. */
  verifyMfaFn?: typeof verifyMfaLogin;
  /** Mở luồng forgot-password → verify-otp → reset-password. */
  onForgotPassword?: () => void;
}

export function LoginScreen({
  onSuccess,
  loginFn = login,
  verifyMfaFn = verifyMfaLogin,
  onForgotPassword,
}: LoginScreenProps): React.ReactElement {
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const { width } = useWindowDimensions();
  const frameWidth = Math.min(width, 494);
  // The reviewed phone composition is494×950. Do not scale438px estimates up
  // a second time: that enlarges every control and pushes the form down.
  const scale = frameWidth / 494;
  const { top: safeTop } = useSafeAreaInsets();
  const emailRef =
    useRef<React.ComponentRef<typeof import('react-native').TextInput>>(null);
  const passwordRef =
    useRef<React.ComponentRef<typeof import('react-native').TextInput>>(null);
  const mfaRef =
    useRef<React.ComponentRef<typeof import('react-native').TextInput>>(null);
  const live = useRef(true);
  React.useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const [form, setForm] = useState<LoginFormState>(initialLoginForm);
  const [revealed, setRevealed] = useState(false);
  const [passwordSelection, setPasswordSelection] = useState<
    { start: number; end: number } | undefined
  >();
  const [mfa, setMfa] = useState<
    | {
        token: string;
        expiresIn: number;
        code: string;
        busy: boolean;
        consumed: boolean;
        error?: string;
      }
    | undefined
  >();
  // `disabled` chỉ có hiệu lực sau lượt render kế tiếp. Giữ khóa đồng bộ này
  // để hai sự kiện chạm/Enter đến trong cùng một frame vẫn không phát hai
  // request đăng nhập cho cùng một form.
  const submitInFlightRef = useRef(false);
  const mfaInFlightRef = useRef(false);

  const submitting = form.phase === 'submitting';
  const previewProblem = webPreviewHostProblem();
  const formLocked =
    submitting || previewProblem !== undefined || mfa !== undefined;
  const mfaToken = mfa?.token,
    mfaConsumed = mfa?.consumed;

  React.useEffect(() => {
    if (!mfaToken || mfaConsumed) return;
    requestAnimationFrame(() => mfaRef.current?.focus());
  }, [mfaToken, mfaConsumed]);

  const handleSubmit = useCallback(async () => {
    if (submitInFlightRef.current || webPreviewHostProblem()) {
      return;
    }
    const { next, canSubmit } = beginSubmit(form);
    setForm(next);
    if (!canSubmit) {
      (next.fieldErrors.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    submitInFlightRef.current = true;
    try {
      await loginFn({
        // AuthStatePage của Mini App chuẩn hoá email trước khi gửi.
        email: next.email.trim().toLowerCase(),
        password: next.password,
      });
      if (!live.current) return;
      // Xoá sạch form — nhất là mật khẩu — trước khi rời màn.
      setForm(initialLoginForm);
      setRevealed(false);
      setPasswordSelection(undefined);
      onSuccess?.();
    } catch (error) {
      if (!live.current) return;
      if (isMfaRequiredError(error)) {
        // Mật khẩu và email không đi tiếp sang bước 2; challenge sống ngắn chỉ
        // nằm trong state bộ nhớ và không ghi journal/storage/log.
        setForm(initialLoginForm);
        setRevealed(false);
        setPasswordSelection(undefined);
        setMfa({
          token: error.mfaToken,
          expiresIn: error.expiresIn,
          code: '',
          busy: false,
          consumed: false,
        });
        return;
      }
      setForm(current =>
        failSubmit(current, classifyLoginError(error).message),
      );
      setRevealed(false);
    } finally {
      submitInFlightRef.current = false;
    }
  }, [form, loginFn, onSuccess]);

  const leaveMfa = useCallback(() => {
    if (mfaInFlightRef.current) return;
    setMfa(undefined);
    setForm(initialLoginForm);
  }, []);

  const handleMfaSubmit = useCallback(async () => {
    if (!mfa || mfa.busy || mfa.consumed || mfaInFlightRef.current) return;
    const code = mfa.code.trim();
    if (!code || code.length > 16) {
      setMfa(current =>
        current
          ? { ...current, error: 'Nhập mã xác thực hoặc mã khôi phục hợp lệ.' }
          : current,
      );
      mfaRef.current?.focus();
      return;
    }
    mfaInFlightRef.current = true;
    setMfa(current => (current ? { ...current, busy: true, error: undefined } : current));
    try {
      await verifyMfaFn({ mfaToken: mfa.token, code });
      if (!live.current) return;
      setMfa(undefined);
      onSuccess?.();
    } catch (error) {
      if (!live.current) return;
      // BE consume challenge trước khi kiểm code; không tự gửi lại cùng token.
      setMfa(current =>
        current
          ? {
              ...current,
              token: '',
              code: '',
              busy: false,
              consumed: true,
              error:
                classifyLoginError(error).message +
                ' Hãy quay lại đăng nhập để nhận phiên xác thực mới.',
            }
          : current,
      );
    } finally {
      mfaInFlightRef.current = false;
    }
  }, [mfa, onSuccess, verifyMfaFn]);

  /**
   * `adjustResize` chỉ thu chiều cao Activity; không tự đưa ô đang focus vào
   * vùng còn thấy. Dùng chính ScrollResponder của RN để email/mật khẩu luôn
   * nằm trên Gboard, kể cả khi form dài hơn màn Samsung/PDA.
   */
  const revealFocusedField = useCallback((target: number) => {
    // On WebKit/iOS the browser owns keyboard scrolling. Calling the native
    // responder there adds a second scroll/zoom adjustment; the input remains
    // visible without changing the page scale once its font is >= 16px.
    if (Platform.OS === 'web') return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(
        target,
        20,
        true,
      );
    });
  }, []);

  return (
    <View style={[styles.root, { width: frameWidth }]}>
      <Image
        source={scannerAssets.warehouseMain}
        style={[
          styles.backgroundImage,
          // Image intrinsic dimensions must not win over the frame on Android.
          { width: frameWidth, height: 405 * scale + safeTop },
        ]}
        resizeMode="cover"
        accessible={false}
        pointerEvents="none"
      />
      <View
        pointerEvents="none"
        style={[styles.heroBackdrop, { height: 405 * scale + safeTop },Platform.OS==='web'&&{backgroundColor:'transparent',backgroundImage:`linear-gradient(110deg,${uiColorAlpha('nav.bg',0.79)},${uiColorAlpha('nav.bg',0.55)})`}]}
      />
      <View
        pointerEvents="none"
        style={[styles.lowerSurface, { top: 326 * scale + safeTop }]}
      />
      <SafeAreaView edges={['top', 'bottom']} style={styles.shade}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboard}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View testID="P01.login.composition" style={styles.composition}>
              <View
                testID="P01.login.brand"
                style={[
                  styles.brand,
                  { gap: 15 * scale, marginHorizontal: 26 * scale },
                ]}
              >
                <View
                  testID="P01.login.brand-mark"
                  style={[
                    styles.avatar,
                    styles.brandMark,
                    { width: 56 * scale, height: 58 * scale },
                  ]}
                >
                  <P01Icon
                    name="auth-scan"
                    size={42 * scale}
                    color={HN_UI.onBrand}
                    strokeWidth={2}
                  />
                </View>
                <View style={styles.brandCopy}>
                  <Text
                    variant="cardTitle"
                    style={[
                      styles.brandTitle,
                      { fontSize: 16 * scale, lineHeight: 22 * scale },
                    ]}
                  >
                    HOA NAM SCANNER
                  </Text>
                  <Text
                    variant="caption"
                    style={[
                      styles.brandSubtitle,
                      { fontSize: 14 * scale, lineHeight: 19 * scale },
                    ]}
                  >
                    WMS - Vận hành chuyên nghiệp
                  </Text>
                </View>
              </View>

              <View
                testID="P01.login.hero"
                style={[
                  styles.hero,
                  {
                    marginTop: 83 * scale,
                    marginLeft: 26 * scale,
                    marginRight: 20 * scale,
                    paddingBottom: 27 * scale,
                  },
                ]}
              >
                <View testID="P01.login.heroLead" style={styles.heroLead}>
                  <Text
                    style={[
                      styles.heroTitle,
                      {
                        fontSize: 34 * scale,
                        lineHeight: 36 * scale,
                        paddingRight: 12 * scale,
                      },
                    ]}
                  >
                    {'Quản lý kho\nHoa Nam'}
                  </Text>
                  <View
                    testID="P01.login.motto"
                    style={[
                      styles.motto,
                      { width: 55 * scale, marginTop: -12 * scale },
                    ]}
                    accessible={false}
                  >
                    {['CHÍNH XÁC', 'HIỆU QUẢ', 'VẬN HÀNH', 'BỀN VỮNG'].map(
                      line => (
                        <Text
                          key={line}
                          numberOfLines={1}
                          style={[
                            styles.mottoText,
                            { fontSize: 10 * scale, lineHeight: 18 * scale },
                          ]}
                        >
                          {line}
                        </Text>
                      ),
                    )}
                    <View
                      style={[styles.mottoLine, { marginTop: 6 * scale }]}
                    />
                  </View>
                </View>
                <Text
                  testID="P01.login.subtitle"
                  style={[
                    styles.heroSubtitle,
                    {
                      fontSize: 18 * scale,
                      lineHeight: 25 * scale,
                      marginTop: 10 * scale,
                    },
                  ]}
                >
                  Đăng nhập để bắt đầu phiên làm việc
                </Text>
              </View>

              <View
                testID="P01.login.form"
                style={[
                  styles.formPanel,
                  {
                    marginHorizontal: 14 * scale,
                    paddingHorizontal: 20 * scale,
                    paddingTop: 30 * scale,
                    paddingBottom: 24 * scale,
                  },
                ]}
              >
                {previewProblem ? (
                  <View style={{ marginBottom: 17 * scale }}>
                    <Banner
                      tone="danger"
                      title="Preview chưa có kết nối API"
                      message={previewProblem}
                    />
                  </View>
                ) : form.phase === 'failed' && form.formError !== undefined ? (
                  <View style={{ marginBottom: 17 * scale }}>
                    <Banner
                      tone="danger"
                      title="Không thể đăng nhập"
                      message={form.formError}
                    />
                  </View>
                ) : null}

                <Input
                  label="Email"
                  placeholder="Nhập email"
                  inputRef={emailRef}
                  fieldHeight={Math.max(44, 56 * scale)}
                  fieldStyle={[
                    styles.fieldBackground,
                    { paddingLeft: 16 * scale, paddingRight: 8 * scale },
                  ]}
                  containerStyle={{ gap: 8 * scale }}
                  labelStyle={[
                    styles.fieldLabel,
                    { fontSize: 16 * scale, lineHeight: 20 * scale },
                  ]}
                  inputStyle={{
                    fontFamily: SCANNER_ARIAL_FAMILY,
                    fontSize: Math.max(16, 16 * scale),
                    outlineWidth: 0,
                  }}
                  focusStyle={styles.fieldFocused}
                  value={form.email}
                  onChangeText={text =>
                    setForm(current => setEmail(current, text))
                  }
                  errorText={form.fieldErrors.email}
                  editable={!formLocked}
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
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  onFocus={event =>
                    revealFocusedField(event.nativeEvent.target)
                  }
                  leftAdornment={
                    <P01Icon name="user" size={24 * scale} color={HN_UI.textSecondary} />
                  }
                />

                <Input
                  label="Mật khẩu"
                  placeholder="Nhập mật khẩu"
                  inputRef={passwordRef}
                  fieldHeight={Math.max(44, 56 * scale)}
                  fieldStyle={[
                    styles.fieldBackground,
                    { paddingLeft: 16 * scale, paddingRight: 8 * scale },
                  ]}
                  containerStyle={{ marginTop: 23 * scale, gap: 8 * scale }}
                  labelStyle={[
                    styles.fieldLabel,
                    { fontSize: 16 * scale, lineHeight: 20 * scale },
                  ]}
                  inputStyle={{
                    fontFamily: SCANNER_ARIAL_FAMILY,
                    fontSize: Math.max(16, 16 * scale),
                    outlineWidth: 0,
                  }}
                  focusStyle={styles.fieldFocused}
                  value={form.password}
                  onChangeText={text =>
                    setForm(current => setPassword(current, text))
                  }
                  errorText={form.fieldErrors.password}
                  editable={!formLocked}
                  secureTextEntry={!revealed}
                  // Android có thể đặt lại con trỏ khi đổi `secureTextEntry`. Lưu và
                  // truyền lại selection hiện hành để thao tác Hiện/Ẩn không làm người
                  // dùng đang sửa mật khẩu bị nhảy vị trí gõ.
                  selection={passwordSelection}
                  onSelectionChange={event =>
                    setPasswordSelection(event.nativeEvent.selection)
                  }
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  autoComplete="current-password"
                  importantForAutofill="yes"
                  // Enter ở ô cuối gửi form — D-09 của app cũ là form không phải <form>
                  // thật nên Enter chỉ chạy ở ô mật khẩu. Ở RN ta nối thẳng vào submit.
                  returnKeyType="go"
                  onFocus={event =>
                    revealFocusedField(event.nativeEvent.target)
                  }
                  onSubmitEditing={handleSubmit}
                  leftAdornment={
                    <P01Icon name="lock" size={24 * scale} color={HN_UI.textSecondary} />
                  }
                  rightAdornment={
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        revealed ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'
                      }
                      disabled={formLocked}
                      accessibilityState={{
                        disabled: submitting,
                        expanded: revealed,
                      }}
                      onPress={() => setRevealed(current => !current)}
                      style={styles.revealButton}
                    >
                      <P01Icon name="eye" size={26 * scale} color={HN_UI.textSecondary} />
                    </Pressable>
                  }
                />

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Quên mật khẩu"
                  onPress={onForgotPassword ?? (() => undefined)}
                  disabled={formLocked}
                  style={[styles.forgotButton, { marginTop: 2 * scale }]}
                >
                  <Text
                    variant="caption"
                    style={[
                      styles.forgotLink,
                      {
                        color: HN_UI.textLink,
                        fontSize: 14 * scale,
                        lineHeight: 20 * scale,
                      },
                    ]}
                  >
                    Quên mật khẩu?
                  </Text>
                </Pressable>

                <Button
                  label={
                    previewProblem
                      ? 'Đăng nhập chưa khả dụng'
                      : submitLabel(form.phase)
                  }
                  onPress={handleSubmit}
                  loading={submitting}
                  // `disabled` không đặt theo tính hợp lệ: ảnh 02 cho thấy nút **luôn
                  // bấm được**, và bấm khi trống mới hiện lỗi từng ô (ảnh 03). Khoá nút
                  // sẵn sẽ khiến người dùng không hiểu vì sao không bấm được.
                  disabled={formLocked}
                  style={[
                    styles.primaryAction,
                    {
                      minHeight: Math.max(44, 66 * scale),
                      marginTop: 11 * scale,
                      paddingHorizontal: 38 * scale,
                    },
                  ]}
                  labelStyle={[styles.actionLabel, { fontSize: 20 * scale }]}
                  trailing={
                    <View style={styles.actionTrailing}>
                      <P01Icon name="arrow" color={HN_UI.onBrand} size={24 * scale} />
                    </View>
                  }
                />

                <View
                  testID="P01.login.notice"
                  style={[
                    styles.accessNotice,
                    {
                      gap: 16 * scale,
                      marginTop: 24 * scale,
                      minHeight: 76 * scale,
                      paddingHorizontal: 16 * scale,
                      paddingVertical: 17 * scale,
                    },
                  ]}
                >
                  <P01Icon name="shield" size={30 * scale} color={HN_UI.textSecondary} />
                  <View style={styles.accessCopy}>
                    <Text
                      variant="caption"
                      style={[
                        styles.accessTitle,
                        { fontSize: 14 * scale, lineHeight: 20 * scale },
                      ]}
                    >
                      Quyền truy cập theo tài khoản được cấp.
                    </Text>
                    <Text
                      variant="caption"
                      style={[
                        styles.accessHint,
                        {
                          fontSize: 13 * scale,
                          lineHeight: 18 * scale,
                          marginTop: 3 * scale,
                        },
                      ]}
                    >
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
              </View>

              <View
                testID="P01.login.footer"
                style={[
                  styles.footerGroup,
                  {
                    paddingTop: 28 * scale,
                    paddingBottom: 18 * scale,
                  },
                ]}
              >
                <Text
                  variant="caption"
                  style={[
                    styles.footerBrand,
                    { fontSize: 12 * scale, lineHeight: 18 * scale },
                  ]}
                >
                  HOA NAM SCANNER
                </Text>
                <View style={[styles.footerRow, { gap: 16 * scale }]}>
                  <View style={[styles.footerRule, { width: 40 * scale }]} />
                  <Text
                    style={[
                      styles.footerCaption,
                      { fontSize: 11 * scale, lineHeight: 18 * scale },
                    ]}
                  >
                    {'KẾT NỐI CON NGƯỜI - VẬN HÀNH HIỆU QUẢ'}
                  </Text>
                  <View style={[styles.footerRule, { width: 40 * scale }]} />
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <Dialog
        visible={mfa !== undefined}
        title="Xác thực hai bước"
        message="Nhập mã từ ứng dụng xác thực hoặc một mã khôi phục. Mã phiên chỉ được dùng một lần."
        dismissible={mfa?.busy !== true}
        onDismiss={leaveMfa}
      >
        {mfa?.error ? (
          <Banner tone="danger" title="Không thể xác thực" message={mfa.error} />
        ) : null}
        {mfa?.consumed ? null : (
          <Input
            label="Mã xác thực"
            placeholder="6 chữ số hoặc mã khôi phục"
            inputRef={mfaRef}
            value={mfa?.code ?? ''}
            onChangeText={code =>
              setMfa(current =>
                current ? { ...current, code, error: undefined } : current,
              )
            }
            editable={mfa?.busy !== true}
            maxLength={16}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            returnKeyType="go"
            onSubmitEditing={handleMfaSubmit}
            leftAdornment={<P01Icon name="shield" size={24} color={HN_UI.textSecondary} />}
          />
        )}
        {mfa?.consumed ? null : (
          <Button
            label={mfa?.busy ? 'Đang xác minh…' : 'Xác nhận'}
            onPress={handleMfaSubmit}
            loading={mfa?.busy}
            disabled={mfa?.busy}
          />
        )}
        <Button
          label="Quay lại đăng nhập"
          variant="secondary"
          onPress={leaveMfa}
          disabled={mfa?.busy}
        />
      </Dialog>
    </View>
  );
}
