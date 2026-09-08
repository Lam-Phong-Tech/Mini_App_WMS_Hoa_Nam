/**
 * `List` — danh sách dùng chung.
 *
 * GATE_01 Q1 ràng buộc: **FlashList cho mọi danh sách**. Máy PDA cấu hình thấp,
 * `FlatList` giữ nhiều view hơn và tụt khung hình khi cuộn danh sách quét dài.
 * Vì vậy wrapper này cố tình không mở đường dùng `FlatList`.
 */

import React, { type ReactElement } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Text } from './Text';
import { tokens } from '../theme/tokens';

const styles = StyleSheet.create({
  separator: {
    height: 1,
    backgroundColor: tokens.colors.divider,
  },
  empty: {
    paddingVertical: tokens.spacing.xl,
    alignItems: 'center',
  },
});

/**
 * Định nghĩa ở tầng module, không lồng trong `List`: component tạo lại mỗi lần
 * render sẽ khiến React huỷ và dựng lại toàn bộ cây con.
 */
function Separator(): ReactElement {
  return <View style={styles.separator} />;
}

export interface ListProps<TItem> {
  data: readonly TItem[];
  renderItem: (item: TItem, index: number) => ReactElement;
  keyExtractor: (item: TItem, index: number) => string;
  /** Chữ hiển thị khi danh sách rỗng. */
  emptyText?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Cần `flex: 1` khi danh sách nằm trong vùng còn lại của một màn không cuộn. */
  style?: StyleProp<ViewStyle>;
}

export function List<TItem>({
  data,
  renderItem,
  keyExtractor,
  emptyText,
  onRefresh,
  refreshing,
  style,
}: ListProps<TItem>): ReactElement {
  return (
    <FlashList
      data={data as TItem[]}
      keyExtractor={keyExtractor}
      renderItem={({ item, index }) => renderItem(item, index)}
      onRefresh={onRefresh}
      refreshing={refreshing}
      style={style}
      ItemSeparatorComponent={Separator}
      ListEmptyComponent={
        emptyText === undefined ? null : (
          <View style={styles.empty}>
            <Text variant="caption" tone="muted">
              {emptyText}
            </Text>
          </View>
        )
      }
    />
  );
}
