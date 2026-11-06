import { AppError } from '../errors/AppError';
import { BUILD_PROFILE } from './buildProfile';

/** Match P06's connection-first handoff. Never infer deployment from a push. */
export const P07_SOURCE_COMMIT = '416c59b5fbde719bda071e40b3b63cdd8fdaccde';
export const P07_CONTRACT = 'mini-app-p07-v1';
export const P07_RELEASE = Object.freeze({
  status: 'DEV_TEST_ENABLED_BY_USER_20261008' as const,
  // User authorized live DEV/TEST on 08/10/2026; customer build remains closed.
  productionEnabled: BUILD_PROFILE === 'dev-test',
});

export function assertP07Connected(): void {
  if (!P07_RELEASE.productionEnabled) {
    throw new AppError({
      kind: 'blocked_by_gate',
      code: 'P07_PENDING_RELEASE',
      message:
        'P07 đã chuẩn bị kết nối. Chờ xác nhận BE, migration và route cache trước khi bật kiểm thử API/NFC thật.',
    });
  }
}
