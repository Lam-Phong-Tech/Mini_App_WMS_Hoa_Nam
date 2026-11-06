import { DEV_RUNTIME_POLICY, isDevRuntimeIdentity } from '../src/config/runtimePolicy';
import { verifyP10DevRuntime, P10_DEV_TEST } from '../src/config/p10DevTest';
import { verifyP11DevRuntime } from '../src/config/p11Release';
import { verifyP12Runtime } from '../src/config/p12Release';
import { verifyP14Runtime, P14_DEV } from '../src/config/p14Release';
import { ENVIRONMENTS } from '../src/config/env';
import { clearSession, setSession } from '../src/auth/session';
import { createMemoryBackend, createStorage, setAppStorageForTesting } from '../src/storage/storage';

// Synthetic identities/transport only. No commands or real credentials.
const newSha = 'b'.repeat(40);
const dev = ENVIRONMENTS['dev-test'];
const health = (sha: unknown = newSha, tier: unknown = 'dev-test', redirected = false) => ({
  ok: true,
  redirected,
  headers: { get: () => tier },
  json: async () => ({ data: { build: { sha } } }),
});
const checks = [
  ['P10', (f: typeof fetch) => verifyP10DevRuntime(f)],
  ['P11', (f: typeof fetch) => verifyP11DevRuntime(f, dev)],
  ['P12', (f: typeof fetch) => verifyP12Runtime(f, dev)],
  ['P14', (f: typeof fetch) => verifyP14Runtime(f, dev)],
] as const;

beforeEach(() => {
  // Preserve the P10 temporary actor/expiry lane, not an extension of its approval.
  jest.useFakeTimers().setSystemTime(Date.parse('2026-10-10T16:00:00Z'));
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({ accessToken: 'offline', userId: P10_DEV_TEST.actorId, authSessionId: 'offline-session' });
});
afterEach(() => { clearSession(); jest.useRealTimers(); });

test('identity policy never compares deployments to an evidence SHA', () => {
  expect(DEV_RUNTIME_POLICY).toBe('OWNER_CONTRACT');
  expect(isDevRuntimeIdentity(newSha, 'dev-test')).toBe(true);
  expect(isDevRuntimeIdentity('C'.repeat(40), 'dev-test')).toBe(true);
  for (const sha of [undefined, null, '', 'unknown', 123, 'a'.repeat(39), 'g'.repeat(40)])
    expect(isDevRuntimeIdentity(sha, 'dev-test')).toBe(false);
  for (const tier of [undefined, null, '', 'customer-production', 'production'])
    expect(isDevRuntimeIdentity(newSha, tier)).toBe(false);
});

test.each(checks)('%s accepts a new deployment identity but health sends no auth/body/command', async (_owner, verify) => {
  const f = jest.fn(async () => health());
  await expect(verify(f as unknown as typeof fetch)).resolves.toBeUndefined();
  expect(f).toHaveBeenCalledTimes(1);
  const [url, options] = f.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe(dev.apiBaseUrl + '/api/v1/health');
  expect(options.body).toBeUndefined();
  expect(options.headers).not.toHaveProperty('Authorization');
  expect(P14_DEV.recoveryEnabled).toBe(true);
  expect(P14_DEV.productionEnabled).toBe(false);
});

describe.each(checks)('%s still fails closed', (_owner, verify) => {
  test.each([
    ['missing identity', undefined, 'dev-test', false],
    ['malformed identity', 'unknown', 'dev-test', false],
    ['wrong tier', newSha, 'customer-production', false],
    ['missing tier', newSha, null, false],
    ['redirect', newSha, 'dev-test', true],
  ])('%s never approves further transport', async (_case, sha, tier, redirected) => {
    const f = jest.fn(async () => health(sha === undefined ? null : sha, tier, redirected as boolean));
    await expect(verify(f as unknown as typeof fetch)).rejects.toMatchObject({ kind: 'blocked_by_gate' });
    expect(f).toHaveBeenCalledTimes(1);
  });
  test('late health cannot authorize the next auth generation', async () => {
    const f = jest.fn(async () => {
      clearSession();
      setSession({ accessToken: 'offline-new', userId: P10_DEV_TEST.actorId, authSessionId: 'other-session' });
      return health();
    });
    await expect(verify(f as unknown as typeof fetch)).rejects.toBeDefined();
    expect(f).toHaveBeenCalledTimes(1);
  });
});
