import { wmsFetch } from '../../api/wmsFetch';
import { getCurrentEnvironment, type AppEnvironment } from '../../config/env';
import { P14_DEV, p14DevEnabled } from '../../config/p14Release';
import { isDevRuntimeIdentity } from '../../config/runtimePolicy';
import {
  createRecoveryIdentity,
  type RecoveryIdentity,
} from '../../native/p14RecoveryIdentity';
import { ownerUuid } from '../../app/ownerNavigation';
import {
  parseDocumentTimestamp,
  compareDocumentTimestamps,
} from './documentTimestamps';

export const P14_RECOVERY_PATH = '/api/v1/auth/recovery-requests';
export const P14_RECOVERY_CONTRACT = 'p14-recovery-v1';
export interface RecoveryCommand extends RecoveryIdentity {
  username: string;
}
export interface RecoveryReceipt {
  operationId: string;
  receivedAt: string;
  expiresAt: string;
  state: 'RECEIVED';
  accountAccessGranted: false;
  requestId?: string;
  receiptScope?:'SUPPORT_INTAKE_ONLY';
}
export class RecoveryRequestError extends Error {
  readonly code: string;
  readonly uncertain: boolean;
  readonly status?: number;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;
  constructor(
    code: string,
    message: string,
    options: {
      uncertain?: boolean;
      status?: number;
      requestId?: string;
      retryAfterSeconds?: number;
    } = {},
  ) {
    super(message);
    this.name = 'RecoveryRequestError';
    this.code = code;
    this.uncertain = options.uncertain === true;
    this.status = options.status;
    this.requestId = options.requestId;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}
const object = (v: unknown): Record<string, any> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, any>)
    : {};
function assert(
  v: unknown,
  code: string,
  message = 'Biên nhận hỗ trợ chưa khớp dữ liệu cần xác minh.',
): asserts v {
  if (!v) throw new RecoveryRequestError(code, message);
}
export function recoveryUsername(value: string) {
  const v = value.trim();
  assert(
    v.length > 0 &&
      Array.from(v).length <= 200 &&
      !/[\u0000-\u001f\u007f]/.test(v),
    'RECOVERY_USERNAME_INVALID',
    'Nhập tên đăng nhập hợp lệ, tối đa 200 ký tự.',
  );
  return v;
}
function validateCommand(c: RecoveryCommand) {
  assert(
    ownerUuid(c.operationId) &&
      /^[A-Za-z0-9_-]{43}$/.test(c.proof) &&
      recoveryUsername(c.username) === c.username &&
      Object.keys(c).every(k =>
        ['operationId', 'proof', 'username'].includes(k),
      ),
    'RECOVERY_IDENTITY_INVALID',
    'Không tạo được định danh yêu cầu an toàn.',
  );
}
export function parseRecoveryReceipt(
  raw: unknown,
  operationId: string,
): RecoveryReceipt {
  const b = object(raw),
    d = object(b.data),
    m = object(b.meta),
    received = parseDocumentTimestamp(d.received_at),
    expires = parseDocumentTimestamp(d.expires_at);
  assert(
    b.success === true &&
      m.contract === P14_RECOVERY_CONTRACT &&
      (!Object.hasOwn(m,'receipt_scope')||m.receipt_scope==='SUPPORT_INTAKE_ONLY') &&
      d.operation_id === operationId &&
      ownerUuid(d.operation_id) &&
      d.state === 'RECEIVED' &&
      d.account_access_granted === false &&
      received.status === 'RECORDED' &&
      expires.status === 'RECORDED' &&
      compareDocumentTimestamps(expires, received) > 0,
    'RECOVERY_RECEIPT_INVALID',
  );
  return {
    operationId: d.operation_id,
    receivedAt: d.received_at,
    expiresAt: d.expires_at,
    state: 'RECEIVED',
    accountAccessGranted: false,
    ...(m.receipt_scope==='SUPPORT_INTAKE_ONLY'?{receiptScope:'SUPPORT_INTAKE_ONLY' as const}:{}),
    ...(typeof m.request_id === 'string' ? { requestId: m.request_id } : {}),
  };
}
export function recoveryRetryAfter(value:string|null):number|undefined{
  if(value===null||!/^\d+$/.test(value.trim()))return;
  const seconds=Number(value.trim());return Number.isSafeInteger(seconds)&&seconds>=1?seconds:undefined;
}
/** Anonymous support owner: never attaches auth tokens, refreshes a session, sends OTP or grants access. */
export function createP14RecoveryService(
  deps: {
    fetchImpl?: typeof fetch;
    environment?: AppEnvironment;
    identity?: () => Promise<RecoveryIdentity>;
  } = {},
) {
  const fetchImpl = deps.fetchImpl ?? wmsFetch,
    env = deps.environment ?? getCurrentEnvironment();
  function gate() {
    if (!P14_DEV.recoveryEnabled || !p14DevEnabled(env))
      throw new RecoveryRequestError(
        'RECOVERY_DEV_ONLY',
        'Hỗ trợ khôi phục chỉ mở trên bản DEV/TEST.',
      );
  }
  async function health(signal?: AbortSignal) {
    gate();
    const c = new AbortController(),
      abort = () => c.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(abort, 8000);
    try {
      const r = await fetchImpl(env.apiBaseUrl + '/api/v1/health', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-WMS-Client-Tier': 'dev-test',
        },
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: c.signal,
      } as RequestInit);
      const b = object(await r.json());
      assert(
        r.ok &&
          !r.redirected &&
          isDevRuntimeIdentity(
            object(object(b.data).build).sha,
            r.headers.get('X-WMS-Deployment-Tier'),
          ),
        'RECOVERY_RUNTIME_INVALID',
        'Chưa xác minh được môi trường hỗ trợ DEV/TEST.',
      );
    } catch (e) {
      if (e instanceof RecoveryRequestError) throw e;
      throw new RecoveryRequestError(
        'RECOVERY_RUNTIME_UNAVAILABLE',
        'Chưa xác minh được kết nối hỗ trợ. Vui lòng thử lại.',
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  async function send(
    method: 'GET' | 'POST',
    c: RecoveryCommand,
    signal?: AbortSignal,
  ) {
    gate();
    validateCommand(c);
    await health(signal);
    gate();
    const controller = new AbortController(),
      abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(abort, 15000);
    let dispatched = false;
    try {
      if (controller.signal.aborted)
        throw new RecoveryRequestError(
          'RECOVERY_CANCELLED',
          'Đã dừng đọc yêu cầu.',
        );
      const path =
        method === 'POST'
          ? P14_RECOVERY_PATH
          : P14_RECOVERY_PATH + '/operations/' + c.operationId;
      dispatched = true;
      const response = await fetchImpl(env.apiBaseUrl + path, {
        method,
        headers: {
          Accept: 'application/json',
          'X-WMS-Client-Tier': 'dev-test',
          'X-Recovery-Proof': c.proof,
          ...(method === 'POST'
            ? {
                'Content-Type': 'application/json',
                'Idempotency-Key': c.operationId,
              }
            : {}),
        },
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
        ...(method === 'POST'
          ? { body: JSON.stringify({ username: c.username }) }
          : {}),
      } as RequestInit);
      const b = object(await response.json()),
        error = object(b.error),
        code = String(error.code ?? b.error_code ?? 'RECOVERY_HTTP_ERROR'),
        requestId =
          response.headers.get('X-Request-ID') ?? object(b.meta).request_id;
      if (!response.ok)
        throw new RecoveryRequestError(
          code,
          code === 'RECOVERY_SUPPORT_UNAVAILABLE'
            ? 'Kênh hỗ trợ khôi phục hiện chưa khả dụng. Vui lòng liên hệ quản trị viên.'
            : response.status === 429
            ? 'Có quá nhiều yêu cầu. Vui lòng chờ trước khi gửi lại.'
            : typeof b.message === 'string'
            ? b.message
            : 'Không đọc được kết quả hỗ trợ.',
          {
            status: response.status,
            requestId,
            uncertain:
              method === 'POST' &&
              response.status >= 500 &&
              code !== 'RECOVERY_SUPPORT_UNAVAILABLE',
            ...(response.status === 429
              ? {
                  retryAfterSeconds: recoveryRetryAfter(response.headers.get('Retry-After')),
                }
              : {}),
          },
        );
      assert(
        response.status === (method === 'POST' ? 202 : 200) &&
          !response.redirected &&
          response.headers.get('Content-Type')?.split(';')[0] ===
            'application/json' &&
          (response.headers.get('Cache-Control') ?? '').includes('private') &&
          (response.headers.get('Cache-Control') ?? '').includes('no-store') &&
          response.headers.get('Referrer-Policy') === 'no-referrer',
        'RECOVERY_HEADERS_INVALID',
      );
      try {
        return parseRecoveryReceipt(b, c.operationId);
      } catch (e) {
        if (method === 'POST')
          throw new RecoveryRequestError(
            'RECOVERY_RECEIPT_INVALID',
            'Yêu cầu có thể đã được tiếp nhận nhưng biên nhận chưa xác minh được.',
            { uncertain: true, requestId },
          );
        throw e;
      }
    } catch (e) {
      if (e instanceof RecoveryRequestError) {
        if (
          method === 'POST' &&
          dispatched &&
          e.code === 'RECOVERY_HEADERS_INVALID'
        )
          throw new RecoveryRequestError(e.code, e.message, {
            uncertain: true,
          });
        throw e;
      }
      throw new RecoveryRequestError(
        'RECOVERY_NETWORK_UNKNOWN',
        method === 'POST'
          ? 'Chưa xác định được kết quả gửi. Hãy kiểm tra kết quả trước khi gửi yêu cầu khác.'
          : 'Chưa đọc được kết quả yêu cầu. Vui lòng thử kiểm tra lại.',
        { uncertain: method === 'POST' && dispatched },
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  return {
    async prepare(username: string): Promise<RecoveryCommand> {
      gate();
      const name = recoveryUsername(username),
        identity = await (deps.identity ?? createRecoveryIdentity)();
      const c = { ...identity, username: name };
      validateCommand(c);
      return Object.freeze(c);
    },
    submit: (c: RecoveryCommand, signal?: AbortSignal) =>
      send('POST', c, signal),
    check: (c: RecoveryCommand, signal?: AbortSignal) => send('GET', c, signal),
  };
}
export type P14RecoveryService = ReturnType<typeof createP14RecoveryService>;
