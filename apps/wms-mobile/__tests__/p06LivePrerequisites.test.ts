import {
  P06_RELEASE,
  P06_SOURCE_COMMIT,
  p06DevReadVerified,
  P06_DEV_READ_EVIDENCE,
  p06RuntimeCandidateMatches,
  type P06DevReadEvidence,
} from '../src/config/p06Release';
const origin = 'https://khohoanamdev.lptech.info.vn';
const evidence: P06DevReadEvidence = {
  sourceCommit: P06_SOURCE_COMMIT,
  runtimeSha: '073ea02503287adcbfb76ef1edd2f23d52572aa2',
  origin,
  tier: 'dev-test',
  acceptedAt: '2026-10-09T18:20:00+07:00',
  approvalScope: 'ISOLATED_DEV_READ_UAT',
  runtimeOverlay: 'TEST_ONLY-overlay',
  approvedLimitations: [],
  ancestryEvidence: 'TEST_ONLY: verified ancestry',
  schemaDependenciesEvidence: 'TEST_ONLY: schema',
  deploymentBlockerDispositionEvidence: 'TEST_ONLY: limited-scope disposition',
  authenticatedNineRoutesEvidence: 'TEST_ONLY: 9 GET',
  denySessionEvidence: 'TEST_ONLY: deny/session',
  stockGalleryTimelineSemanticsEvidence: 'TEST_ONLY: semantics',
};
describe('P06 DEV read activation is evidence-scoped and fail closed', () => {
  it('default remains OFF despite CI passed/source pinned', () => {
    expect(p06DevReadVerified(null)).toBe(false);
    expect(
      p06DevReadVerified(
        { ...evidence, deploymentBlockerDispositionEvidence: '' },
        'dev-test',
        origin,
      ),
    ).toBe(false);
    expect(P06_RELEASE.status).toBe('PENDING_TEST_AND_DEPLOYMENT');
  });
  it('health/source alone cannot enable', () => {
    expect(
      p06DevReadVerified(
        {
          ...evidence,
          authenticatedNineRoutesEvidence: '',
          denySessionEvidence: '',
          stockGalleryTimelineSemanticsEvidence: '',
        },
        'dev-test',
        origin,
      ),
    ).toBe(false);
  });
  it.each([
    'ancestryEvidence',
    'schemaDependenciesEvidence',
    'deploymentBlockerDispositionEvidence',
    'authenticatedNineRoutesEvidence',
    'denySessionEvidence',
    'stockGalleryTimelineSemanticsEvidence',
  ] as const)('missing %s keeps OFF', key => {
    expect(
      p06DevReadVerified({ ...evidence, [key]: '' }, 'dev-test', origin),
    ).toBe(false);
  });
  it.each(['PENDING', 'NOT_RUN', 'UNKNOWN', 'false'])(
    'unaccepted evidence %s keeps OFF',
    value => {
      expect(
        p06DevReadVerified(
          { ...evidence, denySessionEvidence: value },
          'dev-test',
          origin,
        ),
      ).toBe(false);
    },
  );
  it('accepted test evidence enables only its origin/profile and current source', () => {
    expect(p06DevReadVerified(evidence, 'dev-test', origin)).toBe(true);
    expect(p06DevReadVerified(evidence, 'customer-production', origin)).toBe(
      false,
    );
    expect(
      p06DevReadVerified(evidence, 'dev-test', 'https://other.example.invalid'),
    ).toBe(false);
    expect(
      p06DevReadVerified(
        {
          ...evidence,
          sourceCommit: '691278fdc5aa69d0a31b1c5878dbf2467558913c',
        },
        'dev-test',
        origin,
      ),
    ).toBe(false);
    expect(
      p06DevReadVerified(
        { ...evidence, runtimeSha: 'dev' },
        'dev-test',
        origin,
      ),
    ).toBe(false);
  });
  it('current human approval is DEV-read-only with gaps, never full release/customer activation', () => {
    expect(P06_DEV_READ_EVIDENCE?.approvalScope).toBe('ISOLATED_DEV_READ_UAT');
    expect(P06_DEV_READ_EVIDENCE?.approvedLimitations.length).toBeGreaterThan(
      0,
    );
    expect(P06_RELEASE.productionEnabled).toBe(true);
    expect(
      p06DevReadVerified(P06_DEV_READ_EVIDENCE, 'customer-production', origin),
    ).toBe(false);
  });
  it('runtime SHA is diagnostic; valid DEV identity can reach the owner contract parser', () => {
    const runtime = P06_DEV_READ_EVIDENCE?.runtimeSha;
    expect(p06RuntimeCandidateMatches(runtime, 'dev-test')).toBe(true);
    expect(p06RuntimeCandidateMatches('b'.repeat(40), 'dev-test')).toBe(true);
    expect(p06RuntimeCandidateMatches('unknown', 'dev-test')).toBe(false);
    expect(p06RuntimeCandidateMatches(runtime, 'customer-production')).toBe(
      false,
    );
    expect(p06RuntimeCandidateMatches(runtime, undefined)).toBe(false);
    expect(p06RuntimeCandidateMatches(evidence.runtimeSha, 'dev-test')).toBe(
      true,
    );
    expect(runtime).toBe('49bceda27ebc6a2de83d43342f8216860b3d708a');
    expect(P06_RELEASE.runtimePolicy).toBe('OWNER_CONTRACT');
    expect(P06_DEV_READ_EVIDENCE?.approvedLimitations).toContain(
      'SESSION_REPLACEMENT_NOT_RERUN',
    );
  });
});
