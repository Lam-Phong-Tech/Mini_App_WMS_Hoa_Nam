jest.mock('../src/config/p10Release', () => ({
  ...jest.requireActual('../src/config/p10Release'),
  assertP10Connected: jest.fn(),
}));
import { createApiClient } from '../src/api/client';
import { allowsIdempotencyKey, allowsIfMatch } from '../src/api/writeGate';
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
const log = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
test.each(['GET', 'PATCH'] as const)(
  'native %s /me pins identity without weakening If-Match',
  async method => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true }),
    }));
    const client = createApiClient({
      environment,
      fetchImpl: fetchImpl as any,
      log,
      getSession: () => ({ accessToken: 'offline' }),
    });
    await client.request({
      method,
      path: '/api/v1/auth/me',
      headers: {
        'Accept-Encoding': 'gzip',
        ...(method === 'PATCH' ? { 'If-Match': '"7"' } : {}),
      },
      ...(method === 'PATCH' ? { body: { display_name: 'offline' } } : {}),
    });
    const init = (
      fetchImpl.mock.calls as unknown as [string, RequestInit][]
    )[0][1];
    expect(init.headers).toMatchObject({
      'Accept-Encoding': 'identity',
      Authorization: 'Bearer offline',
    });
    if (method === 'PATCH')
      expect(init.headers).toMatchObject({ 'If-Match': '"7"' });
    expect(init.headers).not.toHaveProperty('Idempotency-Key');
  },
);
test('unrelated native GET does not receive P10 encoding override', async () => {
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ success: true }),
  }));
  await createApiClient({ environment, fetchImpl: fetchImpl as any, log }).get(
    '/api/v1/health',
  );
  expect(
    (fetchImpl.mock.calls as unknown as [string, RequestInit][])[0][1].headers,
  ).not.toHaveProperty('Accept-Encoding');
});

test('P10 whitelist permits required If-Match and rejects P09 Idempotency-Key', () => {
  expect(allowsIfMatch('PATCH', '/api/v1/auth/me')).toBe(true);
  expect(allowsIdempotencyKey('PATCH', '/api/v1/auth/me')).toBe(false);
  expect(allowsIfMatch('POST', '/api/v1/auth/change-password')).toBe(false);
});
