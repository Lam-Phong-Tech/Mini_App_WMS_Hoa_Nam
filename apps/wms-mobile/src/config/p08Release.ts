import { AppError } from '../errors/AppError';
import { BUILD_PROFILE } from './buildProfile';
import { getCurrentEnvironment } from './env';

export const P08_SOURCE_COMMIT = '6bca132ced532579856acb411dfd932a5a909e34';
export const P08_CONTRACT = 'mini-app-p08-v1';
export interface P08DevReadEvidence {
  readonly sourceCommit: string;
  readonly runtimeSha: string;
  readonly origin: string;
  readonly webProxyOrigin: '/wms-api';
  readonly warehouseId: string;
  readonly tier: 'dev-test';
  readonly acceptedAt: string;
  readonly approvalScope: 'DEV_READ_ONLY_UAT';
  readonly permissionsVerified: true;
  readonly routesVerified: 4;
  readonly migrationCount: 215;
  readonly p08MigrationBatch: 18;
  readonly availableSources: readonly (
    | 'DOCUMENT'
    | 'WARRANTY'
    | 'NFC'
    | 'SCAN'
  )[];
  readonly approvedLimitations: readonly string[];
  readonly operationsEvidence: string;
}
/** Direct user handoff on 10/10/2026. CI is deliberately NOT claimed. */
export const P08_DEV_READ_EVIDENCE: P08DevReadEvidence | null = Object.freeze({
  sourceCommit: P08_SOURCE_COMMIT,
  runtimeSha: '709744875a039178f432574ce1b59aaa3b42395c',
  origin: 'https://khohoanamdev.lptech.info.vn',
  webProxyOrigin: '/wms-api',
  warehouseId: '01a06f33-6bff-70b8-a089-3c68a83b11a8',
  tier: 'dev-test',
  acceptedAt: '2026-10-10T00:00:00+07:00',
  approvalScope: 'DEV_READ_ONLY_UAT',
  permissionsVerified: true,
  routesVerified: 4,
  migrationCount: 215,
  p08MigrationBatch: 18,
  availableSources: Object.freeze([
    'DOCUMENT',
    'WARRANTY',
    'NFC',
    'SCAN',
  ] as const),
  approvedLimitations: Object.freeze([
    'CI_NOT_CLAIMED_BY_USER_REQUEST',
    'RUNTIME_P08_SOURCE_HAS_APPROVED_DIRECTIONAL_DOCUMENT_PATCH',
    'P23_SESSION_EXTENSION_NOT_HYDRATED_BY_P08_UI',
    'NFC_NONEMPTY_FIXTURE_UNVERIFIED',
    'MIRROR_AND_CROSS_WAREHOUSE_EXTENDED_SEMANTICS_UNVERIFIED',
    'NATIVE_OWNER_ATTACHMENT_ACL_UNVERIFIED',
    'CUSTOMER_PRODUCTION_UNAPPROVED',
  ]),
  operationsEvidence: 'USER_P08_DEV_TEST_ACTUAL_RIGHTS_HANDOFF_2026_10_10',
});
export function p08DevReadVerified(
  evidence: P08DevReadEvidence | null = P08_DEV_READ_EVIDENCE,
  profile: string = BUILD_PROFILE,
  origin: string = getCurrentEnvironment().apiBaseUrl,
): boolean {
  if (
    !evidence ||
    profile !== 'dev-test' ||
    evidence.tier !== 'dev-test' ||
    ![evidence.origin, evidence.webProxyOrigin].includes(origin) ||
    evidence.sourceCommit !== P08_SOURCE_COMMIT ||
    evidence.approvalScope !== 'DEV_READ_ONLY_UAT' ||
    evidence.permissionsVerified !== true ||
    evidence.routesVerified !== 4 ||
    evidence.migrationCount !== 215 ||
    evidence.p08MigrationBatch !== 18 ||
    !/^[0-9a-f]{40}$/i.test(evidence.runtimeSha) ||
    !/^[0-9a-f-]{36}$/i.test(evidence.warehouseId) ||
    !Number.isFinite(Date.parse(evidence.acceptedAt)) ||
    evidence.operationsEvidence !==
      'USER_P08_DEV_TEST_ACTUAL_RIGHTS_HANDOFF_2026_10_10'
  )
    return false;
  return (
    [...evidence.availableSources].sort().join('|') ===
      'DOCUMENT|NFC|SCAN|WARRANTY' &&
    [
      'CI_NOT_CLAIMED_BY_USER_REQUEST',
      'RUNTIME_P08_SOURCE_HAS_APPROVED_DIRECTIONAL_DOCUMENT_PATCH',
      'CUSTOMER_PRODUCTION_UNAPPROVED',
    ].every(item => evidence.approvedLimitations.includes(item))
  );
}
export const P08_RELEASE = Object.freeze({
  sourceCommit: P08_SOURCE_COMMIT,
  status: 'DEV_TEST_LIVE_READ_UAT_20261014' as const,
  // This flag is the existing runtime gate name. It opens only the accepted
  // DEV/TEST read scope; Customer/Production remains closed.
  productionEnabled: p08DevReadVerified(),
});
export function assertP08Connected(): void {
  if (!P08_RELEASE.productionEnabled) {
    throw new AppError({
      kind: 'blocked_by_gate',
      code: 'P08_PENDING_RELEASE',
      message:
        'Lịch sử thật chỉ được mở trong bản DEV/TEST đã xác minh quyền đọc.',
    });
  }
}
