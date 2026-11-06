import { AppError } from '../errors/AppError';
import { BUILD_PROFILE } from './buildProfile';
import { getCurrentEnvironment, type AppEnvironment } from './env';
import { captureSessionScope, isSessionScopeCurrent } from '../auth/session';
import { DEV_RUNTIME_POLICY, isDevRuntimeIdentity } from './runtimePolicy';

export const P12_DEV = Object.freeze({
  enabled: true,
  origin: 'https://khohoanamdev.lptech.info.vn',
  runtimePolicy: DEV_RUNTIME_POLICY,
  // Evidence SHA only. Owner contract/cursor/schema validation remains strict.
  runtimeSha: '49bceda27ebc6a2de83d43342f8216860b3d708a',
  runtimeEvidence: 'DEV_HEALTH_20261015_REQUEST_b7a44de7-4ba7-465d-96f8-57ced0e25a06',
  sourcePin: 'eaa8fd2fd4ffb4013e6b72da0fa1384e80ef0154',
  mixedSourcePin: '1b58c6a4982d737c3ea4a27c9281f15d7fb299d6',
  mixedContract: 'p12-mixed-documents-v3',
  timestampSourcePin:'026f4f758da5e5ef8c16096ad5ec5cc963b37dba',
  timestampContract:'document-timestamps-v1',
  cursorVersion:3,
  approval: 'handoff/P12/ANDROID_20261011/USER_APPROVAL.md',
  fullActivation: false,
  productionEnabled: false,
});
const id = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}';
export function p12ReadPath(method: string, path: string): boolean {
  return (
    method === 'GET' &&
    (new RegExp(
      '^/api/v1/mini-app/(?:inbound|outbound)-documents(?:/' +
        id +
        '(?:/(?:scan-entries|attachments))?)?$',
      'i',
    ).test(path) ||
      new RegExp(
        '^/api/v1/mini-app/(?:warranty-cases(?:/' +
          id +
          '(?:/(?:events|attachments))?)?|warranty-requests/' +
          id +
          ')$',
        'i',
      ).test(path) ||
      p12BinaryPath(path) ||
      path === '/api/v1/mini-app/inbound/suppliers' ||
      path === '/api/v1/mini-app/documents')
  );
}
export function p12BinaryPath(path: string): boolean {
  return new RegExp(
    '^/api/v1/mini-app/(?:document|warranty)-attachments/' + id + '/download$',
    'i',
  ).test(path);
}
export function p12DevEnabled(
  environment: AppEnvironment = getCurrentEnvironment(),
  profile = BUILD_PROFILE,
) {
  return (
    P12_DEV.enabled &&
    profile === 'dev-test' &&
    environment.name === 'dev-test' &&
    environment.expectedTier === 'dev-test' &&
    environment.environmentClassVerified &&
    environment.apiBaseUrl === P12_DEV.origin
  );
}
export async function verifyP12Runtime(
  fetchImpl: typeof fetch,
  environment: AppEnvironment = getCurrentEnvironment(),
) {
  if (!p12DevEnabled(environment))
    throw new AppError({
      kind: 'blocked_by_gate',
      code: 'P12_DEV_CLOSED',
      message: 'Chứng từ chưa được mở ở môi trường này.',
    });
  const scope = captureSessionScope(),
    controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(P12_DEV.origin + '/api/v1/health', {
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
      )
    )
      throw new AppError({
        kind: 'blocked_by_gate',
        code: 'P12_RUNTIME_MISMATCH',
        message:
          'Chưa xác minh được định danh môi trường DEV/TEST để đọc chứng từ.',
      });
    if (!isSessionScopeCurrent(scope))
      throw new AppError({
        kind: 'cancelled',
        code: 'P12_STALE_SCOPE',
        message: 'Phiên đã thay đổi.',
      });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError({
      kind: 'blocked_by_gate',
      code: 'P12_RUNTIME_UNAVAILABLE',
      message: 'Chưa xác minh được môi trường đọc chứng từ.',
    });
  } finally {
    clearTimeout(timer);
  }
}
