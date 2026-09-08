/**
 * `DefinitionRow` — hàng "nhãn bên trái, giá trị bên phải".
 *
 * 🎨 Nguồn: bộ 47 ảnh. Đây là khuôn lặp lại nhiều nhất sau `Banner` — dùng ở
 * Cá nhân (08, 09), Tra cứu chi tiết (16), Kết quả nhập/xuất (23, 34), Chi tiết
 * phiếu xuất (31), Chi tiết bảo hành (44).
 *
 * Ba hành vi rút ra từ ảnh, đều là **quy tắc nghiệp vụ chứ không phải thẩm mỹ**:
 *
 * 1. **Trường trống hiện `—`, không ẩn hàng.** Ảnh 16 (SKU, Nhóm, Đơn vị, Kho,
 *    Trạng thái) và ảnh 31 (SĐT) đều giữ hàng và hiện gạch ngang. Ẩn hàng sẽ
 *    khiến thủ kho tưởng trường đó không tồn tại, thay vì biết là backend chưa
 *    khai báo.
 * 2. **Giá trị dài xuống dòng và căn phải**, ví dụ *"30 Tô Hiệu, Lê Chân, Hải
 *    Phòng"* (ảnh 31) và *"Hoá đơn NCC 0F9417 — lô PN-COV-P00060"* (ảnh 23).
 *    Không cắt chữ: địa chỉ cắt mất là hàng giao sai chỗ.
 * 3. **Có nút sao chép** ở mã QR / mã item / serial (ảnh 16) vì thủ kho cần dán
 *    sang WMS web để đối chiếu.
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

/** Phần không phụ thuộc theme. Giá trị theo theme vẫn đặt inline. */
const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  // `flexShrink` + `minWidth: 0` là cặp bắt buộc để chuỗi dài xuống dòng thay vì
  // đẩy nhãn ra khỏi màn trên PDA hẹp.
  valueWrap: {
    flexShrink: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  value: {
    flexShrink: 1,
    textAlign: 'right',
  },
  valueFilled: {
    fontWeight: '600',
  },
  divided: {
    borderBottomWidth: 1,
  },
});

/** Ký tự cho ô trống. Đúng dấu gạch dài trong ảnh, không phải dấu trừ. */
export const EMPTY_VALUE = '—';

export interface DefinitionRowProps {
  label: string;
  /**
   * Giá trị. `undefined`, `null` hoặc chuỗi rỗng đều hiện `—` — bên gọi không
   * phải tự xử lý ba trường hợp này ở mỗi màn.
   */
  value?: string | null;
  /** Hiện nút sao chép bên phải giá trị. */
  onCopy?: () => void;
  /** Ẩn đường kẻ dưới — dùng cho hàng cuối trong nhóm. */
  last?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function DefinitionRow({
  label,
  value,
  onCopy,
  last = false,
  style,
}: DefinitionRowProps): React.ReactElement {
  const theme = useTheme();
  const empty = value === undefined || value === null || value === '';
  const shown = empty ? EMPTY_VALUE : value;

  return (
    <View
      accessible
      accessibilityLabel={label + ': ' + (empty ? 'chưa có' : shown)}
      style={[
        styles.container,
        last ? undefined : styles.divided,
        {
          gap: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          borderBottomColor: theme.colors.divider,
        },
        style,
      ]}
    >
      <Text variant="caption" style={{ color: theme.colors.textMuted }}>
        {label}
      </Text>

      <View
        style={[styles.valueWrap, { gap: theme.spacing.sm }]}
      >
        <Text
          variant="caption"
          style={[
            styles.value,
            empty ? undefined : styles.valueFilled,
            { color: empty ? theme.colors.textMuted : theme.colors.textStrong },
          ]}
        >
          {shown}
        </Text>

        {onCopy === undefined || empty ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={'Sao chép ' + label}
            onPress={onCopy}
            // Vùng chạm nới rộng bằng hitSlop thay vì tăng kích thước icon:
            // giữ đúng bố cục ảnh mà vẫn đạt sàn 44px cho ngón tay đeo găng.
            hitSlop={12}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          >
            <Text variant="caption" style={{ color: theme.colors.textMuted }}>
              ⧉
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
