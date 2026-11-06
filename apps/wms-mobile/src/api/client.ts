import { p10DevTestAllowed, verifyP10DevRuntime } from '../config/p10DevTest';
import { assertP19DevConnected } from '../config/p19Release';
import {
  getSessionGeneration,
  isTerminalSessionCode,
  terminateAuthSession,
  observeAccountSessionPolicy,
  markPasswordChangeRequired,
} from '../auth/session';
import {
  assertP10Connected,
  isP10CommandOrSessions,
} from '../config/p10Release';
import {
  assertP11Connected,
  isP11Request,
  p11DevRequestAllowed,
  verifyP11DevRuntime,
} from '../config/p11Release';
import { asRecord, decodePasswordPolicy } from '../contracts/p11Security';
/**
 * API client — nền tảng HTTP.
 *
 * Quyết định đã chốt: giữ `fetch` của RN, KHÔNG thêm Axios. Prompt 2 §4 cho phép
 * Axios "nếu đã được duyệt" — chưa duyệt, nên không thêm dependency.
 *
 * Ba lệnh cấm của GATE_01 §11 được cưỡng chế ngay tại đây:
 *
 *  - Rule 6 — không bao giờ gắn header `Idempotency-Key`. Client này không có
 *    đường nào đặt header đó; xem `assertNoForbiddenHeaders`.
 *  - Rule 4/5 — không gọi mutation lên môi trường WMS chưa qua Gate. Mọi
 *    method khác GET/HEAD bị chặn khi `environment.wmsGateApproved === false`.
 *  - Không tự retry request ghi: client này KHÔNG có cơ chế retry nào.
 *
 * Không tắt TLS ở bất kỳ đâu. Cleartext chỉ bật ở bản debug, do RN gradle plugin
 * đặt qua manifest placeholder `usesCleartextTraffic`.
 */

import {
  AppError,
  extractErrorCode,
  extractErrorMessage,
  extractRequestId,
  toAppError,
  type AppErrorKind,
} from '../errors/AppError';
import { USER_AGENT, isEdgeBlocked } from './userAgent';
import {
  skuCodeFromErrorBody,
  skuInactiveMessage,
} from '../errors/skuInactiveMessage';
import {
  allowsIdempotencyKey,
  allowsIfMatch,
  approvedWriteFor,
  usesMultipart,
  isP09Command,
} from './writeGate';
import {
  assertP09Connected,
  assertP09ReadConnected,
  p09DevReadPath,
  isP09Request,
} from '../config/p09Release';
import { getActiveSession, getSession } from '../auth/session';
import {
  usesBodyTokenTransport,
  usesCookieTokenTransport,
} from '../auth/tokenTransport';
import { recordServerTime, readServerTimestamp } from '../auth/serverClock';
import { refreshSession, REFRESH_PATH } from '../auth/tokenRefresh';
import { getCurrentEnvironment, type AppEnvironment } from '../config/env';
import { CLIENT_TIER_HEADER } from '../config/deployment';
import { logger, type Logger } from '../logging/logger';
import { contextReleaseVerified } from '../config/homeContextRelease';
import {
  p12ReadPath,
  p12BinaryPath,
  verifyP12Runtime,
} from '../config/p12Release';
import { bindShiftOwnerHeaders } from '../shift/ownerHeaders';
import { p14ClosurePath, verifyP14Runtime } from '../config/p14Release';
import { assertP14ClosureRequest } from '../shift/p14RequestGuard';
import { wmsFetch } from './wmsFetch';
import { assertBeAppRead } from '../config/beAppReadRelease';
import { assertP12TimelineRead } from './p12TimelineRead';

export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const SAFE_METHODS: ReadonlySet<HttpMethod> = new Set<HttpMethod>([
  'GET',
  'HEAD',
]);

/**
 * Header bị cấm — **trừ** các thao tác có ngoại lệ ghi trong `writeGate.ts`.
 *
 * 🔧 `if-match` thêm 2026-09-06. Trước đó nó **không** nằm trong danh sách này:
 * lệnh cấm chỉ được giữ bằng việc "không chỗ nào gửi" cộng một test quét mã
 * nguồn. Nay `post-receipt` gửi thật, nên phải có chốt lúc chạy — nếu không thì
 * ngày ai đó gửi `If-Match` lên một endpoint khác sẽ không gì cản.
 */
const FORBIDDEN_HEADERS: readonly string[] = ['idempotency-key', 'if-match'];

/**
 * 🔓 **Ngoại lệ HẸP cho cổng chặn ghi — Change Control 2026-09-05.**
 *
 * `GATE_01 §11` #4 chặn mọi method khác GET/HEAD tới môi trường WMS. Ba đường
 * dưới đây được miễn, vì chúng **không thay đổi dữ liệu nghiệp vụ nào**: không
 * đụng tồn kho, không tạo/sửa phiếu, không ghi scan.
 *
 * Vì sao phải miễn: ngày 2026-09-05 người dùng chọn nhánh **"tự gia hạn ngầm"**
 * cho phiên đăng nhập. Nhánh đó **bắt buộc** app gọi được `POST /auth/refresh`.
 * Không miễn thì lựa chọn ấy không thực hiện được.
 *
 * So khớp **tuyệt đối**, cố ý không dùng tiền tố: `/api/v1/auth/refresh` qua
 * được, còn `/api/v1/auth/refresh/../inbound-documents` thì không.
 *
 * ⚠️ Thêm bất kỳ đường nào vào danh sách này là **nới một lệnh cấm của Gate**.
 * Phải có Change Control ghi trong `GATE_WMS_API_INTEGRATION` — không tự thêm.
 */
const GATE_EXEMPT_AUTH_PATHS: readonly string[] = [
  '/api/v1/auth/login',
  '/api/v1/auth/mfa/verify',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/verify-otp',
  '/api/v1/auth/reset-password',
];
const PASSWORD_RECOVERY_PATHS: readonly string[] = [
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/verify-otp',
  '/api/v1/auth/reset-password',
];

export function isPasswordRecoveryPath(path: string): boolean {
  return PASSWORD_RECOVERY_PATHS.includes(path);
}

/** BE auth contract: tokens are returned/accepted in JSON body for the whole
 * auth triplet. This marker makes Login return the refresh token too. */
export const WMS_TOKEN_TRANSPORT_HEADER = 'X-WMS-Token-Transport';
const BODY_TOKEN_AUTH_PATHS: readonly string[] = [
  '/api/v1/auth/login',
  '/api/v1/auth/mfa/verify',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
];

function isTokenTransportAuthPath(path: string): boolean {
  return BODY_TOKEN_AUTH_PATHS.includes(path);
}

export function isGateExemptAuthPath(path: string): boolean {
  return GATE_EXEMPT_AUTH_PATHS.includes(path);
}

export interface RequestOptions {
  /** Explicit read representation, limited to the released P13/BOX GET owners. */
  beAppRead?: 'p13' | 'p18-boxes' | 'p18-location';
  /** Opt-in P18 upload contract; only owner multipart upload may use its stable key. */
  p18Upload?: true;
  /** User-approved P12 DEV GET only; does not enable standalone P09 commands. */
  p12Read?: true;
  /** Only P09 command/reconcile receipts may survive HTTP error envelopes. */
  receiptTransport?: 'p09';
  /** Only the P09 attachment download GET supports authenticated binary. */
  responseType?: 'blob';
  method?: HttpMethod;
  /** Đường dẫn tương đối, ví dụ `/api/v1/...`. */
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Cho phép bên gọi huỷ request. Kết hợp với timeout nội bộ. */
  signal?: AbortSignal;
  /** Ghi đè timeout của môi trường. */
  timeoutMs?: number;
}

export interface ApiResponse<T> {
  readonly status: number;
  readonly data: T;
  /**
   * Tra một header phản hồi, **không phân biệt hoa thường**.
   *
   * 🔧 Thêm 2026-09-06 cho preflight tier: `X-WMS-Deployment-Tier` là nguồn có
   * thẩm quyền duy nhất về việc đang nói chuyện với stack nào, mà trước đó
   * client này vứt toàn bộ header phản hồi đi.
   *
   * Là **hàm** chứ không phải object: bên test dựng giả dễ, và không ràng buộc
   * vào kiểu `Headers` của môi trường chạy. Để **tuỳ chọn** vì một client giả
   * hoàn toàn có thể không phơi header nào — bên gọi phải chịu được điều đó.
   */
  readonly header?: (name: string) => string | undefined;
}

export interface ApiClientDeps {
  environment?: AppEnvironment;
  fetchImpl?: typeof fetch;
  log?: Logger;
  /** Lấy phiên hiện hành; tách ra để test không cần storage thật. */
  getSession?: typeof getActiveSession;
}

/**
 * Header bị cấm — nay xét theo cặp **method + đường dẫn**.
 *
 * 🔓 **Nới hẹp 2026-09-06 theo `GATE_WMS §2e`.** Trước đây `Idempotency-Key` bị
 * cấm tuyệt đối. Nay **đúng một** thao tác được miễn: `POST inbound/record`, vì
 * spec khai header đó là **bắt buộc** cho nó.
 *
 * Mặc định `method` là `GET` — nghĩa là bên gọi quên truyền thì header vẫn bị
 * cấm. Ngoại lệ phải nói ra, không được rơi vào theo mặc định.
 *
 * Mọi thao tác khác vẫn cấm y như cũ. `If-Match` **không có ngoại lệ nào** —
 * `post-receipt` chưa được duyệt (người dùng trả lời *"chưa duyệt C"*).
 */
export function assertNoForbiddenHeaders(
  headers: Record<string, string>,
  path = '',
  method: HttpMethod = 'GET',
  p18Upload = false,
): void {
  for (const key of Object.keys(headers)) {
    const lower = key.toLowerCase();

    if (
      lower === 'idempotency-key' &&
      (allowsIdempotencyKey(method, path) ||
        (p18Upload &&
          headers['X-Upload-Contract'] === 'owner-attachment-upload-v1'))
    ) {
      continue;
    }

    if (lower === 'if-match' && allowsIfMatch(method, path)) {
      continue;
    }

    if (FORBIDDEN_HEADERS.includes(lower)) {
      throw new AppError({
        kind: 'blocked_by_gate',
        message:
          'Header "' +
          key +
          '" chưa được duyệt cho ' +
          method +
          ' "' +
          path +
          '" (GATE_01 §11 rule 6; ngoại lệ hẹp ở GATE_WMS §2e).',
      });
    }
  }
}

export function buildUrl(
  baseUrl: string,
  path: string,
  query?: RequestOptions['query'],
): string {
  const normalisedBase = baseUrl.replace(/\/+$/, '');
  const normalisedPath = path.startsWith('/') ? path : '/' + path;
  let url = normalisedBase + normalisedPath;

  if (query !== undefined) {
    const pairs: string[] = [];
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) {
        continue;
      }
      pairs.push(
        encodeURIComponent(key) + '=' + encodeURIComponent(String(value)),
      );
    }
    if (pairs.length > 0) {
      url += (url.includes('?') ? '&' : '?') + pairs.join('&');
    }
  }
  return url;
}

/** Response giả trong test hoặc adapter web cũ có thể không phơi `Headers`. */
function responseHeader(response: Response, name: string): string | undefined {
  const headers = (response as unknown as { headers?: Headers }).headers;
  if (headers === undefined || typeof headers.get !== 'function') {
    return undefined;
  }
  return headers.get(name) ?? undefined;
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = responseHeader(response, 'retry-after')?.trim();
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Math.max(0, Number(value));
  const at = Date.parse(value);
  return Number.isFinite(at)
    ? Math.max(0, Math.ceil((at - Date.now()) / 1000))
    : undefined;
}

export function createApiClient(deps: ApiClientDeps = {}) {
  const log = deps.log ?? logger;
  const fetchImpl = deps.fetchImpl ?? wmsFetch;
  const readSession = deps.getSession ?? getActiveSession;

  async function sendOnce<T>(options: RequestOptions): Promise<ApiResponse<T>> {
    const authGeneration = getSessionGeneration();
    const environment = deps.environment ?? getCurrentEnvironment();
    const method: HttpMethod = options.method ?? 'GET';
    assertP12TimelineRead(options, environment);
    if (
      method === 'POST' &&
      [
        '/api/v1/mini-app/warranty-component-issues/resolve-code',
        '/api/v1/mini-app/warranty-component-issues/record',
      ].includes(options.path)
    )
      assertP19DevConnected();
    options = { ...options, headers: bindShiftOwnerHeaders(options) };
    if (
      approvedWriteFor(method, options.path) === 'workShift.end' ||
      p14ClosurePath(method, options.path)
    ) {
      assertP14ClosureRequest({ ...options, method }, environment);
      await verifyP14Runtime(fetchImpl, environment);
      assertP14ClosureRequest({ ...options, method }, environment);
    }
    assertBeAppRead(options, environment);
    if (options.beAppRead) await verifyP12Runtime(fetchImpl, environment);
    const p12 = options.p12Read === true;
    if (p12) {
      if (
        !p12ReadPath(method, options.path) ||
        Object.prototype.hasOwnProperty.call(options, 'body') ||
        Object.keys(options.headers ?? {}).some(k =>
          [
            'authorization',
            'idempotency-key',
            'if-match',
            'x-request-id',
          ].includes(k.toLowerCase()),
        )
      )
        throw new AppError({
          kind: 'blocked_by_gate',
          code: 'P12_GET_ONLY',
          message: 'Chứng từ chỉ đọc đúng nguồn đã chốt.',
        });
      await verifyP12Runtime(fetchImpl, environment);
    }
    // GET me is the shared P01/P02 identity read, not a P10/P11 command or
    // security rollout. A security runtime pin must not lock the whole app
    // before it can read its authenticated user. Dedicated profile decoders,
    // P11 session reads/commands and the deployment-tier preflight stay intact.
    const sharedIdentityRead =
      method === 'GET' &&
      '/' + options.path.split('?')[0].split('/').filter(Boolean).join('/') ===
        '/api/v1/auth/me';
    if (
      !sharedIdentityRead &&
      p11DevRequestAllowed(method, options.path, environment)
    )
      await verifyP11DevRuntime(fetchImpl, environment);
    else if (
      !sharedIdentityRead &&
      p10DevTestAllowed(method, options.path, environment)
    )
      await verifyP10DevRuntime(fetchImpl, environment);
    if (isP11Request(method, options.path))
      assertP11Connected(method, options.path, environment);
    else if (isP10CommandOrSessions(method, options.path))
      assertP10Connected(method, options.path, environment);
    if (
      isP11Request(method, options.path) &&
      Object.keys(options.headers ?? {}).some(k =>
        ['idempotency-key', 'if-match', 'x-request-id'].includes(
          k.toLowerCase(),
        ),
      )
    )
      throw new AppError({
        kind: 'config',
        code: 'P11_UNSUPPORTED_COMMAND_HEADER',
        message: 'API bảo mật chưa hỗ trợ khóa retry hoặc phiên bản ghi.',
      });
    if (isP09Request(method, options.path) && !p12) {
      if (p09DevReadPath(method, options.path)) assertP09ReadConnected();
      else assertP09Connected();
    }
    const p09Receipt =
      isP09Command(method, options.path) ||
      (method === 'GET' &&
        /^\/api\/v1\/mini-app\/warranty-requests\/[^/?]+$/.test(options.path));
    const p09Binary =
      method === 'GET' &&
      /^\/api\/v1\/mini-app\/warranty-attachments\/[0-9a-f-]+\/download$/i.test(
        options.path,
      );
    if (
      (options.receiptTransport && !p09Receipt) ||
      (options.responseType &&
        !p09Binary &&
        !(p12 && p12BinaryPath(options.path)))
    ) {
      throw new AppError({
        kind: 'blocked_by_gate',
        message: 'Transport chỉ được phép cho đúng endpoint P09.',
      });
    }
    if (
      isP09Command(method, options.path) &&
      Object.keys(options.headers ?? {}).some(k =>
        k.toLowerCase().startsWith('x-draft-'),
      )
    ) {
      throw new AppError({
        kind: 'blocked_by_gate',
        code: 'P09_P03_LINK_PENDING',
        message: 'Liên kết phiếu P03 đang chờ BE xác nhận compatibility.',
      });
    }

    if (isP09Command(method, options.path)) {
      const supplied = Object.fromEntries(
        Object.entries(options.headers ?? {}).map(([k, v]) => [
          k.toLowerCase(),
          v,
        ]),
      );
      const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (
        !uuidPattern.test(supplied['x-request-id'] ?? '') ||
        !uuidPattern.test(supplied['idempotency-key'] ?? '') ||
        ((method === 'PATCH' || /\/status$/.test(options.path)) &&
          !/^"[1-9][0-9]*"$/.test(supplied['if-match'] ?? ''))
      ) {
        throw new AppError({
          kind: 'config',
          code: 'P09_COMMAND_HEADERS_REQUIRED',
          message: 'Thiếu định danh yêu cầu hoặc phiên bản bảo hành hợp lệ.',
        });
      }
    }

    if (environment.apiBaseUrl === '') {
      throw new AppError({
        kind: 'config',
        message:
          'Môi trường "' +
          environment.name +
          '" chưa có base URL. Không thể gửi yêu cầu.',
      });
    }

    if (
      !SAFE_METHODS.has(method) &&
      !environment.wmsGateApproved &&
      !isGateExemptAuthPath(options.path) &&
      !(
        method === 'POST' &&
        options.path === '/api/v1/auth/switch-context' &&
        contextReleaseVerified()
      ) &&
      // 🔓 §2e: hai endpoint ghi của luồng nhập kho đã được duyệt bằng văn bản.
      //
      // Cờ `wmsGateApproved` VẪN `false` và cố ý không đụng tới: bật nó sẽ mở
      // cả 175 endpoint ghi, trong đó có `DELETE /roles/{id}`. Danh sách hẹp ở
      // `writeGate.ts` là đường duy nhất, và `post-receipt` KHÔNG nằm trong đó.
      approvedWriteFor(method, options.path) === undefined
    ) {
      throw new AppError({
        kind: 'blocked_by_gate',
        message:
          'Bị chặn: ' +
          method +
          ' tới môi trường "' +
          environment.label +
          '" chưa được phép. GATE_WMS_API_INTEGRATION phải PASS trước ' +
          '(GATE_01 §11 rule 4).',
      });
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...options.headers,
      // Đặt SAU phần spread: bên gọi không được ghi đè. Đây là chuỗi Cloudflare
      // đang allowlist — đổi nó là làm chết app trên máy thủ kho.
      'User-Agent': USER_AGENT,
      // Khai bản dựng này nhắm tới tier nào. Backend chưa bắt buộc header này
      // (người dùng ghi rõ 2026-09-06), nhưng gửi sẵn để khi middleware bật lên
      // thì khoá được HAI chiều thay vì một.
      [CLIENT_TIER_HEADER]: environment.expectedTier,
    };
    // Native versioned responses: compression can weaken ETag. Preserve the
    // strong BE version without rewriting weak ETags.
    if (
      usesBodyTokenTransport &&
      ((options.path === '/api/v1/auth/me' &&
        (method === 'GET' || method === 'PATCH')) ||
        p14ClosurePath(method, options.path))
    ) {
      headers['Accept-Encoding'] = 'identity';
    }
    if (usesBodyTokenTransport && isTokenTransportAuthPath(options.path)) {
      headers[WMS_TOKEN_TRANSPORT_HEADER] = 'body';
    }
    assertNoForbiddenHeaders(
      headers,
      options.path,
      method,
      options.p18Upload === true,
    );

    // 🔓 §2i: một thao tác gửi `multipart/form-data` (tải file bảo hành).
    //
    // Với `FormData`, **không** được đặt `Content-Type` tay: môi trường chạy
    // phải tự sinh `boundary`, và một header không có boundary làm máy chủ đọc
    // ra thân rỗng — hỏng theo kiểu khó đoán, không phải lỗi rõ ràng.
    const multipart = usesMultipart(method, options.path);
    if (options.body !== undefined && !multipart) {
      headers['Content-Type'] = 'application/json';
    }

    const session = readSession();
    // Login/refresh keep their transport. Logout is behind auth:api and uses
    // the ACCESS bearer captured before local teardown, never a refresh bearer.
    if (options.path === '/api/v1/auth/logout') {
      if (headers.Authorization === undefined && session !== undefined)
        headers.Authorization = 'Bearer ' + session.accessToken;
    } else if (
      session !== undefined &&
      !isTokenTransportAuthPath(options.path) &&
      !isPasswordRecoveryPath(options.path)
    ) {
      headers.Authorization = 'Bearer ' + session.accessToken;
    }

    const url = buildUrl(environment.apiBaseUrl, options.path, options.query);
    const timeoutMs = options.timeoutMs ?? environment.requestTimeoutMs;

    const timeoutController = new AbortController();
    const timer = setTimeout(() => {
      timeoutController.abort();
    }, timeoutMs);
    const onExternalAbort = () => {
      timeoutController.abort();
    };
    options.signal?.addEventListener('abort', onExternalAbort);

    if (!p12 && !isP09Request(method, options.path))
      log.debug('HTTP ' + method + ' ' + url, { headers });

    let response: Response;
    try {
      response = await fetchImpl(url, {
        ...(p09Binary || p12 ? { redirect: 'error' as const } : {}),
        method,
        headers,
        // Browser nhận refresh token qua cookie HttpOnly. `include` giúp cookie
        // đi theo login/refresh/logout qua Vite proxy; native tiếp tục body +
        // Keystore và không nhận option này.
        ...(isPasswordRecoveryPath(options.path)
          ? { credentials: 'omit' as const }
          : usesCookieTokenTransport
          ? { credentials: 'include' as const }
          : {}),
        body:
          options.body === undefined
            ? undefined
            : multipart
            ? (options.body as RequestInit['body'])
            : JSON.stringify(options.body),
        signal: timeoutController.signal,
      });
    } catch (cause) {
      // Phân biệt huỷ do người gọi với hết thời gian chờ.
      if (options.signal?.aborted === true) {
        throw new AppError({
          kind: 'cancelled',
          message: 'Yêu cầu đã bị huỷ.',
          cause,
        });
      }
      if (timeoutController.signal.aborted) {
        throw new AppError({
          kind: 'timeout',
          message: 'Hết thời gian chờ sau ' + timeoutMs + 'ms.',
          cause,
        });
      }
      throw new AppError({
        kind: 'network',
        message: 'Không gọi được máy chủ.',
        cause,
      });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }

    if (response.ok && options.responseType === 'blob') {
      return {
        status: response.status,
        data: (await response.blob()) as T,
        header: name => responseHeader(response, name),
      };
    }
    const rawText = await response.text();
    let parsed: unknown;
    if (rawText.length === 0) {
      parsed = undefined;
    } else {
      try {
        parsed = JSON.parse(rawText);
      } catch (cause) {
        if (response.ok) {
          throw new AppError({
            kind: 'parse',
            message: 'Phản hồi không phải JSON hợp lệ.',
            status: response.status,
            cause,
          });
        }
        parsed = undefined;
      }
    }

    // Ghi nhận giờ máy chủ từ MỌI phản hồi, kể cả phản hồi lỗi: envelope 401
    // cũng mang `meta.timestamp`. Đồng hồ máy quét Android không đáng tin, mà
    // hạn token và `retention_until` đều so theo mốc thời gian.
    recordServerTime(readServerTimestamp(parsed));

    const refreshesCurrentFamily =
      options.path === REFRESH_PATH &&
      session &&
      (usesCookieTokenTransport ||
        (typeof options.body === 'object' &&
          options.body !== null &&
          (options.body as Record<string, unknown>).refresh_token ===
            session.refreshToken));
    if (
      response.status === 401 &&
      (!isGateExemptAuthPath(options.path) || refreshesCurrentFamily) &&
      isTerminalSessionCode(extractErrorCode(parsed))
    ) {
      const code = extractErrorCode(parsed);
      const requestId =
        responseHeader(response, 'x-request-id') ?? extractRequestId(parsed);
      // Release diagnostics for repeated session replacement: fixed route
      // labels and transport metadata only. Never log credentials, the body,
      // dynamic owner IDs, command keys or an authentication response.
      log.warn('AUTH_TERMINAL_RESPONSE', {
        code,
        status: 401,
        requestId,
        routeFamily: [
          '/api/v1/auth/me',
          '/api/v1/auth/refresh',
          '/api/v1/mini-app/catalog/context',
          '/api/v1/containers',
        ].includes(options.path)
          ? options.path
          : 'PROTECTED_OWNER_REQUEST',
        appliesToCurrentGeneration: authGeneration === getSessionGeneration(),
      });
      await terminateAuthSession(code, authGeneration);
      throw new AppError({
        kind: 'auth',
        status: 401,
        code,
        route: options.path,
        requestId,
        message: extractErrorMessage(parsed) ?? 'Cần đăng nhập lại.',
      });
    }

    // Preserve only the P09 envelope for its strict adapter. It validates the
    // receipt; HTTP success/error never determines command success by itself.
    if (
      options.receiptTransport === 'p09' &&
      parsed &&
      typeof parsed === 'object' &&
      'data' in parsed &&
      parsed.data &&
      typeof parsed.data === 'object' &&
      'receipt' in parsed.data
    ) {
      return {
        status: response.status,
        data: parsed as T,
        header: name => responseHeader(response, name),
      };
    }
    if (options.p18Upload && asRecord(asRecord(parsed).meta).upload_receipt) {
      return {
        status: response.status,
        data: parsed as T,
        header: name => responseHeader(response, name),
      };
    }

    if (!response.ok) {
      // Cloudflare chặn TRƯỚC khi request tới ứng dụng. Với thủ kho, 403 này
      // trông y hệt lỗi đăng nhập; phải tách ra, nếu không họ sẽ đăng nhập lại
      // mãi mà không bao giờ qua được.
      const edgeBlocked = isEdgeBlocked(
        response.status,
        response.headers,
        parsed,
      );
      const kind: AppErrorKind = edgeBlocked
        ? 'blocked_by_edge'
        : parsed === undefined
        ? 'parse'
        : response.status === 401
        ? 'auth'
        : 'http';
      const requestId =
        responseHeader(response, 'x-request-id') ?? extractRequestId(parsed);
      const errorCode =
        extractErrorCode(parsed) ??
        (kind === 'parse' ? 'HTTP_NON_JSON_RESPONSE' : undefined);
      if (
        response.status === 403 &&
        errorCode === 'PASSWORD_CHANGE_REQUIRED'
      )
        markPasswordChangeRequired(authGeneration);
      const authFields: Record<string, readonly string[]> = {};
      if (
        options.path === '/api/v1/auth/me' ||
        options.path === '/api/v1/auth/change-password' ||
        isPasswordRecoveryPath(options.path)
      ) {
        const root = parsed as
          | {
              errors?: Record<string, unknown>;
              details?: Record<string, unknown>;
              error?: { details?: Record<string, unknown> };
            }
          | undefined;
        const fields = root?.errors ?? root?.details ?? root?.error?.details;
        for (const field of [
          'display_name',
          'phone',
          'current_password',
          'email',
          'otp',
          'new_password',
          'new_password_confirmation',
        ]) {
          const values = fields?.[field];
          if (Array.isArray(values))
            authFields[field] = values.filter(
              (v): v is string => typeof v === 'string',
            );
        }
      }
      const error = new AppError({
        passwordPolicy:
          options.path === '/api/v1/auth/change-password' &&
          response.status === 422
            ? decodePasswordPolicy(
                asRecord(asRecord(parsed).data).password_policy,
              )
            : undefined,
        fieldErrors: authFields,
        kind,
        status: response.status,
        code: errorCode,
        route: options.path,
        requestId,
        retryAfterSeconds:
          response.status === 429 ? retryAfterSeconds(response) : undefined,
        message: edgeBlocked
          ? 'Bị lớp bảo vệ mạng chặn (403). Request chưa tới ứng dụng.'
          : skuInactiveMessage(
              errorCode,
              extractErrorMessage(parsed) ?? 'HTTP ' + String(response.status),
              skuCodeFromErrorBody(parsed),
            ),
      });
      if (!isP09Request(method, options.path))
        log.warn('HTTP lỗi ' + String(response.status) + ' ' + url, {
          code: error.code,
          requestId: error.requestId,
          route: error.route,
        });
      throw error;
    }

    if (sharedIdentityRead && response.ok)
      observeAccountSessionPolicy(
        (parsed as { data?: unknown })?.data,
        authGeneration,
      );
    return {
      status: response.status,
      data: parsed as T,
      header: name => responseHeader(response, name),
    };
  }

  /**
   * Gửi request kèm chính sách gia hạn phiên.
   *
   * Ràng buộc 2 của người dùng (2026-09-05): máy chủ **không phân biệt được**
   * "token hết hạn" với "token sai" — cả hai đều trả `401 UNAUTHENTICATED`,
   * không có header `WWW-Authenticate`. Nên chính sách là:
   *
   *   gặp 401 → gia hạn **đúng một lượt** → gửi lại **đúng một lần**
   *   vẫn 401 → ép đăng nhập lại
   *
   * `retried` là chốt chặn vòng lặp: lượt gửi lại không bao giờ tự gia hạn tiếp.
   *
   * ⚠️ Chỉ gửi lại với method **an toàn**. Một POST đã tới máy chủ rồi mới nhận
   * 401 thì không có gì bảo đảm nó chưa được xử lý — tự gửi lại là tạo bản ghi
   * trùng. Đây chính là ranh giới `pending` / `unknown` mà `syncEngine` đang giữ.
   */
  async function request<T>(
    options: RequestOptions,
    retried = false,
  ): Promise<ApiResponse<T>> {
    const generation = getSessionGeneration();
    try {
      // The pre-command read never rotates owner key/body/version/headers.
      if (
        !SAFE_METHODS.has(options.method ?? 'GET') &&
        options.path.startsWith('/api/v1/mini-app/') &&
        getSession()?.accountSessionPolicy === 'auth-session-replacement-v1'
      ) {
        const me = await request<{ data?: Record<string, unknown> }>({
          path: '/api/v1/auth/me',
          method: 'GET',
        });
        if (generation !== getSessionGeneration() || !getSession())
          throw new AppError({
            kind: 'auth',
            code: 'STALE_AUTH_RESPONSE',
            message: 'Phiên đã thay đổi.',
          });
        const current = getSession(),
          user = me.data?.data;
        if (
          !user ||
          (user.id ?? user.user_id) !== current?.userId ||
          user.auth_session_id !== current?.authSessionId ||
          user.active_warehouse_id !== current?.activeWarehouseId
        )
          throw new AppError({
            kind: 'blocked_by_gate',
            code: 'AUTH_COMMAND_CONTEXT_UNVERIFIED',
            message:
              'Chưa xác minh đúng tài khoản, phiên và kho trước thao tác. Dữ liệu được giữ nguyên.',
          });
      }
      const result = await sendOnce<T>(options);
      if (
        !isGateExemptAuthPath(options.path) &&
        generation !== getSessionGeneration()
      )
        throw new AppError({
          kind: 'auth',
          code: 'STALE_AUTH_RESPONSE',
          message: 'Phiên đã thay đổi.',
        });
      return result;
    } catch (error) {
      const canRetry =
        generation === getSessionGeneration() &&
        !retried &&
        error instanceof AppError &&
        error.kind === 'auth' &&
        !isTerminalSessionCode(error.code) &&
        SAFE_METHODS.has(options.method ?? 'GET') &&
        !isGateExemptAuthPath(options.path) &&
        (usesCookieTokenTransport || getSession()?.refreshToken !== undefined);

      if (!canRetry) {
        throw error;
      }

      log.debug('401 — thử gia hạn phiên một lượt rồi gửi lại');
      // `refreshSession` là single-flight: mười request cùng gặp 401 thì vẫn chỉ
      // một lượt gia hạn đi ra mạng. Xem ràng buộc 1 trong tokenRefresh.ts.
      const refreshed = await refreshSession({
        send: async refreshToken => {
          const result = await sendOnce<unknown>({
            path: REFRESH_PATH,
            method: 'POST',
            body: usesCookieTokenTransport
              ? {}
              : { refresh_token: refreshToken },
          });
          return result.data;
        },
      });
      if (getSession()?.accessToken !== refreshed.accessToken) {
        throw new AppError({
          kind: 'auth',
          code: 'STALE_AUTH_RESPONSE',
          message: 'Phiên đã thay đổi.',
        });
      }
      return await request<T>(options, true);
    }
  }

  return {
    request,
    get: <T>(
      path: string,
      options: Omit<RequestOptions, 'path' | 'method'> = {},
    ) => request<T>({ ...options, path, method: 'GET' }),
  };
}

export const apiClient = createApiClient();

export { toAppError };
