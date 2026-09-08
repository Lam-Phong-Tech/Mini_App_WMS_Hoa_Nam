/**
 * `Banner` — khối thông điệp có sắc thái, dùng ở gần như mọi màn nghiệp vụ.
 *
 * 🎨 Nguồn thiết kế: [04-design-reference.md](../../../../docs/migration/04-design-reference.md)
 * — 47 ảnh chụp thật của Mini App cũ.
 *
 * ⚠️ **Bốn sắc thái là hệ thống ngữ nghĩa, không phải trang trí.** Đọc bộ ảnh
 * thấy rõ quy ước, và port phải giữ đúng:
 *
 * | Sắc thái | Nghĩa | Ví dụ nguyên văn từ ảnh |
 * |---|---|---|
 * | `info` | **Giải thích nghiệp vụ** — cho biết hệ thống làm gì | *"Không nhập SKU ở bước này — Backend WMS sẽ tự resolve SKU/item theo QR/Barcode"* (ảnh 25) |
 * | `warning` | **Điều kiện chưa đủ** — người dùng còn phải làm gì đó | *"Chưa đủ số lượng — Bạn cần quét đủ số lượng đã nhập"* (ảnh 29) |
 * | `success` | **Đã xong** — trạng thái tích cực đã đạt | *"Phiếu đã phê duyệt"* (ảnh 21) |
 * | `danger` | **Lỗi** — thao tác thất bại | *"Không thể đăng nhập — Sai tài khoản hoặc mật khẩu."* (ảnh 05) |
 *
 * Dùng sai sắc thái là **đổi nghĩa thông điệp** với thủ kho đang cầm hàng: banner
 * cam nghĩa là "làm tiếp đi", banner đỏ nghĩa là "hỏng rồi". Không hoán đổi vì
 * lý do thẩm mỹ.
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
  iconBox: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  title: {
    fontWeight: '600',
  },
});

export type BannerTone = 'info' | 'warning' | 'success' | 'danger';

export interface BannerProps {
  tone: BannerTone;
  /** Dòng đậm ở trên. Bỏ trống nếu chỉ có một dòng nội dung. */
  title?: string;
  /** Nội dung giải thích. Có thể dài — banner tự xuống dòng, không cắt chữ. */
  message?: string;
  /**
   * Ô vuông bo góc bên trái chứa icon. Bộ ảnh luôn có ô này ở banner nhiều dòng
   * và bỏ nó ở banner một dòng gọn (ví dụ ảnh 24 "Chưa tăng tồn kho").
   */
  icon?: React.ReactNode;
  /** Nội dung tuỳ ý xếp dưới `message`, ví dụ một hàng nút. */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Banner({
  tone,
  title,
  message,
  icon,
  children,
  style,
}: BannerProps): React.ReactElement {
  const theme = useTheme();

  const background: Record<BannerTone, string> = {
    info: theme.colors.infoSoft,
    warning: theme.colors.warningSoft,
    success: theme.colors.successSoft,
    danger: theme.colors.dangerSoft,
  };
  const accent: Record<BannerTone, string> = {
    info: theme.colors.infoText,
    warning: theme.colors.warningText,
    success: theme.colors.successText,
    danger: theme.colors.dangerText,
  };

  return (
    <View
      // Trình đọc màn hình gộp cả cụm thành một thông báo thay vì đọc rời từng
      // dòng — thủ kho dùng máy quét thường bật TalkBack khi tay bận.
      accessible
      accessibilityRole={tone === 'danger' ? 'alert' : 'text'}
      style={[
        styles.container,
        {
          gap: theme.spacing.md,
          padding: theme.spacing.lg,
          borderRadius: theme.radius.card,
          backgroundColor: background[tone],
        },
        style,
      ]}
    >
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

      <View style={[styles.body, { gap: theme.spacing.xs }]}>
        {title === undefined ? null : (
          <Text variant="body" style={[styles.title, { color: accent[tone] }]}>
            {title}
          </Text>
        )}
        {message === undefined ? null : (
          <Text variant="caption" style={{ color: accent[tone] }}>
            {message}
          </Text>
        )}
        {children}
      </View>
    </View>
  );
}
