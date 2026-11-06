import { messageForUser, type AppError } from '../../errors/AppError';

/**
 * Thẻ có thể đọc UID nhưng không thể ghi NDEF. Giữ các nguyên nhân NFC ở một
 * chỗ để màn Tra cứu và Gán NFC không biến lỗi phần cứng thành một banner
 * generic, khiến người dùng lặp lại thao tác trên cùng một thẻ không phù hợp.
 */
export function nfcUserMessage(error: AppError): string {
  switch (error.code) {
    case 'NFC_ENTITLEMENT_UNAVAILABLE':
      return 'Bản ký iPhone chưa có quyền NFC cần thiết. Kiểm tra cấu hình ký rồi thử lại.';
    case 'NFC_CONFIG_UNAVAILABLE':
      return 'Bản cài chưa có cấu hình NFC cho iPhone.';
    case 'NFC_MULTIPLE_TAGS':
      return 'Phát hiện nhiều thẻ. Chỉ giữ một thẻ gần iPhone.';
    case 'NFC_REJECTION_INVALID':
      return 'Biên nhận từ chối NFC chưa khớp yêu cầu cũ. Chưa cho phép chuẩn bị phục hồi; giữ nguyên lượt để đối chiếu.';
    case 'NFC_RECOVERY_NOT_PROVEN':
      return 'WMS chưa có biên nhận từ chối xác định cho lượt này. Chỉ đối chiếu, chưa dùng key hoặc thẻ mới.';
    case 'NFC_RECOVERY_BLOCKED':
    case 'NFC_RECOVERY_BUSY':
    case 'NFC_RECOVERY_ATTEMPT_LOCKED':
      return 'Phục hồi NFC hiện đang bị khóa hoặc đã có lượt xử lý. Giữ yêu cầu và kiểm tra kết quả trước khi tiếp tục.';
    case 'NFC_RECOVERY_REQUIRED':
      return 'Cần đối chiếu biên nhận từ chối và xác nhận chuẩn bị phục hồi trước khi dùng thẻ mới.';
    case 'NFC_RECOVERY_MIGRATION_REQUIRED':
      return 'Backend chưa có schema biên nhận phục hồi NFC. Chưa ghi thẻ; báo DEV kiểm tra migration đã chốt.';
    case 'NFC_RECOVERY_CONTRACT_REQUIRED':
    case 'NFC_RECOVERY_CONTRACT_UNSUPPORTED':
      return 'App và backend chưa khớp contract phục hồi NFC. Giữ lượt cũ; báo DEV kiểm tra bản triển khai.';
    case 'NFC_REJECTED_RESERVATION':
      return 'Giữ chỗ thuộc lượt đã bị từ chối. Chỉ dùng giữ chỗ mới được cấp qua prepare phục hồi.';
    case 'NFC_REJECTED_TAG_REUSE':
      return 'Thẻ này thuộc lượt đã ghi nhưng bị từ chối. Giữ riêng thẻ cũ; sau prepare phục hồi dùng thẻ trắng mới có UID khác.';
    case 'NFC_RECOVERY_PREPARATION_INVALID':
    case 'NFC_RECOVERY_KEY_INVALID':
    case 'NFC_RECOVERY_NOT_READY':
    case 'NFC_RECOVERY_MODULE_REQUIRED':
      return error.message;
    case 'NFC_UNRESOLVED_OPERATION':
      return error.message;
    case 'NFC_CONTEXT_REQUIRED':
    case 'NFC_SESSION_CHANGED':
      return 'Phiên hoặc kho chưa khớp yêu cầu NFC. Giữ lượt hiện tại; kiểm tra lại phiên trước khi tiếp tục.';
    case 'NFC_SERVER_TIME_REQUIRED':
      return 'Chưa nhận được giờ máy chủ để kiểm tra giữ chỗ NFC. Chưa ghi thẻ; thử tải lại kết nối.';
    case 'NFC_NO_RESERVATION':
      return 'Chưa có giữ chỗ NFC hợp lệ. Chọn hiện vật và đọc thẻ trước khi xác nhận.';
    case 'NFC_PREPARATION_INVALID':
      return 'Dữ liệu giữ chỗ NFC chưa hợp lệ hoặc không khớp phiên/kho/hiện vật. Chưa ghi chip; giữ lượt để kiểm tra.';
    case 'NFC_MAPPING_UNVERIFIED':
      return 'Chưa xác minh được liên kết của thẻ. App chưa giữ chỗ hoặc ghi chip.';
    case 'NFC_RELEASE_INVALID':
      return 'Chưa có xác nhận giải phóng giữ chỗ NFC. Giữ lượt hiện tại để kiểm tra.';
    case 'SKU_INACTIVE':
      return 'SKU đã ngừng hoạt động. Chưa có xác nhận liên kết từ WMS; giữ nguyên thẻ và yêu cầu để kiểm tra.';
    case 'ITEM_ALREADY_HAS_NFC':
      return 'Sản phẩm này đã có thẻ NFC. Không ghi đè thẻ cũ.';
    case 'ITEM_NOT_ISSUED':
      return 'Chỉ liên kết NFC cho sản phẩm đã xuất kho. Sản phẩm chưa ở trạng thái ISSUED nên chưa được đọc hoặc ghi thẻ.';
    case 'NFC_ELIGIBILITY_UNVERIFIED':
      return 'WMS chưa xác minh sản phẩm đã xuất kho và chưa có NFC. Chưa đọc hoặc ghi thẻ.';
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
    case 'NFC_UID_BOUND_WRITE_UNSUPPORTED':
      return 'Bản web chưa hỗ trợ gán NFC có xác minh đúng thẻ. Dùng APK Android để gán; thao tác này không ghi thêm hoặc gửi xác nhận liên kết mới.';
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
      return 'Chưa xác minh được nội dung sau ghi. Giữ nguyên chip; chỉ đọc lại hoặc đối chiếu WMS, không ghi lại mù.';
    case 'NFC_WRONG_TAG':
      return 'Chip đang chạm khác UID đã kiểm tra. App không ghi lên chip này.';
    case 'NFC_TAG_NOT_EMPTY':
      return 'Thẻ có dữ liệu NDEF. Dùng thẻ trắng được phép gán; không ghi đè dữ liệu cũ.';
    case 'NFC_TAG_CONTENT_UNVERIFIED':
      return 'Chưa xác minh được thẻ có trống hay không. Chưa giữ chỗ hoặc ghi chip; không cần xóa hay format thẻ để thử lại.';
    case 'NFC_TAG_ALREADY_ASSIGNED':
      return 'Thẻ này đã đăng ký hoặc liên kết trên WMS. Không ghi đè thẻ cũ.';
    case 'NFC_P07_MIGRATION_REQUIRED':
      return 'BE chưa chạy migration P07. Chưa được ghi NFC; báo DEV triển khai đúng commit.';
    case 'NFC_RESERVATION_EXPIRED':
    case 'NFC_RESERVATION_CONTEXT_MISMATCH':
      return 'Giữ chỗ hết hạn hoặc không khớp phiên/kho. Giữ yêu cầu cũ để kiểm tra, không tự ghi lại chip.';
    case 'NFC_CONFIRMATION_INVALID':
    case 'NFC_CONFIRMATION_CONTEXT_MISMATCH':
      return 'Chưa có xác nhận đúng yêu cầu NFC. Giữ nguyên key và chip để đối chiếu.';
    case 'NFC_IO_ERROR':
      return 'Không thể trao đổi dữ liệu ổn định với thẻ. Giữ thẻ sát điện thoại và thử lại; nếu vẫn lỗi, dùng thẻ khác.';
    case 'NFC_EMPTY_PAYLOAD':
      return 'WMS không trả dữ liệu hợp lệ để ghi thẻ. Báo quản trị hệ thống.';
    default:
      return messageForUser(error);
  }
}
