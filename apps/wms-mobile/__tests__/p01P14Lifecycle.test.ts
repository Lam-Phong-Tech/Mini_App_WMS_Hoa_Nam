import {
  parseWorkShift,
  getOrCreatePendingWorkShiftStart,
  readPendingWorkShiftStart,
  type WorkShift,
} from '../src/services/wms/workShift';
import { createShiftStartOwner } from '../src/shift/startIntent';
import {
  getShiftState,
  publishShiftState,
  resetShiftState,
  protocolEndSupported,
} from '../src/shift/shiftState';
import {
  createP14ShiftService,
  decodeCloseCheck,
  decodeEndReceipt,
  P14_SHIFT_GATE,
  type LocalShiftEvidence,
} from '../src/shift/p14ShiftService';
import {
  bindShiftOwnerHeaders,
  resetShiftHeaderBindingsForTesting,
} from '../src/shift/ownerHeaders';
import { readShiftLocalOwners } from '../src/shift/localOwners';
import { getSession, clearSession, setSession } from '../src/auth/session';
import {
  createMemoryBackend,
  createStorage,
  getAppStorage,
  setAppStorageForTesting,
} from '../src/storage/storage';
import { AppError } from '../src/errors/AppError';
import type { RequestOptions, ApiResponse } from '../src/api/client';
import { apiClient } from '../src/api/client';
import { logger } from '../src/logging/logger';
const uuid = '11111111-1111-4111-8111-111111111111',
  key = '22222222-2222-4222-8222-222222222222';
const owner = {
  actorId: 'actor',
  authSessionId: 'auth-family',
  warehouseId: uuid,
};
const shift: WorkShift = {
  shift_id: uuid,
  actor_id: 'actor',
  auth_session_id: 'auth-family',
  warehouse_id: uuid,
  status: 'ACTIVE',
  started_at: '2026-10-13T08:00:00+07:00',
  ended_at: null,
  version: 1,
  preview_ready: true,
  tracking_contract: 'p14-shift-v1',
  lifecycle: {
    contract: 'p01-p14-lifecycle-v1',
    mode: 'ENABLED',
    tracking_status: 'TRACKED',
    end_supported: true,
    end_unavailable_reason: null,
    end_readiness: 'REQUIRES_CLOSE_CHECK_AND_LOCAL_CLEAN',
    owner_coverage: 'PARTIAL_EXPLICIT_OWNER_PROTOCOLS',
    local_state_verified: false,
    legacy_upgrade_allowed: false,
  },
};
const legacy = {
  ...shift,
  tracking_contract: null,
  lifecycle: {
    ...shift.lifecycle!,
    tracking_status: 'LEGACY_UNTRACKED',
    end_supported: false,
    end_unavailable_reason: 'SHIFT_TRACKING_INCOMPLETE',
  },
} as WorkShift;
const check = {
  shift_id: uuid,
  actor_id: 'actor',
  auth_session_id: 'auth-family',
  warehouse_id: uuid,
  can_end: true,
  can_end_scope: 'SERVER_CHECK_ONLY',
  blockers: [],
  expected_version: 1,
  check_token: 'opaque-test-token',
  client_confirmation_required: {
    local_state: 'CLEAN',
    pending_request_ids: [],
  },
  draft_scope: 'AUTH_SESSION_AT_CLOSE_NOT_SHIFT_OWNERSHIP',
  draft_count: 0,
  draft_owners_unchanged: true,
};
const receipt = {
  shift_id: uuid,
  actor_id: 'actor',
  auth_session_id: 'auth-family',
  warehouse_id: uuid,
  request_id: key,
  command: 'END',
  outcome: 'SUCCEEDED',
  status: 'ENDED',
  version: 2,
  ended_at: '2026-10-13T09:00:00+07:00',
  summary_id: uuid,
  login_preserved: true,
};
const clean: LocalShiftEvidence = {
  revision: 'owner-r1',
  state: 'CLEAN',
  pendingRequestIds: [],
  busy: false,
  coverageComplete: true,
};
const reply = <T>(data: unknown): ApiResponse<T> => ({
  status: 200,
  data: { success: true, data, meta: { contract: 'p14-shift-v1' } } as T,
});
beforeEach(() => {
  setAppStorageForTesting(createStorage(createMemoryBackend()));
  clearSession();
  setSession({
    accessToken: 'test-only',
    userId: 'actor',
    authSessionId: 'auth-family',
    activeWarehouseId: uuid,
  });
  resetShiftState();
  resetShiftHeaderBindingsForTesting();
});
afterEach(() => {
  jest.restoreAllMocks();
  clearSession();
  resetShiftState();
});

test.each([undefined, 'W/"1"', '"2"'])('native close-check rejects missing/weak/mismatched ETag %s without END', async etag => {
  publishShiftState(shift, owner);
  jest.spyOn(apiClient, 'get').mockResolvedValue(reply(shift));
  const request = jest.spyOn(apiClient, 'request').mockResolvedValue({ ...reply(check), header: name => name === 'etag' ? etag : undefined });
  const service = createP14ShiftService({readLocal:()=>clean});
  await expect(service.closeCheck()).rejects.toMatchObject({code:'SHIFT_CLOSE_ETAG_INVALID'});
  expect(service.canEnd).toBe(false);
  expect(service.pending).toBeUndefined();
  expect(request.mock.calls.every(([o])=>o.method==='GET')).toBe(true);
});

test('successful native close-check diagnostics never export proof or auth session', async () => {
  publishShiftState(shift, owner);
  jest.spyOn(apiClient, 'get').mockResolvedValue(reply(shift));
  jest.spyOn(apiClient, 'request').mockResolvedValue({...reply(check), header:name=>name==='etag'?'"1"':name==='x-request-id'?key:undefined});
  const log=jest.spyOn(logger,'warn').mockImplementation(()=>{});
  await createP14ShiftService({readLocal:()=>clean}).closeCheck();
  const trace=log.mock.calls.find(([message])=>message==='P14 DEV close-check verified');
  expect(trace?.[1]).toMatchObject({identityValidated:true,response:{status:200,requestId:key,strongEtag:true}});
  const bytes=JSON.stringify(trace);
  expect(bytes).not.toContain(check.check_token);
  expect(bytes).not.toContain(owner.authSessionId);
});

describe('source026f4f7 lifecycle safety-r2 offline', () => {
  test('persisted START body cannot contain extra fields or be silently rewritten', () => {
    const original = {
      ...owner,
      idempotencyKey: key,
      body: { warehouse_id: uuid, extra: 'not-allowed' },
    };
    getAppStorage().setObject('work-shift.start.pending', original);
    expect(() =>
      getOrCreatePendingWorkShiftStart(
        owner.authSessionId,
        uuid,
        owner.actorId,
      ),
    ).toThrow();
    expect(getAppStorage().getObject('work-shift.start.pending')).toEqual(
      original,
    );
  });
  test('END unknown blocks a compensating START and creates no new START key', async () => {
    publishShiftState(shift, owner);
    const service = createP14ShiftService({
      request: async o => {
        if (o.method === 'GET') return reply(check);
        throw new AppError({ kind: 'timeout', message: 'unknown' });
      },
      readLocal: () => clean,
    });
    await service.closeCheck();
    await expect(service.end(key)).rejects.toThrow();
    const start = jest.fn(async () => ({ ...shift, shift_id: key }));
    await expect(
      createShiftStartOwner({ start }).start(owner),
    ).rejects.toMatchObject({ code: 'SHIFT_END_PENDING' });
    expect(start).not.toHaveBeenCalled();
    expect(readPendingWorkShiftStart()).toBeUndefined();
  });
  test('corrupt serialized START JSON is not absence or permission to replace key', () => {
    getAppStorage().setString('work-shift.start.pending', '{corrupt');
    expect(() =>
      getOrCreatePendingWorkShiftStart(
        owner.authSessionId,
        uuid,
        owner.actorId,
      ),
    ).toThrow();
    expect(getAppStorage().getString('work-shift.start.pending')).toBe(
      '{corrupt',
    );
  });
  test('damaged END journal blocks closure without crashing mount or deleting evidence', async () => {
    publishShiftState(shift, owner);
    const journal = 'shift.end.check-only:' + JSON.stringify(owner);
    getAppStorage().setString(journal, '{corrupt');
    const request = jest.fn(async () => reply(check));
    const service = createP14ShiftService({ request, readLocal: () => clean });
    expect(service.blocker).toBeTruthy();
    await expect(service.closeCheck()).rejects.toMatchObject({
      code: 'SHIFT_END_JOURNAL_DAMAGED',
    });
    expect(request).not.toHaveBeenCalled();
    expect(getAppStorage().getString(journal)).toBe('{corrupt');
  });
  test('known tracked family/current:null does not infer enabled admission after reset', async () => {
    publishShiftState(shift, owner);
    resetShiftState();
    const start = jest.fn(async () => shift);
    const service = createShiftStartOwner({ start, current: async () => null });
    await service.restore(owner);
    expect(() =>
      getOrCreatePendingWorkShiftStart(
        owner.authSessionId,
        uuid,
        owner.actorId,
      ),
    ).toThrow();
    await expect(service.start(owner)).rejects.toMatchObject({
      code: 'SHIFT_LIFECYCLE_UNVERIFIED',
    });
    expect(start).not.toHaveBeenCalled();
    expect(readPendingWorkShiftStart()).toBeUndefined();
  });
  test('same shift never regresses version or revives after END', () => {
    publishShiftState(
      {
        ...shift,
        status: 'ENDED',
        preview_ready: false,
        version: 2,
        ended_at: receipt.ended_at,
      },
      owner,
    );
    expect(() => publishShiftState(shift, owner)).toThrow();
    expect(getShiftState().phase).toBe('ENDED');
  });
  test('late current:null cannot erase a shift restored meanwhile', async () => {
    let finish!: (s: WorkShift | null) => void;
    const c = createShiftStartOwner({
      current: () =>
        new Promise(r => {
          finish = r;
        }),
    });
    const result = c.restore(owner).catch(e => e);
    publishShiftState(shift, owner);
    finish(null);
    expect(await result).toMatchObject({ code: 'SHIFT_RESPONSE_STALE' });
    expect(getShiftState().shift?.shift_id).toBe(uuid);
  });
  test('late END from old shift cannot overwrite new shift in the same login family', async () => {
    publishShiftState(shift, owner);
    let finish!: (r: ApiResponse<unknown>) => void;
    const request = jest.fn(
      (o: RequestOptions): Promise<ApiResponse<unknown>> =>
        o.method === 'GET'
          ? Promise.resolve(reply(check))
          : new Promise(r => {
              finish = r;
            }),
    );
    const svc = createP14ShiftService({ request, readLocal: () => clean });
    await svc.closeCheck();
    const result = svc.end(key).catch(e => e);
    publishShiftState({ ...shift, shift_id: key }, owner);
    finish(reply(receipt));
    expect(await result).toMatchObject({ code: 'SHIFT_RESPONSE_STALE' });
    expect(getShiftState().shift?.shift_id).toBe(key);
    expect(getShiftState().phase).toBe('ACTIVE');
    expect(svc.pending?.key).toBe(key);
  });
  test('wrong START owner cannot create an intent or dispatch before owner validation', async () => {
    const start = jest.fn(async () => shift);
    await expect(
      createShiftStartOwner({ start }).start({ ...owner, actorId: 'other' }),
    ).rejects.toThrow();
    expect(start).not.toHaveBeenCalled();
    expect(readPendingWorkShiftStart()).toBeUndefined();
  });
  test('tracked family cannot switch warehouse to escape an unverified shift fence', () => {
    publishShiftState(shift, owner);
    setSession({ ...getSession()!, activeWarehouseId: key });
    expect(getShiftState().phase).toBe('UNVERIFIED');
    expect(() =>
      bindShiftOwnerHeaders({
        method: 'POST',
        path: '/api/v1/mini-app/test',
        headers: { 'Idempotency-Key': key },
      }),
    ).toThrow();
  });
  test('damaged durable START intent blocks replacement instead of inventing a new key', async () => {
    getAppStorage().setObject('work-shift.start.pending', {
      ...owner,
      idempotencyKey: key,
      body: { warehouse_id: 'damaged' },
    });
    const start = jest.fn(async () => shift);
    await expect(
      createShiftStartOwner({ start }).start(owner),
    ).rejects.toThrow();
    expect(start).not.toHaveBeenCalled();
    expect(getAppStorage().getObject('work-shift.start.pending')).toMatchObject(
      { idempotencyKey: key },
    );
  });
  test('pinned JSON stays exact; approved DEV client activation never enables recovery or production', () => {
    const contract = require('../src/contracts/p14/lifecycle-v1.json');
    expect(contract.contract).toBe('p01-p14-lifecycle-v1');
    expect(contract.safety_revision).toBe('p01-p14-safety-r2');
    expect(contract.production_activation).toBe(false);
    expect(P14_SHIFT_GATE.enabled).toBe(true);
    expect(P14_SHIFT_GATE.recoveryEnabled).toBe(false);
  });
  test('END pending identity survives service remount without token/body persistence or replay', async () => {
    publishShiftState(shift, owner);
    const request = jest.fn(
      async <T>(o: RequestOptions): Promise<ApiResponse<T>> => {
        if (o.path.endsWith('close-check')) return reply<T>(check);
        throw new AppError({ kind: 'timeout', message: 'unknown' });
      },
    );
    const first = createP14ShiftService({ request, readLocal: () => clean });
    await first.closeCheck();
    await expect(first.end(key)).rejects.toThrow();
    expect(
      JSON.stringify(
        getAppStorage()
          .keys()
          .filter(k => k.startsWith('shift.end.check-only:'))
          .map(k => getAppStorage().getObject(k)),
      ),
    ).not.toContain('opaque-test-token');
    const reread = jest.fn(async (_options: RequestOptions) =>
      reply<unknown>(receipt),
    );
    const second = createP14ShiftService({
      request: reread,
      readLocal: () => clean,
    });
    expect(second.pending?.key).toBe(key);
    await expect(second.end(key)).rejects.toThrow();
    await second.reconcile();
    expect(reread).toHaveBeenCalledTimes(1);
    expect(reread.mock.calls[0][0]).toEqual({
      method: 'GET',
      path: `/api/v1/mini-app/work-shifts/${uuid}/requests/${key}`,
      query: { warehouse_id: uuid },
    });
    expect(getShiftState().phase).toBe('ENDED');
  });
  test('summary preserves server count units, null projections and frozen scope', async () => {
    publishShiftState(
      {
        ...shift,
        status: 'ENDED',
        preview_ready: false,
        ended_at: receipt.ended_at,
        lifecycle: { ...shift.lifecycle!, end_supported: false },
      },
      owner,
    );
    const data = {
      contract: 'p14-shift-v1',
      shift_id: uuid,
      warehouse_id: uuid,
      immutable: true,
      started_at: shift.started_at,
      ended_at: receipt.ended_at,
      kpis: {
        successful_request_count: 2,
        count_unit: 'TRACKED_OWNER_REQUEST',
        recorded_documents: {
          INBOUND: 1,
          OUTBOUND: 0,
          WARRANTY: 0,
          COMPONENT_ISSUE: 0,
        },
        recorded_documents_scope: 'EXPLICIT_RECORD_ROUTES_ONLY',
        quantity_total: null,
        quantity_status: 'NOT_PROJECTED',
        posted_total: null,
        posted_total_status: 'NOT_PROJECTED',
      },
      draft_snapshot: {
        scope: 'AUTH_SESSION_AT_CLOSE_NOT_SHIFT_OWNERSHIP',
        owner_unchanged: true,
        total: 3,
        page: 1,
        per_page: 20,
        last_page: 1,
        items: Array.from({ length: 3 }, (_, n) => ({
          document_id:
            '00000000-0000-4000-8000-' + String(n + 1).padStart(12, '0'),
          scan_session_id: uuid,
          last_request_id: key,
          actor_id: owner.actorId,
          auth_session_id: owner.authSessionId,
          warehouse_id: uuid,
          operation: 'INBOUND',
          status: 'DRAFT',
          version: 1,
          title: 'Phiếu nháp',
          codes: '[]',
          form: '{}',
        })),
      },
    };
    const request = jest.fn(async <T>() => reply<T>(data));
    expect(
      await createP14ShiftService({
        request,
        readLocal: () => clean,
      }).summary(),
    ).toEqual(data);
    await expect(
      createP14ShiftService({
        request: async <T>() =>
          reply<T>({
            ...data,
            draft_snapshot: { ...data.draft_snapshot, items: [] },
          }),
        readLocal: () => clean,
      }).summary(),
    ).rejects.toThrow();
    await expect(
      createP14ShiftService({
        request: async <T>() =>
          reply<T>({ ...data, kpis: { ...data.kpis, quantity_total: 0 } }),
        readLocal: () => clean,
      }).summary(),
    ).rejects.toThrow();
  });
  test('END old receipt may omit actor but must match original shift/session/warehouse', () => {
    const historical = { ...receipt, actor_id: undefined };
    expect(decodeEndReceipt(historical, shift, key, 1)).toEqual(historical);
    expect(() =>
      decodeEndReceipt(
        { ...historical, auth_session_id: 'old-family' },
        shift,
        key,
        1,
      ),
    ).toThrow();
  });
  test('stale END after identity change cannot end the new session or clear its START key', async () => {
    publishShiftState(shift, owner);
    let finish!: (r: ApiResponse<unknown>) => void;
    const request = jest.fn(
      <T>(o: RequestOptions): Promise<ApiResponse<T>> =>
        o.method === 'GET'
          ? Promise.resolve(reply<T>(check))
          : new Promise(r => {
              finish = r as typeof finish;
            }),
    );
    const service = createP14ShiftService({ request, readLocal: () => clean });
    await service.closeCheck();
    const end = service.end(key).catch(e => e);
    setSession({ ...getSession()!, authSessionId: 'new-session' });
    finish(reply(receipt));
    expect(await end).toMatchObject({ code: 'SHIFT_OWNER_CHANGED' });
    expect(getShiftState().phase).toBe('UNVERIFIED');
    expect(getSession()?.authSessionId).toBe('new-session');
  });
  test('close-check TTL expiry requires a new check, never END HTTP', async () => {
    publishShiftState(shift, owner);
    let time = 0;
    const request = jest.fn(async <T>() => reply<T>(check)),
      svc = createP14ShiftService({
        request,
        readLocal: () => clean,
        now: () => time,
      });
    await svc.closeCheck();
    time = 300000;
    await expect(svc.end(key)).rejects.toMatchObject({
      code: 'SHIFT_CHECK_STALE',
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  test.each(['DISABLED', 'ENABLED', 'DRAINING'] as const)(
    'reads %s without assuming gate or local CLEAN',
    mode => {
      const value = {
        ...shift,
        lifecycle: {
          ...shift.lifecycle!,
          mode,
          end_supported: mode !== 'DISABLED',
          end_unavailable_reason:
            mode === 'DISABLED' ? 'P14_SHIFT_NOT_ENABLED' : null,
        },
      };
      expect(parseWorkShift(value, 'test')).toEqual(value);
      expect(protocolEndSupported(value)).toBe(mode !== 'DISABLED');
    },
  );
  test('legacy never becomes tracked under ENABLED', () => {
    expect(parseWorkShift(legacy, 'test')).toEqual(legacy);
    expect(protocolEndSupported(legacy)).toBe(false);
  });
  test.each([
    { mode: 'unknown' },
    { local_state_verified: true },
    { legacy_upgrade_allowed: true },
    { contract: 'other' },
    { end_supported: 'true' },
    { owner_coverage: 'FULL' },
  ])('malformed lifecycle fails closed %j', patch => {
    expect(() =>
      parseWorkShift(
        { ...shift, lifecycle: { ...shift.lifecycle!, ...patch } },
        'test',
      ),
    ).toThrow();
  });
  test('ENDED replay parses but cannot open Home or END again', () => {
    const ended = {
      ...shift,
      status: 'ENDED',
      preview_ready: false,
      ended_at: receipt.ended_at,
      version: 2,
      lifecycle: {
        ...shift.lifecycle!,
        end_supported: false,
        end_unavailable_reason: 'SHIFT_ALREADY_ENDED',
      },
    };
    expect(parseWorkShift(ended, 'test')).toEqual(ended);
    expect(protocolEndSupported(ended)).toBe(false);
  });
  test('current null never generates synthetic shift or START', async () => {
    const start = jest.fn(),
      c = createShiftStartOwner({ current: async () => null, start });
    expect(await c.restore(owner)).toBeNull();
    expect(getShiftState().phase).toBe('NO_SHIFT');
    expect(getShiftState().shift).toBeUndefined();
    expect(start).not.toHaveBeenCalled();
  });
  test('START saves original key/body before HTTP, timeout keeps pending through owner remount', async () => {
    const start = jest.fn(async () => {
      expect(readPendingWorkShiftStart()?.outcome).toBe('IN_FLIGHT');
      throw new AppError({ kind: 'timeout', message: 'test' });
    });
    const c = createShiftStartOwner({ start, current: async () => null });
    await expect(c.start(owner)).rejects.toMatchObject({ kind: 'timeout' });
    const before = readPendingWorkShiftStart()!;
    expect(before.actorId).toBe(owner.actorId);
    expect(before.body).toEqual({ warehouse_id: uuid });
    const remount = createShiftStartOwner({
      start: async (_i, k) => {
        expect(k).toBe(before.idempotencyKey);
        return shift;
      },
      current: async () => null,
    });
    await remount.restore(owner);
    expect(readPendingWorkShiftStart()).toEqual(before);
    await expect(remount.start(owner)).rejects.toMatchObject({
      code: 'SHIFT_START_PENDING',
    });
    await remount.start(owner, true);
    expect(getShiftState().shift).toEqual(shift);
  });
  test('double tap dispatches one START; late owner response is not published', async () => {
    let finish!: (s: WorkShift) => void;
    const start = jest.fn(
        () =>
          new Promise<WorkShift>(r => {
            finish = r;
          }),
      ),
      c = createShiftStartOwner({ start });
    const first = c.start(owner);
    const rejected = first.catch(e => e);
    await expect(c.start(owner)).rejects.toThrow();
    expect(start).toHaveBeenCalledTimes(1);
    setSession({ ...getSession()!, authSessionId: 'new-family' });
    finish(shift);
    expect(await rejected).toMatchObject({ code: 'SHIFT_OWNER_CHANGED' });
    expect(getShiftState().phase).toBe('UNVERIFIED');
  });
  test('old START key returning ENDED stays ended; next explicit intent has new key', async () => {
    const first = getOrCreatePendingWorkShiftStart(
      owner.authSessionId,
      uuid,
      owner.actorId,
    );
    const ended = {
      ...shift,
      status: 'ENDED',
      preview_ready: false,
      ended_at: receipt.ended_at,
      lifecycle: {
        ...shift.lifecycle!,
        end_supported: false,
        end_unavailable_reason: 'SHIFT_ALREADY_ENDED',
      },
    };
    let calls = 0;
    const c = createShiftStartOwner({
      start: async (_i, k) => {
        if (++calls === 1) {
          expect(k).toBe(first.idempotencyKey);
          return ended;
        }
        expect(k).not.toBe(first.idempotencyKey);
        return { ...shift, shift_id: key };
      },
    });
    await c.start(owner);
    expect(getShiftState().phase).toBe('ENDED');
    expect(readPendingWorkShiftStart()).toBeUndefined();
    await c.start(owner);
    expect(calls).toBe(2);
  });
  test.each(['DRAINING', 'DISABLED'] as const)(
    'no new intent from ended %s',
    async mode => {
      publishShiftState(
        {
          ...shift,
          status: 'ENDED',
          preview_ready: false,
          ended_at: receipt.ended_at,
          lifecycle: { ...shift.lifecycle!, mode, end_supported: false },
        },
        owner,
      );
      const start = jest.fn();
      await expect(
        createShiftStartOwner({ start }).start(owner),
      ).rejects.toMatchObject({ kind: 'blocked_by_gate' });
      expect(start).not.toHaveBeenCalled();
    },
  );
  test('close-check and end flags never imply local CLEAN', async () => {
    publishShiftState(shift, owner);
    const request = jest.fn(async <T>() => reply<T>(check));
    const svc = createP14ShiftService({
      request,
      readLocal: () => ({ ...clean, coverageComplete: false }),
    });
    await svc.closeCheck();
    await expect(svc.end(key)).rejects.toMatchObject({
      code: 'SHIFT_CHECK_STALE',
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(readShiftLocalOwners().coverageComplete).toBe(false);
  });
  test.each([
    { state: 'DIRTY' },
    { state: 'UNKNOWN' },
    { pendingRequestIds: ['old-request'] },
    { busy: true },
  ])('pending local evidence blocks END %j', async p => {
    publishShiftState(shift, owner);
    const request = jest.fn(async <T>() => reply<T>(check));
    const svc = createP14ShiftService({
      request,
      readLocal: () => ({ ...clean, ...p } as LocalShiftEvidence),
    });
    await svc.closeCheck();
    await expect(svc.end(key)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
  test('END exact receipt preserves login and clears START intent for next user intent', async () => {
    publishShiftState(shift, owner);
    getOrCreatePendingWorkShiftStart(owner.authSessionId, uuid, owner.actorId);
    const request = jest.fn(async <T>(o: RequestOptions) =>
      reply<T>(o.method === 'GET' ? check : receipt),
    );
    const svc = createP14ShiftService({ request, readLocal: () => clean });
    await svc.closeCheck();
    await svc.end(key);
    expect(getSession()?.accessToken).toBe('test-only');
    expect(getShiftState().phase).toBe('ENDED');
    expect(readPendingWorkShiftStart()).toBeUndefined();
    expect(request.mock.calls[1][0]).toEqual({
      method: 'POST',
      path: `/api/v1/mini-app/work-shifts/${uuid}/end`,
      headers: { 'Idempotency-Key': key, 'If-Match': '"1"' },
      body: {
        warehouse_id: uuid,
        check_token: 'opaque-test-token',
        local_state: 'CLEAN',
        pending_request_ids: [],
      },
    });
  });
  test('END timeout and reconcile404 are CHECK_ONLY; no second END or new key', async () => {
    publishShiftState(shift, owner);
    const request = jest.fn(
      async <T>(o: RequestOptions): Promise<ApiResponse<T>> => {
        if (o.path.endsWith('close-check')) return reply<T>(check);
        throw new AppError({
          kind: o.method === 'POST' ? 'timeout' : 'http',
          status: o.method === 'GET' ? 404 : undefined,
          code: 'SHIFT_REQUEST_UNKNOWN',
          message: 'unknown',
        });
      },
    );
    const svc = createP14ShiftService({ request, readLocal: () => clean });
    await svc.closeCheck();
    await expect(svc.end(key)).rejects.toThrow();
    await expect(
      svc.end('33333333-3333-4333-8333-333333333333'),
    ).rejects.toThrow();
    await expect(svc.reconcile()).rejects.toMatchObject({ status: 404 });
    expect(svc.pending?.key).toBe(key);
    expect(
      request.mock.calls.filter(([o]) => o.method === 'POST'),
    ).toHaveLength(1);
    expect(request.mock.calls[2][0].headers).toBeUndefined();
  });
  test('mode or local revision change invalidates close-check', async () => {
    publishShiftState(shift, owner);
    let local = clean;
    const request = jest.fn(async <T>() => reply<T>(check));
    const svc = createP14ShiftService({ request, readLocal: () => local });
    await svc.closeCheck();
    local = { ...clean, revision: 'changed' };
    await expect(svc.end(key)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
  test('bad check/END identity and false login_preserved rejected', () => {
    expect(() =>
      decodeCloseCheck({ ...check, actor_id: 'other' }, shift),
    ).toThrow();
    expect(() =>
      decodeEndReceipt({ ...receipt, login_preserved: false }, shift, key, 1),
    ).toThrow();
    expect(() =>
      decodeEndReceipt({ ...receipt, request_id: 'other' }, shift, key, 1),
    ).toThrow();
  });
  test('approved DEV client cannot END without a reviewed close-check; recovery stays OFF', async () => {
    publishShiftState(shift, owner);
    expect(P14_SHIFT_GATE.enabled).toBe(true);
    expect(P14_SHIFT_GATE.recoveryEnabled).toBe(false);
    await expect(
      createP14ShiftService({ readLocal: () => clean }).end(key),
    ).rejects.toMatchObject({ kind: 'config' });
  });
  test('owner headers preserve native identity and same trace; changed body/trace/ca conflict', () => {
    publishShiftState(shift, owner);
    const request = {
      method: 'PUT' as const,
      path: '/api/v1/mini-app/drafts/' + uuid,
      body: { warehouse_id: uuid },
      headers: {
        'Idempotency-Key': key,
        'If-Match': '"1"',
        'X-Draft-ID': uuid,
        'X-Draft-Scan-Session-ID': key,
        'X-Test-Contract': 'v1',
      },
    };
    const h = bindShiftOwnerHeaders(request);
    expect(h).toMatchObject({
      ...request.headers,
      'X-Work-Shift-ID': uuid,
      'X-Request-ID': key,
    });
    expect(bindShiftOwnerHeaders(request)).toEqual(h);
    expect(() =>
      bindShiftOwnerHeaders({ ...request, body: { warehouse_id: 'other' } }),
    ).toThrow();
    expect(() =>
      bindShiftOwnerHeaders({
        ...request,
        headers: {
          ...request.headers,
          'X-Request-ID': '33333333-3333-4333-8333-333333333333',
        },
      }),
    ).toThrow();
  });
  test.each(['DISABLED', 'ENDED'])(
    'tracked %s is not silently unfenced',
    mode => {
      publishShiftState(
        {
          ...shift,
          ...(mode === 'ENDED'
            ? { status: 'ENDED', preview_ready: false }
            : {}),
          lifecycle: {
            ...shift.lifecycle!,
            mode: mode === 'ENDED' ? 'ENABLED' : 'DISABLED',
            end_supported: false,
          },
        },
        owner,
      );
      expect(() =>
        bindShiftOwnerHeaders({
          method: 'POST',
          path: '/api/v1/mini-app/inbound/record',
          headers: { 'Idempotency-Key': key },
        }),
      ).toThrow();
    },
  );
  test('GET/END/auth/external paths untouched; legacy unchanged; unkeyed owner blocked', () => {
    publishShiftState(shift, owner);
    for (const o of [
      { method: 'GET', path: '/api/v1/mini-app/drafts/' + uuid },
      { method: 'POST', path: '/api/v1/mini-app/work-shifts/' + uuid + '/end' },
      { method: 'POST', path: '/api/v1/auth/logout' },
    ] as RequestOptions[])
      expect(bindShiftOwnerHeaders(o)).toBeUndefined();
    expect(() =>
      bindShiftOwnerHeaders({
        method: 'POST',
        path: '/api/v1/mini-app/inbound/resolve-code',
      }),
    ).toThrow();
    // A tracked family cannot be downgraded by stripping its current shift.
    clearSession();
    setSession({
      accessToken: 'test-only',
      userId: owner.actorId,
      authSessionId: 'untracked-family',
      activeWarehouseId: uuid,
    });
    publishShiftState(
      { ...legacy, auth_session_id: 'untracked-family' },
      { ...owner, authSessionId: 'untracked-family' },
    );
    expect(
      bindShiftOwnerHeaders({
        method: 'POST',
        path: '/api/v1/mini-app/inbound/resolve-code',
      }),
    ).toBeUndefined();
    expect(
      getAppStorage().getObject('work-shift.start.pending'),
    ).toBeUndefined();
  });
  test('current:null/reset after known tracked family never allows unfenced owner writes', () => {
    publishShiftState(shift, owner);
    publishShiftState(null, owner);
    expect(getShiftState().shift).toBeUndefined();
    expect(() =>
      bindShiftOwnerHeaders({
        method: 'POST',
        path: '/api/v1/mini-app/inbound/record',
        headers: { 'Idempotency-Key': key },
      }),
    ).toThrow();
    resetShiftState();
    expect(() =>
      bindShiftOwnerHeaders({
        method: 'POST',
        path: '/api/v1/mini-app/inbound/record',
        headers: { 'Idempotency-Key': key },
      }),
    ).toThrow();
  });
  test('persisted trace/shift binding survives process-local map reset', () => {
    publishShiftState(shift, owner);
    const request = {
      method: 'PUT' as const,
      path: '/api/v1/mini-app/drafts/' + uuid,
      headers: { 'Idempotency-Key': key },
      body: { warehouse_id: uuid },
    };
    bindShiftOwnerHeaders(request);
    resetShiftHeaderBindingsForTesting();
    publishShiftState(
      { ...shift, shift_id: '33333333-3333-4333-8333-333333333333' },
      owner,
    );
    expect(() => bindShiftOwnerHeaders(request)).toThrow();
  });
});
