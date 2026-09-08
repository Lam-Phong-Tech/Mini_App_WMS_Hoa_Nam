/**
 * Chọn ảnh/video cho hồ sơ bảo hành.
 *
 * 🔓 Change Control `GATE_01 §11` #2 — người dùng duyệt thêm module native
 * `react-native-image-picker@8.2.1` ngày 2026-09-06.
 *
 * ## ✅ Không cần thêm quyền nào
 *
 * Kiểm chứng trước khi đụng vào manifest, vì manifest có ghi chú cấm lách:
 *
 * | Kiểm | Kết quả |
 * |---|---|
 * | Manifest của thư viện | **không khai quyền nào**, chỉ một `FileProvider` |
 * | Cách chọn ảnh | `PickVisualMedia` — photo picker của Android, **API 33+ không đòi quyền** |
 * | Tham chiếu `READ_MEDIA_*` / `checkSelfPermission` trong module | **không có** |
 * | Chụp ảnh mới | dùng `CAMERA`, đã khai sẵn cho máy quét |
 *
 * ⇒ Hai dòng `tools:node="remove"` gỡ quyền storage ở manifest **giữ nguyên**.
 * Ghi chú cũ lường trước rằng sẽ phải bỏ chúng; hoá ra không phải, và khôi phục
 * "cho chắc" chỉ là thêm quyền thừa vào bản rà soát bảo mật.
 *
 * ## Vì sao có tệp bọc này thay vì gọi thẳng thư viện
 *
 * 1. **Kiểm giới hạn ngay tại máy** trước khi tải: video 300MB qua mạng kho mất
 *    hàng phút, và bị máy chủ từ chối ở cuối là mất trắng chừng ấy thời gian.
 * 2. **Đổi shape một lần**: thư viện trả `fileName`/`fileSize`/`duration`, còn
 *    `uploadWarrantyAttachment` cần `{uri, name, type}`. Đổi ở một chỗ thì khi
 *    thư viện đổi API chỉ phải sửa một chỗ.
 * 3. Thư viện là module **native** — mọi tệp import nó đều không test được nếu
 *    không mock. Gom vào đây thì phần còn lại của app vẫn test bằng hàm thuần.
 */

import {
  launchCamera,
  launchImageLibrary,
  type Asset,
  type ImagePickerResponse,
} from 'react-native-image-picker';
import {
  ATTACHMENT_LIMITS,
  validateAttachment,
  type AttachmentCounts,
} from './warrantyPolicy';
import type { AttachmentFile } from '../../services/wms/warrantyWrite';

export interface PickedAttachment {
  readonly file: AttachmentFile;
  readonly bytes: number;
  readonly seconds?: number;
  readonly isVideo: boolean;
}

export type PickOutcome =
  | { readonly kind: 'picked'; readonly items: readonly PickedAttachment[] }
  /** Người dùng đóng hộp chọn — **không phải lỗi**, không hiện thông báo gì. */
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'error'; readonly message: string }
  /** Chọn được nhưng có tệp không hợp lệ. `items` là phần **hợp lệ**. */
  | {
      readonly kind: 'partial';
      readonly items: readonly PickedAttachment[];
      readonly rejected: readonly string[];
    };

/**
 * Đổi một asset của thư viện thành shape app dùng.
 *
 * Trả `undefined` khi thiếu `uri` — không có đường dẫn thì không tải lên được,
 * và đẩy một bản ghi rỗng vào danh sách chỉ làm người dùng tưởng đã chọn xong.
 */
export function toPicked(asset: Asset): PickedAttachment | undefined {
  const uri = asset.uri;
  if (uri === undefined || uri === '') {
    return undefined;
  }
  const type = asset.type ?? 'application/octet-stream';
  return {
    file: {
      uri,
      // Tên tệp thiếu thì tự đặt — máy chủ cần một tên để lưu, và `undefined`
      // sẽ thành chuỗi "undefined" trong multipart.
      name: asset.fileName ?? 'attachment-' + String(Date.now()),
      type,
    },
    bytes: asset.fileSize ?? 0,
    seconds: asset.duration,
    isVideo: ATTACHMENT_LIMITS.videoTypes.includes(type),
  };
}

/**
 * Lọc theo giới hạn ảnh 46, **cộng dồn** trong cùng một lần chọn.
 *
 * Cộng dồn là chỗ dễ bỏ sót: chọn 3 ảnh cùng lúc khi đã có 8 ảnh thì hai ảnh
 * đầu hợp lệ, ảnh thứ ba vượt trần 10. Kiểm từng ảnh với cùng một `counts` ban
 * đầu sẽ cho cả ba qua.
 */
export function filterByLimits(
  candidates: readonly PickedAttachment[],
  counts: AttachmentCounts,
): { accepted: PickedAttachment[]; rejected: string[] } {
  const accepted: PickedAttachment[] = [];
  const rejected: string[] = [];
  let images = counts.images;
  let videos = counts.videos;

  for (const candidate of candidates) {
    const problem = validateAttachment(
      {
        mimeType: candidate.file.type,
        bytes: candidate.bytes,
        seconds: candidate.seconds,
      },
      { images, videos },
    );
    if (problem === undefined) {
      accepted.push(candidate);
      if (candidate.isVideo) {
        videos += 1;
      } else {
        images += 1;
      }
    } else {
      rejected.push(candidate.file.name + ': ' + problem);
    }
  }

  return { accepted, rejected };
}

/** Đổi phản hồi thư viện thành kết quả app hiểu được. */
export function toOutcome(
  response: ImagePickerResponse,
  counts: AttachmentCounts,
): PickOutcome {
  if (response.didCancel === true) {
    return { kind: 'cancelled' };
  }
  if (response.errorCode !== undefined) {
    return {
      kind: 'error',
      message:
        response.errorMessage ??
        'Không mở được thư viện ảnh (' + response.errorCode + ').',
    };
  }

  const candidates: PickedAttachment[] = [];
  for (const asset of response.assets ?? []) {
    const picked = toPicked(asset);
    if (picked !== undefined) {
      candidates.push(picked);
    }
  }
  if (candidates.length === 0) {
    return { kind: 'cancelled' };
  }

  const { accepted, rejected } = filterByLimits(candidates, counts);
  if (rejected.length === 0) {
    return { kind: 'picked', items: accepted };
  }
  // Giữ lại phần hợp lệ thay vì bỏ hết: chọn 5 ảnh mà 1 quá nặng thì 4 ảnh kia
  // vẫn dùng được, và bắt chọn lại từ đầu là phạt người dùng vì lỗi của 1 tệp.
  return { kind: 'partial', items: accepted, rejected };
}

export interface PickerDeps {
  readonly fromLibrary?: typeof launchImageLibrary;
  readonly fromCamera?: typeof launchCamera;
}

/** Chọn từ thư viện. Cho chọn nhiều, tối đa phần còn trống của hạn mức. */
export async function pickFromLibrary(
  counts: AttachmentCounts,
  deps: PickerDeps = {},
): Promise<PickOutcome> {
  const launch = deps.fromLibrary ?? launchImageLibrary;
  const remaining = Math.max(
    0,
    ATTACHMENT_LIMITS.maxImages -
      counts.images +
      (ATTACHMENT_LIMITS.maxVideos - counts.videos),
  );
  if (remaining === 0) {
    return { kind: 'error', message: 'Hồ sơ đã đủ số ảnh và video cho phép.' };
  }
  try {
    const response = await launch({
      mediaType: 'mixed',
      selectionLimit: remaining,
      // KHÔNG lấy base64: một video 300MB thành chuỗi base64 sẽ ăn hết bộ nhớ
      // rồi app chết ngay trước khi tải được gì.
      includeBase64: false,
    });
    return toOutcome(response, counts);
  } catch (cause) {
    return {
      kind: 'error',
      message:
        cause instanceof Error ? cause.message : 'Không mở được thư viện ảnh.',
    };
  }
}

/** Chụp ảnh mới. Dùng quyền `CAMERA` đã khai sẵn cho máy quét. */
export async function captureAttachment(
  counts: AttachmentCounts,
  deps: PickerDeps = {},
): Promise<PickOutcome> {
  const launch = deps.fromCamera ?? launchCamera;
  try {
    const response = await launch({
      mediaType: 'photo',
      includeBase64: false,
      // Không lưu vào thư viện ảnh của máy: ảnh hiện trạng hàng hoá là dữ liệu
      // nghiệp vụ, không phải ảnh cá nhân của thủ kho.
      saveToPhotos: false,
    });
    return toOutcome(response, counts);
  } catch (cause) {
    return {
      kind: 'error',
      message: cause instanceof Error ? cause.message : 'Không mở được camera.',
    };
  }
}
