/** DEV client owners.03/11 user selects username support for P14.S01-S02; BE flags remain server-owned. */
import { BUILD_PROFILE } from './buildProfile';
import { getCurrentEnvironment, type AppEnvironment } from './env';
import { captureSessionScope, isSessionScopeCurrent } from '../auth/session';
import { AppError } from '../errors/AppError';
import { DEV_RUNTIME_POLICY, isDevRuntimeIdentity } from './runtimePolicy';
export const P14_DEV = Object.freeze({
  origin: 'https://khohoanamdev.lptech.info.vn',
  runtimePolicy: DEV_RUNTIME_POLICY,
  // Historical evidence, never a substitute for lifecycle/close-check/CLEAN.
  runtimeSha: '709744875a039178f432574ce1b59aaa3b42395c',
  productionEnabled: false,
  recoveryEnabled: true,
});
export function p14DevEnabled(
  env: AppEnvironment = getCurrentEnvironment(),
  profile = BUILD_PROFILE,
) {
  return (
    profile === 'dev-test' &&
    env.name === 'dev-test' &&
    env.expectedTier === 'dev-test' &&
    env.environmentClassVerified &&
    env.apiBaseUrl === P14_DEV.origin
  );
}
const uuid = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
export function p14ClosurePath(method: string, path: string) {
  return new RegExp(
    '^/api/v1/mini-app/work-shifts/' +
      uuid +
      (method === 'POST'
        ? '/end$'
        : method === 'GET'
        ? '/((?:close-check|summary)|requests/' + uuid + ')$'
        : '/NEVER$'),
    'i',
  ).test(path);
}
export async function verifyP14Runtime(
  fetchImpl: typeof fetch,
  env: AppEnvironment,
) {
  if (!p14DevEnabled(env))
    throw new AppError({
      kind: 'blocked_by_gate',
      code: 'P14_DEV_CLOSED',
      message: 'Kết thúc ca chỉ được kết nối trên bản DEV/TEST đã duyệt.',
    });
  const scope = captureSessionScope(),
    abort = new AbortController(),
    timer = setTimeout(() => abort.abort(), 8000);
  try {
    const options: RequestInit & {cache:'no-store';redirect:'error'} = {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-WMS-Client-Tier': 'dev-test' },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: abort.signal,
    };
    const r = await fetchImpl(P14_DEV.origin + '/api/v1/health', options);
    const b = await r.json();
    if (
      !r.ok ||
      r.redirected ||
      !isDevRuntimeIdentity(
        b?.data?.build?.sha,
        r.headers.get('X-WMS-Deployment-Tier'),
      )
    )
      throw new AppError({
        kind: 'blocked_by_gate',
        code: 'P14_RUNTIME_MISMATCH',
        message: 'Chưa xác minh được định danh DEV/TEST; không gửi END.',
      });
    if (!isSessionScopeCurrent(scope))
      throw new AppError({
        kind: 'cancelled',
        code: 'SHIFT_OWNER_CHANGED',
        message: 'Không nhận kết quả của phiên cũ.',
      });
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError({
      kind: 'blocked_by_gate',
      code: 'P14_RUNTIME_UNAVAILABLE',
      message:
        'Chưa xác minh được backend P14; giữ nguyên yêu cầu để đối chiếu.',
    });
  } finally {
    clearTimeout(timer);
  }
}
