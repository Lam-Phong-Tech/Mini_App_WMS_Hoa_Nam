/**
 * `BottomNav` — thanh điều hướng 4 tab ở đáy màn.
 *
 * Bốn tab đã chốt: **Trang chủ · Quét mã · Lịch sử · Cá nhân**. Chứng từ mở
 * từ Trang chủ hoặc Lịch sử; ghi sổ nhập/xuất vẫn thực hiện trên Web WMS.
 *
 * Cách sửa: đặt `minHeight` cố định cho ô tab và căn icon lên trên, nên nhãn dài
 * xuống dòng mà **hàng icon vẫn thẳng**. Cố ý **không** rút gọn chữ thành
 * *"Duyệt"*: rút gọn là đổi từ ngữ nghiệp vụ, mà bộ ảnh là chuẩn.
 *
 * Vùng chạm mỗi tab đạt `touchTarget.comfortable` (48) chứ không phải sàn 44 —
 * thủ kho bấm khi đang đeo găng tay.
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
import { AppIcon, type AppIconName } from './AppIcon';

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    // Căn lên trên để hàng icon thẳng kể cả khi một nhãn xuống 2 dòng — đây là
    // phần sửa V-05.
    justifyContent: 'flex-start',
  },
  iconBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxInactive: {
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: 11,
    textAlign: 'center',
  },
  labelActive: {
    fontWeight: '600',
  },
});

export interface BottomNavItem {
  readonly key: string;
  readonly label: string;
  /** Icon nét, không phụ thuộc glyph mà Android/PDA có thể thiếu. */
  readonly icon: AppIconName;
}

/** Bốn tab đã chốt cho App. */
export const BOTTOM_NAV_ITEMS: readonly BottomNavItem[] = [
  { key: 'home', label: 'Trang chủ', icon: 'home' },
  { key: 'scan', label: 'Quét mã', icon: 'scan' },
  { key: 'history', label: 'Lịch sử', icon: 'history' },
  { key: 'profile', label: 'Cá nhân', icon: 'profile' },
];

export interface BottomNavProps {
  activeKey: string;
  onSelect: (key: string) => void;
  items?: readonly BottomNavItem[];
  style?: StyleProp<ViewStyle>;
}

export function BottomNav({
  activeKey,
  onSelect,
  items = BOTTOM_NAV_ITEMS,
  style,
}: BottomNavProps): React.ReactElement {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.divider,
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.sm,
        },
        style,
      ]}
    >
      {items.map(item => {
        const active = item.key === activeKey;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            onPress={() => onSelect(item.key)}
            style={({ pressed }) => [
              styles.tab,
              {
                // Chiều cao cố định: nhãn 2 dòng không đẩy tab cao hơn tab khác.
                minHeight: theme.touchTarget.comfortable,
                gap: theme.spacing.xs,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <View
              style={[
                styles.iconBox,
                active ? undefined : styles.iconBoxInactive,
                {
                  minWidth: theme.touchTarget.min,
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.xs,
                  borderRadius: theme.radius.control,
                  ...(active
                    ? { backgroundColor: theme.colors.primarySoft }
                    : null),
                },
              ]}
            >
              <AppIcon
                name={item.icon}
                size={18}
                color={
                  active ? theme.colors.primaryStrong : theme.colors.textMuted
                }
              />
            </View>

            <Text
              variant="caption"
              style={[
                styles.label,
                active ? styles.labelActive : undefined,
                {
                  color: active
                    ? theme.colors.primaryStrong
                    : theme.colors.textMuted,
                },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
