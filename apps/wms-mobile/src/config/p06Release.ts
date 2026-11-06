/** mini-app-p06-v1: source is available; deployment/live acceptance is pending. */
import { BUILD_PROFILE } from './buildProfile';
import { getCurrentEnvironment } from './env';
import { DEV_RUNTIME_POLICY, isDevRuntimeIdentity } from './runtimePolicy';

export const P06_SOURCE_COMMIT = '47636e0a3fc688be07071e2d2af5508b226e8805';
/** Filled only from accepted live evidence. CI and health alone cannot open reads. */
export interface P06DevReadEvidence {
  readonly sourceCommit: string;
  readonly runtimeSha: string;
  readonly origin: string;
  readonly tier: 'dev-test';
  readonly acceptedAt: string;
  readonly approvalScope: 'ISOLATED_DEV_READ_UAT';
  readonly runtimeOverlay: string;
  readonly approvedLimitations: readonly string[];
  readonly ancestryEvidence: string;
  readonly schemaDependenciesEvidence: string;
  readonly deploymentBlockerDispositionEvidence: string;
  readonly authenticatedNineRoutesEvidence: string;
  readonly denySessionEvidence: string;
  readonly stockGalleryTimelineSemanticsEvidence: string;
}
// BE signoff 16/10: nine GET families verified on origin and appqr, 46 checks.
// User 16/10: subsequent compatible DEV builds no longer require a new SHA pin.
// Formal visual/full release acceptance remains pending; no customer-production.
export const P06_DEV_READ_EVIDENCE: P06DevReadEvidence | null = Object.freeze({
  sourceCommit: P06_SOURCE_COMMIT,
  runtimeSha: '49bceda27ebc6a2de83d43342f8216860b3d708a',
  origin: 'https://khohoanamdev.lptech.info.vn',
  tier: 'dev-test',
  acceptedAt: '2026-10-16T12:13:54+07:00',
  approvalScope: 'ISOLATED_DEV_READ_UAT',
  runtimeOverlay: '14 preserved runtime hotfixes; checksums verified in signoff 04',
  approvedLimitations: Object.freeze([
    'LIMITED_ACCOUNT_403_NOT_RERUN',
    'SESSION_REPLACEMENT_NOT_RERUN',
    'RESERVATION_OWNER_ELIGIBILITY_NOT_CHECKED',
    'NFC_HARDWARE_NOT_TESTED',
    'FE_LIST_DETAIL_VISUAL_ACCEPTANCE_PENDING',
    'CUSTOMER_PRODUCTION_UNAPPROVED',
  ]),
  ancestryEvidence:
    'BE/docs/devops/P06_RELEASE_SIGNOFF_49BCEDA2_2026-10-16.zip#04-release-ancestry-artifact.json',
  schemaDependenciesEvidence:
    'BE/docs/devops/P06_RELEASE_SIGNOFF_49BCEDA2_2026-10-16.zip#01-runtime-schema-routes.json',
  deploymentBlockerDispositionEvidence:
    'BE/docs/devops/P06_RELEASE_SIGNOFF_49BCEDA2_2026-10-16.zip#08-fe-pin-inputs.json;DEV-read-only;full-release-remains-pending',
  authenticatedNineRoutesEvidence:
    'BE/docs/devops/P06_RELEASE_SIGNOFF_49BCEDA2_2026-10-16.zip#02-authenticated-catalog-raw-redacted.json;9-families-both-hops',
  denySessionEvidence:
    'BE/docs/devops/P06_RELEASE_SIGNOFF_49BCEDA2_2026-10-16.zip#07-http-check-index.json;401-409-422-404;403-session-replacement-pending',
  stockGalleryTimelineSemanticsEvidence:
    'BE/docs/devops/P06_RELEASE_SIGNOFF_49BCEDA2_2026-10-16.zip#02-authenticated-catalog-raw-redacted.json;03-five-active-candidates.json',
});
export function p06DevReadVerified(
  evidence: P06DevReadEvidence | null = P06_DEV_READ_EVIDENCE,
  profile: string = BUILD_PROFILE,
  origin: string = getCurrentEnvironment().apiBaseUrl,
): boolean {
  if (
    !evidence ||
    profile !== 'dev-test' ||
    evidence.tier !== 'dev-test' ||
    evidence.origin !== origin ||
    evidence.approvalScope !== 'ISOLATED_DEV_READ_UAT' ||
    typeof evidence.runtimeOverlay !== 'string' ||
    !evidence.runtimeOverlay.trim() ||
    !Array.isArray(evidence.approvedLimitations) ||
    evidence.sourceCommit !== P06_SOURCE_COMMIT ||
    !/^[0-9a-f]{40}$/i.test(evidence.runtimeSha) ||
    !/^https:\/\//.test(origin) ||
    !Number.isFinite(Date.parse(evidence.acceptedAt))
  )
    return false;
  return [
    'ancestryEvidence',
    'schemaDependenciesEvidence',
    'deploymentBlockerDispositionEvidence',
    'authenticatedNineRoutesEvidence',
    'denySessionEvidence',
    'stockGalleryTimelineSemanticsEvidence',
  ].every(key => {
    const value = evidence[key as keyof P06DevReadEvidence];
    return (
      typeof value === 'string' &&
      value.trim().length > 0 &&
      !/^(pending|not_run|unknown|false)$/i.test(value.trim())
    );
  });
}
export const P06_RELEASE = Object.freeze({
  status: 'PENDING_TEST_AND_DEPLOYMENT' as const,
  runtimePolicy: DEV_RUNTIME_POLICY,
  // Scope: accepted DEV/TEST reads only. Customer production never opens here.
  productionEnabled: p06DevReadVerified(),
});
/** Deployment identity only; the service still requires mini-app-p06-v1. */
export function p06RuntimeCandidateMatches(
  sha: unknown,
  tier: unknown,
  evidence = P06_DEV_READ_EVIDENCE,
): boolean {
  return (
    p06DevReadVerified(evidence) &&
    isDevRuntimeIdentity(sha, tier)
  );
}
/** Exact origins approved by operations for PUBLIC gallery images. Default deny. */
// User14/10 asked to use existing product images. Anonymous CDN JPEG verified
// via the matching D210108 public product record; raw API access stays UNKNOWN.
export const P06_VERIFIED_PUBLIC_CDN_ORIGINS: readonly string[] = Object.freeze(
  BUILD_PROFILE === 'dev-test' ? ['https://images.bigk.click'] : [],
);
export const P06_PUBLIC_IMAGE_ORIGINS: readonly string[] = Object.freeze(
  BUILD_PROFILE === 'dev-test'
    ? [
        'https://khohoanamdev.lptech.info.vn',
        ...P06_VERIFIED_PUBLIC_CDN_ORIGINS,
      ]
    : [],
);
