/**
 * Quét QR/barcode từ ảnh chọn sẵn.
 *
 * App cài đặt chưa có bộ giải mã ảnh native tương đương Web BarcodeDetector.
 * Giấu thao tác này thay vì để thủ kho chọn ảnh rồi nhận một kết quả không đúng.
 * Bản web cùng tên (`.web.ts`) là nơi thực hiện đầy đủ luồng của Mini App.
 */

export interface DecodedImageCode {
  readonly code: string;
  readonly format: string;
}

export const supportsImageQrScan = false;

export async function pickQrImage(): Promise<undefined> {
  return undefined;
}

export async function decodeQrImage(_: unknown): Promise<DecodedImageCode> {
  throw new Error(
    'Quét QR từ ảnh hiện chưa được hỗ trợ trên ứng dụng cài đặt. Hãy dùng camera hoặc nhập mã thủ công.',
  );
}
