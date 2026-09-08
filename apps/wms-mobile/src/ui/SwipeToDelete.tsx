/**
 * `SwipeToDelete` — vuốt trái để xoá một mục trong danh sách.
 *
 * 🎨 Nguồn: ảnh **20** ghi *"Vuốt trái để xoá"* ở đầu danh sách SKU.
 *
 * ## 🔧 Vì sao có tệp này
 *
 * Ngày 2026-09-06 người dùng chỉ ra: tôi **viết chữ** *"Vuốt trái để xoá"* trên
 * màn Kiểm tra nhưng **không làm** cử chỉ đó. Hứa trong UI mà không có chức năng
 * là loại lỗi tệ nhất — thủ kho quét nhầm một kiện, đọc thấy dòng chữ, vuốt mãi
 * không được, và không có đường nào khác để gỡ mã ra.
 *
 * ## Vì sao dùng `PanResponder` chứ không `react-native-gesture-handler`
 *
 * Thư viện đó **chưa có** trong dự án. Thêm vào là thêm **native module** ⇒ phải
 * build lại APK, mà `GATE_01 §11` #2 cấm tự thêm module native của bên thứ ba.
 * `PanResponder` nằm trong RN core, thuần JS, chạy ngay qua Metro trên bản
 * debug đang cài — không phải dựng lại gì.
 *
 * ## Vuốt là chưa đủ
 *
 * Cử chỉ vuốt **vô hình với trình đọc màn hình** và khó với người đeo găng tay
 * dày. Vì vậy component còn phơi một `accessibilityAction` tên *"xoá"*, và bên
 * gọi nên đặt thêm một lối xoá nhìn thấy được. Vuốt là lối tắt, không phải lối
 * duy nhất.
 */

import React, { useMemo, useRef } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  backgroundLabel: {
    fontWeight: '700',
  },
});

/** Vuốt qua ngưỡng này thì coi là muốn xoá. */
export const SWIPE_DELETE_THRESHOLD = 96;

/**
 * Ngưỡng phân biệt vuốt ngang với cuộn dọc.
 *
 * Danh sách mã quét cuộn dọc, nên phải chắc chắn người dùng có ý vuốt ngang mới
 * chiếm cử chỉ — nếu không thì cuộn danh sách sẽ liên tục kích hoạt xoá.
 */
const HORIZONTAL_BIAS = 2;

export interface SwipeToDeleteProps {
  onDelete: () => void;
  /** Nhãn hành động hiện ra sau khi vuốt. */
  deleteLabel?: string;
  /** Nhãn cho trình đọc màn hình, ví dụ tên SKU. */
  accessibilityLabel?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function SwipeToDelete({
  onDelete,
  deleteLabel = 'Xoá',
  accessibilityLabel,
  children,
  style,
}: SwipeToDeleteProps): React.ReactElement {
  const theme = useTheme();
  const translateX = useRef(new Animated.Value(0)).current;

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Chỉ chiếm cử chỉ khi rõ ràng là vuốt SANG TRÁI và ngang hơn dọc.
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dx < -8 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * HORIZONTAL_BIAS,

        onPanResponderMove: (_event, gesture) => {
          // Chỉ cho kéo sang trái; kéo phải không có nghĩa gì ở đây.
          translateX.setValue(Math.min(0, gesture.dx));
        },

        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx < -SWIPE_DELETE_THRESHOLD) {
            // Trượt nốt ra khỏi màn rồi mới xoá — người dùng thấy được kết quả
            // của cử chỉ mình vừa làm, thay vì mục biến mất đột ngột.
            Animated.timing(translateX, {
              toValue: -600,
              duration: theme.motion.fast,
              useNativeDriver: true,
            }).start(onDelete);
            return;
          }
          // Chưa đủ ngưỡng: trả về chỗ cũ.
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },

        onPanResponderTerminate: () => {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
      }),
    [onDelete, theme.motion.fast, translateX],
  );

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.background,
          {
            borderRadius: theme.radius.card,
            backgroundColor: theme.colors.dangerSoft,
            paddingHorizontal: theme.spacing.xl,
          },
        ]}
      >
        <Text
          variant="caption"
          style={[styles.backgroundLabel, { color: theme.colors.dangerText }]}
        >
          {deleteLabel}
        </Text>
      </View>

      <Animated.View
        // Cử chỉ vuốt vô hình với trình đọc màn hình — phơi thêm hành động này
        // để TalkBack vẫn xoá được.
        accessibilityActions={[{ name: 'xoá', label: deleteLabel }]}
        onAccessibilityAction={event => {
          if (event.nativeEvent.actionName === 'xoá') {
            onDelete();
          }
        }}
        accessibilityHint="Vuốt sang trái để xoá"
        accessibilityLabel={accessibilityLabel}
        style={{ transform: [{ translateX }] }}
        {...responder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}
