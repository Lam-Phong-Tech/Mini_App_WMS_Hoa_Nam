import { AppError } from '../errors/AppError';
import { BUILD_PROFILE } from './buildProfile';
import { getCurrentEnvironment, type AppEnvironment } from './env';
import { captureSessionScope, isSessionScopeCurrent } from '../auth/session';
import { DEV_RUNTIME_POLICY, isDevRuntimeIdentity } from './runtimePolicy';

/** User-approved ongoing DEV/TEST operation. Customer production stays closed. */
export const P11_DEV_RELEASE = Object.freeze({
  enabled: true,
  tier: 'dev-test',
  origin: 'https://khohoanamdev.lptech.info.vn',
  runtimePolicy: DEV_RUNTIME_POLICY,
  // Historical evidence, not a per-deployment admission key.
  runtimeSha: '709744875a039178f432574ce1b59aaa3b42395c',
  runtimeEvidence: 'handoff/NATIVE_REPAIR_20261014/READINESS.md',
  contract: 'p11-existing-routes-v1',
  approval: 'handoff/P11/DEV_ACTIVATION_20261011_094802/USER_APPROVAL.md',
  nativeEvidence: 'handoff/P11/DEVICE_S01_S04_20261011_085332/REPORT.md',
});
export function p11DevEnabled(
  environment: AppEnvironment = getCurrentEnvironment(),
  profile: string = BUILD_PROFILE,
  enabled: boolean = P11_DEV_RELEASE.enabled,
): boolean {
  return (
    enabled &&
    profile === 'dev-test' &&
    environment.name === 'dev-test' &&
    environment.expectedTier === 'dev-test' &&
    environment.environmentClassVerified &&
    environment.apiBaseUrl === P11_DEV_RELEASE.origin
  );
}
export const P11_RELEASE = Object.freeze({
  sourceCommit: '4b03fe257cb541f268f02182e7114c302802a747',
  contract: 'p11-existing-routes-v1',
  status: 'DEV_TEST_ACTIVE_20261011',
  devTestEnabled: p11DevEnabled(),
  productionEnabled: false,
});
function normalizedPath(path: string): string {
  return '/' + path.split('?')[0].split('/').filter(Boolean).join('/');
}
/** Shared GET me supplies P11 identity/policy; PATCH/logout are not opened. */
export function p11DevRequestPath(method: string, path: string): boolean {
  const normalized = normalizedPath(path);
  return (
    (method === 'GET' &&
      ['/api/v1/auth/me', '/api/v1/auth/sessions'].includes(normalized)) ||
    (method === 'POST' && normalized === '/api/v1/auth/change-password') ||
    (method === 'DELETE' &&
      /^\/api\/v1\/auth\/sessions\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(
        normalized,
      ))
  );
}
export function p11DevRequestAllowed(
  method: string,
  path: string,
  environment: AppEnvironment = getCurrentEnvironment(),
): boolean {
  return p11DevEnabled(environment) && p11DevRequestPath(method, path);
}
export function assertP11Connected(
  method = 'GET',
  path = '/api/v1/auth/sessions',
  environment: AppEnvironment = getCurrentEnvironment(),
): void {
  if (!p11DevRequestAllowed(method, path, environment))
    throw new AppError({
      kind: 'blocked_by_gate',
      code: 'P11_PENDING_RELEASE',
      message: 'Bảo mật chỉ được mở trên bản DEV/TEST đã xác minh.',
    });
}
/** Public health preflight has no auth payload and never retries a command. */
export async function verifyP11DevRuntime(
  fetchImpl: typeof fetch,
  environment: AppEnvironment = getCurrentEnvironment(),
): Promise<void> {
  if (!p11DevEnabled(environment))
    throw new AppError({
      kind: 'blocked_by_gate',
      code: 'P11_PENDING_RELEASE',
      message: 'Bảo mật chưa được mở ở môi trường này.',
    });
  const owner = captureSessionScope();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(
      P11_DEV_RELEASE.origin + '/api/v1/health',
      {
        headers: {
          Accept: 'application/json',
          'X-WMS-Client-Tier': 'dev-test',
        },
        signal: controller.signal,
      },
    );
    const payload = await response.json();
    if (
      !response.ok ||
      response.redirected ||
      !isDevRuntimeIdentity(
        payload?.data?.build?.sha,
        response.headers.get('X-WMS-Deployment-Tier'),
      )
    )
      throw new AppError({
        kind: 'blocked_by_gate',
        code: 'P11_DEV_RUNTIME_MISMATCH',
        message:
          'Chưa xác minh được định danh môi trường DEV/TEST cho bảo mật.',
      });
    if (!isSessionScopeCurrent(owner))
      throw new AppError({
        kind: 'blocked_by_gate',
        code: 'STALE_AUTH_RESPONSE',
        message: 'Phiên đã thay đổi. Không gửi yêu cầu bảo mật từ phiên cũ.',
      });
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
    throw new AppError({
      kind: 'blocked_by_gate',
      code: 'P11_DEV_RUNTIME_UNAVAILABLE',
      message: 'Chưa xác minh được môi trường DEV. Chưa gửi yêu cầu bảo mật.',
    });
  } finally {
    clearTimeout(timeout);
  }
}
export function isP11Request(method: string, path: string): boolean {
  const normalized = normalizedPath(path);
  return (
    (method === 'POST' && normalized === '/api/v1/auth/change-password') ||
    (method === 'GET' && normalized === '/api/v1/auth/sessions') ||
    (method === 'DELETE' &&
      /^\/api\/v1\/auth\/sessions\/[^/?]+$/.test(normalized))
  );
}
