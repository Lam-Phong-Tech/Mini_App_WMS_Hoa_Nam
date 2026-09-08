/**
 * `Timeline` — dòng thời gian trạng thái.
 *
 * 🎨 Nguồn: ảnh **45** — khối *Timeline* của hồ sơ bảo hành, mỗi mục có mã trạng
 * thái IN HOA (`RECEIVE`) và dòng ghi chú bên dưới.
 *
 * Thứ tự trong ảnh là **cũ trước, mới sau** — đọc từ trên xuống là đọc lịch sử
 * theo chiều thời gian. Không đảo ngược: người xem hồ sơ bảo hành cần dựng lại
 * diễn biến, khác với màn quét vốn muốn thấy mã vừa quét ở trên cùng.
 */

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

const styles = StyleSheet.create({
  entry: {
    borderWidth: 1,
  },
  code: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

export interface TimelineEntry {
  readonly id: string;
  /** Mã trạng thái, hiện IN HOA như trong ảnh. */
  readonly code: string;
  readonly note?: string;
  /** Thời điểm đã định dạng sẵn. Không tự format ở đây — xem `serverClock`. */
  readonly at?: string;
}

export interface TimelineProps {
  entries: readonly TimelineEntry[];
  /** Câu hiện khi chưa có mục nào. */
  emptyText?: string;
  style?: StyleProp<ViewStyle>;
}

export function Timeline({
  entries,
  emptyText = 'Chưa có diễn biến nào.',
  style,
}: TimelineProps): React.ReactElement {
  const theme = useTheme();

  if (entries.length === 0) {
    return (
      <Text variant="caption" tone="muted" style={style}>
        {emptyText}
      </Text>
    );
  }

  return (
    <View style={[{ gap: theme.spacing.md }, style]}>
      {entries.map(entry => (
        <View
          key={entry.id}
          style={[
            styles.entry,
            {
              borderColor: theme.colors.divider,
              borderRadius: theme.radius.card,
              padding: theme.spacing.lg,
              gap: theme.spacing.xs,
            },
          ]}
        >
          <Text variant="caption" tone="strong" style={styles.code}>
            {entry.code}
          </Text>
          {entry.note === undefined ? null : (
            <Text variant="caption" tone="muted">
              {entry.note}
            </Text>
          )}
          {entry.at === undefined ? null : (
            <Text variant="caption" tone="muted">
              {entry.at}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}
