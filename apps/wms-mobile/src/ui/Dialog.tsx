/**
 * Dialog giữa màn cho các trạng thái quyết định của board 03.
 *
 * `Sheet` vẫn giữ cho ô nhập/chọn hiện hữu. Dialog này dùng khi người dùng
 * phải chọn tiếp tục/lưu nháp/hủy và nền không được tự đóng trong lúc đang
 * ghi. Không có nghiệp vụ nào bị nhúng vào component dùng chung.
 */

import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(18, 56, 78, 0.52)',
  },
  panel: {
    width: '100%',
    maxWidth: 360,
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
      accessibilityViewIsModal
    >
      <Pressable
        accessibilityRole={dismissible ? 'button' : undefined}
        accessibilityLabel={dismissible ? 'Đóng hộp thoại' : undefined}
        onPress={dismiss}
        style={styles.backdrop}
      >
        <Pressable
          accessible={false}
          onPress={() => undefined}
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
          <View style={[styles.grabber, { backgroundColor: theme.colors.divider }]} />
          <Text variant="cardTitle" tone="strong">{title}</Text>
          {message === undefined ? null : (
            <Text variant="caption" tone="muted">{message}</Text>
          )}
          <View style={styles.body}>{children}</View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
