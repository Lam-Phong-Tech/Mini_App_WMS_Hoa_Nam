import { AppError } from '../src/errors/AppError';
import { nfcUserMessage } from '../src/features/nfc/nfcUserMessage';

describe('NFC user messages', () => {
  function nativeError(code: string): AppError {
    return new AppError({ kind: 'unknown', code, message: 'native detail' });
  }

  it.each([
    [
      'NFC_UNSUPPORTED_TAG',
      'Thẻ này chỉ đọc được UID hoặc không hỗ trợ ghi NDEF. Dùng thẻ NFC NDEF mới còn ghi được.',
    ],
    [
      'NFC_IO_ERROR',
      'Không thể trao đổi dữ liệu ổn định với thẻ. Giữ thẻ sát điện thoại và thử lại; nếu vẫn lỗi, dùng thẻ khác.',
    ],
    [
      'NFC_BUSY',
      'Đang chờ một lần chạm NFC khác. Đợi thao tác trước kết thúc rồi thử lại.',
    ],
    ['NFC_CANCELLED', 'Lần chạm thẻ đã bị dừng. Mở lại màn NFC rồi thử lại.'],
    [
      'NFC_MODULE_UNAVAILABLE',
      'Bản cài này chưa có mô-đun NFC. Cập nhật ứng dụng rồi thử lại.',
    ],
  ])('makes native %s actionable', (code, expected) => {
    expect(nfcUserMessage(nativeError(code))).toBe(expected);
  });

  it('keeps server conflict detail for a non-native NFC failure', () => {
    expect(
      nfcUserMessage(
        new AppError({ kind: 'http', status: 409, message: 'UID đã được gán' }),
      ),
    ).toBe('UID đã được gán');
  });
  it('reports an unresolved NFC Back guard without pretending the server URL is missing', () => {
    const message =
      'Giữ nguyên chip và yêu cầu. Đọc lại hoặc đối chiếu trước khi chuyển thao tác.';
    expect(
      nfcUserMessage(
        new AppError({
          kind: 'config',
          code: 'NFC_UNRESOLVED_OPERATION',
          message,
        }),
      ),
    ).toBe(message);
  });
  it.each([
    'NFC_CONTEXT_REQUIRED',
    'NFC_SESSION_CHANGED',
    'NFC_SERVER_TIME_REQUIRED',
    'NFC_NO_RESERVATION',
    'NFC_PREPARATION_INVALID',
    'NFC_MAPPING_UNVERIFIED',
    'NFC_RELEASE_INVALID',
    'SKU_INACTIVE',
  ])('NFC guard %s is not mislabeled as missing server configuration', code => {
    expect(
      nfcUserMessage(new AppError({ kind: 'config', code, message: 'guard' })),
    ).not.toContain('cấu hình máy chủ');
  });
  it('keeps the actual missing-base-URL error separate', () => {
    expect(
      nfcUserMessage(
        new AppError({ kind: 'config', message: 'Missing base URL' }),
      ),
    ).toContain('cấu hình máy chủ');
  });
  it('does not call unknown NDEF content an already used tag', () => {
    const message = nfcUserMessage(nativeError('NFC_TAG_CONTENT_UNVERIFIED'));
    expect(message).toContain('Chưa xác minh');
    expect(message).not.toContain('đã có dữ liệu');
    expect(message).not.toContain('đăng ký');
  });
  it('separates browser write capability from missing NFC hardware', () => {
    const message = nfcUserMessage(
      nativeError('NFC_UID_BOUND_WRITE_UNSUPPORTED'),
    );
    expect(message).toContain('APK');
    expect(message).not.toContain('không có NFC');
  });
  it('SKU refusal after PATCH does not claim the chip was never written', () => {
    expect(
      nfcUserMessage(
        new AppError({
          kind: 'http',
          status: 422,
          code: 'SKU_INACTIVE',
          message: 'SKU inactive',
        }),
      ),
    ).not.toContain('chưa ghi');
  });
});
