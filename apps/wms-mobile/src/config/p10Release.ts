import { p10DevTestAllowed } from './p10DevTest';
import { p11DevRequestAllowed } from './p11Release';
import { AppError } from '../errors/AppError';
import { getCurrentEnvironment, type AppEnvironment } from './env';

export const P10_RELEASE = Object.freeze({
  sourceCommit: '4f6bc5257ee86c3573508110f211676b6cfa7a45',
  contract: 'auth-profile-p10-v1',
  status: 'DEV_CONNECTED_PRODUCTION_OFF',
  productionEnabled: false,
});
export function assertP10Connected(
  method = 'GET',
  path = '/api/v1/auth/me',
  environment: AppEnvironment = getCurrentEnvironment(),
): void {
  // P11 needs shared identity/policy after the temporary P10 QA window ends.
  // This read exception does not activate P10 PATCH or logout.
  if (
    method === 'GET' &&
    path === '/api/v1/auth/me' &&
    p11DevRequestAllowed(method, path, environment)
  )
    return;
  if (
    !P10_RELEASE.productionEnabled &&
    !p10DevTestAllowed(method, path, environment)
  )
    throw new AppError({
      kind: 'blocked_by_gate',
      code: 'P10_PENDING_RELEASE',
      message: 'Tài khoản đang chờ xác nhận triển khai và kiểm thử WMS.',
    });
}
// GET /me also belongs to P01/P02; only the P10 reader gates that shared read.
export function isP10CommandOrSessions(method: string, path: string): boolean {
  path = '/' + path.split('?')[0].split('/').filter(Boolean).join('/');
  return (
    (method === 'PATCH' && path === '/api/v1/auth/me') ||
    (method === 'POST' &&
      ['/api/v1/auth/change-password', '/api/v1/auth/logout'].includes(path)) ||
    (method === 'GET' && path === '/api/v1/auth/sessions') ||
    (method === 'DELETE' && /^\/api\/v1\/auth\/sessions\/[^/?]+$/.test(path))
  );
}
