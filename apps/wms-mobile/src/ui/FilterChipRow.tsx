/**
 * `FilterChipRow` — hàng chip lọc, cuộn ngang.
 *
 * 🎨 Nguồn: ảnh **38** (Lịch sử chứng từ — *hai* hàng chip) và ảnh **39** (Bảo
 * hành — 5 tab trạng thái: Tiếp nhận · Kiểm tra · Sửa chữa · Hoàn tất · Đã trả).
 *
 * ## Vì sao cuộn ngang chứ không xuống dòng
 *
 * Bộ ảnh cho thấy hàng chip có **thanh cuộn ngang nhìn thấy được** ở cả hai màn.
 * Cho xuống dòng sẽ đẩy nội dung chính xuống dưới màn hình — trên viewport 333px
 * của PDA, hai hàng chip xuống dòng chiếm gần nửa màn.
 *
 * ⚠️ Chip **không cắt chữ**: *"Mọi trạng thái"* và *"Đã trả khách"* phải đọc
 * được đủ. Chip bị cắt còn tệ hơn phải cuộn — người dùng không biết mình đang
 * lọc theo gì.
 */

import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

const styles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
  },
  label: {
    fontWeight: '600',
  },
});

export interface FilterChip {
  readonly key: string;
  readonly label: string;
  /** Số đếm kèm nhãn, ví dụ *"Phiếu nhập · 0"* ở ảnh 36. */
  readonly count?: number;
}

export interface FilterChipRowProps {
  chips: readonly FilterChip[];
  activeKey: string;
  onSelect: (key: string) => void;
  style?: StyleProp<ViewStyle>;
}

export function FilterChipRow({
  chips,
  activeKey,
  onSelect,
  style,
}: FilterChipRowProps): React.ReactElement {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator
      // `alwaysBounceHorizontal` tắt: PDA không có cử chỉ bật lại như iOS, và
      // hiệu ứng nảy làm người dùng tưởng danh sách đã hết.
      alwaysBounceHorizontal={false}
      contentContainerStyle={{ gap: theme.spacing.sm }}
      // Android có thể đo ScrollView ngang là 0px khi nó nằm giữa ô nhập và
      // FlashList co giãn. Giữ đúng chiều cao vùng chạm của chip để hai hàng
      // lọc của Lịch sử luôn hiện, cả khi máy đang xoay ngang.
      style={[{ minHeight: theme.touchTarget.min, maxHeight: theme.touchTarget.min }, style]}
    >
      {chips.map(chip => {
        const active = chip.key === activeKey;
        return (
          <Pressable
            key={chip.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(chip.key)}
            style={[
              styles.chip,
              {
                minHeight: theme.touchTarget.min,
                paddingHorizontal: theme.spacing.lg,
                borderColor: active
                  ? theme.colors.primary
                  : theme.colors.divider,
                backgroundColor: active
                  ? theme.colors.primarySoft
                  : theme.colors.surface,
              },
            ]}
          >
            <Text
              variant="caption"
              // KHÔNG đặt numberOfLines — chip cắt chữ thì người dùng không biết
              // mình đang lọc theo gì.
              style={[
                styles.label,
                {
                  color: active
                    ? theme.colors.primaryStrong
                    : theme.colors.text,
                },
              ]}
            >
              {chip.count === undefined
                ? chip.label
                : chip.label + ' · ' + String(chip.count)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
