/**
 * Quét QR/barcode trong ảnh trên web, tương đương `scanImageFile` của Mini App.
 *
 * Ảnh chỉ được đọc trong trình duyệt: không upload ảnh lên WMS hay máy chủ nào.
 * Trình duyệt có BarcodeDetector dùng API native trước; Safari/iOS và các máy
 * chưa hỗ trợ dùng ZXing như Mini App gốc.
 */

export interface DecodedImageCode {
  readonly code: string;
  readonly format: string;
}

interface DetectedBarcode {
  readonly rawValue?: string;
  readonly format?: string;
}

interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<readonly DetectedBarcode[]>;
}

type BarcodeDetectorConstructor = new () => BarcodeDetectorLike;

const BARCODE_NOT_FOUND =
  'Không tìm thấy QR/Barcode trong ảnh. Hãy chọn ảnh rõ nét hơn.';

export const supportsImageQrScan = true;

/**
 * Mỗi lần tạo một input mới nên chọn lại đúng ảnh cũng vẫn bắn `change`.
 * Điều này khớp hành vi ref input của Mini App nhưng không để lại DOM rác.
 */
export function pickQrImage(): Promise<File | undefined> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    let settled = false;
    let focusTimeout: number | undefined;

    const finish = (file?: File) => {
      if (settled) return;
      settled = true;
      if (focusTimeout !== undefined) window.clearTimeout(focusTimeout);
      window.removeEventListener('focus', handleWindowFocus);
      input.remove();
      resolve(file);
    };

    // Một số Safari/iOS cũ không phát `cancel`. Khi người dùng quay về trang
    // mà không có file nào, đóng luồng chọn ảnh một cách yên lặng như Mini App.
    const handleWindowFocus = () => {
      focusTimeout = window.setTimeout(() => {
        if ((input.files?.length ?? 0) === 0) finish();
      }, 180);
    };

    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = false;
    input.style.display = 'none';
    input.addEventListener('change', () => finish(input.files?.[0]), {
      once: true,
    });
    input.addEventListener('cancel', () => finish(), { once: true });
    document.body.appendChild(input);
    window.addEventListener('focus', handleWindowFocus, { once: true });
    input.click();
  });
}

function getNativeBarcodeDetector(): BarcodeDetectorConstructor | undefined {
  return (globalThis as typeof globalThis & {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }).BarcodeDetector;
}

async function decodeWithNativeDetector(
  image: HTMLImageElement,
): Promise<DecodedImageCode | undefined> {
  const Detector = getNativeBarcodeDetector();
  if (Detector === undefined) return undefined;

  try {
    const detected = await new Detector().detect(image);
    const first = detected.find(item => item.rawValue?.trim() !== '');
    if (first?.rawValue !== undefined) {
      return { code: first.rawValue.trim(), format: first.format ?? 'UNKNOWN' };
    }
  } catch {
    // Chrome implementation có thể không hỗ trợ một định dạng. ZXing vẫn là
    // fallback chung, vì vậy không báo lỗi ngay tại đây.
  }
  return undefined;
}

/** Tương thích Safari cũ, nơi `HTMLImageElement.decode()` chưa có. */
function loadImage(image: HTMLImageElement, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(BARCODE_NOT_FOUND));
    image.src = url;
  });
}

/** Đọc mã từ File với thứ tự decoder giống Mini App: native trước, ZXing sau. */
export async function decodeQrImage(input: unknown): Promise<DecodedImageCode> {
  if (!(input instanceof File) || !input.type.startsWith('image/')) {
    throw new Error('Chỉ chọn tệp hình ảnh để quét QR/Barcode.');
  }

  const imageUrl = URL.createObjectURL(input);
  try {
    const image = new Image();
    await loadImage(image, imageUrl);

    const nativeResult = await decodeWithNativeDetector(image);
    if (nativeResult !== undefined) return nativeResult;

    // Chỉ tải ZXing sau khi bộ dò native không có kết quả. Trình quét ảnh là
    // tính năng mở theo yêu cầu, không được làm chậm trang nhập/xuất ban đầu.
    const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] =
      await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
    const imageScanFormats = [
      BarcodeFormat.QR_CODE,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_93,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
    ];
    const hints = new Map([
      [DecodeHintType.POSSIBLE_FORMATS, imageScanFormats],
      [DecodeHintType.TRY_HARDER, true],
    ]);
    const result = await new BrowserMultiFormatReader(hints).decodeFromImageUrl(
      imageUrl,
    );
    const code = result.getText().trim();
    if (code === '') throw new Error(BARCODE_NOT_FOUND);
    return { code, format: String(result.getBarcodeFormat()) };
  } catch (error) {
    if (error instanceof Error && error.message === BARCODE_NOT_FOUND) {
      throw error;
    }
    throw new Error(BARCODE_NOT_FOUND);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}
