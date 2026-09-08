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
import { serverNow, recordServerTime, readServerTimestamp } from '../../auth/serverClock';
import {
  clearRefreshInFlight,
  clearSession,
  setSession,
  type Session,
} from '../../auth/session';
import { parseRefreshPayload, sessionFromRefresh } from '../../auth/tokenRefresh';

export const LOGIN_PATH = '/api/v1/auth/login';
export const LOGOUT_PATH = '/api/v1/auth/logout';

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

export interface LoginDeps {
  /** Tách ra để test không cần mạng. Mặc định dùng client thật. */
  readonly post?: (path: string, body: unknown) => Promise<unknown>;
  readonly now?: () => number;
}

async function defaultPost(path: string, body: unknown): Promise<unknown> {
  const response = await apiClient.request<unknown>({
    path,
    method: 'POST',
    body,
  });
  return response.data;
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
  const post = deps.post ?? defaultPost;
  const now = deps.now ?? (() => Date.now());

  const raw = await post(LOGIN_PATH, {
    email: credentials.email,
    password: credentials.password,
  });

  recordServerTime(readServerTimestamp(raw), now());
  const payload = parseRefreshPayload(raw);
  const session = sessionFromRefresh(payload, serverNow(now()));

  // Xoá dấu gia hạn dở dang của phiên TRƯỚC: đăng nhập mới làm nó vô nghĩa, và
  // để sót lại sẽ khiến lần mở app sau ép đăng nhập lại một cách vô lý.
  clearRefreshInFlight();
  setSession(session);
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
export async function logout(deps: LoginDeps = {}): Promise<void> {
  const post = deps.post ?? defaultPost;
  clearSession();
  clearRefreshInFlight();
  try {
    await post(LOGOUT_PATH, {});
  } catch {
    // Nuốt lỗi có chủ đích: phiên cục bộ đã xoá xong ở trên. Máy chủ sẽ tự hết
    // hạn token theo TTL. Báo lỗi ở đây chỉ làm người dùng tưởng chưa đăng xuất.
  }
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
  // AuthStatePage của Mini App xử lý 401/422/403 theo HTTP status trước khi
  // dùng thông điệp tổng quát. `AppError` vẫn giữ status kể cả khi kind là
  // `auth`, nên không được chỉ nhìn vào kind ở đây.
  if (error instanceof AppError && (error.status === 401 || error.status === 422)) {
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
    return { kind: 'other', message: 'Đã xảy ra lỗi. Thử lại hoặc báo quản trị.' };
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
