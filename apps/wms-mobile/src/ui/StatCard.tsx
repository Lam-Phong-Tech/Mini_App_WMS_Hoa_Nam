/**
 * `StatCard` — thẻ số liệu, luôn đứng thành cặp trên một hàng.
 *
 * 🎨 Nguồn: bộ 47 ảnh. Bốn chỗ dùng, và **cách bố trí khác nhau** theo ngữ cảnh:
 *
 * | Ảnh | Cặp thẻ | Có icon | Có chú thích dưới |
 * |:--:|---|:--:|:--:|
 * | 11 | *Chờ duyệt 5* · *Đã duyệt hôm nay 44* | ✅ | ✅ (*Cần xử lý* / *Hoàn tất*) |
 * | 20, 21 | *TỔNG ĐÃ QUÉT* · *SỐ SKU* | ❌ | ❌ |
 * | 39 | *Đã tiếp nhận 25* · *Luồng tiếp nhận 2* | ✅ | chỉ thẻ phải (*Có mã · mất mã*) |
 *
 * Vì vậy `icon` và `footnote` đều tuỳ chọn, và nền thẻ có hai kiểu: nền trắng
 * (ảnh 11, 39) hoặc nền màu nhạt (ảnh 20, 21 — tím cho *TỔNG ĐÃ QUÉT*, xanh lá
 * cho *SỐ SKU*).
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
  // `flex: 1` để hai thẻ chia đều hàng; `minWidth: 0` cho phép co lại trên PDA
  // hẹp thay vì đẩy thẻ bên cạnh ra ngoài màn.
  container: {
    flex: 1,
    minWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  label: {
    flex: 1,
  },
  labelUpper: {
    textTransform: 'uppercase',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  iconBox: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export type StatCardTone = 'surface' | 'primary' | 'success';

export interface StatCardProps {
  /** Nhãn trên cùng, ví dụ *Chờ duyệt* hoặc *TỔNG ĐÃ QUÉT*. */
  label: string;
  /** Con số lớn. Nhận `string` để bên gọi tự định dạng (`5`, `0/1`, `—`). */
  value: string;
  /** Chú thích nhỏ dưới con số, ví dụ *Cần xử lý*. */
  footnote?: string;
  icon?: React.ReactNode;
  tone?: StatCardTone;
  /** Chữ nhãn IN HOA như ảnh 20, 21. */
  uppercaseLabel?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function StatCard({
  label,
  value,
  footnote,
  icon,
  tone = 'surface',
  uppercaseLabel = false,
  style,
}: StatCardProps): React.ReactElement {
  const theme = useTheme();

  const background: Record<StatCardTone, string> = {
    surface: theme.colors.surface,
    primary: theme.colors.primarySoft,
    success: theme.colors.successSoft,
  };
  const valueColor: Record<StatCardTone, string> = {
    surface: theme.colors.textStrong,
    primary: theme.colors.primaryStrong,
    success: theme.colors.successText,
  };

  return (
    <View
      accessible
      // Gộp thành một nhãn để TalkBack không đọc rời "Chờ duyệt" — "5" — "Cần xử lý".
      accessibilityLabel={
        label + ': ' + value + (footnote === undefined ? '' : '. ' + footnote)
      }
      style={[
        styles.container,
        {
          padding: theme.spacing.lg,
          borderRadius: theme.radius.card,
          backgroundColor: background[tone],
          gap: theme.spacing.sm,
        },
        style,
      ]}
    >
      <View
        style={[styles.header, { gap: theme.spacing.sm }]}
      >
        <Text
          variant="caption"
          style={[
            styles.label,
            uppercaseLabel ? styles.labelUpper : undefined,
            { color: theme.colors.textMuted },
          ]}
        >
          {label}
        </Text>
        {icon === undefined ? null : (
          <View
            style={[
              styles.iconBox,
              {
                borderRadius: theme.radius.control,
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            {icon}
          </View>
        )}
      </View>

      <Text variant="metric" style={{ color: valueColor[tone] }}>
        {value}
      </Text>

      {footnote === undefined ? null : (
        <Text variant="caption" style={{ color: theme.colors.textMuted }}>
          {footnote}
        </Text>
      )}
    </View>
  );
}
