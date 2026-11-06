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
import { HnHomeIcon } from '../../ui/HnHomeIcon';
import {
  KeyboardViewportContext,
  type KeyboardViewportTarget,
} from '../../ui/Page';

/** P22-only frame. Geometry follows its approved494px reference; no changes to
 * shared HistoryFrame or its P08/P23 consumers. Native scroll owns restoration.
 */
export function P22Frame({
  title,
  onBack,
  children,
  dock,
  footerLabel,
  footerAction,
  footerOverride,
  initialScrollY = 0,
  onScrollPositionChange,
  restoreKey,
  hub = false,
}: {
  title: string;
  onBack(): void;
  children: React.ReactNode;
  dock?: React.ReactNode;
  footerLabel: string;
  footerAction?: React.ReactNode;
  /** AppShell may supply its existing locked nav for the hub only. */
  footerOverride?: React.ReactNode;
  initialScrollY?: number;
  onScrollPositionChange?(y: number): void;
  restoreKey?: string;
  hub?: boolean;
}): React.ReactElement {
  const width = Math.min(useWindowDimensions().width, 494);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const desired = useRef(initialScrollY),
    pending = useRef<number | null>(null);
  const position = useRef(0),
    keyboardTop = useRef<number | undefined>(undefined);
  desired.current = initialScrollY;
  useEffect(() => {
    const target = Math.max(0, desired.current);
    pending.current = target > 1 ? target : null;
    const frame = requestAnimationFrame(() =>
      scroll.current?.scrollTo({ y: target, animated: false }),
    );
    return () => cancelAnimationFrame(frame);
  }, [restoreKey]);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => {
      keyboardTop.current = e.endCoordinates.screenY;
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = undefined;
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const reveal = (input: KeyboardViewportTarget | null) => {
    if (!input || keyboardTop.current === undefined) return;
    input.measureInWindow((_x, y, _w, h) => {
      if (keyboardTop.current === undefined) return;
      const overlap = y + h - (keyboardTop.current - 16);
      if (overlap > 0)
        scroll.current?.scrollTo({
          y: Math.max(0, position.current + overlap),
          animated: false,
        });
    });
  };
  return (
    <View
      testID="P22.frame"
      style={[styles.root, { width }, hub && styles.hub]}
    >
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={styles.header}>
        <Svg
          style={StyleSheet.absoluteFill}
          width="100%"
          height="100%"
          accessible={false}
        >
          <Defs>
            <LinearGradient id="p22Header" x1="0" y1="0" x2="1" y2="0.35">
              <Stop offset="0" stopColor={HN_UI.shell} />
              <Stop offset="1" stopColor={HN_UI.shell} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#p22Header)" />
        </Svg>
        <View style={styles.bar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={onBack}
            style={styles.back}
          >
            <View style={styles.backIcon}>
              <HnHomeIcon
                name="arrow"
                size={28}
                strokeWidth={2}
                color={HN_UI.onBrand}
              />
            </View>
          </Pressable>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
        </View>
      </SafeAreaView>
      <View style={[styles.body, hub && styles.hub]}>
        {dock ? (
          <View testID="P22.dock" style={styles.dock}>
            {dock}
          </View>
        ) : null}
        <KeyboardViewportContext.Provider value={reveal}>
          <ScrollView
            ref={scroll}
            testID="History.scroll"
            style={styles.scroller}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={[
              styles.content,
              dock ? styles.listContent : null,
              hub && styles.hubContent,
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
      ) : (
        <SafeAreaView edges={['bottom']} style={styles.footer}>
          {footerAction}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={footerLabel}
            onPress={onBack}
            style={styles.footerButton}
          >
            <Text style={styles.footerText}>{footerLabel}</Text>
          </Pressable>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    alignSelf: 'center',
    backgroundColor: HN_UI.shell,
  },
  hub: { backgroundColor: HN_UI.canvas },
  header: { backgroundColor: HN_UI.primary, flexShrink: 0 },
  bar: {
    minHeight: 75,
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  back: {
    width: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  backIcon: { transform: [{ rotate: '180deg' }] },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 26,
    lineHeight: 32.5,
    fontWeight: '700',
    color: HN_UI.onBrand,
  },
  body: {
    flex: 1,
    minHeight: 0,
    marginTop: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    backgroundColor: HN_UI.canvas,
  },
  dock: {
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 6,
    flexShrink: 0,
  },
  scroller: { flex: 1, minHeight: 0 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 24,
    gap: 14,
  },
  listContent: { paddingTop: 0 },
  hubContent: { paddingHorizontal: 18, paddingBottom: 30, gap: 20 },
  footer: {
    flexShrink: 0,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 10,
    borderTopWidth: 1,
    borderColor: HN_UI.border,
    backgroundColor: HN_UI.surface,
  },
  footerButton: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: HN_UI.border,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  footerText: {
    fontSize: 16,
    lineHeight: 24,
    color: HN_UI.textLink,
    fontWeight: '600',
    textAlign: 'center',
  },
});
