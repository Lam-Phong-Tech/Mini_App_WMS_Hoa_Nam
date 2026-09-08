/**
 * `Button` — `Pressable` đã chuẩn hoá (Prompt 2 §3).
 *
 * Chiều cao tối thiểu bám `touchTarget.min = 44` — audit UI/UX của Mini App đo
 * được nút thật chỉ 44px (defect D-10), nên đây là sàn chứ không phải mục tiêu.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

const styles = StyleSheet.create({
  label: {
    fontWeight: '600',
  },
});

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  /** Nhãn cho trình đọc màn hình khi `label` chưa đủ nghĩa. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityLabel,
  style,
}: ButtonProps): React.ReactElement {
  const theme = useTheme();
  const inactive = disabled || loading;

  const background: Record<ButtonVariant, string> = {
    primary: theme.colors.primary,
    secondary: theme.colors.surface,
    danger: theme.colors.danger,
  };
  const labelColor: Record<ButtonVariant, string> = {
    primary: '#ffffff',
    secondary: theme.colors.textStrong,
    danger: '#ffffff',
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: theme.touchTarget.min,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          borderRadius: theme.radius.control,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: theme.spacing.sm,
          backgroundColor: background[variant],
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: theme.colors.divider,
          opacity: inactive ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={labelColor[variant]} />
      ) : null}
      <Text
        variant="body"
        style={[styles.label, { color: labelColor[variant] }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
