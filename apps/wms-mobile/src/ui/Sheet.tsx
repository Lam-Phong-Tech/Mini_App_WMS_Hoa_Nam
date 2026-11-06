import {UI_KIT_COLORS} from '../theme/uiKitV3';
/**
 * `Sheet` — hộp thoại trượt lên từ đáy màn.
 *
 * 🎨 Nguồn: ảnh **10** (*"Đăng xuất khỏi WMS?"*) và **14** (*"Nhập mã thủ công"*).
 * Cả hai đều: nền phía sau **mờ tối**, tấm trắng bo góc trên, có **thanh kéo**
 * nhỏ ở giữa mép trên.
 *
 * Ba điều bắt buộc, không phải để đẹp:
 *
 * 1. **Bấm ra ngoài thì đóng** — thủ kho đeo găng bấm nhầm là chuyện thường,
 *    phải có đường thoát không cần nhắm trúng nút nhỏ.
 * 2. **Nút nguy hiểm KHÔNG nằm dưới ngón tay cái mặc định.** Ảnh 10 đặt
 *    *Đăng xuất* trên *Huỷ*; giữ đúng thứ tự đó.
 * 3. **Nút hành động cao tối thiểu `touchTarget.comfortable`** — hộp thoại là
 *    nơi bấm nhầm tốn kém nhất.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';
import { KeyboardViewportContext, type KeyboardViewportTarget } from './Page';
import { sheetKeyboardSpace } from './sheetKeyboard';

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: UI_KIT_COLORS['overlay.scrim'],
  },
  /**
   * Phủ riêng vùng nền để panel không trở thành con của một nút bấm trên Web.
   * Nếu bọc cả Sheet bằng Pressable thì React Native Web sinh ra `<button>`
   * chứa các button của danh sách chọn — HTML không hợp lệ và làm hỏng focus.
   */
  dismissHitArea: {
    ...StyleSheet.absoluteFill,
  },
  panel: {
    width: '100%',
    maxHeight: '92%',
  },
  keyboardContainer: {
    flexShrink: 1,
  },
  grabber: {
    width: 44,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
  },
});

export interface SheetProps {
  visible: boolean;
  onDismiss: () => void;
  title?: string;
  message?: string;
  children?: React.ReactNode;
  /** Opt in for the P04 supplier picker; existing sheets retain their layout. */
  keyboardLayout?: 'legacy' | 'viewport';
}

export function Sheet({
  visible,
  onDismiss,
  title,
  message,
  children,
  keyboardLayout = 'legacy',
}: SheetProps): React.ReactElement {
  const theme = useTheme();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const scrollY = useRef(0);
  const keyboardTop = useRef(Dimensions.get('window').height);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const backdrop = useRef<React.ComponentRef<typeof View>>(null);
  const [geometry, setGeometry] = useState({
    top: 0,
    height: Dimensions.get('window').height,
  });
  const resizeViewport =
    keyboardLayout === 'viewport' && Platform.OS === 'android';
  useEffect(() => {
    if (resizeViewport && !visible) Keyboard.dismiss();
  }, [resizeViewport, visible]);
  const measureBackdrop = useCallback(() => {
    backdrop.current?.measureInWindow((_x, top, _w, height) => {
      setGeometry(current =>
        current.top === top && current.height === height
          ? current
          : { top, height },
      );
    });
  }, []);
  const space = sheetKeyboardSpace(
    geometry.top,
    geometry.height,
    keyboardHeight > 0 ? keyboardTop.current : undefined,
  );

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', event => {
      keyboardTop.current = event.endCoordinates.screenY;
      setKeyboardHeight(event.endCoordinates.height);
      if (resizeViewport) requestAnimationFrame(measureBackdrop);
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = Dimensions.get('window').height;
      setKeyboardHeight(0);
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [resizeViewport, measureBackdrop]);

  const revealFocusedInput = useCallback(
    (input: KeyboardViewportTarget | null) => {
      if (input === null) return;
      const reveal = () => {
        input.measureInWindow((_x, y, _width, height) => {
          const safeBottom = keyboardTop.current - 20;
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
    [],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Nút back cứng Android đóng hộp thoại — `01-screen-inventory.md §9` ghi
      // hành vi back của app cũ chưa từng được test; ở đây nối rõ ràng.
      onRequestClose={onDismiss}
    >
      <View
        ref={backdrop}
        onLayout={resizeViewport ? measureBackdrop : undefined}
        style={[
          styles.backdrop,
          resizeViewport && { paddingBottom: space.bottomInset },
        ]}
      >
        {/*
         * Vùng đóng là sibling nằm sau panel, không phải wrapper của panel.
         * Nhờ vậy bấm trong Sheet không đóng, còn button bên trong không lồng
         * trong một HTML button khi chạy Web.
         */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng hộp thoại"
          onPress={onDismiss}
          style={styles.dismissHitArea}
        />
        <View
          style={[
            styles.panel,
            resizeViewport && {
              maxHeight: Math.max(0, space.availableHeight - 16),
            },
            {
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: theme.radius.sheet,
              borderTopRightRadius: theme.radius.sheet,
              padding: theme.spacing.xl,
              gap: theme.spacing.lg,
            },
          ]}
        >
          <KeyboardViewportContext.Provider value={revealFocusedInput}>
            <KeyboardAvoidingView
              behavior={
                resizeViewport
                  ? undefined
                  : Platform.OS === 'ios'
                  ? 'padding'
                  : 'height'
              }
              style={styles.keyboardContainer}
            >
              <ScrollView
                ref={scrollRef}
                style={
                  resizeViewport
                    ? { maxHeight: Math.max(0, space.availableHeight - 64) }
                    : undefined
                }
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={[
                  { gap: theme.spacing.lg },
                  keyboardHeight > 0 && !resizeViewport
                    ? { paddingBottom: keyboardHeight + 20 }
                    : null,
                ]}
                onScroll={event => {
                  scrollY.current = event.nativeEvent.contentOffset.y;
                }}
                scrollEventThrottle={16}
              >
                <View
                  style={[
                    styles.grabber,
                    { backgroundColor: theme.colors.divider },
                  ]}
                />

                {title === undefined ? null : (
                  <Text variant="cardTitle" tone="strong">
                    {title}
                  </Text>
                )}
                {message === undefined ? null : (
                  <Text variant="caption" tone="muted">
                    {message}
                  </Text>
                )}
                {children}
              </ScrollView>
            </KeyboardAvoidingView>
          </KeyboardViewportContext.Provider>
        </View>
      </View>
    </Modal>
  );
}
