jest.mock('../src/auth/tokenTransport', () => ({
  usesBodyTokenTransport: false,
  usesCookieTokenTransport: true,
}));
jest.mock('../src/config/p10Release', () => ({
  ...jest.requireActual('../src/config/p10Release'),
  assertP10Connected: jest.fn(),
}));
import { createApiClient } from '../src/api/client';
import { logout } from '../src/services/wms/auth';
import { setSession, clearSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { authResponse } from './fixtures/p10Contract';
import type { AppEnvironment } from '../src/config/env';
const environment: AppEnvironment = {
  name: 'dev-test',
  label: 'offline-test',
  apiBaseUrl: 'https://example.invalid',
  requestTimeoutMs: 1000,
  expectedTier: 'dev-test',
  environmentClassVerified: true,
  wmsGateApproved: false,
  behindEdgeProxy: false,
};
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'offline-access',
    refreshToken: 'must-not-send-web-refresh',
  });
});
afterEach(() => clearSession());
test('web logout body empty, ACCESS bearer, HttpOnly cookie transport include; no native header', async () => {
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(authResponse().data),
  }));
  const client = createApiClient({
    environment,
    fetchImpl: fetchImpl as any,
    log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  });
  await logout({
    post: async (path, body, options) =>
      (
        await client.request({
          path,
          method: 'POST',
          body,
          headers: options?.headers,
        })
      ).data,
  });
  const init = (
    fetchImpl.mock.calls as unknown as [string, RequestInit][]
  )[0][1];
  expect(init.credentials).toBe('include');
  expect(init.body).toBe('{}');
  expect(init.headers).toMatchObject({
    Authorization: 'Bearer offline-access',
  });
  expect(init.headers).not.toHaveProperty('X-WMS-Token-Transport');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
test.each([403, 409, 422, 401])(
  'web logout %s never swaps transport or retries',
  async status => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status,
      text: async () =>
        JSON.stringify({
          success: false,
          error_code: 'REFRESH_TOKEN_TRANSPORT_MISMATCH',
        }),
    }));
    const client = createApiClient({
      environment,
      fetchImpl: fetchImpl as any,
      log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    });
    await logout({
      post: async (path, body, options) =>
        (
          await client.request({
            path,
            method: 'POST',
            body,
            headers: options?.headers,
          })
        ).data,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(
      (fetchImpl.mock.calls as unknown as [string, RequestInit][])[0][1].body,
    ).toBe('{}');
  },
);

test('web /me leaves content encoding to browser', async () => {
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ success: true }),
  }));
  await createApiClient({ environment, fetchImpl: fetchImpl as any }).get(
    '/api/v1/auth/me',
  );
  expect(
    (fetchImpl.mock.calls as unknown as [string, RequestInit][])[0][1].headers,
  ).not.toHaveProperty('Accept-Encoding');
});
