import {HN_UI} from '../../theme/uiKitV3';
import React, { useEffect, useRef } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '../../ui/Text';
import { P04Icon } from '../inbound/P04Icon';
import {
  KeyboardViewportContext,
  type KeyboardViewportTarget,
} from '../../ui/Page';

export const historyStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fill: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 14,
    lineHeight: 20.3,
    fontWeight: '700',
    color: HN_UI.textPrimary,
  },
  body: { fontSize: 14, lineHeight: 21, color: HN_UI.textPrimary },
  muted: { fontSize: 12, lineHeight: 18, color: HN_UI.textMuted },
  caption: { fontSize: 11, lineHeight: 16.5, color: HN_UI.textMuted },
  card: {
    padding: 15,
    gap: 12,
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 12,
    backgroundColor: HN_UI.surface,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HN_UI.canvas,
  },
  heading: {
    fontSize: 16,
    lineHeight: 23.2,
    fontWeight: '700',
    color: HN_UI.textPrimary,
  },
  section: { gap: 12 },
  stack: { gap: 14 },
  hubCards: { gap: 10 },
  hubCard: { minHeight: 82 },
  hubIntro: { paddingHorizontal: 2, paddingTop: 6, paddingBottom: 8 },
  hubHero: { marginVertical: 11 },
  compactStack: { gap: 4 },
  end: { alignSelf: 'flex-end' },
  eyebrow: {
    color: HN_UI.textLink,
    letterSpacing: 2,
    fontSize: 11,
    lineHeight: 15.95,
    fontWeight: '700',
  },
  hero: {
    fontSize: 25,
    lineHeight: 31.25,
    fontWeight: '700',
    color: HN_UI.textPrimary,
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexWrap: 'wrap',
  },
  tab: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: HN_UI.border,
    backgroundColor: HN_UI.surface,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 38,
  },
  activeTab: { backgroundColor: HN_UI.primary },
  tabText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    color: HN_UI.textSecondary,
  },
  activeTabText: { color: HN_UI.onBrand },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: HN_UI.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HN_UI.borderControl,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    fontSize: 14,
    color: HN_UI.textPrimary,
  },
  tap: {
    minWidth: 32,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: HN_UI.canvas,
  },
  badgeText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    color: HN_UI.textLink,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
    borderBottomWidth: 1,
    borderColor: HN_UI.border,
    paddingVertical: 10,
  },
  infoLabel: { width: 110, fontSize: 13, lineHeight: 20, color: HN_UI.textMuted },
});
const s = StyleSheet.create({
  root: { flex: 1, alignSelf: 'center', backgroundColor: HN_UI.canvas },
  header: { backgroundColor: HN_UI.shell },
  bar: {
    height: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
    paddingBottom: 8,
  },
  background: { ...StyleSheet.absoluteFill },
  back: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: HN_UI.onBrand,
    fontSize: 17,
    lineHeight: 24.65,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    marginTop: -9,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    backgroundColor: HN_UI.canvas,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    gap: 14,
    flexGrow: 1,
    paddingBottom: 22,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderColor: HN_UI.border,
    backgroundColor: HN_UI.surface,
  },
  footerButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 10,
  },
  footerText: {
    fontSize: 13,
    lineHeight: 19,
    color: HN_UI.textLink,
    fontWeight: '600',
  },
});
export function HistoryFrame({
  title,
  onBack,
  children,
  initialScrollY = 0,
  onScrollPositionChange,
  restoreKey,
  footerLabel,
  appearance = 'legacy',
  footerOverride,
}: {
  title: string;
  onBack(): void;
  children: React.ReactNode;
  initialScrollY?: number;
  onScrollPositionChange?(y: number): void;
  restoreKey?: string;
  footerLabel?: string;
  appearance?: 'legacy' | 'locked-history';
  footerOverride?: React.ReactNode;
}) {
  const width = Math.min(useWindowDimensions().width, 494),
    scroll = useRef<React.ComponentRef<typeof ScrollView>>(null),
    desired = useRef(initialScrollY),
    pending = useRef<number | null>(null),
    keyboardTop = useRef<number | undefined>(undefined),
    position = useRef(0);
  desired.current = initialScrollY;
  const locked = appearance === 'locked-history',
    scale = width / 494;
  useEffect(() => {
    const target = Math.max(0, desired.current);
    pending.current = target > 1 ? target : null;
    requestAnimationFrame(() =>
      scroll.current?.scrollTo({ y: target, animated: false }),
    );
  }, [restoreKey]);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', e => {
        keyboardTop.current = e.endCoordinates.screenY;
      }),
      hidden = Keyboard.addListener('keyboardDidHide', () => {
        keyboardTop.current = undefined;
      });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  const reveal = (input: KeyboardViewportTarget | null) => {
    if (!input || keyboardTop.current === undefined) return;
    input.measureInWindow((_x, y, _w, h) => {
      const overlap = y + h - (keyboardTop.current! - 16);
      if (overlap > 0)
        scroll.current?.scrollTo({
          y: Math.max(0, position.current + overlap),
          animated: false,
        });
    });
  };
  return (
    <View
      style={[s.root, { width }, locked && { backgroundColor: HN_UI.shell }]}
      testID="History.frame"
    >
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={s.header}>
        <Svg style={s.background} width="100%" height="100%" accessible={false}>
          <Defs>
            <LinearGradient id="historyHeader" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={HN_UI.shell} />
              <Stop offset="1" stopColor={HN_UI.primary} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#historyHeader)" />
        </Svg>
        <View
          style={[
            s.bar,
            locked && {
              height: 75,
              paddingHorizontal: 20,
              paddingTop: 0,
              paddingBottom: 0,
              gap: 12,
              backgroundColor: HN_UI.shell,
            },
          ]}
        >
          <Pressable
            style={[
              s.back,
              locked && { width: Math.max(44, 44 * scale), height: 44 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={onBack}
          >
            <P04Icon name="arrow-left" color={HN_UI.onBrand} size={22} />
          </Pressable>
          <Text
            style={[
              s.title,
              locked && { textAlign: 'left', fontSize: 26, lineHeight: 32 },
            ]}
            accessibilityRole="header"
          >
            {title}
          </Text>
          {locked ? null : <View style={s.back} />}
        </View>
      </SafeAreaView>
      <View
        style={[
          s.body,
          locked && {
            marginTop: 0,
            borderTopLeftRadius: 23,
            borderTopRightRadius: 23,
            backgroundColor: HN_UI.canvas,
          },
        ]}
      >
        <KeyboardViewportContext.Provider value={reveal}>
          <ScrollView
            ref={scroll}
            testID="History.scroll"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={[
              s.content,
              locked && {
                paddingHorizontal: 18,
                paddingTop: 18,
                paddingBottom: 24,
                gap: 12,
              },
            ]}
            scrollEventThrottle={16}
            onContentSizeChange={() => {
              if (pending.current !== null)
                scroll.current?.scrollTo({
                  y: pending.current,
                  animated: false,
                });
            }}
            onScroll={e => {
              const y = e.nativeEvent.contentOffset.y;
              if (pending.current !== null) {
                if (Math.abs(y - pending.current) > 1) return;
                pending.current = null;
              }
              position.current = y;
              onScrollPositionChange?.(y);
            }}
          >
            {children}
          </ScrollView>
        </KeyboardViewportContext.Provider>
      </View>
      {footerOverride !== undefined ? (
        footerOverride
      ) : footerLabel ? (
        <SafeAreaView
          edges={['bottom']}
          style={[
            s.footer,
            locked && {
              paddingHorizontal: 20 * scale,
              paddingBottom: 16 * scale,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={footerLabel}
            onPress={onBack}
            style={[
              s.footerButton,
              locked && { minHeight: Math.max(44, 54 * scale) },
            ]}
          >
            <Text
              style={[
                s.footerText,
                locked && { fontSize: 17 * scale, lineHeight: 24 * scale },
              ]}
            >
              {footerLabel}
            </Text>
          </Pressable>
        </SafeAreaView>
      ) : null}
    </View>
  );
}
