/**
 * `Input` — `TextInput` có wrapper nhãn / trợ giúp / lỗi (Prompt 2 §3).
 *
 * Kích thước và màu viền lấy nguyên từ nhóm token `--wms-field-*`.
 * Validation ở đây là **hiển thị** trạng thái lỗi do bên gọi truyền vào; không
 * nhúng luật nghiệp vụ nào vào component dùng chung.
 *
 * ## 🔴 Mặc định tắt autofill — vì sao
 *
 * Chạy thật 2026-09-06: tạo xong một hồ sơ bảo hành, Android bật hộp thoại
 * **"Lưu mật khẩu vào Google?"** với *Tên người dùng* = **số điện thoại của
 * khách hàng**. Android tự đoán form và rủ lưu; thủ kho bấm nhầm "Lưu" là dữ
 * liệu cá nhân của khách chui vào tài khoản Google **cá nhân** của họ.
 *
 * Đây là app nội bộ: gần như **không ô nào** cần autofill. Nên mặc định là
 * tắt (`autoComplete="off"`, `importantForAutofill="no"`), và ô nào thật sự
 * muốn thì **tự khai** — hiện chỉ có màn đăng nhập, nơi đó là tài khoản WMS
 * của chính người dùng chứ không phải dữ liệu khách.
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

const styles = StyleSheet.create({
  field: {
    borderWidth: 1,
  },
});

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  helperText?: string;
  /** Chuỗi lỗi. Có giá trị = ô nhập ở trạng thái lỗi. */
  errorText?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function Input({
  label,
  helperText,
  errorText,
  containerStyle,
  onFocus,
  onBlur,
  editable = true,
  // Xem chú thích đầu tệp: mặc định tắt, bên gọi tự bật khi thật sự cần.
  autoComplete = 'off',
  importantForAutofill = 'no',
  ...rest
}: InputProps): React.ReactElement {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const hasError = errorText !== undefined && errorText.length > 0;

  const borderColor = hasError
    ? theme.field.borderError
    : focused
    ? theme.field.borderFocus
    : theme.field.border;

  return (
    <View style={[{ gap: theme.spacing.xs }, containerStyle]}>
      {label === undefined ? null : (
        <Text
          variant="caption"
          tone="muted"
          style={{ fontSize: theme.field.labelSize }}
        >
          {label}
        </Text>
      )}

      <TextInput
        {...rest}
        editable={editable}
        autoComplete={autoComplete}
        importantForAutofill={importantForAutofill}
        onFocus={event => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={event => {
          setFocused(false);
          onBlur?.(event);
        }}
        placeholderTextColor={theme.colors.textMuted}
        accessibilityLabel={rest.accessibilityLabel ?? label}
        style={[
          styles.field,
          {
            height: theme.field.height,
            paddingHorizontal: theme.field.paddingX,
            borderRadius: theme.field.radius,
            borderColor,
            backgroundColor: editable
              ? theme.field.background
              : theme.field.disabledBackground,
            color: theme.colors.textStrong,
            fontFamily: theme.typography.fontFamily,
            fontSize: theme.typography.body.fontSize,
          },
        ]}
      />

      {hasError ? (
        <Text
          variant="caption"
          tone="danger"
          style={{ fontSize: theme.field.helperSize }}
        >
          {errorText}
        </Text>
      ) : helperText === undefined ? null : (
        <Text
          variant="caption"
          tone="muted"
          style={{ fontSize: theme.field.helperSize }}
        >
          {helperText}
        </Text>
      )}
    </View>
  );
}
