/**
 * Danh sách thao tác **GHI** đã được duyệt — và chỉ những thao tác đó.
 *
 * 🔓 Change Control `GATE_WMS §2e` (2026-09-06) — **A và B** (nhập kho).
 * 🔓 Change Control `GATE_WMS §2f` (2026-09-06) — **C** (`post-receipt`).
 * 🔓 Change Control `GATE_WMS §2g` (2026-09-06) — **D và E** (xuất kho).
 * 🔓 Change Control `GATE_WMS §2h` (2026-09-06) — **F** (`post-issue`).
 * 🔓 Change Control `GATE_WMS §2i` (2026-09-06) — **G, H, I, J** (bảo hành).
 *   **K (`DELETE warranty-attachments/{id}`) KHÔNG được duyệt.**
 * 🔓 Change Control `GATE_WMS §2j` (2026-09-07) — luồng NFC: nhận diện QR,
 *   giữ chỗ chip, xác nhận sau khi ghi/đọc lại, tra cứu chip và thu hồi chip.
 *
 * ⇒ Nhập, xuất và bảo hành đã đấu. 166 endpoint ghi còn lại vẫn chặn, và
 * **chưa method `DELETE` nào** được mở.
 *
 * ## Vì sao là danh sách chứ không phải một cờ bật/tắt
 *
 * Bật `wmsGateApproved = true` sẽ mở **toàn bộ** 175 endpoint ghi của WMS, trong
 * đó có `DELETE /api/v1/roles/{id}` và `DELETE /api/v1/users/{id}/permissions/…`.
 * Người dùng duyệt **mười lăm** thao tác, không duyệt 175 cái.
 *
 * ⇒ Cờ môi trường vẫn `false`; đường đi duy nhất là danh sách dưới đây.
 *
 * ## Mười lăm thao tác được duyệt
 *
 * | Thao tác | Rủi ro | Header đặc biệt |
 * |---|---|---|
 * | `POST inbound/resolve-code` | **thấp** — spec khẳng định *"không tạo document, không tạo scan evidence, không tạo movement và không đổi tồn"* | — |
 * | `POST inbound/record` | **trung bình** — tạo phiếu WMS ở trạng thái chờ duyệt; tồn kho **chưa** đổi | `Idempotency-Key` |
 * | `POST inbound-documents/{id}/post-receipt` | **cao** — *stock mutation cuối*; sau thành công `document=POSTED` và **tồn kho tăng thật** | `Idempotency-Key` · `If-Match` |
 * | `POST outbound/resolve-code` | **thấp** — chỉ hỏi mã này là gì và có đủ điều kiện xuất không | — |
 * | `POST outbound/record` | **trung bình** — tạo phiếu xuất chờ duyệt; tồn kho **chưa** giảm | `Idempotency-Key` |
 * | `POST outbound-documents/{id}/post-issue` | **cao** — **giảm tồn kho thật** | `Idempotency-Key` · `If-Match` |
 * | `POST warranty/resolve-code` | **thấp** — chỉ hỏi mã, không tạo gì | — |
 * | `POST warranty-cases` | **trung bình** — tạo hồ sơ, và **lưu PII khách hàng** | `Idempotency-Key` |
 * | `POST warranty-cases/{id}/status` | **trung bình** — vòng đời hồ sơ; **không** đụng tồn kho | `Idempotency-Key` · `If-Match` |
 * | `POST warranty-cases/{id}/attachments` | **trung bình** — tải **ảnh/video khách hàng** lên; `multipart/form-data` | — |
 *
 * ## 🔴 `DELETE warranty-attachments/{id}` — CHƯA được duyệt
 *
 * Người dùng trả lời rõ *"chưa duyệt K"* (2026-09-06). Đây sẽ là **method
 * `DELETE` đầu tiên** trong danh sách trắng, và là thao tác **xoá vĩnh viễn**:
 * không có thùng rác, không hoàn tác.
 *
 * ⚠️ Hệ quả nhìn thấy được: người dùng tải nhầm ảnh lên thì **không gỡ ra
 * được từ app**. Đó là hạn chế thật của phạm vi hiện tại, không phải thiếu sót
 * — và màn hình phải nói ra thay vì có một nút xoá không hoạt động.
 *
 * ## 🔴 Hai thao tác đổi tồn kho — chỗ duy nhất không lùi được
 *
 * `post-receipt` và `post-issue` là **hai thao tác duy nhất** trong danh sách
 * này đổi tồn kho thật. Mọi thứ khác đều lùi được: quét nhầm thì vuốt xoá,
 * phiếu ghi nhận nhầm thì còn ở trạng thái chờ duyệt.
 *
 * Hậu quả khi nhầm không đối xứng — post nhầm phiếu **nhập** thì tồn dư ra và
 * lần đếm nào cũng thấy; post nhầm phiếu **xuất** thì hàng bị trừ khỏi sổ trong
 * khi vẫn nằm trên kệ, và sổ lệch kho một cách im lặng tới kỳ kiểm kê.
 *
 * ⇒ Cả hai đều đòi **preflight tier ngay trước khi gửi** — xem
 * `services/wms/tierCheck.ts`. Đó là ràng buộc mà bốn thao tác kia không có.
 *
 * ## Vì sao C duyệt được, sau khi từng bị giữ lại
 *
 * Hai lý do treo C hôm trước:
 *
 * 1. **Mục 3 Gate WMS đã ĐÓNG.** Hạ tầng cung cấp bảng tách tier ở cổng Nginx,
 *    stack và database (`config/deployment.ts`). Bản DEV/TEST trỏ Green, nên
 *    `post-receipt` chỉ đổi `wms_hoanam_green` — không chạm nổi tồn kho khách.
 * 2. **`If-Match`** — người dùng duyệt C khi mục 12 vẫn chưa kiểm chứng. Giá
 *    trị gửi đi lấy theo **client đang chạy thật**
 *    (`receipt-flow.service.ts:889`): `ETag` của phản hồi, hoặc `data.version`,
 *    bỏ dấu nháy. ⚠️ Vẫn **chưa có xác nhận từ máy chủ**.
 *
 * ## 🔒 Chốt chặn KHÔNG nằm ở tệp này
 *
 * Danh sách này chỉ nói *"thao tác nào được phép về nguyên tắc"*. Việc **có
 * đang nói chuyện với đúng stack hay không** do `services/wms/tierCheck.ts`
 * quyết định, dựa trên header máy chủ trả về. Hai thứ độc lập, và cần **cả
 * hai** mới ghi được.
 *
 * ## Khớp đường dẫn
 *
 * Sáu đường không có tham số ⇒ khớp tuyệt đối. Bốn đường mang `{id}`
 * ⇒ khớp **theo từng đoạn**, cố ý không dùng tiền tố và không dùng biểu thức
 * chính quy nuốt dấu `/`. Đoạn `{id}` phải là **một** đoạn, không rỗng, và
 * không phải `.` hay `..` — nếu không thì `/inbound-documents/../../roles/1`
 * sẽ lọt qua đúng chỗ nguy hiểm nhất.
 */

/** Mười lăm thao tác được duyệt. */
export type ApprovedWrite =
  | 'inbound.resolveCode'
  | 'inbound.record'
  | 'inbound.postReceipt'
  | 'outbound.resolveCode'
  | 'outbound.record'
  | 'outbound.postIssue'
  | 'warranty.resolveCode'
  | 'warranty.createCase'
  | 'warranty.updateStatus'
  | 'warranty.uploadAttachment'
  | 'nfc.resolveCode'
  | 'nfc.prepare'
  | 'nfc.confirm'
  | 'nfc.resolveTag'
  | 'nfc.deactivate';

interface ApprovedWriteEntry {
  readonly id: ApprovedWrite;
  /** Method duy nhất được duyệt cho đường dẫn này. */
  readonly method: 'POST' | 'PATCH';
  /**
   * Mẫu đường dẫn, tách sẵn theo đoạn. `'{id}'` khớp đúng một đoạn hợp lệ; mọi
   * đoạn khác phải trùng khít.
   */
  readonly segments: readonly string[];
}

function segmentsOf(path: string): readonly string[] {
  return (path.split('?')[0] ?? '').split('/').filter(segment => segment !== '');
}

const APPROVED_WRITES: readonly ApprovedWriteEntry[] = [
  {
    id: 'inbound.resolveCode',
    method: 'POST',
    segments: segmentsOf('/api/v1/mini-app/inbound/resolve-code'),
  },
  {
    id: 'inbound.record',
    method: 'POST',
    segments: segmentsOf('/api/v1/mini-app/inbound/record'),
  },
  {
    id: 'inbound.postReceipt',
    method: 'POST',
    segments: segmentsOf('/api/v1/mini-app/inbound-documents/{id}/post-receipt'),
  },
  {
    id: 'outbound.resolveCode',
    method: 'POST',
    segments: segmentsOf('/api/v1/mini-app/outbound/resolve-code'),
  },
  {
    id: 'outbound.record',
    method: 'POST',
    segments: segmentsOf('/api/v1/mini-app/outbound/record'),
  },
  {
    id: 'outbound.postIssue',
    method: 'POST',
    segments: segmentsOf('/api/v1/mini-app/outbound-documents/{id}/post-issue'),
  },
  {
    id: 'warranty.resolveCode',
    method: 'POST',
    segments: segmentsOf('/api/v1/mini-app/warranty/resolve-code'),
  },
  {
    id: 'warranty.createCase',
    method: 'POST',
    segments: segmentsOf('/api/v1/mini-app/warranty-cases'),
  },
  {
    id: 'warranty.updateStatus',
    method: 'POST',
    segments: segmentsOf('/api/v1/mini-app/warranty-cases/{id}/status'),
  },
  {
    id: 'warranty.uploadAttachment',
    method: 'POST',
    segments: segmentsOf('/api/v1/mini-app/warranty-cases/{id}/attachments'),
  },
  // NFC không dùng generic `/physical-codes`: cặp prepare → confirm giữ chỗ
  // `reservation_token` để hai máy không ghi cùng một chip/item.
  {
    id: 'nfc.resolveCode',
    method: 'POST',
    segments: segmentsOf('/api/v1/mini-app/nfc/resolve-code'),
  },
  {
    id: 'nfc.prepare',
    method: 'POST',
    segments: segmentsOf('/api/v1/mini-app/items/{id}/nfc/prepare'),
  },
  {
    id: 'nfc.confirm',
    method: 'PATCH',
    segments: segmentsOf('/api/v1/mini-app/items/{id}/nfc'),
  },
  {
    id: 'nfc.resolveTag',
    method: 'POST',
    segments: segmentsOf('/api/v1/mini-app/nfc/resolve-tag'),
  },
  {
    id: 'nfc.deactivate',
    method: 'POST',
    segments: segmentsOf('/api/v1/mini-app/nfc-tags/{id}/deactivate'),
  },
  // 🔴 `DELETE warranty-attachments/{id}` cố ý VẮNG MẶT — chưa duyệt, và sẽ là
  // method DELETE đầu tiên nếu được mở.
];

/**
 * Một đoạn có đủ tư cách thay cho `{id}` không.
 *
 * Chặn `.` và `..` là chốt chống đi ngược thư mục. Một đường dẫn như
 * `/inbound-documents/../../roles/1/post-receipt` mà lọt sẽ khiến cổng này ký
 * duyệt cho đúng thứ nó sinh ra để chặn.
 */
function isValidIdSegment(segment: string): boolean {
  return segment !== '' && segment !== '.' && segment !== '..';
}

function matches(entry: ApprovedWriteEntry, actual: readonly string[]): boolean {
  if (entry.segments.length !== actual.length) {
    return false;
  }
  return entry.segments.every((expected, index) => {
    const segment = actual[index] ?? '';
    return expected === '{id}'
      ? isValidIdSegment(segment)
      : expected === segment;
  });
}

/**
 * Thao tác ghi này có được duyệt không, và là loại nào.
 *
 * Trả `undefined` nghĩa là **chưa được duyệt** — bên gọi phải chặn.
 */
export function approvedWriteFor(
  method: string,
  path: string,
): ApprovedWrite | undefined {
  const actual = segmentsOf(path);
  const upper = method.toUpperCase();
  return APPROVED_WRITES.find(
    entry => entry.method === upper && matches(entry, actual),
  )?.id;
}

/**
 * Thao tác này được phép gửi `Idempotency-Key` không.
 *
 * `GATE_01 §11` #6 cấm header này **toàn cục**. Các Change Control `§2e`–`§2i`
 * nới cho đúng bảy thao tác mà spec khai header đó là bắt buộc. Nơi khác vẫn cấm.
 *
 * Các endpoint nhận diện/tra cứu **không** được gửi: spec không khai header này
 * cho chúng, và chúng cũng không tạo gì để mà cần chống trùng.
 */
export function allowsIdempotencyKey(method: string, path: string): boolean {
  const approved = approvedWriteFor(method, path);
  return (
    approved === 'inbound.record' ||
    approved === 'inbound.postReceipt' ||
    approved === 'outbound.record' ||
    approved === 'outbound.postIssue' ||
    approved === 'warranty.createCase' ||
    approved === 'warranty.updateStatus' ||
    // `PATCH items/{id}/nfc` có thể timeout sau khi thẻ đã ghi. Khóa chống
    // trùng là bắt buộc để retry không sinh một mapping thứ hai.
    approved === 'nfc.confirm'
  );
}

/**
 * Thao tác này được phép gửi `If-Match` không.
 *
 * 🔓 Mở cho **đúng hai** thao tác: `post-receipt` và `post-issue` — hai lệnh
 * đổi tồn kho, và cũng là hai chỗ duy nhất spec khai header này. Bốn thao tác
 * còn lại vẫn cấm tuyệt đối.
 *
 * 🔧 Kiểm chứng lại 2026-09-06: bản kiểm kê spec của tôi
 * (`openapi/wms-external-api.draft.yaml:128`) khai `post-issue` chỉ có
 * `Idempotency-Key`. **Sai.** Mã đang chạy gửi cả hai
 * (`scan.service.ts:1747-1748`). Mô tả của người dùng đúng, bản kiểm kê thiếu.
 *
 * ⚠️ Mục 12 Gate WMS **chưa đóng**: chưa ai xác nhận máy chủ chấp nhận định
 * dạng nào. App gửi theo đúng client đang chạy thật; sai thì nhận `412
 * STALE_VERSION`, và `syncEngine` xếp 412 vào `conflict` — không tự ghi đè.
 */
export function allowsIfMatch(method: string, path: string): boolean {
  const approved = approvedWriteFor(method, path);
  return (
    approved === 'inbound.postReceipt' ||
    approved === 'outbound.postIssue' ||
    // Chuyển trạng thái hồ sơ bảo hành cũng dùng optimistic locking, dù nó
    // KHÔNG đụng tồn kho: hai người cùng mở một hồ sơ là chuyện thường, và ghi
    // đè kết quả kiểm tra của nhau thì mất hẳn phần hồ sơ kỹ thuật.
    approved === 'warranty.updateStatus'
  );
}

/**
 * Thao tác này gửi `multipart/form-data` thay vì JSON.
 *
 * 🔓 Đúng **một** thao tác: tải file đính kèm hồ sơ bảo hành. `api/client.ts`
 * đọc cờ này để **không** đặt `Content-Type` — với `FormData`, môi trường chạy
 * phải tự sinh `boundary`, và đặt tay là hỏng cả request theo kiểu khó đoán.
 */
export function usesMultipart(method: string, path: string): boolean {
  return approvedWriteFor(method, path) === 'warranty.uploadAttachment';
}
