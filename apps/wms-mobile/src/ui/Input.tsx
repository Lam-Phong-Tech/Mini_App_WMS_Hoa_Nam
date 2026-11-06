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

import React, { useContext, useRef, useState, type ReactNode } from 'react';
import {ScannerTextInput as TextInput} from './ScannerTextInput';
import {StyleSheet,View,type TextInputProps,type StyleProp,type ViewStyle,type TextStyle} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';
import { KeyboardViewportContext } from './Page';

const styles = StyleSheet.create({
  field: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    minWidth: 0,
  },
  adornment: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    height: '100%',
    minWidth: 0,
    paddingVertical: 0,
  },
});

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  helperText?: string;
  /** Chuỗi lỗi. Có giá trị = ô nhập ở trạng thái lỗi. */
  errorText?: string;
  containerStyle?: StyleProp<ViewStyle>;
  /** Icon/nút nằm trong vùng nhập; dùng cho các màn cần bám thiết kế. */
  leftAdornment?: ReactNode;
  rightAdornment?: ReactNode;
  /** Opt-in presentation only; cursor, focus events and keyboard accessibility stay enabled. */
  quietFocus?: boolean;
  /** Opt-in owner reference for field validation/focus, without remounting. */
  inputRef?: React.RefObject<React.ComponentRef<typeof TextInput> | null>;
  /** P01 LOCKED uses 56px fields; other screens retain the shared 50px default. */
  fieldHeight?: number;
  /** P01 LOCKED uses a larger field label than the shared caption default. */
  labelStyle?: StyleProp<TextStyle>;
  fieldStyle?: StyleProp<ViewStyle>;
  /** Optional outer-field focus treatment; invalid fields retain their error frame. */
  focusStyle?: StyleProp<ViewStyle>;
  /** Optional reference tint; focus and validation borders remain authoritative. */
  restingBorderColor?: string;
  inputStyle?: StyleProp<TextStyle>;
}

export function Input({
  label,
  helperText,
  errorText,
  containerStyle,
  leftAdornment,
  rightAdornment,
  quietFocus = false,
  inputRef: providedInputRef,
  fieldHeight,
  labelStyle,
  fieldStyle,
  focusStyle,
  restingBorderColor,
  inputStyle,
  onFocus,
  onBlur,
  editable = true,
  // Xem chú thích đầu tệp: mặc định tắt, bên gọi tự bật khi thật sự cần.
  autoComplete = 'off',
  importantForAutofill = 'no',
  ...rest
}: InputProps): React.ReactElement {
  const theme = useTheme();
  const inputFontFamily=StyleSheet.flatten(inputStyle)?.fontFamily??theme.typography.fontFamily;
  const localInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const inputRef = providedInputRef ?? localInputRef;
  const revealFocusedInput = useContext(KeyboardViewportContext);
  const [focused, setFocused] = useState(false);
  const hasError = errorText !== undefined && errorText.length > 0;
  const disabled=editable===false||rest.accessibilityState?.disabled===true;
  const readonly=!disabled&&rest.readOnly===true;
  const fieldBackground=disabled?theme.field.disabledBackground:readonly?theme.field.readonlyBackground:theme.field.background;

  const borderColor = disabled?theme.field.disabledBorder:hasError
    ? theme.field.borderError
    : focused && !quietFocus
    ? theme.field.borderFocus
    : restingBorderColor??theme.field.border;

  return (
    <View style={[{ gap: theme.spacing.xs }, containerStyle]}>
      {label === undefined ? null : (
        <Text
          variant="caption"
          tone="muted"
          style={[{ fontSize: theme.field.labelSize }, labelStyle]}
        >
          {label}
        </Text>
      )}

      <View
        style={[
          styles.field,
          {
            height: fieldHeight ?? theme.field.height,
            paddingHorizontal: theme.field.paddingX,
            borderRadius: theme.field.radius,
            borderColor,
            backgroundColor: editable
              ? theme.field.background
              : theme.field.disabledBackground,
          },
          fieldStyle,
          focused && !quietFocus && !hasError && !disabled ? focusStyle : undefined,
          { borderColor,backgroundColor:fieldBackground,borderRadius:theme.field.radius,overflow:'hidden' },
        ]}
      >
        {leftAdornment === undefined ? null : (
          <View style={[styles.adornment, { marginRight: theme.spacing.sm }]}>
            {leftAdornment}
          </View>
        )}
        <TextInput
          ref={inputRef}
          {...rest}
          editable={editable}
          invalid={hasError}
          focusFrame="inner"
          autoComplete={autoComplete}
          importantForAutofill={importantForAutofill}
          onFocus={event => {
            setFocused(true);
            onFocus?.(event);
            revealFocusedInput?.(inputRef.current);
          }}
          onBlur={event => {
            setFocused(false);
            onBlur?.(event);
          }}
          placeholderTextColor={theme.field.placeholder}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          style={[
            styles.input,
            {
              color: theme.colors.textStrong,
              fontFamily: theme.typography.fontFamily,
              fontSize: theme.typography.body.fontSize,
            },
            inputStyle,
            inputFontFamily?{fontFamily:inputFontFamily}:undefined,
            disabled?{color:theme.field.disabledText}:undefined,
          ]}
        />
        {rightAdornment === undefined ? null : (
          <View style={[styles.adornment, { marginLeft: theme.spacing.sm }]}>
            {rightAdornment}
          </View>
        )}
      </View>

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
          style={{ fontSize: theme.field.helperSize,color:theme.field.helperColor }}
        >
          {helperText}
        </Text>
      )}
    </View>
  );
}
