/**
 * Authentication / session abstraction.
 *
 * 🔄 **Mở rộng 2026-09-05** — người dùng chọn nhánh **"tự gia hạn ngầm"**: thủ
 * kho không bao giờ thấy màn đăng nhập giữa ca. Phiên vì thế mang thêm
 * `refreshToken` và `issuedAtMs`; việc gia hạn nằm ở `tokenRefresh.ts`.
 *
 * Số đo thật do người dùng kiểm chứng trên WMS staging (2026-09-05):
 *
 * | | |
 * |---|---|
 * | `access_token` | JWT HS256, 373–376 ký tự |
 * | `expires_in` | trả kèm **mọi** phản hồi ⇒ app KHÔNG decode JWT, KHÔNG đoán TTL |
 * | `refresh_token` | 86 ký tự base64url, **không** phải JWT |
 * | TTL refresh | 14 ngày, **trượt** — mỗi lần gia hạn lại cấp 14 ngày mới |
 *
 * ⚠️ `JWT_TTL` trên dev đang là 30 ngày do nới tạm cho đợt quét; hợp đồng
 * (`.env.example`) là **60 phút**. Vì vậy **cấm hard-code TTL** — luôn lấy
 * `expires_in` của lần phát hành gần nhất.
 *
 * Refresh token không nằm trong MMKV: Android lưu ciphertext bằng khoá Android
 * Keystore trong native secure storage. MMKV chỉ giữ access/session metadata.
 */

import { getAppStorage } from '../storage/storage';
import {
  clearSecureRefreshToken,
  readSecureRefreshToken,
  writeSecureRefreshToken,
} from './secureRefreshToken';

export interface Session {
  readonly accessToken: string;
  /**
   * Token dùng để lấy access token mới. **Không** phải JWT — chuỗi ngẫu nhiên
   * 86 ký tự. Dùng lại một token đã bị thu hồi sẽ khiến máy chủ **huỷ sạch mọi
   * refresh token của người dùng đó**, đá họ ra khỏi mọi thiết bị. Xem
   * `tokenRefresh.ts` để biết cách phòng.
   */
  readonly refreshToken?: string;
  /** Epoch millisecond hết hạn, nếu server có cung cấp. */
  readonly expiresAtMs?: number;
  /**
   * Epoch millisecond lúc phát hành. Cần để tính ngưỡng gia hạn chủ động: biết
   * hạn mà không biết lúc phát hành thì không suy ra được TTL gốc.
   */
  readonly issuedAtMs?: number;
  /** Định danh người dùng do server trả về, nếu có. */
  readonly userId?: string;
  /** Tên hiển thị được xác nhận từ `GET /auth/me`, nếu có. */
  readonly userName?: string;
  /** URL ảnh đại diện được xác nhận từ `GET /auth/me`, nếu có. */
  readonly avatarUrl?: string;
}

/** Phần định danh an toàn để bổ sung sau khi `/auth/me` trả về. */
export interface SessionIdentity {
  readonly userId?: string;
  readonly userName?: string;
  readonly avatarUrl?: string;
}

/**
 * Dấu vết "đã gửi một lượt gia hạn nhưng chưa ghi nhận kết quả".
 *
 * Vì sao cần lưu xuống đĩa: nếu app bị kill đúng lúc đang gia hạn, refresh token
 * cũ **có thể** đã bị máy chủ thu hồi trong khi máy chưa kịp lưu token mới. Lần
 * mở app sau mà đem token cũ đi dùng lại sẽ bị coi là **replay** và máy chủ huỷ
 * sạch mọi phiên của người dùng đó.
 *
 * Cùng một lý do với `recoverAfterRestart()` của outbox: đã gửi đi thì không
 * được mặc định là chưa gửi.
 */
export interface RefreshInFlight {
  /** Epoch millisecond lúc bắt đầu gửi. Chỉ để chẩn đoán. */
  readonly startedAtMs: number;
}

const STORAGE_KEY_SESSION = 'auth.session';
const STORAGE_KEY_REFRESH_INFLIGHT = 'auth.refresh.inflight';

type Listener = (session: Session | undefined) => void;

const listeners = new Set<Listener>();
let sessionCache: Session | undefined;
let sessionCacheLoaded = false;

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.accessToken === 'string' && record.accessToken.length > 0
  );
}

function readPublicSession(): Session | undefined {
  const stored = getAppStorage().getObject<unknown>(STORAGE_KEY_SESSION);
  return isSession(stored) ? stored : undefined;
}

/** Chỉ ghi metadata; refresh token tuyệt đối không được serialize vào MMKV. */
function writePublicSession(session: Session): void {
  const publicSession: Record<string, unknown> = { ...session };
  // This credential must never be serialized to MMKV.
  delete publicSession.refreshToken;
  getAppStorage().setObject(STORAGE_KEY_SESSION, publicSession);
}

export function getSession(): Session | undefined {
  if (!sessionCacheLoaded) {
    sessionCache = readPublicSession();
    sessionCacheLoaded = true;
  }
  return sessionCache;
}

export function isSessionExpired(
  session: Session,
  nowMs: number = Date.now(),
): boolean {
  return session.expiresAtMs !== undefined && session.expiresAtMs <= nowMs;
}

/** Phiên còn dùng được: tồn tại và chưa hết hạn. */
export function getActiveSession(
  nowMs: number = Date.now(),
): Session | undefined {
  const session = getSession();
  if (session === undefined) {
    return undefined;
  }
  return isSessionExpired(session, nowMs) ? undefined : session;
}

export function setSession(session: Session): void {
  sessionCache = session;
  sessionCacheLoaded = true;
  writePublicSession(session);
  notify(session);
}

/**
 * Lưu một phiên mới/đã xoay token theo thứ tự an toàn: secure storage trước,
 * rồi mới xuất bản access token. App chết giữa hai bước sẽ không dùng lại
 * refresh token cũ vì dấu `refresh.inflight` vẫn còn.
 */
export async function persistSession(session: Session): Promise<void> {
  const refreshToken = nonBlank(session.refreshToken);
  if (refreshToken === undefined) {
    await clearSecureRefreshToken();
  } else {
    await writeSecureRefreshToken(refreshToken);
  }
  setSession({ ...session, ...(refreshToken === undefined ? {} : { refreshToken }) });
}

/**
 * Nạp refresh token bảo mật lúc bootstrap. Có migration một lần cho các bản
 * cũ từng ghi refresh token chung với session vào MMKV: token cũ được chuyển
 * vào Keystore rồi bị xoá ngay khỏi bản ghi plaintext.
 */
export async function hydrateSession(): Promise<Session | undefined> {
  const publicSession = readPublicSession();
  if (publicSession === undefined) {
    sessionCache = undefined;
    sessionCacheLoaded = true;
    return undefined;
  }

  const legacyRefresh = nonBlank(publicSession.refreshToken);
  if (legacyRefresh !== undefined) {
    await writeSecureRefreshToken(legacyRefresh);
  }
  const refreshToken = legacyRefresh ?? (await readSecureRefreshToken());
  const hydrated: Session = {
    ...publicSession,
    ...(refreshToken === undefined ? {} : { refreshToken }),
  };
  sessionCache = hydrated;
  sessionCacheLoaded = true;
  // Ghi lại luôn khi migrate, bảo đảm refresh token cũ không còn ở MMKV.
  writePublicSession(hydrated);
  return hydrated;
}

function nonBlank(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined || normalized === '' ? undefined : normalized;
}

/**
 * Lưu danh tính sau khi `/auth/me` xác nhận thành công.
 *
 * Chỉ thay các trường BE thực sự trả về và luôn đọc phiên mới nhất trước khi
 * ghi. Nhờ đó một lần gia hạn token xen giữa lúc tải hồ sơ không làm mất token
 * hoặc các trường phiên đã được cập nhật.
 */
export function updateSessionIdentity(
  identity: SessionIdentity,
): Session | undefined {
  const current = getSession();
  if (current === undefined) {
    return undefined;
  }

  const userId = nonBlank(identity.userId);
  const userName = nonBlank(identity.userName);
  const avatarUrl = nonBlank(identity.avatarUrl);
  const next: Session = {
    ...current,
    ...(userId === undefined ? {} : { userId }),
    ...(userName === undefined ? {} : { userName }),
    ...(avatarUrl === undefined ? {} : { avatarUrl }),
  };

  setSession(next);
  return next;
}

export function clearSession(): void {
  getAppStorage().remove(STORAGE_KEY_SESSION);
  sessionCache = undefined;
  sessionCacheLoaded = true;
  notify(undefined);
}

/** Xoá cả metadata và refresh credential khi logout/phiên chết. */
export async function clearPersistedSession(): Promise<void> {
  clearSession();
  await clearSecureRefreshToken();
}

export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(session: Session | undefined): void {
  for (const listener of listeners) {
    listener(session);
  }
}

// ---------------------------------------------------------------------------
// Dấu vết lượt gia hạn đang bay
// ---------------------------------------------------------------------------

export function markRefreshInFlight(nowMs: number = Date.now()): void {
  const marker: RefreshInFlight = { startedAtMs: nowMs };
  getAppStorage().setObject(STORAGE_KEY_REFRESH_INFLIGHT, marker);
}

export function clearRefreshInFlight(): void {
  getAppStorage().remove(STORAGE_KEY_REFRESH_INFLIGHT);
}

export function getRefreshInFlight(): RefreshInFlight | undefined {
  const stored = getAppStorage().getObject<unknown>(
    STORAGE_KEY_REFRESH_INFLIGHT,
  );
  if (typeof stored !== 'object' || stored === null) {
    return undefined;
  }
  const startedAtMs = (stored as { startedAtMs?: unknown }).startedAtMs;
  return typeof startedAtMs === 'number' ? { startedAtMs } : undefined;
}
