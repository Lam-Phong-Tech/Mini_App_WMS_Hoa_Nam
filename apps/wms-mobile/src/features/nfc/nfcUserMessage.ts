import { messageForUser, type AppError } from '../../errors/AppError';

/**
 * Thẻ có thể đọc UID nhưng không thể ghi NDEF. Giữ các nguyên nhân NFC ở một
 * chỗ để màn Tra cứu và Gán NFC không biến lỗi phần cứng thành một banner
 * generic, khiến người dùng lặp lại thao tác trên cùng một thẻ không phù hợp.
 */
export function nfcUserMessage(error: AppError): string {
  switch (error.code) {
    case 'ITEM_ALREADY_HAS_NFC':
      return 'Sản phẩm này đã có thẻ NFC. Không ghi đè thẻ cũ.';
    case 'NFC_WRITE_RESERVED_BY_OTHER':
      return 'Sản phẩm đang được một nhân viên khác gán NFC. Thử lại sau.';
    case 'NFC_UID_ALREADY_ASSIGNED':
      return 'Thẻ NFC này đã được gán cho sản phẩm khác.';
    case 'NFC_PAYLOAD_ITEM_MISMATCH':
      return 'Nội dung thẻ không khớp sản phẩm đã chọn. Không lưu mapping.';
    case 'NFC_DISABLED':
      return 'NFC đang tắt. Bật NFC trong cài đặt rồi thử lại.';
    case 'NFC_UNSUPPORTED':
      return 'Thiết bị này không có NFC.';
    case 'NFC_MODULE_UNAVAILABLE':
      return 'Bản cài này chưa có mô-đun NFC. Cập nhật ứng dụng rồi thử lại.';
    case 'NFC_NO_ACTIVITY':
    case 'NFC_START_FAILED':
      return 'Không thể mở bộ đọc NFC lúc này. Đưa ứng dụng ra trước màn hình rồi thử lại.';
    case 'NFC_BUSY':
      return 'Đang chờ một lần chạm NFC khác. Đợi thao tác trước kết thúc rồi thử lại.';
    case 'NFC_CANCELLED':
    case 'NFC_PAUSED':
    case 'NFC_DESTROYED':
      return 'Lần chạm thẻ đã bị dừng. Mở lại màn NFC rồi thử lại.';
    case 'NFC_SCAN_TIMEOUT':
      return 'Chưa nhận được thẻ NFC. Giữ thẻ sát điện thoại rồi thử lại.';
    case 'NFC_UID_UNAVAILABLE':
      return 'Không đọc được UID phần cứng của thẻ. Dùng thẻ NFC khác rồi thử lại.';
    case 'NFC_UNSUPPORTED_TAG':
      return 'Thẻ này chỉ đọc được UID hoặc không hỗ trợ ghi NDEF. Dùng thẻ NFC NDEF mới còn ghi được.';
    case 'NFC_READ_ONLY':
      return 'Thẻ đã bị khoá, không thể ghi. Dùng thẻ mới.';
    case 'NFC_TAG_TOO_SMALL':
      return 'Thẻ NFC không đủ dung lượng cho dữ liệu sản phẩm.';
    case 'NFC_VERIFY_FAILED':
      return 'Không đọc lại được đúng nội dung sau khi ghi. Không có mapping nào được lưu.';
    case 'NFC_IO_ERROR':
      return 'Không thể trao đổi dữ liệu ổn định với thẻ. Giữ thẻ sát điện thoại và thử lại; nếu vẫn lỗi, dùng thẻ khác.';
    case 'NFC_EMPTY_PAYLOAD':
      return 'WMS không trả dữ liệu hợp lệ để ghi thẻ. Báo quản trị hệ thống.';
    default:
      return messageForUser(error);
  }
}
