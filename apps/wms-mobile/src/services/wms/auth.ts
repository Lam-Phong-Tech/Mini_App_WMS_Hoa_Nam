import { decodeAuthResult } from './profile';
/**
 * Đăng nhập / đăng xuất WMS.
 *
 * 🔓 Ba đường auth nằm trong ngoại lệ `GATE_WMS §2c` nên **luồng này chạy thật**,
 * không phải khung rỗng. Đây là lý do màn Đăng nhập của Prompt 4 đạt được yêu
 * cầu *"đã kết nối implementation thật"* mà không cần nới thêm gì.
 *
 * Số đo thật trên staging 2026-09-05 (§4h.2):
 * - `access_token` — JWT HS256, 373–376 ký tự
 * - `expires_in` — **giây**, trả kèm mọi phản hồi ⇒ không decode JWT, không đoán TTL
 * - `refresh_token` — 86 ký tự base64url, **không** phải JWT
 *
 * ⚠️ Đăng nhập sai trả **401** kèm thông điệp tiếng Việt của server:
 * *"Email, tài khoản hoặc mật khẩu không đúng."* — quan sát trong console khi
 * khảo sát ngày 2026-09-05. Không tự viết lại câu này; hiển thị câu của server.
 */

import { AppError } from '../../errors/AppError';
import { apiClient } from '../../api/client';
import {
  serverNow,
  recordServerTime,
  readServerTimestamp,
} from '../../auth/serverClock';
import {
  clearRefreshInFlight,
  clearSession,
  clearPersistedSession,
  persistSession,
  getSession,
  getSessionGeneration,
  type Session,
} from '../../auth/session';
import { clearSecureRefreshToken } from '../../auth/secureRefreshToken';
import { usesCookieTokenTransport } from '../../auth/tokenTransport';
import {
  parseRefreshPayload,
  sessionFromRefresh,
} from '../../auth/tokenRefresh';

export const LOGIN_PATH = '/api/v1/auth/login';
export const MFA_VERIFY_PATH = '/api/v1/auth/mfa/verify';
export const LOGOUT_PATH = '/api/v1/auth/logout';
export const FORGOT_PASSWORD_PATH = '/api/v1/auth/forgot-password';
export const VERIFY_OTP_PATH = '/api/v1/auth/verify-otp';
export const RESET_PASSWORD_PATH = '/api/v1/auth/reset-password';

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

export class MfaRequiredError extends Error {
  readonly code = 'MFA_REQUIRED';
  readonly expiresIn: number;
  readonly mfaToken!: string;

  constructor(mfaToken: string, expiresIn: number) {
    super('Cần xác thực hai bước.');
    this.name = 'MfaRequiredError';
    this.expiresIn = expiresIn;
    // Challenge là credential sống ngắn; giữ trong RAM nhưng không để logger/
    // JSON.stringify vô tình phát tán nó.
    Object.defineProperty(this, 'mfaToken', {
      value: mfaToken,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }
}

export function isMfaRequiredError(error: unknown): error is MfaRequiredError {
  return error instanceof MfaRequiredError;
}

function readMfaChallenge(raw: unknown): MfaRequiredError | undefined {
  const data = authResponseData<Record<string, unknown>>(raw, LOGIN_PATH);
  if (data?.mfa_required !== true) return undefined;
  if (
    typeof data.mfa_token !== 'string' ||
    data.mfa_token.length === 0 ||
    data.mfa_token.length > 128 ||
    !Number.isSafeInteger(data.expires_in) ||
    Number(data.expires_in) <= 0
  )
    throw new AppError({
      kind: 'parse',
      route: LOGIN_PATH,
      message: 'Phản hồi xác thực hai bước chưa hợp lệ.',
    });
  return new MfaRequiredError(data.mfa_token, Number(data.expires_in));
}

function readAuthSessionMetadata(raw: unknown): Partial<Session> {
  const data = authResponseData<Record<string, unknown>>(raw, LOGIN_PATH),
    user =
      data.user && typeof data.user === 'object' && !Array.isArray(data.user)
        ? (data.user as Record<string, unknown>)
        : {},
    text = (value: unknown) =>
      typeof value === 'string' && value.trim() ? value.trim() : undefined,
    userId = text(user.id ?? user.user_id),
    authSessionId = text(user.auth_session_id),
    activeWarehouseId = text(user.active_warehouse_id),
    userName = text(user.name ?? user.display_name ?? user.email),
    avatarUrl = text(user.avatar_url),
    mustChange =
      data.must_change_password === true || user.must_change_password === true;
  return {
    ...(userId ? { userId } : {}),
    ...(authSessionId ? { authSessionId } : {}),
    ...(activeWarehouseId ? { activeWarehouseId } : {}),
    ...(userName ? { userName } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(mustChange ? { mustChangePassword: true } : {}),
  };
}

export interface LoginDeps {
  /** Tách ra để test không cần mạng. Mặc định dùng client thật. */
  readonly post?: (
    path: string,
    body: unknown,
    options?: { headers: Record<string, string> },
  ) => Promise<unknown>;
  readonly now?: () => number;
}
export type LogoutOutcome = {
  readonly kind: 'server-confirmed' | 'local-only';
  readonly requestId?: string;
  readonly scope?: string;
};
const logoutListeners = new Set<(result: LogoutOutcome) => void>();
let logoutSequence = 0;
export function subscribeLogoutOutcome(
  listener: (result: LogoutOutcome) => void,
): () => void {
  logoutListeners.add(listener);
  return () => {
    logoutListeners.delete(listener);
  };
}

export interface PasswordRecoveryDeps {
  /** Tiêm POST để kiểm thử mà không gửi OTP thật. */
  readonly post?: (path: string, body: unknown) => Promise<unknown>;
  /** Sau reset thành công phải xoá access metadata và refresh credential cũ. */
  readonly clearLocalSession?: () => Promise<void>;
}

function normalizeRecoveryEmail(email: string, route: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AppError({
      kind: 'config',
      route,
      message: 'Email không hợp lệ.',
    });
  }
  return normalized;
}

async function defaultPost(path: string, body: unknown): Promise<unknown> {
  const response = await apiClient.request<unknown>({
    path,
    method: 'POST',
    body,
  });
  return response.data;
}

function authResponseData<T>(raw: unknown, path: string): T {
  if (typeof raw !== 'object' || raw === null) {
    throw new AppError({
      kind: 'parse',
      route: path,
      message: 'Phản hồi xác thực không hợp lệ.',
    });
  }
  const envelope = raw as {
    success?: unknown;
    data?: unknown;
    message?: unknown;
  };
  if (envelope.success === false) {
    throw new AppError({
      kind: 'http',
      route: path,
      message:
        typeof envelope.message === 'string'
          ? envelope.message
          : 'Máy chủ từ chối yêu cầu xác thực.',
    });
  }
  return envelope.data as T;
}

/** Gửi email OTP đặt lại mật khẩu. Chỉ được gọi khi người dùng bấm gửi. */
export async function forgotPassword(
  email: string,
  deps: PasswordRecoveryDeps = {},
): Promise<void> {
  const normalized = normalizeRecoveryEmail(email, FORGOT_PASSWORD_PATH);
  const raw = await (deps.post ?? defaultPost)(FORGOT_PASSWORD_PATH, {
    email: normalized,
  });
  authResponseData<unknown>(raw, FORGOT_PASSWORD_PATH);
}

export interface VerifyOtpResult {
  readonly reset_token: string;
  readonly expires_in: number;
}

/** Xác thực OTP và giữ reset token chỉ trong state bộ nhớ của flow. */
export async function verifyPasswordOtp(
  email: string,
  otp: string,
  deps: PasswordRecoveryDeps = {},
): Promise<VerifyOtpResult> {
  const normalized = normalizeRecoveryEmail(email, VERIFY_OTP_PATH);
  const normalizedOtp = otp.trim();
  if (!/^\d{6}$/.test(normalizedOtp)) {
    throw new AppError({
      kind: 'config',
      route: VERIFY_OTP_PATH,
      message: 'Mã OTP phải gồm đúng 6 chữ số.',
    });
  }
  const raw = await (deps.post ?? defaultPost)(VERIFY_OTP_PATH, {
    email: normalized,
    otp: normalizedOtp,
  });
  const data = authResponseData<VerifyOtpResult>(raw, VERIFY_OTP_PATH);
  if (
    typeof data?.reset_token !== 'string' ||
    data.reset_token.trim() === '' ||
    !Number.isSafeInteger(data.expires_in) ||
    data.expires_in <= 0
  ) {
    throw new AppError({
      kind: 'parse',
      route: VERIFY_OTP_PATH,
      message: 'WMS không trả reset_token sau khi xác thực OTP.',
    });
  }
  return data;
}

/** Đặt mật khẩu mới; không lưu mật khẩu/reset token vào storage hay log. */
export async function resetPassword(
  input: {
    email: string;
    resetToken: string;
    newPassword: string;
    newPasswordConfirmation: string;
  },
  deps: PasswordRecoveryDeps = {},
): Promise<void> {
  const normalizedEmail = normalizeRecoveryEmail(input.email, RESET_PASSWORD_PATH);
  const passwordLength = Array.from(input.newPassword).length;
  if (input.newPassword !== input.newPassword.trim()) {
    throw new AppError({
      kind: 'config',
      route: RESET_PASSWORD_PATH,
      message: 'Mật khẩu mới không được có khoảng trắng ở đầu hoặc cuối.',
    });
  }
  if (passwordLength < 8 || passwordLength > 128) {
    throw new AppError({
      kind: 'config',
      route: RESET_PASSWORD_PATH,
      message: 'Mật khẩu mới phải có từ 8 đến 128 ký tự.',
    });
  }
  if (!/[a-z]/.test(input.newPassword) || !/[A-Z]/.test(input.newPassword)) {
    throw new AppError({
      kind: 'config',
      route: RESET_PASSWORD_PATH,
      message: 'Mật khẩu mới phải có chữ thường và chữ hoa.',
    });
  }
  if (!/[^A-Za-z0-9\s]/.test(input.newPassword)) {
    throw new AppError({
      kind: 'config',
      route: RESET_PASSWORD_PATH,
      message: 'Mật khẩu mới phải có ít nhất một ký tự đặc biệt.',
    });
  }
  if (input.newPassword !== input.newPasswordConfirmation) {
    throw new AppError({
      kind: 'config',
      route: RESET_PASSWORD_PATH,
      message: 'Mật khẩu xác nhận không khớp.',
    });
  }
  if (input.resetToken.trim() === '') {
    throw new AppError({
      kind: 'config',
      route: RESET_PASSWORD_PATH,
      message: 'Phiên đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
    });
  }
  const generation = getSessionGeneration();
  const raw = await (deps.post ?? defaultPost)(RESET_PASSWORD_PATH, {
    email: normalizedEmail,
    reset_token: input.resetToken,
    new_password: input.newPassword,
    new_password_confirmation: input.newPasswordConfirmation,
  });
  authResponseData<unknown>(raw, RESET_PASSWORD_PATH);
  if(getSessionGeneration()===generation)
    await (deps.clearLocalSession ?? clearPersistedSession)();
}

/**
 * Đăng nhập và lưu phiên.
 *
 * ⚠️ **Mật khẩu chỉ đi qua đây một lần và không được lưu ở đâu cả.** Không ghi
 * vào storage, không ghi vào log, không giữ trong state sau khi gọi xong. Tầng
 * `logger` đã có bộ lọc token, nhưng cách chắc chắn nhất là không đưa nó tới đó.
 */
export async function login(
  credentials: Credentials,
  deps: LoginDeps = {},
): Promise<Session> {
  const attempt = ++logoutSequence;
  const generation = getSessionGeneration();
  const accepts = () =>
    attempt === logoutSequence && generation === getSessionGeneration();
  const stale = () =>
    new AppError({
      kind: 'cancelled',
      code: 'STALE_AUTH_RESPONSE',
      message: 'Yêu cầu đăng nhập đã được thay thế.',
    });
  const post = deps.post ?? defaultPost;
  const now = deps.now ?? (() => Date.now());

  const raw = await post(LOGIN_PATH, {
    email: credentials.email,
    password: credentials.password,
  });
  if (!accepts()) throw stale();

  recordServerTime(readServerTimestamp(raw), now());
  const challenge = readMfaChallenge(raw);
  if (challenge) throw challenge;
  const payload = parseRefreshPayload(raw);
  const session = {
    ...sessionFromRefresh(payload, serverNow(now())),
    ...readAuthSessionMetadata(raw),
  };

  // Xoá dấu gia hạn dở dang của phiên TRƯỚC: đăng nhập mới làm nó vô nghĩa, và
  // để sót lại sẽ khiến lần mở app sau ép đăng nhập lại một cách vô lý.
  clearRefreshInFlight();
  // Refresh token đi vào Android Keystore trước; MMKV không giữ credential dài hạn.
  await persistSession(session, generation, accepts);
  if (
    attempt !== logoutSequence ||
    getSession()?.accessToken !== session.accessToken
  )
    throw stale();
  return session;
}

/** Hoàn tất bước 2. Challenge/code chỉ tồn tại trong bộ nhớ của màn login. */
export async function verifyMfaLogin(
  input: { mfaToken: string; code: string },
  deps: LoginDeps = {},
): Promise<Session> {
  const mfaToken = input.mfaToken.trim(),
    code = input.code.trim();
  if (!mfaToken || mfaToken.length > 128)
    throw new AppError({
      kind: 'config',
      route: MFA_VERIFY_PATH,
      code: 'MFA_CHALLENGE_INVALID',
      message: 'Phiên xác thực hai bước không hợp lệ hoặc đã hết hạn.',
    });
  if (!code || code.length > 16)
    throw new AppError({
      kind: 'config',
      route: MFA_VERIFY_PATH,
      code: 'MFA_CODE_INVALID',
      message: 'Nhập mã xác thực hoặc mã khôi phục hợp lệ.',
    });

  const attempt = ++logoutSequence,
    generation = getSessionGeneration(),
    accepts = () =>
      attempt === logoutSequence && generation === getSessionGeneration(),
    stale = () =>
      new AppError({
        kind: 'cancelled',
        code: 'STALE_AUTH_RESPONSE',
        message: 'Yêu cầu xác thực đã được thay thế.',
      }),
    now = deps.now ?? (() => Date.now());
  const raw = await (deps.post ?? defaultPost)(MFA_VERIFY_PATH, {
    mfa_token: mfaToken,
    code,
  });
  if (!accepts()) throw stale();
  recordServerTime(readServerTimestamp(raw), now());
  const payload = parseRefreshPayload(raw);
  const session = {
    ...sessionFromRefresh(payload, serverNow(now())),
    ...readAuthSessionMetadata(raw),
  };
  clearRefreshInFlight();
  await persistSession(session, generation, accepts);
  if (
    attempt !== logoutSequence ||
    getSession()?.accessToken !== session.accessToken
  )
    throw stale();
  return session;
}

/**
 * Đăng xuất.
 *
 * Xoá phiên cục bộ **trước**, gọi máy chủ **sau**. Thứ tự này có chủ đích: nếu
 * lời gọi mạng hỏng, người dùng vẫn phải được đăng xuất khỏi máy. Ngược lại thì
 * họ bấm Đăng xuất, thấy lỗi, và vẫn đang đăng nhập — đúng thứ không được xảy ra
 * khi thủ kho bàn giao ca và đưa máy cho người khác.
 */
let logoutPending: Promise<void> | undefined;
export function logout(deps: LoginDeps = {}): Promise<void> {
  if (logoutPending && !getSession()) return logoutPending;
  const operation = performLogout(deps).finally(() => {
    if (logoutPending === operation) logoutPending = undefined;
  });
  logoutPending = operation;
  return operation;
}
async function performLogout(deps: LoginDeps): Promise<void> {
  const attempt = ++logoutSequence;
  const captured = getSession(),
    accessToken = captured?.accessToken,
    refreshToken = captured?.refreshToken;
  const clearing = clearSecureRefreshToken();
  clearRefreshInFlight();
  clearSession();
  try {
    await clearing;
  } catch {
    // Local UI đã logout; lỗi xoá Keystore không được giữ nhân viên ở lại app.
  }
  const body = usesCookieTokenTransport
    ? {}
    : {
        ...(refreshToken === undefined ? {} : { refresh_token: refreshToken }),
      };
  let outcome: LogoutOutcome = { kind: 'local-only' };
  try {
    if (accessToken === undefined)
      throw new AppError({
        kind: 'auth',
        message: 'Không có ACCESS token để xác minh thu hồi.',
      });
    const headers = { Authorization: 'Bearer ' + accessToken };
    const response = deps.post
      ? {
          status: 200,
          data: await deps.post(LOGOUT_PATH, body, { headers }),
          header: (_: string) => undefined,
        }
      : await apiClient.request<unknown>({
          path: LOGOUT_PATH,
          method: 'POST',
          body,
          headers,
        });
    const envelope = response.data as
      | { success?: unknown; data?: unknown; meta?: { request_id?: string } }
      | undefined;
    const requestId =
      response.header?.('x-request-id') ?? envelope?.meta?.request_id;
    const result = decodeAuthResult(response, 'logout');
    outcome = {
      kind: 'server-confirmed',
      requestId,
      scope: String(result.scope),
    };
  } catch (e) {
    outcome = {
      kind: 'local-only',
      requestId: e instanceof AppError ? e.requestId : undefined,
    };
  }
  // A delayed logout never changes a later login or reports a broader revocation.
  if (attempt === logoutSequence && getSession() === undefined)
    for (const listener of logoutListeners) listener(outcome);
}

/** Phân loại lỗi đăng nhập cho tầng UI. */
export type LoginFailure =
  | { readonly kind: 'credentials'; readonly message: string }
  | { readonly kind: 'network'; readonly message: string }
  | { readonly kind: 'blocked'; readonly message: string }
  | { readonly kind: 'other'; readonly message: string };

/**
 * Đổi `AppError` thành thứ màn Đăng nhập hiển thị được.
 *
 * Tách riêng `blocked` khỏi `credentials` vì hai thứ đòi hành động khác hẳn:
 * sai mật khẩu thì gõ lại, còn bị Cloudflare chặn thì gõ mười lần cũng vô ích —
 * phải gọi quản trị (§4j.2).
 */
export function classifyLoginError(error: unknown): LoginFailure {
  if (
    error instanceof AppError &&
    error.code === 'TOKEN_TRANSPORT_NOT_ALLOWED'
  ) {
    return {
      kind: 'other',
      message:
        'Bản Web đang dùng kênh phiên không phù hợp. Hãy tải lại sau khi cập nhật ứng dụng.',
    };
  }
  // AuthStatePage của Mini App xử lý 401/422/403 theo HTTP status trước khi
  // dùng thông điệp tổng quát. `AppError` vẫn giữ status kể cả khi kind là
  // `auth`, nên không được chỉ nhìn vào kind ở đây.
  if (
    error instanceof AppError &&
    (error.status === 401 || error.status === 422)
  ) {
    return { kind: 'credentials', message: 'Sai tài khoản hoặc mật khẩu.' };
  }
  if (error instanceof AppError && error.status === 403) {
    return {
      kind: 'blocked',
      message: 'Tài khoản chưa có quyền truy cập Mini App kho.',
    };
  }
  if (!(error instanceof AppError)) {
    if (error instanceof TypeError) {
      return {
        kind: 'network',
        message:
          'Không kết nối được backend WMS. Nếu đang chạy local, kiểm tra CORS hoặc dùng proxy dev.',
      };
    }
    return {
      kind: 'other',
      message: 'Đã xảy ra lỗi. Thử lại hoặc báo quản trị.',
    };
  }
  switch (error.kind) {
    case 'auth':
      return {
        kind: 'credentials',
        // Dùng câu của server nếu có — nó nói đúng nguyên nhân hơn câu tự viết.
        message: error.message || 'Sai tài khoản hoặc mật khẩu.',
      };
    case 'blocked_by_edge':
      return {
        kind: 'blocked',
        message:
          'Máy chủ chặn ứng dụng ở lớp bảo vệ mạng. Đăng nhập lại không ' +
          'giải quyết được — báo quản trị hệ thống.',
      };
    case 'network':
    case 'timeout':
      return {
        kind: 'network',
        message:
          'Không kết nối được backend WMS. Nếu đang chạy local, kiểm tra CORS hoặc dùng proxy dev.',
      };
    default:
      return { kind: 'other', message: error.message };
  }
}
