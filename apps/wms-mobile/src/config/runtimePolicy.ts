/**
 * DEV/TEST follows compatible owner APIs, not a per-deployment SHA allowlist.
 * A health identity is NOT a contract check, release signoff or write grant.
 * Callers retain their fixed origin/profile gates and validate each owner's
 * contract, scope, capabilities and response schema before using its data.
 * Evidence SHAs remain historical provenance; never auto-pin health to storage.
 */
export const DEV_RUNTIME_POLICY = 'OWNER_CONTRACT' as const;

export function isDevRuntimeIdentity(sha: unknown, tier: unknown): boolean {
  return (
    tier === 'dev-test' &&
    typeof sha === 'string' &&
    /^[0-9a-f]{40}$/i.test(sha)
  );
}
