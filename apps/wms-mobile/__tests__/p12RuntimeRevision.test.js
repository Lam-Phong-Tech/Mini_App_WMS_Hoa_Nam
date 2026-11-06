import {
  P12_DEV,
  verifyP12Runtime,
  p12DevEnabled,
} from '../src/config/p12Release';
import { ENVIRONMENTS } from '../src/config/env';
import { setSession, clearSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
const candidate = '49bceda27ebc6a2de83d43342f8216860b3d708a';
const env = {
  ...ENVIRONMENTS['dev-test'],
  name: 'dev-test',
  apiBaseUrl: 'https://khohoanamdev.lptech.info.vn',
  expectedTier: 'dev-test',
  environmentClassVerified: true,
};
const response = (sha = candidate, tier = 'dev-test') => ({
  ok: true,
  headers: { get: () => tier },
  json: async () => ({ data: { build: { sha } } }),
});
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'synthetic-offline',
    userId: 'actor',
    authSessionId: 'session',
  });
});
afterEach(() => clearSession());
test('verified DEV identity is accepted without opening production', async () => {
  const fetch = jest.fn(async () => response());
  await expect(verifyP12Runtime(fetch, env)).resolves.toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe(P12_DEV.origin + '/api/v1/health');
  expect(fetch.mock.calls[0][1]).not.toHaveProperty('body');
  expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  expect(P12_DEV.runtimeSha).toBe(candidate);
  expect(P12_DEV.fullActivation).toBe(false);
  expect(P12_DEV.productionEnabled).toBe(false);
});
test.each([
  '026f4f758da5e5ef8c16096ad5ec5cc963b37dba',
  '27e69d21e350b5a112ac08a648c8fa41f54ce302',
  '709744875a039178f432574ce1b59aaa3b42395c',
  '96a6946d4971fe2d419aac2f9d4c8d3980acb768',
])('another deployment %s reaches owner contract validation without repinning', async sha => {
  const fetch = jest.fn(async () => response(sha));
  await expect(verifyP12Runtime(fetch, env)).resolves.toBeUndefined();
  expect(P12_DEV.runtimePolicy).toBe('OWNER_CONTRACT');
});

test.each([null, undefined, '', 'unknown', 'a'.repeat(39), 49])('invalid/missing identity %s fails closed', async sha => {
  const fetch = jest.fn(async () => response(sha === undefined ? null : sha));
  await expect(verifyP12Runtime(fetch, env)).rejects.toMatchObject({
    code: 'P12_RUNTIME_MISMATCH',
  });
});
test('matching SHA on another tier cannot satisfy DEV gate', async () => {
  await expect(
    verifyP12Runtime(
      async () => response(candidate, 'customer-production'),
      env,
    ),
  ).rejects.toMatchObject({ code: 'P12_RUNTIME_MISMATCH' });
  expect(
    p12DevEnabled(
      {
        ...env,
        name: 'customer-production',
        expectedTier: 'customer-production',
      },
      'customer-production',
    ),
  ).toBe(false);
});
test('late health after a new auth generation cannot permit a document read', async () => {
  const fetch = jest.fn(async () => {
    setSession({
      accessToken: 'synthetic-new',
      userId: 'other',
      authSessionId: 'other-session',
    });
    return response();
  });
  await expect(verifyP12Runtime(fetch, env)).rejects.toMatchObject({
    code: 'P12_STALE_SCOPE',
  });
});
