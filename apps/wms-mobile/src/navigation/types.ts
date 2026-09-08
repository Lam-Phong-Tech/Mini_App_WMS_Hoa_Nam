/**
 * Kiểu điều hướng.
 *
 * `Shell` là khung nghiệp vụ của Prompt 4 (đăng nhập → tab). Ba route còn lại là
 * màn chẩn đoán từ Prompt 2 và Prompt 3, giữ lại vì chúng vẫn hữu ích khi hỗ trợ
 * từ xa (kiểm môi trường, kiểm đầu quét, kiểm chặn ghi).
 *
 * Route nghiệp vụ chi tiết (nhập/xuất/bảo hành/lịch sử) thêm dần theo từng đợt —
 * không khai báo trước để tránh route rỗng.
 */

export type RootStackParamList = {
  /** Khung nghiệp vụ: đăng nhập → tab. Đợt 1 của Prompt 4. */
  Shell: undefined;
  Diagnostics: undefined;
  ScanTest: undefined;
  CameraScan: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
