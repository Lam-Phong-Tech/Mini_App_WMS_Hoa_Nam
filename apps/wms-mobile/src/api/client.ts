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
  allowsIdempotencyKey,
  allowsIfMatch,
  approvedWriteFor,
  usesMultipart,
} from './writeGate';
import { getActiveSession, getSession } from '../auth/session';
import { recordServerTime, readServerTimestamp } from '../auth/serverClock';
import { refreshSession, REFRESH_PATH } from '../auth/tokenRefresh';
import { getCurrentEnvironment, type AppEnvironment } from '../config/env';
import { CLIENT_TIER_HEADER } from '../config/deployment';
import { logger, type Logger } from '../logging/logger';

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
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
];

export function isGateExemptAuthPath(path: string): boolean {
  return GATE_EXEMPT_AUTH_PATHS.includes(path);
}

export interface RequestOptions {
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
): void {
  for (const key of Object.keys(headers)) {
    const lower = key.toLowerCase();

    if (lower === 'idempotency-key' && allowsIdempotencyKey(method, path)) {
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

export function createApiClient(deps: ApiClientDeps = {}) {
  const log = deps.log ?? logger;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const readSession = deps.getSession ?? getActiveSession;

  async function sendOnce<T>(options: RequestOptions): Promise<ApiResponse<T>> {
    const environment = deps.environment ?? getCurrentEnvironment();
    const method: HttpMethod = options.method ?? 'GET';

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
    assertNoForbiddenHeaders(headers, options.path, method);

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
    if (session !== undefined) {
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

    log.debug('HTTP ' + method + ' ' + url, { headers });

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
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
        : response.status === 401
          ? 'auth'
          : 'http';
      const requestId =
        responseHeader(response, 'x-request-id') ?? extractRequestId(parsed);
      const error = new AppError({
        kind,
        status: response.status,
        code: extractErrorCode(parsed),
        route: options.path,
        requestId,
        message: edgeBlocked
          ? 'Bị lớp bảo vệ mạng chặn (403). Request chưa tới ứng dụng.'
          : (extractErrorMessage(parsed) ?? 'HTTP ' + String(response.status)),
      });
      log.warn('HTTP lỗi ' + String(response.status) + ' ' + url, {
        code: error.code,
        requestId: error.requestId,
        route: error.route,
      });
      throw error;
    }

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
    try {
      return await sendOnce<T>(options);
    } catch (error) {
      const canRetry =
        !retried &&
        error instanceof AppError &&
        error.kind === 'auth' &&
        SAFE_METHODS.has(options.method ?? 'GET') &&
        !isGateExemptAuthPath(options.path) &&
        getSession()?.refreshToken !== undefined;

      if (!canRetry) {
        throw error;
      }

      log.debug('401 — thử gia hạn phiên một lượt rồi gửi lại');
      // `refreshSession` là single-flight: mười request cùng gặp 401 thì vẫn chỉ
      // một lượt gia hạn đi ra mạng. Xem ràng buộc 1 trong tokenRefresh.ts.
      await refreshSession({
        send: async (refreshToken) => {
          const result = await sendOnce<unknown>({
            path: REFRESH_PATH,
            method: 'POST',
            body: { refresh_token: refreshToken },
          });
          return result.data;
        },
      });
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
