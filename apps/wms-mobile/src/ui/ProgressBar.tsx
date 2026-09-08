/**
 * `ProgressBar` — thanh tiến độ mảnh.
 *
 * 🎨 Nguồn: ảnh **29, 30** (phiếu xuất đang quét — thanh **rỗng**), ảnh **31**
 * (đã quét đủ 5/5 — thanh **đầy**), ảnh **38** (thẻ trong lịch sử chứng từ).
 *
 * ⚠️ **Giá trị luôn do máy chủ tính, client không cộng lại** — `progress_percent`
 * và `scanned_total_qty` là trường của WMS
 * ([03-api-contract-delta.md §4f.6](../../../../docs/migration/03-api-contract-delta.md)).
 * Component này chỉ vẽ; nó **không** biết gì về nghiệp vụ.
 *
 * Tỉ lệ ngoài khoảng 0–1 bị kẹp lại thay vì vẽ tràn: dữ liệu bẩn từ máy chủ
 * không được làm vỡ bố cục màn hình.
 */

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

const styles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});

export type ProgressTone = 'primary' | 'success' | 'warning';

export interface ProgressBarProps {
  /** Số đã đạt. */
  value: number;
  /** Mốc cần đạt. `0` hoặc âm ⇒ vẽ thanh rỗng, không chia cho 0. */
  target: number;
  tone?: ProgressTone;
  style?: StyleProp<ViewStyle>;
  /** Nhãn cho trình đọc màn hình, ví dụ *"Đã quét 3 trên 5"*. */
  accessibilityLabel?: string;
}

export function ProgressBar({
  value,
  target,
  tone = 'primary',
  style,
  accessibilityLabel,
}: ProgressBarProps): React.ReactElement {
  const theme = useTheme();

  const ratio =
    target > 0 ? Math.min(1, Math.max(0, value / target)) : 0;

  const color: Record<ProgressTone, string> = {
    primary: theme.colors.primary,
    success: theme.colors.success,
    warning: theme.colors.warning,
  };

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: Math.max(target, 0), now: value }}
      style={[
        styles.track,
        { backgroundColor: theme.colors.surfaceSubtle },
        style,
      ]}
    >
      <View
        style={[
          styles.fill,
          {
            width: (ratio * 100).toFixed(2) + '%',
            backgroundColor: color[tone],
          },
        ]}
      />
    </View>
  );
}
