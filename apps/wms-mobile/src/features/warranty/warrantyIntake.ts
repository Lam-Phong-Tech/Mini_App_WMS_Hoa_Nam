/**
 * Hồ sơ bảo hành đang tiếp nhận — máy trạng thái, tách khỏi React.
 *
 * 🎨 Nguồn: ảnh **41, 42, 43**.
 *
 * ```
 * Nhập/quét mã (41) → Chọn bệnh lỗi (42) → Mô tả và phụ kiện (43)
 * ```
 *
 * ## Hai nhánh, một máy trạng thái
 *
 * | Nhánh | Khi nào | Gửi lên WMS |
 * |---|---|---|
 * | **Có mã** | `resolve-code` trả `eligible_for_warranty = true` | `item_code` |
 * | **Mất mã** | không đủ điều kiện, hoặc bấm *"Mất tem/mã"* | `missing_code_reason` + `manual_product_description` |
 *
 * Ảnh 43 cho thấy ô *Lý do thiếu mã* ở trạng thái **readonly** với giá trị
 * *"Mất tem/mã"* — tức là nhánh này được chọn từ trước, không phải gõ vào lúc đó.
 *
 * ## 🐞 Lỗi của Mini App KHÔNG port sang
 *
 * Người dùng chỉ ra: nhánh *"mất mã"* của app cũ **đánh rơi**
 * `accessories_received` và `received_condition` vì hàm chuẩn hoá payload chỉ
 * giữ chúng ở nhánh có `item_code`. Hồ sơ tạm là loại hay có tranh chấp nhất —
 * mất thông tin phụ kiện nhận kèm ở đúng đó là mất nó ở chỗ cần nhất.
 *
 * `toCreateInput()` dưới đây giữ hai trường ở **cả hai** nhánh.
 */

import {
  isValidPhone,
  sanitisePhone,
  MESSAGE_PHONE_INVALID,
  MESSAGE_PHONE_REQUIRED,
  MESSAGE_PROVINCE_REQUIRED,
  MESSAGE_WARD_REQUIRED,
} from '../outbound/outboundDraft';
import type { CreateWarrantyCaseInput } from '../../services/wms/warrantyWrite';

/** Ba bước của stepper, đúng nhãn ảnh 41. */
export const WARRANTY_INTAKE_STEPS = [
  'Nhập/quét mã',
  'Chọn bệnh lỗi',
  'Mô tả',
] as const;

export type IntakeStep = 0 | 1 | 2;

/** Lý do thiếu mã — ảnh 43 hiện readonly *"Mất tem/mã"*. */
export const MISSING_CODE_REASONS = [
  { value: 'LOST_LABEL', label: 'Mất tem/mã' },
  { value: 'UNREADABLE', label: 'Tem mờ, không đọc được' },
  { value: 'NOT_ELIGIBLE', label: 'Mã không đủ điều kiện bảo hành' },
] as const;

export function missingReasonLabel(value: string): string | undefined {
  return MISSING_CODE_REASONS.find(item => item.value === value)?.label;
}

export interface DefectOption {
  readonly id: string;
  readonly code?: string;
  readonly name: string;
}

export interface WarrantyIntakeDraft {
  readonly step: IntakeStep;

  /** Nhánh có mã. Rỗng ⇒ nhánh mất mã. */
  readonly itemCode: string;
  /** Tên sản phẩm WMS trả về sau `resolve-code`, chỉ để hiển thị. */
  readonly resolvedProductName?: string;
  readonly missingCodeReason: string;
  readonly manualProductDescription: string;

  readonly customerName: string;
  readonly customerPhone: string;
  readonly province: string;
  readonly provinceName: string;
  readonly ward: string;
  readonly wardName: string;
  readonly street: string;

  readonly defectIds: readonly string[];
  readonly description: string;
  readonly accessoriesReceived: string;
  readonly receivedCondition: string;

  readonly errors: Readonly<Record<string, string>>;
  readonly showStepError: boolean;
}

export const initialIntakeDraft: WarrantyIntakeDraft = {
  step: 0,
  itemCode: '',
  missingCodeReason: '',
  manualProductDescription: '',
  customerName: '',
  customerPhone: '',
  province: '',
  provinceName: '',
  ward: '',
  wardName: '',
  street: '',
  defectIds: [],
  description: '',
  accessoriesReceived: '',
  receivedCondition: '',
  errors: {},
  showStepError: false,
};

/** Hồ sơ này đi theo nhánh mất mã hay có mã. */
export function isMissingCode(draft: WarrantyIntakeDraft): boolean {
  return draft.itemCode.trim() === '';
}

// ---------------------------------------------------------------------------
// Câu lỗi
// ---------------------------------------------------------------------------

export const MESSAGE_NAME_REQUIRED = 'Vui lòng nhập tên khách hàng.';
/** Mô tả 2026-09-06: *"Tên khách hàng: bắt buộc, tối thiểu 2 ký tự."* */
export const MIN_CUSTOMER_NAME_LENGTH = 2;
export const MESSAGE_NAME_TOO_SHORT =
  'Tên khách hàng phải có ít nhất ' +
  String(MIN_CUSTOMER_NAME_LENGTH) +
  ' ký tự.';
export const MESSAGE_PRODUCT_REQUIRED =
  'Mất tem/mã thì phải mô tả sản phẩm để nhận diện.';
export const MESSAGE_REASON_REQUIRED = 'Vui lòng chọn lý do thiếu mã.';
export const MESSAGE_DESCRIPTION_REQUIRED = 'Vui lòng mô tả yêu cầu bảo hành.';

export const MESSAGE_STEP_INVALID_TITLE = 'Chưa tạo được hồ sơ';
export const MESSAGE_STEP_INVALID_BODY =
  'Vui lòng kiểm tra lại các trường bắt buộc.';

// ---------------------------------------------------------------------------
// Kiểm tra từng bước
// ---------------------------------------------------------------------------

/**
 * Bước 1 — mã và thông tin khách.
 *
 * Kiểm **cả cụm** rồi trả về hết lỗi cùng lúc, không dừng ở lỗi đầu: form này
 * dài, và bắt người dùng sửa từng lỗi một là bắt họ cuộn lên xuống nhiều lần.
 */
export function validateStep1(
  draft: WarrantyIntakeDraft,
): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};

  if (isMissingCode(draft)) {
    if (draft.missingCodeReason.trim() === '') {
      errors.missingCodeReason = MESSAGE_REASON_REQUIRED;
    }
    if (draft.manualProductDescription.trim() === '') {
      errors.manualProductDescription = MESSAGE_PRODUCT_REQUIRED;
    }
  }

  const name = draft.customerName.trim();
  if (name === '') {
    errors.customerName = MESSAGE_NAME_REQUIRED;
  } else if (name.length < MIN_CUSTOMER_NAME_LENGTH) {
    errors.customerName = MESSAGE_NAME_TOO_SHORT;
  }

  if (draft.customerPhone.trim() === '') {
    errors.customerPhone = MESSAGE_PHONE_REQUIRED;
  } else if (!isValidPhone(draft.customerPhone)) {
    errors.customerPhone = MESSAGE_PHONE_INVALID;
  }

  if (draft.province.trim() === '') {
    errors.province = MESSAGE_PROVINCE_REQUIRED;
  }
  if (draft.ward.trim() === '') {
    errors.ward = MESSAGE_WARD_REQUIRED;
  }

  return errors;
}

/**
 * Bước 2 — **không chặn**. Bệnh lỗi là tuỳ chọn.
 *
 * ## 🔴 Vì sao bỏ luật "chọn ít nhất một bệnh lỗi"
 *
 * Bản port từng bắt buộc chọn. Chạy thật ngày 2026-09-06 trên môi trường
 * dev-test cho thấy đó là **ngõ cụt tuyệt đối**:
 *
 * | Đo được | Kết quả |
 * |---|---|
 * | `GET /api/v1/defects?status=ACTIVE` | HTTP 200, danh sách **rỗng** |
 * | Bấm "Tiếp tục" ở bước 2 | *"Chọn ít nhất một bệnh lỗi."* |
 *
 * Danh mục rỗng + bắt buộc chọn = **không hồ sơ bảo hành nào tạo được**, dù
 * khách đã mang máy tới quầy.
 *
 * ## Luật đúng lấy từ đâu
 *
 * Không phải tôi tự quyết. Mini App gốc — thứ đang được port — cho bệnh lỗi là
 * tuỳ chọn, và nói thẳng với người dùng như vậy:
 *
 * | Nguồn | Bằng chứng |
 * |---|---|
 * | `src/services/warranty-flow.service.ts:71` | `defect_ids?: string[]` — dấu `?` |
 * | `src/services/warranty-flow.service.ts:497` | bỏ hẳn khoá khi mảng rỗng |
 * | `src/pages/WarrantyReceivePage/index.tsx:482` | *"Bạn vẫn có thể nhập mô tả thủ công."* |
 *
 * Mini App gốc **không có** kiểm tra nào bắt chọn bệnh lỗi.
 *
 * Thứ mang thông tin lỗi thật sự là `description` ở bước 3 — và đó vẫn là
 * trường bắt buộc (xem {@link validateStep3}).
 */
export function validateStep2(
  _draft: WarrantyIntakeDraft,
): Readonly<Record<string, string>> {
  return {};
}

/** Bước 3 — mô tả bắt buộc; phụ kiện và tình trạng tuỳ chọn. */
export function validateStep3(
  draft: WarrantyIntakeDraft,
): Readonly<Record<string, string>> {
  return draft.description.trim() === ''
    ? { description: MESSAGE_DESCRIPTION_REQUIRED }
    : {};
}

export function validateStep(
  draft: WarrantyIntakeDraft,
): Readonly<Record<string, string>> {
  if (draft.step === 0) {
    return validateStep1(draft);
  }
  return draft.step === 1 ? validateStep2(draft) : validateStep3(draft);
}

export function hasErrors(errors: Readonly<Record<string, string>>): boolean {
  return Object.keys(errors).length > 0;
}

// ---------------------------------------------------------------------------
// Chuyển bước
// ---------------------------------------------------------------------------

export function updateIntake(
  draft: WarrantyIntakeDraft,
  patch: Partial<WarrantyIntakeDraft>,
): WarrantyIntakeDraft {
  const errors = { ...draft.errors };
  // Sửa ô nào thì xoá lỗi ô đó, giữ lỗi ô khác — cùng quy tắc màn xuất kho.
  for (const key of Object.keys(patch)) {
    delete errors[key];
  }
  return { ...draft, ...patch, errors };
}

/** Đổi tỉnh thì xoá phường — địa chỉ lai hai tỉnh là hàng giao sai nơi. */
export function setIntakeProvince(
  draft: WarrantyIntakeDraft,
  province: string,
  provinceName = '',
): WarrantyIntakeDraft {
  if (province === draft.province) {
    return draft;
  }
  return updateIntake(draft, { province, provinceName, ward: '', wardName: '' });
}

/** Bật/tắt một bệnh lỗi. Ảnh 42 cho chọn **nhiều**. */
export function toggleDefect(
  draft: WarrantyIntakeDraft,
  defectId: string,
): WarrantyIntakeDraft {
  const next = draft.defectIds.includes(defectId)
    ? draft.defectIds.filter(id => id !== defectId)
    : [...draft.defectIds, defectId];
  return updateIntake(draft, { defectIds: next });
}

export function nextStep(draft: WarrantyIntakeDraft): WarrantyIntakeDraft {
  const errors = validateStep(draft);
  if (hasErrors(errors)) {
    return { ...draft, errors, showStepError: true };
  }
  const step = Math.min(draft.step + 1, 2) as IntakeStep;
  return { ...draft, step, errors: {}, showStepError: false };
}

export function previousStep(draft: WarrantyIntakeDraft): WarrantyIntakeDraft {
  const step = Math.max(draft.step - 1, 0) as IntakeStep;
  return { ...draft, step, showStepError: false };
}

export function canSubmit(draft: WarrantyIntakeDraft): boolean {
  return (
    !hasErrors(validateStep1(draft)) &&
    !hasErrors(validateStep2(draft)) &&
    !hasErrors(validateStep3(draft))
  );
}

// ---------------------------------------------------------------------------
// Gửi lên WMS
// ---------------------------------------------------------------------------

/**
 * Ghép địa chỉ: **số nhà, phường/xã, tỉnh/thành** — đúng thứ tự mô tả
 * 2026-09-06. Bỏ phần rỗng để không sinh dấu phẩy thừa.
 */
export function composeCustomerAddress(draft: WarrantyIntakeDraft): string {
  return [draft.street.trim(), draft.wardName.trim(), draft.provinceName.trim()]
    .filter(part => part !== '')
    .join(', ');
}

/**
 * Dựng payload gửi WMS.
 *
 * 🐞 **Phụ kiện và tình trạng gửi ở CẢ HAI nhánh** — xem chú thích đầu tệp.
 */
export function toCreateInput(
  draft: WarrantyIntakeDraft,
): CreateWarrantyCaseInput {
  const missing = isMissingCode(draft);
  return {
    ...(missing
      ? {
          missingCodeReason: draft.missingCodeReason,
          manualProductDescription: draft.manualProductDescription.trim(),
        }
      : { itemCode: draft.itemCode.trim() }),
    customerName: draft.customerName.trim(),
    customerPhone: sanitisePhone(draft.customerPhone),
    customerAddress: composeCustomerAddress(draft),
    description: draft.description.trim(),
    defectIds: draft.defectIds,
    accessoriesReceived: draft.accessoriesReceived.trim(),
    receivedCondition: draft.receivedCondition.trim(),
  };
}

/**
 * Vân tay 64-bit của một chuỗi (FNV-1a, hai làn 32-bit ghép lại).
 *
 * Đủ để phân biệt nội dung hồ sơ; **không** dùng cho mục đích an ninh.
 */
function fingerprint(text: string): string {
  /* eslint-disable no-bitwise -- hàm băm thì phải dùng phép toán bit. */
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ ((c << 5) | (c >>> 3)), 0x85ebca6b) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
  /* eslint-enable no-bitwise */
}

/**
 * Khoá idempotency của một lần tạo hồ sơ — **vân tay của toàn bộ nội dung**.
 *
 * ## 🔴 Bản trước sai ở đâu
 *
 * Khoá cũ là `số điện thoại + '-' + độ dài mô tả`. Đo thật 2026-09-06, một lần
 * tạo hồ sơ gửi lên `wmshn-wcase-0987001122-53`. Hai vấn đề:
 *
 * | Vấn đề | Hậu quả |
 * |---|---|
 * | Độ dài mô tả không phân biệt được nội dung | Cùng khách, **hai máy khác nhau**, hai mô tả **tình cờ dài bằng nhau** ⇒ **trùng khoá**. WMS coi hồ sơ thứ hai là bấm lại và **nuốt** nó. Thủ kho thấy "đã tạo" nhưng máy thứ hai không có hồ sơ. |
 * | Số điện thoại khách nằm trong header | PII của khách đi vào header HTTP và log máy chủ, không cần thiết. |
 *
 * Bản này băm **toàn bộ payload đã chuẩn hoá**: khác một ký tự bất kỳ là khác
 * khoá, và không lộ dữ liệu khách.
 *
 * ## ⚠️ Câu hỏi nghiệp vụ còn treo
 *
 * Khoá suy từ nội dung nghĩa là: cùng khách mang **đúng máy đó, đúng lỗi đó**
 * quay lại lần hai (ví dụ sửa xong vẫn hỏng) sẽ ra **cùng khoá** ⇒ WMS không
 * tạo hồ sơ thứ hai. Có muốn vậy không là **quyết định nghiệp vụ**, chưa chốt —
 * xem `docs/migration/04-live-run-report.md`.
 */
export function intakeIdempotencyKey(payload: CreateWarrantyCaseInput): string {
  return 'wmshn-wcase-' + fingerprint(JSON.stringify(payload));
}
