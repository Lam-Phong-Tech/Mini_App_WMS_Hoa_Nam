import {UI_KIT_COLORS} from '../theme/uiKitV3';
import {HN_UI} from '../theme/uiKitV3';
/**
 * `Page` — khung màn hình.
 *
 * Prompt 2 §3 (React Native): `Page` → screen wrapper + `SafeAreaView`.
 * Giới hạn bề rộng nội dung theo `breakpoints.contentMax` (448px, lấy từ
 * `max-w-md` của Mini App) để trên máy màn rộng chữ không kéo dài quá khổ.
 */

import React, {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Dimensions,
  Platform,
  Keyboard,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
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
  headerBrand: {
    backgroundColor: tokens.colors.primaryStrong,
  },
  backButtonBrand: {
    backgroundColor: UI_KIT_COLORS['nav.hover'],
  },
  brandEyebrow: { color: UI_KIT_COLORS['nav.fg'] },
  brandTitle: { color: HN_UI.onBrand },
  brandSubtitle: { color: UI_KIT_COLORS['nav.fg'] },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBody: {
    flex: 1,
  },
  pullRefresh: {
    alignItems: 'center',
    justifyContent: 'center',
    // Text trong View cao 0 vẫn có thể vẽ tràn trên RN Web.
    // Cắt nó để nhãn chỉ xuất hiện trong lúc kéo/đang tải.
    overflow: 'hidden',
  },
  pullRefreshVisible: {
    height: 30,
  },
  pullRefreshHidden: {
    height: 0,
  },
});

export interface PageProps {
  title?: string;
  /** Nhãn ngữ cảnh ở TRÊN tiêu đề, tương ứng WmsPageHeader. */
  eyebrow?: string;
  subtitle?: string;
  /** Header xanh đậm cho các màn nghiệp vụ quét theo board Scanner. */
  headerVariant?: 'default' | 'brand' | 'history';
  /** Nhãn/trạng thái đặt ở mép phải header, ví dụ “Bước 2/3”. */
  headerRight?: ReactNode;
  /** Luồng nghiệp vụ có thể dùng nền trắng thay cho nền canvas mặc định. */
  backgroundColor?: string;
  /** Nút quay lại đầu trang cho các luồng nhiều bước. */
  onBack?: () => void;
  /** Bọc nội dung trong ScrollView. Tắt khi màn hình tự cuộn (danh sách dài). */
  scroll?: boolean;
  /** Làm mới dữ liệu khi người dùng kéo từ đỉnh màn hình xuống (web). */
  onPullRefresh?: () => void;
  /** Trạng thái tải lại do màn cha quản lý. */
  refreshing?: boolean;
  /** Khôi phục vị trí cuộn khi trở lại một màn danh sách. */
  initialScrollY?: number;
  /** Báo vị trí cuộn cho màn cần giữ vị trí khi mở chi tiết rồi Back. */
  onScrollPositionChange?: (scrollY: number) => void;
  /** Giữ thanh cuộn dọc hiện rõ trên Android cho các danh sách dài. */
  persistentScrollbar?: boolean;
  children: ReactNode;
}

const PULL_REFRESH_THRESHOLD = 72;
const KEYBOARD_GAP = 20;

/**
 * Input dùng context này để Page cuộn ô đang focus lên trên bàn phím. Đặt ở
 * Page thay vì từng form để Nhập/Xuất/Bảo hành có cùng trải nghiệm Android.
 */
export interface KeyboardViewportTarget {
  measureInWindow(
    callback: (x: number, y: number, width: number, height: number) => void,
  ): void;
}

export const KeyboardViewportContext = createContext<
  ((input: KeyboardViewportTarget | null) => void) | undefined
>(undefined);

/** Đọc toạ độ chạm mà không phụ thuộc shape event khác nhau của RN / RN Web. */
function touchPageY(event: unknown): number | undefined {
  const nativeEvent = (
    event as {
      nativeEvent?: {
        readonly pageY?: unknown;
        readonly touches?: readonly { readonly pageY?: unknown }[];
      };
    }
  ).nativeEvent;
  const value = nativeEvent?.touches?.[0]?.pageY ?? nativeEvent?.pageY;
  return typeof value === 'number' ? value : undefined;
}

function scrollOffsetY(event: unknown): number | undefined {
  const value = (
    event as {
      nativeEvent?: { readonly contentOffset?: { readonly y?: unknown } };
    }
  ).nativeEvent?.contentOffset?.y;
  return typeof value === 'number' ? value : undefined;
}

export function Page({
  title,
  eyebrow,
  subtitle,
  headerVariant = 'default',
  headerRight,
  backgroundColor,
  onBack,
  scroll = true,
  onPullRefresh,
  refreshing = false,
  initialScrollY,
  onScrollPositionChange,
  persistentScrollbar = false,
  children,
}: PageProps): React.ReactElement {
  const theme = useTheme();
  const brandedHeader=headerVariant!=='default';
  const historyHeader=headerVariant==='history';
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const scrollY = useRef(0);
  const restoredInitialScrollY = useRef<number | undefined>(undefined);
  const pendingInitialScrollY = useRef<number | undefined>(undefined);
  const keyboardTop = useRef(Dimensions.get('window').height);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const pullStartY = useRef<number | undefined>(undefined);
  const [pullDistance, setPullDistance] = useState(0);

  const handleScroll = useCallback(
    (event: unknown) => {
      const y = scrollOffsetY(event);
      if (y !== undefined) {
        scrollY.current = y;
        const pendingY = pendingInitialScrollY.current;
        if (pendingY !== undefined) {
          if (Math.abs(y - pendingY) <= 1) {
            pendingInitialScrollY.current = undefined;
          } else {
            // Android ép scrollTo về 0 khi dữ liệu bất đồng bộ chưa làm nội dung
            // đủ cao. Không công bố giá trị tạm này vì nó sẽ ghi đè vị trí Back.
            return;
          }
        }
        onScrollPositionChange?.(y);
      }
    },
    [onScrollPositionChange],
  );

  const restoreInitialScrollPosition = useCallback(() => {
    const targetY = pendingInitialScrollY.current;
    if (!scroll || targetY === undefined) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: targetY, animated: false });
    });
  }, [scroll]);

  useEffect(() => {
    if (
      !scroll ||
      initialScrollY === undefined ||
      restoredInitialScrollY.current === initialScrollY
    ) {
      return;
    }
    restoredInitialScrollY.current = initialScrollY;
    // A parent may reflect onScroll back into this prop. That is observation,
    // not a request to restore. Waiting for an event at an already reached
    // target suppresses later user scrolls and may jump to zero on append.
    if (Math.abs(scrollY.current - initialScrollY) <= 1) {
      pendingInitialScrollY.current = undefined;
      return;
    }
    pendingInitialScrollY.current =
      initialScrollY > 1 ? initialScrollY : undefined;
    if (pendingInitialScrollY.current !== undefined) {
      restoreInitialScrollPosition();
    } else {
      // Reset to top still works, but zero needs no clamp/retry journal:
      // scrollTo(0) can legitimately emit no event if native already clamped.
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: initialScrollY, animated: false });
      });
    }
  }, [initialScrollY, restoreInitialScrollPosition, scroll]);

  const handleContentSizeChange = useCallback(() => {
    // Lịch sử tải dữ liệu sau khi Page đã mount. Thử lại tại mỗi lần chiều cao
    // nội dung đổi cho tới khi Android thực sự cuộn tới vị trí đã lưu.
    restoreInitialScrollPosition();
  }, [restoreInitialScrollPosition]);

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
      setPullDistance(
        Math.min(100, Math.max(0, currentY - pullStartY.current)),
      );
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

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', event => {
      keyboardTop.current = event.endCoordinates.screenY;
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = Dimensions.get('window').height;
      setKeyboardHeight(0);
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  const revealFocusedInput = useCallback(
    (input: KeyboardViewportTarget | null) => {
      if (!scroll || input === null) return;
      // Android thường phát `focus` trước `keyboardDidShow`; đo lại sau animation
      // để cả ô ở cuối form và nút xác nhận không bị bàn phím che.
      const reveal = () => {
        input.measureInWindow((_x, y, _width, height) => {
          const safeBottom = keyboardTop.current - KEYBOARD_GAP;
          const coveredByKeyboard = y + height - safeBottom;
          if (coveredByKeyboard > 0) {
            scrollRef.current?.scrollTo({
              y: Math.max(0, scrollY.current + coveredByKeyboard),
              animated: true,
            });
          }
        });
      };
      requestAnimationFrame(reveal);
      setTimeout(reveal, 280);
    },
    [scroll],
  );

  const header =
    title === undefined ? null : (
      <View
        style={[
          styles.header,
          brandedHeader ? styles.headerBrand : undefined,
          {
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
            paddingBottom: theme.spacing.md,
            gap: theme.spacing.md,
          },
          historyHeader&&{height:86,paddingHorizontal:20,paddingTop:16,paddingBottom:24,gap:18,backgroundColor:HN_UI.shell,...(Platform.OS==='web'?{backgroundImage:`linear-gradient(115deg,${HN_UI.shell},${HN_UI.shell})`}:{})},
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
              headerVariant === 'brand' ? styles.backButtonBrand : undefined,
              historyHeader&&{width:44,height:44,backgroundColor:'transparent'},
            ]}
          >
            <AppIcon
              name={historyHeader?'arrow-left':'chevron-left'}
              size={historyHeader?27:undefined}
              color={
                brandedHeader ? HN_UI.onBrand : theme.colors.textStrong
              }
            />
          </Pressable>
        )}
        <View style={[styles.headerBody, { gap: theme.spacing.xs }]}>
          {eyebrow === undefined ? null : brandedHeader ? (
            <Text variant="caption" style={styles.brandEyebrow}>
              {eyebrow}
            </Text>
          ) : (
            <Text variant="caption" tone="muted">
              {eyebrow}
            </Text>
          )}
          {brandedHeader ? (
            <Text variant="screenTitle" style={[styles.brandTitle,historyHeader&&{fontSize:26,lineHeight:31.2,fontWeight:'600'}]}>
              {title}
            </Text>
          ) : (
            <Text variant="screenTitle" tone="strong">
              {title}
            </Text>
          )}
          {subtitle === undefined ? null : brandedHeader ? (
            <Text variant="caption" style={styles.brandSubtitle}>
              {subtitle}
            </Text>
          ) : (
            <Text variant="caption" tone="muted">
              {subtitle}
            </Text>
          )}
        </View>
        {headerRight}
      </View>
    );

  const body = (
    <View style={[styles.body, scroll ? null : styles.bodyFills,historyHeader&&{maxWidth:494,paddingHorizontal:18,paddingTop:18,paddingBottom:28,gap:12}]}>
      {children}
    </View>
  );

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[
        styles.screen,
        backgroundColor === undefined ? undefined : { backgroundColor },
      ]}
    >
      {/*
        RN 0.87 bỏ prop `backgroundColor` của StatusBar (Android chạy edge-to-edge).
        Nền sau thanh trạng thái do `SafeAreaView` ở trên đảm nhiệm.
      */}
      <StatusBar
        barStyle={brandedHeader ? 'light-content' : 'dark-content'}
      />
      {header}
      {scroll ? (
        <KeyboardViewportContext.Provider value={revealFocusedInput}>
          <ScrollView
            ref={scrollRef}
            style={historyHeader?{marginTop:-12,borderTopLeftRadius:24,borderTopRightRadius:24,backgroundColor:HN_UI.canvas}:undefined}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={[
              styles.scrollContent,
              keyboardHeight > 0
                ? { paddingBottom: keyboardHeight + KEYBOARD_GAP }
                : null,
            ]}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator
            persistentScrollbar={persistentScrollbar}
            onContentSizeChange={handleContentSizeChange}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={finishPull}
            onTouchCancel={finishPull}
          >
            {onPullRefresh === undefined ? null : (
              <View
                accessibilityLiveRegion="polite"
                style={[
                  styles.pullRefresh,
                  pullDistance > 0 || refreshing
                    ? styles.pullRefreshVisible
                    : styles.pullRefreshHidden,
                ]}
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
        </KeyboardViewportContext.Provider>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}
