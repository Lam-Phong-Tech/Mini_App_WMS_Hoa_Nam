jest.mock('../src/config/p11Release', () => ({
  ...jest.requireActual('../src/config/p11Release'),
  assertP11Connected: jest.fn(),
}));
import { createApiClient } from '../src/api/client';
import { AppError } from '../src/errors/AppError';
import { assertP11Connected } from '../src/config/p11Release';
import { setSession, clearSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { passwordPolicy } from './fixtures/p11Policy';
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
const mockGate = assertP11Connected as jest.Mock;
const silent = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'offline-access',
    refreshToken: 'offline-refresh',
  });
  mockGate.mockReset();
});
afterEach(() => clearSession());
test('releaseOFF blocks GET sessions and command routes before HTTP', async () => {
  mockGate.mockImplementation(() => {
    throw new AppError({
      kind: 'blocked_by_gate',
      code: 'P11_PENDING_RELEASE',
      message: 'pending',
    });
  });
  const fetchImpl = jest.fn(),
    client = createApiClient({ environment, fetchImpl, log: silent });
  for (const [method, path] of [
    ['GET', '/api/v1/auth/sessions'],
    ['POST', '/api/v1/auth/change-password'],
    ['DELETE', '/api/v1/auth/sessions/row'],
  ])
    await expect(
      client.request({ method: method as 'GET' | 'POST' | 'DELETE', path }),
    ).rejects.toMatchObject({ code: 'P11_PENDING_RELEASE' });
  expect(fetchImpl).not.toHaveBeenCalled();
});
test.each(['Idempotency-Key', 'X-Request-ID', 'If-Match'])(
  'reject unsupported %s before send',
  async header => {
    const fetchImpl = jest.fn(),
      client = createApiClient({ environment, fetchImpl, log: silent });
    await expect(
      client.request({
        method: 'POST',
        path: '/api/v1/auth/change-password',
        headers: { [header]: 'not-a-receipt' },
        body: {},
      }),
    ).rejects.toMatchObject({ code: 'P11_UNSUPPORTED_COMMAND_HEADER' });
    expect(fetchImpl).not.toHaveBeenCalled();
  },
);
test('422 policy preserved as typed allowlist; wrong current keeps auth; no arbitrary payload metadata', async () => {
  const payload = {
    success: false,
    error: {
      code: 'CURRENT_PASSWORD_INCORRECT',
      details: { current_password: ['Mật khẩu hiện tại không đúng.'] },
    },
    data: {
      password_policy: { ...passwordPolicy(), secret_field: 'must-be-dropped' },
      new_password: 'must-be-dropped',
    },
    meta: { request_id: 'correlation-only' },
  };
  const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 422,
      text: async () => JSON.stringify(payload),
    })),
    client = createApiClient({
      environment,
      fetchImpl: fetchImpl as any,
      log: silent,
    });
  let caught: AppError | undefined;
  try {
    await client.request({
      method: 'POST',
      path: '/api/v1/auth/change-password',
      body: {
        current_password: 'offline-current',
        new_password: 'offline-new',
        new_password_confirmation: 'offline-new',
      },
    });
  } catch (e) {
    caught = e as AppError;
  }
  expect(caught?.code).toBe('CURRENT_PASSWORD_INCORRECT');
  expect(caught?.passwordPolicy?.maxUtf8Bytes).toBe(72);
  expect(Object.keys(caught?.passwordPolicy ?? {})).not.toContain(
    'secret_field',
  );
  expect(caught?.fieldErrors?.current_password).toHaveLength(1);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
test.each(['POST', 'DELETE'] as const)(
  '%s 401 never refreshes/replays mutation',
  async method => {
    const fetchImpl = jest.fn(async () => ({
        ok: false,
        status: 401,
        text: async () =>
          JSON.stringify({ success: false, error_code: 'UNAUTHENTICATED' }),
      })),
      client = createApiClient({
        environment,
        fetchImpl: fetchImpl as any,
        log: silent,
      });
    await expect(
      client.request({
        method,
        path:
          method === 'POST'
            ? '/api/v1/auth/change-password'
            : '/api/v1/auth/sessions/33333333-3333-4333-8333-333333333333',
        ...(method === 'POST' ? { body: {} } : {}),
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  },
);
