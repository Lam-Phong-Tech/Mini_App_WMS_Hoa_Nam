/**
 * Trạng thái và kiểm tra hợp lệ của form đăng nhập — tách khỏi React.
 *
 * Vì sao tách: Prompt 4 §F đòi *"unit test cho logic view model/state"*. Logic
 * nằm trong component thì chỉ test được qua render; nằm ở đây thì test thẳng.
 *
 * 🎨 Nguồn: ảnh 02–05 của bộ 47 ảnh.
 *
 * | Ảnh | Trạng thái | Điều quan sát được |
 * |:--:|---|---|
 * | 02 | `idle` | Hai ô trống, nút *Đăng nhập* |
 * | 03 | `invalid` | Viền đỏ **từng ô** + câu lỗi **dưới từng ô**: *"Vui lòng nhập email."* / *"Vui lòng nhập mật khẩu."* |
 * | 04 | `submitting` | Nút thành *"⟳ Đang xử lý…"* và **disabled**, kèm banner info *"Đang xác thực tài khoản"* |
 * | 05 | `failed` | Banner **đỏ** ở đầu thẻ, và nhãn nút đổi thành **"Thử lại"** |
 *
 * Ba chi tiết dễ bỏ sót nếu chỉ đọc code cũ, đều thấy rõ trong ảnh:
 * 1. Lỗi hiện ở **từng ô**, không gộp thành một câu chung.
 * 2. Ở trạng thái `failed`, **nhãn nút đổi** — không chỉ hiện thêm banner.
 * 3. Banner ở ảnh 04 nhắc *"Không đóng ứng dụng trong lúc xác thực"* — có lý do:
 *    đóng app giữa chừng để lại phiên dở dang (xem `tokenRefresh.recoverAfterRestart`).
 */

export type LoginPhase = 'idle' | 'submitting' | 'failed';

export interface LoginFieldErrors {
  readonly email?: string;
  readonly password?: string;
}

export interface LoginFormState {
  readonly email: string;
  readonly password: string;
  readonly phase: LoginPhase;
  readonly fieldErrors: LoginFieldErrors;
  /** Thông điệp cho banner đỏ ở đầu thẻ. Chỉ có nghĩa khi `phase === 'failed'`. */
  readonly formError?: string;
}

export const initialLoginForm: LoginFormState = {
  email: '',
  password: '',
  phase: 'idle',
  fieldErrors: {},
};

/** Nguyên văn từ ảnh 03. Không diễn đạt lại. */
export const MESSAGE_EMAIL_REQUIRED = 'Vui lòng nhập email.';
/** Nguyên văn từ AuthStatePage của Mini App hiện hành. */
export const MESSAGE_EMAIL_INVALID = 'Vui lòng nhập đúng định dạng email.';
export const MESSAGE_PASSWORD_REQUIRED = 'Vui lòng nhập mật khẩu.';

/**
 * Kiểm tra hợp lệ.
 *
 * Mini App hiện hành kiểm cả định dạng email. Phải dùng cùng regex và cùng câu
 * báo lỗi để người dùng không gặp hai kết quả khác nhau giữa web và native.
 */
export function validateLogin(state: LoginFormState): LoginFieldErrors {
  const errors: {
    email?: string;
    password?: string;
  } = {};
  if (state.email.trim() === '') {
    errors.email = MESSAGE_EMAIL_REQUIRED;
  } else if (!isValidLoginEmail(state.email)) {
    errors.email = MESSAGE_EMAIL_INVALID;
  }
  if (state.password === '') {
    errors.password = MESSAGE_PASSWORD_REQUIRED;
  }
  return errors;
}

export function isValidLoginEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

export function hasErrors(errors: LoginFieldErrors): boolean {
  return errors.email !== undefined || errors.password !== undefined;
}

// ---------------------------------------------------------------------------
// Chuyển trạng thái
// ---------------------------------------------------------------------------

export function setEmail(
  state: LoginFormState,
  email: string,
): LoginFormState {
  // Gõ lại thì xoá lỗi của **chính ô đó**, giữ lỗi ô kia. Xoá cả hai sẽ khiến
  // câu lỗi dưới ô mật khẩu biến mất khi người dùng mới chỉ sửa email.
  return {
    ...state,
    email,
    fieldErrors: { ...state.fieldErrors, email: undefined },
  };
}

export function setPassword(
  state: LoginFormState,
  password: string,
): LoginFormState {
  return {
    ...state,
    password,
    fieldErrors: { ...state.fieldErrors, password: undefined },
  };
}

/**
 * Bấm gửi.
 *
 * Trả về `{ next, canSubmit }` thay vì tự gọi mạng: quyết định gọi hay không
 * thuộc về màn hình, còn tệp này chỉ giữ trạng thái.
 */
export function beginSubmit(state: LoginFormState): {
  readonly next: LoginFormState;
  readonly canSubmit: boolean;
} {
  // Chống double submit (Prompt 4 §A): đang gửi thì bấm thêm không làm gì.
  if (state.phase === 'submitting') {
    return { next: state, canSubmit: false };
  }

  const errors = validateLogin(state);
  if (hasErrors(errors)) {
    return {
      next: { ...state, fieldErrors: errors, phase: 'idle', formError: undefined },
      canSubmit: false,
    };
  }
  return {
    next: { ...state, fieldErrors: {}, phase: 'submitting', formError: undefined },
    canSubmit: true,
  };
}

export function failSubmit(
  state: LoginFormState,
  message: string,
): LoginFormState {
  // Mini App giữ nguyên mật khẩu khi request thất bại để người dùng sửa thông
  // tin cần thiết thay vì phải gõ lại cả hai trường.
  return {
    ...state,
    phase: 'failed',
    formError: message,
    fieldErrors: {},
  };
}

export function resetAfterSuccess(): LoginFormState {
  // Không giữ lại gì — nhất là mật khẩu.
  return initialLoginForm;
}

/** Nhãn nút theo trạng thái. Ảnh 04 và 05 cho thấy nhãn **đổi**, không cố định. */
export function submitLabel(phase: LoginPhase): string {
  switch (phase) {
    case 'submitting':
      return 'Đang xử lý…';
    case 'failed':
      return 'Thử lại';
    default:
      return 'Đăng nhập';
  }
}
