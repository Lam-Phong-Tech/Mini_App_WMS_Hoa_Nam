import {
  P11_DEV_RELEASE,
  P11_RELEASE,
  p11DevEnabled,
  p11DevRequestAllowed,
  assertP11Connected,
  verifyP11DevRuntime,
} from '../src/config/p11Release';
import { ENVIRONMENTS } from '../src/config/env';
import { assertP10Connected, P10_RELEASE } from '../src/config/p10Release';
import { createApiClient } from '../src/api/client';
import { setSession, clearSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';

const row = '33333333-3333-4333-8333-333333333333';
const session = {
  accessToken: 'offline-access',
  refreshToken: 'offline-refresh',
  userId: '11111111-1111-4111-8111-111111111111',
  authSessionId: '22222222-2222-4222-8222-222222222222',
};
const dev = ENVIRONMENTS['dev-test'];
const silent = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
const health = (
  sha: string = P11_DEV_RELEASE.runtimeSha,
  tier: string = 'dev-test',
) => ({
  ok: true,
  status: 200,
  headers: { get: (): string => tier },
  json: async () => ({ data: { build: { sha } } }),
});
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession(session);
});
afterEach(() => {
  clearSession();
  jest.useRealTimers();
});

test('ongoing DEV activation survives QA expiry and does not restrict to the QA actor', () => {
  jest.useFakeTimers().setSystemTime(Date.parse('2027-01-01T00:00:00Z'));
  expect(P11_RELEASE.devTestEnabled).toBe(true);
  expect(P11_RELEASE.productionEnabled).toBe(false);
  expect(P10_RELEASE.productionEnabled).toBe(false);
  expect(() =>
    assertP11Connected('POST', '/api/v1/auth/change-password'),
  ).not.toThrow();
  expect(() =>
    assertP11Connected('DELETE', '/api/v1/auth/sessions/' + row),
  ).not.toThrow();
  expect(() => assertP10Connected('GET', '/api/v1/auth/me')).not.toThrow();
  expect(() => assertP10Connected('PATCH', '/api/v1/auth/me')).not.toThrow();
  expect(() => assertP10Connected('POST', '/api/v1/auth/logout')).not.toThrow();
  expect(() =>
    assertP10Connected(
      'PATCH',
      '/api/v1/auth/me',
      ENVIRONMENTS['customer-production'],
    ),
  ).toThrow();
});
test.each([
  ENVIRONMENTS['customer-production'],
  { ...dev, expectedTier: 'customer-production' as const },
  { ...dev, apiBaseUrl: 'https://unverified.example.invalid' },
  { ...dev, environmentClassVerified: false },
])(
  'customer/wrong origin or unverified environment remains closed',
  environment => {
    expect(p11DevEnabled(environment)).toBe(false);
    expect(() =>
      assertP11Connected('POST', '/api/v1/auth/change-password', environment),
    ).toThrow();
  },
);
test('customer build and rollback flag remain closed', () => {
  expect(p11DevEnabled(dev, 'customer-production')).toBe(false);
  expect(p11DevEnabled(dev, 'dev-test', false)).toBe(false);
});
test.each([
  ['PATCH', '/api/v1/auth/me'],
  ['POST', '/api/v1/auth/logout'],
  ['POST', '/api/v1/mini-app/work-shifts/end'],
  ['GET', '/api/v1/auth/password/policy'],
  ['GET', '/api/v1/auth/operations/request'],
  ['DELETE', '/api/v1/auth/sessions/not-a-row-id'],
])('P11 does not authorize unrelated %s %s', (method, path) => {
  expect(p11DevRequestAllowed(method, path)).toBe(false);
  expect(() => assertP11Connected(method, path)).toThrow();
});
test.each(['sha', 'tier', 'status', 'parse', 'network'])(
  'unverified health %s prevents command HTTP',
  async mode => {
    const fetchImpl = jest.fn(async () => {
      if (mode === 'network') throw new TypeError('offline');
      const r = health(
        mode === 'sha' ? 'unknown' : undefined,
        mode === 'tier' ? 'customer-production' : undefined,
      );
      if (mode === 'status') return { ...r, ok: false, status: 503 };
      if (mode === 'parse')
        return {
          ...r,
          json: async () => {
            throw new SyntaxError('bad response');
          },
        };
      return r;
    });
    const client = createApiClient({
      environment: dev,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      log: silent,
    });
    await expect(
      client.request({
        method: 'POST',
        path: '/api/v1/auth/change-password',
        body: {},
      }),
    ).rejects.toMatchObject({ kind: 'blocked_by_gate' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const options = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(options[0]).toBe(P11_DEV_RELEASE.origin + '/api/v1/health');
    expect(options[1].headers).not.toHaveProperty('Authorization');
    expect(options[1].body).toBeUndefined();
  },
);
test('customer production is blocked before any health or command HTTP', async () => {
  const fetchImpl = jest.fn();
  const client = createApiClient({
    environment: ENVIRONMENTS['customer-production'],
    fetchImpl,
    log: silent,
  });
  await expect(
    client.request({
      method: 'POST',
      path: '/api/v1/auth/change-password',
      body: {},
    }),
  ).rejects.toMatchObject({ code: 'P11_PENDING_RELEASE' });
  expect(fetchImpl).not.toHaveBeenCalled();
});
test('auth owner changed during health never dispatches the captured command', async () => {
  let finish!: (response: unknown) => void;
  const fetchImpl = jest.fn(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  const pending = verifyP11DevRuntime(fetchImpl as unknown as typeof fetch);
  clearSession();
  setSession({ ...session, userId: '44444444-4444-4444-8444-444444444444' });
  finish(health());
  await expect(pending).rejects.toMatchObject({
    code: 'STALE_AUTH_RESPONSE',
    kind: 'blocked_by_gate',
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
test.each(['POST', 'DELETE'] as const)(
  'activated DEV %s 401 cannot refresh or replay',
  async method => {
    const fetchImpl = jest.fn(async (url: string) =>
      url.endsWith('/health')
        ? health()
        : {
            ok: false,
            status: 401,
            headers: { get: (): undefined => undefined },
            text: async () =>
              JSON.stringify({ success: false, error_code: 'UNAUTHENTICATED' }),
          },
    );
    const client = createApiClient({
      environment: dev,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      log: silent,
    });
    await expect(
      client.request({
        method,
        path:
          method === 'POST'
            ? '/api/v1/auth/change-password'
            : '/api/v1/auth/sessions/' + row,
        ...(method === 'POST' ? { body: {} } : {}),
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map(c => c[0])).toEqual([
      P11_DEV_RELEASE.origin + '/api/v1/health',
      P11_DEV_RELEASE.origin +
        (method === 'POST'
          ? '/api/v1/auth/change-password'
          : '/api/v1/auth/sessions/' + row),
    ]);
  },
);
