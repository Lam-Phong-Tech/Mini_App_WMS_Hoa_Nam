/**
 * `Select` — ô chọn một giá trị, mở danh sách trong `Sheet`.
 *
 * 🎨 Nguồn: ảnh **25, 26** (Nhóm đối tượng xuất · Tỉnh/Thành phố · Phường/Xã),
 * ảnh **41** (Tỉnh/Thành phố của hồ sơ bảo hành), ảnh **46** (Nhóm hình ảnh/video).
 *
 * ## Trường phụ thuộc — hành vi quan sát được ở ảnh 26
 *
 * Ô **Phường/Xã** bị **mờ** và placeholder đổi thành *"Chọn tỉnh/thành trước"*
 * khi chưa chọn tỉnh. Đây không phải trang trí: nó nói cho thủ kho biết **vì
 * sao** chưa bấm được, thay vì để họ bấm mãi vào một ô câm.
 *
 * ⇒ `disabled` đi kèm `disabledPlaceholder` — khoá mà không giải thích là lỗi
 * UX, không phải tính năng.
 *
 * ## Vì sao dùng `Sheet` chứ không phải picker của hệ thống
 *
 * Picker gốc Android hiện khác nhau theo phiên bản và theo hãng PDA, mà bộ ảnh
 * là chuẩn. Dùng `Sheet` cho ra đúng một hình dạng trên mọi máy, và tận dụng
 * được vùng chạm lớn đã đặt ở đó.
 */

import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';
import { Sheet } from './Sheet';

const styles = StyleSheet.create({
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
  },
  controlText: {
    flexShrink: 1,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionList: {
    maxHeight: 320,
  },
});

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectProps {
  label?: string;
  /** Chuỗi lỗi. Có giá trị = ô ở trạng thái lỗi, viền đỏ như ảnh 27. */
  errorText?: string;
  placeholder?: string;
  /** Placeholder khi bị khoá — phải nói VÌ SAO khoá. Xem chú thích đầu tệp. */
  disabledPlaceholder?: string;
  value?: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Tiêu đề hộp chọn. Mặc định lấy theo `label`. */
  sheetTitle?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function Select({
  label,
  errorText,
  placeholder = 'Chọn…',
  disabledPlaceholder,
  value,
  options,
  onChange,
  disabled = false,
  sheetTitle,
  containerStyle,
}: SelectProps): React.ReactElement {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const hasError = errorText !== undefined && errorText.length > 0;
  const selected = options.find(option => option.value === value);

  const shownText = disabled
    ? (disabledPlaceholder ?? placeholder)
    : (selected?.label ?? placeholder);

  const borderColor = hasError
    ? theme.field.borderError
    : open
      ? theme.field.borderFocus
      : theme.field.border;

  return (
    <View style={[{ gap: theme.spacing.xs }, containerStyle]}>
      {label === undefined ? null : (
        <Text variant="caption" tone="muted">
          {label}
        </Text>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: open }}
        accessibilityLabel={(label ?? 'Lựa chọn') + ': ' + shownText}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[
          styles.control,
          {
            minHeight: theme.field.height,
            paddingHorizontal: theme.field.paddingX,
            borderRadius: theme.field.radius,
            borderColor,
            backgroundColor: disabled
              ? theme.field.disabledBackground
              : theme.field.background,
          },
        ]}
      >
        <Text
          variant="body"
          style={[
            styles.controlText,
            {
              color:
                selected === undefined || disabled
                  ? theme.colors.textMuted
                  : theme.colors.textStrong,
            },
          ]}
        >
          {shownText}
        </Text>
        <Text variant="caption" tone="muted">
          ⌄
        </Text>
      </Pressable>

      {hasError ? (
        <Text variant="caption" style={{ color: theme.colors.danger }}>
          {errorText}
        </Text>
      ) : null}

      <Sheet
        visible={open}
        onDismiss={() => setOpen(false)}
        title={sheetTitle ?? label ?? 'Chọn'}
      >
        <ScrollView style={styles.optionList}>
          {options.map(option => {
            const active = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={[
                  styles.option,
                  {
                    minHeight: theme.touchTarget.comfortable,
                    paddingVertical: theme.spacing.md,
                    gap: theme.spacing.md,
                  },
                ]}
              >
                <Text
                  variant="body"
                  style={{
                    color: active
                      ? theme.colors.primaryStrong
                      : theme.colors.textStrong,
                  }}
                >
                  {option.label}
                </Text>
                {active ? (
                  <Text style={{ color: theme.colors.primary }}>✓</Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </Sheet>
    </View>
  );
}
