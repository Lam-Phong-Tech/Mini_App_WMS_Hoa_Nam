/**
 * Dialog giữa màn cho các trạng thái quyết định của board 03.
 *
 * `Sheet` vẫn giữ cho ô nhập/chọn hiện hữu. Dialog này dùng khi người dùng
 * phải chọn tiếp tục/lưu nháp/hủy và nền không được tự đóng trong lúc đang
 * ghi. Không có nghiệp vụ nào bị nhúng vào component dùng chung.
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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(18, 56, 78, 0.52)',
  },
  /** See Sheet: on Web the dismissal target must not wrap panel buttons. */
  dismissHitArea: {
    ...StyleSheet.absoluteFill,
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '92%',
  },
  keyboardContainer: {
    flexShrink: 1,
  },
  grabber: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
  },
  body: {
    flex: 1,
  },
});

export interface DialogProps {
  visible: boolean;
  title: string;
  message?: string;
  onDismiss: () => void;
  children?: React.ReactNode;
  /** Chặn backdrop/Back khi request đang bay hoặc cần quyết định bắt buộc. */
  dismissible?: boolean;
}

export function Dialog({
  visible,
  title,
  message,
  onDismiss,
  children,
  dismissible = true,
}: DialogProps): React.ReactElement {
  const theme = useTheme();
  const dismiss = dismissible ? onDismiss : () => undefined;
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const scrollY = useRef(0);
  const keyboardTop = useRef(Dimensions.get('window').height);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

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

  const revealFocusedInput = useCallback((input: KeyboardViewportTarget | null) => {
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
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        {dismissible ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng hộp thoại"
            onPress={dismiss}
            style={styles.dismissHitArea}
          />
        ) : null}
        <View
          style={[
            styles.panel,
            {
              padding: theme.spacing.xl,
              gap: theme.spacing.md,
              borderRadius: theme.radius.sheet,
              backgroundColor: theme.colors.surface,
            },
          ]}
        >
          <KeyboardViewportContext.Provider value={revealFocusedInput}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.keyboardContainer}
            >
              <ScrollView
                ref={scrollRef}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={[
                  { gap: theme.spacing.md },
                  keyboardHeight > 0
                    ? { paddingBottom: keyboardHeight + 20 }
                    : null,
                ]}
                onScroll={event => {
                  scrollY.current = event.nativeEvent.contentOffset.y;
                }}
                scrollEventThrottle={16}
              >
                <View style={[styles.grabber, { backgroundColor: theme.colors.divider }]} />
                <Text variant="cardTitle" tone="strong">{title}</Text>
                {message === undefined ? null : (
                  <Text variant="caption" tone="muted">{message}</Text>
                )}
                <View style={styles.body}>{children}</View>
              </ScrollView>
            </KeyboardAvoidingView>
          </KeyboardViewportContext.Provider>
        </View>
      </View>
    </Modal>
  );
}
