/** User-approved P10 device test only. No production activation or RBAC grant. */
import { BUILD_PROFILE } from './buildProfile';
import { getCurrentEnvironment, type AppEnvironment } from './env';
import { captureSessionScope } from '../auth/session';
import { usesBodyTokenTransport } from '../auth/tokenTransport';
import { AppError } from '../errors/AppError';
import { isDevRuntimeIdentity } from './runtimePolicy';
export const P10_DEV_TEST = Object.freeze({
  enabled: true,
  origin: 'https://khohoanamdev.lptech.info.vn',
  runtimeSha: '48c7f8fe1fd5c66003b79eb06e84dc65b07c599b',
  actorId: '01a06f33-6610-7319-bc3f-e61cdda01dc7',
  expiresAtMs: null,
  approval:
    'User23/10/2026: connect all remaining native flows to current DEV/TEST; production remains OFF',
});
export function p10DevTestEligible(
  environment: AppEnvironment = getCurrentEnvironment(),
): boolean {
  return (
    P10_DEV_TEST.enabled &&
    usesBodyTokenTransport &&
    BUILD_PROFILE === 'dev-test' &&
    environment.name === 'dev-test' &&
    environment.expectedTier === 'dev-test' &&
    environment.environmentClassVerified &&
    environment.apiBaseUrl === P10_DEV_TEST.origin
  );
}
export function p10DevTestPath(method: string, path: string): boolean {
  return (
    ((method === 'GET' || method === 'PATCH') && path === '/api/v1/auth/me') ||
    (method === 'POST' && path === '/api/v1/auth/logout')
  );
}
export function p10DevTestAllowed(
  method: string,
  path: string,
  environment: AppEnvironment = getCurrentEnvironment(),
): boolean {
  return p10DevTestEligible(environment) && p10DevTestPath(method, path);
}
export async function verifyP10DevRuntime(
  fetchImpl: typeof fetch,
  environment: AppEnvironment = getCurrentEnvironment(),
): Promise<void> {
  const owner = captureSessionScope();
  if (!p10DevTestEligible(environment))
    throw new AppError({
      kind: 'blocked_by_gate',
      code: 'P10_DEV_TEST_EXPIRED',
      message: 'Lượt kiểm thử tài khoản đã kết thúc.',
    });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(P10_DEV_TEST.origin + '/api/v1/health', {
      headers: { Accept: 'application/json', 'X-WMS-Client-Tier': 'dev-test' },
      signal: controller.signal,
    });
    const payload = await response.json();
    if (
      !response.ok ||
      response.redirected ||
      !isDevRuntimeIdentity(
        payload?.data?.build?.sha,
        response.headers.get('X-WMS-Deployment-Tier'),
      ) ||
      !p10DevTestEligible(environment)
    )
      throw new AppError({
        kind: 'blocked_by_gate',
        code: 'P10_DEV_RUNTIME_MISMATCH',
        message: 'Chưa xác minh được định danh DEV/TEST hoặc phạm vi kiểm thử.',
      });
    // Logout deliberately clears local auth before its captured bearer is sent.
    // Compare the generation even when no session remains; a later login wins.
    if (JSON.stringify(owner) !== JSON.stringify(captureSessionScope()))
      throw new AppError({
        kind: 'auth',
        code: 'STALE_AUTH_RESPONSE',
        message: 'Phiên đã thay đổi.',
      });
  } finally {
    clearTimeout(timeout);
  }
}
