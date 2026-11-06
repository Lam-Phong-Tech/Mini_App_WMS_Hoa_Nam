import { authResponse } from './fixtures/p10Contract';
jest.mock('../src/config/p10Release', () => ({
  ...jest.requireActual('../src/config/p10Release'),
  assertP10Connected: jest.fn(),
}));
import { createApiClient } from '../src/api/client';
import {
  logout,
  subscribeLogoutOutcome,
  type LogoutOutcome,
} from '../src/services/wms/auth';
import { clearSession, getSession, setSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import type { AppEnvironment } from '../src/config/env';
beforeEach(() => setAppStorageForTesting(createStorage(createMemoryBackend())));
afterEach(() => {
  clearSession();
  setAppStorageForTesting(undefined);
});
const environment: AppEnvironment = {
  name: 'dev-test',
  label: 'test',
  apiBaseUrl: 'https://example.invalid',
  requestTimeoutMs: 1000,
  expectedTier: 'dev-test',
  environmentClassVerified: true,
  wmsGateApproved: false,
  behindEdgeProxy: false,
};
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
describe('P02/P01 logout revision2', () => {
  it('client adds ACCESS Bearer to logout alongside native body transport', async () => {
    const fetchImpl = jest.fn(async (_url: unknown, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: null }),
    }));
    const client = createApiClient({
      environment,
      log: logger,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getSession: () => ({ accessToken: 'access-test-only' }),
    });
    await client.request({
      path: '/api/v1/auth/logout',
      method: 'POST',
      body: { refresh_token: 'refresh-test-only' },
    });
    const init = fetchImpl.mock.calls[0]?.[1] as any;
    expect(init.headers.Authorization).toBe('Bearer access-test-only');
    expect(init.headers['X-WMS-Token-Transport']).toBe('body');
    expect(JSON.parse(init.body).refresh_token).toBe('refresh-test-only');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('captured access is sent even after local removal and a later session exists', async () => {
    const fetchImpl = jest.fn(async (_url: unknown, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, data: null }),
    }));
    const client = createApiClient({
      environment,
      log: logger,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getSession: () => ({ accessToken: 'new-access-test-only' }),
    });
    await client.request({
      path: '/api/v1/auth/logout',
      method: 'POST',
      headers: { Authorization: 'Bearer old-access-test-only' },
      body: { refresh_token: 'old-refresh-test-only' },
    });
    expect((fetchImpl.mock.calls[0]?.[1] as any).headers.Authorization).toBe(
      'Bearer old-access-test-only',
    );
  });
  it('local-first captures both credentials; only explicit success confirms server', async () => {
    setSession({
      accessToken: 'access-test-only',
      refreshToken: 'refresh-test-only',
    });
    const seen: LogoutOutcome[] = [];
    const unsubscribe = subscribeLogoutOutcome(r => seen.push(r));
    const post = jest.fn(
      async (_path: string, _body: unknown, _options?: unknown) => {
        expect(getSession()).toBeUndefined();
        return {
          success: true,
          data: null,
          meta: { ...authResponse().data.meta, request_id: 'qa-request-1' },
        };
      },
    );
    await logout({ post });
    expect(post).toHaveBeenCalledWith(
      '/api/v1/auth/logout',
      { refresh_token: 'refresh-test-only' },
      { headers: { Authorization: 'Bearer access-test-only' } },
    );
    expect(seen).toEqual([
      {
        kind: 'server-confirmed',
        requestId: 'qa-request-1',
        scope: 'CURRENT_AUTH_SESSION_FAMILY',
      },
    ]);
    unsubscribe();
  });
  it('network failure is local-only; no automatic logout or refresh retry', async () => {
    setSession({
      accessToken: 'access-test-only',
      refreshToken: 'refresh-test-only',
    });
    const seen: LogoutOutcome[] = [];
    const unsubscribe = subscribeLogoutOutcome(r => seen.push(r));
    const post = jest.fn(async () => {
      throw new Error('network');
    });
    await logout({ post });
    expect(getSession()).toBeUndefined();
    expect(post).toHaveBeenCalledTimes(1);
    expect(seen[0]?.kind).toBe('local-only');
    unsubscribe();
  });
  it('HTTP401 is not a revocation receipt and missing credential cannot revoke all refresh tokens', async () => {
    const seen: LogoutOutcome[] = [];
    const unsubscribe = subscribeLogoutOutcome(r => seen.push(r));
    const post = jest.fn(async () => ({ success: true, data: null }));
    await logout({ post });
    expect(post).not.toHaveBeenCalled();
    setSession({ accessToken: 'access-without-refresh-test-only' });
    await logout({ post });
    expect(post).toHaveBeenCalledWith(
      '/api/v1/auth/logout',
      {},
      { headers: { Authorization: 'Bearer access-without-refresh-test-only' } },
    );
    expect(seen[0]?.kind).toBe('local-only');
    unsubscribe();
  });
  it('late logout result cannot change or announce success for a new login', async () => {
    setSession({
      accessToken: 'old-access-test-only',
      refreshToken: 'old-refresh-test-only',
    });
    let resolve!: (v: unknown) => void;
    const seen: LogoutOutcome[] = [];
    const unsubscribe = subscribeLogoutOutcome(r => seen.push(r));
    const task = logout({
      post: () =>
        new Promise(r => {
          resolve = r;
        }),
    });
    await Promise.resolve();
    for (let i = 0; i < 20 && !resolve; i++) await Promise.resolve();
    setSession({ accessToken: 'new-access-test-only' });
    resolve({ success: true, data: null });
    await task;
    expect(getSession()?.accessToken).toBe('new-access-test-only');
    expect(seen).toEqual([]);
    unsubscribe();
  });
  it('Web uses captured ACCESS Bearer, credentials include and empty body without JS refresh token', async () => {
    jest.resetModules();
    jest.doMock('../src/auth/tokenTransport', () => ({
      usesBodyTokenTransport: false,
      usesCookieTokenTransport: true,
    }));
    try {
      let create!: typeof createApiClient;
      jest.isolateModules(() => {
        create = require('../src/api/client').createApiClient;
      });
      const fetchImpl = jest.fn(async (_url: unknown, _init?: RequestInit) => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true, data: null }),
      }));
      const web = create({
        environment,
        log: logger,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        getSession: () => undefined,
      });
      await web.request({
        path: '/api/v1/auth/logout',
        method: 'POST',
        body: {},
        headers: { Authorization: 'Bearer access-web-test-only' },
      });
      const init = fetchImpl.mock.calls[0]?.[1]!;
      expect(init.credentials).toBe('include');
      expect(init.body).toBe('{}');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        'Bearer access-web-test-only',
      );
      expect(
        (init.headers as Record<string, string>)['X-WMS-Token-Transport'],
      ).toBeUndefined();
    } finally {
      jest.dontMock('../src/auth/tokenTransport');
      jest.resetModules();
    }
  });
});
