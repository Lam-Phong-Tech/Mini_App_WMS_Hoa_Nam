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

import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(47, 43, 61, 0.55)',
  },
  panel: {
    width: '100%',
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
}

export function Sheet({
  visible,
  onDismiss,
  title,
  message,
  children,
}: SheetProps): React.ReactElement {
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Nút back cứng Android đóng hộp thoại — `01-screen-inventory.md §9` ghi
      // hành vi back của app cũ chưa từng được test; ở đây nối rõ ràng.
      onRequestClose={onDismiss}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Đóng hộp thoại"
        onPress={onDismiss}
        style={styles.backdrop}
      >
        {/* Chặn sự kiện chạm lọt xuống nền: bấm TRONG tấm thì không đóng. */}
        <Pressable
          accessible={false}
          onPress={() => undefined}
          style={[
            styles.panel,
            {
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: theme.radius.sheet,
              borderTopRightRadius: theme.radius.sheet,
              padding: theme.spacing.xl,
              gap: theme.spacing.lg,
            },
          ]}
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}
