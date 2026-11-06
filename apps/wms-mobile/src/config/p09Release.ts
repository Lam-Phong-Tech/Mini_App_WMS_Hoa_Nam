import { BUILD_PROFILE } from './buildProfile';
import { getCurrentEnvironment } from './env';
import { AppError } from '../errors/AppError';
import { isDevRuntimeIdentity } from './runtimePolicy';

export const P09_CONTRACT = 'mini-app-p09-v1';
export const P09_DEV_WRITE = Object.freeze({
  enabled: true,
  approval:
    'User23/10/2026: P09/P19 DEV connection and explicitly scoped TEST intake; production remains OFF',
});
export const p09DevWriteEnabled = () =>
  P09_DEV_WRITE.enabled && p09DevReadEnabled();
export const P09_RELEASE = Object.freeze({
  sourceCommit: '41bdbaeed0e15c14135ab778e3cdf698ded41982',
  status: 'DEV_CONNECTED_CANONICAL_OWNER_PRODUCTION_OFF',
  productionEnabled: false,
  linkedP03Enabled: false,
});
export function assertP09Connected(): void {
  if (!P09_RELEASE.productionEnabled && !p09DevWriteEnabled())
    throw new AppError({
      kind: 'blocked_by_gate',
      code: 'P09_PENDING_RELEASE',
      message: 'Bảo hành đang chờ xác nhận triển khai và kiểm thử WMS.',
    });
}
/** Exact P09 family, including legacy callers. P18 upload remains its owner. */
export function isP09Request(method: string, path: string): boolean {
  return (
    /^\/api\/v1\/mini-app\/(?:warranty\/resolve-code|warranty-requests\/[^/?]+|warranty-cases(?:\/[^/?]+(?:\/(?:status|events|component-issues|attachments))?)?|warranty-attachments\/[^/?]+\/download)$/.test(
      path.split('?')[0],
    ) && !(method === 'POST' && /\/attachments$/.test(path))
  );
}

/** User-approved DEV reads; SHA is evidence, not a deployment allowlist. */
export interface P09DevReadEvidence {
  enabled: boolean;
  origin: string;
  runtimeSha: string;
  expiresAtMs: number | null;
  approval: string;
}
export const P09_DEV_READ: Readonly<P09DevReadEvidence> = Object.freeze({
  enabled: true,
  origin: 'https://khohoanamdev.lptech.info.vn',
  runtimeSha: '709744875a039178f432574ce1b59aaa3b42395c',
  // Historical evidence only. Compatible DEV deployments can continue reads;
  // production and mutation approvals remain independent.
  expiresAtMs: null,
  approval:
    'handoff/NATIVE_REPAIR_20261014/READINESS.md; existing P09 DEV read approval only',
});
export function p09DevReadEnabled(evidence = P09_DEV_READ): boolean {
  const environment = getCurrentEnvironment();
  return (
    evidence.enabled &&
    BUILD_PROFILE === 'dev-test' &&
    environment.name === 'dev-test' &&
    environment.expectedTier === 'dev-test' &&
    environment.environmentClassVerified &&
    environment.apiBaseUrl === evidence.origin &&
    (evidence.expiresAtMs === null || Date.now() < evidence.expiresAtMs)
  );
}
export function assertP09ReadConnected(): void {
  if (!P09_RELEASE.productionEnabled && !p09DevReadEnabled())
    assertP09Connected();
}
export function p09DevReadPath(method: string, path: string): boolean {
  // User13/10: live scan -> identity lookup. This existing POST is a
  // read-only resolver (NONE stock effect; no movement/case created).
  if (method === 'POST' && path === '/api/v1/mini-app/warranty/resolve-code')
    return true;
  return (
    method === 'GET' &&
    /^\/api\/v1\/mini-app\/(?:warranty-cases(?:\/[^/?]+(?:\/(?:events|component-issues|attachments))?)?|warranty-requests\/[^/?]+)$/.test(
      path,
    )
  );
}
export function p09RuntimeMatches(
  sha: unknown,
  tier: unknown,
  evidence: P09DevReadEvidence = P09_DEV_READ,
): boolean {
  return p09DevReadEnabled(evidence) && isDevRuntimeIdentity(sha, tier);
}
