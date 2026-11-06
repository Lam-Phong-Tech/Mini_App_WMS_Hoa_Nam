import { securityContextFromProfile } from '../src/services/wms/security';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import {
  setSession,
  clearSession,
  getSession,
  persistSession,
} from '../src/auth/session';
import { AppError } from '../src/errors/AppError';
import {
  decodeProfile,
  fetchCurrentProfile,
  updateCurrentProfile,
  changeProfilePassword,
  fetchProfileSessions,
  revokeProfileSession,
  decodeAuthResult,
  strongProfileEtag,
  profileCommandBlocked,
  type ProfileServiceDeps,
} from '../src/services/wms/profile';
import { logout, subscribeLogoutOutcome } from '../src/services/wms/auth';
import { createApiClient } from '../src/api/client';
import { assertP10Connected, P10_RELEASE } from '../src/config/p10Release';
import { refreshSession, resetRefreshState } from '../src/auth/tokenRefresh';
import * as environment from '../src/config/env';
import {
  USER_ID,
  FAMILY,
  sessionItem,
  profileResponse,
  authResponse,
  sessionsResponse,
  revokeResponse,
} from './fixtures/p10Contract';
const session = {
  accessToken: 'offline-access',
  refreshToken: 'offline-refresh',
  userId: USER_ID,
  authSessionId: FAMILY,
};
const requestFor = (response: unknown) =>
  jest.fn(async () => response) as jest.Mock &
    NonNullable<ProfileServiceDeps['request']>;
const password = {
  currentPassword: ' old password ',
  newPassword: ' new password ',
  newPasswordConfirmation: ' new password ',
};
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession(session);
  resetRefreshState();
});
afterEach(() => {
  clearSession();
  jest.restoreAllMocks();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

describe('P10 pinned decoder / sparse updates', () => {
  test('GET no body/query, meta/header/canonical context preserved', async () => {
    const response = profileResponse(),
      request = requestFor(response),
      user = await fetchCurrentProfile({ request });
    expect(request).toHaveBeenCalledWith({
      path: '/api/v1/auth/me',
      method: 'GET',
    });
    expect(user).toMatchObject({
      id: USER_ID,
      user_id: USER_ID,
      phone: null,
      etag: '"7"',
      active_warehouse_id: null,
      warehouse_context: {
        status: 'REQUIRED',
        error_code: 'WAREHOUSE_CONTEXT_REQUIRED',
      },
      profile_meta: response.data.meta,
    });
  });
  test.each(['READY', 'REQUIRED', 'UNAVAILABLE', 'NO_SESSION'])(
    'context %s is not account ACTIVE',
    status => {
      const response = profileResponse();
      response.data.data.warehouse_context.status = status;
      expect(decodeProfile(response).warehouse_context?.status).toBe(status);
    },
  );
  test.each(['W/"7"', '*', '"7", "8"', '0', '2147483647', '-1'])(
    'reject ETag %s without stripping',
    etag => {
      expect(strongProfileEtag(etag)).toBeUndefined();
      expect(() =>
        decodeProfile({ ...profileResponse(), header: () => etag }),
      ).toThrow();
    },
  );
  test('header unavailable uses canonical version, never request version', () => {
    expect(
      decodeProfile({ ...profileResponse(9), header: undefined }).etag,
    ).toBe('"9"');
  });
  test('PATCH trim/sparse/null; new full canonical version', async () => {
    const request = requestFor(profileResponse(8));
    await updateCurrentProfile(
      { displayName: ' QA ', phone: null },
      decodeProfile(profileResponse()),
      { request },
    );
    expect(request.mock.calls[0][0]).toMatchObject({
      method: 'PATCH',
      headers: { 'If-Match': '"7"' },
      body: { display_name: 'QA', phone: null },
    });
  });
  test('phone omitted stays absent', async () => {
    const request = requestFor(profileResponse(8));
    await updateCurrentProfile({ displayName: 'QA' }, '7', { request });
    expect(request.mock.calls[0][0].body).toEqual({ display_name: 'QA' });
  });
  test.each([
    {},
    { nickname: 'x' },
    { avatar: 'x' },
    { roles: [] },
    { displayName: null },
    { displayName: '  ' },
    { displayName: 'a'.repeat(256) },
    { phone: '' },
    { phone: '091' },
    { phone: '0901234567 ' },
  ])('invalid input does not send %#', async input => {
    const request = requestFor(profileResponse(8));
    await expect(
      updateCurrentProfile(input as any, '7', { request }),
    ).rejects.toMatchObject({ kind: 'config' });
    expect(request).not.toHaveBeenCalled();
  });
  test('255 chars accepted', async () => {
    const request = requestFor(profileResponse(8));
    await updateCurrentProfile({ displayName: 'a'.repeat(255) }, '7', {
      request,
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  test.each([428, 412, 422])(
    'known HTTP %s keeps refusal without success/replay',
    async status => {
      const request = jest.fn(async () => {
        throw new AppError({
          kind: 'http',
          status,
          code: status === 412 ? 'STALE_VERSION' : 'VALIDATION_ERROR',
          message: 'rejected',
        });
      });
      await expect(
        updateCurrentProfile({ phone: null }, '7', { request }),
      ).rejects.toMatchObject({ status });
      expect(request).toHaveBeenCalledTimes(1);
      expect(profileCommandBlocked('profile')).toBe(false);
    },
  );
  test.each([7, undefined])(
    'missing/unchanged response version %s is UNKNOWN',
    async version => {
      const response = profileResponse(7);
      (response.data.data as any).version = version;
      const request = requestFor(response);
      await expect(
        updateCurrentProfile({ phone: null }, '7', { request }),
      ).rejects.toMatchObject({ code: 'P10_UNKNOWN' });
      await expect(
        updateCurrentProfile({ phone: null }, '7', { request }),
      ).rejects.toMatchObject({ code: 'P10_UNKNOWN' });
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  test('timeout cannot become success from matching GET, no automatic retry', async () => {
    const request = jest.fn(async () => {
      throw new AppError({ kind: 'timeout', message: 'offline' });
    });
    await expect(
      updateCurrentProfile({ phone: null }, '7', { request }),
    ).rejects.toMatchObject({ code: 'P10_UNKNOWN' });
    await fetchCurrentProfile({ request: requestFor(profileResponse(8)) });
    expect(profileCommandBlocked('profile')).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });
  test('late GET cannot hydrate new account', async () => {
    const d = deferred<any>(),
      call = fetchCurrentProfile({ request: () => d.promise });
    setSession({ ...session, userId: 'new-user', authSessionId: 'new-family' });
    d.resolve(profileResponse());
    await expect(call).rejects.toMatchObject({ code: 'STALE_AUTH_RESPONSE' });
    expect(getSession()?.userId).toBe('new-user');
  });
  test('late GET cannot cross warehouse context', async () => {
    const d = deferred<any>(),
      call = fetchCurrentProfile({ request: () => d.promise });
    setSession({ ...session, activeWarehouseId: 'changed' });
    d.resolve(profileResponse());
    await expect(call).rejects.toMatchObject({ code: 'STALE_AUTH_RESPONSE' });
  });
  test('actor mismatch in successful PATCH is UNKNOWN', async () => {
    const response = profileResponse(8);
    response.data.data.user_id = '55555555-5555-4555-8555-555555555555';
    await expect(
      updateCurrentProfile({ phone: null }, '7', {
        request: requestFor(response),
      }),
    ).rejects.toMatchObject({ code: 'P10_UNKNOWN' });
  });
  test('double PATCH only one dispatch', async () => {
    const d = deferred<any>(),
      request = jest.fn(() => d.promise);
    const first = updateCurrentProfile({ phone: null }, '7', { request });
    await expect(
      updateCurrentProfile({ phone: null }, '7', { request }),
    ).rejects.toMatchObject({ code: 'P10_UNKNOWN' });
    d.resolve(profileResponse(8));
    await first;
    expect(request).toHaveBeenCalledTimes(1);
  });
});
describe('P10 auth commands / sessions', () => {
  test.each(['CURRENT_AUTH_SESSION_FAMILY', 'CURRENT_ACCESS_TOKEN_ONLY'])(
    'logout records exact scope %s and retains drafts',
    async scope => {
      const storage = createStorage(createMemoryBackend());
      setAppStorageForTesting(storage);
      setSession(session);
      storage.setObject('private-draft', { owner: USER_ID });
      const results: unknown[] = [];
      const off = subscribeLogoutOutcome(r => results.push(r));
      await logout({ post: async () => authResponse('logout', scope).data });
      expect(results).toEqual([
        expect.objectContaining({ kind: 'server-confirmed', scope }),
      ]);
      expect(storage.getObject('private-draft')).toEqual({ owner: USER_ID });
      off();
    },
  );
  test('no refresh still sends ACCESS and empty body', async () => {
    setSession({ ...session, refreshToken: undefined });
    const post = jest.fn(
      async () => authResponse('logout', 'CURRENT_ACCESS_TOKEN_ONLY').data,
    );
    await logout({ post });
    expect(post).toHaveBeenCalledWith(
      '/api/v1/auth/logout',
      {},
      { headers: { Authorization: 'Bearer offline-access' } },
    );
  });
  test.each([
    { success: true, data: null },
    { ...authResponse().data, meta: {} },
    {
      ...authResponse().data,
      meta: {
        auth_result: {
          ...authResponse().data.meta.auth_result,
          work_shift_ended: true,
        },
      },
    },
  ])('partial/invalid auth result is never confirmed %#', raw => {
    expect(() =>
      decodeAuthResult({ status: 200, data: raw }, 'logout'),
    ).toThrow();
  });
  test('password sends exact secrets without trim; confirmed relogin only', async () => {
    const request = requestFor(authResponse('password')),
      clearLocalSession = jest.fn(async () => undefined);
    const result = await changeProfilePassword(password, {
      context: securityContextFromProfile(decodeProfile(profileResponse())),
      request,
      clearLocalSession,
    });
    expect(result.sessionPolicy).toBe('RELOGIN_ALL_REFRESH_FAMILIES_REVOKED');
    expect(request.mock.calls[0][0].body).toEqual({
      current_password: password.currentPassword,
      new_password: password.newPassword,
      new_password_confirmation: password.newPasswordConfirmation,
    });
    expect(clearLocalSession).toHaveBeenCalledTimes(1);
  });
  test.each([7, 129])('password length %s rejected before send', async n => {
    const request = requestFor(authResponse('password'));
    await expect(
      changeProfilePassword(
        {
          ...password,
          newPassword: 'x'.repeat(n),
          newPasswordConfirmation: 'x'.repeat(n),
        },
        {
          request,
          context: securityContextFromProfile(decodeProfile(profileResponse())),
        },
      ),
    ).rejects.toMatchObject({ kind: 'config' });
    expect(request).not.toHaveBeenCalled();
  });
  test('422 wrong-current is input error and keeps session', async () => {
    const request = jest.fn(async () => {
      throw new AppError({
        kind: 'http',
        status: 422,
        message: 'wrong current',
      });
    });
    await expect(
      changeProfilePassword(password, {
        context: securityContextFromProfile(decodeProfile(profileResponse())),
        request,
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(getSession()?.userId).toBe(USER_ID);
  });
  test('invalid password response is UNKNOWN and never clears', async () => {
    const clearLocalSession = jest.fn(),
      request = requestFor({
        status: 200,
        data: { success: true, data: null },
      });
    await expect(
      changeProfilePassword(password, {
        context: securityContextFromProfile(decodeProfile(profileResponse())),
        request,
        clearLocalSession,
      }),
    ).rejects.toMatchObject({ code: 'P11_UNKNOWN' });
    expect(clearLocalSession).not.toHaveBeenCalled();
  });
  test('late password success cannot clear new session', async () => {
    const d = deferred<any>(),
      clearLocalSession = jest.fn();
    const call = changeProfilePassword(password, {
      context: securityContextFromProfile(decodeProfile(profileResponse())),
      request: () => d.promise,
      clearLocalSession,
    });
    clearSession();
    setSession({ ...session, accessToken: 'new-access' });
    d.resolve(authResponse('password'));
    await expect(call).rejects.toMatchObject({ code: 'STALE_AUTH_RESPONSE' });
    expect(clearLocalSession).not.toHaveBeenCalled();
  });
  test('sessions keeps total/pagination, row vs family, null metadata', async () => {
    const request = requestFor(sessionsResponse()),
      page = await fetchProfileSessions({ request });
    expect(page.meta.total).toBe(21);
    expect(page.items).toEqual([sessionItem]);
    expect(request).toHaveBeenCalledWith({
      path: '/api/v1/auth/sessions',
      method: 'GET',
      query: { page: 1, per_page: 20 },
    });
  });
  test.each([
    {},
    { is_current: true, can_revoke: true },
    { is_current: false, can_revoke: null },
  ])('unknown/current permission cannot revoke %#', async values => {
    const response = sessionsResponse();
    (response.data.data[0] as any).is_current = undefined;
    (response.data.data[0] as any).can_revoke = undefined;
    Object.assign(response.data.data[0], values);
    const page = await fetchProfileSessions({ request: requestFor(response) }),
      request = requestFor(revokeResponse());
    await expect(
      revokeProfileSession(page.items[0], { request }, page),
    ).rejects.toMatchObject({ code: 'CURRENT_SESSION_PROTECTED' });
    expect(request).not.toHaveBeenCalled();
  });
  test('family remains current after row rotation', async () => {
    const request = requestFor(revokeResponse());
    await expect(
      revokeProfileSession(
        { ...sessionItem, authSessionId: FAMILY },
        { request },
      ),
    ).rejects.toMatchObject({ code: 'CURRENT_SESSION_PROTECTED' });
    expect(request).not.toHaveBeenCalled();
  });
  test.each([false, true])(
    'DELETE result already_revoked=%s retained; exact row target, no body',
    async already => {
      const response = revokeResponse();
      response.data.data.already_revoked = already;
      const request = requestFor(response),
        result = await revokeProfileSession(
          sessionItem,
          { request },
          await fetchProfileSessions({
            request: requestFor(sessionsResponse()),
          }),
        );
      expect(result.already_revoked).toBe(already);
      expect(request).toHaveBeenCalledWith({
        path: '/api/v1/auth/sessions/' + sessionItem.id,
        method: 'DELETE',
      });
    },
  );
  test.each([404, 409])(
    'DELETE %s does not route to logout/retry',
    async status => {
      const request = jest.fn(async () => {
        throw new AppError({
          kind: 'http',
          status,
          code:
            status === 409 ? 'CURRENT_SESSION_PROTECTED' : 'RESOURCE_NOT_FOUND',
          message: 'refused',
        });
      });
      await expect(
        revokeProfileSession(
          sessionItem,
          { request },
          await fetchProfileSessions({
            request: requestFor(sessionsResponse()),
          }),
        ),
      ).rejects.toMatchObject({
        status,
        ...(status === 404 ? { code: 'P11_UNKNOWN' } : {}),
      });
      expect(request).toHaveBeenCalledTimes(1);
      expect(getSession()).toBeDefined();
    },
  );
  test('DELETE timeout and absent readback do not unlock mutation', async () => {
    const request = jest.fn(async () => {
      throw new Error('lost response');
    });
    await expect(
      revokeProfileSession(
        sessionItem,
        { request },
        await fetchProfileSessions({ request: requestFor(sessionsResponse()) }),
      ),
    ).rejects.toMatchObject({ code: 'P11_UNKNOWN' });
    const response = sessionsResponse();
    response.data.data = [];
    await fetchProfileSessions({ request: requestFor(response) });
    expect(profileCommandBlocked('revoke')).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });
  test('revoke target mismatch is UNKNOWN', async () => {
    const response = revokeResponse();
    response.data.data.id = FAMILY;
    await expect(
      revokeProfileSession(
        sessionItem,
        { request: requestFor(response) },
        await fetchProfileSessions({ request: requestFor(sessionsResponse()) }),
      ),
    ).rejects.toMatchObject({ code: 'P11_UNKNOWN' });
  });
});
describe('release and lifecycle', () => {
  test('production remains OFF and blocks before fetch outside verified DEV', async () => {
    expect(P10_RELEASE.productionEnabled).toBe(false);
    const actual = environment.getCurrentEnvironment();
    jest.spyOn(environment, 'getCurrentEnvironment').mockReturnValue({
      ...actual,
      name: 'customer-production',
      expectedTier: 'customer-production',
    });
    expect(() => assertP10Connected('PATCH', '/api/v1/auth/me')).toThrow();
    const fetchImpl = jest.fn();
    const client = createApiClient({ fetchImpl });
    await expect(
      client.request({
        path: '/api/v1/auth/me',
        method: 'PATCH',
        body: { display_name: 'QA' },
      }),
    ).rejects.toMatchObject({ code: 'P10_PENDING_RELEASE' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  test.each(['success', 'failure'])(
    'late refresh %s cannot restore/delete a later login',
    async outcome => {
      const d = deferred<any>();
      const call = refreshSession({ send: () => d.promise });
      clearSession();
      setSession({
        ...session,
        userId: 'new-user',
        authSessionId: 'new-family',
      });
      if (outcome === 'success')
        d.resolve({
          success: true,
          data: {
            access_token: 'old-rotated',
            refresh_token: 'old-rotated-refresh',
            expires_in: 3600,
          },
        });
      else d.reject(new AppError({ kind: 'auth', message: 'expired' }));
      await expect(call).rejects.toBeDefined();
      expect(getSession()?.userId).toBe('new-user');
    },
  );
  test('logout and new persisted login retain new credentials', async () => {
    const old = logout({ post: async () => authResponse().data });
    await persistSession({
      ...session,
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      authSessionId: 'new-family',
    });
    await old;
    expect(getSession()?.accessToken).toBe('new-access');
  });
});

test('new session refresh does not share old session single-flight', async () => {
  const old = deferred<any>(),
    newer = deferred<any>();
  const first = refreshSession({ send: () => old.promise });
  const rejected = first.catch(error => error);
  clearSession();
  setSession({
    ...session,
    accessToken: 'second',
    authSessionId: 'second-family',
  });
  const send = jest.fn(() => newer.promise);
  const second = refreshSession({ send });
  expect(second).not.toBe(first);
  expect(send).toHaveBeenCalledTimes(1);
  old.resolve({
    data: {
      access_token: 'obsolete',
      refresh_token: 'obsolete-refresh',
      expires_in: 3600,
    },
  });
  expect(await rejected).toMatchObject({ code: 'STALE_AUTH_RESPONSE' });
  expect(refreshSession({ send })).toBe(second);
  newer.resolve({
    data: {
      access_token: 'current',
      refresh_token: 'current-refresh',
      expires_in: 3600,
    },
  });
  await second;
  expect(getSession()?.accessToken).toBe('current');
});

test('late GET 401 cannot refresh/replay using a new login', async () => {
  const response = deferred<any>();
  const readStarted = deferred<void>();
  const fetchImpl = jest.fn(async (url: RequestInfo | URL) => {
    if (String(url).endsWith('/api/v1/health'))
      return {
        ok: true,
        headers: { get: (): string => 'dev-test' },
        json: async () => ({
          data: { build: { sha: '48c7f8fe1fd5c66003b79eb06e84dc65b07c599b' } },
        }),
      };
    readStarted.resolve(undefined);
    return response.promise;
  });
  const client = createApiClient({
    fetchImpl,
  });
  const call = client.get('/api/v1/auth/me');
  const rejected = call.catch(error => error);
  await readStarted.promise;
  clearSession();
  setSession({ ...session, accessToken: 'new', authSessionId: 'new-family' });
  response.resolve({
    ok: false,
    status: 401,
    headers: { get: () => 'application/json' },
    text: async () =>
      JSON.stringify({ success: false, error_code: 'UNAUTHENTICATED' }),
  });
  expect(await rejected).toMatchObject({ status: 401 });
  // Shared GET me no longer invokes a P11 rollout preflight. A late 401 must
  // still neither refresh/replay nor replace the newer login.
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl.mock.calls[0][0]).toContain('/api/v1/auth/me');
  expect(getSession()?.accessToken).toBe('new');
});

test.each([
  'username',
  'email',
  'status',
  'created_at',
  'updated_at',
  'warehouse_scope_ids',
  'available_warehouses',
])('partial canonical missing %s is rejected', key => {
  const response = profileResponse();
  delete (response.data.data as any)[key];
  expect(() => decodeProfile(response)).toThrow();
});
test('unquoted response ETag is not upgraded to a strong header', () => {
  expect(() =>
    decodeProfile({ ...profileResponse(), header: () => '7' }),
  ).toThrow();
});
test.each([true, false])(
  '401 clears only the calling session (current=%s)',
  async current => {
    const d = deferred<any>();
    const call = changeProfilePassword(password, {
      context: securityContextFromProfile(decodeProfile(profileResponse())),
      request: () => d.promise,
    });
    const rejected = call.catch(error => error);
    if (!current) {
      clearSession();
      setSession({ ...session, authSessionId: 'next-family' });
    }
    d.reject(new AppError({ kind: 'auth', status: 401, message: 'expired' }));
    expect(await rejected).toMatchObject({ status: 401 });
    if (current) expect(getSession()).toBeUndefined();
    else expect(getSession()?.authSessionId).toBe('next-family');
  },
);

test('canonical unscoped warehouse scope null remains null; context REQUIRED remains authoritative', () => {
  const response = profileResponse();
  (response.data.data as any).warehouse_scope_ids = null;
  const user = decodeProfile(response);
  expect(user.warehouse_scope_ids).toBeNull();
  expect(user.canonical_profile?.warehouse_scope_ids).toBeNull();
  expect(user.active_warehouse_id).toBeNull();
  expect(user.warehouse_context?.status).toBe('REQUIRED');
});
test.each([undefined, {}, 'ALL', [42], ['not-a-uuid']])(
  'malformed warehouse scope still rejects %#',
  value => {
    const response = profileResponse();
    (response.data.data as any).warehouse_scope_ids = value;
    expect(() => decodeProfile(response)).toThrow();
  },
);
