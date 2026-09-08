/**
 * Scanner abstraction — kiểu dữ liệu.
 *
 * Port từ `src/services/scanner-adapter.ts` + `src/types/scan.types.ts` của Mini
 * App theo yêu cầu 01-scanner-architecture-requirements.md §4 mục 4 ("port sang
 * app mới thay vì thiết kế lại"). Đã bỏ các thành viên chỉ có trên web
 * (`HTMLVideoElement`, `File`) vì không tồn tại trong React Native.
 */

/** Bộ định dạng tối thiểu phải giữ — spec §4 mục 3. */
export const SUPPORTED_BARCODE_FORMATS = [
  'QR_CODE',
  'CODE_128',
  'CODE_39',
  'CODE_93',
  'EAN_13',
  'EAN_8',
  'UPC_A',
  'UPC_E',
] as const;

export type BarcodeFormat = (typeof SUPPORTED_BARCODE_FORMATS)[number];

/** Danh mục mã lỗi camera — giữ nguyên theo spec §4 mục 5. */
export const CAMERA_ERROR_CODES = [
  'CAMERA_PERMISSION_DENIED',
  'CAMERA_IN_USE',
  'CAMERA_PREVIEW_UNAVAILABLE',
  'CAMERA_NOT_SUPPORTED',
] as const;

export type CameraErrorCode = (typeof CAMERA_ERROR_CODES)[number];

/**
 * Nguồn quét thật sự sinh ra mã.
 *
 * Spec §4 mục 1: giá trị này phải phản ánh **nguồn thật**, không phải nhãn mặc
 * định. Mini App cũ có `ScanMethod = "SCANNER"` mà không đường code nào sinh ra
 * được từ thiết bị — lỗi đó không được lặp lại.
 */
export type ScanSourceKind = 'CAMERA' | 'KEYBOARD_WEDGE' | 'MANUAL';

export interface ScanDetectedResult {
  readonly code: string;
  readonly format?: BarcodeFormat;
  /** ISO-8601, tương đương `detected_at` của Mini App. */
  readonly detectedAt: string;
  /** Nguồn thật đã tạo ra kết quả này. */
  readonly source: ScanSourceKind;
}

/**
 * Interface chung cho mọi nguồn quét (spec §2).
 * Tầng nghiệp vụ chỉ thấy interface này, không biết là camera hay đầu quét.
 */
export interface ScanSource {
  /** Tên để log và hiển thị chẩn đoán. */
  getName(): string;
  /** Nguồn này có dùng được trên thiết bị hiện tại không. */
  isSupported(): boolean;
  /** Quét liên tục (camera) hay theo từng lần bắn (wedge). */
  isContinuous(): boolean;
  getKind(): ScanSourceKind;

  initialize(): Promise<void>;
  start(onDetected: (result: ScanDetectedResult) => void): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;

  /** Chỉ nguồn nào thật sự có đèn/đảo camera mới hiện thực. */
  switchCamera?(): Promise<void>;
  toggleTorch?(): Promise<boolean>;
}
