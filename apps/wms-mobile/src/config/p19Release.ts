import { BUILD_PROFILE } from './buildProfile';
import { getCurrentEnvironment } from './env';
import { AppError } from '../errors/AppError';
export const P19_DEV_RELEASE = Object.freeze({
  enabled: true,
  origin: 'https://khohoanamdev.lptech.info.vn',
  contract: 'p19-component-issue-linked-v1',
  production: false,
  approval:
    'User23/10/2026: connect P19 DEV/TEST; live smoke max1 on explicitly selected TEST data',
});
export function p19DevEnabled() {
  const env = getCurrentEnvironment();
  return (
    P19_DEV_RELEASE.enabled &&
    BUILD_PROFILE === 'dev-test' &&
    env.name === 'dev-test' &&
    env.expectedTier === 'dev-test' &&
    env.environmentClassVerified &&
    env.apiBaseUrl === P19_DEV_RELEASE.origin
  );
}
export function assertP19DevConnected() {
  if (!p19DevEnabled())
    throw new AppError({
      kind: 'blocked_by_gate',
      code: 'P19_DEV_ONLY',
      message: 'Xuất linh kiện chỉ mở trên DEV/TEST đã xác minh.',
    });
}
