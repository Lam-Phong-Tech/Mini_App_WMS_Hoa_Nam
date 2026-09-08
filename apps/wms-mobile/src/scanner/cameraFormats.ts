/**
 * Ánh xạ định dạng mã giữa kiểu của dự án và kiểu của `react-native-camera-kit`.
 *
 * Vì sao cần lớp map riêng thay vì dùng thẳng kiểu của thư viện: `ScanSource`
 * (spec scanner §2) là interface chung cho **mọi** nguồn quét. Nếu tầng nghiệp
 * vụ nói bằng ngôn ngữ của một thư viện cụ thể thì đổi thư viện là phải sửa cả
 * ứng dụng — đúng cái GATE_01 Q4 bắt phải tránh.
 *
 * Prompt 3 §A: "Chọn loại barcode/QR thực sự cần thiết." Danh sách 8 định dạng
 * dưới đây lấy nguyên từ `SUPPORTED_BARCODE_FORMATS` của Mini App cũ, không mở
 * rộng thêm — quét càng nhiều định dạng thì càng dễ đọc nhầm.
 */

import { SUPPORTED_BARCODE_FORMATS, type BarcodeFormat } from './types';

/**
 * Chuỗi định dạng của camera-kit.
 * Khai lại ở đây thay vì import kiểu `CodeFormat` để tầng này không phụ thuộc
 * kiểu của thư viện — bảng map là chỗ duy nhất biết tên của nó.
 */
export type CameraKitFormat =
  | 'qr'
  | 'code-128'
  | 'code-39'
  | 'code-93'
  | 'ean-13'
  | 'ean-8'
  | 'upc-a'
  | 'upc-e';

/**
 * Bảng map hai chiều.
 *
 * ✅ Cả 8 định dạng đều có trong danh sách Android của camera-kit
 * (`codeFormatAndroid` trong `types.d.ts`) — kiểm chứng 2026-09-05.
 */
const TO_CAMERA_KIT: Readonly<Record<BarcodeFormat, CameraKitFormat>> = {
  QR_CODE: 'qr',
  CODE_128: 'code-128',
  CODE_39: 'code-39',
  CODE_93: 'code-93',
  EAN_13: 'ean-13',
  EAN_8: 'ean-8',
  UPC_A: 'upc-a',
  UPC_E: 'upc-e',
};

const FROM_CAMERA_KIT: Readonly<Record<CameraKitFormat, BarcodeFormat>> =
  Object.freeze(
    Object.fromEntries(
      Object.entries(TO_CAMERA_KIT).map(([ours, theirs]) => [theirs, ours]),
    ) as Record<CameraKitFormat, BarcodeFormat>,
  );

/** Danh sách gửi vào prop `allowedBarcodeTypes`. */
export function allowedCameraKitFormats(
  formats: readonly BarcodeFormat[] = SUPPORTED_BARCODE_FORMATS,
): CameraKitFormat[] {
  return formats.map(format => TO_CAMERA_KIT[format]);
}

/**
 * Đọc định dạng camera-kit trả về.
 * Trả `undefined` khi gặp giá trị ngoài danh sách (ví dụ `'unknown'`) — mã vẫn
 * dùng được, chỉ là không biết định dạng.
 */
export function fromCameraKitFormat(value: string): BarcodeFormat | undefined {
  return FROM_CAMERA_KIT[value as CameraKitFormat];
}
