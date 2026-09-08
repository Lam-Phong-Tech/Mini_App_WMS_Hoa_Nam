/**
 * `Stepper` — chỉ báo tiến trình nhiều bước ở đầu màn.
 *
 * 🎨 Nguồn: bộ 47 ảnh. Ba biến thể **số bước khác nhau** xuất hiện trong app cũ:
 *
 * | Luồng | Số bước | Nhãn | Ảnh |
 * |---|:--:|---|:--:|
 * | Nhập kho | 4 | Thông tin · Quét mã · Kiểm tra · Gửi duyệt | 18, 20, 21, 23 |
 * | Xuất kho | 4 | Thông tin · Quét mã · Kiểm tra · Gửi duyệt | 25, 29, 34 |
 * | Bảo hành — tạo hồ sơ | 3 | Tiếp nhận · Tạo hồ sơ · Kiểm tra | 41 |
 * | Bảo hành — chi tiết | 4 | Tiếp nhận · Kiểm tra · Xử lý · Trả khách | 44 |
 *
 * Ba trạng thái mỗi bước, quan sát trực tiếp từ ảnh:
 * - **đã xong**: vòng tròn viền tím + dấu ✓, nhãn chữ thường
 * - **đang ở**: vòng tròn nền tím đậm + số, nhãn **đậm** màu tím
 * - **chưa tới**: vòng tròn viền xám + số, nhãn xám nhạt
 *
 * ⚠️ Nhãn bị cắt trong ảnh (*"Thông ..."*, *"Gửi du..."*) là **hệ quả của
 * viewport 333px**, không phải chủ ý thiết kế. Bản port cho phép nhãn xuống dòng
 * thay vì cắt, vì PDA có màn hẹp hơn nữa và cắt mất chữ khiến thủ kho không biết
 * mình đang ở bước nào. Đây là **sửa lỗi responsive**, không phải đổi thiết kế.
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
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  // `flex: 1` chia đều chiều ngang: nhãn dài xuống dòng trong ô của mình thay vì
  // đẩy các bước sau ra khỏi màn.
  step: {
    flex: 1,
    alignItems: 'center',
  },
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    fontWeight: '600',
    fontSize: 11,
  },
  label: {
    fontSize: 11,
    textAlign: 'center',
  },
  labelActive: {
    fontWeight: '600',
  },
});

export interface StepperProps {
  /** Nhãn từng bước, theo đúng thứ tự. Độ dài mảng = số bước. */
  steps: readonly string[];
  /** Chỉ số bước đang đứng, tính từ 0. */
  current: number;
  style?: StyleProp<ViewStyle>;
}

export function Stepper({
  steps,
  current,
  style,
}: StepperProps): React.ReactElement {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: steps.length, now: current + 1 }}
      accessibilityLabel={
        'Bước ' +
        String(current + 1) +
        ' trên ' +
        String(steps.length) +
        ': ' +
        (steps[current] ?? '')
      }
      style={[styles.container, { gap: theme.spacing.sm }, style]}
    >
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;

        const circleBackground = active
          ? theme.colors.primary
          : theme.colors.surface;
        const circleBorder = done || active
          ? theme.colors.primary
          : theme.colors.divider;
        const markColor = active ? '#ffffff' : done
          ? theme.colors.primary
          : theme.colors.textMuted;

        return (
          <View
            key={label + String(index)}
            style={[styles.step, { gap: theme.spacing.xs }]}
          >
            <View
              style={[
                styles.circle,
                {
                  borderColor: circleBorder,
                  backgroundColor: circleBackground,
                },
              ]}
            >
              <Text
                variant="caption"
                style={[styles.mark, { color: markColor }]}
              >
                {done ? '✓' : String(index + 1)}
              </Text>
            </View>

            <Text
              variant="caption"
              style={[
                styles.label,
                active ? styles.labelActive : undefined,
                {
                  color: active
                    ? theme.colors.primaryStrong
                    : done
                      ? theme.colors.text
                      : theme.colors.textMuted,
                },
              ]}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
