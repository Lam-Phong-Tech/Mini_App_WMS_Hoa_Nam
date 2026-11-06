import {
  apiClient,
  type RequestOptions,
  type ApiResponse,
} from '../../api/client';
import {
  getSession,
  getSessionGeneration,
  setSession,
  type Session,
} from '../../auth/session';
import {
  serverNow,
  recordServerTime,
  readServerTimestamp,
} from '../../auth/serverClock';
import { AppError } from '../../errors/AppError';
import {
  CONTEXT_RELEASE,
  contextReleaseVerified,
  type ContextReleaseEvidence,
} from '../../config/homeContextRelease';
import { fetchHomeUser } from './home';
import { mapCurrentUser } from './queries';
import { UUID_PATTERN } from './workShift';
import type { CurrentUser } from './types';
export const SWITCH_CONTEXT_PATH = '/api/v1/auth/switch-context';
export interface WarehouseContextInput {
  readonly actorId: string;
  readonly authSessionId: string;
  readonly warehouseId: string;
}
export interface ContextDeps {
  readonly release?: ContextReleaseEvidence;
  readonly client?: {
    request<T>(options: RequestOptions): Promise<ApiResponse<T>>;
  };
  readonly readMe?: typeof fetchHomeUser;
  readonly readSession?: () => Session | undefined;
  readonly writeSession?: typeof setSession;
}
export function matchesReadyContext(
  user: CurrentUser,
  expected: WarehouseContextInput,
): boolean {
  return (
    user.id === expected.actorId &&
    user.auth_session_id === expected.authSessionId &&
    user.active_warehouse_id?.toLowerCase() ===
      expected.warehouseId.toLowerCase() &&
    user.warehouse_context?.status === 'READY'
  );
}
export function contextErrorMessage(error: AppError): string {
  const messages: Record<string, string> = {
    UNAUTHENTICATED: 'Phiên xác thực không hợp lệ. Vui lòng đăng nhập lại.',
    AUTH_SESSION_EXPIRED: 'Phiên đăng nhập đã hết hạn hoặc bị thu hồi.',
    ACCESS_DENIED:
      'Kho không thuộc phạm vi được phép hoặc tài khoản không còn khả dụng.',
    WAREHOUSE_NOT_FOUND: 'Kho được chọn không tồn tại.',
    AUTH_SESSION_REQUIRED: 'Phiên chưa hỗ trợ lưu lựa chọn kho.',
    WAREHOUSE_INACTIVE: 'Kho được chọn đã tạm dừng.',
    SHIFT_WAREHOUSE_CONFLICT: 'Phiên đã có ca. Không thể đổi kho.',
    CONTEXT_FIELD_NOT_ALLOWED:
      'Yêu cầu xác nhận kho chứa trường không được phép.',
    CONTEXT_FIELD_MISMATCH: 'Thông tin context kho không khớp.',
    WAREHOUSE_CONTEXT_REQUIRED: 'Cần chọn UUID kho được cấp.',
    BUSINESS_RULE_ERROR:
      'WMS từ chối dữ liệu xác nhận kho. Kiểm tra type và UUID.',
  };
  return messages[error.code ?? ''] ?? error.message;
}
const uncertain = (e: unknown) =>
  !(e instanceof AppError) ||
  ['network', 'timeout', 'unknown', 'parse', 'blocked_by_edge'].includes(
    e.kind,
  ) ||
  (e.status !== undefined && (e.status === 429 || e.status >= 500));
export async function switchWarehouseContext(
  input: WarehouseContextInput,
  options: Pick<RequestOptions, 'signal' | 'timeoutMs'> = {},
  deps: ContextDeps = {},
): Promise<CurrentUser> {
  if (!contextReleaseVerified(deps.release ?? CONTEXT_RELEASE))
    throw new AppError({
      kind: 'blocked_by_gate',
      route: SWITCH_CONTEXT_PATH,
      message:
        'Chưa xác minh release, migration context và smoke test. Xác nhận kho đang khóa.',
    });
  if (
    !UUID_PATTERN.test(input.warehouseId) ||
    !input.actorId ||
    !input.authSessionId
  )
    throw new AppError({
      kind: 'config',
      route: SWITCH_CONTEXT_PATH,
      message: 'Thiếu actor/phiên/UUID kho đã được chọn.',
    });
  const readSession = deps.readSession ?? getSession,
    captured = readSession();
  const capturedGeneration = getSessionGeneration();
  const capturedWarehouse = captured?.activeWarehouseId?.toLowerCase();
  const sameSession = () => {
    const s = readSession();
    return (
      !!s &&
      (readSession !== getSession ||
        capturedGeneration === getSessionGeneration()) &&
      s.userId === input.actorId &&
      s.authSessionId === input.authSessionId &&
      (s.activeWarehouseId?.toLowerCase() === capturedWarehouse ||
        s.activeWarehouseId?.toLowerCase() === input.warehouseId.toLowerCase())
    );
  };
  if (!captured || !sameSession())
    throw new AppError({
      kind: 'auth',
      message: 'Phiên đã thay đổi trước khi xác nhận kho.',
    });
  try {
    const response = await (deps.client ?? apiClient).request<{
      success: boolean;
      data: {
        access_token: string;
        token_type: string;
        expires_in: number;
        active_context: { context_type: string; context_id: string };
        user: unknown;
      };
    }>({
      path: SWITCH_CONTEXT_PATH,
      method: 'POST',
      body: { context_type: 'WAREHOUSE', context_id: input.warehouseId },
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
    if (!sameSession() || options.signal?.aborted)
      throw new AppError({
        kind: 'cancelled',
        message: 'Không nhận kết quả context của phiên cũ.',
      });
    const payload = response.data?.data,
      user = mapCurrentUser(payload?.user);
    if (
      response.status !== 200 ||
      response.data?.success !== true ||
      !payload ||
      typeof payload.access_token !== 'string' ||
      !payload.access_token ||
      payload.token_type !== 'bearer' ||
      !Number.isSafeInteger(payload.expires_in) ||
      payload.expires_in <= 0 ||
      payload.active_context?.context_type !== 'WAREHOUSE' ||
      payload.active_context.context_id?.toLowerCase() !==
        input.warehouseId.toLowerCase() ||
      !matchesReadyContext(user, input)
    )
      throw new AppError({
        kind: 'parse',
        route: SWITCH_CONTEXT_PATH,
        message: 'Chưa xác minh được phản hồi xác nhận kho.',
      });
    recordServerTime(readServerTimestamp(response.data));
    const now = serverNow();
    // This API rotates ACCESS only. Keep current refresh credential and stable session.
    (deps.writeSession ?? setSession)({
      ...readSession()!,
      accessToken: payload.access_token,
      issuedAtMs: now,
      expiresAtMs: now + payload.expires_in * 1000,
      activeWarehouseId: user.active_warehouse_id!,
    });
  } catch (e) {
    if (!sameSession() || options.signal?.aborted || !uncertain(e)) throw e;
    // Read-only reconciliation; never resend switch-context or start a shift here.
    const user = await (deps.readMe ?? fetchHomeUser)({
      signal: options.signal,
    });
    if (sameSession() && matchesReadyContext(user, input)) {
      (deps.writeSession ?? setSession)({
        ...readSession()!,
        activeWarehouseId: user.active_warehouse_id!,
      });
      return user;
    }
    throw new AppError({
      kind: 'unknown',
      route: SWITCH_CONTEXT_PATH,
      message:
        'Chưa xác nhận kết quả lựa chọn kho. Đọc lại phiên trước khi thử lại.',
    });
  }
  const confirmed = await (deps.readMe ?? fetchHomeUser)({
    signal: options.signal,
  });
  if (!sameSession() || !matchesReadyContext(confirmed, input))
    throw new AppError({
      kind: 'unknown',
      route: SWITCH_CONTEXT_PATH,
      message: 'Context đọc lại chưa khớp người/phiên/kho đã chọn.',
    });
  return confirmed;
}
