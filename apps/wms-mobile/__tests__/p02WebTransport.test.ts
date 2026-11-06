jest.mock('../src/api/wmsFetch', () =>
  jest.requireActual('../src/api/wmsFetch.web'),
);

import { wmsFetch, wmsWebRequestUrl } from '../src/api/wmsFetch.web';
import { P02_RELEASE, verifyP02Runtime } from '../src/config/p02Release';
import { clearSession, setSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';

const origin = 'https://khohoanamdev.lptech.info.vn';
const nativeFetch = jest.requireActual('../src/api/wmsFetch').wmsFetch;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalLocation = Object.getOwnPropertyDescriptor(
  globalThis,
  'location',
);
let network: jest.SpyInstance;

beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({ accessToken: 'offline-only', userId: 'offline-owner' });
  const location = {
    href: 'http://127.0.0.1:8817/docs/p02-owner-read.html',
    origin: 'http://127.0.0.1:8817',
  };
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: location,
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location,
    },
  });
  network = jest.spyOn(globalThis, 'fetch').mockResolvedValue({} as Response);
});
afterEach(() => {
  network.mockRestore();
  clearSession();
  if (originalWindow)
    Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
  if (originalLocation)
    Object.defineProperty(globalThis, 'location', originalLocation);
  else Reflect.deleteProperty(globalThis, 'location');
});

test('Web proxies the fixed DEV API, including query; native URL stays unchanged', async () => {
  const url =
    origin + '/api/v1/mini-app/dashboard/summary?warehouse_id=offline';
  const init: RequestInit = {
    headers: { Accept: 'application/json' },
    signal: new AbortController().signal,
    credentials: 'include',
  };
  await wmsFetch(url, init);
  expect(network).toHaveBeenLastCalledWith(
    '/wms-api/api/v1/mini-app/dashboard/summary?warehouse_id=offline',
    init,
  );
  await nativeFetch(url, init);
  expect(network).toHaveBeenLastCalledWith(url, init);
});

test.each([
  'https://customer.example/api/v1/health',
  'https://khohoanamdev.lptech.info.vn.evil.test/api/v1/health',
  'https://khohoanamdev.lptech.info.vn/assets/image.png',
  'http://khohoanamdev.lptech.info.vn/api/v1/health',
  '/api/v1/health',
])(
  'never reroutes another origin, protocol or non-API path to DEV: %s',
  async url => {
    expect(wmsWebRequestUrl(url)).toBe(url);
    await wmsFetch(url);
    expect(network).toHaveBeenCalledWith(url, undefined);
  },
);

test('URL input keeps query and init intact', async () => {
  const init = { method: 'GET' };
  await wmsFetch(new URL(origin + '/api/v1/health?check=1'), init);
  expect(network).toHaveBeenCalledWith('/wms-api/api/v1/health?check=1', init);
});

test('an existing same-origin DEV preview keeps the fixed backend URL and runtime checks', async () => {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { origin, href: origin + '/preview' },
  });
  network.mockResolvedValueOnce(health(P02_RELEASE.runtimeSha, 'dev-test'));
  await expect(verifyP02Runtime()).resolves.toBeUndefined();
  expect(network).toHaveBeenCalledWith(
    origin + '/api/v1/health',
    expect.any(Object),
  );
});
test('same-origin BE preview bypasses the local proxy without changing target or credentials', async () => {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { origin, href: origin + '/test-preview/p01-p24/' },
  });
  const url = origin + '/api/v1/health',
    init = { credentials: 'include' as const };
  await wmsFetch(url, init);
  expect(network).toHaveBeenCalledWith(url, init);
  expect(wmsWebRequestUrl('https://foreign.invalid/api/v1/health')).toBe(
    'https://foreign.invalid/api/v1/health',
  );
});

test('Request input preserves body/headers/credentials and passes init overrides', async () => {
  const input = new Request(origin + '/api/v1/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-WMS-Client-Tier': 'dev-test',
    },
    body: '{"offline":true}',
    credentials: 'include',
  });
  const init = { signal: new AbortController().signal };
  await wmsFetch(input, init);
  const [sent, overrides] = network.mock.calls[0] as [Request, RequestInit];
  expect(sent.url).toBe('http://127.0.0.1:8817/wms-api/api/v1/auth/login');
  expect(sent.method).toBe('POST');
  expect(sent.credentials).toBe('include');
  expect(sent.headers.get('X-WMS-Client-Tier')).toBe('dev-test');
  expect(await sent.text()).toBe('{"offline":true}');
  expect(overrides).toBe(init);
});

function health(sha: string, tier: string | null) {
  return {
    ok: true,
    headers: new Headers(tier ? { 'X-WMS-Deployment-Tier': tier } : {}),
    json: async () => ({ data: { build: { sha } } }),
  } as Response;
}

test('CORS-hidden tier reproduces the user error; exact SHA/tier through proxy passes', async () => {
  network.mockResolvedValueOnce(health(P02_RELEASE.runtimeSha, null));
  await expect(verifyP02Runtime()).rejects.toMatchObject({
    code: 'P02_RUNTIME_MISMATCH',
  });
  network.mockResolvedValueOnce(health(P02_RELEASE.runtimeSha, 'dev-test'));
  await expect(verifyP02Runtime()).resolves.toBeUndefined();
  expect(network).toHaveBeenLastCalledWith(
    '/wms-api/api/v1/health',
    expect.any(Object),
  );
});

test.each([
  ['different-release', 'dev-test'],
  [P02_RELEASE.runtimeSha, 'customer-prod'],
  [P02_RELEASE.runtimeSha, null],
])('proxy does not weaken runtime verification: %s / %s', async (sha, tier) => {
  network.mockResolvedValueOnce(health(sha!, tier));
  await expect(verifyP02Runtime()).rejects.toMatchObject({
    code: 'P02_RUNTIME_MISMATCH',
  });
});

test('a new deployment SHA can reach the owner API without a client rebuild', async () => {
  network.mockResolvedValueOnce(health('b'.repeat(40), 'dev-test'));
  await expect(verifyP02Runtime()).resolves.toBeUndefined();
  expect(P02_RELEASE.runtimePolicy).toBe('OWNER_CONTRACT');
});

test('valid runtime identity still cannot approve a response for a replaced session', async () => {
  network.mockImplementationOnce(async () => {
    setSession({ accessToken: 'offline-new', userId: 'other-offline-owner' });
    return health(P02_RELEASE.runtimeSha, 'dev-test');
  });
  await expect(verifyP02Runtime()).rejects.toMatchObject({ kind: 'cancelled' });
});

test.each([
  origin + '/api/v1/auth/login',
  '/wms-api/api/v1/auth/login',
  origin + '/api/v1/mini-app/history/records',
])(
  'Pages never receives fixed DEV API credentials or requests: %s',
  async url => {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { origin: 'https://duc-nguyen98.github.io' },
    });
    await expect(
      wmsFetch(url, { method: 'POST', body: 'offline-only' }),
    ).rejects.toMatchObject({
      kind: 'config',
      code: 'WEB_PREVIEW_PROXY_UNAVAILABLE',
    });
    expect(network).not.toHaveBeenCalled();
  },
);

test('Pages protection also applies to URL and Request inputs before fetch', async () => {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { href: 'https://duc-nguyen98.github.io/ScannerHNApp/qa/' },
  });
  for (const input of [
    new URL(origin + '/api/v1/health'),
    new Request(origin + '/api/v1/auth/login', {
      method: 'POST',
      body: 'offline-only',
    }),
  ]) {
    await expect(wmsFetch(input)).rejects.toMatchObject({
      code: 'WEB_PREVIEW_PROXY_UNAVAILABLE',
    });
  }
  expect(network).not.toHaveBeenCalled();
});

test('native transport is not blocked by a browser preview hostname', async () => {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { origin: 'https://duc-nguyen98.github.io' },
  });
  await nativeFetch(origin + '/api/v1/health');
  expect(network).toHaveBeenCalledWith(origin + '/api/v1/health', undefined);
});
