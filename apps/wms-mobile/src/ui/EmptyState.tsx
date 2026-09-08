/**
 * `EmptyState` — khối "chưa có dữ liệu".
 *
 * 🎨 Nguồn: bộ 47 ảnh — ảnh 36, 37 (duyệt phiếu) và 46 (ảnh/video bảo hành).
 *
 * Hai điều rút ra từ ảnh, cả hai đều đáng giữ:
 *
 * 1. **Câu phụ nói người dùng phải làm gì**, không chỉ báo là trống:
 *    *"Chọn folder còn lại hoặc bấm Đồng bộ để tải lại danh sách từ WMS."*
 *    (ảnh 36). Empty state chỉ ghi "không có dữ liệu" là bỏ rơi người dùng.
 * 2. **Có thể kèm nút hành động**: ảnh 37 đặt *"Tạo phiếu xuất"* ngay trong
 *    empty state, biến ngõ cụt thành lối đi tiếp.
 *
 * ⚠️ Không dùng component này để che lỗi. Trống vì **chưa có dữ liệu** khác hẳn
 * trống vì **gọi API hỏng** — trường hợp sau phải dùng trạng thái lỗi có nút thử
 * lại (Prompt 4 §C). Nhầm hai thứ này là giấu sự cố khỏi thủ kho.
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
    alignItems: 'center',
  },
  iconBox: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontWeight: '600',
    textAlign: 'center',
  },
  hint: {
    textAlign: 'center',
  },
  action: {
    alignSelf: 'stretch',
  },
});

export interface EmptyStateProps {
  /** Dòng chính, ví dụ *"Chưa có phiếu nhập chờ duyệt"*. */
  title: string;
  /** Câu chỉ dẫn việc cần làm. Nên có — xem ghi chú đầu tệp. */
  hint?: string;
  icon?: React.ReactNode;
  /** Nút hành động xếp dưới, ví dụ *"Tạo phiếu xuất"* ở ảnh 37. */
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({
  title,
  hint,
  icon,
  action,
  style,
}: EmptyStateProps): React.ReactElement {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={title + (hint === undefined ? '' : '. ' + hint)}
      style={[
        styles.container,
        {
          gap: theme.spacing.md,
          paddingVertical: theme.spacing.xxl,
          paddingHorizontal: theme.spacing.lg,
        },
        style,
      ]}
    >
      {icon === undefined ? null : (
        <View
          style={[
            styles.iconBox,
            {
              borderRadius: theme.radius.card,
              backgroundColor: theme.colors.primarySoft,
            },
          ]}
        >
          {icon}
        </View>
      )}

      <Text
        variant="body"
        style={[styles.title, { color: theme.colors.textStrong }]}
      >
        {title}
      </Text>

      {hint === undefined ? null : (
        <Text
          variant="caption"
          style={[styles.hint, { color: theme.colors.textMuted }]}
        >
          {hint}
        </Text>
      )}

      {action === undefined ? null : (
        <View style={[styles.action, { marginTop: theme.spacing.sm }]}>
          {action}
        </View>
      )}
    </View>
  );
}
