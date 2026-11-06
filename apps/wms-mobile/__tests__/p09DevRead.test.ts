import * as release from '../src/config/p09Release';
import * as environment from '../src/config/env';
import type { ApiResponse, RequestOptions } from '../src/api/client';
import {
  P09_DEV_READ,
  P09_RELEASE,
  p09DevReadEnabled,
  p09DevReadPath,
  p09RuntimeMatches,
} from '../src/config/p09Release';
import { createP09Service } from '../src/services/wms/p09Warranty';
import { context, id, fields, resolved, deferred } from './fixtures/p09Mock';
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-10T02:30:00Z'));
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
const gate = () => ({ ...P09_DEV_READ, enabled: true });
it('read approval stays time/origin/build constrained independently of DEV write approval', () => {
  expect(P09_RELEASE.productionEnabled).toBe(false);
  expect(p09DevReadEnabled(gate())).toBe(true);
  expect(p09DevReadEnabled({ ...gate(), enabled: false })).toBe(false);
  expect(p09DevReadEnabled({ ...gate(), expiresAtMs: 0 })).toBe(false);
  expect(p09DevReadEnabled({ ...gate(), origin: 'https://evil.invalid' })).toBe(
    false,
  );
  expect(p09RuntimeMatches('wrong', 'dev-test')).toBe(false);
  expect(p09RuntimeMatches(P09_DEV_READ.runtimeSha, 'production')).toBe(false);
});
it.each([
  '/warranty-cases',
  '/warranty-cases/' + id(4),
  '/warranty-cases/' + id(4) + '/events',
  '/warranty-cases/' + id(4) + '/component-issues',
  '/warranty-cases/' + id(4) + '/attachments',
])('approved GET path %s', path =>
  expect(p09DevReadPath('GET', '/api/v1/mini-app' + path)).toBe(true),
);
it.each([
  ['POST', '/warranty-cases'],
  ['PATCH', '/warranty-cases/' + id(4)],
  ['GET', '/warranty-attachments/' + id(9) + '/download'],
  ['GET', '/warranty-cases/' + id(4) + '/status'],
  ['DELETE', '/warranty-attachments/' + id(9)],
  ['POST', '/warranty-cases/' + id(4) + '/attachments'],
])('read exception denies %s %s', (method, path) =>
  expect(p09DevReadPath(method, '/api/v1/mini-app' + path)).toBe(false),
);
it('permits only the exact read-only resolver POST; aliases and other writes stay closed', () => {
  expect(p09DevReadPath('POST', '/api/v1/mini-app/warranty/resolve-code')).toBe(
    true,
  );
  expect(
    p09DevReadPath('POST', '/api/v1/mini-app/warranty/resolve-code/'),
  ).toBe(false);
  expect(
    p09DevReadPath('PATCH', '/api/v1/mini-app/warranty/resolve-code'),
  ).toBe(false);
  expect(p09DevReadPath('POST', '/api/v1/mini-app/warranty-cases')).toBe(false);
});
it('non-DEV tier blocks network and mutations independently of user manage grant', () => {
  jest.spyOn(environment, 'getCurrentEnvironment').mockReturnValue({
    ...environment.getCurrentEnvironment(),
    name: 'customer-production',
    expectedTier: 'customer-production',
  });
  const request = jest.fn();
  const s = createP09Service(context, { client: { request } });
  expect(s.canWrite()).toBe(false);
  expect(() =>
    s.prepareCreate({ mode: 'IDENTIFIED', resolved }, fields),
  ).toThrow('chờ');
  expect(() => s.list()).toThrow();
  expect(request).not.toHaveBeenCalled();
});

it('continued DEV reads survive elapsed time but stay origin/runtime/tier constrained', () => {
  jest.setSystemTime(new Date('2027-10-13T00:00:00Z'));
  expect(p09DevReadEnabled(gate())).toBe(true);
  expect(p09DevReadEnabled({ ...gate(), expiresAtMs: 1 })).toBe(false);
  expect(p09RuntimeMatches(P09_DEV_READ.runtimeSha, 'dev-test', gate())).toBe(
    true,
  );
  expect(p09RuntimeMatches('replacement', 'dev-test', gate())).toBe(false);
  expect(p09RuntimeMatches(P09_DEV_READ.runtimeSha, 'production', gate())).toBe(
    false,
  );
});

it('deployment identity requires valid SHA format and dev-test tier, not the evidence SHA', () => {
  expect(p09RuntimeMatches(P09_DEV_READ.runtimeSha, 'dev-test', gate())).toBe(
    true,
  );
  expect(p09RuntimeMatches('new-build', 'dev-test', gate())).toBe(false);
  expect(p09RuntimeMatches('b'.repeat(40), 'dev-test', gate())).toBe(true);
});

it('another DEV deployment can reach the strict owner parser without repinning', () => {
  expect(
    p09RuntimeMatches(
      '27e69d21e350b5a112ac08a648c8fa41f54ce302',
      'dev-test',
      gate(),
    ),
  ).toBe(true);
  expect(p09RuntimeMatches(P09_DEV_READ.runtimeSha, 'dev-test', gate())).toBe(
    true,
  );
});

it.each([false, true])(
  'default adapter rechecks runtime before approved read; candidate match=%s',
  async matches => {
    const originalMatch = release.p09RuntimeMatches;
    jest
      .spyOn(release, 'assertP09ReadConnected')
      .mockImplementation(() => undefined);
    jest
      .spyOn(release, 'p09RuntimeMatches')
      .mockImplementation((sha, tier) => originalMatch(sha, tier, gate()));
    const calls: RequestOptions[] = [];
    const client = {
      async request<T>(options: RequestOptions): Promise<ApiResponse<T>> {
        calls.push(options);
        return {
          status: 200,
          header: () => 'dev-test',
          data: (options.path === '/api/v1/health'
            ? {
                success: true,
                data: {
                  build: {
                    sha: matches ? 'b'.repeat(40) : 'other-build',
                  },
                },
              }
            : {
                success: true,
                data: [],
                meta: {
                  contract: 'mini-app-p09-v1',
                  warehouse_id: id(3),
                  total: 0,
                  hasMore: false,
                  nextCursor: null,
                  nextPage: null,
                  pagination: 'KEYSET',
                },
              }) as T,
        };
      },
    };
    const service = createP09Service(context, { client });
    if (matches) {
      expect((await service.list()).meta.total).toBe(0);
      expect(calls.map(c => c.path)).toEqual([
        '/api/v1/health',
        '/api/v1/mini-app/warranty-cases',
      ]);
    } else {
      await expect(service.list()).rejects.toThrow('P09_RUNTIME_CHANGED');
      expect(calls).toHaveLength(1);
    }
    expect(service.canWrite()).toBe(true);
  },
);

it.each(['logout', 'session', 'warehouse', 'permission'])(
  'a %s change during runtime verification prevents the pending write',
  async change => {
    let current = context();
    const health = deferred<ApiResponse<unknown>>();
    const request = jest.fn((_options: RequestOptions) => health.promise);
    const service = createP09Service(() => current, {
      client: { request: request as any },
    });
    const command = service.prepareCreate(
      { mode: 'IDENTIFIED', resolved },
      fields,
    );
    const sending = service.send(command);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toMatchObject({
      method: 'GET',
      path: '/api/v1/health',
    });
    if (change === 'logout') current = {};
    else if (change === 'session')
      current = {
        ...current,
        session: { ...current.session!, authSessionId: id(99) },
        user: { ...current.user!, auth_session_id: id(99) },
      };
    else if (change === 'warehouse')
      current = {
        ...current,
        session: { ...current.session!, activeWarehouseId: id(99) },
      };
    else
      current = {
        ...current,
        user: { ...current.user!, permissions: ['warranty.view'] },
      };
    health.resolve({
      status: 200,
      header: () => 'dev-test',
      data: { success: true, data: { build: { sha: 'a'.repeat(40) } } },
    });
    await expect(sending).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  },
);
