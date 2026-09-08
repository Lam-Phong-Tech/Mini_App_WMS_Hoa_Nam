/**
 * `useIsScreenFocused` — biết màn có đang hiển thị không, **mà không bắt buộc**
 * phải nằm trong navigator.
 *
 * ## Vì sao cần
 *
 * `useIsFocused()` của `@react-navigation/native` **ném lỗi** khi không có
 * `NavigationContainer` bao ngoài. Phát hiện ngày 2026-09-06 khi viết test cho
 * `BusinessScanScreen`: màn ném exception, `ErrorBoundary` bắt được và hiện
 * *"Ứng dụng gặp sự cố"*.
 *
 * Trong app thì không sao — mọi màn đều nằm trong navigator. Nhưng đó là **ràng
 * buộc ẩn**: một component chỉ vì muốn biết mình có đang hiển thị hay không mà
 * bắt buộc cả cây phải có navigator là ghép cặp quá chặt, và nó chặn luôn việc
 * test màn hình riêng lẻ.
 *
 * ## Cách xử lý
 *
 * Đọc thẳng `NavigationContext`. Không có context ⇒ màn đang được render một
 * mình ⇒ coi như **đang hiển thị**. Đó là mặc định an toàn: với màn quét, "đang
 * hiển thị" nghĩa là camera được phép bật, mà nếu không có navigator thì cũng
 * chẳng có màn nào khác để chuyển đi.
 */

import { useContext, useEffect, useState } from 'react';
import { NavigationContext } from '@react-navigation/native';

export function useIsScreenFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() =>
    navigation === undefined ? true : navigation.isFocused(),
  );

  useEffect(() => {
    if (navigation === undefined) {
      // Không có navigator: trạng thái không bao giờ đổi, không cần lắng nghe.
      setFocused(true);
      return undefined;
    }

    setFocused(navigation.isFocused());
    const unsubscribeFocus = navigation.addListener('focus', () =>
      setFocused(true),
    );
    const unsubscribeBlur = navigation.addListener('blur', () =>
      setFocused(false),
    );
    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [navigation]);

  return focused;
}
