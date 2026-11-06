import {HN_UI} from '../theme/uiKitV3';
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
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
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
  historyScroll: {flexGrow:0,flexShrink:0,minWidth:0,minHeight:44},
  historyContent: {flexGrow:1,minHeight:44,gap:6,alignItems:'stretch'},
  historyChip: {flexShrink:0,flexBasis:'auto',minWidth:44,minHeight:44,paddingHorizontal:6,borderRadius:10,alignItems:'center',justifyContent:'center'},
  historyLabel: {fontSize:16,lineHeight:20,fontWeight:'400',fontFamily:Platform.OS==='web'?'Arial':undefined},
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
  /** History choices use a single row; overflow scrolls rather than breaking a label. */
  variant?: 'default' | 'history' | 'history-tabs' | 'history-wrap';
}

export function FilterChipRow({
  chips,
  activeKey,
  onSelect,
  style,
  variant = 'default',
}: FilterChipRowProps): React.ReactElement {
  const theme = useTheme();

  if(variant==='history') return (
    <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} alwaysBounceHorizontal={false}
      style={[styles.historyScroll,style]} contentContainerStyle={styles.historyContent}>
      {chips.map(chip=>{
        const active=chip.key===activeKey;
        return <Pressable key={chip.key} accessibilityRole="button" accessibilityLabel={chip.label}
          accessibilityState={{selected:active}} onPress={()=>onSelect(chip.key)}
          style={[styles.historyChip,{flexGrow:chip.key==='ALL'?1.2:chip.key==='NFC'?0.7:1,
            backgroundColor:active?HN_UI.textLink:HN_UI.selected,
            ...(Platform.OS==='web'&&active?{backgroundImage:`linear-gradient(120deg,${HN_UI.primary},${HN_UI.primary})`}:{}),
          }]}>
          <Text numberOfLines={1} style={[styles.historyLabel,{color:active?HN_UI.onBrand:HN_UI.textPrimary}]}>{chip.label}</Text>
        </Pressable>;
      })}
    </ScrollView>
  );

  if (variant !== 'default') {
    const tabs = variant === 'history-tabs';
    return (
      <View
        style={[
          {
            flexDirection: 'row',
            flexWrap: variant === 'history-wrap' ? 'wrap' : 'nowrap',
            gap: tabs ? 4 : 6,
            ...(tabs?{borderBottomWidth:1,borderBottomColor:HN_UI.border}:{}),
          },
          style,
        ]}
      >
        {chips.map(chip => {
          const active = chip.key === activeKey;
          return (
            <Pressable
              key={chip.key}
              accessibilityRole="button"
              accessibilityLabel={chip.label}
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(chip.key)}
              style={{
                flex: variant === 'history-wrap' ? undefined : 1,
                width: variant === 'history-wrap' ? '31.8%' : undefined,
                minWidth: 0,
                minHeight: tabs?48:44,
                paddingHorizontal: tabs?3:5,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: tabs ? 0 : 10,
                ...(tabs?{borderTopLeftRadius:8,borderTopRightRadius:8}:{}),
                borderBottomWidth: tabs&&active ? 3 : 0,
                borderBottomColor: HN_UI.border,
                backgroundColor: tabs?(active?HN_UI.selected:'transparent'):(active?HN_UI.textLink:HN_UI.selected),
              }}
            >
              <Text
                style={{
                  fontSize: tabs?17:16,
                  fontFamily: Platform.OS === 'web' ? 'Arial' : undefined,
                  lineHeight: tabs?23:20,
                  fontWeight: tabs && active ? '600' : '400',
                  color: tabs?(active?HN_UI.textLink:HN_UI.textSecondary):(active?HN_UI.onBrand:HN_UI.textPrimary),
                }}
              >
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

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
      style={[
        { minHeight: theme.touchTarget.min, maxHeight: theme.touchTarget.min },
        style,
      ]}
    >
      {chips.map(chip => {
        const active = chip.key === activeKey;
        return (
          <Pressable
            key={chip.key}
            accessibilityRole="button"
            accessibilityLabel={
              chip.count === undefined
                ? chip.label
                : chip.label + ' · ' + String(chip.count)
            }
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
