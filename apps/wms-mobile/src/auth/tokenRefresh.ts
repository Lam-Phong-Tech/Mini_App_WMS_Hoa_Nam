/**
 * Gia hạn phiên ngầm — thủ kho không bao giờ thấy màn đăng nhập giữa ca.
 *
 * Nhánh này do **người dùng chọn** ngày 2026-09-05, sau khi kiểm chứng trên mã
 * nguồn WMS và đo thật trên staging. Ba ràng buộc dưới đây là **yêu cầu bắt
 * buộc** họ nêu ra, không phải tôi tự nghĩ:
 *
 * 1. **Single-flight.** Hai request cùng gặp 401 rồi cùng gọi gia hạn → lượt thứ
 *    hai là *replay* của một refresh token đã bị thu hồi → máy chủ huỷ sạch mọi
 *    phiên của người dùng, đá thủ kho ra giữa lúc đang cầm hàng. Mọi bên gọi phải
 *    dùng chung **một** promise.
 * 2. **401 → gia hạn đúng MỘT lần.** Máy chủ không phân biệt "hết hạn" với "sai
 *    token": cả hai đều `401 {"error_code":"UNAUTHENTICATED"}`, không có header
 *    `WWW-Authenticate`. Nên chính sách là: gặp 401 thì thử gia hạn một lượt;
 *    vẫn 401 thì mới ép đăng nhập lại.
 * 3. **Gia hạn chủ động ở ~20% TTL còn lại, TUYỆT ĐỐI không polling.** Rate limit
 *    `auth-refresh` là 30 lần/phút **theo IP**. Cả kho NAT chung một IP công
 *    cộng ⇒ mọi máy quét chia nhau hạn mức đó.
 *
 * Hai thứ module này CỐ Ý không làm:
 *
 * - Không decode JWT. `expires_in` có trong mọi phản hồi; decode chỉ thêm một
 *   nguồn sự thật thứ hai để lệch nhau.
 * - Không hard-code TTL. Dev đang để `JWT_TTL=43200` (30 ngày) như một nới tạm;
 *   hợp đồng `.env.example` là 60 phút. Hard-code con số nào cũng sẽ sai.
 */

import { AppError } from '../errors/AppError';
import { logger } from '../logging/logger';
import { recordServerTime, readServerTimestamp, serverNow } from './serverClock';
import {
  clearRefreshInFlight,
  clearSession,
  getRefreshInFlight,
  getSession,
  markRefreshInFlight,
  setSession,
  type Session,
} from './session';

/**
 * Gia hạn khi thời gian còn lại tụt xuống dưới tỉ lệ này của TTL gốc.
 *
 * 20% của 60 phút = 12 phút đệm — đủ để một lượt quét dài không bị ngắt giữa
 * chừng, mà vẫn không gọi gia hạn dày tới mức đụng rate limit.
 */
export const PROACTIVE_REFRESH_RATIO = 0.2;

/**
 * Sàn tuyệt đối cho phần đệm. Nếu máy chủ phát token TTL rất ngắn thì 20% có
 * thể chỉ còn vài giây — ngắn hơn cả một lượt gửi. Không để tụt dưới mức này.
 */
export const MIN_REFRESH_LEAD_MS = 30_000;

export const REFRESH_PATH = '/api/v1/auth/refresh';

/** Thân phản hồi của `POST /auth/refresh`, theo đúng số đo thật trên staging. */
export interface RefreshPayload {
  readonly access_token: string;
  readonly refresh_token: string;
  /** Giây. Đây là **nguồn duy nhất** cho hạn — không decode JWT, không đoán. */
  readonly expires_in: number;
}

export interface RefreshDeps {
  /** Gửi request gia hạn. Tách ra để test không cần mạng. */
  readonly send: (refreshToken: string) => Promise<unknown>;
  readonly now?: () => number;
}

/** Kết quả khôi phục sau khi app khởi động lại. */
export type RestartRecovery =
  | { readonly outcome: 'clean' }
  | { readonly outcome: 'forced_relogin'; readonly reason: string };

// ---------------------------------------------------------------------------
// Đọc phản hồi
// ---------------------------------------------------------------------------

export function parseRefreshPayload(payload: unknown): RefreshPayload {
  const container =
    typeof payload === 'object' && payload !== null
      ? ((payload as { data?: unknown }).data ?? payload)
      : payload;

  if (typeof container !== 'object' || container === null) {
    throw new AppError({
      kind: 'parse',
      message: 'Phản hồi gia hạn phiên không đọc được.',
    });
  }
  const record = container as Record<string, unknown>;
  const accessToken = record.access_token;
  const refreshToken = record.refresh_token;
  const expiresIn = record.expires_in;

  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new AppError({
      kind: 'parse',
      message: 'Phản hồi gia hạn thiếu access_token.',
    });
  }
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
    throw new AppError({
      kind: 'parse',
      message: 'Phản hồi gia hạn thiếu refresh_token.',
    });
  }
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn)) {
    throw new AppError({
      kind: 'parse',
      message: 'Phản hồi gia hạn thiếu expires_in.',
    });
  }
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
  };
}

export function sessionFromRefresh(
  payload: RefreshPayload,
  issuedAtMs: number,
  previous?: Session,
): Session {
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    issuedAtMs,
    expiresAtMs: issuedAtMs + payload.expires_in * 1000,
    userId: previous?.userId,
  };
}

// ---------------------------------------------------------------------------
// Chính sách gia hạn chủ động
// ---------------------------------------------------------------------------

/**
 * Mốc thời gian nên bắt đầu gia hạn.
 *
 * Trả `undefined` khi không đủ dữ liệu để tính (thiếu `expiresAtMs` hoặc
 * `issuedAtMs`) — im lặng không gia hạn còn hơn gia hạn theo một con số bịa.
 */
export function refreshDueAtMs(session: Session): number | undefined {
  if (session.expiresAtMs === undefined || session.issuedAtMs === undefined) {
    return undefined;
  }
  const ttlMs = session.expiresAtMs - session.issuedAtMs;
  if (ttlMs <= 0) {
    return session.expiresAtMs;
  }
  const lead = Math.max(ttlMs * PROACTIVE_REFRESH_RATIO, MIN_REFRESH_LEAD_MS);
  // Không để mốc gia hạn lùi trước cả lúc phát hành: TTL quá ngắn thì gia hạn ngay.
  return Math.max(session.expiresAtMs - lead, session.issuedAtMs);
}

/** Đã tới lúc gia hạn chủ động chưa. Dùng **giờ máy chủ**, không dùng giờ máy. */
export function needsProactiveRefresh(
  session: Session,
  nowMs: number = serverNow(),
): boolean {
  if (session.refreshToken === undefined) {
    return false;
  }
  const dueAt = refreshDueAtMs(session);
  return dueAt !== undefined && nowMs >= dueAt;
}

// ---------------------------------------------------------------------------
// Khôi phục sau khởi động lại
// ---------------------------------------------------------------------------

/**
 * Xử lý trường hợp app bị kill giữa lúc đang gia hạn.
 *
 * Không thể biết máy chủ đã thu hồi token cũ hay chưa, và **không được thử lại**
 * để tìm hiểu: nếu nó đã bị thu hồi thì lượt thử đó bị coi là replay và máy chủ
 * huỷ sạch mọi phiên của người dùng — kể cả phiên trên thiết bị khác.
 *
 * Cùng nguyên tắc với `outbox.recoverAfterRestart()`: **đã gửi đi thì không được
 * mặc định là chưa gửi.**
 */
export function recoverAfterRestart(): RestartRecovery {
  const inFlight = getRefreshInFlight();
  if (inFlight === undefined) {
    return { outcome: 'clean' };
  }
  clearRefreshInFlight();
  clearSession();
  const reason =
    'App đã tắt giữa lúc đang gia hạn phiên. Không rõ máy chủ đã thu hồi ' +
    'token cũ hay chưa, nên không dùng lại — cần đăng nhập lại một lần.';
  logger.warn('Gia hạn phiên dở dang, buộc đăng nhập lại', {
    startedAtMs: inFlight.startedAtMs,
  });
  return { outcome: 'forced_relogin', reason };
}

// ---------------------------------------------------------------------------
// Single-flight
// ---------------------------------------------------------------------------

let inFlightRefresh: Promise<Session> | undefined;

/** Số lượt gia hạn thực sự đã gửi. Dùng cho test và chẩn đoán. */
let refreshAttempts = 0;

export function getRefreshAttempts(): number {
  return refreshAttempts;
}

export function resetRefreshState(): void {
  inFlightRefresh = undefined;
  refreshAttempts = 0;
}

/** Có một lượt gia hạn đang bay hay không. */
export function isRefreshing(): boolean {
  return inFlightRefresh !== undefined;
}

/**
 * Gia hạn phiên. **Mọi** bên gọi đồng thời dùng chung một promise.
 *
 * Đây là chỗ cưỡng chế ràng buộc 1. Nếu ai đó lỡ gọi hàm này từ mười request
 * cùng lúc thì vẫn chỉ có **một** request đi ra mạng.
 */
export function refreshSession(deps: RefreshDeps): Promise<Session> {
  if (inFlightRefresh !== undefined) {
    return inFlightRefresh;
  }
  const promise = performRefresh(deps).finally(() => {
    inFlightRefresh = undefined;
  });
  inFlightRefresh = promise;
  return promise;
}

async function performRefresh(deps: RefreshDeps): Promise<Session> {
  const now = deps.now ?? (() => Date.now());
  const current = getSession();
  const refreshToken = current?.refreshToken;

  if (refreshToken === undefined || refreshToken.length === 0) {
    throw new AppError({
      kind: 'auth',
      message: 'Phiên chưa có refresh token. Cần đăng nhập.',
    });
  }

  refreshAttempts += 1;
  // Ghi dấu TRƯỚC khi gửi — cùng lý do outbox ghi `syncing` xuống đĩa trước khi
  // gửi. Nếu app chết sau dòng này, lần mở sau biết là đã gửi rồi.
  markRefreshInFlight(now());

  let raw: unknown;
  try {
    raw = await deps.send(refreshToken);
  } catch (error) {
    // Máy chủ từ chối rõ ràng ⇒ token này chết hẳn, xoá dấu và bỏ phiên.
    if (error instanceof AppError && error.kind === 'auth') {
      clearRefreshInFlight();
      clearSession();
    }
    // Lỗi mạng/timeout: GIỮ dấu. Không biết máy chủ đã thu hồi hay chưa, và
    // `recoverAfterRestart()` sẽ xử lý ở lần mở app sau.
    throw error;
  }

  recordServerTime(readServerTimestamp(raw), now());
  const payload = parseRefreshPayload(raw);
  const session = sessionFromRefresh(payload, serverNow(now()), current);
  setSession(session);
  clearRefreshInFlight();
  logger.debug('Đã gia hạn phiên', { expiresInSec: payload.expires_in });
  return session;
}
