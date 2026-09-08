/**
 * `Checkbox` — ô chọn nhiều, kèm mô tả.
 *
 * 🎨 Nguồn: ảnh **42** — danh sách bệnh/lỗi khách báo. Mỗi mục có:
 * ô vuông · tên lỗi đậm · dòng mô tả xám có **mã lỗi** (`DEF-006`, `DEF-013`).
 *
 * Mã lỗi hiển thị cùng mô tả chứ không giấu đi: thủ kho đọc mã cho kỹ thuật viên
 * qua điện thoại, và tên tiếng Việt dễ nhầm giữa các lỗi gần giống nhau.
 *
 * Vùng chạm là **cả hàng**, không chỉ ô vuông — ảnh cho thấy hàng cao ~72px, và
 * bắt thủ kho đeo găng nhắm trúng ô 20px là thiết kế tồi.
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  box: {
    width: 20,
    height: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    fontSize: 12,
    fontWeight: '700',
  },
  body: {
    flex: 1,
  },
  title: {
    fontWeight: '600',
  },
});

export interface CheckboxProps {
  checked: boolean;
  onToggle: () => void;
  label: string;
  /** Dòng mô tả xám bên dưới, ví dụ *"DEF-006 · Rò dầu ở gioăng nắp máy…"*. */
  description?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Checkbox({
  checked,
  onToggle,
  label,
  description,
  disabled = false,
  style,
}: CheckboxProps): React.ReactElement {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={
        label + (description === undefined ? '' : '. ' + description)
      }
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.row,
        {
          // Vùng chạm là cả hàng — xem chú thích đầu tệp.
          minHeight: theme.touchTarget.comfortable,
          gap: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.box,
          {
            borderRadius: theme.radius.control / 2,
            borderColor: checked ? theme.colors.primary : theme.field.border,
            backgroundColor: checked
              ? theme.colors.primary
              : theme.colors.surface,
          },
        ]}
      >
        {checked ? <Text style={styles.mark}>✓</Text> : null}
      </View>

      <View style={styles.body}>
        <Text variant="body" tone="strong" style={styles.title}>
          {label}
        </Text>
        {description === undefined ? null : (
          <Text variant="caption" tone="muted">
            {description}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
