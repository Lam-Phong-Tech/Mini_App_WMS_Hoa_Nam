/** BE contract pinned by user06/10/2026; push is not deployment evidence. */
export const CONTEXT_SOURCE_COMMIT = '59313aaa1956c446f78b4adb84264d51ac1891ef';
export interface ContextReleaseEvidence {
  readonly artifactSha: string | null;
  readonly containsContextCommit: boolean;
  readonly contextMigrationApplied: boolean;
  readonly smokePassed: boolean;
}
// User-confirmed DEV/TEST artifact 06/10/2026. This enables only the context
// contract; KPI/list/warranty capabilities remain independently gated.
export const CONTEXT_RELEASE: ContextReleaseEvidence = Object.freeze({
  artifactSha: '6f6a4d3464226ff52a045e70acddc69698ff4307',
  containsContextCommit: true,
  contextMigrationApplied: true,
  smokePassed: true,
});
export function contextReleaseVerified(
  evidence: ContextReleaseEvidence = CONTEXT_RELEASE,
): boolean {
  return (
    typeof evidence.artifactSha === 'string' &&
    /^[a-f0-9]{40}$/i.test(evidence.artifactSha) &&
    evidence.containsContextCommit &&
    evidence.contextMigrationApplied &&
    evidence.smokePassed
  );
}
