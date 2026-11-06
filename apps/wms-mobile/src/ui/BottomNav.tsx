import {HN_UI} from '../theme/uiKitV3';
import {SCANNER_ARIAL_FAMILY} from '../theme/scannerTypography';
/**
 * `BottomNav` — thanh điều hướng 5 tab ở đáy màn.
 *
 * Board 02: **Trang chủ · Chứng từ · Quét mã · Lịch sử · Cá nhân**. Chứng từ
 * chỉ mở danh sách/chi tiết; ghi sổ nhập/xuất vẫn thực hiện trên Web WMS.
 *
 * Kích thước, màu và vòng quét theo footer LOCK của prototype P02.S01,
 * scale từ frame494; safe area đáy được thêm ngoài vùng thiết kế.
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useWindowDimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HnHomeIcon, type HnHomeIconName } from './HnHomeIcon';
import { HN_HOME, homeScale } from './hnHomeTokens';
import { Text } from './Text';
import type { AppIconName } from './AppIcon';

// Geometry is owned by the P02.S01 LOCK reference, scaled from frame494.
const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: HN_HOME.nav },
  tab: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  circle: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HN_HOME.scan,
    borderColor: HN_UI.surface,
  },
  label: {
    textAlign: 'center',
    fontFamily: SCANNER_ARIAL_FAMILY,
    includeFontPadding: false,
    fontWeight: '400',
  },
  labelStrong: { fontWeight: '600' },
  circleTab: { justifyContent: 'flex-end' },
});

export interface BottomNavItem {
  readonly key: string;
  readonly label: string;
  /** Icon nét, không phụ thuộc glyph mà Android/PDA có thể thiếu. */
  readonly icon: AppIconName;
}

/** Năm tab đúng thứ tự Board 02. */
export const BOTTOM_NAV_ITEMS: readonly BottomNavItem[] = [
  { key: 'home', label: 'Trang chủ', icon: 'home' },
  { key: 'documents', label: 'Chứng từ', icon: 'document' },
  { key: 'scan', label: 'Quét mã', icon: 'scan' },
  { key: 'history', label: 'Lịch sử', icon: 'history' },
  { key: 'profile', label: 'Cá nhân', icon: 'profile' },
];

export interface BottomNavProps {
  activeKey: string;
  onSelect: (key: string) => void;
  items?: readonly BottomNavItem[];
  style?: StyleProp<ViewStyle>;
  /** Embedded native preview/split panes keep the same locked frame494 geometry. */
  layoutWidth?: number;
  /** P06 keeps the selected scan tile from its locked footer; defaults stay unchanged. */
  highlightScan?: boolean;
  /** P12 Note keeps the active label/icon but no filled selection tile. */
  highlightActive?: boolean;
  /** P03.S04 confirmation locks navigation while retaining the Home visual. */
  disabled?: boolean;
}

export function BottomNav({
  activeKey,
  onSelect,
  items = BOTTOM_NAV_ITEMS,
  style,
  layoutWidth,
  highlightScan = false,
  highlightActive = true,
  disabled = false,
}: BottomNavProps): React.ReactElement {
  const { width } = useWindowDimensions(),
    insets = useSafeAreaInsets(),
    scale = homeScale(layoutWidth ?? width),
    px = (n: number) => n * scale;
  const glyphs: Record<string, HnHomeIconName> = {
    home: 'house',
    documents: 'document',
    scan: 'scan',
    history: 'history',
    profile: 'user',
  };
  return (
    <View
      testID="hn-locked-footer"
      accessibilityRole="tablist"
      style={[
        styles.bar,
        {
          minHeight: px(75) + insets.bottom,
          paddingTop: px(8),
          paddingHorizontal: px(8),
          paddingBottom: px(8) + insets.bottom,
          borderTopLeftRadius: px(23),
          borderTopRightRadius: px(23),
        },
        style,
      ]}
    >
      {items.map(item => {
        const active = item.key === activeKey,
          scanner = item.key === 'scan',
          color = scanner ? HN_UI.textPrimary : active ? HN_HOME.navInk : HN_UI.textMuted;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active, disabled }}
            accessibilityLabel={item.label}
            disabled={disabled}
            onPress={() => {
              if (!disabled) onSelect(item.key);
            }}
            style={({ pressed }) => [
              styles.tab,
              {
                height: px(59),
                gap: px(5),
                borderRadius: px(12),
                backgroundColor:
                  active && highlightActive && (!scanner || highlightScan)
                    ? HN_HOME.navSelected
                    : 'transparent',
                opacity: pressed ? 0.93 : 1,
              },
              scanner ? styles.circleTab : undefined,
            ]}
          >
            {scanner ? (
              <View
                style={[
                  styles.circle,
                  {
                    width: px(62),
                    height: px(62),
                    marginTop: px(-31),
                    borderRadius: px(31),
                    borderWidth: px(3),
                  },
                ]}
              >
                <HnHomeIcon name="scan" size={px(31)} color={HN_UI.onBrand} />
              </View>
            ) : (
              <HnHomeIcon
                name={glyphs[item.key] ?? 'document'}
                size={px(25)}
                color={color}
              />
            )}
            <Text
              variant="caption"
              numberOfLines={1}
              style={[
                styles.label,
                active || scanner ? styles.labelStrong : undefined,
                {
                  fontSize: px(12),
                  lineHeight: px(17),
                  color,
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
