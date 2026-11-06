import { createApiClient } from '../src/api/client';
import { ENVIRONMENTS } from '../src/config/env';
import { P11_DEV_RELEASE } from '../src/config/p11Release';
import { clearSession, setSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';

const dev = ENVIRONMENTS['dev-test'];
const log = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
const payload = {
  success: true,
  data: { user_id: 'fixture-actor', auth_session_id: 'fixture-session' },
};
function response(status: number, body: unknown) {
  return {
    ok: status < 400,
    status,
    headers: { get: () => 'dev-test' },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'test-only-access',
    userId: 'fixture-actor',
    authSessionId: 'fixture-session',
  });
});
afterEach(() => clearSession());

describe('P01 shared identity read is not P11 release activation', () => {
  it.each(['/api/v1/auth/me', '/api/v1/auth/me?ignored=1'])(
    'GET %s reaches auth without a P11 runtime pin check',
    async path => {
      const fetchImpl = jest.fn(async (url: string) =>
        url.endsWith('/health')
          ? response(200, {
              data: { build: { sha: 'unapproved-security-build' } },
            })
          : response(200, payload),
      );
      const client = createApiClient({
        environment: dev,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        log,
      });
      await expect(client.get(path)).resolves.toMatchObject({
        status: 200,
        data: payload,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, options] = fetchImpl.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe(dev.apiBaseUrl + path);
      expect(options.headers).toMatchObject({
        Authorization: 'Bearer test-only-access',
        'X-WMS-Client-Tier': 'dev-test',
      });
      expect(options.body).toBeUndefined();
    },
  );

  it.each([
    ['GET', '/api/v1/auth/sessions'],
    ['POST', '/api/v1/auth/change-password'],
    ['DELETE', '/api/v1/auth/sessions/11111111-1111-4111-8111-111111111111'],
  ] as const)(
    'P11 %s %s still blocks before request when runtime changes',
    async (method, path) => {
      const fetchImpl = jest.fn(async () =>
        response(200, {
          data: { build: { sha: 'unapproved-security-build' } },
        }),
      );
      const client = createApiClient({
        environment: dev,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        log,
      });
      await expect(client.request({ method, path })).rejects.toMatchObject({
        code: 'P11_DEV_RUNTIME_MISMATCH',
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(
        P11_DEV_RELEASE.origin + '/api/v1/health',
      );
    },
  );

  it('P10 PATCH requires verified DEV health; unapproved business writes remain closed', async () => {
    const fetchImpl = jest.fn(async () =>
      response(200, { data: { build: { sha: 'unverified' } } }),
    );
    const client = createApiClient({
      environment: dev,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      log,
    });
    await expect(
      client.request({ method: 'PATCH', path: '/api/v1/auth/me', body: {} }),
    ).rejects.toMatchObject({ kind: 'blocked_by_gate' });
    await expect(
      client.request({ method: 'DELETE', path: '/api/v1/roles/fixture' }),
    ).rejects.toMatchObject({ kind: 'blocked_by_gate' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
