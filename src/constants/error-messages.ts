export const ERROR_MESSAGES: Record<string, string> = {
  BARCODE_NOT_FOUND:
    "Không tìm thấy sản phẩm tương ứng với mã vừa quét.",
  ITEM_ALREADY_SCANNED: "Sản phẩm này đã được quét trước đó.",
  SKU_NOT_REQUIRED: "Sản phẩm này không thuộc danh sách cần xử lý.",
  LINE_ALREADY_FULL: "Dòng chứng từ này đã đủ số lượng cần quét.",
  ITEM_NOT_IN_WAREHOUSE: "Sản phẩm không thuộc kho đang thao tác.",
  NETWORK_ERROR: "Không thể kết nối máy chủ. Vui lòng kiểm tra mạng.",
  REQUEST_TIMEOUT: "Máy chủ phản hồi quá lâu. Vui lòng thử lại.",
  AUTH_REQUIRED: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  SESSION_EXPIRED: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  ZALO_LOGIN_FAILED: "Không đăng nhập được WMS. Vui lòng kiểm tra tài khoản hoặc mật khẩu.",
  WMS_API_ERROR: "Không xử lý được dữ liệu kho. Vui lòng thử lại.",
  API_ERROR: "Không xử lý được yêu cầu. Vui lòng thử lại.",
  INVALID_JSON_RESPONSE: "Máy chủ phản hồi không đúng định dạng. Vui lòng thử lại.",
  AUDIT_DELETE_REVIEW_REQUIRED:
    "Chức năng xóa dữ liệu backend đang bị khóa để bảo toàn audit kho.",
  MISSING_INBOUND_DOCUMENT:
    "Thiếu phiếu nhập. Vui lòng mở Mini App từ phiếu nhập kho.",
  MISSING_WAREHOUSE: "Thiếu thông tin kho. Vui lòng mở lại từ hệ thống WMS.",
  MISSING_IF_MATCH:
    "Thiếu version phiếu nhập. Vui lòng tải lại phiếu trên WMS rồi quét lại.",
  LINE_NOT_MATCHED:
    "Không tìm thấy dòng hàng phù hợp với mã vừa quét trong phiếu nhập.",
  CAMERA_PERMISSION_DENIED:
    "Bạn chưa cấp quyền camera. Hãy cấp quyền để quét mã.",
  CAMERA_IN_USE:
    "Camera đang được ứng dụng khác sử dụng. Hãy đóng camera khác rồi thử lại.",
  CAMERA_PREVIEW_UNAVAILABLE:
    "Không nhận được hình ảnh từ camera. Hãy kiểm tra quyền camera rồi thử lại.",
  CAMERA_NOT_SUPPORTED: "Thiết bị hiện không hỗ trợ quét mã bằng camera.",
  SCANNER_DUPLICATE_LOCKED:
    "Mã này vừa được quét, hệ thống đang chống quét trùng.",
  SCANNER_PENDING_LOCKED:
    "Mã này đang được xử lý, vui lòng đợi kết quả trước khi quét lại.",
  UNKNOWN_ERROR: "Có lỗi xảy ra. Vui lòng thử lại.",
};

export function getErrorMessage(errorCode?: string, fallback?: string) {
  if (!errorCode) return fallback || ERROR_MESSAGES.UNKNOWN_ERROR;
  return ERROR_MESSAGES[errorCode] || fallback || ERROR_MESSAGES.UNKNOWN_ERROR;
}
