/**
 * Nút **Quay lại của Android** (phím cứng hoặc vuốt cạnh màn hình).
 *
 * ## 🔴 Vì sao có tệp này
 *
 * Đo trên máy thật 2026-09-06: đang ở danh sách hồ sơ bảo hành, bấm Back →
 * **app đóng hẳn**, về màn hình chính của điện thoại. Toàn bộ mã nguồn không có
 * một `BackHandler` nào, nên Android hiểu là "không ai xử lý" và đóng activity.
 *
 * Hậu quả không chỉ là bất tiện:
 *
 * | Đang làm gì | Bấm Back (trước khi sửa) |
 * |---|---|
 * | Điền tới bước 3 phiếu bảo hành | **mất sạch** tên, SĐT, địa chỉ, mô tả |
 * | Quét dở 20 mã trong phiên | **mất cả phiên** |
 * | Xem chi tiết một phiếu | thoát app thay vì về danh sách |
 *
 * Mini App cũ chạy trong webview nên Back đi lùi trong lịch sử trình duyệt.
 * Bản native không có gì thay thế — đây là lỗ hổng của bản port.
 *
 * ## Cách dùng
 *
 * Màn nào có "chỗ để lùi" thì gọi `useHardwareBack(fn)`. `fn` trả `true` nghĩa
 * là *"tôi xử lý rồi, đừng đóng app"*; trả `false` để nhường cho lớp ngoài.
 * Lớp **đăng ký sau cùng chạy trước** — đúng thứ tự màn chồng lên nhau.
 */

import { useEffect, useRef } from 'react';
import { BackHandler, type NativeEventSubscription } from 'react-native';

type BackAction = () => boolean;

/** Ngăn xếp handler. Phần tử cuối là màn đang ở trên cùng. */
const stack: { current: BackAction }[] = [];
let subscription: NativeEventSubscription | undefined;

function onHardwareBack(): boolean {
  // Duyệt từ trên xuống: màn trong cùng được quyền xử lý trước.
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i].current()) {
      return true;
    }
  }
  // Không ai nhận ⇒ để Android làm việc của nó (thoát app ở màn gốc).
  return false;
}

export function useHardwareBack(action: BackAction): void {
  // Giữ trong ref để handler luôn thấy state mới nhất mà không phải đăng ký lại
  // mỗi lần render — đăng ký lại liên tục sẽ làm thứ tự ngăn xếp nhảy lung tung.
  const ref = useRef(action);
  ref.current = action;

  useEffect(() => {
    const entry = { current: ref.current };
    // Giữ đồng bộ với ref ở mỗi lần gọi.
    entry.current = () => ref.current();
    stack.push(entry);
    if (subscription === undefined) {
      subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        onHardwareBack,
      );
    }
    return () => {
      const index = stack.indexOf(entry);
      if (index >= 0) {
        stack.splice(index, 1);
      }
      if (stack.length === 0) {
        subscription?.remove();
        subscription = undefined;
      }
    };
  }, []);
}

/** Chỉ dùng cho test — dọn ngăn xếp giữa các ca. */
export function resetHardwareBackForTest(): void {
  stack.length = 0;
  subscription?.remove();
  subscription = undefined;
}
