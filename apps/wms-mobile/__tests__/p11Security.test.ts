import {
  decodePasswordPolicy,
  passwordSize,
  validateSecurityPasswords,
} from '../src/contracts/p11Security';
import { decodeProfile } from '../src/services/wms/profile';
import {
  captureSecurityOwner,
  securityContextFromProfile,
  changeSecurityPassword,
  decodePasswordChangeResult,
  fetchSecuritySessions,
  revokeSecuritySession,
  decodeSecuritySessions,
  canRevokeSecuritySession,
  securityCommandBlocked,
  securityFieldErrors,
  getSecurityResultNotice,
  clearSecurityResultNotice,
  type SecurityServiceDeps,
} from '../src/services/wms/security';
import { clearSession, setSession, getSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  setAppStorageForTesting,
  getAppStorage,
} from '../src/storage/storage';
import { AppError } from '../src/errors/AppError';
import { P11_RELEASE, assertP11Connected } from '../src/config/p11Release';
import { passwordPolicy, securityContract } from './fixtures/p11Policy';
import {
  USER_ID,
  FAMILY,
  ROW,
  OTHER,
  profileResponse,
  authResponse,
  sessionsResponse,
  revokeResponse,
} from './fixtures/p10Contract';
const session = {
  accessToken: 'offline-access',
  userId: USER_ID,
  authSessionId: FAMILY,
};
const input = (value = 'offline-new-value') => ({
  currentPassword: 'offline-current',
  newPassword: value,
  newPasswordConfirmation: value,
});
const context = () =>
  securityContextFromProfile(decodeProfile(profileResponse()));
const requestFor = (value: unknown) =>
  jest.fn(async () => value) as jest.Mock &
    NonNullable<SecurityServiceDeps['request']>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession(session);
  clearSecurityResultNotice();
});
afterEach(() => {
  clearSession();
  clearSecurityResultNotice();
});

describe('P11 policy and Unicode arithmetic', () => {
  test('uses GET me security metadata, preserves canonical P10/ETag and same auth owner', () => {
    const user = decodeProfile(profileResponse()),
      security = context();
    expect(user.etag).toBe('"7"');
    expect(user.phone).toBeNull();
    expect(user.profile_meta?.profile_contract).toBeDefined();
    expect(security.policy.version).toBe('p11-password-v1-bcrypt');
    expect(security.policy.inputNormalization).toBe(
      'EXISTING_REQUEST_MIDDLEWARE',
    );
    expect(security.policy.maxUtf8Bytes).toBe(72);
  });
  test.each([
    'missing',
    'unknown-version',
    'missing-policy',
    'new-rules',
    'byte-missing',
    'bad-unit',
    'unsupported-ops',
    'production-ready',
  ])('fail closed: %s', kind => {
    const user = decodeProfile(profileResponse()),
      meta = { ...user.profile_meta },
      c: any = securityContract();
    if (kind === 'missing') delete meta.security_contract;
    else {
      if (kind === 'unknown-version') c.version = 'new-contract';
      if (kind === 'missing-policy') delete c.password_policy;
      if (kind === 'new-rules')
        c.password_policy.composition_rules = ['uppercase'];
      if (kind === 'byte-missing') delete c.password_policy.max_utf8_bytes;
      if (kind === 'bad-unit') c.password_policy.length_unit = 'UTF16';
      if (kind === 'unsupported-ops') c.operations.idempotency_supported = true;
      if (kind === 'production-ready') c.release.production_ready = true;
      meta.security_contract = c;
    }
    expect(() =>
      securityContextFromProfile({ ...user, profile_meta: meta }),
    ).toThrow();
  });
  test('metadata cannot cross actor or auth session, no warehouse/shift self-service gate', () => {
    const user = decodeProfile(profileResponse());
    expect(() => securityContextFromProfile({ ...user, id: OTHER })).toThrow();
    expect(() =>
      securityContextFromProfile({ ...user, auth_session_id: OTHER }),
    ).toThrow();
    setSession({ ...session, activeWarehouseId: ROW });
    expect(context().policy.minLength).toBe(8);
  });
  test.each([
    ['ASCII72', () => 'x'.repeat(72), true],
    ['ASCII73', () => 'x'.repeat(73), false],
    ['accent36', () => 'á'.repeat(36), true],
    ['accent37', () => 'á'.repeat(37), false],
    ['emoji18', () => '😀'.repeat(18), true],
    ['emoji19', () => '😀'.repeat(19), false],
  ])('%s bytes boundary', (_label, make, valid) => {
    const errors = validateSecurityPasswords(
      input(make()),
      decodePasswordPolicy(passwordPolicy())!,
    );
    expect(!errors.newPassword).toBe(valid);
  });
  test('scalar count differs from UTF16; malformed Unicode/NUL rejected without changing input', () => {
    expect(passwordSize('😀')).toEqual({
      characters: 1,
      utf8Bytes: 4,
      nul: false,
    });
    expect(passwordSize('\ud800')).toBeUndefined();
    expect(passwordSize('\udc00')).toBeUndefined();
    for (const value of ['x'.repeat(8) + '\0', 'x'.repeat(8) + '\ud800']) {
      const fields = input(value);
      expect(
        !!validateSecurityPasswords(fields, context().policy).newPassword,
      ).toBe(true);
      expect(fields.newPassword === value).toBe(true);
    }
  });
  test('null byte ceiling keeps Unicode length/NUL/confirmation; no hidden72 fallback', () => {
    const policy = decodePasswordPolicy(passwordPolicy('argon2id'))!;
    expect(policy.maxUtf8Bytes).toBeNull();
    expect(validateSecurityPasswords(input('😀'.repeat(128)), policy)).toEqual(
      {},
    );
    expect(
      !!validateSecurityPasswords(input('😀'.repeat(129)), policy).newPassword,
    ).toBe(true);
    expect(
      !!validateSecurityPasswords(
        { ...input(), newPasswordConfirmation: 'different' },
        policy,
      ).newPasswordConfirmation,
    ).toBe(true);
  });
  test('keeps exact whitespace/code points, current max255 not UTF16 length', () => {
    const p = decodePasswordPolicy(passwordPolicy('argon2id'))!;
    const fields = {
      ...input(' ' + 'á'.repeat(8) + ' '),
      currentPassword: '😀'.repeat(255),
    };
    expect(validateSecurityPasswords(fields, p)).toEqual({});
    expect(
      !!validateSecurityPasswords(
        { ...fields, currentPassword: '😀'.repeat(256) },
        p,
      ).currentPassword,
    ).toBe(true);
  });
});
describe('P11 synchronous password command and UNKNOWN', () => {
  test('uncertain command survives logout/generation changes without persisting password or token', async () => {
    const request = jest.fn(async () => {
      throw new AppError({ kind: 'timeout', message: 'lost' });
    });
    await expect(
      changeSecurityPassword(input(), { request, context: context() }),
    ).rejects.toMatchObject({ code: 'P11_UNKNOWN' });
    const marker = getAppStorage()
      .keys()
      .find(key => key.startsWith('p11-command-uncertain/v1/'))!;
    const stored = getAppStorage().getString(marker)!;
    expect(stored).not.toMatch(
      /current_password|new_password|accessToken|refreshToken/,
    );
    clearSession();
    setSession({ ...session, authSessionId: OTHER });
    expect(securityCommandBlocked('password')).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    setSession({ ...session, userId: OTHER, authSessionId: OTHER });
    expect(securityCommandBlocked('password')).toBe(false);
    setSession(session);
    expect(securityCommandBlocked('password')).toBe(true);
  });
  test('customer production remains OFF; missing policy never dispatches', async () => {
    expect(P11_RELEASE.productionEnabled).toBe(false);
    expect(() => assertP11Connected('PATCH', '/api/v1/auth/me')).toThrow();
    const request = requestFor(authResponse('password'));
    await expect(
      changeSecurityPassword(input(), { request }),
    ).rejects.toMatchObject({ code: 'P11_POLICY_UNAVAILABLE' });
    expect(request).not.toHaveBeenCalled();
  });
  test('exact3 fields, no version/header; data:null server result publishes before scoped auth clear, drafts survive', async () => {
    const storage = createStorage(createMemoryBackend());
    setAppStorageForTesting(storage);
    clearSession();
    setSession(session);
    storage.setObject('private-draft', { owner: USER_ID });
    const request = requestFor(authResponse('password')),
      fields = input('  offline-new-value  '),
      result = await changeSecurityPassword(fields, {
        request,
        context: context(),
      });
    const options = request.mock.calls[0][0];
    expect(options.path).toBe('/api/v1/auth/change-password');
    expect(Object.keys(options.body).sort()).toEqual(
      ['current_password', 'new_password', 'new_password_confirmation'].sort(),
    );
    expect(options.headers).toBeUndefined();
    expect(options.query).toBeUndefined();
    expect(options.body.new_password === fields.newPassword).toBe(true);
    expect(getSession()).toBeUndefined();
    expect(result.passwordChangedAt).toBe('2026-10-10T06:01:02Z');
    expect(getSecurityResultNotice()).toEqual(result);
    expect(storage.getObject('private-draft')).toEqual({ owner: USER_ID });
  });
  test('confirmed change retains display-only account/warehouse labels in memory without sending or storing them', async () => {
    const ctx={...context(),displayContext:{accountName:'Nhân viên TEST',warehouseName:'Kho TEST'}};
    const request=requestFor(authResponse('password'));
    const result=await changeSecurityPassword(input(),{request,context:ctx});
    expect(result).toMatchObject({displayContext:{accountName:'Nhân viên TEST',warehouseName:'Kho TEST'}});
    expect(Object.keys(request.mock.calls[0][0].body).sort()).toEqual(['current_password','new_password','new_password_confirmation'].sort());
    expect(getAppStorage().keys().map(key=>getAppStorage().getString(key)??'').join('\n')).not.toContain('Nhân viên TEST');
  });
  test('a new login cannot revive the previous caller password-result identity',async()=>{
    const request=requestFor(authResponse('password'));
    await changeSecurityPassword(input(),{request,context:context()});
    expect(getSecurityResultNotice()).toBeDefined();
    setSession({...session,userId:OTHER,authSessionId:OTHER});
    expect(getSecurityResultNotice()).toBeUndefined();
  });
  test('null/missingtime stays null, applied policy version may differ; no Date.now receipt', () => {
    for (const time of [null, undefined]) {
      const r = authResponse('password');
      Object.assign(r.data.meta.auth_result, {
        password_changed_at: time,
        password_policy_version: 'server-policy-new',
      });
      const result = decodePasswordChangeResult(r);
      expect(result.passwordChangedAt).toBeNull();
      expect(result.passwordPolicyVersion).toBe('server-policy-new');
    }
    expect(() =>
      decodePasswordChangeResult({
        status: 200,
        data: { success: true, data: null, meta: {} },
      }),
    ).toThrow();
  });
  test.each([
    'CURRENT_PASSWORD_INCORRECT',
    'PASSWORD_CONFIRMATION_REQUIRED',
    'PASSWORD_CONFIRMATION_MISMATCH',
    'PASSWORD_POLICY_VIOLATION',
    'PASSWORD_INPUT_INVALID',
  ])('422 %s remains local auth and correct field', async code => {
    const request = jest.fn(async () => {
      throw new AppError({
        kind: 'http',
        status: 422,
        code,
        message: 'rejected',
      });
    });
    await expect(
      changeSecurityPassword(input(), { request, context: context() }),
    ).rejects.toMatchObject({ status: 422, code });
    expect(
      Object.keys(
        securityFieldErrors(
          new AppError({
            kind: 'http',
            status: 422,
            code,
            message: 'rejected',
          }),
        ),
      ).length,
    ).toBe(1);
    expect(getSession()?.userId).toBe(USER_ID);
    expect(securityCommandBlocked('password')).toBe(false);
  });
  test('double command one dispatch, late response cannot clear new login or publish success', async () => {
    const d = deferred<any>(),
      request = jest.fn(() => d.promise),
      ctx = context(),
      first = changeSecurityPassword(input(), { request, context: ctx });
    await expect(
      changeSecurityPassword(input(), { request, context: ctx }),
    ).rejects.toMatchObject({ code: 'P11_UNKNOWN' });
    clearSession();
    setSession({ ...session, userId: OTHER, authSessionId: OTHER });
    d.resolve(authResponse('password'));
    await expect(first).rejects.toMatchObject({ code: 'STALE_AUTH_RESPONSE' });
    expect(request).toHaveBeenCalledTimes(1);
    expect(getSession()?.userId).toBe(OTHER);
    expect(getSecurityResultNotice()).toBeUndefined();
  });
  test.each(['timeout', 'network', 'parse', '429', '500'])(
    '%s locks resend across remount/readback',
    async kind => {
      const request = jest.fn(async () => {
        throw new AppError({
          kind:
            kind === '429' || kind === '500'
              ? 'http'
              : (kind as 'timeout' | 'network' | 'parse'),
          status: kind === '429' ? 429 : kind === '500' ? 500 : undefined,
          message: 'uncertain',
        });
      });
      const ctx = context();
      await expect(
        changeSecurityPassword(input(), { request, context: ctx }),
      ).rejects.toMatchObject({ code: 'P11_UNKNOWN' });
      await expect(
        changeSecurityPassword(input(), { request, context: ctx }),
      ).rejects.toMatchObject({ code: 'P11_UNKNOWN' });
      expect(request).toHaveBeenCalledTimes(1);
      expect(getSecurityResultNotice()).toBeUndefined();
    },
  );
  test('401 ends only captured auth, wrong current422 does not, refresh rotation stable owner allowed', async () => {
    const d = deferred<any>(),
      request = jest.fn(() => d.promise),
      first = changeSecurityPassword(input(), { request, context: context() });
    setSession({ ...session, accessToken: 'rotated-access' });
    d.resolve(authResponse('password'));
    await first;
    expect(getSession()).toBeUndefined();
    setSession(session);
    const clear = jest.fn(async () => undefined);
    await expect(
      changeSecurityPassword(input(), {
        context: context(),
        clearLocalSession: clear,
        request: async () => {
          throw new AppError({ kind: 'auth', status: 401, message: 'expired' });
        },
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
describe('P11 typed session page and revoke', () => {
  test('failed live reread invalidates previous page target; no stale DELETE dispatch', async () => {
    const page = await fetchSecuritySessions({
      request: requestFor(sessionsResponse()),
    });
    await expect(
      fetchSecuritySessions({
        request: async () => {
          throw new AppError({ kind: 'network', message: 'offline' });
        },
      }),
    ).rejects.toBeDefined();
    const request = requestFor(revokeResponse());
    expect(canRevokeSecuritySession(page.items[0], page)).toBe(false);
    await expect(
      revokeSecuritySession(page.items[0], { request }, page),
    ).rejects.toMatchObject({ code: 'CURRENT_SESSION_PROTECTED' });
    expect(request).not.toHaveBeenCalled();
  });
  test('currentoutsidepage retained, total not items; row target distinct namespace and no cachedcurrent fallback', async () => {
    const page = await fetchSecuritySessions({
      request: requestFor(sessionsResponse()),
    });
    expect(page.currentStableSessionId).toBe(FAMILY);
    expect(page.items.length).toBe(1);
    expect(page.meta.total).toBe(21);
    expect(canRevokeSecuritySession(page.items[0], page)).toBe(true);
    const request = requestFor(revokeResponse());
    await revokeSecuritySession(page.items[0], { request }, page);
    expect(request.mock.calls[0][0]).toEqual({
      path: '/api/v1/auth/sessions/' + ROW,
      method: 'DELETE',
    });
  });
  test.each([
    'missing-current',
    'flag-contradiction',
    'unknown-flags',
    'current-family',
  ])('lock %s in UI and handler', async kind => {
    const raw = sessionsResponse();
    if (kind === 'missing-current')
      (raw.data.meta as any).current_session_id = null;
    if (kind === 'flag-contradiction') raw.data.data[0].is_current = true;
    if (kind === 'unknown-flags') (raw.data.data[0] as any).can_revoke = null;
    if (kind === 'current-family') {
      raw.data.data[0].session_id = FAMILY;
      raw.data.data[0].auth_session_id = FAMILY;
    }
    const page = await fetchSecuritySessions({ request: requestFor(raw) }),
      request = requestFor(revokeResponse());
    expect(canRevokeSecuritySession(page.items[0], page)).toBe(false);
    await expect(
      revokeSecuritySession(page.items[0], { request }, page),
    ).rejects.toMatchObject({ code: 'CURRENT_SESSION_PROTECTED' });
    expect(request).not.toHaveBeenCalled();
  });
  test('sameID strings allowed; refresh changes row ID but keeps stable ID and rejects previous page target', async () => {
    const raw = sessionsResponse();
    raw.data.data[0].id = OTHER;
    const a = await fetchSecuritySessions({ request: requestFor(raw) });
    expect(canRevokeSecuritySession(a.items[0], a)).toBe(true);
    raw.data.data[0].id = ROW;
    const b = await fetchSecuritySessions({ request: requestFor(raw) });
    expect(a.items[0].stableSessionId).toBe(b.items[0].stableSessionId);
    expect(canRevokeSecuritySession(a.items[0], a)).toBe(false);
    expect(canRevokeSecuritySession(b.items[0], b)).toBe(true);
  });
  test('null metadata stays null, explicit alias disagreement or missing stableid never falls back', () => {
    const raw = sessionsResponse(),
      page = decodeSecuritySessions(raw, captureSecurityOwner());
    expect(page.items[0].deviceLabel).toBeNull();
    expect(page.items[0].location).toBeNull();
    (raw.data.data[0] as any).session_id = undefined;
    expect(() => decodeSecuritySessions(raw, captureSecurityOwner())).toThrow();
  });
  test.each([404, undefined])(
    'DELETE%s is UNKNOWN; absent readback never unlocks or proves revoke',
    async status => {
      clearSession();
      setSession(session);
      const page = await fetchSecuritySessions({
          request: requestFor(sessionsResponse()),
        }),
        request = jest.fn(async () => {
          throw new AppError({
            kind: status ? 'http' : 'timeout',
            status,
            code: status ? 'RESOURCE_NOT_FOUND' : undefined,
            message: 'uncertain',
          });
        });
      await expect(
        revokeSecuritySession(page.items[0], { request }, page),
      ).rejects.toMatchObject({ code: 'P11_UNKNOWN' });
      const raw = sessionsResponse();
      raw.data.data = [];
      await fetchSecuritySessions({ request: requestFor(raw) });
      expect(securityCommandBlocked('revoke')).toBe(true);
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  test('409 protects current, foreign result mismatch staysUNKNOWN, confirmed result no GET writer replay', async () => {
    const page = await fetchSecuritySessions({
      request: requestFor(sessionsResponse()),
    });
    await expect(
      revokeSecuritySession(
        page.items[0],
        {
          request: async () => {
            throw new AppError({
              kind: 'http',
              status: 409,
              code: 'CURRENT_SESSION_PROTECTED',
              message: 'protected',
            });
          },
        },
        page,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(securityCommandBlocked('revoke')).toBe(false);
    const raw = revokeResponse();
    raw.data.data.session_id = FAMILY;
    await expect(
      revokeSecuritySession(page.items[0], { request: requestFor(raw) }, page),
    ).rejects.toMatchObject({ code: 'P11_UNKNOWN' });
    expect(getSession()).toBeDefined();
  });
});
