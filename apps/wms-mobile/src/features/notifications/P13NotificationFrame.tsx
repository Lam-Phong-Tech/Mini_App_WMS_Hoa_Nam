import {HN_UI} from '../../theme/uiKitV3';
/** Notification-only frame. Owner protocol/state remain in P13NotificationsScreen. */
import React, { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '../../ui/Text';
import { HnHomeIcon } from '../../ui/HnHomeIcon';

const styles = StyleSheet.create({
  root: { flex: 1, alignSelf: 'center', backgroundColor: HN_UI.surface, minHeight: 0 },
  header: { backgroundColor: HN_UI.shell },
  headerBar: {
    minHeight: 88,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  background: { ...StyleSheet.absoluteFill },
  title: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700',
    color: HN_UI.onBrand,
    flex: 1,
  },
  back: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { transform: [{ rotate: '180deg' }] },
  body: {
    flex: 1,
    minHeight: 0,
    marginTop: -12,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: HN_UI.surface,
    overflow: 'hidden',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
  },
  contentHost: { flexGrow: 1 },
  dock: {
    flexShrink: 0,
    paddingHorizontal: 24,
    paddingTop: 10,
    backgroundColor: HN_UI.surface,
  },
  actions: {
    flexShrink: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
    gap: 10,
    backgroundColor: HN_UI.surface,
  },
});

export interface P13ScrollSnapshot {
  /** Web's visible position; native retains its event-based position. */
  read(): number | undefined;
}

export function P13NotificationFrame({
  detail,
  restoreKey,
  initialScrollY,
  onScrollPositionChange,
  onBack,
  busy,
  footer,
  title,
  dock,
  actions,
  panelId,
  headerAction,
  scrollSnapshot,
  dockPaddingTop=12,
  children,
}: {
  detail: boolean;
  restoreKey: string;
  initialScrollY: number;
  onScrollPositionChange(y: number): void;
  onBack(): void;
  busy: boolean;
  footer?: React.ReactNode;
  title?: string;
  dock?: React.ReactNode;
  actions?: React.ReactNode;
  panelId?: string;
  headerAction?:React.ReactNode;
  scrollSnapshot?: React.Ref<P13ScrollSnapshot>;
  dockPaddingTop?:number;
  children: React.ReactNode;
}) {
  const width = Math.min(useWindowDimensions().width, 494);
  const { bottom } = useSafeAreaInsets();
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useImperativeHandle(scrollSnapshot, () => ({
    read() {
      const node: unknown = scroll.current?.getScrollableNode?.();
      if (node && typeof node === 'object' && 'scrollTop' in node) {
        const y = node.scrollTop;
        if (typeof y === 'number' && Number.isFinite(y)) return Math.max(0, y);
      }
      return undefined;
    },
  }), []);
  const incoming = useRef(initialScrollY);
  incoming.current = initialScrollY;
  const pending = useRef<number | null>(null);
  const live = useRef(true);
  const restoreRevision = useRef(0);
  const panel = useMemo(() => ({ restoreKey }), [restoreKey]);
  const activePanel = useRef(panel);
  activePanel.current = panel;
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const apply = useCallback((y: number) => {
    const revision = restoreRevision.current;
    requestAnimationFrame(() => {
      if (live.current && revision === restoreRevision.current)
        scroll.current?.scrollTo({ y, animated: false });
    });
  }, []);
  useLayoutEffect(() => {
    const revision = restoreRevision.current + 1;
    restoreRevision.current = revision;
    const target = Math.max(0, incoming.current);
    // scrollTo(0) may emit no event when already at zero. Never leave a zero
    // pending target that would suppress the user's subsequent scroll events.
    pending.current = target > 1 ? target : null;
    apply(target);
    return () => { restoreRevision.current = revision + 1; };
  }, [restoreKey, apply]);

  return (
    <View testID="P13.frame" style={[styles.root, { width }]}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={styles.header}>
        <Svg
          style={styles.background}
          width="100%"
          height="100%"
          accessible={false}
        >
          <Defs>
            <LinearGradient id="p13Header" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={HN_UI.shell} />
              <Stop offset="1" stopColor={HN_UI.shell} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#p13Header)" />
        </Svg>
        <View style={styles.headerBar}>
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quay lại"
              disabled={busy}
              onPress={onBack}
              style={styles.back}
            >
              <View style={styles.backIcon}>
                <HnHomeIcon name="chevron" size={23} color={HN_UI.onBrand} />
              </View>
            </Pressable>
          ) : null}
          <Text accessibilityRole="header" style={styles.title}>
            {title ?? (detail ? 'Chi tiết thông báo' : 'Thông báo')}
          </Text>
          {headerAction}
        </View>
      </SafeAreaView>
      <View style={styles.body}>
        {dock ? (
          <View testID="P13.fixed-dock" style={[styles.dock,{paddingTop:dockPaddingTop}]}>
            {dock}
          </View>
        ) : null}
        <ScrollView
          key={restoreKey}
          testID="P13.scroll"
          ref={scroll}
          contentContainerStyle={[
            styles.content,
            !detail&&{paddingTop:0},
            !footer && !actions && { paddingBottom: 24 + bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onContentSizeChange={() => {
            if (!live.current || activePanel.current !== panel) return;
            if (pending.current !== null) apply(pending.current);
          }}
          onScroll={event => {
            // RN web can deliver scroll-end after this panel has unmounted.
            if (!live.current || activePanel.current !== panel) return;
            const y = event.nativeEvent?.contentOffset?.y;
            if (typeof y !== 'number' || !Number.isFinite(y)) return;
            if (pending.current !== null) {
              if (Math.abs(y - pending.current) > 1) return;
              pending.current = null;
            }
            onScrollPositionChange(y);
          }}
        >
          <View testID={panelId} style={styles.contentHost}>
            {children}
          </View>
        </ScrollView>
        {actions ? (
          <View testID="P13.fixed-actions" style={styles.actions}>
            {actions}
          </View>
        ) : null}
      </View>
      {footer}
    </View>
  );
}
