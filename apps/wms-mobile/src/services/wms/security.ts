/** P11 existing routes: approved DEV/TEST use, customer production remains OFF. */
import {
  apiClient,
  type ApiResponse,
  type RequestOptions,
} from '../../api/client';
import {
  captureSessionScope,
  clearPersistedSession,
  clearRefreshInFlight,
  getSession,
  subscribeSession,
} from '../../auth/session';
import { assertP11Connected } from '../../config/p11Release';
import {
  asRecord,
  decodeSecurityContract,
  validateSecurityPasswords,
  type PasswordInput,
  type PasswordPolicy,
  P11_CONTRACT,
  P11_SESSION_POLICY,
} from '../../contracts/p11Security';
import { AppError } from '../../errors/AppError';
import type { CurrentUser } from './types';
import { getAppStorage } from '../../storage/storage';

export type TargetRowId = string & { readonly __kind: 'P11RefreshRowId' };
export type StableSessionId = string & {
  readonly __kind: 'P11StableSessionId';
};
export interface AuthOwner {
  readonly generation: number;
  readonly userId: string | undefined;
  readonly authSessionId: string | undefined;
}
export function captureSecurityOwner(): AuthOwner {
  const s = captureSessionScope();
  return {
    generation: s.generation,
    userId: s.userId,
    authSessionId: s.authSessionId,
  };
}
export function isSecurityOwnerCurrent(owner: AuthOwner): boolean {
  const s = captureSecurityOwner();
  return (
    !!getSession() &&
    Object.keys(owner).every(
      k => owner[k as keyof AuthOwner] === s[k as keyof AuthOwner],
    )
  );
}
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
const pageReads = new Map<string, SecuritySessionPage | null>();
const pageKey = (page: SecuritySessionPage) =>
  JSON.stringify([page.owner, page.meta.current_page, page.meta.per_page]);
const invalid = (): never => {
  throw new AppError({
    kind: 'parse',
    code: 'P11_INVALID_RESPONSE',
    message: 'Phản hồi bảo mật chưa đủ thông tin xác minh.',
  });
};
const blocked = (code: string, message: string): never => {
  throw new AppError({ kind: 'config', code, message });
};
function assertOwner(owner: AuthOwner) {
  if (!isSecurityOwnerCurrent(owner))
    throw new AppError({
      kind: 'auth',
      code: 'STALE_AUTH_RESPONSE',
      message: 'Phiên đã thay đổi. Không dùng phản hồi cũ.',
    });
}
export interface SecurityContext {
  readonly owner: AuthOwner;
  readonly policy: PasswordPolicy;
  readonly contractVersion: typeof P11_CONTRACT;
  readonly productionReady: false;
  /** Display-only snapshot from the verified caller; never sent or persisted. */
  readonly displayContext?: {readonly accountName:string|null;readonly warehouseName:string|null};
}
export function securityContextFromProfile(user: CurrentUser): SecurityContext {
  const owner = captureSecurityOwner();
  assertOwner(owner);
  const policy = decodeSecurityContract(
    asRecord(user.profile_meta).security_contract,
  );
  if (
    !policy ||
    !uuid(owner.userId) ||
    user.id !== owner.userId ||
    (user.auth_session_id ?? undefined) !== owner.authSessionId
  )
    blocked(
      'P11_POLICY_UNAVAILABLE',
      'Chưa có chính sách mật khẩu hợp lệ của phiên hiện tại.',
    );
  return Object.freeze({
    owner,
    policy: policy!,
    contractVersion: P11_CONTRACT,
    productionReady: false,
    displayContext:Object.freeze({
      accountName:typeof user.name==='string'&&user.name.trim()?user.name.trim():null,
      warehouseName:user.active_warehouse_id&&user.active_warehouse_id===getSession()?.activeWarehouseId
        ? user.available_warehouses?.find(w=>w.warehouse_id===user.active_warehouse_id)?.name?.trim()||null
        : null,
    }),
  });
}

/**
 * `/auth/me` is intentionally blocked while must_change_password=true. This
 * minimal policy only prevents empty/mismatched input; BE remains authoritative
 * and a 422 response upgrades the context with its exact password_policy.
 */
export function forcedPasswordBootstrapContext(): SecurityContext {
  const owner = captureSecurityOwner();
  assertOwner(owner);
  if (!uuid(owner.userId))
    blocked(
      'P11_FORCED_OWNER_UNAVAILABLE',
      'Phiên đổi mật khẩu chưa có định danh người dùng hợp lệ.',
    );
  const policy: PasswordPolicy = Object.freeze({
    version: 'p11-password-bootstrap-server-authoritative',
    minLength: 1,
    maxLength: 255,
    maxUtf8Bytes: null,
    nulAllowed: false,
    confirmationRequired: true,
    confirmationField: 'new_password_confirmation',
    currentPasswordRequired: true,
    lengthUnit: 'UNICODE_CHARACTERS',
    compositionRules: [] as const,
    inputNormalization: 'EXISTING_REQUEST_MIDDLEWARE',
    hasher: 'server-authoritative',
    sessionPolicy: P11_SESSION_POLICY,
    keepSessionsSupported: false,
  });
  return Object.freeze({
    owner,
    policy,
    contractVersion: P11_CONTRACT,
    productionReady: false,
  });
}
export function securityContextWithPolicy(
  context: SecurityContext,
  policy: PasswordPolicy,
): SecurityContext {
  assertOwner(context.owner);
  return Object.freeze({ ...context, policy });
}
export interface SecurityServiceDeps {
  readonly request?: <T>(options: RequestOptions) => Promise<ApiResponse<T>>;
  readonly clearLocalSession?: () => Promise<void>;
  readonly context?: SecurityContext;
}
function envelope(response: ApiResponse<unknown>) {
  const root = asRecord(response.data);
  if (
    response.status !== 200 ||
    root.success !== true ||
    !('data' in root) ||
    !root.meta ||
    typeof root.meta !== 'object'
  )
    invalid();
  return { root, meta: asRecord(root.meta) };
}
let generation = -1;
const commands = new Map<string, 'busy' | 'unknown'>();
const markerPrefix = 'p11-command-uncertain/v1/';
const markerKey = (action: string, actor = captureSecurityOwner().userId) =>
  actor ? markerPrefix + actor + '/' + action : undefined;
function writeMarker(action: string, owner: AuthOwner) {
  const key = markerKey(action, owner.userId);
  if (!key) blocked('P11_OWNER_REQUIRED', 'Cần đúng tài khoản trước khi gửi.');
  const value = JSON.stringify({
    schema: 'p11-uncertain-v1',
    actorId: owner.userId,
    authSessionId: owner.authSessionId,
    action,
    state: 'UNKNOWN',
  });
  const store = getAppStorage();
  store.setString(key!, value);
  if (store.getString(key!) !== value)
    blocked(
      'P11_JOURNAL_FAILED',
      'Không giữ được định danh yêu cầu. Chưa gửi lệnh.',
    );
}
function clearMarker(action: string, owner: AuthOwner) {
  const key = markerKey(action, owner.userId);
  if (key) getAppStorage().remove(key);
}
const commandListeners = new Set<() => void>();
const pageTickets = new Map<string, number>();
let nextPageTicket = 0;
export function subscribeSecurityCommands(listener: () => void) {
  commandListeners.add(listener);
  return () => {
    commandListeners.delete(listener);
  };
}
const notifyCommands = () => {
  for (const listener of commandListeners) listener();
};
subscribeSession(() => {
  const next = captureSecurityOwner().generation;
  if (next !== generation || !getSession()) {
    commands.clear();
    pageReads.clear();
    pageTickets.clear();
    generation = next;
    notifyCommands();
  }
  if(getSession()&&noticeOwner&&!isSecurityOwnerCurrent(noticeOwner))
    clearSecurityResultNotice();
});
export function securityCommandBlocked(action: string): boolean {
  const next = captureSecurityOwner().generation;
  if (next !== generation) {
    commands.clear();
    generation = next;
  }
  const key = markerKey(action);
  return commands.has(action) || !!(key && getAppStorage().has(key));
}
export const isSecurityUnknown = (cause: unknown) =>
  cause instanceof AppError && cause.code === 'P11_UNKNOWN';
async function scopedRequest(
  owner: AuthOwner,
  deps: SecurityServiceDeps,
  options: RequestOptions,
): Promise<ApiResponse<unknown>> {
  assertOwner(owner);
  try {
    return await (deps.request ?? apiClient.request)<unknown>(options);
  } catch (cause) {
    if (
      cause instanceof AppError &&
      cause.status === 401 &&
      isSecurityOwnerCurrent(owner)
    ) {
      clearRefreshInFlight();
      await (deps.clearLocalSession ?? clearPersistedSession)();
    }
    throw cause;
  }
}
async function command<T>(
  action: string,
  owner: AuthOwner,
  operation: () => Promise<T>,
): Promise<T> {
  if (securityCommandBlocked(action))
    throw new AppError({
      kind: 'unknown',
      code: 'P11_UNKNOWN',
      message: 'Yêu cầu đang xử lý hoặc chưa rõ kết quả. Chưa thể gửi lại.',
    });
  const stamp = generation;
  writeMarker(action, owner);
  commands.set(action, 'busy');
  notifyCommands();
  try {
    const result = await operation();
    if (stamp === generation) {
      commands.delete(action);
      clearMarker(action, owner);
    }
    return result;
  } catch (cause) {
    const e = cause instanceof AppError ? cause : undefined;
    const known =
      !!e &&
      (['config', 'blocked_by_gate', 'auth'].includes(e.kind) ||
        (e.kind === 'http' &&
          (e.status === 422 ||
            e.status === 403 ||
            (e.status === 409 && e.code === 'CURRENT_SESSION_PROTECTED'))));
    if (stamp === generation) {
      if (known) {
        commands.delete(action);
        clearMarker(action, owner);
      } else commands.set(action, 'unknown');
    }
    if (known) throw cause;
    throw new AppError({
      kind: 'unknown',
      code: 'P11_UNKNOWN',
      status: e?.status,
      requestId: e?.requestId,
      route: e?.route,
      message:
        'Chưa xác định kết quả. Không gửi lại lệnh. Đọc danh sách hoặc đăng nhập lại không chứng minh yêu cầu trước; cần DEV/BE hỗ trợ.',
    });
  } finally {
    notifyCommands();
  }
}
export interface PasswordChangeResult {
  readonly state: 'SUCCEEDED';
  readonly passwordChangedAt: string | null;
  readonly passwordPolicyVersion: string;
  readonly reloginRequired: true;
  readonly sessionPolicy: typeof P11_SESSION_POLICY;
  readonly durableRequestReceipt: false;
  readonly requestReconcileSupported: false;
  readonly displayContext?: SecurityContext['displayContext'];
}
export function decodePasswordChangeResult(
  response: ApiResponse<unknown>,
): PasswordChangeResult {
  const { root, meta } = envelope(response),
    r = asRecord(meta.auth_result),
    time = r.password_changed_at;
  if (
    root.data !== null ||
    r.state !== 'SUCCEEDED' ||
    r.relogin_required !== true ||
    r.session_policy !== P11_SESSION_POLICY ||
    r.durable_request_receipt !== false ||
    r.request_reconcile_supported !== false ||
    typeof r.password_policy_version !== 'string' ||
    !r.password_policy_version ||
    !(
      time == null ||
      (typeof time === 'string' &&
        /^\d{4}-\d\d-\d\dT/.test(time) &&
        /(?:Z|[+-]\d\d:\d\d)$/i.test(time) &&
        Number.isFinite(Date.parse(time)))
    )
  )
    invalid();
  return {
    state: 'SUCCEEDED',
    passwordChangedAt: typeof time === 'string' ? time : null,
    passwordPolicyVersion: r.password_policy_version as string,
    reloginRequired: true,
    sessionPolicy: P11_SESSION_POLICY,
    durableRequestReceipt: false,
    requestReconcileSupported: false,
  };
}
// Non-secret synchronous result notice, never durable receipt/account hydration.
let notice: PasswordChangeResult | undefined;
let noticeOwner:AuthOwner|undefined;
const noticeListeners = new Set<
  (result: PasswordChangeResult | undefined) => void
>();
export const getSecurityResultNotice = () => notice;
export function clearSecurityResultNotice() {
  notice = undefined;
  noticeOwner = undefined;
  noticeListeners.forEach(fn => fn(undefined));
}
export function subscribeSecurityResultNotice(
  fn: (result: PasswordChangeResult | undefined) => void,
) {
  noticeListeners.add(fn);
  return () => {
    noticeListeners.delete(fn);
  };
}
export async function changeSecurityPassword(
  input: PasswordInput,
  deps: SecurityServiceDeps = {},
): Promise<PasswordChangeResult> {
  const owner = captureSecurityOwner(),
    context = deps.context;
  if (!context || !isSecurityOwnerCurrent(context.owner))
    blocked(
      'P11_POLICY_UNAVAILABLE',
      'Cần tải chính sách mật khẩu hợp lệ trước khi gửi.',
    );
  const errors = validateSecurityPasswords(input, context!.policy);
  if (Object.keys(errors).length)
    throw new AppError({
      kind: 'config',
      code: 'P11_LOCAL_VALIDATION',
      message: 'Kiểm tra các ô mật khẩu.',
      fieldErrors: Object.fromEntries(
        Object.entries(errors).map(([k, v]) => [
          (
            {
              currentPassword: 'current_password',
              newPassword: 'new_password',
              newPasswordConfirmation: 'new_password_confirmation',
            } as Record<string, string>
          )[k],
          [v!],
        ]),
      ),
    });
  if (!deps.request) assertP11Connected('POST', '/api/v1/auth/change-password');
  return command('password', owner, async () => {
    const response = await scopedRequest(owner, deps, {
      path: '/api/v1/auth/change-password',
      method: 'POST',
      body: {
        current_password: input.currentPassword,
        new_password: input.newPassword,
        new_password_confirmation: input.newPasswordConfirmation,
      },
    });
    assertOwner(owner);
    const decoded = decodePasswordChangeResult(response);
    const result:PasswordChangeResult = context?.displayContext
      ? {...decoded,displayContext:Object.freeze({...context.displayContext})}
      : decoded;
    clearMarker('password', owner);
    notice = result;
    noticeOwner = {...owner};
    noticeListeners.forEach(fn => fn(result));
    assertOwner(owner);
    clearRefreshInFlight();
    await (deps.clearLocalSession ?? clearPersistedSession)();
    return result;
  });
}
export interface SecuritySession {
  readonly targetRowId: TargetRowId;
  readonly stableSessionId: StableSessionId;
  /** Compatibility display aliases. DELETE never falls back to them. */
  readonly id: string;
  readonly authSessionId: string;
  readonly deviceLabel: string | null;
  readonly location: string | null;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  readonly lastActiveAt: string | null;
  readonly expiresAt: string | null;
  readonly isCurrent: boolean | null;
  readonly canRevoke: boolean | null;
  readonly metadataSource: string;
  readonly lastActiveSemantics: string;
}
export interface SecuritySessionPage {
  readonly owner: AuthOwner;
  readonly currentStableSessionId: StableSessionId | null;
  readonly items: readonly SecuritySession[];
  readonly meta: Record<string, unknown> & {
    total: number;
    current_page: number;
    per_page: number;
    last_page: number;
    from: number | null;
    to: number | null;
  };
  readonly links: Record<string, unknown>;
}
export function canRevokeSecuritySession(
  target: SecuritySession,
  page: SecuritySessionPage,
): boolean {
  return (
    isSecurityOwnerCurrent(page.owner) &&
    (!pageReads.has(pageKey(page)) || pageReads.get(pageKey(page)) === page) &&
    page.items.every(
      r =>
        r.isCurrent === (r.stableSessionId === page.currentStableSessionId) &&
        r.canRevoke === (r.stableSessionId !== page.currentStableSessionId),
    ) &&
    uuid(page.currentStableSessionId) &&
    uuid(target.targetRowId) &&
    uuid(target.stableSessionId) &&
    target.id === target.targetRowId &&
    target.authSessionId === target.stableSessionId &&
    target.stableSessionId !== page.currentStableSessionId &&
    target.isCurrent === false &&
    target.canRevoke === true &&
    page.items.some(
      r =>
        r.targetRowId === target.targetRowId &&
        r.stableSessionId === target.stableSessionId &&
        r.isCurrent === false &&
        r.canRevoke === true,
    )
  );
}
export function decodeSecuritySessions(
  response: ApiResponse<unknown>,
  owner: AuthOwner,
  page = 1,
  perPage = 20,
): SecuritySessionPage {
  const { root, meta } = envelope(response),
    c = asRecord(meta.session_contract),
    current = meta.current_session_id;
  if (
    !Array.isArray(root.data) ||
    c.version !== P11_CONTRACT ||
    c.stable_session_id !== 'session_id' ||
    c.target_id !== 'id' ||
    c.target_id_kind !== 'REFRESH_TOKEN_ROW_UUID' ||
    c.stable_family_id !== 'auth_session_id' ||
    c.count_unit !== 'ACTIVE_AUTH_SESSION_FAMILY' ||
    c.current_family_protected !== true ||
    c.pagination !== 'PAGE_LIVE_NOT_FROZEN' ||
    c.request_receipt_supported !== false ||
    !['total', 'current_page', 'per_page', 'last_page'].every(
      k =>
        Number.isSafeInteger(meta[k]) &&
        Number(meta[k]) >= (k === 'total' ? 0 : 1),
    ) ||
    meta.current_page !== page ||
    meta.per_page !== perPage ||
    !('from' in meta) ||
    !('to' in meta) ||
    ![meta.from, meta.to].every(
      v => v === null || (Number.isSafeInteger(v) && Number(v) > 0),
    ) ||
    !root.links ||
    typeof root.links !== 'object'
  )
    invalid();
  const nullable = (v: unknown): string | null =>
    v === null || typeof v === 'string' ? v : invalid();
  const seen = new Set<string>(),
    rows = new Set<string>();
  const items = (root.data as unknown[]).map(value => {
    const r = asRecord(value);
    if (
      !uuid(r.id) ||
      !uuid(r.session_id) ||
      r.auth_session_id !== r.session_id ||
      seen.has(r.session_id) ||
      rows.has(r.id)
    )
      invalid();
    seen.add(r.session_id as string);
    rows.add(r.id as string);
    return {
      id: r.id as string,
      authSessionId: r.auth_session_id as string,
      targetRowId: r.id as TargetRowId,
      stableSessionId: r.session_id as StableSessionId,
      deviceLabel: nullable(r.device_label),
      location: nullable(r.location),
      userAgent: nullable(r.user_agent),
      ipAddress: nullable(r.ip_address),
      lastActiveAt: nullable(r.last_active_at),
      expiresAt: nullable(r.expires_at),
      isCurrent: typeof r.is_current === 'boolean' ? r.is_current : null,
      canRevoke: typeof r.can_revoke === 'boolean' ? r.can_revoke : null,
      metadataSource: String(r.metadata_source ?? ''),
      lastActiveSemantics: String(r.last_active_semantics ?? ''),
    };
  });
  return {
    owner,
    currentStableSessionId: uuid(current) ? (current as StableSessionId) : null,
    items,
    meta: meta as SecuritySessionPage['meta'],
    links: asRecord(root.links),
  };
}
export async function fetchSecuritySessions(
  deps: SecurityServiceDeps = {},
  page = 1,
  perPage = 20,
): Promise<SecuritySessionPage> {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 100000 ||
    !Number.isSafeInteger(perPage) ||
    perPage < 1 ||
    perPage > 100
  )
    blocked('P11_INVALID_PAGING', 'Phân trang phiên không hợp lệ.');
  if (!deps.request) assertP11Connected('GET', '/api/v1/auth/sessions');
  const owner = captureSecurityOwner();
  // Starting a live reread invalidates the old target even when the read fails.
  const readKey = JSON.stringify([owner, page, perPage]),
    ticket = ++nextPageTicket;
  pageTickets.set(readKey, ticket);
  pageReads.set(readKey, null);
  const response = await scopedRequest(owner, deps, {
    path: '/api/v1/auth/sessions',
    method: 'GET',
    query: { page, per_page: perPage },
  });
  assertOwner(owner);
  if (pageTickets.get(readKey) !== ticket)
    throw new AppError({
      kind: 'cancelled',
      code: 'P11_STALE_PAGE_RESPONSE',
      message: 'Trang phiên đã được đọc lại bằng yêu cầu mới hơn.',
    });
  const decoded = decodeSecuritySessions(response, owner, page, perPage);
  for (const [key, value] of pageReads)
    if (value && !isSecurityOwnerCurrent(value.owner)) pageReads.delete(key);
  pageReads.set(pageKey(decoded), decoded);
  return decoded;
}
export async function revokeSecuritySession(
  target: SecuritySession,
  deps: SecurityServiceDeps = {},
  page?: SecuritySessionPage,
): Promise<Record<string, unknown>> {
  if (!page || !canRevokeSecuritySession(target, page))
    blocked(
      'CURRENT_SESSION_PROTECTED',
      'Phiên hiện tại, dữ liệu cũ hoặc quyền thu hồi chưa được xác minh.',
    );
  if (!deps.request)
    assertP11Connected('DELETE', '/api/v1/auth/sessions/' + target.targetRowId);
  const owner = captureSecurityOwner();
  return command('revoke', owner, async () => {
    assertOwner(owner);
    const response = await scopedRequest(owner, deps, {
      path: '/api/v1/auth/sessions/' + target.targetRowId,
      method: 'DELETE',
    });
    assertOwner(owner);
    const { root } = envelope(response),
      r = asRecord(root.data);
    if (
      r.id !== target.targetRowId ||
      r.session_id !== target.stableSessionId ||
      r.auth_session_id !== target.stableSessionId ||
      r.revoked !== true ||
      typeof r.already_revoked !== 'boolean' ||
      r.was_current !== false ||
      r.revocation_scope !== 'AUTH_SESSION_FAMILY' ||
      r.request_receipt_supported !== false
    )
      invalid();
    return r;
  });
}
export function securityFieldErrors(
  cause: unknown,
): Partial<Record<keyof PasswordInput, string>> {
  if (!(cause instanceof AppError)) return {};
  const codes: Record<string, Partial<Record<keyof PasswordInput, string>>> = {
    CURRENT_PASSWORD_INCORRECT: {
      currentPassword: 'Mật khẩu hiện tại không đúng.',
    },
    PASSWORD_CONFIRMATION_REQUIRED: {
      newPasswordConfirmation: 'Vui lòng xác nhận mật khẩu mới.',
    },
    PASSWORD_CONFIRMATION_MISMATCH: {
      newPasswordConfirmation: 'Mật khẩu xác nhận chưa khớp.',
    },
    PASSWORD_POLICY_VIOLATION: {
      newPassword: 'Mật khẩu mới chưa đáp ứng chính sách WMS.',
    },
    PASSWORD_INPUT_INVALID: {
      currentPassword: 'Kiểm tra định dạng mật khẩu đã nhập.',
    },
  };
  if (codes[cause.code ?? '']) return codes[cause.code!];
  if (cause.code === 'P11_LOCAL_VALIDATION')
    return Object.fromEntries(
      Object.entries(cause.fieldErrors ?? {}).map(([k, v]) => [
        (
          {
            current_password: 'currentPassword',
            new_password: 'newPassword',
            new_password_confirmation: 'newPasswordConfirmation',
          } as Record<string, string>
        )[k],
        v[0],
      ]),
    );
  return {};
}
