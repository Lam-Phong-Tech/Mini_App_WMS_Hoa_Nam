/**
 * Phiếu xuất nháp — máy trạng thái, tách khỏi React.
 *
 * 🎨 Nguồn: ảnh **25–35** của bộ 47 ảnh.
 *
 * ## Ba khác biệt so với luồng nhập kho
 *
 * | | Nhập kho | Xuất kho |
 * |---|---|---|
 * | Số lượng | **không** biết trước, quét bao nhiêu tính bấy nhiêu | **đặt trước** ở form (*"Số lượng cần quét\*"*), quét đến khi đủ |
 * | Tiến độ | chỉ đếm | có **thanh tiến độ** và badge `0/1` (ảnh 28, 29) |
 * | Tồn kho | **tăng** sau Post Receipt | **giảm** sau Post Issue (ảnh 35) |
 *
 * ⇒ Điều kiện ghi nhận cũng khác: nhập kho chỉ cần **≥ 1 mã**, xuất kho cần
 * **đủ số lượng đã nhập** — ảnh 29 ghi rõ *"Bạn cần quét đủ số lượng đã nhập
 * trước khi xác nhận ghi nhận."* và nút xác nhận **mờ** khi chưa đủ.
 *
 * ## Ngữ nghĩa tồn kho — nguyên văn từ banner
 *
 * | Ảnh | Nguyên văn | Nghĩa |
 * |:--:|---|---|
 * | 25 | *"Backend WMS sẽ tự resolve SKU/item theo QR/Barcode khi quét."* | **không nhập SKU** ở bước tạo phiếu |
 * | 29 | *"Ghi nhận chưa trừ tồn — Chỉ khi Post Issue thành công thì tồn kho mới giảm."* | ghi nhận ≠ trừ tồn |
 * | 35 | *"Tồn kho chỉ giảm sau khi duyệt/Post Issue."* | trừ tồn ở mốc **thứ ba** |
 *
 * Ba mốc y hệt luồng nhập, chỉ đổi chiều: **quét** → **ghi nhận** (chờ duyệt) →
 * **Post Issue** (trừ tồn).
 */

import {
  parseScanPayload,
  type ScanSource,
} from '../../scanner/scanPayload';

export type { ScanSource };

/** Bốn bước, cùng nhãn với luồng nhập (ảnh 25). */
export const OUTBOUND_STEPS = [
  'Thông tin',
  'Quét mã',
  'Kiểm tra',
  'Gửi duyệt',
] as const;

export type OutboundStep = 0 | 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Form thông tin phiếu — ảnh 25, 26, 27
// ---------------------------------------------------------------------------

export interface OutboundForm {
  /** *Tên phiếu / ghi nhớ* — **không** bắt buộc (ảnh 25 không có dấu sao). */
  readonly name: string;
  /** *Nhóm đối tượng xuất\** */
  readonly recipientGroup: string;
  /** *Tên người nhận / đơn vị\** */
  readonly recipientName: string;
  /** *Số điện thoại\** */
  readonly phone: string;
  /**
   * Kho xuất. **Không hiện trên form** (mô tả 2026-09-06) nhưng bắt buộc hợp lệ —
   * `warehouse_id` là trường bắt buộc của cả `resolve-code` lẫn `record`.
   */
  readonly warehouseId?: string;
  /** *Tỉnh/Thành phố\** — lưu **mã** tỉnh, không phải tên. */
  readonly province: string;
  /** Tên tỉnh để ghép địa chỉ và hiện lại. */
  readonly provinceName: string;
  /** *Phường/Xã\** — khoá cho tới khi chọn tỉnh (ảnh 26). Lưu **mã**. */
  readonly ward: string;
  /** Tên phường để ghép địa chỉ. */
  readonly wardName: string;
  /** *Địa chỉ chi tiết* — không bắt buộc. */
  readonly address: string;
  /** *Số lượng cần quét\** — ảnh 26 để mặc định `1`. */
  readonly quantity: string;
  /** *Ghi chú* — không bắt buộc. */
  readonly note: string;
}

export const initialOutboundForm: OutboundForm = {
  name: '',
  recipientGroup: '',
  recipientName: '',
  phone: '',
  province: '',
  provinceName: '',
  ward: '',
  wardName: '',
  address: '',
  quantity: '1',
  note: '',
};

export type OutboundFieldErrors = Partial<
  Record<keyof OutboundForm, string>
>;

/** Nguyên văn các câu lỗi quan sát được ở ảnh 27. */
/**
 * Bốn nhóm đối tượng xuất — mã và nhãn lấy từ mô tả luồng xuất người dùng cung
 * cấp 2026-09-06.
 *
 * ## ⚠️ Backend CHƯA có trường `recipient_type`
 *
 * Người dùng ghi rõ: nhóm này *"chưa được gửi thành trường recipient_type riêng
 * lên backend; nó được gộp vào note"*. Đối chiếu `OutboundRecordBatchInput`
 * (`scan.service.ts:257`) thì đúng — body chỉ có `name`, `warehouse_id`,
 * `recipient_name`, `recipient_address`, `recipient_contact_phone`, `note`,
 * `expected_total_qty`, `items`.
 *
 * ⇒ Giữ nguyên cách gộp vào `note`. **Không** tự đặt ra trường mới: gửi một
 * trường backend không khai là hoặc bị bỏ qua âm thầm, hoặc bị từ chối cả phiếu.
 *
 * 🟡 Đã ghi vào `USER-ACTION-REQUIRED.md` để backend cân nhắc thêm trường thật —
 * gộp vào `note` nghĩa là không lọc/thống kê theo nhóm được.
 */
export const RECIPIENT_GROUPS = [
  { value: 'DEALER', label: 'Đại Lý' },
  { value: 'DISTRIBUTOR', label: 'Nhà Phân Phối' },
  { value: 'CONSTRUCTION_CUSTOMER', label: 'Khách Công Trường' },
  { value: 'RETAIL_CUSTOMER', label: 'Khách Lẻ' },
] as const;

export function recipientGroupLabel(value: string): string | undefined {
  return RECIPIENT_GROUPS.find(group => group.value === value)?.label;
}

export const MESSAGE_GROUP_REQUIRED = 'Vui lòng chọn nhóm đối tượng xuất.';
export const MESSAGE_RECIPIENT_REQUIRED = 'Vui lòng nhập tên người nhận.';
export const MESSAGE_PHONE_REQUIRED = 'Vui lòng nhập số điện thoại.';
export const MESSAGE_PROVINCE_REQUIRED = 'Vui lòng chọn tỉnh/thành phố.';
export const MESSAGE_WARD_REQUIRED = 'Vui lòng chọn phường/xã.';
export const MESSAGE_QUANTITY_REQUIRED = 'Vui lòng nhập số lượng cần quét.';
export const MESSAGE_QUANTITY_INVALID = 'Số lượng phải là số nguyên lớn hơn 0.';

/**
 * Trần số lượng mỗi phiếu.
 *
 * Nguồn: mô tả luồng xuất 2026-09-06 — *"bắt buộc, từ 1 đến 1.000"*. Chặn ở
 * client để thủ kho biết ngay lúc nhập, thay vì quét được 300 mã rồi mới bị máy
 * chủ từ chối cả phiếu.
 */
export const MAX_OUTBOUND_QUANTITY = 1000;

export const MESSAGE_QUANTITY_TOO_LARGE =
  'Số lượng tối đa mỗi phiếu là ' + String(MAX_OUTBOUND_QUANTITY) + '.';

/**
 * Số điện thoại Việt Nam: **đúng 10 chữ số**, đầu số di động hợp lệ.
 *
 * Nguồn: mô tả luồng xuất 2026-09-06 — *"chỉ nhận đúng 10 chữ số bắt đầu bằng
 * 03, 05, 07, 08 hoặc 09"*.
 *
 * Vì sao chặt chứ không chỉ "có nhập gì đó": số này là **đường liên lạc duy
 * nhất** với người nhận khi hàng tới nơi mà không gặp được. Sai một chữ số thì
 * không ai biết cho tới lúc tài xế đứng trước cổng.
 */
export const PHONE_PREFIXES = ['03', '05', '07', '08', '09'] as const;

export const MESSAGE_PHONE_INVALID =
  'Số điện thoại phải có đúng 10 chữ số và bắt đầu bằng 03, 05, 07, 08 hoặc 09.';

export const MESSAGE_WAREHOUSE_REQUIRED = 'Chưa lấy được kho xuất từ WMS.';

/**
 * Bỏ mọi ký tự không phải chữ số, **ngay lúc gõ**.
 *
 * Người dùng hay dán số có dấu chấm, khoảng trắng hoặc `+84`. Lọc lúc gõ thì họ
 * thấy ngay kết quả; lọc lúc gửi thì họ thấy một lỗi khó hiểu về thứ mình
 * tưởng đã nhập đúng.
 *
 * ⚠️ Cắt ở 10 ký tự: `+84 912…` sau khi bỏ dấu cộng thành `84912…` — đó là số
 * SAI chứ không phải số đúng bị lỡ. Không tự chuyển đổi `+84` thành `0`: đoán
 * hộ ý người dùng ở một trường liên lạc là chỗ dễ tạo ra số không ai nghe máy.
 */
export function sanitisePhone(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 10);
}

export function isValidPhone(raw: string): boolean {
  const digits = raw.trim();
  if (!/^\d{10}$/.test(digits)) {
    return false;
  }
  return PHONE_PREFIXES.some(prefix => digits.startsWith(prefix));
}

/** Banner đỏ tổng ở đầu thẻ (ảnh 27) — đi kèm lỗi từng ô, không thay thế. */
export const MESSAGE_FORM_INVALID_TITLE = 'Không tạo được phiếu xuất';
export const MESSAGE_FORM_INVALID_BODY =
  'Vui lòng kiểm tra lại các trường bắt buộc trước khi quét.';

/**
 * Đọc số lượng.
 *
 * Trả `undefined` khi không phải số nguyên dương. Không dùng `parseInt` trực
 * tiếp: `parseInt('3 thùng')` cho `3`, và một phiếu xuất sai số lượng là hàng
 * giao thiếu hoặc thừa.
 */
export function parseQuantity(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }
  const value = Number(trimmed);
  return value > 0 ? value : undefined;
}

/** Số lượng có vượt trần không — tách khỏi `parseQuantity` để báo lỗi khác nhau. */
export function isQuantityTooLarge(raw: string): boolean {
  const value = parseQuantity(raw);
  return value !== undefined && value > MAX_OUTBOUND_QUANTITY;
}

export function validateOutboundForm(form: OutboundForm): OutboundFieldErrors {
  const errors: OutboundFieldErrors = {};

  if (form.recipientGroup.trim() === '') {
    errors.recipientGroup = MESSAGE_GROUP_REQUIRED;
  }
  if (form.recipientName.trim() === '') {
    errors.recipientName = MESSAGE_RECIPIENT_REQUIRED;
  }
  if (form.phone.trim() === '') {
    errors.phone = MESSAGE_PHONE_REQUIRED;
  } else if (!isValidPhone(form.phone)) {
    errors.phone = MESSAGE_PHONE_INVALID;
  }
  if (form.province.trim() === '') {
    errors.province = MESSAGE_PROVINCE_REQUIRED;
  }
  if (form.ward.trim() === '') {
    errors.ward = MESSAGE_WARD_REQUIRED;
  }
  if (form.quantity.trim() === '') {
    errors.quantity = MESSAGE_QUANTITY_REQUIRED;
  } else if (parseQuantity(form.quantity) === undefined) {
    errors.quantity = MESSAGE_QUANTITY_INVALID;
  } else if (isQuantityTooLarge(form.quantity)) {
    errors.quantity = MESSAGE_QUANTITY_TOO_LARGE;
  }

  // Kho xuất không hiện trên form (mô tả 2026-09-06: *"kho không hiển thị trên
  // form nhưng vẫn bắt buộc hợp lệ"*) — nhưng thiếu thì phiếu không gửi được,
  // nên vẫn phải chặn ở đây thay vì để lộ ra ở bước cuối.
  if ((form.warehouseId ?? '') === '') {
    errors.warehouseId = MESSAGE_WAREHOUSE_REQUIRED;
  }

  return errors;
}

export function hasFormErrors(errors: OutboundFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Đổi tỉnh thì **xoá phường đã chọn**.
 *
 * Ảnh 26 cho thấy Phường/Xã phụ thuộc Tỉnh. Giữ lại phường cũ sau khi đổi tỉnh
 * sẽ tạo ra địa chỉ không tồn tại — hàng giao sai nơi.
 */
export function setProvince(
  form: OutboundForm,
  province: string,
  provinceName = '',
): OutboundForm {
  if (province === form.province) {
    return form;
  }
  return { ...form, province, provinceName, ward: '', wardName: '' };
}

/**
 * Ghép địa chỉ gửi lên WMS.
 *
 * Thứ tự theo mô tả 2026-09-06: **địa chỉ chi tiết, phường/xã, tỉnh/thành**.
 * Bỏ phần rỗng để không sinh ra `", , Hà Nội"` — địa chỉ có dấu phẩy thừa trông
 * như dữ liệu hỏng và người giao hàng sẽ gọi hỏi lại.
 */
export function composeAddress(form: OutboundForm): string {
  return [form.address.trim(), form.wardName.trim(), form.provinceName.trim()]
    .filter(part => part !== '')
    .join(', ');
}

/** Phường/Xã chỉ bấm được sau khi có tỉnh (ảnh 26). */
export function isWardEnabled(form: OutboundForm): boolean {
  return form.province.trim() !== '';
}

// ---------------------------------------------------------------------------
// Phiếu nháp
// ---------------------------------------------------------------------------

/**
 * Trạng thái kiểm tra một mã với WMS.
 *
 * 🔧 Thêm 2026-09-06 khi đấu `outbound/resolve-code` (`GATE_WMS §2g`). Mô tả
 * luồng xuất: *"Mỗi mã gọi POST /outbound/resolve-code. App chặn mã trùng và mã
 * WMS trả về không đủ điều kiện xuất."*
 *
 * ## Vì sao có trạng thái `checking` thay vì chờ đồng bộ
 *
 * `resolve-code` chạy **một lần cho mỗi mã**. Chặn máy quét cho tới khi mạng
 * trả lời nghĩa là phiếu 200 mã phải chờ 200 lượt round-trip nối tiếp — thủ kho
 * đứng trước kệ hàng bấm quét rồi đợi, từng cái một.
 *
 * Nhận mã ngay rồi kiểm nền thì máy quét chạy liên tục, còn mã hỏng vẫn hiện ra
 * kèm lý do ở màn Kiểm tra — đúng chỗ người ta sẽ nhìn trước khi ghi nhận.
 */
export type OutboundCodeStatus = 'checking' | 'ok' | 'rejected';

export interface OutboundScannedCode {
  readonly key: string;
  readonly raw: string;
  readonly sku?: string;
  readonly item?: string;
  readonly status: OutboundCodeStatus;
  /** Vì sao bị từ chối. Chỉ có khi `status === 'rejected'`. */
  readonly reason?: string;
  /** Tên SKU từ WMS trả về, để hiện thay cho mã thô. */
  readonly skuName?: string;
  /**
   * Camera hay gõ tay — `record` bắt buộc `scan_source`.
   *
   * 🔧 Thêm 2026-09-06 cùng lúc với luồng nhập: máy trạng thái này cũng từng
   * đánh mất thông tin đó.
   */
  readonly source: ScanSource;
  readonly at: number;
}

export interface OutboundDraft {
  readonly form: OutboundForm;
  readonly fieldErrors: OutboundFieldErrors;
  readonly showFormError: boolean;
  /**
   * Mã phiên tạm trước khi WMS tạo chứng từ.
   *
   * Mini App tạo `local-outbound-<timestamp>` ngay sau khi người dùng bấm bắt
   * đầu quét. Không suy mã này từ tiến độ `N/M`: cùng một phiếu có thể quay lại
   * quét, xoá mã, rồi quét bù mà vẫn phải giữ đúng một phiên.
   */
  readonly localDocumentRef?: string;
  readonly codes: readonly OutboundScannedCode[];
  readonly step: OutboundStep;
}

export const initialOutboundDraft: OutboundDraft = {
  form: initialOutboundForm,
  fieldErrors: {},
  showFormError: false,
  codes: [],
  step: 0,
};

export function updateForm(
  draft: OutboundDraft,
  patch: Partial<OutboundForm>,
): OutboundDraft {
  const form = { ...draft.form, ...patch };
  // Sửa ô nào thì xoá lỗi của **ô đó**, giữ lỗi ô khác — cùng quy tắc màn Đăng nhập.
  const fieldErrors = { ...draft.fieldErrors };
  for (const key of Object.keys(patch) as (keyof OutboundForm)[]) {
    delete fieldErrors[key];
  }
  return { ...draft, form, fieldErrors };
}

/** Đổi tỉnh — dùng hàm riêng vì nó còn xoá phường. */
export function changeProvince(
  draft: OutboundDraft,
  province: string,
  provinceName = '',
): OutboundDraft {
  const form = setProvince(draft.form, province, provinceName);
  const fieldErrors = { ...draft.fieldErrors };
  delete fieldErrors.province;
  if (form.ward === '') {
    delete fieldErrors.ward;
  }
  return { ...draft, form, fieldErrors };
}

/**
 * Bấm *Tạo phiên và bắt đầu quét* (ảnh 26).
 *
 * Ảnh 27 cho thấy khi lỗi thì hiện **cả hai**: banner đỏ tổng ở đầu thẻ **và**
 * câu lỗi dưới từng ô. Không phải một trong hai.
 */
export function startScanning(draft: OutboundDraft): OutboundDraft {
  const errors = validateOutboundForm(draft.form);
  if (hasFormErrors(errors)) {
    return { ...draft, fieldErrors: errors, showFormError: true, step: 0 };
  }
  return {
    ...draft,
    fieldErrors: {},
    showFormError: false,
    step: 1,
    localDocumentRef: draft.localDocumentRef ?? generateLocalOutboundRef(),
  };
}

let localOutboundSequence = 0;

/** Cùng quy ước mã phiên tạm của Mini App trước khi gọi `outbound/record`. */
function generateLocalOutboundRef(): string {
  localOutboundSequence += 1;
  return (
    'local-outbound-' +
    String(Date.now()) +
    (localOutboundSequence === 1 ? '' : '-' + String(localOutboundSequence))
  );
}

// ---------------------------------------------------------------------------
// Quét
// ---------------------------------------------------------------------------

export function targetQuantity(draft: OutboundDraft): number {
  return parseQuantity(draft.form.quantity) ?? 0;
}

export function addOutboundCode(
  draft: OutboundDraft,
  raw: string,
  at: number,
  source: ScanSource = 'CAMERA',
): { readonly draft: OutboundDraft; readonly accepted: boolean } {
  const parsed = parseScanPayload(raw);
  const key = parsed.dedupeKey;

  if (draft.codes.some(code => code.key === key)) {
    return { draft, accepted: false };
  }

  // ⚠️ Quét **quá** số lượng vẫn được nhận, không chặn ở đây. Ảnh 29 chỉ chặn
  // chiều "chưa đủ"; chặn chiều "thừa" là thêm nghiệp vụ mà bộ ảnh không có, và
  // thủ kho quét nhầm một kiện thì cần thấy nó để gỡ ra, không phải bị nuốt im.
  return {
    draft: {
      ...draft,
      codes: [
        ...draft.codes,
        {
          key,
          raw: parsed.raw,
          sku: parsed.sku,
          item: parsed.item,
          source,
          at,
          status: 'checking',
        },
      ],
    },
    accepted: true,
  };
}

export function removeOutboundCode(
  draft: OutboundDraft,
  key: string,
): OutboundDraft {
  return { ...draft, codes: draft.codes.filter(code => code.key !== key) };
}

export interface OutboundCodeVerdict {
  readonly eligible: boolean;
  readonly reason?: string;
  readonly skuName?: string;
  readonly skuCode?: string;
  /** ITEM định danh vật lý WMS trả về, ưu tiên hơn ITEM có trong mã QR thô. */
  readonly itemUnique?: string;
}

/**
 * Ghi kết quả `resolve-code` vào một mã đã quét.
 *
 * Mã bị từ chối **vẫn nằm lại danh sách**, mang `status: 'rejected'` và lý do.
 * Xoá lặng đi thì thủ kho quét một kiện, nghe tiếng bíp, rồi thấy con số không
 * tăng — và không biết vì sao. Giữ lại kèm lý do là cách duy nhất họ biết phải
 * làm gì với kiện hàng đang cầm trên tay.
 */
export function settleOutboundCode(
  draft: OutboundDraft,
  key: string,
  verdict: OutboundCodeVerdict,
): OutboundDraft {
  return {
    ...draft,
    codes: draft.codes.map(code =>
      code.key === key
        ? {
            ...code,
            status: verdict.eligible ? 'ok' : 'rejected',
            reason: verdict.eligible ? undefined : verdict.reason,
            skuName: verdict.skuName ?? code.skuName,
            sku: verdict.skuCode ?? code.sku,
            item: verdict.itemUnique ?? code.item,
          }
        : code,
    ),
  };
}

/**
 * Mã được tính vào phiếu: mọi mã **chưa bị từ chối**.
 *
 * Mã đang `checking` vẫn được tính — nếu không, tiến độ sẽ tụt lùi mỗi lần
 * mạng chậm và thủ kho sẽ quét thừa để bù.
 */
export function acceptedCodes(
  draft: OutboundDraft,
): readonly OutboundScannedCode[] {
  return draft.codes.filter(code => code.status !== 'rejected');
}

export function rejectedCodes(
  draft: OutboundDraft,
): readonly OutboundScannedCode[] {
  return draft.codes.filter(code => code.status === 'rejected');
}

/** Còn mã nào đang chờ WMS trả lời không — dùng để khoá nút ghi nhận. */
export function hasPendingChecks(draft: OutboundDraft): boolean {
  return draft.codes.some(code => code.status === 'checking');
}

// ---------------------------------------------------------------------------
// Điều kiện ghi nhận — ảnh 29
// ---------------------------------------------------------------------------

/** Nguyên văn banner cam ở ảnh 29. */
export const MESSAGE_NOT_ENOUGH_TITLE = 'Chưa đủ số lượng';
export const MESSAGE_NOT_ENOUGH_BODY =
  'Bạn cần quét đủ số lượng đã nhập trước khi xác nhận ghi nhận.';

/** Nguyên văn banner info ở ảnh 29. */
export const MESSAGE_NOT_DEDUCTED_TITLE = 'Ghi nhận chưa trừ tồn';
export const MESSAGE_NOT_DEDUCTED_BODY =
  'Sau khi xác nhận, phiếu xuất chuyển sang chờ duyệt/Post Issue. Chỉ khi Post Issue thành công thì tồn kho mới giảm.';

/** Nguyên văn banner cam ở ảnh 35, sau khi ghi nhận. */
export const MESSAGE_NOT_ISSUED_TITLE = 'Chưa trừ tồn kho';
export const MESSAGE_NOT_ISSUED_BODY =
  'Bước này chỉ tạo phiếu xuất và lưu mã đã quét. Tồn kho chỉ giảm sau khi duyệt/Post Issue.';

/**
 * Đủ điều kiện ghi nhận chưa.
 *
 * Khác luồng nhập (chỉ cần ≥ 1 mã): xuất kho phải quét **đủ** số lượng đã nhập.
 */
/**
 * Đủ điều kiện ghi nhận chưa.
 *
 * Ba điều kiện, và cả ba đều cần:
 * 1. Có số lượng mục tiêu hợp lệ.
 * 2. Số mã **được chấp nhận** đạt mục tiêu — mã bị WMS từ chối không tính.
 * 3. **Không còn mã nào đang chờ** WMS trả lời. Gửi khi còn `checking` là gửi
 *    một phiếu mà chính app cũng chưa biết có hợp lệ không.
 */
export function canRecordOutbound(draft: OutboundDraft): boolean {
  const target = targetQuantity(draft);
  return (
    target > 0 &&
    acceptedCodes(draft).length >= target &&
    !hasPendingChecks(draft)
  );
}

export interface OutboundProgress {
  readonly scanned: number;
  readonly target: number;
  /** Chuỗi `"0/1"` như badge ở ảnh 28, 29. */
  readonly label: string;
}

export function outboundProgress(draft: OutboundDraft): OutboundProgress {
  const target = targetQuantity(draft);
  // Đếm mã ĐƯỢC CHẤP NHẬN, không đếm thô. Badge "5/5" trong khi có 2 mã bị WMS
  // từ chối là con số nói dối ở đúng chỗ thủ kho tin nhất.
  const scanned = acceptedCodes(draft).length;
  return { scanned, target, label: String(scanned) + '/' + String(target) };
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

export const OUTBOUND_OUTBOX_KIND = 'OUTBOUND_ISSUE_DRAFT';

export interface OutboundOutboxPayload {
  readonly name: string;
  readonly warehouseId?: string;
  readonly recipientGroup: string;
  readonly recipientName: string;
  readonly phone: string;
  /** Địa chỉ **đã ghép** — đúng chuỗi sẽ gửi lên `recipient_address`. */
  readonly recipientAddress: string;
  readonly province: string;
  readonly ward: string;
  readonly address: string;
  readonly quantity: number;
  /** Ghi chú **đã gộp** nhóm đối tượng — xem `RECIPIENT_GROUPS`. */
  readonly note: string;
  readonly codes: readonly {
    readonly raw: string;
    readonly sku?: string;
    readonly item?: string;
    readonly source?: ScanSource;
    readonly at: number;
  }[];
}

/**
 * Tên phiếu khi người dùng để trống.
 *
 * Mô tả 2026-09-06: *"Nếu để trống, app tự tạo tên `Phiếu xuất <thời gian>`"*.
 * Không để trống hẳn: `name` là thứ người duyệt nhìn thấy đầu tiên trong danh
 * sách, và một hàng không tên thì không phân biệt được với hàng khác.
 */
export function defaultOutboundName(at: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    'Phiếu xuất ' +
    pad(at.getHours()) +
    ':' +
    pad(at.getMinutes()) +
    ' ' +
    pad(at.getDate()) +
    '/' +
    pad(at.getMonth() + 1)
  );
}

/**
 * Ghi chú gửi lên, **đã gộp nhóm đối tượng**.
 *
 * Định dạng lấy nguyên từ mô tả 2026-09-06:
 * `Đối tượng xuất: Đại Lý · <ghi chú>`.
 */
export function composeNote(form: OutboundForm): string {
  const label = recipientGroupLabel(form.recipientGroup);
  const parts: string[] = [];
  if (label !== undefined) {
    parts.push('Đối tượng xuất: ' + label);
  }
  const note = form.note.trim();
  if (note !== '') {
    parts.push(note);
  }
  return parts.join(' · ');
}

/**
 * Dựng payload cho hàng đợi.
 *
 * ⚠️ Như luồng nhập: **không** tự sinh `Idempotency-Key`. Khoá do
 * `outbox.enqueue` sinh một lần và giữ nguyên qua mọi lần gửi lại.
 */
export function toOutboundPayload(
  draft: OutboundDraft,
  at: Date = new Date(),
): OutboundOutboxPayload {
  const name = draft.form.name.trim();
  return {
    name: name === '' ? defaultOutboundName(at) : name,
    warehouseId: draft.form.warehouseId,
    recipientGroup: draft.form.recipientGroup,
    recipientName: draft.form.recipientName.trim(),
    phone: draft.form.phone.trim(),
    recipientAddress: composeAddress(draft.form),
    province: draft.form.province,
    ward: draft.form.ward,
    address: draft.form.address.trim(),
    quantity: targetQuantity(draft),
    note: composeNote(draft.form),
    // CHỈ mã được chấp nhận. Gửi mã WMS đã từ chối lên `record` là để máy chủ
    // rollback cả lô — spec nói rõ lỗi một item huỷ toàn bộ transaction.
    codes: acceptedCodes(draft).map(code => ({
      raw: code.raw,
      sku: code.sku,
      item: code.item,
      source: code.source,
      at: code.at,
    })),
  };
}
