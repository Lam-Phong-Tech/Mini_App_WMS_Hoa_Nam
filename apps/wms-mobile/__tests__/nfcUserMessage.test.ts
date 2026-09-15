import { AppError } from '../src/errors/AppError';
import { nfcUserMessage } from '../src/features/nfc/nfcUserMessage';

describe('NFC user messages', () => {
  function nativeError(code: string): AppError {
    return new AppError({ kind: 'unknown', code, message: 'native detail' });
  }

  it.each([
    ['NFC_UNSUPPORTED_TAG', 'Thẻ này chỉ đọc được UID hoặc không hỗ trợ ghi NDEF. Dùng thẻ NFC NDEF mới còn ghi được.'],
    ['NFC_IO_ERROR', 'Không thể trao đổi dữ liệu ổn định với thẻ. Giữ thẻ sát điện thoại và thử lại; nếu vẫn lỗi, dùng thẻ khác.'],
    ['NFC_BUSY', 'Đang chờ một lần chạm NFC khác. Đợi thao tác trước kết thúc rồi thử lại.'],
    ['NFC_CANCELLED', 'Lần chạm thẻ đã bị dừng. Mở lại màn NFC rồi thử lại.'],
    ['NFC_MODULE_UNAVAILABLE', 'Bản cài này chưa có mô-đun NFC. Cập nhật ứng dụng rồi thử lại.'],
  ])('makes native %s actionable', (code, expected) => {
    expect(nfcUserMessage(nativeError(code))).toBe(expected);
  });

  it('keeps server conflict detail for a non-native NFC failure', () => {
    expect(nfcUserMessage(new AppError({ kind: 'http', status: 409, message: 'UID đã được gán' }))).toBe('UID đã được gán');
  });
});
