/**
 * Trang chủ.
 *
 * 🎨 Nguồn: ảnh **11–12** của bộ 47 ảnh.
 *
 * Bố cục theo đúng thứ tự trong ảnh:
 * 1. Lời chào — *"Ca làm việc hiện tại"* / *"Chào {tên}"*
 * 2. Hai `StatCard`: *Chờ duyệt* · *Đã duyệt hôm nay*
 * 3. Lưới **2×2** tác vụ: Tra cứu · Nhập · Xuất · Bảo hành
 * 4. Thẻ *Duyệt phiếu* có badge đếm và mũi chevron
 * 5. Danh sách *Sản phẩm đã duyệt* + liên kết *Xem tất cả*
 *
 * Bốn trạng thái bắt buộc của Prompt 4 §C đều có: **loading** (skeleton),
 * **error** (có nút thử lại), **empty**, và **refreshing**.
 *
 * Cả hai KPI dùng cùng một snapshot 50 phiếu từ WMS, như Mini App nguồn. Không
 * còn ô `—` cho *Đã duyệt hôm nay*: số liệu được phân loại từ trạng thái máy chủ.
 */

import React, { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Banner } from '../../ui/Banner';
import { StatCard } from '../../ui/StatCard';
import { EmptyState } from '../../ui/EmptyState';
import { EMPTY_VALUE } from '../../ui/DefinitionRow';
import { AppIcon, type AppIconName } from '../../ui/AppIcon';
import { useTheme } from '../../theme/ThemeProvider';
import { messageForUser } from '../../errors/AppError';
import { useHomeSummary } from './useHomeSummary';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tile: {
    // 2 cột. `48%` chứ không phải `50%` để chừa khoảng cách giữa hai cột mà
    // không cần tính trừ lề — co đúng trên cả PDA hẹp lẫn điện thoại rộng.
    width: '48%',
    minWidth: 0,
  },
  tileCard: {
    width: '100%',
    minHeight: 88,
    overflow: 'hidden',
  },
  tileIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approvalRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  approvalBody: {
    flex: 1,
  },
  fill: {
    flex: 1,
    minWidth: 0,
  },
  context: {
    minHeight: 44,
  },
  contextText: {
    flex: 1,
    minWidth: 0,
  },
  contextBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  contextBadgeText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  skeletonLine: {
    height: 14,
    borderRadius: 4,
  },
  skeletonCard: {
    height: 96,
    flex: 1,
    borderRadius: 8,
  },
});

/** Các tác vụ kho, gồm gán NFC tại thời điểm xử lý xuất. */
const TASKS: ReadonlyArray<{
  key: 'lookup' | 'inbound' | 'outbound' | 'warranty' | 'nfc';
  icon: AppIconName;
  title: string;
  hint: string;
}> = [
  { key: 'lookup', icon: 'search', title: 'Tra cứu', hint: 'Tìm SKU / Serial' },
  { key: 'inbound', icon: 'package-plus', title: 'Nhập', hint: 'Quét hàng nhập' },
  { key: 'outbound', icon: 'package-minus', title: 'Xuất', hint: 'Quét theo phiếu' },
  { key: 'warranty', icon: 'shield-check', title: 'Bảo hành', hint: 'Tiếp nhận sản phẩm' },
  { key: 'nfc', icon: 'shield-check', title: 'Gán NFC', hint: 'Liên kết thẻ với hàng xuất' },
] as const;

export type HomeTaskKey = (typeof TASKS)[number]['key'];

export interface HomeScreenProps {
  /** Tên hiển thị ở lời chào. */
  userName?: string;
  onSelectTask?: (key: HomeTaskKey) => void;
  onSeeAll?: () => void;
  /** Tiêm để test không cần mạng. */
  deps?: Parameters<typeof useHomeSummary>[0];
}

function formatTime(date: Date | undefined): string {
  if (date === undefined) {
    return EMPTY_VALUE;
  }
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return hh + ':' + mm;
}

export function HomeScreen({
  userName,
  onSelectTask,
  onSeeAll,
  deps,
}: HomeScreenProps): React.ReactElement {
  const theme = useTheme();
  const home = useHomeSummary(deps);

  const handleTask = useCallback(
    (key: HomeTaskKey) => () => onSelectTask?.(key),
    [onSelectTask],
  );

  return (
    <Page scroll onPullRefresh={home.reload} refreshing={home.refreshing}>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="caption" tone="muted">
          Ca làm việc hiện tại
        </Text>
        <Text variant="screenTitle" tone="strong">
          {'Chào ' + (userName ?? 'bạn')}
        </Text>
      </View>

      {/* Thanh ngữ cảnh có ở Mini App: nói rõ đây là phiên WMS hợp lệ. */}
      <Box
        card
        row
        align="center"
        justify="space-between"
        gap="sm"
        paddingX="md"
        style={styles.context}
      >
        <Text variant="caption" tone="default" numberOfLines={1} style={styles.contextText}>
          Theo phiên WMS
        </Text>
        <View
          style={[
            styles.contextBadge,
            {
              backgroundColor: theme.colors.primarySoft,
            },
          ]}
        >
          <Text
            variant="caption"
            numberOfLines={1}
            style={[styles.contextBadgeText, { color: theme.colors.primaryStrong }]}
          >
            Đã xác thực
          </Text>
        </View>
      </Box>

      {/* --- Cần xử lý --- */}
      <View style={styles.sectionHead}>
        <Text variant="cardTitle" tone="strong">
          Cần xử lý
        </Text>
        <Text
          variant="caption"
          accessibilityRole="button"
          onPress={home.reload}
          style={{ color: theme.colors.primary }}
        >
          {home.refreshing
            ? 'Đang cập nhật…'
            : 'Cập nhật ' + formatTime(home.loadedAt)}
        </Text>
      </View>

      {home.phase === 'error' && home.error !== undefined ? (
        <Banner tone="danger" title="Không tải được" message={messageForUser(home.error)}>
          <Button label="Thử lại" variant="secondary" onPress={home.reload} />
        </Banner>
      ) : (
        <View style={[styles.row, { gap: theme.spacing.md }]}>
          {home.phase === 'loading' ? (
            <>
              <View
                style={[
                  styles.skeletonCard,
                  { backgroundColor: theme.colors.surfaceSubtle },
                ]}
              />
              <View
                style={[
                  styles.skeletonCard,
                  { backgroundColor: theme.colors.surfaceSubtle },
                ]}
              />
            </>
          ) : (
            <>
              <StatCard
                label="Chờ Web duyệt"
                value={String(home.summary.pendingApproval ?? 0)}
                footnote={String(home.summary.pendingApproval ?? 0) + ' phiếu đã gửi'}
                icon={<AppIcon name="clock" size={18} color={theme.colors.warning} />}
              />
              <StatCard
                label="Web đã xử lý hôm nay"
                value={String(home.summary.approvedCount ?? 0)}
                footnote="Hoàn tất"
                icon={<AppIcon name="check-circle" size={18} color={theme.colors.success} />}
              />
            </>
          )}
        </View>
      )}

      {/* --- Tác vụ kho --- */}
      <View style={styles.sectionHead}>
        <Text variant="cardTitle" tone="strong">
          Tác vụ kho
        </Text>
        <Text variant="caption" tone="muted">
          Chọn nghiệp vụ để quét
        </Text>
      </View>

      <View style={[styles.grid, { gap: theme.spacing.md }]}>
        {TASKS.map(task => (
          <Pressable
            key={task.key}
            accessibilityRole="button"
            accessibilityLabel={task.title + '. ' + task.hint}
            onPress={handleTask(task.key)}
            style={({ pressed }) => [
              styles.tile,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Box card padding="md" gap="sm" row align="center" style={styles.tileCard}>
              <View
                style={[
                  styles.tileIcon,
                  {
                    borderRadius: theme.radius.control,
                    backgroundColor: theme.colors.primarySoft,
                  },
                ]}
              >
                <AppIcon name={task.icon} size={20} color={theme.colors.primaryStrong} />
              </View>
              <View style={styles.fill}>
                <Text variant="body" tone="strong" numberOfLines={1}>
                  {task.title}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={2}>
                  {task.hint}
                </Text>
              </View>
            </Box>
          </Pressable>
        ))}
      </View>

      {/* Web WMS duyệt và Post; App chỉ hiển thị chứng từ quét gần đây. */}
      <View style={styles.sectionHead}>
        <Text variant="cardTitle" tone="strong">
          Phiếu gần đây
        </Text>
        <Text
          variant="caption"
          accessibilityRole="button"
          onPress={onSeeAll}
          style={{ color: theme.colors.primary }}
        >
          Xem tất cả
        </Text>
      </View>

      {home.phase === 'loading' ? (
        <Box card padding="lg" gap="md">
          {[0, 1, 2].map(index => (
            <View
              key={index}
              style={[
                styles.skeletonLine,
                { backgroundColor: theme.colors.surfaceSubtle },
              ]}
            />
          ))}
        </Box>
      ) : home.summary.recent.length === 0 ? (
        <Box card padding="lg">
          <EmptyState
            title="Chưa có phiếu nào"
            hint="Phiếu vừa ghi nhận sẽ hiện ở đây."
          />
        </Box>
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          {home.summary.recent.map(document => (
            <Box key={document.id} card padding="lg" gap="sm">
              <View style={[styles.approvalRow, { gap: theme.spacing.sm }]}>
                <Text variant="body" tone="strong" style={styles.approvalBody}>
                  {document.doc_no ?? document.id}
                </Text>
                {document.mini_app_status === undefined ? null : (
                  <Badge label={document.mini_app_status} tone="success" />
                )}
              </View>
              <Text variant="caption" tone="muted">
                {(document.source_name ?? EMPTY_VALUE) +
                  ' · ' +
                  String(document.scanned_total_qty ?? 0) +
                  '/' +
                  String(document.expected_total_qty ?? 0)}
              </Text>
            </Box>
          ))}
        </View>
      )}
    </Page>
  );
}
