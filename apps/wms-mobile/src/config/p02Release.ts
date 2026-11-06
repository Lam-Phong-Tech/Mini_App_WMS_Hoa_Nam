/** DEV read candidate after health/ancestry checks; BA/production remain pending. */
import { getCurrentEnvironment } from './env';
import { captureSessionScope, isSessionScopeCurrent } from '../auth/session';
import { AppError } from '../errors/AppError';
import { wmsFetch } from '../api/wmsFetch';
import { DEV_RUNTIME_POLICY, isDevRuntimeIdentity } from './runtimePolicy';
export const P02_CONTRACT = 'mini-app-p02-v2';
export const P02_SOURCE_COMMIT = '701e93522010664e623f18605d79d59ae6316c37';
export const P02_RELEASE = Object.freeze({
  status: 'IMPLEMENTED_PENDING_BA_AND_LIVE_TEST',
  devSummaryEnabled: true,
  runtimePolicy: DEV_RUNTIME_POLICY,
  // Historical evidence only; a compatible deployment need not have this SHA.
  runtimeSha: '49bceda27ebc6a2de83d43342f8216860b3d708a',
  productionEnabled: false,
});
export function p02DevReadEnabled() {
  const e = getCurrentEnvironment();
  return (
    P02_RELEASE.devSummaryEnabled &&
    e.name === 'dev-test' &&
    e.expectedTier === 'dev-test' &&
    e.apiBaseUrl === 'https://khohoanamdev.lptech.info.vn'
  );
}
export async function verifyP02Runtime() {
  if (!p02DevReadEnabled())
    throw new AppError({
      kind: 'blocked_by_gate',
      code: 'P02_DEV_CLOSED',
      message: 'KPI P02 chưa mở trong môi trường này.',
    });
  const owner = captureSessionScope(),
    controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await wmsFetch(
      getCurrentEnvironment().apiBaseUrl + '/api/v1/health',
      {
        headers: {
          Accept: 'application/json',
          'X-WMS-Client-Tier': 'dev-test',
        },
        signal: controller.signal,
      },
    );
    const body = await response.json();
    if (
      !response.ok ||
      response.redirected ||
      !isDevRuntimeIdentity(
        body?.data?.build?.sha,
        response.headers.get('X-WMS-Deployment-Tier'),
      )
    )
      throw new AppError({
        kind: 'blocked_by_gate',
        code: 'P02_RUNTIME_MISMATCH',
        message: 'Không xác minh được định danh môi trường DEV/TEST cho KPI P02.',
      });
    if (!isSessionScopeCurrent(owner))
      throw new AppError({ kind: 'cancelled', message: 'Phiên đã thay đổi.' });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError({
      kind: 'blocked_by_gate',
      code: 'P02_RUNTIME_UNAVAILABLE',
      message: 'Chưa xác minh được bản DEV cho KPI.',
    });
  } finally {
    clearTimeout(timer);
  }
}
