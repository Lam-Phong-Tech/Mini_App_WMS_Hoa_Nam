/** P10 auth-profile-p10-v1, pinned BE 4f6bc52. No receipts or automatic replay. */
import {
  apiClient,
  type ApiResponse,
  type RequestOptions,
} from '../../api/client';
import {
  captureSessionScope,
  isSessionScopeCurrent,
  clearPersistedSession,
  clearRefreshInFlight,
} from '../../auth/session';
import { assertP10Connected, P10_RELEASE } from '../../config/p10Release';
import { AppError } from '../../errors/AppError';
import { mapCurrentUser } from './queries';
import type { CurrentUser } from './types';
import { securityCommandBlocked, isSecurityUnknown } from './security';

export const PROFILE_PATH = '/api/v1/auth/me';
export const CHANGE_PASSWORD_PATH = '/api/v1/auth/change-password';
export const SESSIONS_PATH = '/api/v1/auth/sessions';
export interface ProfileUpdateInput {
  readonly displayName?: string;
  readonly phone?: string | null;
}
export interface PasswordChangeInput {
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly newPasswordConfirmation: string;
}
export type {
  SecuritySession as ProfileSession,
  SecuritySessionPage as ProfileSessionPage,
} from './security';
export {
  changeSecurityPassword as changeProfilePassword,
  fetchSecuritySessions as fetchProfileSessions,
  revokeSecuritySession as revokeProfileSession,
} from './security';
export interface ProfileServiceDeps {
  readonly request?: <T>(options: RequestOptions) => Promise<ApiResponse<T>>;
  readonly clearLocalSession?: () => Promise<void>;
}
export const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
function invalid(message = 'Phản hồi tài khoản không đúng contract.'): never {
  throw new AppError({ kind: 'parse', code: 'P10_INVALID_RESPONSE', message });
}
function inputError(message: string, code = 'VALIDATION_ERROR'): never {
  throw new AppError({ kind: 'config', code, message });
}
export function strongProfileEtag(value: unknown): string | undefined {
  const raw =
    typeof value === 'number'
      ? String(value)
      : typeof value === 'string'
      ? value
      : '';
  if (!/^(?:"[1-9][0-9]{0,9}"|[1-9][0-9]{0,9})$/.test(raw)) return undefined;
  const number = Number(raw.replace(/"/g, ''));
  return Number.isSafeInteger(number) && number < 2147483647
    ? '"' + number + '"'
    : undefined;
}
function envelope(response: ApiResponse<unknown>) {
  const root = record(response.data);
  if (
    response.status !== 200 ||
    root.success !== true ||
    !('data' in root) ||
    !root.meta ||
    typeof root.meta !== 'object'
  )
    invalid();
  return { root, meta: record(root.meta) };
}
export function decodeProfile(response: ApiResponse<unknown>): CurrentUser {
  const { root, meta } = envelope(response),
    data = record(root.data),
    policy = record(meta.profile_contract);
  const reconciliation = record(policy.request_reconciliation);
  if (
    policy.version !== P10_RELEASE.contract ||
    policy.nickname_supported !== false ||
    // Additive read capabilities must not make the basic profile unreadable.
    // Avatar/email commands remain outside ProfileUpdateInput's explicit allowlist.
    typeof record(policy.avatar).supported !== 'boolean' ||
    record(policy.ui_permission_groups).status !== 'BA_MAPPING_REQUIRED' ||
    record(policy.ui_permission_groups).groups !== null ||
    reconciliation.supported !== false ||
    reconciliation.readback_proves_original_request !== false ||
    reconciliation.automatic_mutation_retry !== false
  )
    invalid();
  if (
    !['username', 'email', 'status', 'created_at', 'updated_at'].every(
      key =>
        key in data && (data[key] === null || typeof data[key] === 'string'),
    ) ||
    !(
      data.warehouse_scope_ids === null ||
      (Array.isArray(data.warehouse_scope_ids) &&
        data.warehouse_scope_ids.every(id => uuid(id)))
    ) ||
    !Array.isArray(data.available_warehouses) ||
    !Number.isSafeInteger(data.version) ||
    !uuid(data.user_id) ||
    typeof data.display_name !== 'string' ||
    !(data.phone === null || typeof data.phone === 'string') ||
    !Array.isArray(data.roles) ||
    !Array.isArray(data.permissions) ||
    data.permissions.some(p => typeof p !== 'string') ||
    !(data.auth_session_id === null || uuid(data.auth_session_id)) ||
    !(data.active_warehouse_id === null || uuid(data.active_warehouse_id)) ||
    !['READY', 'REQUIRED', 'UNAVAILABLE', 'NO_SESSION'].includes(
      String(record(data.warehouse_context).status),
    ) ||
    !('error_code' in record(data.warehouse_context))
  )
    invalid();
  const canonical = strongProfileEtag(data.version),
    header = response.header?.('etag');
  const etag = header === undefined ? canonical : strongProfileEtag(header);
  if (
    !canonical ||
    !etag ||
    canonical !== etag ||
    (header !== undefined && header !== etag)
  )
    invalid('WMS chưa trả phiên bản hồ sơ hợp lệ.');
  return {
    ...mapCurrentUser(data),
    user_id: data.user_id,
    display_name: data.display_name,
    canonical_profile: data,
    profile_meta: meta,
    etag,
    version: String(data.version),
    phone: data.phone as string | null,
  };
}
function assertCurrent(scope: ReturnType<typeof captureSessionScope>): void {
  if (!isSessionScopeCurrent(scope))
    throw new AppError({
      kind: 'auth',
      code: 'STALE_AUTH_RESPONSE',
      message: 'Phiên hoặc ngữ cảnh đã thay đổi. Không dùng phản hồi cũ.',
    });
}
function assertProfileOwner(
  user: CurrentUser,
  scope: ReturnType<typeof captureSessionScope>,
  snapshot?: CurrentUser,
): void {
  assertCurrent(scope);
  if (
    user.id !== scope.userId ||
    (user.auth_session_id ?? undefined) !== scope.authSessionId ||
    (user.active_warehouse_id ?? undefined) !== scope.warehouseId ||
    (snapshot &&
      (user.id !== snapshot.id ||
        user.auth_session_id !== snapshot.auth_session_id ||
        user.active_warehouse_id !== snapshot.active_warehouse_id ||
        user.warehouse_context?.status !== snapshot.warehouse_context?.status ||
        user.warehouse_context?.error_code !==
          snapshot.warehouse_context?.error_code))
  )
    invalid('Phản hồi không khớp tài khoản/ngữ cảnh đã gửi.');
}
async function requestForScope(
  scope: ReturnType<typeof captureSessionScope>,
  deps: ProfileServiceDeps,
  options: RequestOptions,
): Promise<ApiResponse<unknown>> {
  try {
    return await (deps.request ?? apiClient.request)<unknown>(options);
  } catch (cause) {
    // P01 owns re-authentication; only expire the exact calling session.
    if (
      cause instanceof AppError &&
      cause.status === 401 &&
      isSessionScopeCurrent(scope)
    ) {
      clearRefreshInFlight();
      await (deps.clearLocalSession ?? clearPersistedSession)();
    }
    throw cause;
  }
}
export async function fetchCurrentProfile(
  deps: ProfileServiceDeps = {},
): Promise<CurrentUser> {
  if (!deps.request) assertP10Connected();
  const scope = captureSessionScope();
  const response = await requestForScope(scope, deps, {
    path: PROFILE_PATH,
    method: 'GET',
  });
  const user = decodeProfile(response);
  assertProfileOwner(user, scope);
  return user;
}
// Volatile command guard survives screen remount. No payload/password/token is stored.
let commandGeneration = -1;
const commands = new Map<string, 'busy' | 'unknown'>();
export function profileCommandBlocked(action: string): boolean {
  if (action === 'password' || action === 'revoke')
    return securityCommandBlocked(action);
  const generation = captureSessionScope().generation;
  if (generation !== commandGeneration) {
    commands.clear();
    commandGeneration = generation;
  }
  return commands.has(action);
}
export function isProfileUnknown(cause: unknown): boolean {
  return (
    isSecurityUnknown(cause) ||
    (cause instanceof AppError && cause.code === 'P10_UNKNOWN')
  );
}
async function command<T>(
  action: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (profileCommandBlocked(action))
    throw new AppError({
      kind: 'unknown',
      code: 'P10_UNKNOWN',
      message:
        'Yêu cầu đang xử lý hoặc chưa rõ kết quả. Không gửi lại; cần hỗ trợ từ DEV/BE.',
    });
  const generation = commandGeneration;
  commands.set(action, 'busy');
  try {
    const result = await operation();
    if (generation === commandGeneration) commands.delete(action);
    return result;
  } catch (cause) {
    const known =
      cause instanceof AppError &&
      (['config', 'blocked_by_gate', 'auth'].includes(cause.kind) ||
        (cause.kind === 'http' &&
          (cause.status ?? 0) >= 400 &&
          (cause.status ?? 0) < 500));
    if (generation === commandGeneration) {
      if (known) commands.delete(action);
      else commands.set(action, 'unknown');
    }
    if (known) throw cause;
    throw new AppError({
      kind: 'unknown',
      code: 'P10_UNKNOWN',
      message:
        'Chưa xác định kết quả yêu cầu. Không gửi lại. Đọc lại chỉ cho biết trạng thái hiện tại; liên hệ DEV/BE để xử lý.',
      requestId: cause instanceof AppError ? cause.requestId : undefined,
      status: cause instanceof AppError ? cause.status : undefined,
      route: cause instanceof AppError ? cause.route : undefined,
      cause,
    });
  }
}
export async function updateCurrentProfile(
  input: ProfileUpdateInput,
  snapshot: CurrentUser | string | undefined,
  deps: ProfileServiceDeps = {},
): Promise<CurrentUser> {
  if (Object.keys(input).some(k => !['displayName', 'phone'].includes(k)))
    inputError('Trường không được chỉnh sửa.', 'PROFILE_FIELD_NOT_EDITABLE');
  if (input.displayName === undefined && input.phone === undefined)
    inputError('Chưa có thông tin nào để cập nhật.', 'PROFILE_EMPTY_UPDATE');
  if (
    input.displayName !== undefined &&
    (typeof input.displayName !== 'string' ||
      input.displayName.trim() === '' ||
      Array.from(input.displayName.trim()).length > 255)
  )
    inputError('Họ tên phải có từ 1 đến 255 ký tự.');
  if (
    input.phone !== undefined &&
    input.phone !== null &&
    (typeof input.phone !== 'string' || !/^0[0-9]{9}$/.test(input.phone))
  )
    inputError('Số điện thoại phải gồm 10 chữ số, bắt đầu bằng 0.');
  const original = typeof snapshot === 'object' ? snapshot : undefined;
  const version = strongProfileEtag(
    typeof snapshot === 'string'
      ? snapshot
      : original?.etag ?? original?.version,
  );
  if (!version)
    inputError(
      'Cần tải hồ sơ với phiên bản hợp lệ trước khi lưu.',
      'INVALID_VERSION',
    );
  const scope = captureSessionScope();
  return command('profile', async () => {
    assertCurrent(scope);
    const response = await requestForScope(scope, deps, {
      path: PROFILE_PATH,
      method: 'PATCH',
      headers: { 'If-Match': version },
      body: {
        ...(input.displayName === undefined
          ? {}
          : { display_name: input.displayName.trim() }),
        ...(input.phone === undefined ? {} : { phone: input.phone }),
      },
    });
    const user = decodeProfile(response);
    assertProfileOwner(user, scope, original);
    if (Number(user.version) <= Number(version.replace(/"/g, '')))
      invalid('Phản hồi không có phiên bản mới.');
    return user;
  });
}
export function decodeAuthResult(
  response: ApiResponse<unknown>,
  action: 'logout' | 'password',
): Record<string, unknown> {
  const { root, meta } = envelope(response),
    result = record(meta.auth_result);
  if (
    root.data !== null ||
    result.state !== 'SUCCEEDED' ||
    result.durable_request_receipt !== false ||
    result.request_reconcile_supported !== false
  )
    invalid();
  if (
    action === 'logout' &&
    (!['CURRENT_AUTH_SESSION_FAMILY', 'CURRENT_ACCESS_TOKEN_ONLY'].includes(
      String(result.scope),
    ) ||
      result.business_drafts_deleted !== false ||
      result.work_shift_ended !== false)
  )
    invalid();
  if (
    action === 'password' &&
    (result.relogin_required !== true ||
      result.session_policy !== 'RELOGIN_ALL_REFRESH_FAMILIES_REVOKED')
  )
    invalid();
  return result;
}
export function profileErrorMessage(cause: unknown): string {
  if (cause instanceof AppError) {
    const messages: Record<string, string> = {
      PRECONDITION_REQUIRED: 'Cần tải phiên bản hồ sơ trước khi lưu.',
      STALE_VERSION:
        'Hồ sơ đã đổi. Thông tin nhập được giữ; tải bản mới và xem xét lại trước khi lưu.',
      AUTH_SESSION_REQUIRED:
        'Phiên chưa hỗ trợ quản lý thiết bị. Vui lòng đăng nhập lại.',
      CURRENT_SESSION_PROTECTED:
        'Không thể thu hồi phiên hiện tại tại màn này.',
      PROFILE_FIELD_NOT_EDITABLE: 'Trường này không được phép chỉnh sửa.',
      PROFILE_EMPTY_UPDATE: 'Chưa có thay đổi để lưu.',
    };
    const fields = Object.entries(cause.fieldErrors ?? {})
      .map(
        ([field, values]) =>
          (({
            display_name: 'Họ và tên',
            phone: 'Số điện thoại',
            current_password: 'Mật khẩu hiện tại',
            new_password: 'Mật khẩu mới',
            new_password_confirmation: 'Xác nhận mật khẩu',
          }[field] ?? field) +
          ': ' +
          values.join(' ')),
      )
      .join('\n');
    if (fields) return fields;
    return messages[cause.code ?? ''] ?? cause.message;
  }
  return 'Không xử lý được thông tin tài khoản.';
}
