import { BUILD_PROFILE } from './buildProfile';
import { getCurrentEnvironment, type AppEnvironment } from './env';
import { p12DevEnabled } from './p12Release';
import type { DeploymentTier } from './deployment';
import { P12_TIMELINE_CONTRACT } from '../features/documents/p12/timelineHandoff';

export const P12_TIMELINE_DEV_RELEASE = Object.freeze({
  enabled: true,
  contract: P12_TIMELINE_CONTRACT,
  sourceEvidenceSha: '184bd43d95804a0c6f42d47ca64dfa39db40d9ae',
  operationsEvidenceSha: 'aee2269cdf7b5d4fac0c97d305c1f43394c9ef51',
  deploymentRun: '40086030765',
  productionEnabled: false,
});

/** Evidence SHA records release provenance; future compatible BE builds are not pinned. */
export function p12TimelineReadOptions(
  environment: AppEnvironment = getCurrentEnvironment(),
  profile: DeploymentTier = BUILD_PROFILE,
): { timelineContract?: typeof P12_TIMELINE_CONTRACT } {
  return P12_TIMELINE_DEV_RELEASE.enabled && p12DevEnabled(environment, profile)
    ? { timelineContract: P12_TIMELINE_CONTRACT }
    : {};
}
