import {
  P10_DEV_TEST,
  p10DevTestAllowed,
  verifyP10DevRuntime,
} from '../src/config/p10DevTest';
import { setSession, clearSession } from '../src/auth/session';
import { assertP10Connected, P10_RELEASE } from '../src/config/p10Release';
import { assertP11Connected, P11_RELEASE } from '../src/config/p11Release';
import { createApiClient } from '../src/api/client';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(Date.parse('2026-10-10T16:00:00Z'));
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'offline',
    userId: P10_DEV_TEST.actorId,
    authSessionId: 'offline-family',
  });
});
afterEach(() => {
  clearSession();
  jest.useRealTimers();
});
test('DEV test exception is narrow, production remains OFF', () => {
  expect(P10_RELEASE.productionEnabled).toBe(false);
  expect(P11_RELEASE.productionEnabled).toBe(false);
  expect(() => assertP10Connected('PATCH', '/api/v1/auth/me')).not.toThrow();
  expect(() =>
    assertP11Connected('POST', '/api/v1/auth/change-password'),
  ).not.toThrow();
  expect(p10DevTestAllowed('DELETE', '/api/v1/auth/sessions/row')).toBe(false);
  expect(() =>
    assertP11Connected('DELETE', '/api/v1/auth/sessions/row'),
  ).toThrow();
  expect(p10DevTestAllowed('POST', '/api/v1/auth/logout')).toBe(true);
  expect(p10DevTestAllowed('POST', '/api/v1/mini-app/work-shifts/end')).toBe(
    false,
  );
});
test('DEV transport lane is independent of account identity and production stays closed', () => {
  setSession({
    accessToken: 'offline',
    userId: 'another-user',
    authSessionId: 'another-family',
  });
  expect(p10DevTestAllowed('PATCH', '/api/v1/auth/me')).toBe(true);
  setSession({ accessToken: 'offline', userId: P10_DEV_TEST.actorId });
  expect(p10DevTestAllowed('PATCH', '/api/v1/auth/me')).toBe(true);
  clearSession();
  expect(p10DevTestAllowed('POST', '/api/v1/auth/logout')).toBe(true);
});
test('captured-bearer logout still reaches DEV after local auth has been cleared', async () => {
  clearSession();
  const fetchImpl = jest.fn(async (url: string) =>
    url.endsWith('/health')
      ? {
          ok: true,
          status: 200,
          headers: { get: (): string | null => 'dev-test' },
          json: async () => ({ data: { build: { sha: 'a'.repeat(40) } } }),
        }
      : {
          ok: true,
          status: 200,
          headers: { get: (): string | null => null },
          text: async () => JSON.stringify({ success: true, data: null }),
        },
  );
  const client = createApiClient({
    fetchImpl: fetchImpl as any,
    getSession: () => undefined,
    log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  });
  await expect(
    client.request({
      path: '/api/v1/auth/logout',
      method: 'POST',
      body: {},
      headers: { Authorization: 'Bearer fake-captured-logout-test' },
    }),
  ).resolves.toMatchObject({ status: 200 });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  const request = (
    fetchImpl.mock.calls as unknown as [string, RequestInit][]
  )[1];
  expect(request[0]).toBe(P10_DEV_TEST.origin + '/api/v1/auth/logout');
  expect(request[1].headers).toMatchObject({
    Authorization: 'Bearer fake-captured-logout-test',
  });
});
test.each(['bad-sha', 'wrong-tier', 'correct'])(
  'runtime preflight %s before allowed request',
  async mode => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          build: {
            sha: mode === 'bad-sha' ? 'unknown' : P10_DEV_TEST.runtimeSha,
          },
        },
      }),
      headers: {
        get: () => (mode === 'wrong-tier' ? 'customer-production' : 'dev-test'),
      },
    }));
    if (mode === 'correct')
      await expect(
        verifyP10DevRuntime(fetchImpl as any),
      ).resolves.toBeUndefined();
    else
      await expect(verifyP10DevRuntime(fetchImpl as any)).rejects.toMatchObject(
        { code: 'P10_DEV_RUNTIME_MISMATCH' },
      );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(
      (fetchImpl.mock.calls as unknown as [string, RequestInit][])[0][1]
        .headers,
    ).not.toHaveProperty('Authorization');
  },
);
