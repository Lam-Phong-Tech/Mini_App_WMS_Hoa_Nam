import { AppError } from '../errors/AppError';
import { webPreviewHostProblem } from './webPreviewHost.web';

const DEV_ORIGIN = 'https://khohoanamdev.lptech.info.vn';
function browserLocation() {
  const g = globalThis as unknown as {
    location?: { origin?: string; href?: string };
    window?: { location?: { origin?: string; href?: string } };
  };
  return g.location ?? g.window?.location;
}

/** The local Web server proxies only this fixed DEV API; gates still check BE. */
export function wmsWebRequestUrl(url: string): string {
  // A same-origin BE preview needs no local Vite proxy. The target never changes:
  // only the fixed DEV API is forwarded, and foreign URLs are not rewritten.
  const current = browserLocation(),
    origin =
      current?.origin ??
      (current?.href ? new URL(current.href).origin : undefined);
  if (origin === DEV_ORIGIN) return url;
  return url.startsWith(DEV_ORIGIN + '/api/v1/')
    ? '/wms-api' + url.slice(DEV_ORIGIN.length)
    : url;
}

export const wmsFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.href
      : input.url;
  const problem = webPreviewHostProblem();
  // Do not send credentials or owner requests to a static host. This also
  // protects callers outside LoginScreen and the relative env.web API base.
  if (
    problem &&
    (url.startsWith(DEV_ORIGIN + '/api/v1/') ||
      url.startsWith('/wms-api/api/v1/'))
  ) {
    return Promise.reject(
      new AppError({
        kind: 'config',
        code: 'WEB_PREVIEW_PROXY_UNAVAILABLE',
        message: problem,
      }),
    );
  }
  if (typeof input === 'string') return fetch(wmsWebRequestUrl(input), init);
  if (input instanceof URL) return fetch(wmsWebRequestUrl(input.href), init);
  const target = wmsWebRequestUrl(input.url);
  if (target === input.url) return fetch(input, init);
  // Preserve a Request's body, headers, credentials and signal before overrides.
  const href = browserLocation()?.href;
  if (!href) throw new Error('Web proxy requires a browser location.');
  // Browsers accept a Request as the init source here and preserve its body,
  // credentials and signal. React Native's global RequestInit declaration uses
  // a different body union, so keep the platform bridge cast local.
  return fetch(
    new Request(
      new URL(target, href).href,
      input as unknown as RequestInit,
    ),
    init,
  );
};
