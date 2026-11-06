import { createApiClient } from '../src/api/client';
import type { AppEnvironment } from '../src/config/env';
import { approvedWriteFor, allowsIfMatch } from '../src/api/writeGate';
import { id, receipt } from './fixtures/p09Mock';
import * as release from '../src/config/p09Release';
jest.mock('../src/config/p09Release', () => ({
  ...jest.requireActual('../src/config/p09Release'),
  assertP09Connected: jest.fn(),
  assertP09ReadConnected: jest.fn(),
}));
const path = '/api/v1/mini-app/warranty-cases';
const environment: AppEnvironment = {
  name: 'dev-test',
  label: 'Offline',
  apiBaseUrl: 'https://example.invalid',
  requestTimeoutMs: 1000,
  expectedTier: 'dev-test',
  environmentClassVerified: false,
  wmsGateApproved: false,
  behindEdgeProxy: false,
};
const headers = {
  'X-Request-ID': id(20),
  'Idempotency-Key': id(21),
  'If-Match': '"2"',
};
function harness(status: number, body: unknown) {
  const fetchImpl = jest.fn(
    async (_url: unknown, _options: unknown) =>
      ({
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
        blob: async () => new Blob(['offline']),
      } as Response),
  );
  const log = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const client = createApiClient({
    environment,
    fetchImpl,
    log,
    getSession: () => ({ accessToken: 'offline-token' } as never),
  });
  return { fetchImpl, log, client };
}
beforeEach(() => jest.clearAllMocks());
describe('P09 client transport with mocked fetch only', () => {
  it.each([
    [202, 'PROCESSING'],
    [503, 'UNKNOWN'],
    [409, 'FAILED'],
    [412, 'FAILED'],
    [200, 'SUCCEEDED'],
  ])('preserves receipt on HTTP %s %s', async (status, state) => {
    const body = {
      success: state !== 'FAILED',
      data: { receipt: receipt(state as never) },
    };
    const h = harness(Number(status), body);
    const r = await h.client.request({
      method: 'PATCH',
      path: path + '/' + id(4),
      headers,
      body: { note: 'offline' },
      receiptTransport: 'p09',
    });
    expect(r.data).toEqual(body);
    expect(r.status).toBe(status);
    expect(h.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('HTTP failure without receipt stays a real error', async () => {
    const h = harness(428, {
      success: false,
      error_code: 'PRECONDITION_REQUIRED',
    });
    await expect(
      h.client.request({
        method: 'PATCH',
        path: path + '/' + id(4),
        headers,
        body: { note: 'x' },
        receiptTransport: 'p09',
      }),
    ).rejects.toMatchObject({ status: 428 });
  });
  it.each([{}, { 'Idempotency-Key': id(21) }, { ...headers, 'If-Match': '2' }])(
    'rejects incomplete command headers %j before fetch',
    async commandHeaders => {
      const h = harness(200, {});
      await expect(
        h.client.request({
          method: 'PATCH',
          path: path + '/' + id(4),
          headers: commandHeaders as Record<string, string>,
        }),
      ).rejects.toMatchObject({ code: 'P09_COMMAND_HEADERS_REQUIRED' });
      expect(h.fetchImpl).not.toHaveBeenCalled();
    },
  );
  it('blocks P03 headers without converting to standalone', async () => {
    const h = harness(200, {});
    await expect(
      h.client.request({
        method: 'POST',
        path,
        headers: { ...headers, 'X-Draft-ID': id(10) },
      }),
    ).rejects.toMatchObject({ code: 'P09_P03_LINK_PENDING' });
    expect(h.fetchImpl).not.toHaveBeenCalled();
  });
  it('narrow transport does not swallow errors from other endpoints', async () => {
    const h = harness(200, {});
    await expect(
      h.client.request({
        method: 'GET',
        path: '/api/v1/mini-app/items',
        receiptTransport: 'p09',
      }),
    ).rejects.toMatchObject({ kind: 'blocked_by_gate' });
    expect(h.fetchImpl).not.toHaveBeenCalled();
  });
  it('does not expose search, command body or headers to logs', async () => {
    const h = harness(200, { success: true, data: [] });
    await h.client.request({
      method: 'GET',
      path,
      query: { search: 'private serial' },
    });
    expect(h.log.debug).not.toHaveBeenCalled();
    expect(h.log.warn).not.toHaveBeenCalled();
  });
  it('binary uses approved relative path, bearer and rejects redirects', async () => {
    const h = harness(200, {});
    const r = await h.client.request({
      method: 'GET',
      path: '/api/v1/mini-app/warranty-attachments/' + id(9) + '/download',
      responseType: 'blob',
    });
    expect(r.data).toBeInstanceOf(Blob);
    expect(h.fetchImpl.mock.calls[0][1]).toMatchObject({
      redirect: 'error',
      headers: { Authorization: 'Bearer offline-token' },
    });
  });
  it('401/403 retain P15 owner status; no POST refresh/replay', async () => {
    for (const status of [401, 403]) {
      const h = harness(status, { success: false });
      await expect(
        h.client.request({
          method: 'POST',
          path,
          headers: { 'X-Request-ID': id(20), 'Idempotency-Key': id(21) },
          receiptTransport: 'p09',
        }),
      ).rejects.toMatchObject({ status });
      expect(h.fetchImpl).toHaveBeenCalledTimes(1);
    }
  });
  it('release check precedes all fetches', async () => {
    jest.mocked(release.assertP09ReadConnected).mockImplementationOnce(() => {
      throw Error('OFF');
    });
    const h = harness(200, {});
    await expect(h.client.request({ method: 'GET', path })).rejects.toThrow(
      'OFF',
    );
    expect(h.fetchImpl).not.toHaveBeenCalled();
  });
  it('PATCH is exact; DELETE and stock Post stay denied', () => {
    expect(approvedWriteFor('PATCH', path + '/' + id(4))).toBeDefined();
    expect(allowsIfMatch('PATCH', path + '/' + id(4))).toBe(true);
    for (const [method, p] of [
      ['DELETE', '/api/v1/mini-app/warranty-attachments/' + id(9)],
      ['POST', path + '/' + id(4) + '/post'],
      ['PATCH', path + '/' + id(4) + '/events'],
    ])
      expect(approvedWriteFor(method, p)).toBeUndefined();
  });
});
