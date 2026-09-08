/**
 * `Page` — khung màn hình.
 *
 * Prompt 2 §3 (React Native): `Page` → screen wrapper + `SafeAreaView`.
 * Giới hạn bề rộng nội dung theo `breakpoints.contentMax` (448px, lấy từ
 * `max-w-md` của Mini App) để trên máy màn rộng chữ không kéo dài quá khổ.
 */

import React, { useCallback, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';
import { tokens } from '../theme/tokens';
import { AppIcon } from './AppIcon';

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tokens.colors.surfaceCanvas,
  },
  scrollContent: {
    flexGrow: 1,
  },
  body: {
    width: '100%',
    maxWidth: tokens.breakpoints.contentMax,
    alignSelf: 'center',
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xl,
    gap: tokens.spacing.lg,
  },
  bodyFills: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBody: {
    flex: 1,
  },
});

export interface PageProps {
  title?: string;
  /** Nhãn ngữ cảnh ở TRÊN tiêu đề, tương ứng WmsPageHeader. */
  eyebrow?: string;
  subtitle?: string;
  /** Nút quay lại đầu trang cho các luồng nhiều bước. */
  onBack?: () => void;
  /** Bọc nội dung trong ScrollView. Tắt khi màn hình tự cuộn (danh sách dài). */
  scroll?: boolean;
  /** Làm mới dữ liệu khi người dùng kéo từ đỉnh màn hình xuống (web). */
  onPullRefresh?: () => void;
  /** Trạng thái tải lại do màn cha quản lý. */
  refreshing?: boolean;
  children: ReactNode;
}

const PULL_REFRESH_THRESHOLD = 72;

/** Đọc toạ độ chạm mà không phụ thuộc shape event khác nhau của RN / RN Web. */
function touchPageY(event: unknown): number | undefined {
  const nativeEvent = (event as {
    nativeEvent?: {
      readonly pageY?: unknown;
      readonly touches?: readonly { readonly pageY?: unknown }[];
    };
  }).nativeEvent;
  const value = nativeEvent?.touches?.[0]?.pageY ?? nativeEvent?.pageY;
  return typeof value === 'number' ? value : undefined;
}

function scrollOffsetY(event: unknown): number | undefined {
  const value = (event as {
    nativeEvent?: { readonly contentOffset?: { readonly y?: unknown } };
  }).nativeEvent?.contentOffset?.y;
  return typeof value === 'number' ? value : undefined;
}

export function Page({
  title,
  eyebrow,
  subtitle,
  onBack,
  scroll = true,
  onPullRefresh,
  refreshing = false,
  children,
}: PageProps): React.ReactElement {
  const theme = useTheme();
  const scrollY = useRef(0);
  const pullStartY = useRef<number | undefined>(undefined);
  const [pullDistance, setPullDistance] = useState(0);

  const handleScroll = useCallback((event: unknown) => {
    const y = scrollOffsetY(event);
    if (y !== undefined) {
      scrollY.current = y;
    }
  }, []);

  const handleTouchStart = useCallback(
    (event: unknown) => {
      if (onPullRefresh === undefined || refreshing || scrollY.current > 0) {
        pullStartY.current = undefined;
        return;
      }
      pullStartY.current = touchPageY(event);
    },
    [onPullRefresh, refreshing],
  );

  const handleTouchMove = useCallback(
    (event: unknown) => {
      if (pullStartY.current === undefined || onPullRefresh === undefined) {
        return;
      }
      const currentY = touchPageY(event);
      if (currentY === undefined || scrollY.current > 0) {
        setPullDistance(0);
        return;
      }
      setPullDistance(Math.min(100, Math.max(0, currentY - pullStartY.current)));
    },
    [onPullRefresh],
  );

  const finishPull = useCallback(() => {
    const shouldRefresh =
      onPullRefresh !== undefined &&
      !refreshing &&
      pullDistance >= PULL_REFRESH_THRESHOLD;
    pullStartY.current = undefined;
    setPullDistance(0);
    if (shouldRefresh) {
      onPullRefresh();
    }
  }, [onPullRefresh, pullDistance, refreshing]);

  const header =
    title === undefined ? null : (
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
            paddingBottom: theme.spacing.md,
            gap: theme.spacing.md,
          },
        ]}
      >
        {onBack === undefined ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={onBack}
            style={[
              styles.backButton,
              {
              borderRadius: theme.radius.control,
              backgroundColor: theme.colors.surfaceSubtle,
              },
            ]}
          >
            <AppIcon name="chevron-left" color={theme.colors.textStrong} />
          </Pressable>
        )}
        <View style={[styles.headerBody, { gap: theme.spacing.xs }]}>
          {eyebrow === undefined ? null : (
            <Text variant="caption" tone="muted">
              {eyebrow}
            </Text>
          )}
          <Text variant="screenTitle" tone="strong">
            {title}
          </Text>
          {subtitle === undefined ? null : (
            <Text variant="caption" tone="muted">
              {subtitle}
            </Text>
          )}
        </View>
      </View>
    );

  const body = (
    <View style={[styles.body, scroll ? null : styles.bodyFills]}>
      {children}
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      {/*
        RN 0.87 bỏ prop `backgroundColor` của StatusBar (Android chạy edge-to-edge).
        Nền sau thanh trạng thái do `SafeAreaView` ở trên đảm nhiệm.
      */}
      <StatusBar barStyle="dark-content" />
      {header}
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={finishPull}
          onTouchCancel={finishPull}
        >
          {onPullRefresh === undefined ? null : (
            <View
              accessibilityLiveRegion="polite"
              style={{
                height: pullDistance > 0 || refreshing ? 30 : 0,
                alignItems: 'center',
                justifyContent: 'center',
                // Text trong View cao 0 vẫn có thể vẽ tràn trên RN Web.
                // Cắt nó để nhãn chỉ xuất hiện trong lúc kéo/đang tải.
                overflow: 'hidden',
              }}
            >
              <Text variant="caption" tone="muted">
                {refreshing
                  ? 'Đang cập nhật…'
                  : pullDistance >= PULL_REFRESH_THRESHOLD
                  ? 'Thả để cập nhật'
                  : 'Kéo xuống để cập nhật'}
              </Text>
            </View>
          )}
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}
