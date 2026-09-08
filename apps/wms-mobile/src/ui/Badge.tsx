/**
 * `Badge` — nhãn trạng thái nhỏ, bo tròn.
 *
 * 🎨 Nguồn: bộ 47 ảnh. Badge xuất hiện ở ba vai trò khác nhau, và bộ ảnh dùng
 * **màu để phân biệt vai trò**, không phải để trang trí:
 *
 * | Ví dụ từ ảnh | Tone | Vai trò |
 * |---|---|---|
 * | *Hoàn tất* (38) · *Đã quét* (32) · *✓ Thành công* (12) · *Đã post* (31) | `success` | việc đã xong |
 * | `RECEIVED` (44) · *0/1* (28) | `warning` | đang dở, chưa đủ |
 * | *8 mã* (21) · *Đã quét 8* (21) · *5 phiếu* (12) · *TẠO MỚI* (25) | `primary` | đếm/nhãn trung tính |
 * | *Đã tiếp nhận* (40) | `success` | — |
 *
 * `count` tách riêng khỏi `label` vì bộ ảnh cho thấy hai cách đọc khác nhau:
 * *"Phiếu nhập · 0"* (ảnh 36) là nhãn kèm số, còn *"0/1"* (ảnh 28) là tiến độ.
 */

import React from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

/** Phần không phụ thuộc theme. Giá trị theo theme vẫn đặt inline. */
const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    borderRadius: 999,
  },
  label: {
    fontWeight: '600',
  },
  labelUpper: {
    textTransform: 'uppercase',
  },
});

export type BadgeTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  /** Chữ IN HOA như *TẠO MỚI* / `RECEIVED` trong ảnh 25 và 44. */
  uppercase?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Badge({
  label,
  tone = 'primary',
  uppercase = false,
  style,
}: BadgeProps): React.ReactElement {
  const theme = useTheme();

  const background: Record<BadgeTone, string> = {
    primary: theme.colors.primarySoft,
    success: theme.colors.successSoft,
    warning: theme.colors.warningSoft,
    danger: theme.colors.dangerSoft,
    neutral: theme.colors.surfaceSubtle,
  };
  const foreground: Record<BadgeTone, string> = {
    primary: theme.colors.primaryStrong,
    success: theme.colors.successText,
    warning: theme.colors.warningText,
    danger: theme.colors.dangerText,
    neutral: theme.colors.textMuted,
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.xs,
          backgroundColor: background[tone],
        },
        style,
      ]}
    >
      <Text
        variant="caption"
        // `numberOfLines` cố ý KHÔNG đặt: badge phải co theo nội dung. Bộ ảnh
        // có badge dài như *"Đã tiếp nhận"* và *"Chờ duyệt nhập kho"*; cắt chữ
        // ở đây sẽ giấu mất trạng thái phiếu.
        style={[
          styles.label,
          uppercase ? styles.labelUpper : undefined,
          { color: foreground[tone] },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}
