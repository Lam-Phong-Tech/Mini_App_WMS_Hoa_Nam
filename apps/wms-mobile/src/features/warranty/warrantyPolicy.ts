/**
 * Bảo hành — chính sách hiển thị và chuyển trạng thái.
 *
 * 🎨 Nguồn: ảnh **39–46**. 🔍 Nguồn hành vi: khảo sát trực quan 2026-09-05 và
 * mã nguồn WMS do người dùng đối chiếu
 * ([03-api-contract-delta.md §4i](../../../../../docs/migration/03-api-contract-delta.md)).
 *
 * Ba rủi ro của luồng này, và cách tệp này xử lý từng cái:
 *
 * | Rủi ro | Xử lý |
 * |---|---|
 * | PII che theo vai | **Không tự che, không giả định đã che** — chỉ nhận diện và hiển thị đúng thứ máy chủ trả |
 * | `defects` trả **403** với thủ kho | Coi 403 là **trạng thái hợp lệ**, không phải sự cố |
 * | Hồ sơ bị **ẩn danh** sau hết hạn lưu trữ | Nhận ra qua `[ANONYMIZED]` và ẩn thao tác liên hệ / tải tệp |
 */

import { AppError } from '../../errors/AppError';
import {
  ANONYMIZED_MARKER,
  isAnonymized,
  type WarrantyCase,
} from '../../services/wms/types';

// ---------------------------------------------------------------------------
// Tab trạng thái — ảnh 39
// ---------------------------------------------------------------------------

/** Năm tab, đúng nhãn và thứ tự trong ảnh 39. */
/**
 * Sáu trạng thái vòng đời hồ sơ bảo hành — **giá trị thật của WMS**.
 *
 * 🔴 **Sửa lỗi 2026-09-06.** Bản trước dùng `INSPECTING`, nhưng WMS dùng
 * `CHECKING` (mô tả luồng bảo hành của người dùng; đối chiếu
 * `pages/WarrantyDetailPage/index.tsx:49-50` của Mini App đang chạy thì đúng).
 *
 * Hệ quả nếu để nguyên: tab *Kiểm tra* gọi `?status=INSPECTING` và **luôn rỗng**
 * — hoặc **422**, đúng loại lỗi người dùng đã bắt được trên máy thật ở luồng
 * xuất kho ngày 2026-09-06. Loại lỗi này không gây crash, chỉ khiến một tab
 * lặng lẽ không bao giờ có dữ liệu.
 *
 * `CANCELLED` cũng thiếu ở bản trước. Hồ sơ bị huỷ vẫn phải tra được — đó
 * thường là hồ sơ có tranh chấp, tức là hồ sơ hay bị hỏi lại nhất.
 */
export const WARRANTY_STATUSES = [
  'RECEIVED',
  'CHECKING',
  'REPAIRING',
  'COMPLETED',
  'RETURNED',
  'CANCELLED',
] as const;

export type WarrantyStatus = (typeof WARRANTY_STATUSES)[number];

export const WARRANTY_TABS = [
  { key: 'RECEIVED', label: 'Tiếp nhận' },
  { key: 'CHECKING', label: 'Kiểm tra' },
  { key: 'REPAIRING', label: 'Sửa chữa' },
  { key: 'COMPLETED', label: 'Hoàn tất' },
  { key: 'RETURNED', label: 'Đã trả' },
  { key: 'CANCELLED', label: 'Đã huỷ' },
] as const;

/**
 * Danh sách hồ sơ cache **30 giây** — đúng như Mini App đang chạy.
 *
 * Đủ ngắn để hai thủ kho làm cùng lúc không thấy dữ liệu lệch nhau lâu, đủ dài
 * để việc chuyển qua lại giữa sáu tab không thành sáu request mỗi lần.
 * Nút *Đồng bộ* bỏ qua cache.
 */
export const WARRANTY_LIST_CACHE_MS = 30_000;

/** Số hồ sơ mỗi trang. ⚠️ Chưa có phân trang — xem `USER-ACTION-REQUIRED` #24. */
export const WARRANTY_LIST_PER_PAGE = 25;

// ---------------------------------------------------------------------------
// PII
// ---------------------------------------------------------------------------

/**
 * Máy chủ đã che PII của hồ sơ này chưa.
 *
 * ⚠️ **Client KHÔNG tự che.** Máy chủ che theo quyền `warranty.pii.view`: thủ
 * kho nhận `H*** V*** N*** · ******372`, còn quản lý nhận tên thật (đối chiếu
 * ảnh 40 với khảo sát cùng màn bằng tài khoản thủ kho).
 *
 * Tự che ở client là **sai cả hai chiều**: che thứ máy chủ đã cho phép xem thì
 * quản lý không làm việc được; mà tin rằng mình che được thì lộ dữ liệu khi
 * logic client sai.
 */
export function isPiiMasked(warrantyCase: WarrantyCase): boolean {
  if (warrantyCase.pii_masked === true) {
    return true;
  }
  // Cờ `pii_masked` có thể vắng ở một số phản hồi; dấu sao là bằng chứng còn lại.
  const name = warrantyCase.customer_name ?? '';
  return name.includes('***');
}

// ---------------------------------------------------------------------------
// Ẩn danh sau khi hết hạn lưu trữ
// ---------------------------------------------------------------------------

/**
 * Hồ sơ đã bị ẩn danh chưa.
 *
 * BA xác nhận 2026-09-06: **API chưa có cờ `pii_anonymized`**, nên dấu hiệu duy
 * nhất là chính chuỗi `[ANONYMIZED]` mà job `warranty:purge-pii` ghi đè vào
 * (§4k.3). Kiểm cả hai trường vì job ghi đè cả tên lẫn mô tả thủ công.
 */
export function isCaseAnonymized(warrantyCase: WarrantyCase): boolean {
  return (
    isAnonymized(warrantyCase.customer_name) ||
    isAnonymized(warrantyCase.manual_product_description)
  );
}

/** Nguyên văn câu BA chốt cho UI (§4k.3). */
export const MESSAGE_ANONYMIZED =
  'Thông tin khách hàng đã được ẩn danh theo chính sách lưu trữ.';

/**
 * Thao tác nào phải **ẩn** khi hồ sơ đã ẩn danh.
 *
 * BA chốt: ẩn *liên hệ khách* và *tải tệp đính kèm*. Lý do rõ ràng — số điện
 * thoại đã bị xoá nên nút gọi vô nghĩa, còn tệp đính kèm đã bị **xoá vật lý**
 * khỏi storage nên nút tải chỉ dẫn tới lỗi 404.
 */
export interface WarrantyActionVisibility {
  readonly canContactCustomer: boolean;
  readonly canDownloadAttachments: boolean;
}

export function actionVisibility(
  warrantyCase: WarrantyCase,
): WarrantyActionVisibility {
  const anonymized = isCaseAnonymized(warrantyCase);
  return {
    canContactCustomer: !anonymized && !isPiiMasked(warrantyCase),
    canDownloadAttachments: !anonymized,
  };
}

/** Giá trị hiển thị cho một trường PII, đã tính cả trường hợp ẩn danh. */
export function displayPii(value: string | null | undefined): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return value === ANONYMIZED_MARKER ? 'Đã ẩn danh' : value;
}

// ---------------------------------------------------------------------------
// Chuyển trạng thái — ảnh 45
// ---------------------------------------------------------------------------

/**
 * Đồ thị chuyển trạng thái — **khoá theo thứ tự**, không cho nhảy cóc.
 *
 * Nguồn: mô tả luồng bảo hành 2026-09-06, đối chiếu khớp
 * `pages/WarrantyDetailPage/index.tsx:48-55` của Mini App đang chạy.
 *
 * Vì sao khoá ở client dù máy chủ cũng kiểm: một nút bấm được rồi mới báo lỗi
 * dạy người dùng rằng lỗi là chuyện bình thường. Nút không hiện thì họ không
 * phải học điều đó.
 *
 * ⚠️ `RETURNED` và `CANCELLED` là **ngõ cụt** — hồ sơ đã đóng. Cố ý để mảng
 * rỗng chứ không bỏ khoá: bỏ khoá thì `nextStatuses()` trả `undefined` và bên
 * gọi phải phân biệt "không có bước tiếp" với "trạng thái lạ".
 */
export const WARRANTY_TRANSITIONS: Readonly<
  Record<WarrantyStatus, readonly WarrantyStatus[]>
> = {
  RECEIVED: ['CHECKING', 'CANCELLED'],
  CHECKING: ['REPAIRING', 'COMPLETED', 'CANCELLED'],
  REPAIRING: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['RETURNED'],
  RETURNED: [],
  CANCELLED: [],
};

export function isWarrantyStatus(value: string): value is WarrantyStatus {
  return (WARRANTY_STATUSES as readonly string[]).includes(value.toUpperCase());
}

/** Các bước tiếp theo hợp lệ. Trạng thái lạ ⇒ mảng rỗng, không ném lỗi. */
export function nextStatuses(current: string): readonly WarrantyStatus[] {
  const upper = current.toUpperCase();
  return isWarrantyStatus(upper) ? WARRANTY_TRANSITIONS[upper] : [];
}

export function canTransition(current: string, target: string): boolean {
  return nextStatuses(current).includes(target.toUpperCase() as WarrantyStatus);
}

/**
 * Ghi chú có bắt buộc không — xét **cặp** trạng thái, không chỉ đích đến.
 *
 * 🔧 Sửa 2026-09-06. Bản trước chỉ xét đích đến và coi `COMPLETED` là luôn bắt
 * buộc. Quy tắc thật ở Mini App đang chạy
 * (`WarrantyDetailPage/index.tsx:991-1000`) xét cả nguồn:
 *
 * | Đích | Bắt buộc khi |
 * |---|---|
 * | `RETURNED`, `CANCELLED` | **luôn** — hồ sơ đóng lại, phải nói vì sao |
 * | `COMPLETED` | chỉ khi đi từ `CHECKING` hoặc `REPAIRING` |
 *
 * Trên đồ thị hiện tại hai quy tắc cho cùng kết quả, vì `COMPLETED` chỉ tới
 * được từ hai trạng thái đó. Nhưng viết đúng quy tắc thật thì khi đồ thị đổi,
 * hành vi vẫn đúng — còn viết xấp xỉ thì nó sai lặng lẽ.
 */
export function requiresNote(current: string, target: string): boolean {
  const to = target.toUpperCase();
  if (to === 'RETURNED' || to === 'CANCELLED') {
    return true;
  }
  if (to === 'COMPLETED') {
    return ['CHECKING', 'REPAIRING'].includes(current.toUpperCase());
  }
  return false;
}

export const MESSAGE_NOTE_REQUIRED =
  'Ghi chú bắt buộc khi Hoàn tất, Trả khách hoặc Huỷ hồ sơ.';

/**
 * *Kết quả kiểm tra* (`confirmed_defect`) có bắt buộc không.
 *
 * Mô tả 2026-09-06: *"Khi từ CHECKING chuyển sang REPAIRING hoặc COMPLETED,
 * bắt buộc nhập 'Kết quả kiểm tra'."*
 *
 * ⚠️ Đây là trường **KHÁC** với `note`. Payload chuyển trạng thái có cả hai
 * (`warranty-flow.service.ts:299-303`), và chúng trả lời hai câu hỏi khác nhau:
 * `confirmed_defect` là *"kiểm tra ra bệnh gì"*, `note` là *"vì sao chuyển
 * trạng thái"*. Gộp làm một thì mất một nửa hồ sơ kỹ thuật.
 */
export function requiresConfirmedDefect(
  current: string,
  target: string,
): boolean {
  return (
    current.toUpperCase() === 'CHECKING' &&
    ['REPAIRING', 'COMPLETED'].includes(target.toUpperCase())
  );
}

export const MESSAGE_CONFIRMED_DEFECT_REQUIRED =
  'Vui lòng nhập Kết quả kiểm tra trước khi chuyển trạng thái.';

export interface TransitionInput {
  readonly current: string;
  readonly target: string;
  readonly note: string;
  readonly confirmedDefect: string;
}

/**
 * Kiểm tra trước khi cho bấm chuyển trạng thái.
 *
 * Trả câu lỗi **đầu tiên** gặp phải, theo thứ tự: bước có hợp lệ không → có kết
 * quả kiểm tra chưa → có ghi chú chưa. Thứ tự này không tuỳ tiện: một bước
 * không hợp lệ thì hai câu kia vô nghĩa.
 */
export function validateTransition(
  input: TransitionInput,
): string | undefined {
  if (!canTransition(input.current, input.target)) {
    return (
      'Không chuyển được từ "' +
      input.current +
      '" sang "' +
      input.target +
      '".'
    );
  }
  if (
    requiresConfirmedDefect(input.current, input.target) &&
    input.confirmedDefect.trim() === ''
  ) {
    return MESSAGE_CONFIRMED_DEFECT_REQUIRED;
  }
  if (requiresNote(input.current, input.target) && input.note.trim() === '') {
    return MESSAGE_NOTE_REQUIRED;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Giới hạn tệp đính kèm — ảnh 46
// ---------------------------------------------------------------------------

/**
 * Giới hạn nguyên văn từ ảnh 46.
 *
 * *"Ảnh JPG/PNG/WEBP tối đa 10MB; video MP4/MOV/WEBM tối đa 300MB và 5 phút."*
 * Badge ở cùng ảnh: `0/10 ảnh · 0/2 video`.
 *
 * Kiểm ở client **trước khi** tải lên — không phải để thay máy chủ, mà để thủ
 * kho ở kho không phải chờ tải hết 300MB qua mạng 3G rồi mới bị từ chối.
 */
export const ATTACHMENT_LIMITS = {
  maxImages: 10,
  maxVideos: 2,
  imageBytes: 10 * 1024 * 1024,
  videoBytes: 300 * 1024 * 1024,
  videoSeconds: 5 * 60,
  imageTypes: ['image/jpeg', 'image/png', 'image/webp'] as readonly string[],
  videoTypes: ['video/mp4', 'video/quicktime', 'video/webm'] as readonly string[],
} as const;

export interface AttachmentCandidate {
  readonly mimeType: string;
  readonly bytes: number;
  /** Chỉ có với video. */
  readonly seconds?: number;
}

export interface AttachmentCounts {
  readonly images: number;
  readonly videos: number;
}

/**
 * Tệp này có nhận được không.
 *
 * Trả `undefined` khi hợp lệ, hoặc câu lỗi tiếng Việt để hiện thẳng cho người dùng.
 */
export function validateAttachment(
  file: AttachmentCandidate,
  counts: AttachmentCounts,
): string | undefined {
  const isImage = ATTACHMENT_LIMITS.imageTypes.includes(file.mimeType);
  const isVideo = ATTACHMENT_LIMITS.videoTypes.includes(file.mimeType);

  if (!isImage && !isVideo) {
    return 'Chỉ nhận ảnh JPG/PNG/WEBP hoặc video MP4/MOV/WEBM.';
  }

  if (isImage) {
    if (counts.images >= ATTACHMENT_LIMITS.maxImages) {
      return 'Hồ sơ đã đủ ' + String(ATTACHMENT_LIMITS.maxImages) + ' ảnh.';
    }
    if (file.bytes > ATTACHMENT_LIMITS.imageBytes) {
      return 'Ảnh vượt quá 10MB.';
    }
    return undefined;
  }

  if (counts.videos >= ATTACHMENT_LIMITS.maxVideos) {
    return 'Hồ sơ đã đủ ' + String(ATTACHMENT_LIMITS.maxVideos) + ' video.';
  }
  if (file.bytes > ATTACHMENT_LIMITS.videoBytes) {
    return 'Video vượt quá 300MB.';
  }
  if (
    file.seconds !== undefined &&
    file.seconds > ATTACHMENT_LIMITS.videoSeconds
  ) {
    return 'Video dài quá 5 phút.';
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Danh mục lỗi — endpoint trả 403 với thủ kho
// ---------------------------------------------------------------------------

/**
 * 403 khi đọc danh mục lỗi có phải là **thiếu quyền** không.
 *
 * Đo thật 2026-09-05: `GET /api/v1/defects` trả `403 ACCESS_DENIED` với vai
 * WAREHOUSE_KEEPER ([04-screen-survey.md §3.2](../../../../../docs/migration/04-screen-survey.md)).
 *
 * 📌 Đo lại 2026-09-06 trên cùng môi trường: **200 + danh sách rỗng**. Quyền đã
 * được cấp. Giữ nguyên hàm này vì 403 vẫn có thể quay lại với vai khác, nhưng
 * đừng coi 403 là tình trạng đang diễn ra.
 *
 * ⚠️ Đây là **trạng thái hợp lệ**, không phải sự cố. Hiện màn "lỗi hệ thống" ở
 * đây là nói dối: hệ thống chạy đúng, chỉ là vai này không được xem danh mục
 * lỗi. Màn hình phải nói đúng điều đó và chỉ lối đi tiếp.
 */
export function isDefectPermissionDenied(error: unknown): boolean {
  return (
    error instanceof AppError &&
    (error.status === 403 || error.code === 'ACCESS_DENIED')
  );
}

export const MESSAGE_DEFECTS_FORBIDDEN_TITLE =
  'Tài khoản của bạn không xem được danh mục lỗi';
export const MESSAGE_DEFECTS_FORBIDDEN_BODY =
  'Vai trò hiện tại không có quyền đọc danh mục bệnh/lỗi. Bạn vẫn mô tả được tình trạng máy ở ô bên dưới, hoặc nhờ quản lý chọn giúp.';
